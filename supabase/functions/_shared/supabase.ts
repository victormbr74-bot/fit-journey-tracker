import { createClient } from 'npm:@supabase/supabase-js@2.93.3';

export type SupabaseEnv = {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
};

export const getSupabaseEnv = (): SupabaseEnv => {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL, SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY');
  }

  return { url, anonKey, serviceRoleKey };
};

export const createAdminClient = () => {
  const { url, serviceRoleKey } = getSupabaseEnv();
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

export const createUserClient = (authorizationHeader: string) => {
  const { url, anonKey } = getSupabaseEnv();
  return createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: authorizationHeader,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

export const requireAuthenticatedUser = async (authorizationHeader: string | null) => {
  if (!authorizationHeader) {
    throw new Error('Missing authorization header');
  }

  const userClient = createUserClient(authorizationHeader);
  const { data, error } = await userClient.auth.getUser();

  if (error || !data.user) {
    throw new Error('Invalid auth token');
  }

  return {
    user: data.user,
    userClient,
  };
};

export const requireAdminUser = async (authorizationHeader: string | null) => {
  const { user } = await requireAuthenticatedUser(authorizationHeader);
  const adminClient = createAdminClient();

  const { data: profile, error } = await adminClient
    .from('profiles')
    .select('id, is_admin')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load profile: ${error.message}`);
  }

  if (!profile || !profile.is_admin) {
    throw new Error('Admin access required');
  }

  return {
    user,
    adminClient,
  };
};
