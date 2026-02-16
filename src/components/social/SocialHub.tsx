import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  BellRing,
  Camera,
  Check,
  CheckCheck,
  CheckCircle2,
  Copy,
  Heart,
  ImagePlus,
  Instagram,
  MessageCircle,
  Plus,
  Send,
  Target,
  Trophy,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  SOCIAL_GLOBAL_FEED_STORAGE_KEY,
  SOCIAL_GLOBAL_FRIEND_REQUESTS_STORAGE_KEY,
  SOCIAL_GLOBAL_STORIES_STORAGE_KEY,
  SOCIAL_HUB_STORAGE_PREFIX,
} from '@/lib/storageKeys';
import { UserProfile } from '@/types/user';
import {
  SocialClan,
  SocialClanChallenge,
  SocialClanGoal,
  SocialChatMessage,
  SocialFeedPost,
  SocialFriend,
  SocialFriendRequest,
  SocialNotification,
  SocialNotificationType,
  SocialSection,
  SocialState,
  SocialStory,
} from '@/types/social';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

interface SocialHubProps {
  profile: UserProfile;
  defaultSection?: SocialSection;
  showSectionTabs?: boolean;
}

const EMPTY_SOCIAL_STATE: SocialState = {
  friends: [],
  clans: [],
  posts: [],
  chatMessages: [],
  notifications: [],
};

const PROFILE_GOAL_LABEL: Record<UserProfile['goal'], string> = {
  lose_weight: 'Perder peso',
  gain_muscle: 'Ganhar massa',
  maintain: 'Manter forma',
  endurance: 'Melhorar resistencia',
};

const NOTIFICATION_LIMIT = 120;
const MAX_IMAGE_SIZE = 1080;
const GLOBAL_FEED_POST_LIMIT = 500;
const GLOBAL_STORY_LIMIT = 500;
const GLOBAL_FRIEND_REQUEST_LIMIT = 500;
const STORY_DURATION_HOURS = 24;

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const normalizeHandle = (value: string) => value.trim().replace(/^@+/, '').toLowerCase();

const formatDateTime = (isoDate: string) => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR');
};

const formatTime = (isoDate: string) => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const formatDate = (isoDate: string) => {
  if (!isoDate) return '-';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
};

const isStoryActive = (story: SocialStory) => new Date(story.expiresAt).getTime() > Date.now();

const sanitizeStories = (stories: SocialStory[]) =>
  stories
    .filter((story) => story?.id && story.imageDataUrl && isStoryActive(story))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, GLOBAL_STORY_LIMIT);

const sanitizeFriendRequests = (requests: SocialFriendRequest[]) =>
  requests
    .filter((request) => request?.id && request.senderHandle && request.receiverHandle)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, GLOBAL_FRIEND_REQUEST_LIMIT);

const convertImageToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const maxDimension = Math.max(image.width, image.height);
        const scale = maxDimension > MAX_IMAGE_SIZE ? MAX_IMAGE_SIZE / maxDimension : 1;
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) {
          resolve(String(reader.result));
          return;
        }

        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };

      image.onerror = () => reject(new Error('Erro ao processar imagem.'));
      image.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Erro ao ler imagem.'));
    reader.readAsDataURL(file);
  });

const dataUrlToFile = async (dataUrl: string, filename: string): Promise<File> => {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type || 'image/jpeg' });
};

const notificationTypeLabel: Record<SocialNotificationType, string> = {
  friend: 'Amigo',
  clan: 'CLÃ',
  goal: 'Meta',
  challenge: 'Desafio',
  post: 'Feed',
  chat: 'Chat',
  system: 'Sistema',
};

const mergePosts = (...lists: SocialFeedPost[][]): SocialFeedPost[] => {
  const map = new Map<string, SocialFeedPost>();
  lists.flat().forEach((post) => {
    const previous = map.get(post.id);
    if (!previous) {
      map.set(post.id, post);
      return;
    }
    if (new Date(post.createdAt).getTime() > new Date(previous.createdAt).getTime()) {
      map.set(post.id, post);
    }
  });
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
};

const getInitials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
};

export function SocialHub({ profile, defaultSection = 'friends', showSectionTabs = true }: SocialHubProps) {
  const storageKey = useMemo(() => `${SOCIAL_HUB_STORAGE_PREFIX}${profile.id}`, [profile.id]);
  const profileHandle = useMemo(
    () => `@${profile.name.trim().toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9._]/g, '') || 'fit.user'}`,
    [profile.name]
  );
  const normalizedProfileHandle = useMemo(() => normalizeHandle(profileHandle), [profileHandle]);

  const [socialState, setSocialState] = useState<SocialState>(EMPTY_SOCIAL_STATE);
  const [globalPosts, setGlobalPosts] = useState<SocialFeedPost[]>([]);
  const [globalStories, setGlobalStories] = useState<SocialStory[]>([]);
  const [friendRequests, setFriendRequests] = useState<SocialFriendRequest[]>([]);
  const [loadedStorageKey, setLoadedStorageKey] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SocialSection>(defaultSection);

  const [friendName, setFriendName] = useState('');
  const [friendHandle, setFriendHandle] = useState('');
  const [friendGoal, setFriendGoal] = useState('');

  const [clanName, setClanName] = useState('');
  const [clanDescription, setClanDescription] = useState('');
  const [clanMemberIds, setClanMemberIds] = useState<string[]>([]);

  const [goalClanId, setGoalClanId] = useState('');
  const [goalTitle, setGoalTitle] = useState('');
  const [goalTargetValue, setGoalTargetValue] = useState('10');
  const [goalUnit, setGoalUnit] = useState('treinos');
  const [goalDueDate, setGoalDueDate] = useState('');

  const [challengeClanId, setChallengeClanId] = useState('');
  const [challengeTitle, setChallengeTitle] = useState('');
  const [challengeDescription, setChallengeDescription] = useState('');
  const [challengePoints, setChallengePoints] = useState('150');
  const [challengeDueDate, setChallengeDueDate] = useState('');

  const [activeChatFriendId, setActiveChatFriendId] = useState('');
  const [feedShareFriendId, setFeedShareFriendId] = useState('');
  const [chatInput, setChatInput] = useState('');

  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<'post' | 'story'>('post');
  const [composerCaption, setComposerCaption] = useState('');
  const [composerImageDataUrl, setComposerImageDataUrl] = useState('');
  const [processingComposerImage, setProcessingComposerImage] = useState(false);
  const [activeStoryId, setActiveStoryId] = useState('');

  const composerGalleryInputRef = useRef<HTMLInputElement | null>(null);
  const composerCameraInputRef = useRef<HTMLInputElement | null>(null);
  const chatMessagesContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setActiveSection(defaultSection);
  }, [defaultSection]);

  useEffect(() => {
    const storedGlobalPosts = window.localStorage.getItem(SOCIAL_GLOBAL_FEED_STORAGE_KEY);
    if (storedGlobalPosts) {
      try {
        const parsed = JSON.parse(storedGlobalPosts) as SocialFeedPost[];
        setGlobalPosts(Array.isArray(parsed) ? parsed : []);
      } catch (error) {
        console.error('Erro ao carregar feed global:', error);
        setGlobalPosts([]);
      }
    } else {
      setGlobalPosts([]);
    }

    const storedStories = window.localStorage.getItem(SOCIAL_GLOBAL_STORIES_STORAGE_KEY);
    if (storedStories) {
      try {
        const parsed = JSON.parse(storedStories) as SocialStory[];
        setGlobalStories(sanitizeStories(Array.isArray(parsed) ? parsed : []));
      } catch (error) {
        console.error('Erro ao carregar stories:', error);
        setGlobalStories([]);
      }
    } else {
      setGlobalStories([]);
    }

    const storedFriendRequests = window.localStorage.getItem(SOCIAL_GLOBAL_FRIEND_REQUESTS_STORAGE_KEY);
    if (storedFriendRequests) {
      try {
        const parsed = JSON.parse(storedFriendRequests) as SocialFriendRequest[];
        setFriendRequests(sanitizeFriendRequests(Array.isArray(parsed) ? parsed : []));
      } catch (error) {
        console.error('Erro ao carregar solicitacoes de amizade:', error);
        setFriendRequests([]);
      }
    } else {
      setFriendRequests([]);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      SOCIAL_GLOBAL_FEED_STORAGE_KEY,
      JSON.stringify(globalPosts.slice(0, GLOBAL_FEED_POST_LIMIT))
    );
  }, [globalPosts]);

  useEffect(() => {
    window.localStorage.setItem(
      SOCIAL_GLOBAL_STORIES_STORAGE_KEY,
      JSON.stringify(sanitizeStories(globalStories))
    );
  }, [globalStories]);

  useEffect(() => {
    window.localStorage.setItem(
      SOCIAL_GLOBAL_FRIEND_REQUESTS_STORAGE_KEY,
      JSON.stringify(sanitizeFriendRequests(friendRequests))
    );
  }, [friendRequests]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === SOCIAL_GLOBAL_FEED_STORAGE_KEY) {
        try {
          const parsed = event.newValue ? (JSON.parse(event.newValue) as SocialFeedPost[]) : [];
          setGlobalPosts(Array.isArray(parsed) ? parsed : []);
        } catch (error) {
          console.error('Erro ao sincronizar feed global:', error);
        }
      }

      if (event.key === SOCIAL_GLOBAL_STORIES_STORAGE_KEY) {
        try {
          const parsed = event.newValue ? (JSON.parse(event.newValue) as SocialStory[]) : [];
          setGlobalStories(sanitizeStories(Array.isArray(parsed) ? parsed : []));
        } catch (error) {
          console.error('Erro ao sincronizar stories:', error);
        }
      }

      if (event.key === SOCIAL_GLOBAL_FRIEND_REQUESTS_STORAGE_KEY) {
        try {
          const parsed = event.newValue ? (JSON.parse(event.newValue) as SocialFriendRequest[]) : [];
          setFriendRequests(sanitizeFriendRequests(Array.isArray(parsed) ? parsed : []));
        } catch (error) {
          console.error('Erro ao sincronizar solicitacoes de amizade:', error);
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) {
      setSocialState(EMPTY_SOCIAL_STATE);
      setLoadedStorageKey(storageKey);
      return;
    }

    try {
      const parsed = JSON.parse(stored) as Partial<SocialState>;
      const legacyPosts = parsed.posts || [];
      setSocialState({
        friends: parsed.friends || [],
        clans: parsed.clans || [],
        posts: [],
        chatMessages: parsed.chatMessages || [],
        notifications: parsed.notifications || [],
      });
      if (legacyPosts.length) {
        setGlobalPosts((previous) => mergePosts(previous, legacyPosts));
      }
    } catch (error) {
      console.error('Erro ao carregar dados sociais:', error);
      setSocialState(EMPTY_SOCIAL_STATE);
      toast.error('Nao foi possivel carregar dados do modulo social.');
    }

    setLoadedStorageKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    if (loadedStorageKey !== storageKey) return;
    const { posts: _ignoredPosts, ...stateWithoutPosts } = socialState;
    window.localStorage.setItem(storageKey, JSON.stringify(stateWithoutPosts));
  }, [socialState, storageKey, loadedStorageKey]);

  useEffect(() => {
    if (!socialState.clans.length) {
      setGoalClanId('');
      setChallengeClanId('');
      return;
    }

    if (!socialState.clans.some((clan) => clan.id === goalClanId)) {
      setGoalClanId(socialState.clans[0].id);
    }
    if (!socialState.clans.some((clan) => clan.id === challengeClanId)) {
      setChallengeClanId(socialState.clans[0].id);
    }
  }, [socialState.clans, goalClanId, challengeClanId]);

  useEffect(() => {
    if (!socialState.friends.length) {
      setActiveChatFriendId('');
      setFeedShareFriendId('');
      return;
    }

    if (!socialState.friends.some((friend) => friend.id === activeChatFriendId)) {
      setActiveChatFriendId(socialState.friends[0].id);
    }

    if (!socialState.friends.some((friend) => friend.id === feedShareFriendId)) {
      setFeedShareFriendId(socialState.friends[0].id);
    }
  }, [socialState.friends, activeChatFriendId, feedShareFriendId]);

  const incomingFriendRequests = useMemo(
    () =>
      friendRequests.filter(
        (request) =>
          request.status === 'pending' &&
          normalizeHandle(request.receiverHandle) === normalizedProfileHandle
      ),
    [friendRequests, normalizedProfileHandle]
  );

  const outgoingPendingFriendRequests = useMemo(
    () =>
      friendRequests.filter(
        (request) => request.status === 'pending' && request.senderProfileId === profile.id
      ),
    [friendRequests, profile.id]
  );

  const relatedAcceptedRequests = useMemo(
    () =>
      friendRequests.filter((request) => {
        if (request.status !== 'accepted') return false;
        if (request.senderProfileId === profile.id) return true;
        return normalizeHandle(request.receiverHandle) === normalizedProfileHandle;
      }),
    [friendRequests, profile.id, normalizedProfileHandle]
  );

  useEffect(() => {
    if (!relatedAcceptedRequests.length) return;
    setSocialState((previous) => {
      const knownHandles = new Set(previous.friends.map((friend) => normalizeHandle(friend.handle)));
      const nextFriends = [...previous.friends];

      relatedAcceptedRequests.forEach((request) => {
        const isSender = request.senderProfileId === profile.id;
        const rawFriendHandle = isSender ? request.receiverHandle : request.senderHandle;
        const normalizedFriendHandle = normalizeHandle(rawFriendHandle);

        if (!normalizedFriendHandle || normalizedFriendHandle === normalizedProfileHandle) return;
        if (knownHandles.has(normalizedFriendHandle)) return;

        nextFriends.unshift({
          id: `friend-${request.id}-${isSender ? 'receiver' : 'sender'}`,
          name: isSender ? request.receiverName : request.senderName,
          handle: `@${normalizedFriendHandle}`,
          goal: isSender
            ? request.receiverGoal || 'Sem meta definida'
            : request.senderGoal || 'Sem meta definida',
          addedAt: request.respondedAt || request.createdAt,
        });
        knownHandles.add(normalizedFriendHandle);
      });

      if (nextFriends.length === previous.friends.length) return previous;
      return { ...previous, friends: nextFriends };
    });
  }, [relatedAcceptedRequests, profile.id, normalizedProfileHandle]);

  useEffect(() => {
    if (!activeStoryId) return;
    if (!globalStories.some((story) => story.id === activeStoryId && isStoryActive(story))) {
      setActiveStoryId('');
    }
  }, [globalStories, activeStoryId]);

  const unreadNotifications = useMemo(
    () =>
      socialState.notifications.filter((notification) => !notification.read).length +
      incomingFriendRequests.length,
    [socialState.notifications, incomingFriendRequests.length]
  );

  const friendsById = useMemo(
    () => new Map(socialState.friends.map((friend) => [friend.id, friend])),
    [socialState.friends]
  );

  const postsById = useMemo(
    () => new Map(globalPosts.map((post) => [post.id, post])),
    [globalPosts]
  );

  const activeStories = useMemo(() => sanitizeStories(globalStories), [globalStories]);

  const activeStory = useMemo(
    () => activeStories.find((story) => story.id === activeStoryId) ?? null,
    [activeStories, activeStoryId]
  );

  const activeChatMessages = useMemo(
    () =>
      socialState.chatMessages
        .filter((message) => message.friendId === activeChatFriendId)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [socialState.chatMessages, activeChatFriendId]
  );

  const activeChatFriend = useMemo(
    () => socialState.friends.find((friend) => friend.id === activeChatFriendId) ?? null,
    [socialState.friends, activeChatFriendId]
  );

  useEffect(() => {
    const container = chatMessagesContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [activeChatMessages]);

  const pushNotification = (notification: Omit<SocialNotification, 'id' | 'createdAt' | 'read'>) => {
    const nextNotification: SocialNotification = {
      id: createId(),
      createdAt: new Date().toISOString(),
      read: false,
      ...notification,
    };

    setSocialState((prev) => ({
      ...prev,
      notifications: [nextNotification, ...prev.notifications].slice(0, NOTIFICATION_LIMIT),
    }));

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(nextNotification.title, { body: nextNotification.description });
    }
  };

  const handleEnableBrowserNotifications = async () => {
    if (!('Notification' in window)) {
      toast.error('Seu navegador nao suporta notificacoes nativas.');
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      toast.success('Notificacoes do navegador ativadas.');
      return;
    }
    toast.error('Permissao de notificacoes nao concedida.');
  };

  const handleAddFriend = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const receiverName = friendName.trim();
    const receiverHandleValue = normalizeHandle(friendHandle);
    if (!receiverName || !receiverHandleValue) {
      toast.error('Preencha nome e usuario do amigo.');
      return;
    }

    if (receiverHandleValue === normalizedProfileHandle) {
      toast.error('Nao e possivel enviar solicitacao para voce mesmo.');
      return;
    }

    if (socialState.friends.some((friend) => normalizeHandle(friend.handle) === receiverHandleValue)) {
      toast.error('Esse usuario ja faz parte da sua lista de amigos.');
      return;
    }

    const hasOutgoingPending = friendRequests.some(
      (request) =>
        request.status === 'pending' &&
        request.senderProfileId === profile.id &&
        normalizeHandle(request.receiverHandle) === receiverHandleValue
    );

    if (hasOutgoingPending) {
      toast.error('Solicitacao ja enviada para esse usuario.');
      return;
    }

    const hasIncomingPending = friendRequests.some(
      (request) =>
        request.status === 'pending' &&
        normalizeHandle(request.senderHandle) === receiverHandleValue &&
        normalizeHandle(request.receiverHandle) === normalizedProfileHandle
    );

    if (hasIncomingPending) {
      toast.info('Esse usuario ja te enviou solicitacao. Aceite na lista de recebidas.');
      return;
    }

    const nextRequest: SocialFriendRequest = {
      id: createId(),
      senderProfileId: profile.id,
      senderName: profile.name,
      senderHandle: profileHandle,
      senderGoal: PROFILE_GOAL_LABEL[profile.goal],
      receiverName,
      receiverHandle: `@${receiverHandleValue}`,
      receiverGoal: friendGoal.trim() || 'Sem meta definida',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    setFriendRequests((previous) => sanitizeFriendRequests([nextRequest, ...previous]));
    pushNotification({
      type: 'friend',
      title: 'Solicitacao enviada',
      description: `Aguardando ${receiverName} aceitar sua amizade.`,
    });

    setFriendName('');
    setFriendHandle('');
    setFriendGoal('');
    toast.success('Solicitacao de amizade enviada.');
  };

  const handleAcceptFriendRequest = (requestId: string) => {
    const request = incomingFriendRequests.find((item) => item.id === requestId);
    if (!request) return;

    const respondedAt = new Date().toISOString();
    setFriendRequests((previous) =>
      sanitizeFriendRequests(
        previous.map((item) =>
          item.id === requestId ? { ...item, status: 'accepted', respondedAt } : item
        )
      )
    );

    pushNotification({
      type: 'friend',
      title: 'Amizade confirmada',
      description: `Voce e ${request.senderName} agora sao amigos.`,
    });
    toast.success('Solicitacao aceita.');
  };

  const handleRejectFriendRequest = (requestId: string) => {
    const request = incomingFriendRequests.find((item) => item.id === requestId);
    if (!request) return;

    const respondedAt = new Date().toISOString();
    setFriendRequests((previous) =>
      sanitizeFriendRequests(
        previous.map((item) =>
          item.id === requestId ? { ...item, status: 'rejected', respondedAt } : item
        )
      )
    );

    toast.success('Solicitacao recusada.');
  };

  const handleToggleClanMember = (friendId: string, checked: boolean | 'indeterminate') => {
    setClanMemberIds((prev) => {
      if (checked) {
        return prev.includes(friendId) ? prev : [...prev, friendId];
      }
      return prev.filter((id) => id !== friendId);
    });
  };

  const handleCreateClan = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!clanName.trim()) {
      toast.error('Defina um nome para o CLÃ.');
      return;
    }
    if (!clanMemberIds.length) {
      toast.error('Selecione ao menos 1 amigo para o CLÃ.');
      return;
    }

    const nextClan: SocialClan = {
      id: createId(),
      name: clanName.trim(),
      description: clanDescription.trim(),
      memberIds: clanMemberIds,
      createdAt: new Date().toISOString(),
      goals: [],
      challenges: [],
    };

    setSocialState((prev) => ({ ...prev, clans: [nextClan, ...prev.clans] }));
    pushNotification({
      type: 'clan',
      title: 'CLÃ criado',
      description: `${nextClan.name} pronto para metas coletivas.`,
    });

    setClanName('');
    setClanDescription('');
    setClanMemberIds([]);
    toast.success('CLÃ criado.');
  };

  const handleCreateGoal = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const target = Number(goalTargetValue);
    if (!goalClanId || !goalTitle.trim() || !Number.isFinite(target) || target <= 0) {
      toast.error('Preencha os dados da meta.');
      return;
    }

    const nextGoal: SocialClanGoal = {
      id: createId(),
      title: goalTitle.trim(),
      targetValue: target,
      currentValue: 0,
      unit: goalUnit.trim() || 'pontos',
      dueDate: goalDueDate,
      completed: false,
    };

    setSocialState((prev) => ({
      ...prev,
      clans: prev.clans.map((clan) =>
        clan.id === goalClanId ? { ...clan, goals: [nextGoal, ...clan.goals] } : clan
      ),
    }));

    setGoalTitle('');
    setGoalTargetValue('10');
    setGoalUnit('treinos');
    setGoalDueDate('');
    toast.success('Meta criada.');
  };

  const handleCreateChallenge = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const points = Number(challengePoints);
    if (!challengeClanId || !challengeTitle.trim() || !Number.isFinite(points) || points <= 0) {
      toast.error('Preencha os dados do desafio.');
      return;
    }

    const nextChallenge: SocialClanChallenge = {
      id: createId(),
      title: challengeTitle.trim(),
      description: challengeDescription.trim(),
      points,
      dueDate: challengeDueDate,
      completed: false,
    };

    setSocialState((prev) => ({
      ...prev,
      clans: prev.clans.map((clan) =>
        clan.id === challengeClanId
          ? { ...clan, challenges: [nextChallenge, ...clan.challenges] }
          : clan
      ),
    }));

    setChallengeTitle('');
    setChallengeDescription('');
    setChallengePoints('150');
    setChallengeDueDate('');
    toast.success('Desafio criado.');
  };

  const handleIncreaseGoalProgress = (clanId: string, goalId: string) => {
    setSocialState((prev) => ({
      ...prev,
      clans: prev.clans.map((clan) => {
        if (clan.id !== clanId) return clan;
        return {
          ...clan,
          goals: clan.goals.map((goal) => {
            if (goal.id !== goalId) return goal;
            const currentValue = Math.min(goal.targetValue, goal.currentValue + 1);
            return { ...goal, currentValue, completed: currentValue >= goal.targetValue };
          }),
        };
      }),
    }));
  };

  const handleToggleChallengeDone = (clanId: string, challengeId: string) => {
    setSocialState((prev) => ({
      ...prev,
      clans: prev.clans.map((clan) => {
        if (clan.id !== clanId) return clan;
        return {
          ...clan,
          challenges: clan.challenges.map((challenge) =>
            challenge.id === challengeId ? { ...challenge, completed: !challenge.completed } : challenge
          ),
        };
      }),
    }));
  };

  const resetComposer = () => {
    setComposerCaption('');
    setComposerImageDataUrl('');
    setProcessingComposerImage(false);
    if (composerGalleryInputRef.current) composerGalleryInputRef.current.value = '';
    if (composerCameraInputRef.current) composerCameraInputRef.current.value = '';
  };

  const closeComposer = () => {
    setIsComposerOpen(false);
    resetComposer();
    setComposerMode('post');
  };

  const openComposer = (mode: 'post' | 'story') => {
    setComposerMode(mode);
    setIsComposerOpen(true);
  };

  const openComposerAndPick = (mode: 'post' | 'story', picker: 'gallery' | 'camera') => {
    openComposer(mode);
    window.setTimeout(() => {
      if (picker === 'gallery') {
        composerGalleryInputRef.current?.click();
        return;
      }
      composerCameraInputRef.current?.click();
    }, 0);
  };

  const handleComposerImageSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Selecione uma imagem valida.');
      return;
    }

    setProcessingComposerImage(true);
    try {
      const dataUrl = await convertImageToDataUrl(file);
      setComposerImageDataUrl(dataUrl);
    } catch (error) {
      console.error('Erro ao processar imagem:', error);
      toast.error('Nao foi possivel processar a imagem.');
    } finally {
      setProcessingComposerImage(false);
    }
  };

  const handlePublishComposer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!composerImageDataUrl) {
      toast.error('Adicione uma foto para publicar.');
      return;
    }

    if (composerMode === 'post' && !composerCaption.trim()) {
      toast.error('Adicione uma legenda para publicar no feed.');
      return;
    }

    if (composerMode === 'post') {
      const nextPost: SocialFeedPost = {
        id: createId(),
        authorName: profile.name,
        authorHandle: profileHandle,
        caption: composerCaption.trim(),
        imageDataUrl: composerImageDataUrl,
        createdAt: new Date().toISOString(),
        likes: 0,
        sharedCount: 0,
      };

      setGlobalPosts((previous) => mergePosts([nextPost], previous));
      pushNotification({
        type: 'post',
        title: 'Novo post no feed',
        description: `${profile.name} publicou uma nova foto.`,
      });
      toast.success('Post publicado.');
      closeComposer();
      return;
    }

    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + STORY_DURATION_HOURS * 60 * 60 * 1000);

    const nextStory: SocialStory = {
      id: createId(),
      authorName: profile.name,
      authorHandle: profileHandle,
      caption: composerCaption.trim(),
      imageDataUrl: composerImageDataUrl,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    setGlobalStories((previous) => sanitizeStories([nextStory, ...previous]));
    pushNotification({
      type: 'post',
      title: 'Nova story',
      description: `${profile.name} publicou uma story.`,
    });
    toast.success('Story publicada.');
    closeComposer();
  };

  const handleLikePost = (postId: string) => {
    setGlobalPosts((previous) =>
      previous.map((post) => (post.id === postId ? { ...post, likes: post.likes + 1 } : post))
    );
  };

  const markPostAsShared = (postId: string) => {
    setGlobalPosts((previous) =>
      previous.map((post) =>
        post.id === postId ? { ...post, sharedCount: post.sharedCount + 1 } : post
      )
    );
  };

  const buildShareText = (post: SocialFeedPost) =>
    `${post.caption}\n\nCompartilhado via FitTrack ${post.authorHandle}\n#FitTrack #JornadaFitness`;

  const handleShareOnWhatsApp = (post: SocialFeedPost) => {
    const url = `https://wa.me/?text=${encodeURIComponent(buildShareText(post))}`;
    const popup = window.open(url, '_blank', 'noopener,noreferrer');
    if (!popup) {
      toast.error('Nao foi possivel abrir o WhatsApp. Verifique o bloqueio de pop-up.');
      return;
    }
    markPostAsShared(post.id);
    toast.success('Abrindo WhatsApp.');
  };

  const handleShareOnInstagram = async (post: SocialFeedPost) => {
    const text = buildShareText(post);
    if (navigator.share) {
      try {
        const file = await dataUrlToFile(post.imageDataUrl, `fittrack-post-${post.id}.jpg`);
        const canShareWithFile = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
        if (canShareWithFile) {
          await navigator.share({ title: 'Meu progresso no FitTrack', text, files: [file] });
        } else {
          await navigator.share({ title: 'Meu progresso no FitTrack', text });
        }
        markPostAsShared(post.id);
        toast.success('Compartilhamento iniciado.');
        return;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        console.error('Erro no compartilhamento nativo:', error);
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      toast.success('Legenda copiada para o Instagram.');
    } catch (error) {
      console.error('Erro ao copiar legenda:', error);
    }

    const popup = window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
    if (!popup) {
      toast.error('Nao foi possivel abrir o Instagram. Verifique o bloqueio de pop-up.');
      return;
    }
    markPostAsShared(post.id);
  };

  const handleCopyPostText = async (post: SocialFeedPost) => {
    try {
      await navigator.clipboard.writeText(buildShareText(post));
      toast.success('Texto do post copiado.');
    } catch (error) {
      console.error('Erro ao copiar texto:', error);
      toast.error('Nao foi possivel copiar o texto do post.');
    }
  };

  const appendChatMessage = (message: SocialChatMessage) => {
    setSocialState((prev) => ({
      ...prev,
      chatMessages: [...prev.chatMessages, message],
    }));
  };

  const handleSendChatMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeChatFriendId) {
      toast.error('Selecione um amigo para conversar.');
      return;
    }
    const text = chatInput.trim();
    if (!text) return;

    appendChatMessage({
      id: createId(),
      friendId: activeChatFriendId,
      sender: 'me',
      text,
      createdAt: new Date().toISOString(),
    });
    setChatInput('');
  };

  const handleSharePostWithFriend = (post: SocialFeedPost) => {
    const friendId = feedShareFriendId || activeChatFriendId;
    if (!friendId) {
      toast.error('Selecione um amigo para compartilhar.');
      return;
    }

    const friend = friendsById.get(friendId);

    appendChatMessage({
      id: createId(),
      friendId,
      sender: 'me',
      text: `Compartilhei este post com voce: ${post.caption}`,
      createdAt: new Date().toISOString(),
      postId: post.id,
    });

    markPostAsShared(post.id);
    setActiveChatFriendId(friendId);
    pushNotification({
      type: 'chat',
      title: 'Post enviado para amigo',
      description: `${friend?.name || 'Amigo'} recebeu um compartilhamento do feed.`,
    });
    toast.success('Post compartilhado no chat.');
  };

  const handleMarkAllNotificationsAsRead = () => {
    setSocialState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((notification) => ({ ...notification, read: true })),
    }));
  };

  const handleMarkNotificationAsRead = (notificationId: string) => {
    setSocialState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((notification) =>
        notification.id === notificationId ? { ...notification, read: true } : notification
      ),
    }));
  };

  return (
    <div className="pb-24 md:pb-8 space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Amigos, notificacoes, CLÃs com metas e desafios coletivos em um unico lugar.
        </p>
        <h1 className="mt-1 text-2xl md:text-3xl font-bold">
          Comunidade <span className="gradient-text">FitTrack</span>
        </h1>
      </div>

      <input
        ref={composerGalleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleComposerImageSelected}
      />
      <input
        ref={composerCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleComposerImageSelected}
      />

      <Tabs
        value={activeSection}
        onValueChange={(value) => setActiveSection(value as SocialSection)}
        className="space-y-4"
      >
        {showSectionTabs && (
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 md:grid-cols-5">
            <TabsTrigger value="friends" className="py-2 text-xs md:text-sm">Amigos</TabsTrigger>
            <TabsTrigger value="clans" className="py-2 text-xs md:text-sm">CLÃ</TabsTrigger>
            <TabsTrigger value="chat" className="py-2 text-xs md:text-sm">Chat</TabsTrigger>
            <TabsTrigger value="feed" className="py-2 text-xs md:text-sm">Feed</TabsTrigger>
            <TabsTrigger value="notifications" className="py-2 text-xs md:text-sm">Notificacoes</TabsTrigger>
          </TabsList>
        )}

        <TabsContent value="friends" className="space-y-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg">Solicitacoes de amizade</CardTitle>
              <CardDescription>
                Envie solicitacoes e aguarde o aceite do destinatario.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 xl:grid-cols-2">
              <form className="space-y-3" onSubmit={handleAddFriend}>
                <div className="space-y-2">
                  <Label htmlFor="friend-name">Nome</Label>
                  <Input
                    id="friend-name"
                    value={friendName}
                    onChange={(event) => setFriendName(event.target.value)}
                    placeholder="Nome do destinatario"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="friend-handle">Usuario</Label>
                  <Input id="friend-handle" value={friendHandle} onChange={(event) => setFriendHandle(event.target.value)} placeholder="@anafit" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="friend-goal">Meta do amigo</Label>
                  <Input id="friend-goal" value={friendGoal} onChange={(event) => setFriendGoal(event.target.value)} placeholder="Ex: correr 5 km" />
                </div>
                <Button type="submit" variant="energy" className="w-full">
                  <UserPlus className="h-4 w-4" />
                  Enviar solicitacao
                </Button>
              </form>

              <div className="space-y-3">
                <h3 className="font-semibold">Solicitacoes recebidas</h3>
                {!incomingFriendRequests.length && (
                  <p className="text-sm text-muted-foreground">Nenhuma solicitacao pendente.</p>
                )}
                {incomingFriendRequests.map((request) => (
                  <div key={request.id} className="rounded-lg border border-border/70 bg-card/40 p-3 space-y-3">
                    <div>
                      <p className="font-semibold">{request.senderName}</p>
                      <p className="text-sm text-muted-foreground">{request.senderHandle}</p>
                      <p className="text-xs text-muted-foreground mt-1">Meta: {request.senderGoal}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => handleAcceptFriendRequest(request.id)}>
                        <Check className="h-4 w-4" />
                        Aceitar
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => handleRejectFriendRequest(request.id)}>
                        <X className="h-4 w-4" />
                        Recusar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg">Rede de amigos</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-2">
                <h3 className="font-semibold">Amigos confirmados</h3>
                {!socialState.friends.length && (
                  <p className="text-sm text-muted-foreground">Nenhum amigo confirmado ainda.</p>
                )}
                {socialState.friends.map((friend) => (
                  <div key={friend.id} className="rounded-lg border border-border/70 bg-card/40 p-3">
                    <p className="font-semibold">{friend.name}</p>
                    <p className="text-sm text-muted-foreground">{friend.handle}</p>
                    <p className="text-xs text-muted-foreground mt-1">Meta: {friend.goal}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold">Solicitacoes enviadas</h3>
                {!outgoingPendingFriendRequests.length && (
                  <p className="text-sm text-muted-foreground">Nenhuma solicitacao pendente.</p>
                )}
                {outgoingPendingFriendRequests.map((request) => (
                  <div key={request.id} className="rounded-lg border border-border/70 bg-card/40 p-3">
                    <p className="font-semibold">{request.receiverName}</p>
                    <p className="text-sm text-muted-foreground">{request.receiverHandle}</p>
                    <p className="text-xs text-muted-foreground mt-1">Enviado em {formatDateTime(request.createdAt)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="clans" className="space-y-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg">Criacao de CLÃ</CardTitle>
              <CardDescription>Adicione amigos e defina metas e desafios juntos.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 xl:grid-cols-2">
              <form className="space-y-3" onSubmit={handleCreateClan}>
                <div className="space-y-2">
                  <Label htmlFor="clan-name">Nome do CLÃ</Label>
                  <Input id="clan-name" value={clanName} onChange={(event) => setClanName(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clan-description">Descricao</Label>
                  <Textarea id="clan-description" value={clanDescription} onChange={(event) => setClanDescription(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Membros</Label>
                  <div className="rounded-lg border border-border/70 p-2 max-h-40 overflow-y-auto space-y-2">
                    {!socialState.friends.length && <p className="text-sm text-muted-foreground">Adicione amigos primeiro.</p>}
                    {socialState.friends.map((friend) => (
                      <label key={friend.id} className="flex items-center justify-between gap-3 rounded-md p-2 hover:bg-secondary/50">
                        <span className="text-sm">{friend.name}</span>
                        <Checkbox checked={clanMemberIds.includes(friend.id)} onCheckedChange={(value) => handleToggleClanMember(friend.id, value)} />
                      </label>
                    ))}
                  </div>
                </div>
                <Button type="submit" variant="energy" className="w-full">
                  <Users className="h-4 w-4" />
                  Criar CLÃ
                </Button>
              </form>

              <div className="space-y-4">
                <form className="space-y-3" onSubmit={handleCreateGoal}>
                  <h3 className="font-semibold">Nova meta</h3>
                  <select
                    className="flex h-12 w-full rounded-lg border border-border bg-secondary/50 px-3 text-sm"
                    value={goalClanId}
                    onChange={(event) => setGoalClanId(event.target.value)}
                  >
                    {!socialState.clans.length && <option value="">Nenhum CLÃ</option>}
                    {socialState.clans.map((clan) => (
                      <option key={clan.id} value={clan.id}>{clan.name}</option>
                    ))}
                  </select>
                  <Input value={goalTitle} onChange={(event) => setGoalTitle(event.target.value)} placeholder="Titulo da meta" />
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="number" min="1" value={goalTargetValue} onChange={(event) => setGoalTargetValue(event.target.value)} placeholder="Alvo" />
                    <Input value={goalUnit} onChange={(event) => setGoalUnit(event.target.value)} placeholder="Unidade" />
                  </div>
                  <Input type="date" value={goalDueDate} onChange={(event) => setGoalDueDate(event.target.value)} />
                  <Button type="submit" variant="outline" className="w-full" disabled={!socialState.clans.length}>
                    <Target className="h-4 w-4" />
                    Criar meta
                  </Button>
                </form>

                <form className="space-y-3 border-t border-border/70 pt-4" onSubmit={handleCreateChallenge}>
                  <h3 className="font-semibold">Novo desafio</h3>
                  <select
                    className="flex h-12 w-full rounded-lg border border-border bg-secondary/50 px-3 text-sm"
                    value={challengeClanId}
                    onChange={(event) => setChallengeClanId(event.target.value)}
                  >
                    {!socialState.clans.length && <option value="">Nenhum CLÃ</option>}
                    {socialState.clans.map((clan) => (
                      <option key={clan.id} value={clan.id}>{clan.name}</option>
                    ))}
                  </select>
                  <Input value={challengeTitle} onChange={(event) => setChallengeTitle(event.target.value)} placeholder="Titulo do desafio" />
                  <Textarea value={challengeDescription} onChange={(event) => setChallengeDescription(event.target.value)} placeholder="Descricao" />
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="number" min="1" value={challengePoints} onChange={(event) => setChallengePoints(event.target.value)} placeholder="Pontos" />
                    <Input type="date" value={challengeDueDate} onChange={(event) => setChallengeDueDate(event.target.value)} />
                  </div>
                  <Button type="submit" variant="outline" className="w-full" disabled={!socialState.clans.length}>
                    <Trophy className="h-4 w-4" />
                    Criar desafio
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg">CLÃs criados</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!socialState.clans.length && <p className="text-sm text-muted-foreground">Nenhum CLÃ criado.</p>}
              {socialState.clans.map((clan) => (
                <div key={clan.id} className="rounded-lg border border-border/70 bg-card/40 p-3 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{clan.name}</p>
                      <p className="text-xs text-muted-foreground">Criado em {formatDate(clan.createdAt)}</p>
                    </div>
                    <Badge variant="outline">{clan.memberIds.length} amigos</Badge>
                  </div>
                  {clan.description && <p className="text-sm text-muted-foreground">{clan.description}</p>}

                  <div className="flex flex-wrap gap-2">
                    {clan.memberIds.map((friendId) => {
                      const friend = friendsById.get(friendId);
                      if (!friend) return null;
                      return <Badge key={friend.id} variant="secondary">{friend.name}</Badge>;
                    })}
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Metas</p>
                    {!clan.goals.length && <p className="text-sm text-muted-foreground">Sem metas.</p>}
                    {clan.goals.map((goal) => (
                      <div key={goal.id} className="rounded-md border border-border/70 p-2 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium">{goal.title}</p>
                          <Badge variant={goal.completed ? 'default' : 'outline'}>
                            {goal.currentValue}/{goal.targetValue} {goal.unit}
                          </Badge>
                        </div>
                        <Button type="button" size="sm" variant="outline" onClick={() => handleIncreaseGoalProgress(clan.id, goal.id)} disabled={goal.completed}>
                          {goal.completed ? 'Concluida' : '+1 progresso'}
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Desafios</p>
                    {!clan.challenges.length && <p className="text-sm text-muted-foreground">Sem desafios.</p>}
                    {clan.challenges.map((challenge) => (
                      <div key={challenge.id} className="rounded-md border border-border/70 p-2 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium">{challenge.title}</p>
                          <Badge variant={challenge.completed ? 'default' : 'outline'}>{challenge.points} pts</Badge>
                        </div>
                        {challenge.description && <p className="text-sm text-muted-foreground">{challenge.description}</p>}
                        <Button type="button" size="sm" variant={challenge.completed ? 'secondary' : 'outline'} onClick={() => handleToggleChallengeDone(clan.id, challenge.id)}>
                          {challenge.completed ? 'Concluido' : 'Marcar concluido'}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="chat" className="space-y-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg">Chat estilo WhatsApp</CardTitle>
              <CardDescription>Converse e compartilhe posts direto com seus amigos.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="chat-friend-select">Conversa com</Label>
                <select
                  id="chat-friend-select"
                  className="flex h-12 w-full rounded-lg border border-border bg-secondary/50 px-3 text-sm"
                  value={activeChatFriendId}
                  onChange={(event) => setActiveChatFriendId(event.target.value)}
                >
                  {!socialState.friends.length && <option value="">Nenhum amigo disponivel</option>}
                  {socialState.friends.map((friend) => (
                    <option key={friend.id} value={friend.id}>
                      {friend.name}
                    </option>
                  ))}
                </select>
              </div>

              {!socialState.friends.length && (
                <p className="text-sm text-muted-foreground">Adicione amigos para iniciar o chat.</p>
              )}

              {!!socialState.friends.length && activeChatFriend && (
                <div className="overflow-hidden rounded-xl border border-border/70">
                  <div className="flex items-center gap-3 bg-[#202c33] px-4 py-3 text-white">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2a3942] text-sm font-semibold">
                      {getInitials(activeChatFriend.name)}
                    </div>
                    <div>
                      <p className="font-semibold leading-none">{activeChatFriend.name}</p>
                      <p className="mt-1 text-xs text-slate-200">{activeChatFriend.handle}</p>
                    </div>
                  </div>

                  <div
                    ref={chatMessagesContainerRef}
                    className="min-h-72 max-h-[460px] overflow-y-auto bg-[#0b141a] p-3 space-y-2"
                  >
                    {!activeChatMessages.length && (
                      <p className="text-sm text-slate-300">Nenhuma mensagem ainda.</p>
                    )}
                    {activeChatMessages.map((message) => {
                      const sharedPost = message.postId ? postsById.get(message.postId) : null;
                      const isMine = message.sender === 'me';
                      return (
                        <div key={message.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`max-w-[86%] rounded-2xl px-3 py-2 shadow-sm ${
                              isMine
                                ? 'rounded-br-md bg-[#005c4b] text-white'
                                : 'rounded-bl-md bg-[#202c33] text-slate-100'
                            }`}
                          >
                            <p className="text-sm whitespace-pre-wrap break-words">{message.text}</p>
                            {sharedPost && (
                              <div className="mt-2 rounded-md border border-white/20 bg-black/20 p-2">
                                <img
                                  src={sharedPost.imageDataUrl}
                                  alt={`Post de ${sharedPost.authorName}`}
                                  className="h-24 w-full rounded-md object-cover"
                                />
                                <p className="mt-1 text-xs text-slate-200 line-clamp-2">{sharedPost.caption}</p>
                              </div>
                            )}
                            <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-200">
                              <span>{formatTime(message.createdAt)}</span>
                              {isMine && <CheckCheck className="h-3.5 w-3.5" />}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="border-t border-[#2a3942] bg-[#202c33] p-3">
                    <form className="flex items-center gap-2" onSubmit={handleSendChatMessage}>
                      <Input
                        value={chatInput}
                        onChange={(event) => setChatInput(event.target.value)}
                        placeholder="Digite uma mensagem"
                        className="h-11 border-0 bg-[#2a3942] text-white placeholder:text-slate-300 focus-visible:ring-1 focus-visible:ring-[#25d366]"
                      />
                      <Button
                        type="submit"
                        className="h-11 w-11 rounded-full bg-[#25d366] p-0 text-[#111b21] hover:bg-[#1fa855]"
                      >
                        <Send className="h-4 w-4" />
                        <span className="sr-only">Enviar mensagem</span>
                      </Button>
                    </form>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="feed" className="space-y-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg">Publicar no feed</CardTitle>
              <CardDescription>
                Use o botao + para adicionar foto da galeria ou abrir a camera.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border border-dashed border-border/80 bg-card/40 p-5 text-center space-y-4">
                <Button
                  type="button"
                  size="icon"
                  className="mx-auto h-16 w-16 rounded-full"
                  onClick={() => openComposer('post')}
                >
                  <Plus className="h-7 w-7" />
                  <span className="sr-only">Novo post</span>
                </Button>
                <p className="text-sm text-muted-foreground">
                  Toque no + para criar um post ou uma story.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => openComposerAndPick('post', 'gallery')}
                  >
                    <ImagePlus className="h-4 w-4" />
                    Galeria
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => openComposerAndPick('post', 'camera')}
                  >
                    <Camera className="h-4 w-4" />
                    Camera
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => openComposer('story')}
                  >
                    <Plus className="h-4 w-4" />
                    Nova story
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg">Stories</CardTitle>
              <CardDescription>Stories expiram em 24 horas, no estilo Insta.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-3 overflow-x-auto pb-2">
                <button
                  type="button"
                  onClick={() => openComposer('story')}
                  className="flex w-20 shrink-0 flex-col items-center gap-1 text-center"
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-primary/70 bg-primary/10">
                    <Plus className="h-5 w-5 text-primary" />
                  </div>
                  <span className="line-clamp-1 text-xs">Sua story</span>
                </button>

                {activeStories.map((story) => (
                  <button
                    key={story.id}
                    type="button"
                    onClick={() => setActiveStoryId(story.id)}
                    className="flex w-20 shrink-0 flex-col items-center gap-1 text-center"
                  >
                    <div className="rounded-full bg-gradient-to-tr from-warning via-primary to-success p-[2px]">
                      <img
                        src={story.imageDataUrl}
                        alt={`Story de ${story.authorName}`}
                        className="h-16 w-16 rounded-full border-2 border-background object-cover"
                      />
                    </div>
                    <span className="line-clamp-1 text-xs">{story.authorName.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
              {!activeStories.length && (
                <p className="text-sm text-muted-foreground">Sem stories nas ultimas 24h.</p>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg">Feed da comunidade</CardTitle>
              <CardDescription>Compartilhe no WhatsApp, Instagram e no chat entre amigos.</CardDescription>
              <div className="space-y-2">
                <Label htmlFor="feed-share-friend">Compartilhar com amigo (chat)</Label>
                <select
                  id="feed-share-friend"
                  className="flex h-12 w-full rounded-lg border border-border bg-secondary/50 px-3 text-sm"
                  value={feedShareFriendId}
                  onChange={(event) => setFeedShareFriendId(event.target.value)}
                >
                  {!socialState.friends.length && <option value="">Nenhum amigo disponivel</option>}
                  {socialState.friends.map((friend) => (
                    <option key={friend.id} value={friend.id}>
                      {friend.name}
                    </option>
                  ))}
                </select>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!globalPosts.length && <p className="text-sm text-muted-foreground">Ainda nao ha posts.</p>}
              {globalPosts.map((post) => (
                <div key={post.id} className="rounded-lg border border-border/70 bg-card/40 p-3 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{post.authorName}</p>
                      <p className="text-xs text-muted-foreground">{post.authorHandle} - {formatDateTime(post.createdAt)}</p>
                    </div>
                    <Badge variant="outline">{post.sharedCount} compartilhamentos</Badge>
                  </div>
                  <img src={post.imageDataUrl} alt={`Post de ${post.authorName}`} className="w-full max-h-[420px] object-cover rounded-lg border border-border/70" />
                  <p className="text-sm">{post.caption}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => handleLikePost(post.id)}>
                      <Heart className="h-4 w-4" />
                      Curtir ({post.likes})
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => handleShareOnWhatsApp(post)}>
                      <MessageCircle className="h-4 w-4" />
                      WhatsApp
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => handleShareOnInstagram(post)}>
                      <Instagram className="h-4 w-4" />
                      Instagram
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => handleCopyPostText(post)}>
                      <Copy className="h-4 w-4" />
                      Copiar texto
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleSharePostWithFriend(post)}
                      disabled={!socialState.friends.length}
                    >
                      <Users className="h-4 w-4" />
                      Compartilhar com amigo
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg">Notificacoes</CardTitle>
              <CardDescription>{unreadNotifications} nao lida(s).</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={handleEnableBrowserNotifications}>
                <BellRing className="h-4 w-4" />
                Ativar notificacoes do navegador
              </Button>
              <Button type="button" variant="outline" onClick={handleMarkAllNotificationsAsRead}>
                <CheckCircle2 className="h-4 w-4" />
                Marcar todas como lidas
              </Button>
            </CardContent>
          </Card>

          {!!incomingFriendRequests.length && (
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-lg">Solicitacoes de amizade pendentes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {incomingFriendRequests.map((request) => (
                  <div key={request.id} className="rounded-lg border border-primary/40 bg-primary/10 p-3 space-y-2">
                    <p className="font-medium">{request.senderName}</p>
                    <p className="text-sm text-muted-foreground">{request.senderHandle}</p>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => handleAcceptFriendRequest(request.id)}>
                        <Check className="h-4 w-4" />
                        Aceitar
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => handleRejectFriendRequest(request.id)}>
                        <X className="h-4 w-4" />
                        Recusar
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card className="glass-card">
            <CardContent className="pt-6 space-y-2">
              {!socialState.notifications.length && <p className="text-sm text-muted-foreground">Nenhuma notificacao registrada.</p>}
              {socialState.notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => handleMarkNotificationAsRead(notification.id)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    notification.read ? 'border-border/60 bg-card/30' : 'border-primary/40 bg-primary/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{notification.title}</p>
                      <p className="text-sm text-muted-foreground">{notification.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">{formatDateTime(notification.createdAt)}</p>
                    </div>
                    <Badge variant={notification.read ? 'outline' : 'default'}>
                      {notificationTypeLabel[notification.type]}
                    </Badge>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isComposerOpen} onOpenChange={(open) => (open ? setIsComposerOpen(true) : closeComposer())}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo conteudo</DialogTitle>
            <DialogDescription>
              Publique no feed ou poste uma story.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Button
              type="button"
              variant={composerMode === 'post' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setComposerMode('post')}
            >
              Post no feed
            </Button>
            <Button
              type="button"
              variant={composerMode === 'story' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setComposerMode('story')}
            >
              Story
            </Button>
          </div>

          <form className="space-y-3" onSubmit={handlePublishComposer}>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => composerGalleryInputRef.current?.click()}>
                <ImagePlus className="h-4 w-4" />
                Galeria
              </Button>
              <Button type="button" variant="outline" onClick={() => composerCameraInputRef.current?.click()}>
                <Camera className="h-4 w-4" />
                Camera
              </Button>
            </div>

            {processingComposerImage && <p className="text-sm text-muted-foreground">Processando imagem...</p>}

            {composerImageDataUrl && (
              <img
                src={composerImageDataUrl}
                alt="Pre-visualizacao"
                className="h-64 w-full rounded-lg border border-border/70 object-cover"
              />
            )}

            <Textarea
              value={composerCaption}
              onChange={(event) => setComposerCaption(event.target.value)}
              placeholder={
                composerMode === 'post'
                  ? 'Conte como foi seu treino.'
                  : 'Legenda opcional para story.'
              }
            />

            <Button
              type="submit"
              variant="energy"
              className="w-full"
              disabled={
                processingComposerImage ||
                !composerImageDataUrl ||
                (composerMode === 'post' && !composerCaption.trim())
              }
            >
              {composerMode === 'post' ? 'Publicar post' : 'Publicar story'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(activeStory)} onOpenChange={(open) => !open && setActiveStoryId('')}>
        <DialogContent className="max-w-sm overflow-hidden p-0">
          {activeStory && (
            <div className="relative">
              <img
                src={activeStory.imageDataUrl}
                alt={`Story de ${activeStory.authorName}`}
                className="h-[72vh] w-full object-cover"
              />
              <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/80 to-transparent p-4 text-white">
                <p className="font-semibold">{activeStory.authorName}</p>
                <p className="text-xs">{formatDateTime(activeStory.createdAt)}</p>
              </div>
              {!!activeStory.caption && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-4 text-white">
                  <p className="text-sm">{activeStory.caption}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

