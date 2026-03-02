import { AuthForm } from '@/components/auth/AuthForm';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import soufitLogo from '@/assets/soufit-logo.png';

const Index = () => {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && user) {
      if (!profileLoading) {
        if (profile) {
          navigate('/dashboard');
        } else {
          navigate('/onboarding');
        }
      }
    }
  }, [user, profile, authLoading, profileLoading, navigate]);

  if (authLoading || (user && profileLoading)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-6">
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-primary/30 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-primary/20 rounded-full blur-[100px]" />
        </div>
        <div className="relative z-10 flex flex-col items-center gap-4 animate-pulse">
          <img src={soufitLogo} alt="SouFit" className="w-20 h-20 object-contain" />
          <h1 className="text-3xl font-black tracking-tight">
            <span className="gradient-text">SouFit</span>
          </h1>
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mt-2" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  return <AuthForm />;
};

export default Index;
