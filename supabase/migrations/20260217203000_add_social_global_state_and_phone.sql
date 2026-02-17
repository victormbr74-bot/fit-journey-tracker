ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_phone_format;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_phone_format
CHECK (
  phone IS NULL
  OR phone ~ '^[0-9()+ -]{8,20}$'
);

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
