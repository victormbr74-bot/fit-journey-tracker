import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  UserProfile,
  WeightEntry,
  RunSession,
  Challenge,
  UserChallengeProgress,
} from '@/types/user';

type ProfileContextValue = {
  profile: UserProfile | null;
  weightHistory: WeightEntry[];
  runSessions: RunSession[];
  challenges: Challenge[];
  userChallenges: UserChallengeProgress[];
  loading: boolean;
  createProfile: (profileData: Partial<UserProfile>) => Promise<{ data?: UserProfile; error?: Error | null }>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<{ data?: UserProfile; error?: Error | null }>;
  addWeightEntry: (weight: number) => Promise<{ error?: Error | null }>;
  addRunSession: (session: Omit<RunSession, 'id' | 'user_id' | 'recorded_at'>) => Promise<{ error?: Error | null }>;
  assignDailyChallenges: () => Promise<StoredUserChallenge[] | void>;
  completeChallenge: (challengeProgressId: string) => Promise<{ error?: Error | null }>;
  updateChallengeProgress: (challengeProgressId: string, value: number) => Promise<{ error?: Error | null }>;
  refetch: {
    profile: () => Promise<UserProfile | null>;
    weightHistory: () => Promise<WeightEntry[]>;
    runSessions: () => Promise<RunSession[]>;
    challenges: () => Promise<Challenge[]>;
    userChallenges: () => Promise<UserChallengeProgress[]>;
  };
};

type ProfileProviderProps = {
  children: ReactNode;
};

const DEFAULT_CHALLENGES: Challenge[] = [
  {
    id: 'daily-1',
    name: 'Treino Completo',
    description: 'Complete um treino hoje',
    challenge_type: 'daily',
    points_awarded: 15,
    points_deducted: 5,
    icon: '💪',
    target_value: 1,
    category: 'workout',
    is_active: true,
  },
  {
    id: 'daily-2',
    name: 'Hidratação',
    description: 'Beba 2L de água hoje',
    challenge_type: 'daily',
    points_awarded: 10,
    points_deducted: 3,
    icon: '💧',
    target_value: 8,
    category: 'health',
    is_active: true,
  },
  {
    id: 'daily-3',
    name: 'Corrida Matinal',
    description: 'Corra pelo menos 2km',
    challenge_type: 'daily',
    points_awarded: 20,
    points_deducted: 5,
    icon: '🏃‍♂️',
    target_value: 1,
    category: 'cardio',
    is_active: true,
  },
  {
    id: 'daily-4',
    name: 'Registrar Peso',
    description: 'Registre seu peso hoje',
    challenge_type: 'daily',
    points_awarded: 5,
    points_deducted: 0,
    icon: '⚖️',
    target_value: 1,
    category: 'tracking',
    is_active: true,
  },
  {
    id: 'daily-5',
    name: 'Seguir Dieta',
    description: 'Siga o plano de dieta do dia',
    challenge_type: 'daily',
    points_awarded: 15,
    points_deducted: 5,
    icon: '🥗',
    target_value: 1,
    category: 'diet',
    is_active: true,
  },
  {
    id: 'weekly-1',
    name: 'Meta Semanal de Treinos',
    description: 'Complete todos os treinos da semana',
    challenge_type: 'weekly',
    points_awarded: 50,
    points_deducted: 20,
    icon: '🌟',
    target_value: 5,
    category: 'workout',
    is_active: true,
  },
  {
    id: 'weekly-2',
    name: 'Corrida Semanal 10km',
    description: 'Corra 10km durante a semana',
    challenge_type: 'weekly',
    points_awarded: 40,
    points_deducted: 10,
    icon: '🚵',
    target_value: 1,
    category: 'cardio',
    is_active: true,
  },
  {
    id: 'weekly-3',
    name: 'Consistência de Peso',
    description: 'Registre seu peso todos os dias da semana',
    challenge_type: 'weekly',
    points_awarded: 30,
    points_deducted: 10,
    icon: '📊',
    target_value: 7,
    category: 'tracking',
    is_active: true,
  },
];

type StoredWeightEntry = {
  id: string;
  user_id: string;
  date: string;
  weight: number;
  recorded_at: string;
};

type StoredRunSession = {
  id: string;
  user_id: string;
  date: string;
  duration: number;
  distance: number;
  avgSpeed: number;
  route: { lat: number; lng: number }[];
  calories: number;
  recorded_at: string;
};

type StoredUserChallenge = {
  id: string;
  user_id: string;
  challenge_id: string;
  current_value: number;
  is_completed: boolean;
  completed_at?: string;
  assigned_date: string;
  created_at: string;
  updated_at: string;
};

const STORAGE_KEYS = {
  profile: (uid: string) => `fittrack_profile_${uid}`,
  weight: (uid: string) => `fittrack_weight_${uid}`,
  runSessions: (uid: string) => `fittrack_runs_${uid}`,
  userChallenges: (uid: string) => `fittrack_user_challenges_${uid}`,
  users: 'fittrack_users',
  session: 'fittrack_session',
};

const readStored = <T,>(key: string): T | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const writeStored = <T,>(key: string, data: T) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(data));
};

const createId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
};

const mapWeight = (stored: StoredWeightEntry[]): WeightEntry[] =>
  stored.map((entry) => ({
    id: entry.id,
    user_id: entry.user_id,
    date: new Date(entry.date),
    weight: entry.weight,
    recorded_at: entry.recorded_at,
  }));

const mapRuns = (stored: StoredRunSession[]): RunSession[] =>
  stored.map((session) => ({
    id: session.id,
    user_id: session.user_id,
    date: new Date(session.date),
    duration: session.duration,
    distance: session.distance,
    avgSpeed: session.avgSpeed,
    route: session.route,
    calories: session.calories,
    recorded_at: session.recorded_at,
  }));

const enrichProgress = (entries: StoredUserChallenge[]): UserChallengeProgress[] => {
  const map: Record<string, Challenge> = {};
  DEFAULT_CHALLENGES.forEach((challenge) => {
    map[challenge.id] = challenge;
  });
  return entries.map((entry) => ({
    id: entry.id,
    user_id: entry.user_id,
    challenge_id: entry.challenge_id,
    current_value: entry.current_value,
    is_completed: entry.is_completed,
    completed_at: entry.completed_at,
    assigned_date: entry.assigned_date,
    challenge: map[entry.challenge_id],
  }));
};

const INITIAL_PROFILE_STATE = {
  profile: null,
  weightHistory: [],
  runSessions: [],
  challenges: DEFAULT_CHALLENGES,
  userChallenges: [],
  loading: true,
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: ProfileProviderProps) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(INITIAL_PROFILE_STATE.profile);
  const [weightHistory, setWeightHistory] = useState<WeightEntry[]>(INITIAL_PROFILE_STATE.weightHistory);
  const [runSessions, setRunSessions] = useState<RunSession[]>(INITIAL_PROFILE_STATE.runSessions);
  const [challenges, setChallenges] = useState<Challenge[]>(INITIAL_PROFILE_STATE.challenges);
  const [userChallenges, setUserChallenges] = useState<UserChallengeProgress[]>(INITIAL_PROFILE_STATE.userChallenges);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(() => {
    if (!user) return null;
    return readStored<UserProfile>(STORAGE_KEYS.profile(user.id));
  }, [user]);

  const fetchProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      return null;
    }
    const stored = loadProfile();
    if (stored) {
      setProfile(stored);
      return stored;
    }
    setProfile(null);
    return null;
  }, [user, loadProfile]);

  const fetchWeightHistory = useCallback(async () => {
    if (!user) {
      setWeightHistory([]);
      return [];
    }
    const stored = readStored<StoredWeightEntry[]>(STORAGE_KEYS.weight(user.id)) || [];
    const entries = mapWeight(stored);
    setWeightHistory(entries);
    return entries;
  }, [user]);

  const fetchRunSessions = useCallback(async () => {
    if (!user) {
      setRunSessions([]);
      return [];
    }
    const stored = readStored<StoredRunSession[]>(STORAGE_KEYS.runSessions(user.id)) || [];
    const entries = mapRuns(stored);
    setRunSessions(entries);
    return entries;
  }, [user]);

  const fetchChallenges = useCallback(async () => {
    setChallenges(DEFAULT_CHALLENGES);
    return DEFAULT_CHALLENGES;
  }, []);

  const fetchUserChallenges = useCallback(async () => {
    if (!user) {
      setUserChallenges([]);
      return [];
    }
    const stored = readStored<StoredUserChallenge[]>(STORAGE_KEYS.userChallenges(user.id)) || [];
    const enriched = enrichProgress(stored);
    setUserChallenges(enriched);
    return enriched;
  }, [user]);

  const persistProfile = (data: UserProfile) => {
    if (!user) return;
    writeStored(STORAGE_KEYS.profile(user.id), data);
  };

  const persistWeightHistory = (entries: StoredWeightEntry[]) => {
    if (!user) return;
    writeStored(STORAGE_KEYS.weight(user.id), entries);
  };

  const persistRunSessions = (entries: StoredRunSession[]) => {
    if (!user) return;
    writeStored(STORAGE_KEYS.runSessions(user.id), entries);
  };

  const persistUserChallenges = (entries: StoredUserChallenge[]) => {
    if (!user) return;
    writeStored(STORAGE_KEYS.userChallenges(user.id), entries);
  };

  const assignDailyChallenges = useCallback(async () => {
    if (!user) return;
    const today = new Date().toISOString().split('T')[0];
    const stored = readStored<StoredUserChallenge[]>(STORAGE_KEYS.userChallenges(user.id)) || [];
    const alreadyAssigned = new Set(
      stored.filter((entry) => entry.assigned_date === today).map((entry) => entry.challenge_id)
    );
    const daily = DEFAULT_CHALLENGES.filter((challenge) => challenge.challenge_type === 'daily');
    const toAssign = daily.filter((challenge) => !alreadyAssigned.has(challenge.id));

    if (toAssign.length > 0) {
      const newEntries = toAssign.map((challenge) => ({
        id: createId(),
        user_id: user.id,
        challenge_id: challenge.id,
        current_value: 0,
        is_completed: false,
        assigned_date: today,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
      const updated = [...stored, ...newEntries];
      persistUserChallenges(updated);
      setUserChallenges(enrichProgress(updated));
      return updated;
    }

    setUserChallenges(enrichProgress(stored));
    return stored;
  }, [user]);

  const updateProfile = useCallback(
    async (updates: Partial<UserProfile>) => {
      if (!user) return { error: new Error('Not authenticated') };
      const stored = loadProfile();
      const base = stored || profile;
      if (!base) {
        return { error: new Error('Profile not found') };
      }
      const payload = {
        ...base,
        ...updates,
        updated_at: new Date().toISOString(),
      };
      persistProfile(payload);
      setProfile(payload);
      return { data: payload, error: null };
    },
    [user, profile, loadProfile]
  );

  const addWeightEntry = useCallback(
    async (weight: number) => {
      if (!user) return { error: new Error('Not authenticated') };
      const stored = readStored<StoredWeightEntry[]>(STORAGE_KEYS.weight(user.id)) || [];
      const entry: StoredWeightEntry = {
        id: createId(),
        user_id: user.id,
        date: new Date().toISOString(),
        weight,
        recorded_at: new Date().toISOString(),
      };
      const updated = [...stored, entry];
      persistWeightHistory(updated);
      setWeightHistory(mapWeight(updated));

      const points = (profile?.points || 0) + 10;
      setProfile((prev) => {
        if (!prev) return prev;
        const next = { ...prev, weight, points };
        persistProfile(next);
        return next;
      });

      return { error: null };
    },
    [user, profile]
  );

  const addRunSession = useCallback(
    async (session: Omit<RunSession, 'id' | 'user_id' | 'recorded_at'>) => {
      if (!user) return { error: new Error('Not authenticated') };
      const stored = readStored<StoredRunSession[]>(STORAGE_KEYS.runSessions(user.id)) || [];
      const entry: StoredRunSession = {
        id: createId(),
        user_id: user.id,
        date: new Date().toISOString(),
        duration: session.duration,
        distance: session.distance,
        avgSpeed: session.avgSpeed,
        route: session.route,
        calories: session.calories,
        recorded_at: new Date().toISOString(),
      };
      const updated = [entry, ...stored];
      persistRunSessions(updated);
      setRunSessions(mapRuns(updated));

      const pointsEarned = Math.floor(session.distance * 20);
      setProfile((prev) => {
        if (!prev) return prev;
        const next = { ...prev, points: (prev.points || 0) + pointsEarned };
        persistProfile(next);
        return next;
      });

      return { error: null };
    },
    [user]
  );

  const completeChallenge = useCallback(
    async (challengeProgressId: string) => {
      if (!user) return { error: new Error('Not authenticated') };
      const stored = readStored<StoredUserChallenge[]>(STORAGE_KEYS.userChallenges(user.id)) || [];
      const index = stored.findIndex((entry) => entry.id === challengeProgressId);
      if (index === -1) {
        return { error: new Error('Challenge not found') };
      }
      const progress = stored[index];
      if (progress.is_completed) {
        return { error: null };
      }
      stored[index] = {
        ...progress,
        is_completed: true,
        current_value: progress.current_value,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      persistUserChallenges(stored);
      setUserChallenges(enrichProgress(stored));

      const challenge = DEFAULT_CHALLENGES.find((c) => c.id === progress.challenge_id);
      const pointsEarned = challenge?.points_awarded || 0;
      setProfile((prev) => {
        if (!prev) return prev;
        const next = { ...prev, points: (prev.points || 0) + pointsEarned };
        persistProfile(next);
        return next;
      });

      return { error: null };
    },
    [user]
  );

  const updateChallengeProgress = useCallback(
    async (challengeProgressId: string, value: number) => {
      if (!user) return { error: new Error('Not authenticated') };
      const stored = readStored<StoredUserChallenge[]>(STORAGE_KEYS.userChallenges(user.id)) || [];
      const index = stored.findIndex((entry) => entry.id === challengeProgressId);
      if (index === -1) {
        return { error: new Error('Challenge not found') };
      }
      const progress = stored[index];
      const target = DEFAULT_CHALLENGES.find((c) => c.id === progress.challenge_id)?.target_value || 0;
      const completed = value >= target;
      if (completed && !progress.is_completed) {
        const challenge = DEFAULT_CHALLENGES.find((c) => c.id === progress.challenge_id);
        const pointsEarned = challenge?.points_awarded || 0;
        setProfile((prev) => {
          if (!prev) return prev;
          const next = { ...prev, points: (prev.points || 0) + pointsEarned };
          persistProfile(next);
          return next;
        });
      }
      stored[index] = {
        ...progress,
        current_value: value,
        is_completed: completed,
        completed_at: completed ? new Date().toISOString() : undefined,
        updated_at: new Date().toISOString(),
      };
      persistUserChallenges(stored);
      setUserChallenges(enrichProgress(stored));

      return { error: null };
    },
    [user]
  );

  const createProfile = useCallback(
    async (profileData: Partial<UserProfile>) => {
      if (!user) return { error: new Error('Not authenticated') };
      const payload: UserProfile = {
        id: user.id,
        name: profileData.name || user.name,
        email: profileData.email || user.email,
        birthdate: profileData.birthdate || '',
        age: profileData.age || 0,
        weight: profileData.weight || 0,
        height: profileData.height || 0,
        goal: profileData.goal || 'maintain',
        muscle_groups: profileData.muscle_groups || [],
        training_frequency: profileData.training_frequency || 3,
        points: profileData.points || 0,
        spotify_playlist: profileData.spotify_playlist || '',
        youtube_playlist: profileData.youtube_playlist || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      persistProfile(payload);
      setProfile(payload);

      if (profileData.weight) {
        await addWeightEntry(profileData.weight);
      }

      return { data: payload, error: null };
    },
    [user, addWeightEntry]
  );

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setWeightHistory([]);
      setRunSessions([]);
      setChallenges(DEFAULT_CHALLENGES);
      setUserChallenges([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      await fetchProfile();
      await fetchWeightHistory();
      await fetchRunSessions();
      await fetchChallenges();
      await assignDailyChallenges();
      if (!cancelled) {
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, fetchProfile, fetchWeightHistory, fetchRunSessions, fetchChallenges, assignDailyChallenges]);

  const value: ProfileContextValue = {
    profile,
    weightHistory,
    runSessions,
    challenges,
    userChallenges,
    loading,
    createProfile,
    updateProfile,
    addWeightEntry,
    addRunSession,
    assignDailyChallenges,
    completeChallenge,
    updateChallengeProgress,
    refetch: {
      profile: fetchProfile,
      weightHistory: fetchWeightHistory,
      runSessions: fetchRunSessions,
      challenges: fetchChallenges,
      userChallenges: fetchUserChallenges,
    },
  };

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfileContext() {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
}
