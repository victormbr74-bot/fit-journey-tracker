export interface User {
  id: string;
  email: string;
  name: string;
}

export type ProfileType = 'client' | 'personal_trainer' | 'nutritionist';

export const PROFILE_TYPES: Array<{ id: ProfileType; label: string; description: string }> = [
  {
    id: 'client',
    label: 'Cliente',
    description: 'Acompanha treinos e dietas recebidas',
  },
  {
    id: 'personal_trainer',
    label: 'Personal Trainer',
    description: 'Cria e gerencia treinos personalizados para clientes',
  },
  {
    id: 'nutritionist',
    label: 'Nutricionista',
    description: 'Cria e gerencia dietas personalizadas para clientes',
  },
];

export const isProfileType = (value: unknown): value is ProfileType =>
  value === 'client' || value === 'personal_trainer' || value === 'nutritionist';

export interface UserProfile {
  id: string;
  name: string;
  handle: string;
  email: string;
  profile_type: ProfileType;
  has_personal_package: boolean;
  has_nutritionist_package: boolean;
  phone?: string;
  birthdate: string; // ISO date string
  age: number;
  weight: number;
  height: number;
  goal: 'lose_weight' | 'gain_muscle' | 'maintain' | 'endurance';
  muscle_groups: string[];
  training_frequency: number;
  points: number;
  spotify_playlist?: string;
  youtube_playlist?: string;
  created_at?: string;
  updated_at?: string;
}

export interface WeightEntry {
  id?: string;
  user_id?: string;
  date: Date;
  weight: number;
  recorded_at?: string;
}

export interface RunSession {
  id: string;
  user_id?: string;
  date: Date;
  duration: number; // in seconds
  distance: number; // in km
  avgSpeed: number; // km/h
  route: { lat: number; lng: number }[];
  calories: number;
  recorded_at?: string;
}

export interface Challenge {
  id: string;
  name: string;
  description: string;
  challenge_type: 'daily' | 'weekly';
  points_awarded: number;
  points_deducted: number;
  icon: string;
  target_value: number;
  category: string;
  is_active: boolean;
}

export interface UserChallengeProgress {
  id: string;
  user_id: string;
  challenge_id: string;
  current_value: number;
  is_completed: boolean;
  completed_at?: string;
  assigned_date: string;
  challenge?: Challenge;
}

export type Goal = {
  id: 'lose_weight' | 'gain_muscle' | 'maintain' | 'endurance';
  label: string;
  icon: string;
};

export const GOALS: Goal[] = [
  { id: 'lose_weight', label: 'Perder Peso', icon: '🔥' },
  { id: 'gain_muscle', label: 'Ganhar Massa', icon: '💪' },
  { id: 'maintain', label: 'Manter Forma', icon: '⚖️' },
  { id: 'endurance', label: 'Resistência', icon: '🏃' },
];

export const MUSCLE_GROUPS = [
  { id: 'chest', label: 'Peito', icon: '💪' },
  { id: 'back', label: 'Costas', icon: '🔙' },
  { id: 'legs', label: 'Pernas', icon: '🦵' },
  { id: 'shoulders', label: 'Ombros', icon: '🏋️' },
  { id: 'arms', label: 'Braços', icon: '💪' },
  { id: 'core', label: 'Abdômen', icon: '🏆' },
  { id: 'glutes', label: 'Glúteos', icon: '🍑' },
];
