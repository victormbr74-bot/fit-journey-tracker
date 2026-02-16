import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  Bot,
  Dumbbell,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  MessageCircle,
  Trophy,
  User,
  Users,
  Utensils,
} from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

const navItems = [
  { path: '/dashboard', label: 'HOME FEED', icon: LayoutDashboard },
  { path: '/friends', label: 'AMIGOS', icon: Users },
  { path: '/clans', label: 'CLÃ', icon: Trophy },
  { path: '/chat', label: 'CHAT', icon: MessageCircle },
  { path: '/notifications', label: 'NOTIFICACOES', icon: Bell },
  { path: '/workout', label: 'TREINO', icon: Dumbbell },
  { path: '/diet', label: 'DIETA', icon: Utensils },
  { path: '/running', label: 'CORRIDA', icon: MapPin },
  { path: '/assistant', label: 'PERSONAL AMIGO', icon: Bot },
  { path: '/profile', label: 'PERFIL', icon: User },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { profile } = useProfile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const userName = useMemo(
    () => profile?.name || user?.name || user?.email?.split('@')[0] || 'Usuario',
    [profile?.name, user?.email, user?.name]
  );

  const userEmail = useMemo(
    () => profile?.email || user?.email || 'sem-email',
    [profile?.email, user?.email]
  );

  const navigateTo = (path: string) => {
    navigate(path);
    setMobileMenuOpen(false);
  };

  const handleLogout = async () => {
    await signOut();
    setMobileMenuOpen(false);
    navigate('/');
  };

  return (
    <>
      <aside className="hidden md:flex flex-col w-64 min-h-screen bg-card border-r border-border p-4">
        <div className="flex items-center gap-3 mb-8 px-2">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
            <Dumbbell className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold gradient-text">FitTrack</span>
        </div>

        <div className="glass-card p-3 mb-6">
          <p className="font-medium truncate">{userName}</p>
          <p className="text-sm text-muted-foreground truncate">{userEmail}</p>
        </div>

        <nav className="flex-1 space-y-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => navigateTo(item.path)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                  isActive
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-destructive hover:bg-destructive/10 transition-all duration-300"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium">Sair</span>
        </button>
      </aside>

      <header className="fixed top-0 left-0 right-0 z-50 md:hidden border-b border-border bg-card/95 backdrop-blur-xl">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={() => navigateTo('/dashboard')}
            className="flex items-center gap-2"
          >
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Dumbbell className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-base font-bold gradient-text">FitTrack</span>
          </button>

          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-secondary/70 text-foreground"
                aria-label="Abrir menu"
              >
                <Menu className="w-5 h-5" />
              </button>
            </SheetTrigger>

            <SheetContent side="left" className="w-[86vw] max-w-sm border-border bg-card p-4">
              <div className="flex items-center gap-3 mb-6 mt-5">
                <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
                  <Dumbbell className="w-5 h-5 text-primary-foreground" />
                </div>
                <span className="text-xl font-bold gradient-text">FitTrack</span>
              </div>

              <div className="glass-card p-3 mb-5">
                <p className="font-medium truncate">{userName}</p>
                <p className="text-sm text-muted-foreground truncate">{userEmail}</p>
              </div>

              <nav className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                {navItems.map((item) => {
                  const isActive = location.pathname === item.path;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.path}
                      onClick={() => navigateTo(item.path)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                        isActive
                          ? 'bg-primary/10 text-primary border border-primary/20'
                          : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="font-medium">{item.label}</span>
                    </button>
                  );
                })}
              </nav>

              <button
                onClick={handleLogout}
                className="mt-5 w-full flex items-center gap-3 px-4 py-3 rounded-xl text-destructive hover:bg-destructive/10 transition-all duration-300"
              >
                <LogOut className="w-5 h-5" />
                <span className="font-medium">Sair</span>
              </button>
            </SheetContent>
          </Sheet>
        </div>
      </header>
    </>
  );
}
