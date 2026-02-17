BEGIN;

CREATE TABLE IF NOT EXISTS public.chat_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_push_subscriptions_profile_id_idx
  ON public.chat_push_subscriptions (profile_id);

ALTER TABLE public.chat_push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own chat push subscriptions" ON public.chat_push_subscriptions;
CREATE POLICY "Users can view own chat push subscriptions"
ON public.chat_push_subscriptions
FOR SELECT
TO authenticated
USING (auth.uid() = profile_id);

DROP POLICY IF EXISTS "Users can insert own chat push subscriptions" ON public.chat_push_subscriptions;
CREATE POLICY "Users can insert own chat push subscriptions"
ON public.chat_push_subscriptions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = profile_id);

DROP POLICY IF EXISTS "Users can update own chat push subscriptions" ON public.chat_push_subscriptions;
CREATE POLICY "Users can update own chat push subscriptions"
ON public.chat_push_subscriptions
FOR UPDATE
TO authenticated
USING (auth.uid() = profile_id)
WITH CHECK (auth.uid() = profile_id);

DROP POLICY IF EXISTS "Users can delete own chat push subscriptions" ON public.chat_push_subscriptions;
CREATE POLICY "Users can delete own chat push subscriptions"
ON public.chat_push_subscriptions
FOR DELETE
TO authenticated
USING (auth.uid() = profile_id);

DROP TRIGGER IF EXISTS update_chat_push_subscriptions_updated_at ON public.chat_push_subscriptions;
CREATE TRIGGER update_chat_push_subscriptions_updated_at
  BEFORE UPDATE ON public.chat_push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_push_subscriptions TO authenticated;

COMMIT;
