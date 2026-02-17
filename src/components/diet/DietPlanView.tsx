import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DietPlan, Meal } from '@/types/workout';
import { useProfile } from '@/hooks/useProfile';
import { generateDietPlan } from '@/lib/dietGenerator';
import {
  DIET_COMPLETION_STORAGE_PREFIX,
  DIET_PLAN_STORAGE_PREFIX,
  HYDRATION_TRACKER_STORAGE_PREFIX,
} from '@/lib/storageKeys';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { 
  Utensils, 
  RotateCcw, 
  ChevronDown, 
  ChevronUp,
  Flame,
  Beef,
  Wheat,
  Droplets,
  Clock,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Minus,
  CheckCircle2,
  BellRing,
} from 'lucide-react';

const DIET_MEAL_COMPLETION_POINTS = 8;
const WATER_STEP_ML = 200;
const WATER_STEP_POINTS = 1;
const WATER_REMINDER_INTERVAL_MS = 75 * 60 * 1000;

type HydrationMode = 'auto' | 'manual';

interface DietCompletionState {
  date: string;
  completedMealIds: string[];
  awardedMealKeys: string[];
}

interface HydrationState {
  date: string;
  mode: HydrationMode;
  manualTargetLiters: number;
  targetMl: number;
  consumedMl: number;
}

const getTodayIsoDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeLiters = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return 2;
  return Math.min(8, Math.max(0.2, Math.round(value * 10) / 10));
};

const calculateAutoWaterLiters = (
  weight: number,
  age: number,
  trainingFrequency: number,
  goal: string
) => {
  const safeWeight = Number.isFinite(weight) && weight > 0 ? weight : 70;
  const safeAge = Number.isFinite(age) && age > 0 ? age : 30;
  const safeTrainingFrequency = Number.isFinite(trainingFrequency) && trainingFrequency > 0
    ? trainingFrequency
    : 3;

  let ml = safeWeight * 35;
  if (safeAge > 55) ml -= 200;
  if (safeAge < 25) ml += 100;
  ml += Math.min(7, safeTrainingFrequency) * 120;
  if (goal === 'gain_muscle') ml += 200;
  if (goal === 'lose_weight') ml += 100;

  const liters = ml / 1000;
  return normalizeLiters(Math.min(5, Math.max(1.5, liters)));
};

const createDefaultDietCompletionState = (date = getTodayIsoDate()): DietCompletionState => ({
  date,
  completedMealIds: [],
  awardedMealKeys: [],
});

const createDefaultHydrationState = (
  autoTargetLiters: number,
  date = getTodayIsoDate()
): HydrationState => {
  const normalizedTargetLiters = normalizeLiters(autoTargetLiters);
  return {
    date,
    mode: 'auto',
    manualTargetLiters: normalizedTargetLiters,
    targetMl: Math.round(normalizedTargetLiters * 1000),
    consumedMl: 0,
  };
};

function MacroBar({ label, value, max, color, icon: Icon }: { 
  label: string; 
  value: number; 
  max: number; 
  color: string;
  icon: React.ElementType;
}) {
  const percentage = Math.min((value / max) * 100, 100);
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${color}`} />
          <span className="font-medium">{label}</span>
        </div>
        <span className="text-muted-foreground">{value}g</span>
      </div>
      <Progress value={percentage} className="h-2" />
    </div>
  );
}

function MealCard({
  meal,
  isExpanded,
  isCompleted,
  onToggle,
  onToggleCompleted,
}: {
  meal: Meal;
  isExpanded: boolean;
  isCompleted: boolean;
  onToggle: () => void;
  onToggleCompleted: () => void;
}) {
  return (
    <Card className="overflow-hidden glass-card">
      <button 
        onClick={onToggle}
        className="w-full text-left"
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">{meal.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{meal.time}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={isCompleted ? 'default' : 'outline'} className="gap-1">
                <CheckCircle2 className="w-3 h-3" />
                {isCompleted ? 'Concluida' : 'Pendente'}
              </Badge>
              <Badge variant="secondary" className="flex items-center gap-1">
                <Flame className="w-3 h-3" />
                {meal.totalCalories} kcal
              </Badge>
              {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </div>
          </div>
        </CardHeader>
      </button>
      {isExpanded && (
        <CardContent className="pt-0">
          <div className="space-y-3">
            <Button
              type="button"
              variant={isCompleted ? 'secondary' : 'energy'}
              size="sm"
              className="gap-2"
              onClick={(event) => {
                event.stopPropagation();
                onToggleCompleted();
              }}
            >
              <CheckCircle2 className="w-4 h-4" />
              {isCompleted ? 'Refeicao concluida' : 'Marcar refeicao concluida'}
            </Button>
            {meal.items.map((item, idx) => (
              <div 
                key={idx} 
                className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
              >
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-muted-foreground">{item.portion}</p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-medium">{item.calories} kcal</p>
                  <p className="text-muted-foreground">
                    P: {item.protein}g | C: {item.carbs}g | G: {item.fat}g
                  </p>
                </div>
              </div>
            ))}
            
            {/* Meal Macros Summary */}
            <div className="pt-3 border-t border-border grid grid-cols-3 gap-4 text-center text-sm">
              <div>
                <p className="text-muted-foreground">Proteína</p>
                <p className="font-bold text-primary">{meal.totalProtein}g</p>
              </div>
              <div>
                <p className="text-muted-foreground">Carbos</p>
                <p className="font-bold text-warning">{meal.totalCarbs}g</p>
              </div>
              <div>
                <p className="text-muted-foreground">Gordura</p>
                <p className="font-bold text-info">{meal.totalFat}g</p>
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export function DietPlanView() {
  const { profile, loading, updateProfile } = useProfile();
  const [plan, setPlan] = useState<DietPlan | null>(null);
  const [expandedMeal, setExpandedMeal] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadedStorageKey, setLoadedStorageKey] = useState<string | null>(null);
  const [mealCompletionState, setMealCompletionState] = useState<DietCompletionState>(createDefaultDietCompletionState);
  const [hydrationState, setHydrationState] = useState<HydrationState>(() => createDefaultHydrationState(2));
  const profilePointsRef = useRef(profile?.points || 0);
  const reminderIntervalRef = useRef<number | null>(null);
  const profileId = profile?.id || '';

  const storageKey = useMemo(
    () => (profileId ? `${DIET_PLAN_STORAGE_PREFIX}${profileId}` : null),
    [profileId]
  );
  const completionStorageKey = useMemo(
    () => (profileId ? `${DIET_COMPLETION_STORAGE_PREFIX}${profileId}` : null),
    [profileId]
  );
  const hydrationStorageKey = useMemo(
    () => (profileId ? `${HYDRATION_TRACKER_STORAGE_PREFIX}${profileId}` : null),
    [profileId]
  );
  const autoTargetLiters = useMemo(
    () => calculateAutoWaterLiters(
      profile?.weight || 0,
      profile?.age || 0,
      profile?.training_frequency || 0,
      profile?.goal || 'maintain'
    ),
    [profile?.age, profile?.goal, profile?.training_frequency, profile?.weight]
  );

  useEffect(() => {
    profilePointsRef.current = profile?.points || 0;
  }, [profile?.points]);

  useEffect(() => {
    if (!storageKey) {
      setPlan(null);
      setExpandedMeal(null);
      setLoadedStorageKey(null);
      return;
    }

    const stored = window.localStorage.getItem(storageKey);

    if (!stored) {
      setPlan(null);
      setExpandedMeal(null);
      setLoadedStorageKey(storageKey);
      return;
    }

    try {
      const parsed = JSON.parse(stored) as DietPlan;

      if (!parsed || !Array.isArray(parsed.meals)) {
        window.localStorage.removeItem(storageKey);
        setPlan(null);
        setExpandedMeal(null);
        setLoadedStorageKey(storageKey);
        return;
      }

      setPlan(parsed);
      setExpandedMeal(parsed.meals[0]?.id || null);
    } catch (error) {
      console.error('Erro ao carregar dieta salva:', error);
      window.localStorage.removeItem(storageKey);
      setPlan(null);
      setExpandedMeal(null);
    }

    setLoadedStorageKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || loadedStorageKey !== storageKey) return;

    if (!plan) {
      window.localStorage.removeItem(storageKey);
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(plan));
  }, [plan, storageKey, loadedStorageKey]);

  useEffect(() => {
    if (!completionStorageKey) {
      setMealCompletionState(createDefaultDietCompletionState());
      return;
    }

    const today = getTodayIsoDate();
    const stored = window.localStorage.getItem(completionStorageKey);
    if (!stored) {
      setMealCompletionState(createDefaultDietCompletionState(today));
      return;
    }

    try {
      const parsed = JSON.parse(stored) as Partial<DietCompletionState>;
      const parsedDate = typeof parsed.date === 'string' ? parsed.date : today;
      if (parsedDate !== today) {
        setMealCompletionState(createDefaultDietCompletionState(today));
        return;
      }

      const completedMealIds = Array.isArray(parsed.completedMealIds)
        ? parsed.completedMealIds.filter((item): item is string => typeof item === 'string' && Boolean(item))
        : [];
      const awardedMealKeys = Array.isArray(parsed.awardedMealKeys)
        ? parsed.awardedMealKeys.filter((item): item is string => typeof item === 'string' && Boolean(item))
        : [];

      setMealCompletionState({
        date: today,
        completedMealIds: Array.from(new Set(completedMealIds)),
        awardedMealKeys: Array.from(new Set(awardedMealKeys)),
      });
    } catch (error) {
      console.error('Erro ao carregar status de refeicoes:', error);
      setMealCompletionState(createDefaultDietCompletionState(today));
    }
  }, [completionStorageKey]);

  useEffect(() => {
    if (!completionStorageKey) return;
    window.localStorage.setItem(completionStorageKey, JSON.stringify(mealCompletionState));
  }, [completionStorageKey, mealCompletionState]);

  useEffect(() => {
    if (!hydrationStorageKey) {
      setHydrationState(createDefaultHydrationState(autoTargetLiters));
      return;
    }

    const today = getTodayIsoDate();
    const stored = window.localStorage.getItem(hydrationStorageKey);
    if (!stored) {
      setHydrationState(createDefaultHydrationState(autoTargetLiters, today));
      return;
    }

    try {
      const parsed = JSON.parse(stored) as Partial<HydrationState>;
      const mode: HydrationMode = parsed.mode === 'manual' ? 'manual' : 'auto';
      const parsedDate = typeof parsed.date === 'string' ? parsed.date : today;
      if (parsedDate !== today) {
        setHydrationState(createDefaultHydrationState(autoTargetLiters, today));
        return;
      }

      const manualTargetLiters = normalizeLiters(Number(parsed.manualTargetLiters) || autoTargetLiters);
      const persistedTargetMl = Math.max(200, Math.round(Number(parsed.targetMl) || manualTargetLiters * 1000));
      const resolvedTargetMl = mode === 'auto'
        ? Math.round(autoTargetLiters * 1000)
        : persistedTargetMl;
      const consumedMl = Math.max(0, Math.round(Number(parsed.consumedMl) || 0));

      setHydrationState({
        date: today,
        mode,
        manualTargetLiters,
        targetMl: resolvedTargetMl,
        consumedMl,
      });
    } catch (error) {
      console.error('Erro ao carregar hidracao:', error);
      setHydrationState(createDefaultHydrationState(autoTargetLiters, today));
    }
  }, [hydrationStorageKey, autoTargetLiters]);

  useEffect(() => {
    if (!hydrationStorageKey) return;
    window.localStorage.setItem(hydrationStorageKey, JSON.stringify(hydrationState));
  }, [hydrationState, hydrationStorageKey]);

  useEffect(() => {
    if (!plan) return;
    const validMealIds = new Set(plan.meals.map((meal) => meal.id));
    setMealCompletionState((current) => {
      const nextCompletedMealIds = current.completedMealIds.filter((mealId) => validMealIds.has(mealId));
      const nextAwardedMealKeys = current.awardedMealKeys.filter((key) => {
        const [, mealId] = key.split(':');
        return validMealIds.has(mealId);
      });

      if (
        nextCompletedMealIds.length === current.completedMealIds.length &&
        nextAwardedMealKeys.length === current.awardedMealKeys.length
      ) {
        return current;
      }

      return {
        ...current,
        completedMealIds: nextCompletedMealIds,
        awardedMealKeys: nextAwardedMealKeys,
      };
    });
  }, [plan]);

  const applyPointsDelta = useCallback(
    async (delta: number, reason: string) => {
      if (!profile || !delta) return;

      const previousPoints = profilePointsRef.current;
      const nextPoints = Math.max(0, previousPoints + delta);
      profilePointsRef.current = nextPoints;

      const { data, error } = await updateProfile({ points: nextPoints });
      if (error) {
        profilePointsRef.current = profile.points || previousPoints;
        console.error('Erro ao atualizar pontuacao da dieta/hidratacao:', error);
        toast.error('Nao foi possivel atualizar sua pontuacao agora.');
        return;
      }

      profilePointsRef.current = data?.points || nextPoints;
      toast.success(`${reason}. +${delta} pts`);
    },
    [profile, updateProfile]
  );

  const handleToggleMealCompleted = (mealId: string) => {
    const today = getTodayIsoDate();
    let awardedNow = false;

    setMealCompletionState((current) => {
      const normalizedCurrent =
        current.date === today
          ? current
          : createDefaultDietCompletionState(today);

      const isCompleted = normalizedCurrent.completedMealIds.includes(mealId);
      if (isCompleted) {
        return {
          ...normalizedCurrent,
          completedMealIds: normalizedCurrent.completedMealIds.filter((id) => id !== mealId),
        };
      }

      const awardKey = `${today}:${mealId}`;
      const hasAwarded = normalizedCurrent.awardedMealKeys.includes(awardKey);
      if (!hasAwarded) {
        awardedNow = true;
      }
      return {
        ...normalizedCurrent,
        completedMealIds: [...normalizedCurrent.completedMealIds, mealId],
        awardedMealKeys: hasAwarded
          ? normalizedCurrent.awardedMealKeys
          : [...normalizedCurrent.awardedMealKeys, awardKey],
      };
    });

    if (awardedNow) {
      void applyPointsDelta(DIET_MEAL_COMPLETION_POINTS, 'Refeicao concluida');
    } else {
      toast.success('Refeicao marcada como concluida.');
    }
  };

  const handleHydrationModeChange = (mode: HydrationMode) => {
    const today = getTodayIsoDate();
    setHydrationState((current) => {
      const normalizedCurrent =
        current.date === today
          ? current
          : createDefaultHydrationState(autoTargetLiters, today);
      if (mode === 'auto') {
        const nextTargetMl = Math.round(autoTargetLiters * 1000);
        return {
          ...normalizedCurrent,
          mode: 'auto',
          targetMl: nextTargetMl,
        };
      }

      const nextManualTarget = normalizeLiters(normalizedCurrent.manualTargetLiters || autoTargetLiters);
      return {
        ...normalizedCurrent,
        mode: 'manual',
        manualTargetLiters: nextManualTarget,
        targetMl: Math.round(nextManualTarget * 1000),
      };
    });
  };

  const handleManualLitersChange = (value: string) => {
    const parsed = Number(value.replace(',', '.'));
    const normalized = normalizeLiters(parsed);
    const today = getTodayIsoDate();
    setHydrationState((current) => {
      const normalizedCurrent =
        current.date === today
          ? current
          : createDefaultHydrationState(autoTargetLiters, today);
      return {
        ...normalizedCurrent,
        mode: 'manual',
        manualTargetLiters: normalized,
        targetMl: Math.round(normalized * 1000),
      };
    });
  };

  const handleDrinkWaterStep = () => {
    const today = getTodayIsoDate();
    let awardedSteps = 0;

    setHydrationState((current) => {
      const normalizedCurrent =
        current.date === today
          ? current
          : createDefaultHydrationState(autoTargetLiters, today);
      const currentTargetMl = normalizedCurrent.targetMl;
      const remainingMl = Math.max(0, currentTargetMl - normalizedCurrent.consumedMl);
      if (remainingMl <= 0) return normalizedCurrent;

      const incrementMl = Math.min(WATER_STEP_ML, remainingMl);
      awardedSteps = Math.max(1, Math.round(incrementMl / WATER_STEP_ML));
      return {
        ...normalizedCurrent,
        consumedMl: normalizedCurrent.consumedMl + incrementMl,
      };
    });

    if (awardedSteps > 0) {
      void applyPointsDelta(WATER_STEP_POINTS * awardedSteps, 'Hidratacao registrada');
    }
  };

  useEffect(() => {
    if (!profile) return;
    if (reminderIntervalRef.current) {
      window.clearInterval(reminderIntervalRef.current);
      reminderIntervalRef.current = null;
    }

    reminderIntervalRef.current = window.setInterval(() => {
      setHydrationState((current) => {
        const today = getTodayIsoDate();
        const normalizedCurrent =
          current.date === today
            ? current
            : createDefaultHydrationState(autoTargetLiters, today);
        if (normalizedCurrent.consumedMl >= normalizedCurrent.targetMl) {
          return normalizedCurrent;
        }

        toast.info('Hora de beber 200 ml de agua.');
        if (typeof window !== 'undefined' && 'Notification' in window) {
          if (Notification.permission === 'granted') {
            new Notification('SouFit - Hidratacao', {
              body: 'Registre 200 ml de agua para manter seu ritmo.',
            });
          } else if (Notification.permission === 'default') {
            void Notification.requestPermission();
          }
        }
        return normalizedCurrent;
      });
    }, WATER_REMINDER_INTERVAL_MS);

    return () => {
      if (reminderIntervalRef.current) {
        window.clearInterval(reminderIntervalRef.current);
        reminderIntervalRef.current = null;
      }
    };
  }, [autoTargetLiters, profile]);

  const handleGenerate = () => {
    if (!profile) return;
    setIsGenerating(true);
    
    setTimeout(() => {
      const newPlan = generateDietPlan({
        weight: profile.weight,
        height: profile.height,
        age: profile.age,
        goal: profile.goal,
      });
      setPlan(newPlan);
      setExpandedMeal(newPlan.meals[0]?.id || null);
      setIsGenerating(false);
    }, 800);
  };

  const handleRegenerate = () => {
    setPlan(null);
    handleGenerate();
  };

  if (loading || (storageKey !== null && loadedStorageKey !== storageKey)) {
    return (
      <div className="pb-24 md:pb-8 space-y-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!profile) return null;

  if (!plan) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 pb-24 md:pb-8">
        <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-6">
          <Utensils className="w-12 h-12 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-2 text-center">Dieta Personalizada</h2>
        <p className="text-muted-foreground text-center mb-6 max-w-md">
          Gere um plano alimentar baseado no seu perfil, peso ({profile.weight}kg), 
          altura ({profile.height}cm) e objetivo
        </p>
        <Button 
          variant="energy" 
          size="lg" 
          onClick={handleGenerate}
          disabled={isGenerating}
          className="gap-2"
        >
          <Sparkles className="w-5 h-5" />
          {isGenerating ? 'Calculando...' : 'Gerar Dieta'}
        </Button>
      </div>
    );
  }

  const DeficitIcon = plan.deficit > 0 ? TrendingDown : plan.deficit < 0 ? TrendingUp : Minus;
  const deficitLabel = plan.deficit > 0 ? 'Déficit' : plan.deficit < 0 ? 'Superávit' : 'Manutenção';
  const deficitColor = plan.deficit > 0 ? 'text-success' : plan.deficit < 0 ? 'text-warning' : 'text-muted-foreground';
  const hydrationTargetMl = hydrationState.targetMl;
  const hydrationConsumedMl = hydrationState.consumedMl;
  const hydrationRemainingMl = Math.max(0, hydrationTargetMl - hydrationConsumedMl);
  const hydrationProgress = hydrationTargetMl > 0
    ? Math.min(100, (hydrationConsumedMl / hydrationTargetMl) * 100)
    : 0;
  const completedMealsCount = mealCompletionState.completedMealIds.length;

  return (
    <div className="space-y-6 pb-24 md:pb-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold gradient-text">{plan.name}</h1>
          <p className="text-muted-foreground text-sm mt-1">{plan.description}</p>
        </div>
        <Button variant="outline" onClick={handleRegenerate} className="gap-2 shrink-0">
          <RotateCcw className="w-4 h-4" />
          Gerar Nova
        </Button>
      </div>

      {/* Calorie Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 glass-card">
          <p className="text-sm text-muted-foreground">TMB</p>
          <p className="text-xl font-bold">{plan.bmr} kcal</p>
        </Card>
        <Card className="p-4 glass-card">
          <p className="text-sm text-muted-foreground">TDEE</p>
          <p className="text-xl font-bold">{plan.tdee} kcal</p>
        </Card>
        <Card className="p-4 glass-card">
          <p className="text-sm text-muted-foreground">{deficitLabel}</p>
          <div className="flex items-center gap-2">
            <DeficitIcon className={`w-5 h-5 ${deficitColor}`} />
            <p className="text-xl font-bold">{Math.abs(plan.deficit)} kcal</p>
          </div>
        </Card>
        <Card className="p-4 glass-card bg-primary/5 border-primary/20">
          <p className="text-sm text-muted-foreground">Meta Diária</p>
          <p className="text-xl font-bold text-primary">{plan.dailyCalories} kcal</p>
        </Card>
      </div>

      {/* Macros */}
      <Card className="p-4 glass-card">
        <CardHeader className="px-0 pt-0">
          <CardTitle className="text-lg">Macronutrientes</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0 space-y-4">
          <MacroBar 
            label="Proteína" 
            value={plan.proteinGrams} 
            max={plan.proteinGrams + 50} 
            color="text-primary"
            icon={Beef}
          />
          <MacroBar 
            label="Carboidratos" 
            value={plan.carbsGrams} 
            max={plan.carbsGrams + 50} 
            color="text-warning"
            icon={Wheat}
          />
          <MacroBar 
            label="Gorduras" 
            value={plan.fatGrams} 
            max={plan.fatGrams + 30} 
            color="text-info"
            icon={Droplets}
          />
        </CardContent>
      </Card>

      <Card className="p-4 glass-card border-primary/20 bg-primary/5">
        <CardHeader className="px-0 pt-0">
          <CardTitle className="text-lg flex items-center gap-2">
            <Droplets className="w-5 h-5 text-primary" />
            Hidratacao diaria
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={hydrationState.mode === 'auto' ? 'energy' : 'outline'}
              className="gap-2"
              onClick={() => handleHydrationModeChange('auto')}
            >
              <BellRing className="w-4 h-4" />
              Meta automatica
            </Button>
            <Button
              type="button"
              size="sm"
              variant={hydrationState.mode === 'manual' ? 'energy' : 'outline'}
              className="gap-2"
              onClick={() => handleHydrationModeChange('manual')}
            >
              Definir litros
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Meta diaria de agua (litros)</p>
              <Input
                type="number"
                min="0.2"
                max="8"
                step="0.1"
                value={(hydrationState.targetMl / 1000).toFixed(1)}
                disabled={hydrationState.mode !== 'manual'}
                onChange={(event) => handleManualLitersChange(event.target.value)}
              />
              {hydrationState.mode === 'auto' && (
                <p className="text-xs text-muted-foreground">
                  Meta gerada pelo sistema com base nos seus dados: {autoTargetLiters.toFixed(1)} L
                </p>
              )}
            </div>
            <div className="rounded-lg border border-border/60 bg-background/70 p-3">
              <p className="text-xs text-muted-foreground">Consumido hoje</p>
              <p className="text-2xl font-semibold">
                {(hydrationConsumedMl / 1000).toFixed(1)} L / {(hydrationTargetMl / 1000).toFixed(1)} L
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Faltam {(hydrationRemainingMl / 1000).toFixed(1)} L
              </p>
            </div>
          </div>

          <Progress value={hydrationProgress} className="h-2" />

          <Button
            type="button"
            variant="energy"
            className="gap-2"
            onClick={handleDrinkWaterStep}
            disabled={hydrationRemainingMl <= 0}
          >
            <Droplets className="w-4 h-4" />
            {hydrationRemainingMl <= 0 ? 'Meta de agua concluida' : 'Marcar 200 ml consumidos'}
          </Button>
        </CardContent>
      </Card>

      {/* Meals */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Utensils className="w-5 h-5 text-primary" />
          Refeicoes
          <Badge variant="outline" className="ml-1">
            {completedMealsCount}/{plan.meals.length} concluidas
          </Badge>
        </h2>
        <div className="space-y-3">
          {plan.meals.map((meal) => (
            <MealCard
              key={meal.id}
              meal={meal}
              isExpanded={expandedMeal === meal.id}
              isCompleted={mealCompletionState.completedMealIds.includes(meal.id)}
              onToggle={() => setExpandedMeal(expandedMeal === meal.id ? null : meal.id)}
              onToggleCompleted={() => handleToggleMealCompleted(meal.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
