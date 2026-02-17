import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Search,
  Trophy,
  User,
  Users,
  Utensils,
} from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { SOCIAL_HUB_STORAGE_PREFIX } from '@/lib/storageKeys';
import { normalizeHandle } from '@/lib/handleUtils';
import { supabase } from '@/integrations/supabase/client';

const navItems = [
  { path: '/dashboard', label: 'HOME FEED', icon: LayoutDashboard },
  { path: '/search', label: 'PESQUISA', icon: Search },
  { path: '/friends', label: 'AMIGOS', icon: Users },
  { path: '/clans', label: 'CLA', icon: Trophy },
  { path: '/chat', label: 'CHAT', icon: MessageCircle },
  { path: '/notifications', label: 'NOTIFICACOES', icon: Bell },
  { path: '/workout', label: 'TREINO', icon: Dumbbell },
  { path: '/diet', label: 'DIETA', icon: Utensils },
  { path: '/running', label: 'CORRIDA', icon: MapPin },
  { path: '/assistant', label: 'PERSONAL AMIGO', icon: Bot },
  { path: '/profile', label: 'PERFIL', icon: User },
];

const isMissingSocialGlobalStateError = (
  error: { code?: string; message?: string; details?: string } | null | undefined
) => {
  if (!error) return false;
  if (error.code === 'PGRST205') return true;
  const combinedText = `${error.message || ''} ${error.details || ''}`.toLowerCase();
  return combinedText.includes('social_global_state') && (
    combinedText.includes('not found') || combinedText.includes('could not find')
  );
};

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { profile } = useProfile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const remoteSocialStateAvailableRef = useRef(true);

  const userName = useMemo(
    () => profile?.name || user?.name || user?.email?.split('@')[0] || 'Usuario',
    [profile?.name, user?.email, user?.name]
  );

  const userEmail = useMemo(
    () => profile?.email || user?.email || 'sem-email',
    [profile?.email, user?.email]
  );

  const refreshUnreadCount = useCallback(async () => {
    if (!profile?.id) {
      setUnreadCount(0);
      return;
    }

    let unreadLocalNotifications = 0;
    const socialHubStorageKey = `${SOCIAL_HUB_STORAGE_PREFIX}${profile.id}`;
    const rawState = window.localStorage.getItem(socialHubStorageKey);
    if (rawState) {
      try {
        const parsed = JSON.parse(rawState) as {
          notifications?: Array<{ read?: boolean }>;
        };
        unreadLocalNotifications = Array.isArray(parsed.notifications)
          ? parsed.notifications.filter((item) => !item?.read).length
          : 0;
      } catch (error) {
        console.error('Erro ao ler notificacoes locais:', error);
      }
    }

    let pendingFriendRequests = 0;
    if (remoteSocialStateAvailableRef.current) {
      try {
        const { data, error } = await supabase
          .from('social_global_state')
          .select('friend_requests')
          .eq('id', true)
          .maybeSingle();

        if (error) {
          if (isMissingSocialGlobalStateError(error)) {
            remoteSocialStateAvailableRef.current = false;
          } else {
            console.error('Erro ao consultar solicitacoes pendentes:', error);
          }
        } else if (data) {
          const requests = Array.isArray(data.friend_requests) ? data.friend_requests : [];
          const normalizedHandle = normalizeHandle(profile.handle || '');
          pendingFriendRequests = requests.filter((request) => {
            if (!request || typeof request !== 'object') return false;
            const typedRequest = request as {
              status?: string;
              receiverProfileId?: string;
              receiverHandle?: string;
            };
            if (typedRequest.status !== 'pending') return false;
            if (typedRequest.receiverProfileId === profile.id) return true;
            return normalizeHandle(typedRequest.receiverHandle || '') === normalizedHandle;
          }).length;
        }
      } catch (error) {
        console.error('Erro ao atualizar contador de notificacoes:', error);
      }
    }

    setUnreadCount(unreadLocalNotifications + pendingFriendRequests);
  }, [profile?.handle, profile?.id]);

  useEffect(() => {
    refreshUnreadCount();

    const intervalId = window.setInterval(() => {
      refreshUnreadCount();
    }, 5000);

    const socialHubStorageKey = profile?.id ? `${SOCIAL_HUB_STORAGE_PREFIX}${profile.id}` : '';
    const onStorage = (event: StorageEvent) => {
      if (!socialHubStorageKey) return;
      if (event.key === socialHubStorageKey) {
        refreshUnreadCount();
      }
    };

    window.addEventListener('storage', onStorage);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('storage', onStorage);
    };
  }, [profile?.id, refreshUnreadCount]);

  const unreadCountLabel = unreadCount > 99 ? '99+' : String(unreadCount);

  useEffect(() => {
    remoteSocialStateAvailableRef.current = true;
  }, [profile?.id]);

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
            const isNotificationsItem = item.path === '/notifications';
            return (
              <button
                key={item.path}
                onClick={() => navigateTo(item.path)}
                className={`relative w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                  isActive
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
                {isNotificationsItem && unreadCount > 0 && (
                  <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-foreground">
                    {unreadCountLabel}
                  </span>
                )}
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

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigateTo('/notifications')}
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-secondary/70 text-foreground"
              aria-label="Abrir notificacoes"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1 py-0.5 text-[10px] font-semibold text-primary-foreground">
                  {unreadCountLabel}
                </span>
              )}
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
                  const isNotificationsItem = item.path === '/notifications';
                  return (
                    <button
                      key={item.path}
                      onClick={() => navigateTo(item.path)}
                      className={`relative w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                        isActive
                          ? 'bg-primary/10 text-primary border border-primary/20'
                          : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="font-medium">{item.label}</span>
                      {isNotificationsItem && unreadCount > 0 && (
                        <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-foreground">
                          {unreadCountLabel}
                        </span>
                      )}
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
        </div>
      </header>
    </>
  );
}
