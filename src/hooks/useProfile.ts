import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { UserProfile, WeightEntry, RunSession, Challenge, UserChallengeProgress } from '@/types/user';
import { useAuth } from './useAuth';

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [weightHistory, setWeightHistory] = useState<WeightEntry[]>([]);
  const [runSessions, setRunSessions] = useState<RunSession[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [userChallenges, setUserChallenges] = useState<UserChallengeProgress[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        setProfile({
          id: data.id,
          name: data.name,
          email: data.email,
          birthdate: data.birthdate || '',
          age: data.age || 0,
          weight: Number(data.weight) || 0,
          height: Number(data.height) || 0,
          goal: data.goal as UserProfile['goal'] || 'maintain',
          muscle_groups: data.muscle_groups || [],
          training_frequency: data.training_frequency || 3,
          points: data.points || 0,
          spotify_playlist: data.spotify_playlist || '',
          youtube_playlist: data.youtube_playlist || '',
          created_at: data.created_at,
          updated_at: data.updated_at,
        });
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const fetchWeightHistory = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('weight_history')
        .select('*')
        .eq('user_id', user.id)
        .order('recorded_at', { ascending: true });

      if (error) throw error;
      
      setWeightHistory((data || []).map(entry => ({
        id: entry.id,
        user_id: entry.user_id,
        date: new Date(entry.recorded_at),
        weight: Number(entry.weight),
        recorded_at: entry.recorded_at,
      })));
    } catch (error) {
      console.error('Error fetching weight history:', error);
    }
  }, [user]);

  const fetchRunSessions = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('run_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('recorded_at', { ascending: false });

      if (error) throw error;
      
      setRunSessions((data || []).map(session => ({
        id: session.id,
        user_id: session.user_id,
        date: new Date(session.recorded_at),
        duration: session.duration,
        distance: Number(session.distance),
        avgSpeed: Number(session.avg_speed),
        route: (session.route as { lat: number; lng: number }[]) || [],
        calories: session.calories || 0,
        recorded_at: session.recorded_at,
      })));
    } catch (error) {
      console.error('Error fetching run sessions:', error);
    }
  }, [user]);

  const fetchChallenges = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('challenges')
        .select('*')
        .eq('is_active', true);

      if (error) throw error;
      
      setChallenges((data || []).map(challenge => ({
        id: challenge.id,
        name: challenge.name,
        description: challenge.description || '',
        challenge_type: challenge.challenge_type as 'daily' | 'weekly',
        points_awarded: challenge.points_awarded || 10,
        points_deducted: challenge.points_deducted || 5,
        icon: challenge.icon || '🏆',
        target_value: challenge.target_value || 1,
        category: challenge.category || 'general',
        is_active: challenge.is_active !== false,
      })));
    } catch (error) {
      console.error('Error fetching challenges:', error);
    }
  }, [user]);

  const fetchUserChallenges = useCallback(async () => {
    if (!user) return;

    const today = new Date().toISOString().split('T')[0];
    
    try {
      const { data, error } = await supabase
        .from('user_challenge_progress')
        .select('*, challenges(*)')
        .eq('user_id', user.id)
        .gte('assigned_date', today);

      if (error) throw error;
      
      setUserChallenges((data || []).map(progress => ({
        id: progress.id,
        user_id: progress.user_id,
        challenge_id: progress.challenge_id,
        current_value: progress.current_value || 0,
        is_completed: progress.is_completed || false,
        completed_at: progress.completed_at || undefined,
        assigned_date: progress.assigned_date,
        challenge: progress.challenges ? {
          id: progress.challenges.id,
          name: progress.challenges.name,
          description: progress.challenges.description || '',
          challenge_type: progress.challenges.challenge_type as 'daily' | 'weekly',
          points_awarded: progress.challenges.points_awarded || 10,
          points_deducted: progress.challenges.points_deducted || 5,
          icon: progress.challenges.icon || '🏆',
          target_value: progress.challenges.target_value || 1,
          category: progress.challenges.category || 'general',
          is_active: progress.challenges.is_active !== false,
        } : undefined,
      })));
    } catch (error) {
      console.error('Error fetching user challenges:', error);
    }
  }, [user]);

  useEffect(() => {
    fetchProfile();
    fetchWeightHistory();
    fetchRunSessions();
    fetchChallenges();
    fetchUserChallenges();
  }, [fetchProfile, fetchWeightHistory, fetchRunSessions, fetchChallenges, fetchUserChallenges]);

  const createProfile = async (profileData: Partial<UserProfile>) => {
    if (!user) return { error: new Error('Not authenticated') };

    try {
      const { data, error } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          name: profileData.name || '',
          email: profileData.email || user.email || '',
          birthdate: profileData.birthdate || null,
          age: profileData.age || 0,
          weight: profileData.weight || 0,
          height: profileData.height || 0,
          goal: profileData.goal || 'maintain',
          muscle_groups: profileData.muscle_groups || [],
          training_frequency: profileData.training_frequency || 3,
          points: 0,
          spotify_playlist: profileData.spotify_playlist || null,
          youtube_playlist: profileData.youtube_playlist || null,
        })
        .select()
        .single();

      if (error) throw error;
      
      await fetchProfile();
      
      // Add initial weight entry
      if (profileData.weight) {
        await addWeightEntry(profileData.weight);
      }
      
      return { data, error: null };
    } catch (error) {
      console.error('Error creating profile:', error);
      return { error };
    }
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!user) return { error: new Error('Not authenticated') };

    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)
        .select()
        .single();

      if (error) throw error;
      
      await fetchProfile();
      return { data, error: null };
    } catch (error) {
      console.error('Error updating profile:', error);
      return { error };
    }
  };

  const addWeightEntry = async (weight: number) => {
    if (!user) return { error: new Error('Not authenticated') };

    try {
      const { data, error } = await supabase
        .from('weight_history')
        .insert({
          user_id: user.id,
          weight,
        })
        .select()
        .single();

      if (error) throw error;
      
      // Update profile weight and add points
      await updateProfile({ 
        weight,
        points: (profile?.points || 0) + 10 
      });
      
      await fetchWeightHistory();
      return { data, error: null };
    } catch (error) {
      console.error('Error adding weight entry:', error);
      return { error };
    }
  };

  const addRunSession = async (session: Omit<RunSession, 'id' | 'user_id' | 'recorded_at'>) => {
    if (!user) return { error: new Error('Not authenticated') };

    try {
      const { data, error } = await supabase
        .from('run_sessions')
        .insert({
          user_id: user.id,
          duration: session.duration,
          distance: session.distance,
          avg_speed: session.avgSpeed,
          calories: session.calories,
          route: session.route,
        })
        .select()
        .single();

      if (error) throw error;
      
      // Add points based on distance
      const pointsEarned = Math.floor(session.distance * 20);
      await updateProfile({ 
        points: (profile?.points || 0) + pointsEarned 
      });
      
      await fetchRunSessions();
      return { data, error: null };
    } catch (error) {
      console.error('Error adding run session:', error);
      return { error };
    }
  };

  const assignDailyChallenges = useCallback(async () => {
    if (!user || challenges.length === 0) return;

    const today = new Date().toISOString().split('T')[0];
    const dailyChallenges = challenges.filter(c => c.challenge_type === 'daily');

    try {
      const { data: existing, error } = await supabase
        .from('user_challenge_progress')
        .select('challenge_id')
        .eq('user_id', user.id)
        .eq('assigned_date', today);

      if (error) throw error;

      const assignedIds = new Set<string>(
        (existing || []).map((item) => item.challenge_id)
      );

      const challengesToAssign = dailyChallenges.filter(
        (challenge) => !assignedIds.has(challenge.id)
      );

      if (challengesToAssign.length === 0) {
        return;
      }

      await supabase
        .from('user_challenge_progress')
        .insert(
          challengesToAssign.map((challenge) => ({
            user_id: user.id,
            challenge_id: challenge.id,
            assigned_date: today,
            current_value: 0,
            is_completed: false,
          }))
        );
    } catch (error) {
      console.error('Error assigning challenge:', error);
    } finally {
      await fetchUserChallenges();
    }
  }, [user, challenges, fetchUserChallenges]);

  const completeChallenge = async (challengeProgressId: string) => {
    if (!user) return { error: new Error('Not authenticated') };

    try {
      const progress = userChallenges.find(uc => uc.id === challengeProgressId);
      if (!progress || !progress.challenge) {
        return { error: new Error('Challenge not found') };
      }

      const { error } = await supabase
        .from('user_challenge_progress')
        .update({
          is_completed: true,
          completed_at: new Date().toISOString(),
          current_value: progress.challenge.target_value,
        })
        .eq('id', challengeProgressId);

      if (error) throw error;

      // Award points
      await updateProfile({
        points: (profile?.points || 0) + progress.challenge.points_awarded
      });

      await fetchUserChallenges();
      return { error: null };
    } catch (error) {
      console.error('Error completing challenge:', error);
      return { error };
    }
  };

  const updateChallengeProgress = async (challengeProgressId: string, value: number) => {
    if (!user) return { error: new Error('Not authenticated') };

    try {
      const progress = userChallenges.find(uc => uc.id === challengeProgressId);
      if (!progress || !progress.challenge) {
        return { error: new Error('Challenge not found') };
      }

      const isCompleted = value >= progress.challenge.target_value;

      const { error } = await supabase
        .from('user_challenge_progress')
        .update({
          current_value: value,
          is_completed: isCompleted,
          completed_at: isCompleted ? new Date().toISOString() : null,
        })
        .eq('id', challengeProgressId);

      if (error) throw error;

      // Award points if completed
      if (isCompleted && !progress.is_completed) {
        await updateProfile({
          points: (profile?.points || 0) + progress.challenge.points_awarded
        });
      }

      await fetchUserChallenges();
      return { error: null };
    } catch (error) {
      console.error('Error updating challenge progress:', error);
      return { error };
    }
  };

  return {
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
    }
  };
}
