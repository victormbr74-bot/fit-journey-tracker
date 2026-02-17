import { AppLayout } from '@/components/layout/AppLayout';
import { Dashboard } from '@/components/dashboard/Dashboard';
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
      <Dashboard />
      <Button
        type="button"
        variant="glass"
        className="fixed bottom-36 right-4 z-[76] h-10 w-10 rounded-full border-border/70 bg-card/90 p-0 text-foreground shadow-xl md:bottom-24 md:right-8"
        onClick={() => navigate('/assistant')}
        title="Personal"
        aria-label="Personal"
      >
        <img
          src="/assistant-robot-lifting.gif"
          alt="Personal"
          className="h-7 w-7 rounded-full object-cover"
          loading="lazy"
        />
      </Button>
    </AppLayout>
  );
};

export default DashboardPage;
