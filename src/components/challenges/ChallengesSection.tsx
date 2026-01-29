import { useEffect } from 'react';
import { useProfile } from '@/hooks/useProfile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Check, Trophy, Calendar, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ChallengesSection() {
  const { challenges, userChallenges, assignDailyChallenges, completeChallenge, profile } = useProfile();

  useEffect(() => {
    if (challenges.length > 0) {
      assignDailyChallenges();
    }
  }, [challenges.length]);

  const dailyChallenges = userChallenges.filter(uc => uc.challenge?.challenge_type === 'daily');
  const weeklyChallenges = userChallenges.filter(uc => uc.challenge?.challenge_type === 'weekly');

  const handleComplete = async (progressId: string) => {
    await completeChallenge(progressId);
  };

  const renderChallengeCard = (progress: typeof userChallenges[0]) => {
    if (!progress.challenge) return null;

    const completionPercentage = Math.min(
      (progress.current_value / progress.challenge.target_value) * 100,
      100
    );

    return (
      <div
        key={progress.id}
        className={cn(
          "p-4 rounded-xl border transition-all duration-300",
          progress.is_completed
            ? "bg-primary/10 border-primary"
            : "bg-secondary/30 border-border hover:border-primary/50"
        )}
      >
        <div className="flex items-start gap-3">
          <div className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center text-2xl",
            progress.is_completed ? "bg-primary/20" : "bg-secondary"
          )}>
            {progress.challenge.icon}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-sm truncate">{progress.challenge.name}</h4>
              {progress.is_completed && (
                <Check className="w-4 h-4 text-primary flex-shrink-0" />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {progress.challenge.description}
            </p>
            
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">
                  {progress.current_value}/{progress.challenge.target_value}
                </span>
                <span className={cn(
                  "font-medium",
                  progress.is_completed ? "text-primary" : "text-muted-foreground"
                )}>
                  +{progress.challenge.points_awarded} pts
                </span>
              </div>
              <Progress value={completionPercentage} className="h-1.5" />
            </div>
          </div>
        </div>

        {!progress.is_completed && (
          <Button
            variant="energy"
            size="sm"
            className="w-full mt-3"
            onClick={() => handleComplete(progress.id)}
          >
            <Check className="w-4 h-4" />
            Marcar como Concluído
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Daily Challenges */}
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="w-5 h-5 text-primary" />
            Desafios Diários
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dailyChallenges.length > 0 ? (
            <div className="grid gap-3">
              {dailyChallenges.map(renderChallengeCard)}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <Target className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhum desafio diário disponível</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Weekly Challenges */}
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Trophy className="w-5 h-5 text-warning" />
            Desafios Semanais
          </CardTitle>
        </CardHeader>
        <CardContent>
          {weeklyChallenges.length > 0 ? (
            <div className="grid gap-3">
              {weeklyChallenges.map(renderChallengeCard)}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <Trophy className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhum desafio semanal atribuído</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Points Summary */}
      <Card className="glass-card bg-gradient-to-br from-primary/10 to-primary/5">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Seus pontos</p>
              <p className="text-2xl font-bold gradient-text">{profile?.points || 0}</p>
            </div>
            <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center">
              <Trophy className="w-7 h-7 text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
