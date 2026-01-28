import { useState } from 'react';
import { DietPlan, Meal } from '@/types/workout';
import { useUser } from '@/context/UserContext';
import { generateDietPlan } from '@/lib/dietGenerator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
  Minus
} from 'lucide-react';

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

function MealCard({ meal, isExpanded, onToggle }: { meal: Meal; isExpanded: boolean; onToggle: () => void }) {
  return (
    <Card className="overflow-hidden">
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
  const { user } = useUser();
  const [plan, setPlan] = useState<DietPlan | null>(null);
  const [expandedMeal, setExpandedMeal] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = () => {
    if (!user) return;
    setIsGenerating(true);
    
    setTimeout(() => {
      const newPlan = generateDietPlan(user);
      setPlan(newPlan);
      setExpandedMeal(newPlan.meals[0]?.id || null);
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
          <Utensils className="w-12 h-12 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-2 text-center">Dieta Personalizada</h2>
        <p className="text-muted-foreground text-center mb-6 max-w-md">
          Gere um plano alimentar baseado no seu perfil, peso ({user.weight}kg), 
          altura ({user.height}cm) e objetivo
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
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">TMB</p>
          <p className="text-xl font-bold">{plan.bmr} kcal</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">TDEE</p>
          <p className="text-xl font-bold">{plan.tdee} kcal</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{deficitLabel}</p>
          <div className="flex items-center gap-2">
            <DeficitIcon className={`w-5 h-5 ${deficitColor}`} />
            <p className="text-xl font-bold">{Math.abs(plan.deficit)} kcal</p>
          </div>
        </Card>
        <Card className="p-4 bg-primary/5 border-primary/20">
          <p className="text-sm text-muted-foreground">Meta Diária</p>
          <p className="text-xl font-bold text-primary">{plan.dailyCalories} kcal</p>
        </Card>
      </div>

      {/* Macros */}
      <Card className="p-4">
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

      {/* Meals */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Refeições</h2>
        <div className="space-y-3">
          {plan.meals.map((meal) => (
            <MealCard 
              key={meal.id} 
              meal={meal} 
              isExpanded={expandedMeal === meal.id}
              onToggle={() => setExpandedMeal(expandedMeal === meal.id ? null : meal.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
