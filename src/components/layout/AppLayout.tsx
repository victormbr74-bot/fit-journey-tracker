import { ReactNode } from 'react';
import { MessageCircle } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { BottomNav } from './BottomNav';
import { Sidebar } from './Sidebar';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isChatScreen = location.pathname === '/chat';

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
      <BottomNav />
    </div>
  );
}
