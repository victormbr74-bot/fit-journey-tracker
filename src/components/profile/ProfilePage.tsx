import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { GOALS, MUSCLE_GROUPS } from '@/types/user';
import { User, Calendar, Ruler, Scale, Target, Trophy, TrendingUp, Music, Edit, Dumbbell, Clock } from 'lucide-react';
import { format, differenceInYears } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { MusicPlayer } from '@/components/workout/MusicPlayer';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export function ProfilePage() {
  const { profile, runSessions, loading } = useProfile();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="pb-24 md:pb-8 space-y-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!profile) return null;

  const goalInfo = GOALS.find(g => g.id === profile.goal);
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

  const selectedMuscleLabels = profile.muscle_groups
    ?.map(id => MUSCLE_GROUPS.find(m => m.id === id)?.label)
    .filter(Boolean)
    .join(', ') || 'Não definido';

  const handleLogout = async () => {
    await signOut();
    navigate('/');
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
              {profile.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <h2 className="text-xl font-bold">{profile.name}</h2>
            <p className="text-muted-foreground">{profile.email}</p>
            <div className="flex items-center gap-2 mt-1">
              <Trophy className="w-4 h-4 text-primary" />
              <span className="text-sm text-primary font-medium">{profile.points} pontos</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3 p-3 bg-secondary/30 rounded-lg">
            <Calendar className="w-5 h-5 text-info" />
            <div>
              <p className="text-xs text-muted-foreground">Idade</p>
              <p className="font-medium">{profile.age} anos</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-secondary/30 rounded-lg">
            <Ruler className="w-5 h-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Altura</p>
              <p className="font-medium">{profile.height} cm</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-secondary/30 rounded-lg">
            <Scale className="w-5 h-5 text-success" />
            <div>
              <p className="text-xs text-muted-foreground">Peso</p>
              <p className="font-medium">{profile.weight} kg</p>
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

      {/* Training Preferences */}
      <div className="glass-card p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Dumbbell className="w-5 h-5 text-primary" />
          Preferências de Treino
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-3 p-3 bg-secondary/30 rounded-lg">
            <Dumbbell className="w-5 h-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Grupos Musculares</p>
              <p className="font-medium text-sm">{selectedMuscleLabels}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-secondary/30 rounded-lg">
            <Clock className="w-5 h-5 text-success" />
            <div>
              <p className="text-xs text-muted-foreground">Frequência Semanal</p>
              <p className="font-medium">{profile.training_frequency}x por semana</p>
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

      {/* Music Player */}
      <div className="mb-6">
        <MusicPlayer />
      </div>

      {/* Member since & Logout */}
      <div className="text-center space-y-4">
        <p className="text-sm text-muted-foreground">
          Membro desde {format(new Date(profile.created_at || new Date()), "MMMM 'de' yyyy", { locale: ptBR })}
        </p>
        <Button variant="outline" onClick={handleLogout}>
          Sair da conta
        </Button>
      </div>
    </div>
  );
}
