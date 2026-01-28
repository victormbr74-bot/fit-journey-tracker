import { DietPlan, Meal, MealItem } from '@/types/workout';
import { UserProfile } from '@/types/user';

// Calculate BMR using Mifflin-St Jeor Equation
function calculateBMR(weight: number, height: number, age: number, isMale: boolean = true): number {
  if (isMale) {
    return (10 * weight) + (6.25 * height) - (5 * age) + 5;
  }
  return (10 * weight) + (6.25 * height) - (5 * age) - 161;
}

// Calculate TDEE based on activity level
function calculateTDEE(bmr: number, activityMultiplier: number = 1.55): number {
  return bmr * activityMultiplier;
}

const mealDatabase: Record<string, MealItem[]> = {
  breakfast: [
    { name: 'Ovos Mexidos', portion: '3 unidades', calories: 210, protein: 18, carbs: 2, fat: 15 },
    { name: 'Pão Integral', portion: '2 fatias', calories: 140, protein: 6, carbs: 24, fat: 2 },
    { name: 'Aveia', portion: '50g', calories: 195, protein: 7, carbs: 34, fat: 4 },
    { name: 'Banana', portion: '1 unidade', calories: 105, protein: 1, carbs: 27, fat: 0 },
    { name: 'Iogurte Grego', portion: '170g', calories: 100, protein: 17, carbs: 6, fat: 0 },
    { name: 'Whey Protein', portion: '30g', calories: 120, protein: 24, carbs: 3, fat: 1 },
    { name: 'Tapioca', portion: '2 unidades', calories: 140, protein: 0, carbs: 34, fat: 0 },
    { name: 'Queijo Cottage', portion: '100g', calories: 98, protein: 11, carbs: 3, fat: 4 },
  ],
  lunch: [
    { name: 'Frango Grelhado', portion: '150g', calories: 165, protein: 31, carbs: 0, fat: 4 },
    { name: 'Arroz Integral', portion: '100g', calories: 130, protein: 3, carbs: 28, fat: 1 },
    { name: 'Feijão', portion: '100g', calories: 127, protein: 9, carbs: 23, fat: 0 },
    { name: 'Brócolis', portion: '100g', calories: 34, protein: 3, carbs: 7, fat: 0 },
    { name: 'Batata Doce', portion: '150g', calories: 129, protein: 2, carbs: 30, fat: 0 },
    { name: 'Salmão', portion: '150g', calories: 280, protein: 30, carbs: 0, fat: 17 },
    { name: 'Carne Magra', portion: '150g', calories: 250, protein: 26, carbs: 0, fat: 15 },
    { name: 'Salada Verde', portion: '100g', calories: 20, protein: 2, carbs: 3, fat: 0 },
  ],
  snack: [
    { name: 'Castanhas', portion: '30g', calories: 185, protein: 4, carbs: 4, fat: 18 },
    { name: 'Maçã', portion: '1 unidade', calories: 95, protein: 0, carbs: 25, fat: 0 },
    { name: 'Shake Proteico', portion: '1 dose', calories: 150, protein: 25, carbs: 5, fat: 3 },
    { name: 'Pasta de Amendoim', portion: '2 colheres', calories: 190, protein: 7, carbs: 6, fat: 16 },
    { name: 'Queijo Branco', portion: '50g', calories: 70, protein: 7, carbs: 1, fat: 4 },
    { name: 'Ovo Cozido', portion: '2 unidades', calories: 140, protein: 12, carbs: 1, fat: 10 },
  ],
  dinner: [
    { name: 'Tilápia Grelhada', portion: '150g', calories: 165, protein: 34, carbs: 0, fat: 3 },
    { name: 'Legumes Salteados', portion: '150g', calories: 70, protein: 3, carbs: 14, fat: 1 },
    { name: 'Omelete', portion: '3 ovos', calories: 280, protein: 21, carbs: 2, fat: 21 },
    { name: 'Sopa de Legumes', portion: '300ml', calories: 120, protein: 5, carbs: 20, fat: 2 },
    { name: 'Frango Desfiado', portion: '150g', calories: 165, protein: 31, carbs: 0, fat: 4 },
    { name: 'Quinoa', portion: '100g', calories: 120, protein: 4, carbs: 21, fat: 2 },
  ],
};

function selectMeals(category: string, targetCalories: number, items: MealItem[]): MealItem[] {
  const selected: MealItem[] = [];
  let currentCalories = 0;
  const shuffled = [...items].sort(() => Math.random() - 0.5);

  for (const item of shuffled) {
    if (currentCalories + item.calories <= targetCalories * 1.1) {
      selected.push(item);
      currentCalories += item.calories;
    }
    if (currentCalories >= targetCalories * 0.9) break;
  }

  return selected;
}

function createMeal(name: string, time: string, items: MealItem[]): Meal {
  return {
    id: crypto.randomUUID(),
    name,
    time,
    items,
    totalCalories: items.reduce((sum, item) => sum + item.calories, 0),
    totalProtein: items.reduce((sum, item) => sum + item.protein, 0),
    totalCarbs: items.reduce((sum, item) => sum + item.carbs, 0),
    totalFat: items.reduce((sum, item) => sum + item.fat, 0),
  };
}

export function generateDietPlan(user: UserProfile): DietPlan {
  const bmr = calculateBMR(user.weight, user.height, user.age);
  const tdee = calculateTDEE(bmr);
  
  let dailyCalories: number;
  let deficit: number;
  let description: string;
  let name: string;
  let proteinMultiplier: number;

  switch (user.goal) {
    case 'lose_weight':
      deficit = 500; // 500 kcal deficit for ~0.5kg/week loss
      dailyCalories = tdee - deficit;
      name = 'Dieta Déficit Calórico';
      description = `Plano alimentar com déficit de ${deficit} kcal para perda de peso saudável. Meta: ~0.5kg por semana.`;
      proteinMultiplier = 2.0; // Higher protein to preserve muscle
      break;
    case 'gain_muscle':
      deficit = -300; // 300 kcal surplus
      dailyCalories = tdee - deficit;
      name = 'Dieta Superávit Calórico';
      description = `Plano alimentar com superávit de ${Math.abs(deficit)} kcal para ganho de massa muscular.`;
      proteinMultiplier = 2.2;
      break;
    case 'maintain':
      deficit = 0;
      dailyCalories = tdee;
      name = 'Dieta Manutenção';
      description = 'Plano alimentar balanceado para manter o peso atual.';
      proteinMultiplier = 1.8;
      break;
    case 'endurance':
      deficit = -200; // Small surplus for energy
      dailyCalories = tdee - deficit;
      name = 'Dieta Performance';
      description = 'Plano alimentar focado em energia e recuperação para atletas de endurance.';
      proteinMultiplier = 1.6;
      break;
    default:
      deficit = 0;
      dailyCalories = tdee;
      name = 'Dieta Balanceada';
      description = 'Plano alimentar balanceado.';
      proteinMultiplier = 1.8;
  }

  // Calculate macros
  const proteinGrams = Math.round(user.weight * proteinMultiplier);
  const proteinCalories = proteinGrams * 4;
  const fatCalories = dailyCalories * 0.25;
  const fatGrams = Math.round(fatCalories / 9);
  const carbCalories = dailyCalories - proteinCalories - fatCalories;
  const carbsGrams = Math.round(carbCalories / 4);

  // Distribute calories across meals
  const breakfastCals = dailyCalories * 0.25;
  const lunchCals = dailyCalories * 0.35;
  const snackCals = dailyCalories * 0.15;
  const dinnerCals = dailyCalories * 0.25;

  const meals: Meal[] = [
    createMeal('Café da Manhã', '07:00', selectMeals('breakfast', breakfastCals, mealDatabase.breakfast)),
    createMeal('Almoço', '12:00', selectMeals('lunch', lunchCals, mealDatabase.lunch)),
    createMeal('Lanche', '16:00', selectMeals('snack', snackCals, mealDatabase.snack)),
    createMeal('Jantar', '20:00', selectMeals('dinner', dinnerCals, mealDatabase.dinner)),
  ];

  return {
    id: crypto.randomUUID(),
    name,
    description,
    dailyCalories: Math.round(dailyCalories),
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    deficit,
    proteinGrams,
    carbsGrams,
    fatGrams,
    meals,
  };
}
