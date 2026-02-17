import {
  createElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User as SupabaseUser } from '@supabase/supabase-js';

export type User = {
  id: string;
  email: string;
  name: string;
  phone?: string;
};

const mapUser = (supaUser: SupabaseUser | null): User | null => {
  if (!supaUser) return null;
  return {
    id: supaUser.id,
    email: supaUser.email || '',
    name: supaUser.user_metadata?.name || supaUser.email?.split('@')[0] || 'Usuario',
    phone: supaUser.phone || supaUser.user_metadata?.phone || '',
  };
};

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string, name: string, phone?: string) => Promise<{ data: User | null; error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ data: User | null; error: Error | null }>;
  signOut: () => Promise<{ error: Error | null }>;
};

type AuthProviderProps = {
  children: ReactNode;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const isInvalidRefreshTokenError = (
  error: { message?: string; status?: number } | null | undefined
) => {
  if (!error) return false;
  const message = (error.message || '').toLowerCase();
  return (
    message.includes('invalid refresh token') ||
    message.includes('refresh token not found')
  );
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(mapUser(session?.user ?? null));
      setLoading(false);
    });

    const restoreSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          if (isInvalidRefreshTokenError(error)) {
            await supabase.auth.signOut({ scope: 'local' });
          } else {
            console.error('Error restoring auth session:', error);
          }

          if (!active) return;
          setUser(null);
          setLoading(false);
          return;
        }

        if (!active) return;
        setUser(mapUser(data.session?.user ?? null));
        setLoading(false);
      } catch (error) {
        if (!active) return;
        console.error('Unexpected auth error while restoring session:', error);
        setUser(null);
        setLoading(false);
      }
    };

    void restoreSession();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, name: string, phone?: string) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { name, phone: phone || null },
        },
      });

      if (error) {
        return { data: null, error };
      }

      return { data: mapUser(data.user), error: null };
    },
    []
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { data: null, error };
    }

    return { data: mapUser(data.user), error: null };
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      setUser(null);
    }
    return { error };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    signUp,
    signIn,
    signOut,
  }), [loading, signIn, signOut, signUp, user]);

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
