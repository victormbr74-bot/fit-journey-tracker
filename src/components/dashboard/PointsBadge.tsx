import { Flame, Star, Trophy } from 'lucide-react';

import { getLevelInfo, getNextLevelPoints, getPreviousLevelPoints } from '@/lib/leveling';

interface PointsBadgeProps {
  points: number;
}

export function PointsBadge({ points }: PointsBadgeProps) {
  const { level, title } = getLevelInfo(points);
  const Icon = level === 1 ? Star : level === 2 ? Flame : Trophy;
  const nextLevel = getNextLevelPoints(points);
  const prevLevel = getPreviousLevelPoints(level);
  const progress = ((points - prevLevel) / (nextLevel - prevLevel)) * 100;

  return (
    <div className="stat-card">
      <div className="mb-4 flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-success animate-pulse-glow">
          <Icon className="h-7 w-7 text-primary-foreground" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Nivel {level}</p>
          <p className="gradient-text text-xl font-bold">{title}</p>
        </div>
      </div>

      <div className="mb-2">
        <div className="mb-1 flex justify-between text-sm">
          <span className="text-muted-foreground">Progresso</span>
          <span className="font-medium">
            {points} / {nextLevel} pts
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full bg-gradient-to-r from-primary to-success transition-all duration-500"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Faltam {nextLevel - points} pontos para o proximo nivel
      </p>
    </div>
  );
}
