BEGIN;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS profile_type TEXT;

UPDATE public.profiles p
SET profile_type = CASE
  WHEN lower(coalesce(u.raw_user_meta_data ->> 'profile_type', '')) IN ('client', 'personal_trainer', 'nutritionist')
    THEN lower(u.raw_user_meta_data ->> 'profile_type')
  ELSE 'client'
END
FROM auth.users u
WHERE u.id = p.id
  AND (
    p.profile_type IS NULL
    OR p.profile_type NOT IN ('client', 'personal_trainer', 'nutritionist')
  );

UPDATE public.profiles
SET profile_type = 'client'
WHERE profile_type IS NULL
   OR profile_type NOT IN ('client', 'personal_trainer', 'nutritionist');

ALTER TABLE public.profiles
ALTER COLUMN profile_type SET DEFAULT 'client';

ALTER TABLE public.profiles
ALTER COLUMN profile_type SET NOT NULL;

ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_profile_type_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_profile_type_check
CHECK (profile_type IN ('client', 'personal_trainer', 'nutritionist'));

CREATE INDEX IF NOT EXISTS profiles_profile_type_idx
ON public.profiles (profile_type);

CREATE TABLE IF NOT EXISTS public.professional_client_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT professional_client_links_unique_pair UNIQUE (professional_id, client_id),
  CONSTRAINT professional_client_links_valid_status CHECK (status IN ('active', 'inactive')),
  CONSTRAINT professional_client_links_no_self_link CHECK (professional_id <> client_id)
);

CREATE INDEX IF NOT EXISTS professional_client_links_professional_idx
ON public.professional_client_links (professional_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS professional_client_links_client_idx
ON public.professional_client_links (client_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.client_workout_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  plan_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_workout_plans_client_active_idx
ON public.client_workout_plans (client_id, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS client_workout_plans_professional_idx
ON public.client_workout_plans (professional_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.client_diet_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  plan_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_diet_plans_client_active_idx
ON public.client_diet_plans (client_id, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS client_diet_plans_professional_idx
ON public.client_diet_plans (professional_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.is_professional(target_profile_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = target_profile_id
      AND p.profile_type IN ('personal_trainer', 'nutritionist')
  );
$$;

CREATE OR REPLACE FUNCTION public.has_professional_client_link(
  professional_uuid UUID,
  client_uuid UUID
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.professional_client_links pcl
    WHERE pcl.professional_id = professional_uuid
      AND pcl.client_id = client_uuid
      AND pcl.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.search_client_profiles(
  query_text TEXT,
  limit_count INTEGER DEFAULT 12
)
RETURNS TABLE (
  profile_id UUID,
  name TEXT,
  handle TEXT,
  goal TEXT,
  already_linked BOOLEAN
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
  IF NOT is_professional(auth.uid()) THEN
    RETURN;
  END IF;

  normalized_query := normalize_profile_handle(coalesce(query_text, ''));
  search_query := trim(coalesce(query_text, ''));
  applied_limit := greatest(1, least(coalesce(limit_count, 12), 30));

  RETURN QUERY
  SELECT
    p.id AS profile_id,
    p.name,
    p.handle,
    p.goal,
    has_professional_client_link(auth.uid(), p.id) AS already_linked
  FROM public.profiles p
  WHERE p.profile_type = 'client'
    AND p.id <> auth.uid()
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

CREATE OR REPLACE FUNCTION public.link_client_by_handle(
  client_handle_input TEXT
)
RETURNS TABLE (
  link_id UUID,
  client_id UUID,
  client_name TEXT,
  client_handle TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_handle TEXT;
  target_client_id UUID;
  linked_row_id UUID;
BEGIN
  IF NOT is_professional(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas personal trainer ou nutricionista podem vincular clientes.';
  END IF;

  normalized_handle := normalize_profile_handle(coalesce(client_handle_input, ''));
  IF normalized_handle = '' THEN
    RAISE EXCEPTION 'Informe um @usuario valido para vincular o cliente.';
  END IF;

  SELECT p.id
  INTO target_client_id
  FROM public.profiles p
  WHERE normalize_profile_handle(p.handle) = normalized_handle
    AND p.profile_type = 'client'
  LIMIT 1;

  IF target_client_id IS NULL THEN
    RAISE EXCEPTION 'Cliente nao encontrado para o @usuario informado.';
  END IF;

  INSERT INTO public.professional_client_links (professional_id, client_id, status)
  VALUES (auth.uid(), target_client_id, 'active')
  ON CONFLICT (professional_id, client_id)
  DO UPDATE SET
    status = 'active',
    updated_at = NOW()
  RETURNING id INTO linked_row_id;

  RETURN QUERY
  SELECT
    linked_row_id,
    p.id,
    p.name,
    p.handle
  FROM public.profiles p
  WHERE p.id = target_client_id;
END;
$$;

ALTER TABLE public.professional_client_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_workout_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_diet_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view professional-client links they belong to" ON public.professional_client_links;
CREATE POLICY "Users can view professional-client links they belong to"
ON public.professional_client_links
FOR SELECT
TO authenticated
USING (
  professional_id = auth.uid()
  OR client_id = auth.uid()
);

DROP POLICY IF EXISTS "Professionals can create active links with clients" ON public.professional_client_links;
CREATE POLICY "Professionals can create active links with clients"
ON public.professional_client_links
FOR INSERT
TO authenticated
WITH CHECK (
  professional_id = auth.uid()
  AND is_professional(auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.profiles client_profile
    WHERE client_profile.id = client_id
      AND client_profile.profile_type = 'client'
  )
);

DROP POLICY IF EXISTS "Professionals can update their own client links" ON public.professional_client_links;
CREATE POLICY "Professionals can update their own client links"
ON public.professional_client_links
FOR UPDATE
TO authenticated
USING (
  professional_id = auth.uid()
  AND is_professional(auth.uid())
)
WITH CHECK (
  professional_id = auth.uid()
  AND is_professional(auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.profiles client_profile
    WHERE client_profile.id = client_id
      AND client_profile.profile_type = 'client'
  )
);

DROP POLICY IF EXISTS "Professionals can delete their own client links" ON public.professional_client_links;
CREATE POLICY "Professionals can delete their own client links"
ON public.professional_client_links
FOR DELETE
TO authenticated
USING (
  professional_id = auth.uid()
  AND is_professional(auth.uid())
);

DROP POLICY IF EXISTS "Professionals and clients can read workout plans" ON public.client_workout_plans;
CREATE POLICY "Professionals and clients can read workout plans"
ON public.client_workout_plans
FOR SELECT
TO authenticated
USING (
  client_id = auth.uid()
  OR professional_id = auth.uid()
);

DROP POLICY IF EXISTS "Professionals can create workout plans for linked clients" ON public.client_workout_plans;
CREATE POLICY "Professionals can create workout plans for linked clients"
ON public.client_workout_plans
FOR INSERT
TO authenticated
WITH CHECK (
  professional_id = auth.uid()
  AND is_professional(auth.uid())
  AND has_professional_client_link(auth.uid(), client_id)
);

DROP POLICY IF EXISTS "Professionals can update workout plans for linked clients" ON public.client_workout_plans;
CREATE POLICY "Professionals can update workout plans for linked clients"
ON public.client_workout_plans
FOR UPDATE
TO authenticated
USING (
  professional_id = auth.uid()
  AND is_professional(auth.uid())
)
WITH CHECK (
  professional_id = auth.uid()
  AND is_professional(auth.uid())
  AND has_professional_client_link(auth.uid(), client_id)
);

DROP POLICY IF EXISTS "Professionals can delete workout plans for linked clients" ON public.client_workout_plans;
CREATE POLICY "Professionals can delete workout plans for linked clients"
ON public.client_workout_plans
FOR DELETE
TO authenticated
USING (
  professional_id = auth.uid()
  AND is_professional(auth.uid())
);

DROP POLICY IF EXISTS "Professionals and clients can read diet plans" ON public.client_diet_plans;
CREATE POLICY "Professionals and clients can read diet plans"
ON public.client_diet_plans
FOR SELECT
TO authenticated
USING (
  client_id = auth.uid()
  OR professional_id = auth.uid()
);

DROP POLICY IF EXISTS "Professionals can create diet plans for linked clients" ON public.client_diet_plans;
CREATE POLICY "Professionals can create diet plans for linked clients"
ON public.client_diet_plans
FOR INSERT
TO authenticated
WITH CHECK (
  professional_id = auth.uid()
  AND is_professional(auth.uid())
  AND has_professional_client_link(auth.uid(), client_id)
);

DROP POLICY IF EXISTS "Professionals can update diet plans for linked clients" ON public.client_diet_plans;
CREATE POLICY "Professionals can update diet plans for linked clients"
ON public.client_diet_plans
FOR UPDATE
TO authenticated
USING (
  professional_id = auth.uid()
  AND is_professional(auth.uid())
)
WITH CHECK (
  professional_id = auth.uid()
  AND is_professional(auth.uid())
  AND has_professional_client_link(auth.uid(), client_id)
);

DROP POLICY IF EXISTS "Professionals can delete diet plans for linked clients" ON public.client_diet_plans;
CREATE POLICY "Professionals can delete diet plans for linked clients"
ON public.client_diet_plans
FOR DELETE
TO authenticated
USING (
  professional_id = auth.uid()
  AND is_professional(auth.uid())
);

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  is_own_profile(id)
  OR EXISTS (
    SELECT 1
    FROM public.professional_client_links pcl
    WHERE pcl.status = 'active'
      AND (
        (pcl.professional_id = auth.uid() AND pcl.client_id = profiles.id)
        OR (pcl.client_id = auth.uid() AND pcl.professional_id = profiles.id)
      )
  )
);

DROP TRIGGER IF EXISTS update_professional_client_links_updated_at ON public.professional_client_links;
CREATE TRIGGER update_professional_client_links_updated_at
BEFORE UPDATE ON public.professional_client_links
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_client_workout_plans_updated_at ON public.client_workout_plans;
CREATE TRIGGER update_client_workout_plans_updated_at
BEFORE UPDATE ON public.client_workout_plans
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_client_diet_plans_updated_at ON public.client_diet_plans;
CREATE TRIGGER update_client_diet_plans_updated_at
BEFORE UPDATE ON public.client_diet_plans
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.professional_client_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_workout_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_diet_plans TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_professional(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_professional_client_link(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_client_profiles(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_client_by_handle(TEXT) TO authenticated;

COMMIT;
