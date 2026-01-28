import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';
import { useUser } from '@/context/UserContext';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

const OnboardingPage = () => {
  const { isAuthenticated, isOnboarded } = useUser();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/');
    } else if (isOnboarded) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, isOnboarded, navigate]);

  if (!isAuthenticated) return null;

  return <OnboardingFlow />;
};

export default OnboardingPage;
