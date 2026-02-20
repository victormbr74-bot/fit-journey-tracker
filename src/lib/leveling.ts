export type LevelInfo = {
  level: number;
  title: string;
};

export const getLevelInfo = (points: number): LevelInfo => {
  if (points < 100) return { level: 1, title: 'Iniciante' };
  if (points < 500) return { level: 2, title: 'Dedicado' };
  if (points < 1000) return { level: 3, title: 'Atleta' };
  return { level: 4, title: 'Campeao' };
};

export const getNextLevelPoints = (points: number): number => {
  if (points < 100) return 100;
  if (points < 500) return 500;
  if (points < 1000) return 1000;
  return 2000;
};

export const getPreviousLevelPoints = (level: number): number => {
  if (level <= 1) return 0;
  if (level === 2) return 100;
  if (level === 3) return 500;
  return 1000;
};
