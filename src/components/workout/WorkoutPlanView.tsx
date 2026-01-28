import { useState } from 'react';
import { WorkoutPlan, WorkoutDay, Exercise } from '@/types/workout';
import { useUser } from '@/context/UserContext';
import { generateWorkoutPlan } from '@/lib/workoutGenerator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Dumbbell, 
  Clock, 
  RotateCcw, 
  ChevronDown, 
  ChevronUp,
  Calendar,
  Target,
  Sparkles
} from 'lucide-react';

function ExerciseCard({ exercise }: { exercise: Exercise }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
      <div className="text-2xl">{exercise.icon}</div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{exercise.name}</p>
        <p className="text-sm text-muted-foreground">{exercise.muscleGroup}</p>
      </div>
      <div className="text-right text-sm">
        <p className="font-medium">{exercise.sets}x {exercise.reps}</p>
        {exercise.restSeconds > 0 && (
          <p className="text-muted-foreground">{exercise.restSeconds}s descanso</p>
        )}
      </div>
    </div>
  );
}

function DayCard({ day, isExpanded, onToggle }: { day: WorkoutDay; isExpanded: boolean; onToggle: () => void }) {
  return (
    <Card className="overflow-hidden">
      <button 
        onClick={onToggle}
        className="w-full text-left"
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">{day.dayName}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{day.focus}</p>
            </div>
            <div className="flex items-center gap-3">
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
        <CardContent className="pt-0">
          <div className="space-y-2">
            {day.exercises.map((exercise, idx) => (
              <ExerciseCard key={`${exercise.id}-${idx}`} exercise={exercise} />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export function WorkoutPlanView() {
  const { user } = useUser();
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = () => {
    if (!user) return;
    setIsGenerating(true);
    
    // Simulate loading for better UX
    setTimeout(() => {
      const newPlan = generateWorkoutPlan(user);
      setPlan(newPlan);
      setExpandedDay(newPlan.days[0]?.id || null);
      setIsGenerating(false);
    }, 800);
  };

  const handleRegenerate = () => {
    setPlan(null);
    handleGenerate();
  };

  if (!user) return null;

  if (!plan) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4">
        <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-6">
          <Dumbbell className="w-12 h-12 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-2 text-center">Treino Personalizado</h2>
        <p className="text-muted-foreground text-center mb-6 max-w-md">
          Gere um plano de treino baseado no seu perfil e objetivo: 
          <span className="font-medium text-primary"> {user.goal === 'lose_weight' ? 'Perder Peso' : 
            user.goal === 'gain_muscle' ? 'Ganhar Massa' : 
            user.goal === 'endurance' ? 'Resistência' : 'Manter Forma'}</span>
        </p>
        <Button 
          variant="energy" 
          size="lg" 
          onClick={handleGenerate}
          disabled={isGenerating}
          className="gap-2"
        >
          <Sparkles className="w-5 h-5" />
          {isGenerating ? 'Gerando...' : 'Gerar Treino'}
        </Button>
      </div>
    );
  }

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
          Gerar Novo
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
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
        <Card className="p-4">
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

      {/* Days */}
      <div className="space-y-3">
        {plan.days.map((day) => (
          <DayCard 
            key={day.id} 
            day={day} 
            isExpanded={expandedDay === day.id}
            onToggle={() => setExpandedDay(expandedDay === day.id ? null : day.id)}
          />
        ))}
      </div>
    </div>
  );
}
