import { useState, useEffect } from 'react';
import { useProfile } from '@/hooks/useProfile';
import { StatsCard } from './StatsCard';
import { BMIGauge } from './BMIGauge';
import { WeightChart } from './WeightChart';
import { PointsBadge } from './PointsBadge';
import { AddWeightModal } from './AddWeightModal';
import { ChallengesSection } from '@/components/challenges/ChallengesSection';
import { GOALS } from '@/types/user';
import { Scale, Ruler, Target, Plus, TrendingUp, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';

export function Dashboard() {
  const { profile, weightHistory, runSessions, loading } = useProfile();
  const [showWeightModal, setShowWeightModal] = useState(false);

  if (loading) {
    return (
      <div className="pb-24 md:pb-8 space-y-6">
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!profile) return null;

  // Calculate BMI
  const heightInMeters = profile.height / 100;
  const bmi = profile.weight / (heightInMeters * heightInMeters);

  // Calculate weight change
  const weightChange = weightHistory.length >= 2
    ? weightHistory[weightHistory.length - 1].weight - weightHistory[weightHistory.length - 2].weight
    : 0;

  const goalLabel = GOALS.find(g => g.id === profile.goal)?.label || 'Não definido';
  const goalIcon = GOALS.find(g => g.id === profile.goal)?.icon || '🎯';

  // Calculate total distance and runs
  const totalDistance = runSessions.reduce((acc, run) => acc + run.distance, 0);
  const totalRuns = runSessions.length;

  // Convert weight history for chart
  const chartData = weightHistory.map(entry => ({
    date: entry.date,
    weight: entry.weight,
  }));

  return (
    <div className="pb-24 md:pb-8">
      {/* Header */}
      <div className="mb-6">
        <p className="text-muted-foreground text-sm">
          {format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}
        </p>
        <h1 className="text-2xl md:text-3xl font-bold mt-1">
          Olá, <span className="gradient-text">{profile.name.split(' ')[0]}</span>! 👋
        </h1>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        <StatsCard
          title="Peso Atual"
          value={profile.weight}
          unit="kg"
          icon={<Scale className="w-5 h-5" />}
          trend={weightChange > 0 ? 'up' : weightChange < 0 ? 'down' : 'neutral'}
          trendValue={weightChange !== 0 ? `${weightChange > 0 ? '+' : ''}${weightChange.toFixed(1)} kg` : '0 kg'}
          color="primary"
        />
        <StatsCard
          title="Altura"
          value={profile.height}
          unit="cm"
          icon={<Ruler className="w-5 h-5" />}
          color="info"
        />
        <StatsCard
          title="Corridas"
          value={totalRuns}
          icon={<TrendingUp className="w-5 h-5" />}
          color="success"
        />
        <StatsCard
          title="Distância Total"
          value={totalDistance.toFixed(1)}
          unit="km"
          icon={<Target className="w-5 h-5" />}
          color="warning"
        />
      </div>

      {/* Main Grid */}
      <div className="grid md:grid-cols-2 gap-4 md:gap-6 mb-6">
        <BMIGauge bmi={bmi} />
        <PointsBadge points={profile.points} />
      </div>

      {/* Weight Chart */}
      <div className="mb-6">
        <WeightChart data={chartData} />
      </div>

      {/* Challenges Section */}
      <div className="mb-6">
        <ChallengesSection />
      </div>

      {/* Goal Card */}
      <div className="stat-card mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-secondary flex items-center justify-center text-3xl">
            {goalIcon}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Seu objetivo</p>
            <p className="text-xl font-bold">{goalLabel}</p>
          </div>
        </div>
      </div>

      {/* Add Weight Button */}
      <Button
        variant="energy"
        size="lg"
        className="w-full md:w-auto"
        onClick={() => setShowWeightModal(true)}
      >
        <Plus className="w-5 h-5" />
        Registrar Peso
      </Button>

      <AddWeightModal
        isOpen={showWeightModal}
        onClose={() => setShowWeightModal(false)}
      />
    </div>
  );
}
