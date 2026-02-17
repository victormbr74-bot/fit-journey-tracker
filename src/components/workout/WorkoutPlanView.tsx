import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WorkoutPlan, WorkoutDay, Exercise } from '@/types/workout';
import { useProfile } from '@/hooks/useProfile';
import { generateWorkoutPlan } from '@/lib/workoutGenerator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ExerciseVideo } from './ExerciseVideo';
import { MusicPlayer } from './MusicPlayer';
import { toast } from 'sonner';
import {
  WORKOUT_COMPLETION_STORAGE_PREFIX,
  WORKOUT_PLAN_STORAGE_PREFIX,
} from '@/lib/storageKeys';
import {
  Dumbbell,
  Clock,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Calendar,
  Target,
  Sparkles,
  Plus,
  CheckCircle2,
  Pencil,
  Trash2,
} from 'lucide-react';

interface DayFormState {
  dayName: string;
  focus: string;
  estimatedMinutes: string;
}

interface ExerciseFormState {
  dayId: string;
  name: string;
  sets: string;
  reps: string;
  restSeconds: string;
  muscleGroup: string;
  icon: string;
}

const DEFAULT_DAY_FORM: DayFormState = {
  dayName: '',
  focus: '',
  estimatedMinutes: '45',
};

const buildDefaultExerciseForm = (dayId = ''): ExerciseFormState => ({
  dayId,
  name: '',
  sets: '3',
  reps: '10-12',
  restSeconds: '60',
  muscleGroup: 'Personalizado',
  icon: '🏋️',
});

const parseNumber = (value: string, fallback: number): number => {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getTodayIsoDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const WORKOUT_DAY_COMPLETION_POINTS = 20;

interface WorkoutCompletionState {
  date: string;
  completedDayIds: string[];
  awardedDayKeys: string[];
}

const createDefaultCompletionState = (date = getTodayIsoDate()): WorkoutCompletionState => ({
  date,
  completedDayIds: [],
  awardedDayKeys: [],
});

const getGoalLabel = (goal: string): string => {
  if (goal === 'lose_weight') return 'Perder Peso';
  if (goal === 'gain_muscle') return 'Ganhar Massa';
  if (goal === 'endurance') return 'Resistência';
  return 'Manter Forma';
};

const createManualPlan = (name: string, goal: WorkoutPlan['goal']): WorkoutPlan => {
  const firstDayId = crypto.randomUUID();

  return {
    id: crypto.randomUUID(),
    name: 'Meu Treino Personalizado',
    description: `Plano personalizado criado por ${name}.`,
    daysPerWeek: 1,
    goal,
    days: [
      {
        id: firstDayId,
        dayName: 'Treino 1',
        focus: 'Personalizado',
        estimatedMinutes: 45,
        exercises: [],
      },
    ],
  };
};

function ExerciseCard({
  exercise,
  onEdit,
  onDelete,
}: {
  exercise: Exercise;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
      <div className="text-2xl">{exercise.icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium truncate">{exercise.name}</p>
          <ExerciseVideo exerciseName={exercise.name} compact />
        </div>
        <p className="text-sm text-muted-foreground">{exercise.muscleGroup}</p>
      </div>
      <div className="text-right text-sm shrink-0">
        <p className="font-medium">
          {exercise.sets}x {exercise.reps}
        </p>
        {exercise.restSeconds > 0 && (
          <p className="text-muted-foreground">{exercise.restSeconds}s descanso</p>
        )}
        <div className="flex items-center justify-end gap-1 mt-2">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function DayCard({
  day,
  isExpanded,
  isCompleted,
  onToggle,
  onToggleCompleted,
  onAddExercise,
  onEditDay,
  onDeleteDay,
  onEditExercise,
  onDeleteExercise,
}: {
  day: WorkoutDay;
  isExpanded: boolean;
  isCompleted: boolean;
  onToggle: () => void;
  onToggleCompleted: () => void;
  onAddExercise: () => void;
  onEditDay: () => void;
  onDeleteDay: () => void;
  onEditExercise: (index: number) => void;
  onDeleteExercise: (index: number) => void;
}) {
  return (
    <Card className="overflow-hidden glass-card">
      <button onClick={onToggle} className="w-full text-left">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">{day.dayName}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{day.focus}</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={isCompleted ? 'default' : 'outline'} className="gap-1">
                <CheckCircle2 className="w-3 h-3" />
                {isCompleted ? 'Concluido' : 'Pendente'}
              </Badge>
              <Badge variant="secondary" className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {day.estimatedMinutes}min
              </Badge>
              {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </div>
          </div>
        </CardHeader>
      </button>
      {isExpanded && (
        <CardContent className="pt-0 space-y-3">
          <div className="flex flex-wrap gap-2">
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
              {isCompleted ? 'Treino concluido' : 'Marcar concluido'}
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={onAddExercise}>
              <Plus className="w-4 h-4" />
              Adicionar Exercício
            </Button>
            <Button type="button" variant="ghost" size="sm" className="gap-2" onClick={onEditDay}>
              <Pencil className="w-4 h-4" />
              Editar Treino
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-2 text-destructive hover:text-destructive"
              onClick={onDeleteDay}
            >
              <Trash2 className="w-4 h-4" />
              Remover Treino
            </Button>
          </div>

          {day.exercises.length === 0 ? (
            <p className="text-sm text-muted-foreground py-3 text-center bg-secondary/20 rounded-lg">
              Nenhum exercício cadastrado nesse treino.
            </p>
          ) : (
            <div className="space-y-2">
              {day.exercises.map((exercise, idx) => (
                <ExerciseCard
                  key={`${exercise.id}-${idx}`}
                  exercise={exercise}
                  onEdit={() => onEditExercise(idx)}
                  onDelete={() => onDeleteExercise(idx)}
                />
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export function WorkoutPlanView() {
  const { profile, loading, updateProfile } = useProfile();
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadedStorageKey, setLoadedStorageKey] = useState<string | null>(null);
  const [completionState, setCompletionState] = useState<WorkoutCompletionState>(createDefaultCompletionState);

  const [isDayDialogOpen, setIsDayDialogOpen] = useState(false);
  const [editingDayId, setEditingDayId] = useState<string | null>(null);
  const [dayForm, setDayForm] = useState<DayFormState>(DEFAULT_DAY_FORM);

  const [isExerciseDialogOpen, setIsExerciseDialogOpen] = useState(false);
  const [editingExerciseIndex, setEditingExerciseIndex] = useState<number | null>(null);
  const [exerciseForm, setExerciseForm] = useState<ExerciseFormState>(buildDefaultExerciseForm());
  const profilePointsRef = useRef(profile?.points || 0);
  const profileId = profile?.id || '';

  const storageKey = useMemo(
    () => (profileId ? `${WORKOUT_PLAN_STORAGE_PREFIX}${profileId}` : null),
    [profileId]
  );
  const completionStorageKey = useMemo(
    () => (profileId ? `${WORKOUT_COMPLETION_STORAGE_PREFIX}${profileId}` : null),
    [profileId]
  );

  useEffect(() => {
    profilePointsRef.current = profile?.points || 0;
  }, [profile?.points]);

  useEffect(() => {
    if (!completionStorageKey) {
      setCompletionState(createDefaultCompletionState());
      return;
    }

    const today = getTodayIsoDate();
    const stored = window.localStorage.getItem(completionStorageKey);
    if (!stored) {
      setCompletionState(createDefaultCompletionState(today));
      return;
    }

    try {
      const parsed = JSON.parse(stored) as Partial<WorkoutCompletionState>;
      const storedDate = typeof parsed.date === 'string' ? parsed.date : today;
      if (storedDate !== today) {
        setCompletionState(createDefaultCompletionState(today));
        return;
      }

      const completedDayIds = Array.isArray(parsed.completedDayIds)
        ? parsed.completedDayIds.filter((item): item is string => typeof item === 'string' && Boolean(item))
        : [];
      const awardedDayKeys = Array.isArray(parsed.awardedDayKeys)
        ? parsed.awardedDayKeys.filter((item): item is string => typeof item === 'string' && Boolean(item))
        : [];
      setCompletionState({
        date: today,
        completedDayIds: Array.from(new Set(completedDayIds)),
        awardedDayKeys: Array.from(new Set(awardedDayKeys)),
      });
    } catch (error) {
      console.error('Erro ao carregar progresso de treino:', error);
      setCompletionState(createDefaultCompletionState(today));
    }
  }, [completionStorageKey]);

  useEffect(() => {
    if (!completionStorageKey) return;
    window.localStorage.setItem(completionStorageKey, JSON.stringify(completionState));
  }, [completionState, completionStorageKey]);

  useEffect(() => {
    if (!storageKey) {
      setPlan(null);
      setExpandedDay(null);
      setLoadedStorageKey(null);
      return;
    }

    const stored = window.localStorage.getItem(storageKey);

    if (!stored) {
      setPlan(null);
      setExpandedDay(null);
      setLoadedStorageKey(storageKey);
      return;
    }

    try {
      const parsed = JSON.parse(stored) as WorkoutPlan;

      if (!parsed || !Array.isArray(parsed.days)) {
        window.localStorage.removeItem(storageKey);
        setPlan(null);
        setExpandedDay(null);
        setLoadedStorageKey(storageKey);
        return;
      }

      setPlan(parsed);
      setExpandedDay(parsed.days[0]?.id || null);
    } catch (error) {
      console.error('Erro ao carregar treino salvo:', error);
      window.localStorage.removeItem(storageKey);
      setPlan(null);
      setExpandedDay(null);
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
    if (!plan) {
      if (expandedDay !== null) {
        setExpandedDay(null);
      }
      return;
    }

    if (!expandedDay || !plan.days.some((day) => day.id === expandedDay)) {
      setExpandedDay(plan.days[0]?.id || null);
    }
  }, [plan, expandedDay]);

  useEffect(() => {
    if (!plan) return;
    const validDayIds = new Set(plan.days.map((day) => day.id));
    setCompletionState((current) => {
      const nextCompletedDayIds = current.completedDayIds.filter((dayId) => validDayIds.has(dayId));
      const nextAwardedDayKeys = current.awardedDayKeys.filter((key) => {
        const [, dayId] = key.split(':');
        return validDayIds.has(dayId);
      });

      if (
        nextCompletedDayIds.length === current.completedDayIds.length &&
        nextAwardedDayKeys.length === current.awardedDayKeys.length
      ) {
        return current;
      }

      return {
        ...current,
        completedDayIds: nextCompletedDayIds,
        awardedDayKeys: nextAwardedDayKeys,
      };
    });
  }, [plan]);

  const applyWorkoutPoints = useCallback(
    async (delta: number, reason: string) => {
      if (!profile || !delta) return;

      const previousPoints = profilePointsRef.current;
      const nextPoints = Math.max(0, previousPoints + delta);
      profilePointsRef.current = nextPoints;

      const { data, error } = await updateProfile({ points: nextPoints });
      if (error) {
        profilePointsRef.current = profile.points || previousPoints;
        console.error('Erro ao atualizar pontuacao do treino:', error);
        toast.error('Nao foi possivel atualizar sua pontuacao agora.');
        return;
      }

      profilePointsRef.current = data?.points || nextPoints;
      if (delta > 0) {
        toast.success(`${reason}. +${delta} pts`);
      } else {
        toast.info(`${reason}. ${delta} pts`);
      }
    },
    [profile, updateProfile]
  );

  const handleToggleDayCompleted = (dayId: string) => {
    const today = getTodayIsoDate();
    let awardedNow = false;

    setCompletionState((current) => {
      const normalizedCurrent =
        current.date === today
          ? current
          : createDefaultCompletionState(today);
      const isCompleted = normalizedCurrent.completedDayIds.includes(dayId);
      if (isCompleted) {
        return {
          ...normalizedCurrent,
          completedDayIds: normalizedCurrent.completedDayIds.filter((id) => id !== dayId),
        };
      }

      const awardKey = `${today}:${dayId}`;
      const hasAwarded = normalizedCurrent.awardedDayKeys.includes(awardKey);
      if (!hasAwarded) {
        awardedNow = true;
      }
      return {
        ...normalizedCurrent,
        completedDayIds: [...normalizedCurrent.completedDayIds, dayId],
        awardedDayKeys: hasAwarded
          ? normalizedCurrent.awardedDayKeys
          : [...normalizedCurrent.awardedDayKeys, awardKey],
      };
    });

    if (awardedNow) {
      void applyWorkoutPoints(WORKOUT_DAY_COMPLETION_POINTS, 'Treino concluido');
    } else {
      toast.success('Treino marcado como concluido.');
    }
  };

  const handleGenerate = () => {
    if (!profile) return;

    setIsGenerating(true);

    const userForGenerator = {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      age: profile.age,
      weight: profile.weight,
      height: profile.height,
      goal: profile.goal,
      points: profile.points,
      createdAt: new Date(profile.created_at || new Date()),
    };

    window.setTimeout(() => {
      const newPlan = generateWorkoutPlan(userForGenerator);
      setPlan(newPlan);
      setExpandedDay(newPlan.days[0]?.id || null);
      setIsGenerating(false);
      toast.success('Treino do sistema gerado com sucesso.');
    }, 800);
  };

  const handleRegenerate = () => {
    setPlan(null);
    handleGenerate();
  };

  const handleCreateManualPlan = () => {
    if (!profile) return;

    const manualPlan = createManualPlan(profile.name, profile.goal);
    setPlan(manualPlan);
    setExpandedDay(manualPlan.days[0]?.id || null);
    toast.success('Treino manual criado.');
  };

  const openAddDayDialog = () => {
    if (!plan) return;

    setEditingDayId(null);
    setDayForm({
      dayName: `Treino ${plan.days.length + 1}`,
      focus: 'Personalizado',
      estimatedMinutes: '45',
    });
    setIsDayDialogOpen(true);
  };

  const openEditDayDialog = (day: WorkoutDay) => {
    setEditingDayId(day.id);
    setDayForm({
      dayName: day.dayName,
      focus: day.focus,
      estimatedMinutes: String(day.estimatedMinutes),
    });
    setIsDayDialogOpen(true);
  };

  const closeDayDialog = () => {
    setIsDayDialogOpen(false);
    setEditingDayId(null);
    setDayForm(DEFAULT_DAY_FORM);
  };

  const handleDaySubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!plan) return;

    const dayName = dayForm.dayName.trim();
    const focus = dayForm.focus.trim();
    const estimatedMinutes = Math.max(1, Math.round(parseNumber(dayForm.estimatedMinutes, 45)));

    if (!dayName || !focus) {
      toast.error('Preencha nome e foco do treino.');
      return;
    }

    const targetDayId = editingDayId || crypto.randomUUID();

    setPlan((current) => {
      if (!current) return current;

      let nextDays: WorkoutDay[];

      if (editingDayId) {
        nextDays = current.days.map((day) =>
          day.id === editingDayId
            ? {
                ...day,
                dayName,
                focus,
                estimatedMinutes,
              }
            : day
        );
      } else {
        nextDays = [
          ...current.days,
          {
            id: targetDayId,
            dayName,
            focus,
            estimatedMinutes,
            exercises: [],
          },
        ];
      }

      return {
        ...current,
        days: nextDays,
        daysPerWeek: nextDays.length,
      };
    });

    setExpandedDay(targetDayId);
    closeDayDialog();
    toast.success(editingDayId ? 'Treino atualizado.' : 'Treino adicionado.');
  };

  const handleDeleteDay = (dayId: string) => {
    const confirmed = window.confirm('Deseja remover este treino?');
    if (!confirmed) return;

    setPlan((current) => {
      if (!current) return current;

      const nextDays = current.days.filter((day) => day.id !== dayId);

      return {
        ...current,
        days: nextDays,
        daysPerWeek: nextDays.length,
      };
    });

    toast.success('Treino removido.');
  };

  const openAddExerciseDialog = (dayId: string) => {
    setEditingExerciseIndex(null);
    setExerciseForm(buildDefaultExerciseForm(dayId));
    setIsExerciseDialogOpen(true);
  };

  const openEditExerciseDialog = (dayId: string, exercise: Exercise, index: number) => {
    setEditingExerciseIndex(index);
    setExerciseForm({
      dayId,
      name: exercise.name,
      sets: String(exercise.sets),
      reps: exercise.reps,
      restSeconds: String(exercise.restSeconds),
      muscleGroup: exercise.muscleGroup,
      icon: exercise.icon,
    });
    setIsExerciseDialogOpen(true);
  };

  const closeExerciseDialog = () => {
    setIsExerciseDialogOpen(false);
    setEditingExerciseIndex(null);
    setExerciseForm(buildDefaultExerciseForm());
  };

  const handleExerciseSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const dayId = exerciseForm.dayId;
    if (!dayId) {
      toast.error('Selecione um treino para adicionar o exercício.');
      return;
    }

    const name = exerciseForm.name.trim();
    const reps = exerciseForm.reps.trim();
    const muscleGroup = exerciseForm.muscleGroup.trim();

    if (!name || !reps || !muscleGroup) {
      toast.error('Preencha nome, repetições e grupo muscular.');
      return;
    }

    const sets = Math.max(1, Math.round(parseNumber(exerciseForm.sets, 1)));
    const restSeconds = Math.max(0, Math.round(parseNumber(exerciseForm.restSeconds, 0)));

    setPlan((current) => {
      if (!current) return current;

      const nextDays = current.days.map((day) => {
        if (day.id !== dayId) return day;

        const nextExercises = [...day.exercises];
        const currentExerciseId =
          editingExerciseIndex === null
            ? crypto.randomUUID()
            : nextExercises[editingExerciseIndex]?.id || crypto.randomUUID();

        const nextExercise: Exercise = {
          id: currentExerciseId,
          name,
          sets,
          reps,
          restSeconds,
          muscleGroup,
          icon: exerciseForm.icon.trim() || '🏋️',
        };

        if (editingExerciseIndex === null) {
          nextExercises.push(nextExercise);
        } else {
          nextExercises[editingExerciseIndex] = nextExercise;
        }

        return {
          ...day,
          exercises: nextExercises,
        };
      });

      return {
        ...current,
        days: nextDays,
        daysPerWeek: nextDays.length,
      };
    });

    setExpandedDay(dayId);
    closeExerciseDialog();
    toast.success(editingExerciseIndex === null ? 'Exercício adicionado.' : 'Exercício atualizado.');
  };

  const handleDeleteExercise = (dayId: string, exerciseIndex: number) => {
    const confirmed = window.confirm('Deseja remover este exercício?');
    if (!confirmed) return;

    setPlan((current) => {
      if (!current) return current;

      const nextDays = current.days.map((day) => {
        if (day.id !== dayId) return day;

        return {
          ...day,
          exercises: day.exercises.filter((_, index) => index !== exerciseIndex),
        };
      });

      return {
        ...current,
        days: nextDays,
      };
    });

    toast.success('Exercício removido.');
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
          <Dumbbell className="w-12 h-12 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-2 text-center">Treino Personalizado</h2>
        <p className="text-muted-foreground text-center mb-6 max-w-md">
          Gere um plano pelo sistema ou crie seu próprio treino.
          <span className="font-medium text-primary"> Objetivo atual: {getGoalLabel(profile.goal)}</span>
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="energy"
            size="lg"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="gap-2"
          >
            <Sparkles className="w-5 h-5" />
            {isGenerating ? 'Gerando...' : 'Gerar Treino do Sistema'}
          </Button>
          <Button variant="outline" size="lg" onClick={handleCreateManualPlan} className="gap-2">
            <Plus className="w-5 h-5" />
            Criar Meu Treino
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6 pb-24 md:pb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold gradient-text">{plan.name}</h1>
            <p className="text-muted-foreground text-sm mt-1">{plan.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="energy" onClick={openAddDayDialog} className="gap-2 shrink-0">
              <Plus className="w-4 h-4" />
              Adicionar Treino
            </Button>
            <Button type="button" variant="outline" onClick={handleRegenerate} className="gap-2 shrink-0">
              <RotateCcw className="w-4 h-4" />
              Gerar Novo
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4 glass-card">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Dias por Semana</p>
                <p className="text-xl font-bold">{plan.daysPerWeek}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 glass-card">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                <Target className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Exercícios</p>
                <p className="text-xl font-bold">
                  {plan.days.reduce((sum, day) => sum + day.exercises.length, 0)}
                </p>
              </div>
            </div>
          </Card>
        </div>

        <MusicPlayer />

        <div className="space-y-3">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Dumbbell className="w-5 h-5 text-primary" />
            Seu Plano Semanal
          </h2>

          {plan.days.length === 0 ? (
            <Card className="glass-card">
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground mb-4">Você ainda não adicionou treinos.</p>
                <Button type="button" variant="energy" onClick={openAddDayDialog} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Adicionar Primeiro Treino
                </Button>
              </CardContent>
            </Card>
          ) : (
            plan.days.map((day) => (
              <DayCard
                key={day.id}
                day={day}
                isExpanded={expandedDay === day.id}
                isCompleted={completionState.completedDayIds.includes(day.id)}
                onToggle={() => setExpandedDay(expandedDay === day.id ? null : day.id)}
                onToggleCompleted={() => handleToggleDayCompleted(day.id)}
                onAddExercise={() => openAddExerciseDialog(day.id)}
                onEditDay={() => openEditDayDialog(day)}
                onDeleteDay={() => handleDeleteDay(day.id)}
                onEditExercise={(index) => openEditExerciseDialog(day.id, day.exercises[index], index)}
                onDeleteExercise={(index) => handleDeleteExercise(day.id, index)}
              />
            ))
          )}
        </div>
      </div>

      <Dialog
        open={isDayDialogOpen}
        onOpenChange={(open) => {
          if (open) {
            setIsDayDialogOpen(true);
            return;
          }
          closeDayDialog();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingDayId ? 'Editar Treino' : 'Adicionar Meu Treino'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleDaySubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="day-name">Nome do treino</Label>
              <Input
                id="day-name"
                value={dayForm.dayName}
                onChange={(event) => setDayForm((prev) => ({ ...prev, dayName: event.target.value }))}
                placeholder="Ex: Segunda - Peito e Tríceps"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="day-focus">Foco</Label>
              <Input
                id="day-focus"
                value={dayForm.focus}
                onChange={(event) => setDayForm((prev) => ({ ...prev, focus: event.target.value }))}
                placeholder="Ex: Força"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="day-minutes">Tempo estimado (min)</Label>
              <Input
                id="day-minutes"
                type="number"
                min="1"
                value={dayForm.estimatedMinutes}
                onChange={(event) =>
                  setDayForm((prev) => ({
                    ...prev,
                    estimatedMinutes: event.target.value,
                  }))
                }
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={closeDayDialog}>
                Cancelar
              </Button>
              <Button type="submit" variant="energy" className="flex-1">
                {editingDayId ? 'Salvar Treino' : 'Adicionar Treino'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isExerciseDialogOpen}
        onOpenChange={(open) => {
          if (open) {
            setIsExerciseDialogOpen(true);
            return;
          }
          closeExerciseDialog();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingExerciseIndex === null ? 'Adicionar Exercício' : 'Editar Exercício'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleExerciseSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="exercise-name">Nome do exercício</Label>
              <Input
                id="exercise-name"
                value={exerciseForm.name}
                onChange={(event) => setExerciseForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Ex: Supino com Halteres"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="exercise-muscle">Grupo muscular</Label>
              <Input
                id="exercise-muscle"
                value={exerciseForm.muscleGroup}
                onChange={(event) =>
                  setExerciseForm((prev) => ({
                    ...prev,
                    muscleGroup: event.target.value,
                  }))
                }
                placeholder="Ex: Peito"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="exercise-sets">Séries</Label>
                <Input
                  id="exercise-sets"
                  type="number"
                  min="1"
                  value={exerciseForm.sets}
                  onChange={(event) => setExerciseForm((prev) => ({ ...prev, sets: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exercise-reps">Repetições</Label>
                <Input
                  id="exercise-reps"
                  value={exerciseForm.reps}
                  onChange={(event) => setExerciseForm((prev) => ({ ...prev, reps: event.target.value }))}
                  placeholder="10-12"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="exercise-rest">Descanso (s)</Label>
                <Input
                  id="exercise-rest"
                  type="number"
                  min="0"
                  value={exerciseForm.restSeconds}
                  onChange={(event) =>
                    setExerciseForm((prev) => ({
                      ...prev,
                      restSeconds: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exercise-icon">Ícone</Label>
                <Input
                  id="exercise-icon"
                  value={exerciseForm.icon}
                  onChange={(event) => setExerciseForm((prev) => ({ ...prev, icon: event.target.value }))}
                  placeholder="🏋️"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={closeExerciseDialog}>
                Cancelar
              </Button>
              <Button type="submit" variant="energy" className="flex-1">
                {editingExerciseIndex === null ? 'Adicionar Exercício' : 'Salvar Exercício'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
