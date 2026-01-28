import { DietPlanView } from '@/components/diet/DietPlanView';
import { AppLayout } from '@/components/layout/AppLayout';
import { useUser } from '@/context/UserContext';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

const DietPage = () => {
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
      <DietPlanView />
    </AppLayout>
  );
};

export default DietPage;
