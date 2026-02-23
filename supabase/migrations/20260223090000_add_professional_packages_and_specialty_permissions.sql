BEGIN;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS has_personal_package BOOLEAN;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS has_nutritionist_package BOOLEAN;

UPDATE public.profiles
SET has_personal_package = COALESCE(has_personal_package, FALSE),
    has_nutritionist_package = COALESCE(has_nutritionist_package, FALSE)
WHERE has_personal_package IS NULL
   OR has_nutritionist_package IS NULL;

ALTER TABLE public.profiles
ALTER COLUMN has_personal_package SET DEFAULT FALSE;

ALTER TABLE public.profiles
ALTER COLUMN has_nutritionist_package SET DEFAULT FALSE;

ALTER TABLE public.profiles
ALTER COLUMN has_personal_package SET NOT NULL;

ALTER TABLE public.profiles
ALTER COLUMN has_nutritionist_package SET NOT NULL;

CREATE OR REPLACE FUNCTION public.is_personal_trainer(target_profile_id UUID DEFAULT auth.uid())
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
      AND p.profile_type = 'personal_trainer'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_nutritionist(target_profile_id UUID DEFAULT auth.uid())
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
      AND p.profile_type = 'nutritionist'
  );
$$;

CREATE OR REPLACE FUNCTION public.client_has_personal_package(client_uuid UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = client_uuid
      AND p.profile_type = 'client'
      AND p.has_personal_package = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.client_has_nutritionist_package(client_uuid UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = client_uuid
      AND p.profile_type = 'client'
      AND p.has_nutritionist_package = TRUE
  );
$$;

DROP POLICY IF EXISTS "Professionals and clients can read workout plans" ON public.client_workout_plans;
CREATE POLICY "Professionals and clients can read workout plans"
ON public.client_workout_plans
FOR SELECT
TO authenticated
USING (
  professional_id = auth.uid()
  OR (
    client_id = auth.uid()
    AND client_has_personal_package(client_id)
  )
);

DROP POLICY IF EXISTS "Professionals can create workout plans for linked clients" ON public.client_workout_plans;
CREATE POLICY "Professionals can create workout plans for linked clients"
ON public.client_workout_plans
FOR INSERT
TO authenticated
WITH CHECK (
  professional_id = auth.uid()
  AND is_personal_trainer(auth.uid())
  AND has_professional_client_link(auth.uid(), client_id)
  AND client_has_personal_package(client_id)
);

DROP POLICY IF EXISTS "Professionals can update workout plans for linked clients" ON public.client_workout_plans;
CREATE POLICY "Professionals can update workout plans for linked clients"
ON public.client_workout_plans
FOR UPDATE
TO authenticated
USING (
  professional_id = auth.uid()
  AND is_personal_trainer(auth.uid())
)
WITH CHECK (
  professional_id = auth.uid()
  AND is_personal_trainer(auth.uid())
  AND has_professional_client_link(auth.uid(), client_id)
  AND (NOT is_active OR client_has_personal_package(client_id))
);

DROP POLICY IF EXISTS "Professionals can delete workout plans for linked clients" ON public.client_workout_plans;
CREATE POLICY "Professionals can delete workout plans for linked clients"
ON public.client_workout_plans
FOR DELETE
TO authenticated
USING (
  professional_id = auth.uid()
  AND is_personal_trainer(auth.uid())
);

DROP POLICY IF EXISTS "Professionals and clients can read diet plans" ON public.client_diet_plans;
CREATE POLICY "Professionals and clients can read diet plans"
ON public.client_diet_plans
FOR SELECT
TO authenticated
USING (
  professional_id = auth.uid()
  OR (
    client_id = auth.uid()
    AND client_has_nutritionist_package(client_id)
  )
);

DROP POLICY IF EXISTS "Professionals can create diet plans for linked clients" ON public.client_diet_plans;
CREATE POLICY "Professionals can create diet plans for linked clients"
ON public.client_diet_plans
FOR INSERT
TO authenticated
WITH CHECK (
  professional_id = auth.uid()
  AND is_nutritionist(auth.uid())
  AND has_professional_client_link(auth.uid(), client_id)
  AND client_has_nutritionist_package(client_id)
);

DROP POLICY IF EXISTS "Professionals can update diet plans for linked clients" ON public.client_diet_plans;
CREATE POLICY "Professionals can update diet plans for linked clients"
ON public.client_diet_plans
FOR UPDATE
TO authenticated
USING (
  professional_id = auth.uid()
  AND is_nutritionist(auth.uid())
)
WITH CHECK (
  professional_id = auth.uid()
  AND is_nutritionist(auth.uid())
  AND has_professional_client_link(auth.uid(), client_id)
  AND (NOT is_active OR client_has_nutritionist_package(client_id))
);

DROP POLICY IF EXISTS "Professionals can delete diet plans for linked clients" ON public.client_diet_plans;
CREATE POLICY "Professionals can delete diet plans for linked clients"
ON public.client_diet_plans
FOR DELETE
TO authenticated
USING (
  professional_id = auth.uid()
  AND is_nutritionist(auth.uid())
);

GRANT EXECUTE ON FUNCTION public.is_personal_trainer(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_nutritionist(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_has_personal_package(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_has_nutritionist_package(UUID) TO authenticated;

COMMIT;
