import { AuthForm } from '@/components/auth/AuthForm';
import { useUser } from '@/context/UserContext';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

const Index = () => {
  const { isAuthenticated, isOnboarded } = useUser();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      if (isOnboarded) {
        navigate('/dashboard');
      } else {
        navigate('/onboarding');
      }
    }
  }, [isAuthenticated, isOnboarded, navigate]);

  return <AuthForm />;
};

export default Index;
