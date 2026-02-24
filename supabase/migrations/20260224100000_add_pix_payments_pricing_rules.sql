BEGIN;

DO $$
BEGIN
  IF to_regclass('public.professional_client_links') IS NULL THEN
    RAISE EXCEPTION
      'Dependencia ausente: public.professional_client_links. Execute antes a migration 20260221103000_add_professional_roles_and_client_plans.sql';
  END IF;
END;
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

GRANT EXECUTE ON FUNCTION public.has_professional_client_link(UUID, UUID) TO authenticated;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN;

UPDATE public.profiles
SET is_admin = COALESCE(is_admin, FALSE)
WHERE is_admin IS NULL;

ALTER TABLE public.profiles
ALTER COLUMN is_admin SET DEFAULT FALSE;

ALTER TABLE public.profiles
ALTER COLUMN is_admin SET NOT NULL;

CREATE OR REPLACE FUNCTION public.is_admin(target_profile_id UUID DEFAULT auth.uid())
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
      AND p.is_admin = TRUE
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_profile_account_type_and_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.profile_type IS DISTINCT FROM OLD.profile_type
     AND COALESCE(auth.role(), '') = 'authenticated' THEN
    RAISE EXCEPTION 'Tipo de conta nao pode ser alterado apos o cadastro. Crie uma nova conta para outro perfil.';
  END IF;

  IF NEW.professional_subscription_active IS DISTINCT FROM OLD.professional_subscription_active
     AND COALESCE(auth.role(), '') = 'authenticated' THEN
    RAISE EXCEPTION 'Liberacao de mensalidade profissional e controlada pelo pagamento e nao pode ser alterada manualmente.';
  END IF;

  IF NEW.has_personal_package IS DISTINCT FROM OLD.has_personal_package
     AND COALESCE(auth.role(), '') = 'authenticated' THEN
    RAISE EXCEPTION 'Pacote personal e controlado pelo fluxo de pagamento.';
  END IF;

  IF NEW.has_nutritionist_package IS DISTINCT FROM OLD.has_nutritionist_package
     AND COALESCE(auth.role(), '') = 'authenticated' THEN
    RAISE EXCEPTION 'Pacote nutricionista e controlado pelo fluxo de pagamento.';
  END IF;

  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin
     AND COALESCE(auth.role(), '') = 'authenticated' THEN
    RAISE EXCEPTION 'Permissao administrativa nao pode ser alterada pelo proprio usuario.';
  END IF;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.guard_profile_account_type_and_subscription() TO authenticated;

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.payment_provider_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE),
  active_provider TEXT NOT NULL DEFAULT 'manual'
    CHECK (active_provider IN ('mercadopago', 'pagarme', 'efi', 'pagbank', 'manual')),
  manual_pix_key TEXT,
  manual_pix_copy_paste TEXT,
  manual_pix_display_name TEXT,
  manual_pix_instructions TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.payment_provider_settings (id, active_provider)
VALUES (TRUE, 'manual')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.payment_provider_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view payment provider settings" ON public.payment_provider_settings;
CREATE POLICY "Admins can view payment provider settings"
ON public.payment_provider_settings
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update payment provider settings" ON public.payment_provider_settings;
CREATE POLICY "Admins can update payment provider settings"
ON public.payment_provider_settings
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert payment provider settings" ON public.payment_provider_settings;
CREATE POLICY "Admins can insert payment provider settings"
ON public.payment_provider_settings
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK (scope IN ('global', 'professional', 'client_override')),
  owner_id UUID NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id UUID NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_key TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  currency TEXT NOT NULL DEFAULT 'BRL',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pricing_rules_scope_owner_client_check CHECK (
    (scope = 'global' AND owner_id IS NULL AND client_id IS NULL)
    OR (scope = 'professional' AND owner_id IS NOT NULL AND client_id IS NULL)
    OR (scope = 'client_override' AND owner_id IS NOT NULL AND client_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS pricing_rules_scope_owner_client_product_key_uidx
ON public.pricing_rules (
  scope,
  COALESCE(owner_id, '00000000-0000-0000-0000-000000000000'::UUID),
  COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::UUID),
  product_key
);

CREATE INDEX IF NOT EXISTS pricing_rules_product_scope_active_idx
ON public.pricing_rules (product_key, scope, active);

CREATE INDEX IF NOT EXISTS pricing_rules_owner_scope_idx
ON public.pricing_rules (owner_id, scope, active)
WHERE owner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pricing_rules_client_scope_idx
ON public.pricing_rules (client_id, scope, active)
WHERE client_id IS NOT NULL;

ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clients and professionals and admins can read pricing rules" ON public.pricing_rules;
CREATE POLICY "Clients and professionals and admins can read pricing rules"
ON public.pricing_rules
FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR (scope = 'global')
  OR (scope = 'professional' AND owner_id = auth.uid())
  OR (scope = 'client_override' AND client_id = auth.uid())
  OR (
    scope = 'client_override'
    AND owner_id = auth.uid()
    AND public.has_professional_client_link(auth.uid(), client_id)
  )
);

DROP POLICY IF EXISTS "Professionals and admins can insert pricing rules" ON public.pricing_rules;
CREATE POLICY "Professionals and admins can insert pricing rules"
ON public.pricing_rules
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
  OR (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.profile_type IN ('personal_trainer', 'nutritionist')
    )
    AND
    (
      scope = 'professional'
      AND owner_id = auth.uid()
      AND client_id IS NULL
    )
  )
  OR (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.profile_type IN ('personal_trainer', 'nutritionist')
    )
    AND
    (
      scope = 'client_override'
      AND owner_id = auth.uid()
      AND client_id IS NOT NULL
      AND public.has_professional_client_link(auth.uid(), client_id)
    )
  )
);

DROP POLICY IF EXISTS "Professionals and admins can update pricing rules" ON public.pricing_rules;
CREATE POLICY "Professionals and admins can update pricing rules"
ON public.pricing_rules
FOR UPDATE
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.profile_type IN ('personal_trainer', 'nutritionist')
    )
    AND (
      (scope = 'professional' AND owner_id = auth.uid())
      OR (
        scope = 'client_override'
        AND owner_id = auth.uid()
        AND public.has_professional_client_link(auth.uid(), client_id)
      )
    )
  )
)
WITH CHECK (
  public.is_admin(auth.uid())
  OR (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.profile_type IN ('personal_trainer', 'nutritionist')
    )
    AND (
      (
        scope = 'professional'
        AND owner_id = auth.uid()
        AND client_id IS NULL
      )
      OR (
        scope = 'client_override'
        AND owner_id = auth.uid()
        AND client_id IS NOT NULL
        AND public.has_professional_client_link(auth.uid(), client_id)
      )
    )
  )
);

DROP POLICY IF EXISTS "Professionals and admins can delete pricing rules" ON public.pricing_rules;
CREATE POLICY "Professionals and admins can delete pricing rules"
ON public.pricing_rules
FOR DELETE
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR (
    scope = 'professional'
    AND owner_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.profile_type IN ('personal_trainer', 'nutritionist')
    )
  )
  OR (
    scope = 'client_override'
    AND owner_id = auth.uid()
    AND public.has_professional_client_link(auth.uid(), client_id)
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.profile_type IN ('personal_trainer', 'nutritionist')
    )
  )
);

CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  professional_id UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  product_key TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'BRL',
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'expired', 'canceled', 'manual_review')),
  provider TEXT NOT NULL CHECK (provider IN ('mercadopago', 'pagarme', 'efi', 'pagbank', 'manual')),
  provider_reference TEXT NULL,
  pix_copy_paste TEXT NULL,
  pix_qr_image_url TEXT NULL,
  expires_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS orders_provider_reference_uidx
ON public.orders (provider, provider_reference)
WHERE provider_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_client_created_idx
ON public.orders (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS orders_professional_created_idx
ON public.orders (professional_id, created_at DESC)
WHERE professional_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_status_created_idx
ON public.orders (status, created_at DESC);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clients can read own orders" ON public.orders;
CREATE POLICY "Clients can read own orders"
ON public.orders
FOR SELECT
TO authenticated
USING (client_id = auth.uid());

DROP POLICY IF EXISTS "Professionals can read linked orders by professional_id" ON public.orders;
CREATE POLICY "Professionals can read linked orders by professional_id"
ON public.orders
FOR SELECT
TO authenticated
USING (professional_id = auth.uid());

DROP POLICY IF EXISTS "Admins can read all orders" ON public.orders;
CREATE POLICY "Admins can read all orders"
ON public.orders
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Clients can create own orders" ON public.orders;
CREATE POLICY "Clients can create own orders"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (
  client_id = auth.uid()
  AND status IN ('pending', 'manual_review')
  AND paid_at IS NULL
);

DROP POLICY IF EXISTS "Admins can update orders" ON public.orders;
CREATE POLICY "Admins can update orders"
ON public.orders
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.manual_pix_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'rejected')),
  reviewed_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS manual_pix_proofs_order_idx
ON public.manual_pix_proofs (order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS manual_pix_proofs_status_idx
ON public.manual_pix_proofs (status, created_at DESC);

ALTER TABLE public.manual_pix_proofs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clients can read proofs from own orders" ON public.manual_pix_proofs;
CREATE POLICY "Clients can read proofs from own orders"
ON public.manual_pix_proofs
FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = manual_pix_proofs.order_id
      AND o.client_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Clients can submit proofs to own orders" ON public.manual_pix_proofs;
CREATE POLICY "Clients can submit proofs to own orders"
ON public.manual_pix_proofs
FOR INSERT
TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND status = 'submitted'
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = manual_pix_proofs.order_id
      AND o.client_id = auth.uid()
      AND o.provider = 'manual'
      AND o.status = 'manual_review'
  )
);

DROP POLICY IF EXISTS "Admins can update manual pix proofs" ON public.manual_pix_proofs;
CREATE POLICY "Admins can update manual pix proofs"
ON public.manual_pix_proofs
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.client_feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  source_order_id UUID NULL REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, feature_key)
);

CREATE INDEX IF NOT EXISTS client_feature_flags_client_enabled_idx
ON public.client_feature_flags (client_id, enabled, feature_key);

ALTER TABLE public.client_feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clients can read own feature flags" ON public.client_feature_flags;
CREATE POLICY "Clients can read own feature flags"
ON public.client_feature_flags
FOR SELECT
TO authenticated
USING (client_id = auth.uid());

DROP POLICY IF EXISTS "Professionals can read feature flags for linked clients" ON public.client_feature_flags;
CREATE POLICY "Professionals can read feature flags for linked clients"
ON public.client_feature_flags
FOR SELECT
TO authenticated
USING (public.has_professional_client_link(auth.uid(), client_id));

DROP POLICY IF EXISTS "Admins can manage feature flags" ON public.client_feature_flags;
CREATE POLICY "Admins can manage feature flags"
ON public.client_feature_flags
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO storage.buckets (id, name, public)
VALUES ('manual-pix-proofs', 'manual-pix-proofs', FALSE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can upload own manual pix proofs" ON storage.objects;
CREATE POLICY "Users can upload own manual pix proofs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'manual-pix-proofs'
  AND (storage.foldername(name))[1] = auth.uid()::TEXT
);

DROP POLICY IF EXISTS "Users can view own manual pix proofs" ON storage.objects;
CREATE POLICY "Users can view own manual pix proofs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'manual-pix-proofs'
  AND (
    (storage.foldername(name))[1] = auth.uid()::TEXT
    OR public.is_admin(auth.uid())
  )
);

DROP POLICY IF EXISTS "Admins can manage manual pix proof objects" ON storage.objects;
CREATE POLICY "Admins can manage manual pix proof objects"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'manual-pix-proofs'
  AND public.is_admin(auth.uid())
)
WITH CHECK (
  bucket_id = 'manual-pix-proofs'
  AND public.is_admin(auth.uid())
);

CREATE OR REPLACE FUNCTION public.resolve_order_price(
  p_client_id UUID,
  p_product_key TEXT,
  p_professional_id UUID DEFAULT NULL
)
RETURNS TABLE (
  pricing_rule_id UUID,
  price_cents INTEGER,
  currency TEXT,
  source_scope TEXT,
  source_owner_id UUID,
  source_client_id UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'client_id is required';
  END IF;

  IF COALESCE(BTRIM(p_product_key), '') = '' THEN
    RAISE EXCEPTION 'product_key is required';
  END IF;

  IF p_professional_id IS NOT NULL AND NOT public.has_professional_client_link(p_professional_id, p_client_id) THEN
    RAISE EXCEPTION 'professional_id is not linked to client';
  END IF;

  RETURN QUERY
  SELECT
    pr.id,
    pr.price_cents,
    pr.currency,
    pr.scope,
    pr.owner_id,
    pr.client_id
  FROM public.pricing_rules pr
  WHERE pr.active = TRUE
    AND pr.product_key = p_product_key
    AND (
      (
        p_professional_id IS NOT NULL
        AND pr.scope = 'client_override'
        AND pr.client_id = p_client_id
        AND pr.owner_id = p_professional_id
      )
      OR (
        p_professional_id IS NOT NULL
        AND pr.scope = 'professional'
        AND pr.owner_id = p_professional_id
        AND pr.client_id IS NULL
      )
      OR (
        pr.scope = 'global'
        AND pr.owner_id IS NULL
        AND pr.client_id IS NULL
      )
    )
  ORDER BY
    CASE pr.scope
      WHEN 'client_override' THEN 1
      WHEN 'professional' THEN 2
      ELSE 3
    END,
    pr.updated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active pricing rule found for product %', p_product_key;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_order_price(UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_order_price(UUID, TEXT, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.resolve_order_price(UUID, TEXT, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_order_price(UUID, TEXT, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.get_effective_product_price(
  p_product_key TEXT,
  p_professional_id UUID DEFAULT NULL
)
RETURNS TABLE (
  product_key TEXT,
  price_cents INTEGER,
  currency TEXT,
  source_scope TEXT,
  source_owner_id UUID,
  source_client_id UUID,
  pricing_rule_id UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID := auth.uid();
BEGIN
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    p_product_key,
    resolved.price_cents,
    resolved.currency,
    resolved.source_scope,
    resolved.source_owner_id,
    resolved.source_client_id,
    resolved.pricing_rule_id
  FROM public.resolve_order_price(v_client_id, p_product_key, p_professional_id) AS resolved;
END;
$$;

REVOKE ALL ON FUNCTION public.get_effective_product_price(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_effective_product_price(TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_effective_product_price(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_effective_product_price(TEXT, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_client_feature_flag(
  p_client_id UUID,
  p_feature_key TEXT,
  p_enabled BOOLEAN DEFAULT TRUE,
  p_source_order_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.client_feature_flags (
    client_id,
    feature_key,
    enabled,
    source_order_id
  )
  VALUES (
    p_client_id,
    p_feature_key,
    COALESCE(p_enabled, TRUE),
    p_source_order_id
  )
  ON CONFLICT (client_id, feature_key)
  DO UPDATE SET
    enabled = EXCLUDED.enabled,
    source_order_id = EXCLUDED.source_order_id,
    updated_at = NOW();
$$;

REVOKE ALL ON FUNCTION public.upsert_client_feature_flag(UUID, TEXT, BOOLEAN, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_client_feature_flag(UUID, TEXT, BOOLEAN, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.upsert_client_feature_flag(UUID, TEXT, BOOLEAN, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_client_feature_flag(UUID, TEXT, BOOLEAN, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_order_paid_and_apply_effects(
  p_order_id UUID,
  p_paid_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_client public.profiles%ROWTYPE;
  v_feature_key TEXT;
BEGIN
  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  IF v_order.status = 'paid' THEN
    RETURN FALSE;
  END IF;

  UPDATE public.orders
  SET status = 'paid',
      paid_at = COALESCE(v_order.paid_at, p_paid_at, NOW())
  WHERE id = v_order.id;

  IF v_order.product_key = 'personal_package' THEN
    UPDATE public.profiles
    SET has_personal_package = TRUE
    WHERE id = v_order.client_id;
  ELSIF v_order.product_key = 'nutritionist_package' THEN
    UPDATE public.profiles
    SET has_nutritionist_package = TRUE
    WHERE id = v_order.client_id;
  ELSIF v_order.product_key = 'full_bundle' THEN
    UPDATE public.profiles
    SET has_personal_package = TRUE,
        has_nutritionist_package = TRUE
    WHERE id = v_order.client_id;
  END IF;

  SELECT *
  INTO v_client
  FROM public.profiles
  WHERE id = v_order.client_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client profile not found for order %', v_order.id;
  END IF;

  IF v_order.product_key = 'full_bundle' THEN
    PERFORM public.upsert_client_feature_flag(v_order.client_id, 'assistant_full', TRUE, v_order.id);

    IF COALESCE(v_client.has_personal_package, FALSE) THEN
      PERFORM public.upsert_client_feature_flag(v_order.client_id, 'workout_full', TRUE, v_order.id);
    END IF;

    IF COALESCE(v_client.has_nutritionist_package, FALSE) THEN
      PERFORM public.upsert_client_feature_flag(v_order.client_id, 'diet_full', TRUE, v_order.id);
    END IF;
  ELSIF RIGHT(v_order.product_key, 6) = '_addon' THEN
    v_feature_key := LEFT(v_order.product_key, LENGTH(v_order.product_key) - 6);

    IF v_feature_key = 'workout_full' AND NOT COALESCE(v_client.has_personal_package, FALSE) THEN
      RETURN TRUE;
    END IF;

    IF v_feature_key = 'diet_full' AND NOT COALESCE(v_client.has_nutritionist_package, FALSE) THEN
      RETURN TRUE;
    END IF;

    PERFORM public.upsert_client_feature_flag(v_order.client_id, v_feature_key, TRUE, v_order.id);
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_order_paid_and_apply_effects(UUID, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_order_paid_and_apply_effects(UUID, TIMESTAMPTZ) FROM anon;
REVOKE ALL ON FUNCTION public.mark_order_paid_and_apply_effects(UUID, TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_paid_and_apply_effects(UUID, TIMESTAMPTZ) TO service_role;

DROP TRIGGER IF EXISTS update_pricing_rules_updated_at ON public.pricing_rules;
CREATE TRIGGER update_pricing_rules_updated_at
BEFORE UPDATE ON public.pricing_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_payment_provider_settings_updated_at ON public.payment_provider_settings;
CREATE TRIGGER update_payment_provider_settings_updated_at
BEFORE UPDATE ON public.payment_provider_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_client_feature_flags_updated_at ON public.client_feature_flags;
CREATE TRIGGER update_client_feature_flags_updated_at
BEFORE UPDATE ON public.client_feature_flags
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pricing_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.manual_pix_proofs TO authenticated;
GRANT SELECT ON public.client_feature_flags TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payment_provider_settings TO authenticated;

COMMIT;
