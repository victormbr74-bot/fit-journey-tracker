BEGIN;

CREATE OR REPLACE FUNCTION public.get_profile_public_summary(
  target_profile_id UUID DEFAULT NULL,
  target_handle TEXT DEFAULT NULL
)
RETURNS TABLE (
  profile_id UUID,
  name TEXT,
  handle TEXT,
  goal TEXT,
  points INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_target_handle TEXT;
BEGIN
  normalized_target_handle := normalize_profile_handle(coalesce(target_handle, ''));

  RETURN QUERY
  SELECT
    p.id AS profile_id,
    p.name,
    p.handle,
    p.goal,
    coalesce(p.points, 0)::INTEGER AS points
  FROM public.profiles p
  WHERE
    (target_profile_id IS NOT NULL AND p.id = target_profile_id)
    OR (
      normalized_target_handle <> ''
      AND normalize_profile_handle(p.handle) = normalized_target_handle
    )
  ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC NULLS LAST
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_profile_public_summary(UUID, TEXT) TO authenticated;

COMMIT;
