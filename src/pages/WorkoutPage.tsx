import { WorkoutPlanView } from '@/components/workout/WorkoutPlanView';
import { AssignedWorkoutPlanView } from '@/components/workout/AssignedWorkoutPlanView';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useAssignedPlans } from '@/hooks/useAssignedPlans';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

const WorkoutPage = () => {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const {
    isProfessionalAccount,
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
      <WorkoutPlanView />
    </AppLayout>
  );
};

export default WorkoutPage;
