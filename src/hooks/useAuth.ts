import { useState, useEffect, useCallback } from 'react';
import { User } from '@/types/user';

const USERS_STORAGE_KEY = 'fittrack_users';
const SESSION_STORAGE_KEY = 'fittrack_session';

type StoredUser = {
  uid: string;
  email: string;
  password: string;
  name: string;
};

const createId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
};

const readUsers = (): StoredUser[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const persistUsers = (users: StoredUser[]) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
};

const persistSession = (user: StoredUser | null) => {
  if (typeof window === 'undefined') return;
  if (!user) {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
};

const readSession = (): StoredUser | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = readSession();
    if (session) {
      setUser({
        id: session.uid,
        email: session.email,
        name: session.name,
      });
    }
    setLoading(false);
  }, []);

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    const users = readUsers();
    const existing = users.find((u) => u.email === email);
    if (existing) {
      return { data: null, error: new Error('Email já cadastrado') };
    }
    const newUser: StoredUser = {
      uid: createId(),
      email,
      password,
      name,
    };
    const updated = [...users, newUser];
    persistUsers(updated);
    persistSession(newUser);
    const authUser: User = {
      id: newUser.uid,
      email: newUser.email,
      name: newUser.name,
    };
    setUser(authUser);
    return { data: authUser, error: null };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const users = readUsers();
    const existing = users.find((u) => u.email === email && u.password === password);
    if (!existing) {
      return { data: null, error: new Error('Email ou senha inválidos') };
    }
    persistSession(existing);
    const authUser: User = {
      id: existing.uid,
      email: existing.email,
      name: existing.name,
    };
    setUser(authUser);
    return { data: authUser, error: null };
  }, []);

  const signOut = useCallback(async () => {
    persistSession(null);
    setUser(null);
    return { error: null };
  }, []);

  return {
    user,
    loading,
    signUp,
    signIn,
    signOut,
  };
}
