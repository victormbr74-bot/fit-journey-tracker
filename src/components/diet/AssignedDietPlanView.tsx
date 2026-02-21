import { useState } from 'react';
import { AssignedDietPlan } from '@/hooks/useAssignedPlans';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Flame, UserRound, Utensils } from 'lucide-react';

type AssignedDietPlanViewProps = {
  assignment: AssignedDietPlan;
};

const formatDateTime = (isoDate: string) => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR');
};

export function AssignedDietPlanView({ assignment }: AssignedDietPlanViewProps) {
  const [expandedMealId, setExpandedMealId] = useState<string | null>(assignment.plan.meals[0]?.id || null);

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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 glass-card">
          <p className="text-xs text-muted-foreground">Meta diaria</p>
          <p className="text-xl font-bold">{assignment.plan.dailyCalories} kcal</p>
        </Card>
        <Card className="p-4 glass-card">
          <p className="text-xs text-muted-foreground">Proteina</p>
          <p className="text-xl font-bold">{assignment.plan.proteinGrams}g</p>
        </Card>
        <Card className="p-4 glass-card">
          <p className="text-xs text-muted-foreground">Carbo</p>
          <p className="text-xl font-bold">{assignment.plan.carbsGrams}g</p>
        </Card>
        <Card className="p-4 glass-card">
          <p className="text-xs text-muted-foreground">Gordura</p>
          <p className="text-xl font-bold">{assignment.plan.fatGrams}g</p>
        </Card>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Utensils className="w-5 h-5 text-primary" />
          Refeicoes do Plano
        </h2>

        {assignment.plan.meals.map((meal) => {
          const isExpanded = expandedMealId === meal.id;
          return (
            <Card key={meal.id} className="overflow-hidden glass-card">
              <button
                type="button"
                className="w-full text-left"
                onClick={() => setExpandedMealId(isExpanded ? null : meal.id)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">{meal.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">{meal.time}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" className="gap-1">
                        <Flame className="w-3 h-3" />
                        {meal.totalCalories} kcal
                      </Badge>
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </div>
                </CardHeader>
              </button>
              {isExpanded && (
                <CardContent className="pt-0 space-y-2">
                  {meal.items.map((item, index) => (
                    <div
                      key={`${meal.id}-${index}`}
                      className="flex items-center justify-between p-3 rounded-lg bg-secondary/30"
                    >
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-muted-foreground">{item.portion}</p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="font-medium">{item.calories} kcal</p>
                        <p className="text-xs text-muted-foreground">
                          P {item.protein}g | C {item.carbs}g | G {item.fat}g
                        </p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="glass-card border-border/70 bg-card/80">
        <CardContent className="py-5 space-y-3 text-sm">
          <p className="font-medium">Dieta publicada pelo seu profissional.</p>
          <p className="text-muted-foreground">
            Para ajustes alimentares, fale com {assignment.professional.name}.
          </p>
          <Button variant="outline" className="gap-2" disabled>
            <Utensils className="w-4 h-4" />
            Plano nutricional ativo
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
