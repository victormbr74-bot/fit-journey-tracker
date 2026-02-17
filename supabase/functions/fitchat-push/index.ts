import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.93.3';
import webpush from 'npm:web-push@3.6.7';

type PushRequestPayload = {
  receiver_handle?: string;
  text?: string;
  target_path?: string | null;
  post_id?: string | null;
  story_id?: string | null;
};

type StoredSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  profile_id: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

const normalizeHandle = (value: string) => {
  const base = value.toLowerCase().replace(/^@+/, '').replace(/[^a-z0-9._]+/g, '.');
  const trimmed = base.replace(/(^\.+|\.+$)/g, '');
  if (!trimmed) return '';
  return `@${trimmed.slice(0, 30)}`;
};

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const vapidPublicKey = Deno.env.get('FITCHAT_WEB_PUSH_VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('FITCHAT_WEB_PUSH_VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('FITCHAT_WEB_PUSH_SUBJECT') || 'mailto:suporte@soufit.app';

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return json(500, { error: 'Supabase env vars are missing.' });
  }
  if (!vapidPublicKey || !vapidPrivateKey) {
    return json(500, { error: 'VAPID keys are missing.' });
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return json(401, { error: 'Missing authorization header.' });
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return json(401, { error: 'Invalid auth token.' });
  }

  let payload: PushRequestPayload;
  try {
    payload = (await request.json()) as PushRequestPayload;
  } catch {
    return json(400, { error: 'Invalid JSON payload.' });
  }

  const receiverHandle = normalizeHandle(payload.receiver_handle || '');
  const messageText = (payload.text || '').trim().slice(0, 180);
  const targetPath = payload.target_path || '/chat';
  if (!receiverHandle) {
    return json(400, { error: 'receiver_handle is required.' });
  }
  if (!messageText) {
    return json(400, { error: 'text is required.' });
  }

  const { data: senderProfile, error: senderProfileError } = await adminClient
    .from('profiles')
    .select('id, name, handle')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (senderProfileError || !senderProfile) {
    return json(403, { error: 'Sender profile not found.' });
  }

  const { data: receiverProfile, error: receiverProfileError } = await adminClient
    .from('profiles')
    .select('id, name, handle')
    .ilike('handle', receiverHandle)
    .maybeSingle();

  if (receiverProfileError || !receiverProfile) {
    return json(404, { error: 'Receiver profile not found.' });
  }

  if (receiverProfile.id === senderProfile.id) {
    return json(200, { delivered: 0, skipped: true });
  }

  const { data: subscriptions, error: subscriptionsError } = await adminClient
    .from('chat_push_subscriptions')
    .select('id, endpoint, p256dh, auth, profile_id')
    .eq('profile_id', receiverProfile.id);

  if (subscriptionsError) {
    return json(500, { error: 'Failed to load push subscriptions.' });
  }

  if (!subscriptions?.length) {
    return json(200, { delivered: 0, reason: 'no_subscriptions' });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const title = `FitChat • ${senderProfile.name || senderProfile.handle}`;
  const body = messageText;
  const notificationPayload = JSON.stringify({
    title,
    body,
    targetPath,
    senderHandle: senderProfile.handle,
    postId: payload.post_id || null,
    storyId: payload.story_id || null,
  });

  let delivered = 0;
  const staleIds: string[] = [];

  for (const row of subscriptions as StoredSubscription[]) {
    try {
      await webpush.sendNotification(
        {
          endpoint: row.endpoint,
          keys: {
            p256dh: row.p256dh,
            auth: row.auth,
          },
        },
        notificationPayload,
        { TTL: 60 }
      );
      delivered += 1;
    } catch (error) {
      const statusCode =
        typeof error === 'object' && error && 'statusCode' in error
          ? Number((error as { statusCode?: number }).statusCode)
          : 0;
      if (statusCode === 404 || statusCode === 410) {
        staleIds.push(row.id);
      } else {
        console.error('Failed to send FitChat push:', error);
      }
    }
  }

  if (staleIds.length) {
    await adminClient.from('chat_push_subscriptions').delete().in('id', staleIds);
  }

  return json(200, {
    delivered,
    staleRemoved: staleIds.length,
    receiverProfileId: receiverProfile.id,
  });
});
