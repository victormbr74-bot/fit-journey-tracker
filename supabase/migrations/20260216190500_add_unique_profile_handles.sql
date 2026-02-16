ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS handle TEXT;

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
      coalesce(nullif(rec.handle, ''), nullif(rec.name, ''), split_part(rec.email, '@', 1), 'fit.user'),
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

GRANT EXECUTE ON FUNCTION public.reserve_unique_profile_handle(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_profile_handle_available(TEXT, UUID) TO authenticated;
