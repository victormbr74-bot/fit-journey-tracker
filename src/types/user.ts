export interface UserProfile {
  id: string;
  name: string;
  email: string;
  age: number;
  weight: number;
  height: number;
  goal: 'lose_weight' | 'gain_muscle' | 'maintain' | 'endurance';
  points: number;
  createdAt: Date;
}

export interface WeightEntry {
  date: Date;
  weight: number;
}

export interface RunSession {
  id: string;
  date: Date;
  duration: number; // in seconds
  distance: number; // in km
  avgSpeed: number; // km/h
  route: { lat: number; lng: number }[];
  calories: number;
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
