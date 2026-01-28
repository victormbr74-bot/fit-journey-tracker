import { ProfilePage as Profile } from '@/components/profile/ProfilePage';
import { AppLayout } from '@/components/layout/AppLayout';
import { useUser } from '@/context/UserContext';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

const ProfilePageRoute = () => {
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
      <Profile />
    </AppLayout>
  );
};

export default ProfilePageRoute;
