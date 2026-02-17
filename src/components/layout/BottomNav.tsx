import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, Home, ImagePlus, SquarePlay, User } from 'lucide-react';

import { useProfile } from '@/hooks/useProfile';
import { SOCIAL_HUB_STORAGE_PREFIX } from '@/lib/storageKeys';
import { normalizeHandle } from '@/lib/handleUtils';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/dashboard', label: 'Inicio', icon: Home },
  { path: '/feed', label: 'Feed', icon: ImagePlus },
  { path: '/friends', label: 'Rede', icon: SquarePlay },
  { path: '/notifications', label: 'Atividade', icon: Bell },
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

const pathMatches = (pathname: string, path: string) => {
  if (pathname === path) return true;
  if (path === '/friends') return pathname === '/chat';
  return false;
};

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useProfile();
  const [unreadCount, setUnreadCount] = useState(0);
  const remoteSocialStateAvailableRef = useRef(true);

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

  useEffect(() => {
    remoteSocialStateAvailableRef.current = true;
  }, [profile?.id]);

  const unreadCountLabel = useMemo(
    () => (unreadCount > 99 ? '99+' : String(unreadCount)),
    [unreadCount]
  );

  return (
    <nav className="social-mobile-tabbar md:hidden">
      <div className="flex items-center justify-around gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathMatches(location.pathname, item.path);
          const isNotificationsItem = item.path === '/notifications';
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate(item.path)}
              className={cn('social-mobile-tabbar-item', isActive && 'active')}
              aria-label={item.label}
            >
              <Icon className="h-5 w-5" />
              {isNotificationsItem && unreadCount > 0 && (
                <span className="social-counter-badge -right-1 -top-1 min-w-4 px-1 text-[10px]">
                  {unreadCountLabel}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
