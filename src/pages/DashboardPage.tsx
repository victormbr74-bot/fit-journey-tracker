import { AppLayout } from '@/components/layout/AppLayout';
import { SocialHub } from '@/components/social/SocialHub';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

const DashboardPage = () => {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/');
    } else if (!authLoading && !profileLoading && user && !profile) {
      navigate('/onboarding');
    }
  }, [user, profile, authLoading, profileLoading, navigate]);

  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user || !profile) return null;

  return (
    <AppLayout>
      <SocialHub profile={profile} defaultSection="feed" showSectionTabs={false} />
      <Button
        type="button"
        variant="energy"
        className="fixed bottom-6 right-4 z-[70] h-12 rounded-full px-5 shadow-xl md:bottom-8 md:right-8"
        onClick={() => navigate('/assistant')}
      >
        <img
          src="/assistant-robot-lifting.gif"
          alt="Robo levantando peso"
          className="h-6 w-6 rounded-full object-cover"
          loading="lazy"
        />
        PERSONAL AMIGO
      </Button>
    </AppLayout>
  );
};

export default DashboardPage;
