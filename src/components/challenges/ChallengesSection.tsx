import { useEffect, useState } from 'react';
import { useProfile } from '@/hooks/useProfile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Check, Trophy, Calendar, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

const toIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getWeekStartIsoDate = (referenceDate: Date) => {
  const baseDate = new Date(referenceDate);
  baseDate.setHours(0, 0, 0, 0);
  const dayOfWeek = baseDate.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  baseDate.setDate(baseDate.getDate() + diffToMonday);
  return toIsoDate(baseDate);
};

const getChallengeCycleKey = () => {
  const now = new Date();
  return `${toIsoDate(now)}|${getWeekStartIsoDate(now)}`;
};

export function ChallengesSection() {
  const { userChallenges, assignDailyChallenges, completeChallenge, profile } = useProfile();
  const [lastAssignmentCycle, setLastAssignmentCycle] = useState('');

  useEffect(() => {
    if (!profile?.id) return;

    let cancelled = false;

    const syncRecurringChallenges = async () => {
      const cycleKey = getChallengeCycleKey();
      if (cycleKey === lastAssignmentCycle) return;

      try {
        const assigned = await assignDailyChallenges();
        if (!assigned) return;
      } catch (error) {
        console.error('Erro ao sincronizar desafios recorrentes:', error);
        return;
      }
      if (!cancelled) {
        setLastAssignmentCycle(cycleKey);
      }
    };

    void syncRecurringChallenges();
    const intervalId = window.setInterval(() => {
      void syncRecurringChallenges();
    }, 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [assignDailyChallenges, lastAssignmentCycle, profile?.id]);

  useEffect(() => {
    setLastAssignmentCycle('');
  }, [profile?.id]);

  const dailyChallenges = userChallenges.filter(
    (challengeProgress) => challengeProgress.challenge?.challenge_type === 'daily'
  );
  const weeklyChallenges = userChallenges.filter(
    (challengeProgress) => challengeProgress.challenge?.challenge_type === 'weekly'
  );

  const handleComplete = async (progressId: string) => {
    await completeChallenge(progressId);
  };

  const renderChallengeCard = (progress: (typeof userChallenges)[number]) => {
    if (!progress.challenge) return null;

    const completionPercentage = Math.min(
      (progress.current_value / progress.challenge.target_value) * 100,
      100
    );

    return (
      <div
        key={progress.id}
        className={cn(
          'p-4 rounded-xl border transition-all duration-300',
          progress.is_completed
            ? 'bg-primary/10 border-primary'
            : 'bg-secondary/30 border-border hover:border-primary/50'
        )}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'w-12 h-12 rounded-xl flex items-center justify-center text-2xl',
              progress.is_completed ? 'bg-primary/20' : 'bg-secondary'
            )}
          >
            {progress.challenge.icon}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-sm truncate">{progress.challenge.name}</h4>
              {progress.is_completed && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {progress.challenge.description}
            </p>

            <div className="mt-2">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">
                  {progress.current_value}/{progress.challenge.target_value}
                </span>
                <span
                  className={cn(
                    'font-medium',
                    progress.is_completed ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  +{progress.challenge.points_awarded} / -{progress.challenge.points_deducted} pts
                </span>
              </div>
              <Progress value={completionPercentage} className="h-1.5" />
            </div>
            {!progress.is_completed && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Nao cumprir no ciclo gera perda de {progress.challenge.points_deducted} pts.
              </p>
            )}
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
            Marcar como Concluido
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="w-5 h-5 text-primary" />
            Desafios Diarios
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dailyChallenges.length > 0 ? (
            <div className="grid gap-3">{dailyChallenges.map(renderChallengeCard)}</div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <Target className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhum desafio diario disponivel</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Trophy className="w-5 h-5 text-warning" />
            Desafios Semanais
          </CardTitle>
        </CardHeader>
        <CardContent>
          {weeklyChallenges.length > 0 ? (
            <div className="grid gap-3">{weeklyChallenges.map(renderChallengeCard)}</div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <Trophy className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhum desafio semanal atribuido</p>
            </div>
          )}
        </CardContent>
      </Card>

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
