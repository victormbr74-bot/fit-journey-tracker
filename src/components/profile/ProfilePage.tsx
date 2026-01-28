import { useUser } from '@/context/UserContext';
import { GOALS } from '@/types/user';
import { User, Mail, Calendar, Ruler, Scale, Target, Trophy, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function ProfilePage() {
  const { user, runSessions } = useUser();

  if (!user) return null;

  const goalInfo = GOALS.find(g => g.id === user.goal);
  const totalDistance = runSessions.reduce((acc, run) => acc + run.distance, 0);
  const totalTime = runSessions.reduce((acc, run) => acc + run.duration, 0);

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}min`;
    }
    return `${minutes}min`;
  };

  return (
    <div className="pb-24 md:pb-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">
          <span className="gradient-text">Perfil</span> 👤
        </h1>
        <p className="text-muted-foreground mt-1">Suas informações e estatísticas</p>
      </div>

      {/* Profile Card */}
      <div className="glass-card p-6 mb-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-success flex items-center justify-center">
            <span className="text-3xl font-bold text-primary-foreground">
              {user.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <h2 className="text-xl font-bold">{user.name}</h2>
            <p className="text-muted-foreground">{user.email}</p>
            <div className="flex items-center gap-2 mt-1">
              <Trophy className="w-4 h-4 text-primary" />
              <span className="text-sm text-primary font-medium">{user.points} pontos</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3 p-3 bg-secondary/30 rounded-lg">
            <Calendar className="w-5 h-5 text-info" />
            <div>
              <p className="text-xs text-muted-foreground">Idade</p>
              <p className="font-medium">{user.age} anos</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-secondary/30 rounded-lg">
            <Ruler className="w-5 h-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Altura</p>
              <p className="font-medium">{user.height} cm</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-secondary/30 rounded-lg">
            <Scale className="w-5 h-5 text-success" />
            <div>
              <p className="text-xs text-muted-foreground">Peso</p>
              <p className="font-medium">{user.weight} kg</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-secondary/30 rounded-lg">
            <Target className="w-5 h-5 text-warning" />
            <div>
              <p className="text-xs text-muted-foreground">Objetivo</p>
              <p className="font-medium">{goalInfo?.icon} {goalInfo?.label}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="stat-card mb-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          Resumo de Atividades
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold gradient-text">{runSessions.length}</p>
            <p className="text-sm text-muted-foreground">Corridas</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold gradient-text">{totalDistance.toFixed(1)}</p>
            <p className="text-sm text-muted-foreground">km total</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold gradient-text">{formatDuration(totalTime)}</p>
            <p className="text-sm text-muted-foreground">Tempo</p>
          </div>
        </div>
      </div>

      {/* Member since */}
      <div className="text-center text-sm text-muted-foreground">
        <p>
          Membro desde {format(new Date(user.createdAt), "MMMM 'de' yyyy", { locale: ptBR })}
        </p>
      </div>
    </div>
  );
}
