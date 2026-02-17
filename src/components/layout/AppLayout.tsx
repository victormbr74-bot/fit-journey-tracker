import { ReactNode } from 'react';
import { BottomNav } from './BottomNav';
import { Sidebar } from './Sidebar';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="social-app-shell min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-auto px-3 pb-24 pt-20 md:px-6 md:pb-8 md:pt-6 md:pl-[92px]">
        <div className="mx-auto w-full max-w-[1024px]">
          {children}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
