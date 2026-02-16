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
import { isValidHandle, toHandle } from '@/lib/handleUtils';
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

export function ProfileProvider({ children }: ProfileProviderProps) {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [weightHistory, setWeightHistory] = useState<WeightEntry[]>([]);
  const [runSessions, setRunSessions] = useState<RunSession[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [userChallenges, setUserChallenges] = useState<UserChallengeProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  const reserveUniqueHandle = useCallback(
    async (seed: string, excludeCurrentProfile = false) => {
      const normalizedSeed = toHandle(seed || user?.name || user?.email || 'fit.user');
      const excludeProfileId = excludeCurrentProfile ? user?.id || null : null;

      const { data, error } = await supabase.rpc('reserve_unique_profile_handle', {
        seed_input: normalizedSeed,
        exclude_profile_id: excludeProfileId,
      });

      if (error) {
        console.error('Error reserving unique handle:', error);
        return { error: new Error(error.message) };
      }

      return { handle: toHandle(data || normalizedSeed), error: null };
    },
    [user?.email, user?.id, user?.name]
  );

  const checkHandleAvailability = useCallback(
    async (handle: string, excludeCurrentProfile = true) => {
      const normalizedHandle = toHandle(handle);
      if (!isValidHandle(normalizedHandle)) {
        return { available: false, normalizedHandle, error: null };
      }

      const excludeProfileId = excludeCurrentProfile ? user?.id || null : null;
      const { data, error } = await supabase.rpc('is_profile_handle_available', {
        handle_input: normalizedHandle,
        exclude_profile_id: excludeProfileId,
      });

      if (error) {
        console.error('Error checking handle availability:', error);
        return { available: false, normalizedHandle, error: new Error(error.message) };
      }

      return { available: Boolean(data), normalizedHandle, error: null };
    },
    [user?.id]
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

    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('user_challenge_progress')
      .select('*, challenges(*)')
      .eq('user_id', user.id)
      .eq('assigned_date', today);

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
      assigned_date: entry.assigned_date,
      challenge: entry.challenges ? {
        id: entry.challenges.id,
        name: entry.challenges.name,
        description: entry.challenges.description || '',
        challenge_type: entry.challenges.challenge_type as 'daily' | 'weekly',
        points_awarded: entry.challenges.points_awarded || 10,
        points_deducted: entry.challenges.points_deducted || 5,
        icon: entry.challenges.icon || '🏆',
        target_value: entry.challenges.target_value || 1,
        category: entry.challenges.category || 'general',
        is_active: entry.challenges.is_active ?? true,
      } : undefined,
    }));

    setUserChallenges(mapped);
    return mapped;
  }, [user]);

  const assignDailyChallenges = useCallback(async (): Promise<void> => {
    if (!user) return;

    const today = new Date().toISOString().split('T')[0];

    // Check existing assignments for today
    const { data: existing } = await supabase
      .from('user_challenge_progress')
      .select('challenge_id')
      .eq('user_id', user.id)
      .eq('assigned_date', today);

    const existingIds = new Set((existing || []).map((e) => e.challenge_id));

    // Get daily challenges
    const { data: dailyChallenges } = await supabase
      .from('challenges')
      .select('id')
      .eq('is_active', true)
      .eq('challenge_type', 'daily');

    const toAssign = (dailyChallenges || []).filter((c) => !existingIds.has(c.id));

    if (toAssign.length > 0) {
      const inserts = toAssign.map((c) => ({
        user_id: user.id,
        challenge_id: c.id,
        assigned_date: today,
        current_value: 0,
        is_completed: false,
      }));

      await supabase.from('user_challenge_progress').insert(inserts);
    }

    await fetchUserChallenges();
  }, [user, fetchUserChallenges]);

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

      const payload = {
        id: user.id,
        name: profileData.name || user.name,
        handle: reservedHandle,
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

      const { data, error } = await supabase
        .from('profiles')
        .insert(payload)
        .select()
        .single();

      if (error) {
        console.error('Error creating profile:', error);
        return { error: new Error(error.message) };
      }

      const mappedProfile: UserProfile = {
        id: data.id,
        name: data.name,
        handle: isValidHandle(data.handle || '') ? data.handle : reservedHandle,
        email: data.email,
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
    [user, fetchWeightHistory, reserveUniqueHandle]
  );

  const updateProfile = useCallback(
    async (updates: Partial<UserProfile>) => {
      if (!user) return { error: new Error('Not authenticated') };

      let nextHandle = updates.handle;
      if (typeof updates.handle === 'string') {
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

      const { data, error } = await supabase
        .from('profiles')
        .update({
          ...updates,
          ...(typeof nextHandle === 'string' ? { handle: nextHandle } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating profile:', error);
        return { error: new Error(error.message) };
      }

      const mappedProfile: UserProfile = {
        id: data.id,
        name: data.name,
        handle: isValidHandle(data.handle || '') ? data.handle : toHandle(data.name || data.email),
        email: data.email,
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
    [user, profile?.handle, checkHandleAvailability]
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
