import { useEffect, useState } from 'react';
import { useProfile } from '@/hooks/useProfile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Check,
  Trophy,
  Calendar,
  Target,
  AlertTriangle,
  Loader2,
  Dumbbell,
  Droplets,
  Footprints,
  Scale,
  UtensilsCrossed,
  Medal,
  BarChart3,
  Flame,
  LucideIcon,
} from 'lucide-react';
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

const isEmojiLike = (value: string) =>
  Array.from(value).some((char) => char.charCodeAt(0) > 127);

const isImagePath = (value: string) =>
  /^(https?:\/\/|data:image\/|\/)/i.test(value);

const resolveChallengeIconComponent = (
  icon: string,
  category: string
): LucideIcon => {
  const normalizedIcon = icon.toLowerCase();
  const normalizedCategory = category.toLowerCase();

  if (normalizedIcon.includes('water') || normalizedIcon.includes('drop') || normalizedIcon.includes('hidrat')) {
    return Droplets;
  }
  if (normalizedIcon.includes('run') || normalizedIcon.includes('corrida')) {
    return Footprints;
  }
  if (normalizedIcon.includes('scale') || normalizedIcon.includes('peso')) {
    return Scale;
  }
  if (normalizedIcon.includes('food') || normalizedIcon.includes('diet') || normalizedIcon.includes('dieta')) {
    return UtensilsCrossed;
  }
  if (normalizedIcon.includes('medal')) {
    return Medal;
  }
  if (normalizedIcon.includes('chart') || normalizedIcon.includes('graf')) {
    return BarChart3;
  }
  if (normalizedIcon.includes('target') || normalizedIcon.includes('meta')) {
    return Target;
  }
  if (normalizedIcon.includes('trophy')) {
    return Trophy;
  }

  if (normalizedCategory.includes('workout')) return Dumbbell;
  if (normalizedCategory.includes('cardio')) return Footprints;
  if (normalizedCategory.includes('health')) return Droplets;
  if (normalizedCategory.includes('diet')) return UtensilsCrossed;
  if (normalizedCategory.includes('tracking')) return BarChart3;

  return Flame;
};

const renderChallengeIcon = (icon: string | undefined, category: string | undefined) => {
  const safeIcon = (icon || '').trim();
  const safeCategory = (category || '').trim();

  if (safeIcon && isImagePath(safeIcon)) {
    return (
      <img
        src={safeIcon}
        alt="Icone do desafio"
        className="h-6 w-6 rounded object-cover"
      />
    );
  }

  if (safeIcon && isEmojiLike(safeIcon)) {
    return <span className="text-2xl leading-none">{safeIcon}</span>;
  }

  const IconComponent = resolveChallengeIconComponent(safeIcon, safeCategory);
  return <IconComponent className="h-6 w-6 text-primary" />;
};

export function ChallengesSection() {
  const { userChallenges, challenges, assignDailyChallenges, completeChallenge, profile } = useProfile();
  const [lastAssignmentCycle, setLastAssignmentCycle] = useState('');
  const [isSyncingChallenges, setIsSyncingChallenges] = useState(false);
  const [challengeSyncError, setChallengeSyncError] = useState('');

  const challengeSyncErrorMessage =
    challenges.length
      ? 'Nao foi possivel sincronizar os desafios agora. Tente novamente.'
      : 'Nenhum desafio ativo foi encontrado no banco. Execute as migrations para popular a tabela public.challenges.';

  useEffect(() => {
    if (!profile?.id) return;

    let cancelled = false;

    const syncRecurringChallenges = async () => {
      const cycleKey = getChallengeCycleKey();
      if (cycleKey === lastAssignmentCycle) return;

      try {
        setIsSyncingChallenges(true);
        const assigned = await assignDailyChallenges();
        if (!assigned) {
          if (!cancelled) {
            setChallengeSyncError(challengeSyncErrorMessage);
          }
          return;
        }
        if (!cancelled) {
          setChallengeSyncError('');
        }
      } catch (error) {
        console.error('Erro ao sincronizar desafios recorrentes:', error);
        if (!cancelled) {
          setChallengeSyncError(challengeSyncErrorMessage);
        }
        return;
      } finally {
        if (!cancelled) {
          setIsSyncingChallenges(false);
        }
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
  }, [assignDailyChallenges, challengeSyncErrorMessage, lastAssignmentCycle, profile?.id]);

  useEffect(() => {
    setLastAssignmentCycle('');
    setChallengeSyncError('');
  }, [profile?.id]);

  const handleRetrySync = async () => {
    setIsSyncingChallenges(true);
    try {
      const assigned = await assignDailyChallenges();
      if (!assigned) {
        setChallengeSyncError(challengeSyncErrorMessage);
        return;
      }
      setChallengeSyncError('');
      setLastAssignmentCycle(getChallengeCycleKey());
    } catch (error) {
      console.error('Erro ao tentar gerar desafios manualmente:', error);
      setChallengeSyncError(challengeSyncErrorMessage);
    } finally {
      setIsSyncingChallenges(false);
    }
  };

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
              'h-12 w-12 rounded-xl flex items-center justify-center',
              progress.is_completed ? 'bg-primary/20' : 'bg-secondary'
            )}
          >
            {renderChallengeIcon(progress.challenge.icon, progress.challenge.category)}
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
      {!!challengeSyncError && (
        <Card className="border-warning/50 bg-warning/10">
          <CardContent className="py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  Falha ao gerar desafios automaticamente
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{challengeSyncError}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleRetrySync}
                disabled={isSyncingChallenges}
                className="sm:self-start"
              >
                {isSyncingChallenges ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  'Tentar novamente'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
