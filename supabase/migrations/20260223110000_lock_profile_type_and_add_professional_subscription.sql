BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'profile_type'
  ) THEN
    RAISE EXCEPTION
      'Dependencia ausente: public.profiles.profile_type. Execute antes a migration 20260221103000_add_professional_roles_and_client_plans.sql';
  END IF;
END;
$$;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS professional_subscription_active BOOLEAN;

UPDATE public.profiles
SET professional_subscription_active = COALESCE(professional_subscription_active, FALSE)
WHERE professional_subscription_active IS NULL;

ALTER TABLE public.profiles
ALTER COLUMN professional_subscription_active SET DEFAULT FALSE;

ALTER TABLE public.profiles
ALTER COLUMN professional_subscription_active SET NOT NULL;

CREATE OR REPLACE FUNCTION public.has_active_professional_subscription(target_profile_id UUID DEFAULT auth.uid())
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
      AND p.professional_subscription_active = TRUE
  );
$$;

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
      AND p.professional_subscription_active = TRUE
  );
$$;

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
      AND p.professional_subscription_active = TRUE
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
      AND p.professional_subscription_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.guard_profile_account_type_and_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.profile_type IS DISTINCT FROM OLD.profile_type
     AND coalesce(auth.role(), '') = 'authenticated' THEN
    RAISE EXCEPTION 'Tipo de conta nao pode ser alterado apos o cadastro. Crie uma nova conta para outro perfil.';
  END IF;

  IF NEW.professional_subscription_active IS DISTINCT FROM OLD.professional_subscription_active
     AND coalesce(auth.role(), '') = 'authenticated' THEN
    RAISE EXCEPTION 'Liberacao de mensalidade profissional e controlada pelo pagamento e nao pode ser alterada manualmente.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_account_type_and_subscription ON public.profiles;
CREATE TRIGGER guard_profile_account_type_and_subscription
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.guard_profile_account_type_and_subscription();

GRANT EXECUTE ON FUNCTION public.has_active_professional_subscription(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guard_profile_account_type_and_subscription() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_professional(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_personal_trainer(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_nutritionist(UUID) TO authenticated;

COMMIT;
