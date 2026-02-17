BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_profile_phone(input_text TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
  SELECT regexp_replace(coalesce(input_text, ''), '[^0-9]+', '', 'g')
$$;

CREATE OR REPLACE FUNCTION public.search_profiles_by_phone(
  phones_input TEXT[],
  limit_count INTEGER DEFAULT 50,
  exclude_profile_id UUID DEFAULT NULL
)
RETURNS TABLE (
  profile_id UUID,
  name TEXT,
  handle TEXT,
  goal TEXT,
  phone TEXT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH normalized_inputs AS (
    SELECT DISTINCT normalize_profile_phone(raw_phone) AS normalized_phone
    FROM unnest(coalesce(phones_input, ARRAY[]::TEXT[])) AS raw_phone
    WHERE normalize_profile_phone(raw_phone) <> ''
  ),
  sanitized_profiles AS (
    SELECT
      p.id AS profile_id,
      p.name,
      p.handle,
      p.goal,
      p.phone,
      normalize_profile_phone(p.phone) AS normalized_phone
    FROM public.profiles p
    WHERE p.phone IS NOT NULL
      AND normalize_profile_phone(p.phone) <> ''
      AND (exclude_profile_id IS NULL OR p.id <> exclude_profile_id)
  )
  SELECT
    sp.profile_id,
    sp.name,
    sp.handle,
    sp.goal,
    sp.phone
  FROM sanitized_profiles sp
  JOIN normalized_inputs i
    ON i.normalized_phone = sp.normalized_phone
  ORDER BY sp.profile_id
  LIMIT greatest(1, least(coalesce(limit_count, 50), 200));
$$;

GRANT EXECUTE ON FUNCTION public.search_profiles_by_phone(TEXT[], INTEGER, UUID) TO authenticated;

COMMIT;
