import { RunningTracker } from '@/components/running/RunningTracker';
import { AppLayout } from '@/components/layout/AppLayout';
import { useUser } from '@/context/UserContext';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

const RunningPage = () => {
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
      <RunningTracker />
    </AppLayout>
  );
};

export default RunningPage;
