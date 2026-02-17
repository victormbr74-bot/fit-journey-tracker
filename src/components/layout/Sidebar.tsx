import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Bot,
  Dumbbell,
  Heart,
  Home,
  LogOut,
  MapPin,
  Menu,
  MessageCircle,
  Search,
  SquarePlay,
  Trophy,
  User,
  Utensils,
} from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { SOCIAL_HUB_STORAGE_PREFIX } from '@/lib/storageKeys';
import { normalizeHandle } from '@/lib/handleUtils';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { disableSocialGlobalState, isSocialGlobalStateAvailable } from '@/lib/socialSyncCapability';

const primaryNavItems = [
  { path: '/dashboard', label: 'Inicio', icon: Home },
  { path: '/search', label: 'Pesquisar', icon: Search },
  { path: '/friends', label: 'Rede', icon: SquarePlay },
  { path: '/chat', label: 'Mensagens', icon: MessageCircle },
  { path: '/notifications', label: 'Atividade', icon: Heart },
];

const secondaryNavItems = [
  { path: '/workout', label: 'Treino', icon: Dumbbell },
  { path: '/diet', label: 'Dieta', icon: Utensils },
  { path: '/running', label: 'Corrida', icon: MapPin },
  { path: '/clans', label: 'CLA', icon: Trophy },
  { path: '/assistant', label: 'Personal amigo', icon: Bot },
];

const allNavItems = [
  ...primaryNavItems,
  ...secondaryNavItems,
  { path: '/profile', label: 'Perfil', icon: User },
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

const getUserInitials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'U';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
};

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { profile } = useProfile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

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
    if (isSocialGlobalStateAvailable()) {
      try {
        const { data, error } = await supabase
          .from('social_global_state')
          .select('friend_requests')
          .eq('id', true)
          .maybeSingle();

        if (error) {
          if (isMissingSocialGlobalStateError(error)) {
            disableSocialGlobalState();
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
      <aside className="social-desktop-sidebar hidden md:flex">
        <button
          type="button"
          onClick={() => navigateTo('/dashboard')}
          className="social-brand-script"
          aria-label="Abrir inicio"
        >
          SouFit
        </button>

        <nav className="mt-5 flex flex-1 flex-col gap-1">
          {primaryNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            const isNotificationsItem = item.path === '/notifications';
            return (
              <button
                key={item.path}
                type="button"
                title={item.label}
                onClick={() => navigateTo(item.path)}
                className={cn('social-desktop-nav-item', isActive && 'active')}
              >
                <Icon className="h-6 w-6" />
                {isNotificationsItem && unreadCount > 0 && (
                  <span className="social-counter-badge">{unreadCountLabel}</span>
                )}
              </button>
            );
          })}

          <div className="my-2 h-px bg-border/70" />

          {secondaryNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                type="button"
                title={item.label}
                onClick={() => navigateTo(item.path)}
                className={cn('social-desktop-nav-item', isActive && 'active')}
              >
                <Icon className="h-5 w-5" />
              </button>
            );
          })}
        </nav>

        <button
          type="button"
          title={userName}
          onClick={() => navigateTo('/profile')}
          className={cn('social-desktop-nav-item mt-2', location.pathname === '/profile' && 'active')}
        >
          <span className="text-xs font-semibold">{getUserInitials(userName)}</span>
        </button>

        <button
          type="button"
          title="Sair"
          onClick={handleLogout}
          className="social-desktop-nav-item text-destructive"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </aside>

      <header className="social-mobile-header md:hidden">
        <button
          type="button"
          onClick={() => navigateTo('/dashboard')}
          className="social-brand-script text-[1.95rem]"
          aria-label="Abrir inicio"
        >
          SouFit
        </button>

        <button
          type="button"
          onClick={() => navigateTo('/search')}
          className="social-mobile-search"
          aria-label="Abrir pesquisa"
        >
          <Search className="h-4 w-4 text-muted-foreground" />
          <span>Pesquisar</span>
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => navigateTo('/notifications')}
            className={cn('social-mobile-icon-button', location.pathname === '/notifications' && 'active')}
            aria-label="Abrir notificacoes"
          >
            <Heart className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="social-counter-badge -right-1 -top-1 min-w-4 text-[10px]">
                {unreadCountLabel}
              </span>
            )}
          </button>

          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="social-mobile-icon-button"
                aria-label="Abrir menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>

            <SheetContent side="right" className="w-[86vw] max-w-sm border-border bg-card p-4">
              <div className="mb-5 mt-3 rounded-2xl border border-border/80 bg-card/70 p-4">
                <p className="truncate text-sm font-semibold">{userName}</p>
                <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
              </div>

              <nav className="space-y-1">
                {allNavItems.map((item) => {
                  const isActive = location.pathname === item.path;
                  const Icon = item.icon;
                  const isNotificationsItem = item.path === '/notifications';
                  return (
                    <button
                      key={item.path}
                      type="button"
                      onClick={() => navigateTo(item.path)}
                      className={cn(
                        'relative flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm',
                        isActive ? 'bg-primary/15 text-foreground' : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                      {isNotificationsItem && unreadCount > 0 && (
                        <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white">
                          {unreadCountLabel}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>

              <button
                type="button"
                onClick={handleLogout}
                className="mt-5 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-destructive hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" />
                <span>Sair</span>
              </button>
            </SheetContent>
          </Sheet>
        </div>
      </header>
    </>
  );
}
