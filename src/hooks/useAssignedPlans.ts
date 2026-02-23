import { useCallback, useEffect, useMemo, useState } from 'react';
import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { DietPlan, WorkoutPlan } from '@/types/workout';

type ProfessionalSummary = {
  id: string;
  name: string;
  handle: string;
};

export type AssignedWorkoutPlan = {
  id: string;
  title: string;
  description: string;
  plan: WorkoutPlan;
  professional: ProfessionalSummary;
  createdAt: string;
  updatedAt: string;
};

export type AssignedDietPlan = {
  id: string;
  title: string;
  description: string;
  plan: DietPlan;
  professional: ProfessionalSummary;
  createdAt: string;
  updatedAt: string;
};

const isValidWorkoutPlan = (value: unknown): value is WorkoutPlan => {
  if (!value || typeof value !== 'object') return false;
  const typed = value as Partial<WorkoutPlan>;
  return typeof typed.name === 'string' && Array.isArray(typed.days);
};

const isValidDietPlan = (value: unknown): value is DietPlan => {
  if (!value || typeof value !== 'object') return false;
  const typed = value as Partial<DietPlan>;
  return typeof typed.name === 'string' && Array.isArray(typed.meals);
};

const fetchProfessionalSummary = async (professionalId: string): Promise<ProfessionalSummary> => {
  const fallbackSummary: ProfessionalSummary = {
    id: professionalId,
    name: 'Profissional',
    handle: '@profissional',
  };

  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, handle')
    .eq('id', professionalId)
    .maybeSingle();

  if (error || !data) {
    return fallbackSummary;
  }

  return {
    id: data.id,
    name: data.name || fallbackSummary.name,
    handle: data.handle || fallbackSummary.handle,
  };
};

export function useAssignedPlans() {
  const { profile } = useProfile();
  const [assignedWorkoutPlan, setAssignedWorkoutPlan] = useState<AssignedWorkoutPlan | null>(null);
  const [assignedDietPlan, setAssignedDietPlan] = useState<AssignedDietPlan | null>(null);
  const [loadingWorkoutPlan, setLoadingWorkoutPlan] = useState(true);
  const [loadingDietPlan, setLoadingDietPlan] = useState(true);

  const isProfessionalAccount = useMemo(
    () =>
      profile?.profile_type === 'personal_trainer' ||
      profile?.profile_type === 'nutritionist',
    [profile?.profile_type]
  );

  const hasPersonalPackage = Boolean(profile?.has_personal_package);
  const hasNutritionistPackage = Boolean(profile?.has_nutritionist_package);

  const loadAssignedWorkoutPlan = useCallback(async () => {
    if (!profile?.id || isProfessionalAccount || !hasPersonalPackage) {
      setAssignedWorkoutPlan(null);
      setLoadingWorkoutPlan(false);
      return;
    }

    setLoadingWorkoutPlan(true);
    const { data, error } = await supabase
      .from('client_workout_plans')
      .select('*')
      .eq('client_id', profile.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Erro ao carregar treino profissional do cliente:', error);
      setAssignedWorkoutPlan(null);
      setLoadingWorkoutPlan(false);
      return;
    }

    if (!data || !isValidWorkoutPlan(data.plan_data)) {
      setAssignedWorkoutPlan(null);
      setLoadingWorkoutPlan(false);
      return;
    }

    const professional = await fetchProfessionalSummary(data.professional_id);
    setAssignedWorkoutPlan({
      id: data.id,
      title: data.title || 'Treino personalizado',
      description: data.description || '',
      plan: data.plan_data,
      professional,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    });
    setLoadingWorkoutPlan(false);
  }, [hasPersonalPackage, isProfessionalAccount, profile?.id]);

  const loadAssignedDietPlan = useCallback(async () => {
    if (!profile?.id || isProfessionalAccount || !hasNutritionistPackage) {
      setAssignedDietPlan(null);
      setLoadingDietPlan(false);
      return;
    }

    setLoadingDietPlan(true);
    const { data, error } = await supabase
      .from('client_diet_plans')
      .select('*')
      .eq('client_id', profile.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Erro ao carregar dieta profissional do cliente:', error);
      setAssignedDietPlan(null);
      setLoadingDietPlan(false);
      return;
    }

    if (!data || !isValidDietPlan(data.plan_data)) {
      setAssignedDietPlan(null);
      setLoadingDietPlan(false);
      return;
    }

    const professional = await fetchProfessionalSummary(data.professional_id);
    setAssignedDietPlan({
      id: data.id,
      title: data.title || 'Dieta personalizada',
      description: data.description || '',
      plan: data.plan_data,
      professional,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    });
    setLoadingDietPlan(false);
  }, [hasNutritionistPackage, isProfessionalAccount, profile?.id]);

  useEffect(() => {
    void loadAssignedWorkoutPlan();
  }, [loadAssignedWorkoutPlan]);

  useEffect(() => {
    void loadAssignedDietPlan();
  }, [loadAssignedDietPlan]);

  return {
    isProfessionalAccount,
    hasPersonalPackage,
    hasNutritionistPackage,
    assignedWorkoutPlan,
    assignedDietPlan,
    loadingWorkoutPlan,
    loadingDietPlan,
    refreshAssignedWorkoutPlan: loadAssignedWorkoutPlan,
    refreshAssignedDietPlan: loadAssignedDietPlan,
  };
}
