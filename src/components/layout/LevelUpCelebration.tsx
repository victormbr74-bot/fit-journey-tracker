import { CSSProperties, useEffect, useMemo } from 'react';
import { Sparkles, Trophy } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface LevelUpCelebrationProps {
  open: boolean;
  level: number;
  title: string;
  points: number;
  onClose: () => void;
}

type FireworkBurst = {
  id: string;
  left: string;
  top: string;
  delaySeconds: number;
  hue: number;
  distance: number;
};

const FIREWORK_BURSTS: FireworkBurst[] = [
  { id: 'fw-a', left: '12%', top: '18%', delaySeconds: 0, hue: 28, distance: 86 },
  { id: 'fw-b', left: '78%', top: '16%', delaySeconds: 0.35, hue: 196, distance: 92 },
  { id: 'fw-c', left: '20%', top: '58%', delaySeconds: 0.55, hue: 340, distance: 84 },
  { id: 'fw-d', left: '74%', top: '62%', delaySeconds: 0.15, hue: 140, distance: 90 },
  { id: 'fw-e', left: '48%', top: '12%', delaySeconds: 0.75, hue: 42, distance: 96 },
  { id: 'fw-f', left: '52%', top: '66%', delaySeconds: 0.95, hue: 262, distance: 80 },
];

const SPARK_ANGLES = Array.from({ length: 12 }, (_, index) => index * 30);

export function LevelUpCelebration({ open, level, title, points, onClose }: LevelUpCelebrationProps) {
  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => {
      onClose();
    }, 6200);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const fireworkBursts = useMemo(() => FIREWORK_BURSTS, []);

  if (!open) return null;

  return (
    <div className="level-up-celebration-overlay" role="dialog" aria-modal="true" aria-label="Parabens, voce subiu de nivel">
      <div className="level-up-firework-field" aria-hidden="true">
        {fireworkBursts.map((burst) => (
          <div
            key={burst.id}
            className="level-up-firework"
            style={{
              left: burst.left,
              top: burst.top,
            }}
          >
            {SPARK_ANGLES.map((angle, sparkIndex) => (
              <span
                key={`${burst.id}-${angle}`}
                className="level-up-firework-spark"
                style={
                  {
                    '--spark-angle': `${angle}deg`,
                    '--spark-distance': `${burst.distance}px`,
                    animationDelay: `${burst.delaySeconds + sparkIndex * 0.03}s`,
                    backgroundColor: `hsl(${burst.hue} 100% 60%)`,
                    boxShadow: `0 0 10px hsl(${burst.hue} 100% 60% / 0.6)`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        ))}
      </div>

      <div className="level-up-celebration-card">
        <div className="level-up-badge-orb">
          <Sparkles className="h-8 w-8 text-primary-foreground" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Parabens</p>
        <h2 className="mt-2 text-2xl font-bold text-foreground md:text-3xl">Voce subiu de nivel!</h2>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/12 px-4 py-1.5 text-sm font-semibold text-foreground">
          <Trophy className="h-4 w-4 text-primary" />
          Nivel {level} - {title}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">Total atual: {points} pontos</p>
        <Button type="button" className="mt-6 w-full" onClick={onClose}>
          Continuar
        </Button>
      </div>
    </div>
  );
}
