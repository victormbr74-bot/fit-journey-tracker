export interface Exercise {
  id: string;
  name: string;
  sets: number;
  reps: string;
  restSeconds: number;
  muscleGroup: string;
  icon: string;
}

export interface WorkoutDay {
  id: string;
  dayName: string;
  focus: string;
  exercises: Exercise[];
  estimatedMinutes: number;
}

export interface WorkoutPlan {
  id: string;
  name: string;
  description: string;
  daysPerWeek: number;
  days: WorkoutDay[];
  goal: string;
}

export interface MealItem {
  name: string;
  portion: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Meal {
  id: string;
  name: string;
  time: string;
  items: MealItem[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
}

export interface DietPlan {
  id: string;
  name: string;
  description: string;
  dailyCalories: number;
  bmr: number;
  tdee: number;
  deficit: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  meals: Meal[];
}
