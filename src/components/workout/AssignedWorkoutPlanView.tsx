import { useMemo, useState } from 'react';
import { AssignedWorkoutPlan } from '@/hooks/useAssignedPlans';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Clock, Dumbbell, Target, UserRound } from 'lucide-react';

type AssignedWorkoutPlanViewProps = {
  assignment: AssignedWorkoutPlan;
};

const formatDateTime = (isoDate: string) => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR');
};

export function AssignedWorkoutPlanView({ assignment }: AssignedWorkoutPlanViewProps) {
  const [expandedDayId, setExpandedDayId] = useState<string | null>(assignment.plan.days[0]?.id || null);

  const totalExercises = useMemo(
    () => assignment.plan.days.reduce((sum, day) => sum + day.exercises.length, 0),
    [assignment.plan.days]
  );

  return (
    <div className="space-y-6 pb-24 md:pb-8">
      <Card className="glass-card border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{assignment.title}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {assignment.description || assignment.plan.description}
          </p>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <UserRound className="w-3 h-3" />
              Profissional: {assignment.professional.name}
            </Badge>
            <Badge variant="outline">
              @{assignment.professional.handle.replace(/^@/, '')}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Atualizado em {formatDateTime(assignment.updatedAt)}
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 glass-card">
          <p className="text-sm text-muted-foreground">Dias por Semana</p>
          <p className="text-xl font-bold">{assignment.plan.daysPerWeek}</p>
        </Card>
        <Card className="p-4 glass-card">
          <p className="text-sm text-muted-foreground">Exercicios</p>
          <p className="text-xl font-bold">{totalExercises}</p>
        </Card>
      </div>

      <div className="space-y-3">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Dumbbell className="w-5 h-5 text-primary" />
          Plano da Semana
        </h2>

        {assignment.plan.days.map((day) => {
          const isExpanded = expandedDayId === day.id;
          return (
            <Card key={day.id} className="overflow-hidden glass-card">
              <button
                type="button"
                className="w-full text-left"
                onClick={() => setExpandedDayId(isExpanded ? null : day.id)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">{day.dayName}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">{day.focus}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" className="gap-1">
                        <Clock className="w-3 h-3" />
                        {day.estimatedMinutes}min
                      </Badge>
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </div>
                </CardHeader>
              </button>
              {isExpanded && (
                <CardContent className="pt-0 space-y-2">
                  {day.exercises.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-3 text-center bg-secondary/20 rounded-lg">
                      Nenhum exercicio cadastrado nesse treino.
                    </p>
                  ) : (
                    day.exercises.map((exercise) => (
                      <div
                        key={exercise.id}
                        className="flex items-center justify-between gap-3 p-3 rounded-lg bg-secondary/30"
                      >
                        <div className="min-w-0">
                          <p className="font-medium truncate">{exercise.name}</p>
                          <p className="text-xs text-muted-foreground">{exercise.muscleGroup}</p>
                        </div>
                        <div className="text-right text-sm shrink-0">
                          <p className="font-medium">
                            {exercise.sets}x {exercise.reps}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {exercise.restSeconds > 0 ? `${exercise.restSeconds}s descanso` : 'sem descanso'}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="glass-card border-border/70 bg-card/80">
        <CardContent className="py-5 space-y-3 text-sm">
          <p className="font-medium">Treino publicado pelo seu profissional.</p>
          <p className="text-muted-foreground">
            Para ajustes personalizados, fale com {assignment.professional.name}.
          </p>
          <Button variant="outline" className="gap-2" disabled>
            <Target className="w-4 h-4" />
            Plano profissional ativo
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
