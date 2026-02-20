import { ReactNode, useEffect, useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useProfile } from '@/hooks/useProfile';
import { getLevelInfo } from '@/lib/leveling';

import { BottomNav } from './BottomNav';
import { LevelUpCelebration } from './LevelUpCelebration';
import { Sidebar } from './Sidebar';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isChatScreen = location.pathname === '/chat';
  const { profile } = useProfile();
  const lastKnownLevelRef = useRef<number | null>(null);
  const [levelUpCelebration, setLevelUpCelebration] = useState<{
    level: number;
    title: string;
    points: number;
  } | null>(null);

  useEffect(() => {
    lastKnownLevelRef.current = null;
    setLevelUpCelebration(null);
  }, [profile?.id]);

  useEffect(() => {
    if (!profile) return;

    const nextLevelInfo = getLevelInfo(profile.points || 0);
    const previousLevel = lastKnownLevelRef.current;

    if (previousLevel === null) {
      lastKnownLevelRef.current = nextLevelInfo.level;
      return;
    }

    if (nextLevelInfo.level > previousLevel) {
      setLevelUpCelebration({
        level: nextLevelInfo.level,
        title: nextLevelInfo.title,
        points: profile.points || 0,
      });
    }

    lastKnownLevelRef.current = nextLevelInfo.level;
  }, [profile]);

  return (
    <div className="social-app-shell min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-auto px-3 pb-24 pt-20 md:px-6 md:pb-8 md:pt-6 md:pl-[92px]">
        <div className="mx-auto w-full max-w-[1024px]">
          {children}
        </div>
      </main>
      {!isChatScreen && (
        <button
          type="button"
          onClick={() => navigate('/chat')}
          className="fixed bottom-20 right-4 z-[75] inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition-transform hover:scale-[1.04] md:bottom-8 md:right-8"
          title="Abrir chat"
          aria-label="Abrir chat"
        >
          <MessageCircle className="h-5 w-5" />
        </button>
      )}
      <LevelUpCelebration
        open={Boolean(levelUpCelebration)}
        level={levelUpCelebration?.level || 1}
        title={levelUpCelebration?.title || 'Iniciante'}
        points={levelUpCelebration?.points || 0}
        onClose={() => setLevelUpCelebration(null)}
      />
      <BottomNav />
    </div>
  );
}
