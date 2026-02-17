import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { isValidHandle, normalizeHandle, toHandle } from '@/lib/handleUtils';
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
  checkHandleAvailability: (
    handle: string,
    excludeCurrentProfile?: boolean
  ) => Promise<{ available: boolean; normalizedHandle: string; error?: Error | null }>;
  reserveUniqueHandle: (
    seed: string,
    excludeCurrentProfile?: boolean
  ) => Promise<{ handle?: string; error?: Error | null }>;
  addWeightEntry: (weight: number) => Promise<{ error?: Error | null }>;
  addRunSession: (session: Omit<RunSession, 'id' | 'user_id' | 'recorded_at'>) => Promise<{ error?: Error | null }>;
  assignDailyChallenges: () => Promise<void>;
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

const ProfileContext = createContext<ProfileContextValue | null>(null);

const isMissingRpcFunctionError = (error: { code?: string; message?: string; details?: string } | null | undefined) => {
  if (!error) return false;
  if (error.code === 'PGRST202') return true;
  const combinedText = `${error.message || ''} ${error.details || ''}`.toLowerCase();
  return combinedText.includes('could not find the function');
};

const isMissingProfilesColumnError = (
  error: { code?: string; message?: string; details?: string } | null | undefined,
  columnName: string
) => {
  if (!error) return false;
  if (error.code !== 'PGRST204') return false;
  const normalizedColumn = `'${columnName.toLowerCase()}'`;
  const combinedText = `${error.message || ''} ${error.details || ''}`.toLowerCase();
  return combinedText.includes(normalizedColumn) && combinedText.includes("'profiles'");
};

const isProfilesUserForeignKeyError = (
  error: { code?: string; message?: string; details?: string } | null | undefined
) => {
  if (!error) return false;
  if (error.code !== '23503') return false;
  const combinedText = `${error.message || ''} ${error.details || ''}`.toLowerCase();
  return combinedText.includes('profiles_id_fkey') || combinedText.includes('table "users"');
};

const isHandleConflictError = (
  error: { code?: string; message?: string; details?: string } | null | undefined
) => {
  if (!error) return false;
  if (error.code !== '23505') return false;
  const combinedText = `${error.message || ''} ${error.details || ''}`.toLowerCase();
  return combinedText.includes('handle') || combinedText.includes('profiles_handle_unique');
};

const BACKEND_CAPABILITIES_STORAGE_KEY = 'fit-journey.backend-capabilities';

const toIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getWeekStartIsoDate = (referenceDate: Date) => {
  const baseDate = new Date(referenceDate);
  baseDate.setHours(0, 0, 0, 0);
  const dayOfWeek = baseDate.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  baseDate.setDate(baseDate.getDate() + diffToMonday);
  return toIsoDate(baseDate);
};

export function ProfileProvider({ children }: ProfileProviderProps) {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [weightHistory, setWeightHistory] = useState<WeightEntry[]>([]);
  const [runSessions, setRunSessions] = useState<RunSession[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [userChallenges, setUserChallenges] = useState<UserChallengeProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);
  const backendCapabilitiesRef = useRef({
    handleColumnAvailable: true,
    phoneColumnAvailable: true,
    reserveHandleRpcAvailable: true,
    handleAvailabilityRpcAvailable: true,
    handleSearchRpcAvailable: true,
  });

  const persistCapabilities = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(
        BACKEND_CAPABILITIES_STORAGE_KEY,
        JSON.stringify(backendCapabilitiesRef.current)
      );
    } catch {
      // Ignore storage write issues.
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.sessionStorage.getItem(BACKEND_CAPABILITIES_STORAGE_KEY);
      if (!stored) return;
      const parsedRaw = JSON.parse(stored) as Record<string, unknown>;
      const parsed = parsedRaw as Partial<typeof backendCapabilitiesRef.current>;
      const legacyHandleRpcAvailable =
        typeof parsedRaw.handleRpcAvailable === 'boolean'
          ? parsedRaw.handleRpcAvailable
          : undefined;
      backendCapabilitiesRef.current = {
        ...backendCapabilitiesRef.current,
        ...parsed,
        reserveHandleRpcAvailable:
          typeof parsedRaw.reserveHandleRpcAvailable === 'boolean'
            ? parsedRaw.reserveHandleRpcAvailable
            : legacyHandleRpcAvailable ?? backendCapabilitiesRef.current.reserveHandleRpcAvailable,
        handleAvailabilityRpcAvailable:
          typeof parsedRaw.handleAvailabilityRpcAvailable === 'boolean'
            ? parsedRaw.handleAvailabilityRpcAvailable
            : legacyHandleRpcAvailable ?? backendCapabilitiesRef.current.handleAvailabilityRpcAvailable,
        handleSearchRpcAvailable:
          typeof parsedRaw.handleSearchRpcAvailable === 'boolean'
            ? parsedRaw.handleSearchRpcAvailable
            : backendCapabilitiesRef.current.handleSearchRpcAvailable,
      };
    } catch {
      // Ignore storage read issues.
    }
  }, []);

  const disableHandleFeatures = useCallback(() => {
    backendCapabilitiesRef.current.handleColumnAvailable = false;
    backendCapabilitiesRef.current.reserveHandleRpcAvailable = false;
    backendCapabilitiesRef.current.handleAvailabilityRpcAvailable = false;
    backendCapabilitiesRef.current.handleSearchRpcAvailable = false;
    persistCapabilities();
  }, [persistCapabilities]);

  const disableReserveHandleRpcFeature = useCallback(() => {
    backendCapabilitiesRef.current.reserveHandleRpcAvailable = false;
    persistCapabilities();
  }, [persistCapabilities]);

  const disableHandleAvailabilityRpcFeature = useCallback(() => {
    backendCapabilitiesRef.current.handleAvailabilityRpcAvailable = false;
    persistCapabilities();
  }, [persistCapabilities]);

  const disableHandleSearchRpcFeature = useCallback(() => {
    backendCapabilitiesRef.current.handleSearchRpcAvailable = false;
    persistCapabilities();
  }, [persistCapabilities]);

  const disablePhoneFeature = useCallback(() => {
    backendCapabilitiesRef.current.phoneColumnAvailable = false;
    persistCapabilities();
  }, [persistCapabilities]);

  const checkHandleAvailabilityViaSearchRpc = useCallback(
    async (normalizedHandle: string, excludeProfileId: string | null) => {
      if (!backendCapabilitiesRef.current.handleSearchRpcAvailable) return null;

      const { data, error } = await supabase.rpc('search_profiles_by_handle', {
        query_text: normalizedHandle,
        limit_count: 30,
        exclude_profile_id: excludeProfileId,
      });

      if (error) {
        if (isMissingRpcFunctionError(error)) {
          disableHandleSearchRpcFeature();
          return null;
        }
        console.error('Error checking handle availability via search RPC:', error);
        return { available: false, error: new Error(error.message) };
      }

      const normalizedTarget = normalizeHandle(normalizedHandle);
      const exists = Array.isArray(data)
        ? data.some((row) => {
            const typed = row as { handle?: string };
            return normalizeHandle(typed.handle || '') === normalizedTarget;
          })
        : false;

      return { available: !exists, error: null };
    },
    [disableHandleSearchRpcFeature]
  );

  const checkHandleAvailabilityViaProfilesTable = useCallback(
    async (normalizedHandle: string, excludeProfileId: string | null) => {
      if (!backendCapabilitiesRef.current.handleColumnAvailable) {
        return { available: true, error: null };
      }

      let request = supabase
        .from('profiles')
        .select('id, handle')
        .ilike('handle', normalizedHandle)
        .limit(20);

      if (excludeProfileId) {
        request = request.neq('id', excludeProfileId);
      }

      const { data, error } = await request;

      if (error) {
        if (isMissingProfilesColumnError(error, 'handle')) {
          disableHandleFeatures();
          return { available: true, error: null };
        }

        const combinedText = `${error.message || ''} ${error.details || ''}`.toLowerCase();
        if (combinedText.includes('row-level security') || combinedText.includes('permission denied')) {
          // Legacy RLS can block this fallback query; avoid blocking onboarding in that case.
          return { available: true, error: null };
        }

        console.error('Error checking handle availability via profiles table:', error);
        return { available: false, error: new Error(error.message) };
      }

      const normalizedTarget = normalizeHandle(normalizedHandle);
      const exists = (data || []).some((row) => normalizeHandle(row.handle || '') === normalizedTarget);
      return { available: !exists, error: null };
    },
    [disableHandleFeatures]
  );

  const checkHandleAvailabilityFallback = useCallback(
    async (normalizedHandle: string, excludeProfileId: string | null) => {
      const viaSearch = await checkHandleAvailabilityViaSearchRpc(normalizedHandle, excludeProfileId);
      if (viaSearch) return viaSearch;

      return checkHandleAvailabilityViaProfilesTable(normalizedHandle, excludeProfileId);
    },
    [checkHandleAvailabilityViaProfilesTable, checkHandleAvailabilityViaSearchRpc]
  );

  const reserveUniqueHandleClientSide = useCallback(
    async (seed: string, excludeProfileId: string | null) => {
      const base = normalizeHandle(seed || 'fit.user') || 'fit.user';
      const baseSlice = base.slice(0, 30);
      const maxAttempts = 60;

      for (let index = 0; index <= maxAttempts; index += 1) {
        const suffix = index === 0 ? '' : String(index);
        const bodyMaxLength = Math.max(3, 30 - suffix.length);
        const candidate = toHandle(`${baseSlice.slice(0, bodyMaxLength)}${suffix}`);
        const { available, error } = await checkHandleAvailabilityFallback(candidate, excludeProfileId);
        if (error) return { error };
        if (available) return { handle: candidate, error: null };
      }

      const timestampSuffix = Date.now().toString().slice(-4);
      return { handle: toHandle(`${baseSlice.slice(0, 26)}${timestampSuffix}`), error: null };
    },
    [checkHandleAvailabilityFallback]
  );

  const reserveUniqueHandle = useCallback(
    async (seed: string, excludeCurrentProfile = false) => {
      const normalizedSeed = toHandle(seed || user?.name || user?.email || 'fit.user');
      const fallbackHandle = toHandle(normalizedSeed);
      if (!backendCapabilitiesRef.current.handleColumnAvailable) {
        return { handle: fallbackHandle, error: null };
      }

      const excludeProfileId = excludeCurrentProfile ? user?.id || null : null;
      if (!backendCapabilitiesRef.current.reserveHandleRpcAvailable) {
        return reserveUniqueHandleClientSide(normalizedSeed, excludeProfileId);
      }

      const { data, error } = await supabase.rpc('reserve_unique_profile_handle', {
        seed_input: normalizedSeed,
        exclude_profile_id: excludeProfileId,
      });

      if (error) {
        if (isMissingProfilesColumnError(error, 'handle')) {
          disableHandleFeatures();
          return { handle: fallbackHandle, error: null };
        }

        if (isMissingRpcFunctionError(error)) {
          disableReserveHandleRpcFeature();
          return reserveUniqueHandleClientSide(normalizedSeed, excludeProfileId);
        }

        console.error('Error reserving unique handle:', error);
        return { error: new Error(error.message) };
      }

      return { handle: toHandle(data || normalizedSeed), error: null };
    },
    [
      disableHandleFeatures,
      disableReserveHandleRpcFeature,
      reserveUniqueHandleClientSide,
      user?.email,
      user?.id,
      user?.name,
    ]
  );

  const checkHandleAvailability = useCallback(
    async (handle: string, excludeCurrentProfile = true) => {
      const normalizedHandle = toHandle(handle);
      if (!isValidHandle(normalizedHandle)) {
        return { available: false, normalizedHandle, error: null };
      }
      if (!backendCapabilitiesRef.current.handleColumnAvailable) {
        return { available: true, normalizedHandle, error: null };
      }

      const excludeProfileId = excludeCurrentProfile ? user?.id || null : null;
      if (backendCapabilitiesRef.current.handleAvailabilityRpcAvailable) {
        const { data, error } = await supabase.rpc('is_profile_handle_available', {
          handle_input: normalizedHandle,
          exclude_profile_id: excludeProfileId,
        });

        if (error) {
          if (isMissingProfilesColumnError(error, 'handle')) {
            disableHandleFeatures();
            return { available: true, normalizedHandle, error: null };
          }

          if (isMissingRpcFunctionError(error)) {
            disableHandleAvailabilityRpcFeature();
          } else {
            console.error('Error checking handle availability:', error);
            return { available: false, normalizedHandle, error: new Error(error.message) };
          }
        } else {
          return { available: Boolean(data), normalizedHandle, error: null };
        }
      }

      const fallback = await checkHandleAvailabilityFallback(normalizedHandle, excludeProfileId);
      return { ...fallback, normalizedHandle };
    },
    [
      checkHandleAvailabilityFallback,
      disableHandleAvailabilityRpcFeature,
      disableHandleFeatures,
      user?.id,
    ]
  );

  const fetchProfile = useCallback(async (): Promise<UserProfile | null> => {
    if (!user) {
      setProfile(null);
      return null;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching profile:', error);
      setProfile(null);
      return null;
    }

    if (data) {
      const mappedProfile: UserProfile = {
        id: data.id,
        name: data.name,
        handle: isValidHandle(data.handle || '') ? data.handle : toHandle(data.name || data.email),
        email: data.email,
        phone: data.phone || '',
        birthdate: data.birthdate || '',
        age: data.age || 0,
        weight: data.weight || 0,
        height: data.height || 0,
        goal: (data.goal as UserProfile['goal']) || 'maintain',
        muscle_groups: data.muscle_groups || [],
        training_frequency: data.training_frequency || 3,
        points: data.points || 0,
        spotify_playlist: data.spotify_playlist || '',
        youtube_playlist: data.youtube_playlist || '',
        created_at: data.created_at || '',
        updated_at: data.updated_at || '',
      };
      setProfile(mappedProfile);
      return mappedProfile;
    }

    setProfile(null);
    return null;
  }, [user]);

  const fetchWeightHistory = useCallback(async (): Promise<WeightEntry[]> => {
    if (!user) {
      setWeightHistory([]);
      return [];
    }

    const { data, error } = await supabase
      .from('weight_history')
      .select('*')
      .eq('user_id', user.id)
      .order('recorded_at', { ascending: false });

    if (error) {
      console.error('Error fetching weight history:', error);
      setWeightHistory([]);
      return [];
    }

    const entries: WeightEntry[] = (data || []).map((entry) => ({
      id: entry.id,
      user_id: entry.user_id,
      date: new Date(entry.recorded_at || new Date()),
      weight: Number(entry.weight),
      recorded_at: entry.recorded_at || '',
    }));

    setWeightHistory(entries);
    return entries;
  }, [user]);

  const fetchRunSessions = useCallback(async (): Promise<RunSession[]> => {
    if (!user) {
      setRunSessions([]);
      return [];
    }

    const { data, error } = await supabase
      .from('run_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('recorded_at', { ascending: false });

    if (error) {
      console.error('Error fetching run sessions:', error);
      setRunSessions([]);
      return [];
    }

    const sessions: RunSession[] = (data || []).map((session) => ({
      id: session.id,
      user_id: session.user_id,
      date: new Date(session.recorded_at || new Date()),
      duration: session.duration,
      distance: Number(session.distance),
      avgSpeed: Number(session.avg_speed) || 0,
      route: (session.route as { lat: number; lng: number }[]) || [],
      calories: session.calories || 0,
      recorded_at: session.recorded_at || '',
    }));

    setRunSessions(sessions);
    return sessions;
  }, [user]);

  const fetchChallenges = useCallback(async (): Promise<Challenge[]> => {
    const { data, error } = await supabase
      .from('challenges')
      .select('*')
      .eq('is_active', true);

    if (error) {
      console.error('Error fetching challenges:', error);
      setChallenges([]);
      return [];
    }

    const mapped: Challenge[] = (data || []).map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description || '',
      challenge_type: c.challenge_type as 'daily' | 'weekly',
      points_awarded: c.points_awarded || 10,
      points_deducted: c.points_deducted || 5,
      icon: c.icon || '🏆',
      target_value: c.target_value || 1,
      category: c.category || 'general',
      is_active: c.is_active ?? true,
    }));

    setChallenges(mapped);
    return mapped;
  }, []);

  const fetchUserChallenges = useCallback(async (): Promise<UserChallengeProgress[]> => {
    if (!user) {
      setUserChallenges([]);
      return [];
    }

    const now = new Date();
    const today = toIsoDate(now);
    const weekStart = getWeekStartIsoDate(now);

    const { data, error } = await supabase
      .from('user_challenge_progress')
      .select('*, challenges(*)')
      .eq('user_id', user.id)
      .gte('assigned_date', weekStart);

    if (error) {
      console.error('Error fetching user challenges:', error);
      setUserChallenges([]);
      return [];
    }

    const mapped: UserChallengeProgress[] = (data || []).map((entry) => ({
      id: entry.id,
      user_id: entry.user_id,
      challenge_id: entry.challenge_id,
      current_value: entry.current_value || 0,
      is_completed: entry.is_completed || false,
      completed_at: entry.completed_at || undefined,
      assigned_date: typeof entry.assigned_date === 'string' ? entry.assigned_date.slice(0, 10) : today,
      challenge: entry.challenges ? {
        id: entry.challenges.id || entry.challenge_id,
        name: entry.challenges.name || 'Desafio',
        description: entry.challenges.description || '',
        challenge_type:
          (entry.challenges.challenge_type === 'weekly' ? 'weekly' : 'daily') as 'daily' | 'weekly',
        points_awarded: entry.challenges.points_awarded || 10,
        points_deducted: entry.challenges.points_deducted || 5,
        icon: entry.challenges.icon || '🏆',
        target_value: entry.challenges.target_value || 1,
        category: entry.challenges.category || 'general',
        is_active: entry.challenges.is_active ?? true,
      } : undefined,
    }));

    const activeCycle = mapped
      .filter((entry) => {
        if (!entry.challenge) return false;
        if (entry.challenge.challenge_type === 'daily') {
          return entry.assigned_date === today;
        }
        if (entry.challenge.challenge_type === 'weekly') {
          return entry.assigned_date === weekStart;
        }
        return false;
      })
      .sort((a, b) => {
        if (!a.challenge || !b.challenge) return 0;
        if (a.challenge.challenge_type !== b.challenge.challenge_type) {
          return a.challenge.challenge_type === 'daily' ? -1 : 1;
        }
        return (a.challenge.name || '').localeCompare(b.challenge.name || '');
      });

    setUserChallenges(activeCycle);
    return activeCycle;
  }, [user]);

  const assignDailyChallenges = useCallback(async (): Promise<void> => {
    if (!user) return;

    try {
      const now = new Date();
      const today = toIsoDate(now);
      const weekStart = getWeekStartIsoDate(now);

      const { data: activeChallenges, error: activeChallengesError } = await supabase
        .from('challenges')
        .select('id, challenge_type')
        .eq('is_active', true);

      if (activeChallengesError) {
        console.error('Error loading active challenges for assignment:', activeChallengesError);
        return;
      }

      const { data: expiredDailyRows, error: expiredDailyError } = await supabase
        .from('user_challenge_progress')
        .select('id, is_completed, challenges!inner(points_deducted, challenge_type)')
        .eq('user_id', user.id)
        .lt('assigned_date', today)
        .eq('challenges.challenge_type', 'daily');

      const { data: expiredWeeklyRows, error: expiredWeeklyError } = await supabase
        .from('user_challenge_progress')
        .select('id, is_completed, challenges!inner(points_deducted, challenge_type)')
        .eq('user_id', user.id)
        .lt('assigned_date', weekStart)
        .eq('challenges.challenge_type', 'weekly');

      if (expiredDailyError || expiredWeeklyError) {
        console.error('Error loading expired challenge cycles:', expiredDailyError || expiredWeeklyError);
        return;
      }

      const expiredRows = [...(expiredDailyRows || []), ...(expiredWeeklyRows || [])];
      const penaltyPoints = expiredRows.reduce((total, row) => {
        if (row.is_completed) return total;
        const challengeData = Array.isArray(row.challenges) ? row.challenges[0] : row.challenges;
        const pointsDeducted = Number(challengeData?.points_deducted) || 0;
        return total + Math.max(0, pointsDeducted);
      }, 0);

      if (penaltyPoints > 0) {
        const profileForPenalty = profile || await fetchProfile();
        if (profileForPenalty) {
          const nextPoints = Math.max(0, (profileForPenalty.points || 0) - penaltyPoints);
          const { data: updatedProfile, error: penaltyError } = await supabase
            .from('profiles')
            .update({
              points: nextPoints,
              updated_at: new Date().toISOString(),
            })
            .eq('id', user.id)
            .select()
            .single();
          if (penaltyError) {
            console.error('Error applying challenge penalty points:', penaltyError);
            return;
          }
          if (updatedProfile) {
            setProfile((previous) => {
              if (!previous) return previous;
              return {
                ...previous,
                points: updatedProfile.points || nextPoints,
                updated_at: updatedProfile.updated_at || previous.updated_at,
              };
            });
          }
        }
      }

      const expiredIds = expiredRows
        .map((row) => row.id)
        .filter((id): id is string => typeof id === 'string' && Boolean(id));
      if (expiredIds.length) {
        const { error: deleteExpiredError } = await supabase
          .from('user_challenge_progress')
          .delete()
          .in('id', expiredIds);
        if (deleteExpiredError) {
          console.error('Error removing expired challenge cycles:', deleteExpiredError);
          return;
        }
      }

      const { data: currentDailyRows, error: currentDailyError } = await supabase
        .from('user_challenge_progress')
        .select('challenge_id, challenges!inner(challenge_type)')
        .eq('user_id', user.id)
        .eq('assigned_date', today)
        .eq('challenges.challenge_type', 'daily');
      const { data: currentWeeklyRows, error: currentWeeklyError } = await supabase
        .from('user_challenge_progress')
        .select('challenge_id, challenges!inner(challenge_type)')
        .eq('user_id', user.id)
        .eq('assigned_date', weekStart)
        .eq('challenges.challenge_type', 'weekly');

      if (currentDailyError || currentWeeklyError) {
        console.error('Error loading active challenge assignments:', currentDailyError || currentWeeklyError);
        return;
      }

      const existingDailyIds = new Set((currentDailyRows || []).map((row) => row.challenge_id));
      const existingWeeklyIds = new Set((currentWeeklyRows || []).map((row) => row.challenge_id));
      const dailyChallenges = (activeChallenges || []).filter(
        (challenge) => challenge.challenge_type === 'daily'
      );
      const weeklyChallenges = (activeChallenges || []).filter(
        (challenge) => challenge.challenge_type === 'weekly'
      );

      const toAssignDaily = dailyChallenges.filter((challenge) => !existingDailyIds.has(challenge.id));
      const toAssignWeekly = weeklyChallenges.filter((challenge) => !existingWeeklyIds.has(challenge.id));

      const inserts = [
        ...toAssignDaily.map((challenge) => ({
          user_id: user.id,
          challenge_id: challenge.id,
          assigned_date: today,
          current_value: 0,
          is_completed: false,
        })),
        ...toAssignWeekly.map((challenge) => ({
          user_id: user.id,
          challenge_id: challenge.id,
          assigned_date: weekStart,
          current_value: 0,
          is_completed: false,
        })),
      ];

      if (inserts.length > 0) {
        const { error: insertError } = await supabase
          .from('user_challenge_progress')
          .insert(inserts);
        if (insertError) {
          console.error('Error assigning recurring challenge cycles:', insertError);
        }
      }

      await fetchUserChallenges();
    } catch (assignChallengesError) {
      console.error('Unexpected error assigning recurring challenges:', assignChallengesError);
    }
  }, [user, profile, fetchProfile, fetchUserChallenges]);

  const createProfile = useCallback(
    async (profileData: Partial<UserProfile>) => {
      if (!user) return { error: new Error('Not authenticated') };

      const { handle: reservedHandle, error: reserveHandleError } = await reserveUniqueHandle(
        profileData.handle || profileData.name || user.name || user.email || 'fit.user',
        false
      );
      if (reserveHandleError || !reservedHandle) {
        return { error: reserveHandleError || new Error('Failed to reserve profile handle') };
      }

      let selectedHandle = reservedHandle;

      const buildPayload = () => {
        const payload: Record<string, unknown> = {
          id: user.id,
          name: profileData.name || user.name,
          email: profileData.email || user.email,
          birthdate: profileData.birthdate || null,
          age: profileData.age || null,
          weight: profileData.weight || null,
          height: profileData.height || null,
          goal: profileData.goal || 'maintain',
          muscle_groups: profileData.muscle_groups || [],
          training_frequency: profileData.training_frequency || 3,
          points: profileData.points || 0,
          spotify_playlist: profileData.spotify_playlist || null,
          youtube_playlist: profileData.youtube_playlist || null,
        };

        if (backendCapabilitiesRef.current.handleColumnAvailable) {
          payload.handle = selectedHandle;
        }
        if (backendCapabilitiesRef.current.phoneColumnAvailable) {
          payload.phone = profileData.phone || user.phone || null;
        }

        return payload;
      };

      const upsertWithPayload = (payload: Record<string, unknown>) =>
        supabase
          .from('profiles')
          .upsert(payload, { onConflict: 'id' })
          .select()
          .single();

      let payload = buildPayload();
      let { data, error } = await upsertWithPayload(payload);

      if (error && (isMissingProfilesColumnError(error, 'handle') || isMissingProfilesColumnError(error, 'phone'))) {
        if (isMissingProfilesColumnError(error, 'handle')) {
          disableHandleFeatures();
        }
        if (isMissingProfilesColumnError(error, 'phone')) {
          disablePhoneFeature();
        }
        payload = buildPayload();
        ({ data, error } = await upsertWithPayload(payload));
      }

      if (error && isHandleConflictError(error) && backendCapabilitiesRef.current.handleColumnAvailable) {
        for (let attempt = 0; attempt < 4 && error && isHandleConflictError(error); attempt += 1) {
          const randomSuffix = Math.floor(Math.random() * 9000 + 1000).toString();
          const { handle: retryHandle, error: retryHandleError } = await reserveUniqueHandleClientSide(
            `${profileData.handle || selectedHandle}${randomSuffix}`,
            null
          );

          if (retryHandleError || !retryHandle) break;
          selectedHandle = retryHandle;
          payload = buildPayload();
          ({ data, error } = await upsertWithPayload(payload));

          if (error && (isMissingProfilesColumnError(error, 'handle') || isMissingProfilesColumnError(error, 'phone'))) {
            if (isMissingProfilesColumnError(error, 'handle')) {
              disableHandleFeatures();
            }
            if (isMissingProfilesColumnError(error, 'phone')) {
              disablePhoneFeature();
            }
            payload = buildPayload();
            ({ data, error } = await upsertWithPayload(payload));
          }
        }
      }

      if (error) {
        if (isProfilesUserForeignKeyError(error)) {
          return {
            error: new Error(
              'Falha de integracao no banco: execute a migration SQL para corrigir o vinculo de profiles com auth.users.'
            ),
          };
        }

        console.error('Error creating profile:', error);
        return { error: new Error(error.message) };
      }

      const mappedProfile: UserProfile = {
        id: data.id,
        name: data.name,
        handle: isValidHandle(data.handle || '') ? data.handle : selectedHandle,
        email: data.email,
        phone: data.phone || '',
        birthdate: data.birthdate || '',
        age: data.age || 0,
        weight: data.weight || 0,
        height: data.height || 0,
        goal: (data.goal as UserProfile['goal']) || 'maintain',
        muscle_groups: data.muscle_groups || [],
        training_frequency: data.training_frequency || 3,
        points: data.points || 0,
        spotify_playlist: data.spotify_playlist || '',
        youtube_playlist: data.youtube_playlist || '',
        created_at: data.created_at || '',
        updated_at: data.updated_at || '',
      };

      setProfile(mappedProfile);

      // Add initial weight entry
      if (profileData.weight) {
        await supabase.from('weight_history').insert({
          user_id: user.id,
          weight: profileData.weight,
        });
        await fetchWeightHistory();
      }

      return { data: mappedProfile, error: null };
    },
    [
      disableHandleFeatures,
      disablePhoneFeature,
      fetchWeightHistory,
      reserveUniqueHandle,
      reserveUniqueHandleClientSide,
      user,
    ]
  );

  const updateProfile = useCallback(
    async (updates: Partial<UserProfile>) => {
      if (!user) return { error: new Error('Not authenticated') };

      let nextHandle = updates.handle;
      const canUseHandle = backendCapabilitiesRef.current.handleColumnAvailable;

      if (typeof updates.handle === 'string' && canUseHandle) {
        const normalizedHandle = toHandle(updates.handle || profile?.handle || updates.name || 'fit.user');
        if (!isValidHandle(normalizedHandle)) {
          return { error: new Error('Formato de @usuario invalido') };
        }

        const { available, error: availabilityError } = await checkHandleAvailability(
          normalizedHandle,
          true
        );
        if (availabilityError) {
          return { error: availabilityError };
        }
        if (!available) {
          return { error: new Error('Esse @usuario ja esta em uso') };
        }
        nextHandle = normalizedHandle;
      }

      const buildPayload = () => {
        const payload: Record<string, unknown> = {
          ...updates,
          updated_at: new Date().toISOString(),
        };

        if (!backendCapabilitiesRef.current.handleColumnAvailable) {
          delete payload.handle;
        } else if (typeof nextHandle === 'string') {
          payload.handle = nextHandle;
        }

        if (!backendCapabilitiesRef.current.phoneColumnAvailable) {
          delete payload.phone;
        }

        return payload;
      };

      const updateWithPayload = (payload: Record<string, unknown>) =>
        supabase
          .from('profiles')
          .update(payload)
          .eq('id', user.id)
          .select()
          .single();

      let payload = buildPayload();
      let { data, error } = await updateWithPayload(payload);

      if (error && (isMissingProfilesColumnError(error, 'handle') || isMissingProfilesColumnError(error, 'phone'))) {
        if (isMissingProfilesColumnError(error, 'handle')) {
          disableHandleFeatures();
          nextHandle = undefined;
        }
        if (isMissingProfilesColumnError(error, 'phone')) {
          disablePhoneFeature();
        }

        payload = buildPayload();
        ({ data, error } = await updateWithPayload(payload));
      }

      if (error) {
        console.error('Error updating profile:', error);
        return { error: new Error(error.message) };
      }

      const mappedProfile: UserProfile = {
        id: data.id,
        name: data.name,
        handle: isValidHandle(data.handle || '') ? data.handle : toHandle(data.name || data.email),
        email: data.email,
        phone: data.phone || '',
        birthdate: data.birthdate || '',
        age: data.age || 0,
        weight: data.weight || 0,
        height: data.height || 0,
        goal: (data.goal as UserProfile['goal']) || 'maintain',
        muscle_groups: data.muscle_groups || [],
        training_frequency: data.training_frequency || 3,
        points: data.points || 0,
        spotify_playlist: data.spotify_playlist || '',
        youtube_playlist: data.youtube_playlist || '',
        created_at: data.created_at || '',
        updated_at: data.updated_at || '',
      };

      setProfile(mappedProfile);
      return { data: mappedProfile, error: null };
    },
    [checkHandleAvailability, disableHandleFeatures, disablePhoneFeature, profile?.handle, user]
  );

  const addWeightEntry = useCallback(
    async (weight: number) => {
      if (!user) return { error: new Error('Not authenticated') };

      const { error } = await supabase.from('weight_history').insert({
        user_id: user.id,
        weight,
      });

      if (error) {
        console.error('Error adding weight entry:', error);
        return { error: new Error(error.message) };
      }

      await fetchWeightHistory();

      // Update profile weight
      if (profile) {
        await updateProfile({ weight, points: (profile.points || 0) + 10 });
      }

      return { error: null };
    },
    [user, profile, fetchWeightHistory, updateProfile]
  );

  const addRunSession = useCallback(
    async (session: Omit<RunSession, 'id' | 'user_id' | 'recorded_at'>) => {
      if (!user) return { error: new Error('Not authenticated') };

      const { error } = await supabase.from('run_sessions').insert({
        user_id: user.id,
        duration: session.duration,
        distance: session.distance,
        avg_speed: session.avgSpeed,
        route: session.route,
        calories: session.calories,
      });

      if (error) {
        console.error('Error adding run session:', error);
        return { error: new Error(error.message) };
      }

      await fetchRunSessions();

      // Award points
      const pointsEarned = Math.floor(session.distance * 20);
      if (profile) {
        await updateProfile({ points: (profile.points || 0) + pointsEarned });
      }

      return { error: null };
    },
    [user, profile, fetchRunSessions, updateProfile]
  );

  const completeChallenge = useCallback(
    async (challengeProgressId: string) => {
      if (!user) return { error: new Error('Not authenticated') };

      const challengeProgress = userChallenges.find((c) => c.id === challengeProgressId);
      if (!challengeProgress || challengeProgress.is_completed) {
        return { error: null };
      }

      const { error } = await supabase
        .from('user_challenge_progress')
        .update({
          is_completed: true,
          completed_at: new Date().toISOString(),
        })
        .eq('id', challengeProgressId);

      if (error) {
        console.error('Error completing challenge:', error);
        return { error: new Error(error.message) };
      }

      await fetchUserChallenges();

      // Award points
      const pointsEarned = challengeProgress.challenge?.points_awarded || 0;
      if (profile && pointsEarned > 0) {
        await updateProfile({ points: (profile.points || 0) + pointsEarned });
      }

      return { error: null };
    },
    [user, userChallenges, profile, fetchUserChallenges, updateProfile]
  );

  const updateChallengeProgress = useCallback(
    async (challengeProgressId: string, value: number) => {
      if (!user) return { error: new Error('Not authenticated') };

      const challengeProgress = userChallenges.find((c) => c.id === challengeProgressId);
      if (!challengeProgress) {
        return { error: new Error('Challenge not found') };
      }

      const target = challengeProgress.challenge?.target_value || 0;
      const completed = value >= target;

      const updateData: { current_value: number; is_completed?: boolean; completed_at?: string } = {
        current_value: value,
      };

      if (completed && !challengeProgress.is_completed) {
        updateData.is_completed = true;
        updateData.completed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('user_challenge_progress')
        .update(updateData)
        .eq('id', challengeProgressId);

      if (error) {
        console.error('Error updating challenge progress:', error);
        return { error: new Error(error.message) };
      }

      await fetchUserChallenges();

      // Award points if completed
      if (completed && !challengeProgress.is_completed) {
        const pointsEarned = challengeProgress.challenge?.points_awarded || 0;
        if (profile && pointsEarned > 0) {
          await updateProfile({ points: (profile.points || 0) + pointsEarned });
        }
      }

      return { error: null };
    },
    [user, userChallenges, profile, fetchUserChallenges, updateProfile]
  );

  // Load data when user changes - with debounce to prevent flickering
  useEffect(() => {
    // Don't do anything while auth is still loading
    if (authLoading) {
      return;
    }

    // If no user, reset everything
    if (!user) {
      setProfile(null);
      setWeightHistory([]);
      setRunSessions([]);
      setChallenges([]);
      setUserChallenges([]);
      setLoading(false);
      fetchedRef.current = false;
      return;
    }

    // Prevent double-fetch
    if (fetchedRef.current) {
      return;
    }

    fetchedRef.current = true;

    const loadData = async () => {
      setLoading(true);
      try {
        await Promise.all([
          fetchProfile(),
          fetchWeightHistory(),
          fetchRunSessions(),
          fetchChallenges(),
        ]);
        await assignDailyChallenges();
      } catch (error) {
        console.error('Error loading profile data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user, authLoading, fetchProfile, fetchWeightHistory, fetchRunSessions, fetchChallenges, assignDailyChallenges]);

  // Reset fetchedRef when user changes
  useEffect(() => {
    return () => {
      fetchedRef.current = false;
    };
  }, [user?.id]);

  const value: ProfileContextValue = {
    profile,
    weightHistory,
    runSessions,
    challenges,
    userChallenges,
    loading,
    createProfile,
    updateProfile,
    checkHandleAvailability,
    reserveUniqueHandle,
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
