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

GRANT EXECUTE ON FUNCTION public.search_profiles_by_handle(TEXT, INTEGER, UUID) TO authenticated;
