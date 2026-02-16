import { Dashboard } from '@/components/dashboard/Dashboard';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Bot } from 'lucide-react';

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
        variant="energy"
        className="fixed bottom-24 right-4 z-[70] md:bottom-8 md:right-8"
        onClick={() => navigate('/assistant')}
      >
        <Bot className="w-4 h-4" />
        PERSONAL AMIGO
      </Button>
    </AppLayout>
  );
};

export default DashboardPage;
