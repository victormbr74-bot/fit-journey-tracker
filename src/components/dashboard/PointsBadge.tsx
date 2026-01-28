import { Star, Trophy, Flame } from 'lucide-react';

interface PointsBadgeProps {
  points: number;
}

function getLevel(points: number): { level: number; title: string; icon: typeof Star } {
  if (points < 100) return { level: 1, title: 'Iniciante', icon: Star };
  if (points < 500) return { level: 2, title: 'Dedicado', icon: Flame };
  if (points < 1000) return { level: 3, title: 'Atleta', icon: Trophy };
  return { level: 4, title: 'Campeão', icon: Trophy };
}

function getNextLevelPoints(points: number): number {
  if (points < 100) return 100;
  if (points < 500) return 500;
  if (points < 1000) return 1000;
  return 2000;
}

export function PointsBadge({ points }: PointsBadgeProps) {
  const { level, title, icon: Icon } = getLevel(points);
  const nextLevel = getNextLevelPoints(points);
  const prevLevel = level === 1 ? 0 : level === 2 ? 100 : level === 3 ? 500 : 1000;
  const progress = ((points - prevLevel) / (nextLevel - prevLevel)) * 100;

  return (
    <div className="stat-card">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary to-success flex items-center justify-center animate-pulse-glow">
          <Icon className="w-7 h-7 text-primary-foreground" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Nível {level}</p>
          <p className="text-xl font-bold gradient-text">{title}</p>
        </div>
      </div>

      <div className="mb-2">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-muted-foreground">Progresso</span>
          <span className="font-medium">{points} / {nextLevel} pts</span>
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-success transition-all duration-500"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Faltam {nextLevel - points} pontos para o próximo nível
      </p>
    </div>
  );
}
