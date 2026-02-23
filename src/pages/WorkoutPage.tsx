import { WorkoutPlanView } from '@/components/workout/WorkoutPlanView';
import { AssignedWorkoutPlanView } from '@/components/workout/AssignedWorkoutPlanView';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useAssignedPlans } from '@/hooks/useAssignedPlans';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Lock, UserRound } from 'lucide-react';

const WorkoutPage = () => {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const {
    isProfessionalAccount,
    hasPersonalPackage,
    assignedWorkoutPlan,
    loadingWorkoutPlan,
  } = useAssignedPlans();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/');
    } else if (!authLoading && !profileLoading && user && !profile) {
      navigate('/onboarding');
    }
  }, [user, profile, authLoading, profileLoading, navigate]);

  if (authLoading || profileLoading || (!isProfessionalAccount && loadingWorkoutPlan)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user || !profile) return null;

  if (!isProfessionalAccount && assignedWorkoutPlan) {
    return (
      <AppLayout>
        <AssignedWorkoutPlanView assignment={assignedWorkoutPlan} />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      {!isProfessionalAccount && !hasPersonalPackage ? (
        <Card className="glass-card mb-6 border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="w-4 h-4 text-primary" />
              Treino com personal bloqueado
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Para receber treino personalizado de um personal trainer, ative o pacote no seu perfil.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => navigate('/profile')}>
              Ir para Perfil
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!isProfessionalAccount && hasPersonalPackage && !assignedWorkoutPlan ? (
        <Card className="glass-card mb-6 border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <UserRound className="w-4 h-4 text-primary" />
              Pacote com personal ativo
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Aguardando seu personal publicar um treino. Enquanto isso, voce pode usar o treino do app.
          </CardContent>
        </Card>
      ) : null}

      <WorkoutPlanView />
    </AppLayout>
  );
};

export default WorkoutPage;
