BEGIN;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS handle TEXT;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS phone TEXT;

CREATE OR REPLACE FUNCTION public.normalize_profile_handle(input_text TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
  SELECT regexp_replace(
    regexp_replace(
      regexp_replace(lower(coalesce(input_text, '')), '^@+', ''),
      '[^a-z0-9._]+',
      '.',
      'g'
    ),
    '(^\.+|\.+$)',
    '',
    'g'
  )
$$;

CREATE OR REPLACE FUNCTION public.reserve_unique_profile_handle(
  seed_input TEXT,
  exclude_profile_id UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  min_body_len INTEGER := 3;
  max_body_len INTEGER := 30;
  base_body TEXT;
  candidate TEXT;
  suffix INTEGER := 1;
  suffix_text TEXT;
BEGIN
  base_body := normalize_profile_handle(seed_input);
  IF base_body = '' THEN
    base_body := 'fit.user';
  END IF;

  IF char_length(base_body) < min_body_len THEN
    base_body := substring((base_body || 'fit') from 1 for min_body_len);
  END IF;

  base_body := substring(base_body from 1 for max_body_len);
  candidate := '@' || base_body;

  WHILE EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE lower(p.handle) = lower(candidate)
      AND (exclude_profile_id IS NULL OR p.id <> exclude_profile_id)
  ) LOOP
    suffix_text := suffix::TEXT;
    candidate := '@' || substring(
      base_body
      from 1
      for greatest(min_body_len, max_body_len - char_length(suffix_text))
    ) || suffix_text;
    suffix := suffix + 1;
  END LOOP;

  RETURN candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_profile_handle_available(
  handle_input TEXT,
  exclude_profile_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE lower(p.handle) = lower(
      CASE
        WHEN normalize_profile_handle(handle_input) = '' THEN '@fit.user'
        ELSE '@' || normalize_profile_handle(handle_input)
      END
    )
      AND (exclude_profile_id IS NULL OR p.id <> exclude_profile_id)
  );
$$;

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT
      p.id,
      p.name,
      p.email,
      p.handle
    FROM public.profiles p
  LOOP
    UPDATE public.profiles p
    SET handle = reserve_unique_profile_handle(
      coalesce(
        nullif(rec.handle, ''),
        nullif(rec.name, ''),
        split_part(coalesce(rec.email, ''), '@', 1),
        'fit.user'
      ),
      rec.id
    )
    WHERE p.id = rec.id;
  END LOOP;
END;
$$;

ALTER TABLE public.profiles
ALTER COLUMN handle SET NOT NULL;

ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_handle_format;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_handle_format
CHECK (handle ~ '^@[a-z0-9._]{3,30}$');

CREATE UNIQUE INDEX IF NOT EXISTS profiles_handle_unique_lower_idx
ON public.profiles (lower(handle));

UPDATE public.profiles
SET phone = NULL
WHERE phone IS NOT NULL
  AND phone !~ '^[0-9()+\\- ]{8,20}$';

ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_phone_format;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_phone_format
CHECK (
  phone IS NULL
  OR phone ~ '^[0-9()+\\- ]{8,20}$'
);

DELETE FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1
  FROM auth.users u
  WHERE u.id = p.id
);

DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND t.relname = 'profiles'
      AND a.attname = 'id'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', fk.conname);
  END LOOP;
END;
$$;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_id_fkey
FOREIGN KEY (id)
REFERENCES auth.users(id)
ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.social_global_state (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE,
  feed_posts JSONB NOT NULL DEFAULT '[]'::jsonb,
  stories JSONB NOT NULL DEFAULT '[]'::jsonb,
  friend_requests JSONB NOT NULL DEFAULT '[]'::jsonb,
  chat_events JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT social_global_state_singleton CHECK (id = TRUE)
);

ALTER TABLE public.social_global_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read social global state" ON public.social_global_state;
CREATE POLICY "Authenticated can read social global state"
ON public.social_global_state
FOR SELECT
TO authenticated
USING (TRUE);

DROP POLICY IF EXISTS "Authenticated can insert social global state" ON public.social_global_state;
CREATE POLICY "Authenticated can insert social global state"
ON public.social_global_state
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated can update social global state" ON public.social_global_state;
CREATE POLICY "Authenticated can update social global state"
ON public.social_global_state
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

DROP TRIGGER IF EXISTS update_social_global_state_updated_at ON public.social_global_state;
CREATE TRIGGER update_social_global_state_updated_at
  BEFORE UPDATE ON public.social_global_state
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.social_global_state (id)
VALUES (TRUE)
ON CONFLICT (id) DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON public.social_global_state TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.social_global_state;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.search_profiles_by_handle(
  query_text TEXT,
  limit_count INTEGER DEFAULT 12,
  exclude_profile_id UUID DEFAULT NULL
)
RETURNS TABLE (
  profile_id UUID,
  name TEXT,
  handle TEXT,
  goal TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_query TEXT;
  search_query TEXT;
  applied_limit INTEGER;
BEGIN
  normalized_query := normalize_profile_handle(coalesce(query_text, ''));
  search_query := trim(coalesce(query_text, ''));
  applied_limit := greatest(1, least(coalesce(limit_count, 12), 30));

  RETURN QUERY
  SELECT
    p.id AS profile_id,
    p.name,
    p.handle,
    p.goal
  FROM public.profiles p
  WHERE (exclude_profile_id IS NULL OR p.id <> exclude_profile_id)
    AND (
      normalized_query = ''
      OR normalize_profile_handle(p.handle) LIKE normalized_query || '%'
      OR lower(p.name) LIKE '%' || lower(search_query) || '%'
    )
  ORDER BY
    CASE
      WHEN normalized_query <> '' AND normalize_profile_handle(p.handle) = normalized_query THEN 0
      WHEN normalized_query <> '' AND normalize_profile_handle(p.handle) LIKE normalized_query || '%' THEN 1
      WHEN search_query <> '' AND lower(p.name) LIKE lower(search_query) || '%' THEN 2
      ELSE 3
    END,
    p.updated_at DESC NULLS LAST,
    p.created_at DESC NULLS LAST
  LIMIT applied_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reserve_unique_profile_handle(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_profile_handle_available(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_profiles_by_handle(TEXT, INTEGER, UUID) TO authenticated;

COMMIT;
