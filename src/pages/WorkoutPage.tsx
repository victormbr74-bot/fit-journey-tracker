import { WorkoutPlanView } from '@/components/workout/WorkoutPlanView';
import { AppLayout } from '@/components/layout/AppLayout';
import { useUser } from '@/context/UserContext';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

const WorkoutPage = () => {
  const { isAuthenticated, isOnboarded } = useUser();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/');
    } else if (!isOnboarded) {
      navigate('/onboarding');
    }
  }, [isAuthenticated, isOnboarded, navigate]);

  if (!isAuthenticated || !isOnboarded) return null;

  return (
    <AppLayout>
      <WorkoutPlanView />
    </AppLayout>
  );
};

export default WorkoutPage;
