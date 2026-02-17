import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Search,
  Send,
  Share2,
  Target,
  Trophy,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  SOCIAL_GLOBAL_CHAT_EVENTS_STORAGE_KEY,
  SOCIAL_GLOBAL_FEED_STORAGE_KEY,
  SOCIAL_GLOBAL_FRIEND_REQUESTS_STORAGE_KEY,
  SOCIAL_GLOBAL_STORIES_STORAGE_KEY,
  SOCIAL_SEEN_CHAT_EVENTS_STORAGE_PREFIX,
  SOCIAL_SEEN_FRIEND_REQUESTS_STORAGE_PREFIX,
  SOCIAL_HUB_STORAGE_PREFIX,
} from '@/lib/storageKeys';
import {
  formatHandleInput,
  normalizeHandle,
  sanitizeHandleBody,
  toHandle,
} from '@/lib/handleUtils';
import { supabase } from '@/integrations/supabase/client';
import { UserProfile } from '@/types/user';
import {
  SocialClan,
  SocialClanChallenge,
  SocialClanGoal,
  SocialChatMessage,
  SocialFeedPost,
  SocialFriend,
  SocialFriendRequest,
  SocialGlobalChatEvent,
  SocialNotification,
  SocialNotificationType,
  SocialPostComment,
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
import { cn } from '@/lib/utils';

interface SocialHubProps {
  profile: UserProfile;
  defaultSection?: SocialSection;
  showSectionTabs?: boolean;
}

interface DiscoverableProfile {
  profileId?: string;
  handle: string;
  normalizedHandle: string;
  name: string;
  goal: string;
}

interface RemoteProfileSearchResult {
  profile_id: string;
  name: string | null;
  handle: string;
  goal: string | null;
}

interface SocialGlobalSnapshot {
  feed_posts: SocialFeedPost[];
  stories: SocialStory[];
  friend_requests: SocialFriendRequest[];
  chat_events: SocialGlobalChatEvent[];
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

const resolveGoalLabel = (goal: string | null | undefined) => {
  if (!goal) return 'Sem meta definida';
  if (goal in PROFILE_GOAL_LABEL) {
    return PROFILE_GOAL_LABEL[goal as UserProfile['goal']];
  }
  return goal;
};

const NOTIFICATION_LIMIT = 120;
const MAX_IMAGE_SIZE = 1080;
const GLOBAL_FEED_POST_LIMIT = 500;
const GLOBAL_STORY_LIMIT = 500;
const GLOBAL_FRIEND_REQUEST_LIMIT = 500;
const GLOBAL_CHAT_EVENT_LIMIT = 1000;
const SEEN_CHAT_EVENT_LIMIT = 2000;
const SEEN_FRIEND_REQUEST_LIMIT = 1200;
const STORY_DURATION_HOURS = 24;
const SOCIAL_GLOBAL_STATE_ID = true;
const GLOBAL_SYNC_POLL_INTERVAL_MS = 3500;

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const sanitizeHandleInput = (value: string) => sanitizeHandleBody(value);

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

const sanitizeLikedByHandles = (handles: unknown): string[] => {
  if (!Array.isArray(handles)) return [];
  const unique = new Set<string>();
  handles.forEach((value) => {
    const normalized = normalizeHandle(value);
    if (!normalized) return;
    unique.add(toHandle(normalized));
  });
  return Array.from(unique);
};

const sanitizePostComments = (comments: unknown): SocialPostComment[] => {
  if (!Array.isArray(comments)) return [];

  return comments
    .map((comment, index) => {
      if (!comment || typeof comment !== 'object') return null;
      const rawComment = comment as Partial<SocialPostComment>;

      const text = rawComment.text?.trim() || '';
      if (!text) return null;

      const createdAt = rawComment.createdAt && !Number.isNaN(new Date(rawComment.createdAt).getTime())
        ? rawComment.createdAt
        : new Date().toISOString();
      const likedByHandles = sanitizeLikedByHandles(rawComment.likedByHandles);
      const likes = Math.max(Number(rawComment.likes) || 0, likedByHandles.length);

      return {
        id: rawComment.id || `comment-${index}-${createId()}`,
        authorName: rawComment.authorName?.trim() || 'Perfil',
        authorHandle: toHandle(rawComment.authorHandle || rawComment.authorName || `comment.${index}`),
        text,
        createdAt,
        likes,
        likedByHandles,
      } as SocialPostComment;
    })
    .filter((comment): comment is SocialPostComment => Boolean(comment))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
};

const sanitizePosts = (posts: unknown): SocialFeedPost[] => {
  if (!Array.isArray(posts)) return [];

  return posts
    .map((post, index) => {
      if (!post || typeof post !== 'object') return null;
      const rawPost = post as Partial<SocialFeedPost>;
      if (!rawPost.id || !rawPost.imageDataUrl) return null;

      const likedByHandles = sanitizeLikedByHandles(rawPost.likedByHandles);
      const likes = Math.max(Number(rawPost.likes) || 0, likedByHandles.length);
      const sharedCount = Math.max(Number(rawPost.sharedCount) || 0, 0);
      const comments = sanitizePostComments(rawPost.comments);
      const createdAt = rawPost.createdAt && !Number.isNaN(new Date(rawPost.createdAt).getTime())
        ? rawPost.createdAt
        : new Date().toISOString();

      return {
        id: rawPost.id,
        authorName: rawPost.authorName?.trim() || `Perfil ${index + 1}`,
        authorHandle: toHandle(rawPost.authorHandle || rawPost.authorName || `post.${index}`),
        caption: rawPost.caption?.trim() || '',
        imageDataUrl: rawPost.imageDataUrl,
        createdAt,
        likes,
        likedByHandles,
        sharedCount,
        comments,
      } as SocialFeedPost;
    })
    .filter((post): post is SocialFeedPost => Boolean(post))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, GLOBAL_FEED_POST_LIMIT);
};

const sanitizeStories = (stories: unknown): SocialStory[] => {
  if (!Array.isArray(stories)) return [];

  return stories
    .map((story, index) => {
      if (!story || typeof story !== 'object') return null;
      const rawStory = story as Partial<SocialStory>;
      if (!rawStory.id || !rawStory.imageDataUrl) return null;

      const createdAt = rawStory.createdAt && !Number.isNaN(new Date(rawStory.createdAt).getTime())
        ? rawStory.createdAt
        : new Date().toISOString();
      const fallbackExpiresAt = new Date(new Date(createdAt).getTime() + STORY_DURATION_HOURS * 60 * 60 * 1000).toISOString();
      const expiresAt = rawStory.expiresAt && !Number.isNaN(new Date(rawStory.expiresAt).getTime())
        ? rawStory.expiresAt
        : fallbackExpiresAt;
      const likedByHandles = sanitizeLikedByHandles(rawStory.likedByHandles);
      const likes = Math.max(Number(rawStory.likes) || 0, likedByHandles.length);
      const sharedCount = Math.max(Number(rawStory.sharedCount) || 0, 0);

      return {
        id: rawStory.id,
        authorName: rawStory.authorName?.trim() || `Perfil ${index + 1}`,
        authorHandle: toHandle(rawStory.authorHandle || rawStory.authorName || `story.${index}`),
        caption: rawStory.caption?.trim() || '',
        imageDataUrl: rawStory.imageDataUrl,
        createdAt,
        expiresAt,
        likes,
        likedByHandles,
        sharedCount,
      } as SocialStory;
    })
    .filter((story): story is SocialStory => Boolean(story))
    .filter((story) => isStoryActive(story))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, GLOBAL_STORY_LIMIT);
};

const sanitizeFriendRequests = (requests: SocialFriendRequest[]) =>
  requests
    .filter(
      (request) =>
        request?.id &&
        request?.senderProfileId &&
        request?.senderHandle &&
        request?.receiverHandle
    )
    .map((request) => {
      const createdAt = !Number.isNaN(new Date(request.createdAt).getTime())
        ? request.createdAt
        : new Date().toISOString();
      const respondedAt = request.respondedAt && !Number.isNaN(new Date(request.respondedAt).getTime())
        ? request.respondedAt
        : undefined;
      const status: SocialFriendRequest['status'] =
        request.status === 'accepted' ||
        request.status === 'rejected' ||
        request.status === 'canceled'
          ? request.status
          : 'pending';

      return {
        ...request,
        senderName: request.senderName?.trim() || 'Perfil',
        senderHandle: toHandle(request.senderHandle || request.senderName || 'fit.user'),
        senderGoal: request.senderGoal?.trim() || 'Sem meta definida',
        receiverProfileId: request.receiverProfileId || undefined,
        receiverName: request.receiverName?.trim() || 'Perfil',
        receiverHandle: toHandle(request.receiverHandle || request.receiverName || 'fit.user'),
        receiverGoal: request.receiverGoal?.trim() || 'Sem meta definida',
        createdAt,
        respondedAt,
        status,
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, GLOBAL_FRIEND_REQUEST_LIMIT);

const sanitizeChatEvents = (events: SocialGlobalChatEvent[]) =>
  events
    .filter(
      (event) =>
        event?.id &&
        event.senderProfileId &&
        event.senderHandle &&
        event.receiverHandle &&
        event.text &&
        event.createdAt
    )
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(-GLOBAL_CHAT_EVENT_LIMIT);

const sanitizeSeenChatEventIds = (eventIds: string[]) =>
  Array.from(new Set(eventIds.filter(Boolean))).slice(-SEEN_CHAT_EVENT_LIMIT);

const sanitizeSeenFriendRequestIds = (requestIds: string[]) =>
  Array.from(new Set(requestIds.filter(Boolean))).slice(-SEEN_FRIEND_REQUEST_LIMIT);

const createSanitizedGlobalSnapshot = (
  posts: SocialFeedPost[],
  stories: SocialStory[],
  requests: SocialFriendRequest[],
  chatEvents: SocialGlobalChatEvent[]
): SocialGlobalSnapshot => ({
  feed_posts: sanitizePosts(posts),
  stories: sanitizeStories(stories),
  friend_requests: sanitizeFriendRequests(requests),
  chat_events: sanitizeChatEvents(chatEvents),
});

const getGlobalSnapshotHash = (snapshot: SocialGlobalSnapshot) => JSON.stringify(snapshot);

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

const isMissingRpcFunctionError = (
  error: { code?: string; message?: string; details?: string } | null | undefined
) => {
  if (!error) return false;
  if (error.code === 'PGRST202') return true;
  const combinedText = `${error.message || ''} ${error.details || ''}`.toLowerCase();
  return combinedText.includes('could not find the function');
};

const mapRemoteProfilesToDiscoverable = (
  rows: RemoteProfileSearchResult[],
  normalizedProfileHandle: string
): DiscoverableProfile[] =>
  rows
    .map((item) => {
      const normalizedHandle = normalizeHandle(item.handle);
      if (!normalizedHandle || normalizedHandle === normalizedProfileHandle) return null;

      const fallbackName = item.name?.trim() || toHandle(item.handle);
      return {
        profileId: item.profile_id,
        handle: toHandle(item.handle),
        normalizedHandle,
        name: fallbackName,
        goal: resolveGoalLabel(item.goal),
      } as DiscoverableProfile;
    })
    .filter((item): item is DiscoverableProfile => Boolean(item));

const sanitizeChatMessages = (messages: unknown): SocialChatMessage[] => {
  if (!Array.isArray(messages)) return [];

  return messages
    .map((message) => {
      if (!message || typeof message !== 'object') return null;
      const rawMessage = message as Partial<SocialChatMessage>;
      if (!rawMessage.id || !rawMessage.friendId) return null;

      const createdAt = rawMessage.createdAt && !Number.isNaN(new Date(rawMessage.createdAt).getTime())
        ? rawMessage.createdAt
        : new Date().toISOString();

      return {
        id: rawMessage.id,
        friendId: rawMessage.friendId,
        sender: rawMessage.sender === 'friend' ? 'friend' : 'me',
        text: rawMessage.text?.toString() || '',
        createdAt,
        postId: rawMessage.postId,
        storyId: rawMessage.storyId,
        externalEventId: rawMessage.externalEventId,
      } as SocialChatMessage;
    })
    .filter((message): message is SocialChatMessage => Boolean(message))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
};

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
  friend: 'Seguindo',
  clan: 'CLA',
  goal: 'Meta',
  challenge: 'Desafio',
  post: 'Feed',
  chat: 'Chat',
  system: 'Sistema',
};

const mergePosts = (...lists: SocialFeedPost[][]): SocialFeedPost[] => {
  const map = new Map<string, SocialFeedPost>();
  sanitizePosts(lists.flat()).forEach((post) => {
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
  const seenChatEventsStorageKey = useMemo(
    () => `${SOCIAL_SEEN_CHAT_EVENTS_STORAGE_PREFIX}${profile.id}`,
    [profile.id]
  );
  const seenFriendRequestsStorageKey = useMemo(
    () => `${SOCIAL_SEEN_FRIEND_REQUESTS_STORAGE_PREFIX}${profile.id}`,
    [profile.id]
  );
  const profileHandle = useMemo(
    () => profile.handle || toHandle(profile.name || profile.email || 'fit.user'),
    [profile.email, profile.handle, profile.name]
  );
  const normalizedProfileHandle = useMemo(() => normalizeHandle(profileHandle), [profileHandle]);

  const [socialState, setSocialState] = useState<SocialState>(EMPTY_SOCIAL_STATE);
  const [globalPosts, setGlobalPosts] = useState<SocialFeedPost[]>([]);
  const [globalStories, setGlobalStories] = useState<SocialStory[]>([]);
  const [friendRequests, setFriendRequests] = useState<SocialFriendRequest[]>([]);
  const [friendRequestsLoaded, setFriendRequestsLoaded] = useState(false);
  const [seenIncomingRequestIds, setSeenIncomingRequestIds] = useState<string[]>([]);
  const [globalChatEvents, setGlobalChatEvents] = useState<SocialGlobalChatEvent[]>([]);
  const [seenChatEventIds, setSeenChatEventIds] = useState<string[]>([]);
  const [loadedStorageKey, setLoadedStorageKey] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SocialSection>(defaultSection);
  const [remoteSnapshotLoaded, setRemoteSnapshotLoaded] = useState(false);
  const [remoteGlobalSyncEnabled, setRemoteGlobalSyncEnabled] = useState(true);

  const [friendName, setFriendName] = useState('');
  const [friendHandle, setFriendHandle] = useState('');
  const [friendGoal, setFriendGoal] = useState('');
  const [remoteDiscoverableProfiles, setRemoteDiscoverableProfiles] = useState<DiscoverableProfile[]>([]);
  const [isSearchingProfiles, setIsSearchingProfiles] = useState(false);

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
  const [chatEventsLoaded, setChatEventsLoaded] = useState(false);

  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [sharePostId, setSharePostId] = useState('');
  const [shareStoryId, setShareStoryId] = useState('');
  const [shareSearch, setShareSearch] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [selectedShareFriendIds, setSelectedShareFriendIds] = useState<string[]>([]);
  const [postCommentInputs, setPostCommentInputs] = useState<Record<string, string>>({});

  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<'post' | 'story'>('post');
  const [composerCaption, setComposerCaption] = useState('');
  const [composerImageDataUrl, setComposerImageDataUrl] = useState('');
  const [processingComposerImage, setProcessingComposerImage] = useState(false);
  const [activeStoryId, setActiveStoryId] = useState('');

  const composerGalleryInputRef = useRef<HTMLInputElement | null>(null);
  const composerCameraInputRef = useRef<HTMLInputElement | null>(null);
  const chatMessagesContainerRef = useRef<HTMLDivElement | null>(null);
  const outgoingRequestStatusRef = useRef<Map<string, SocialFriendRequest['status']>>(new Map());
  const initializedOutgoingRequestStatusRef = useRef(false);
  const applyingRemoteSnapshotRef = useRef(false);
  const lastGlobalSnapshotHashRef = useRef('');
  const notifiedRemoteSyncUnavailableRef = useRef(false);

  const triggerSystemNotification = useCallback((title: string, description: string) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body: description });
    }
    if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
      navigator.vibrate([70, 40, 90]);
    }
  }, []);

  const pushNotification = useCallback((
    notification: Omit<SocialNotification, 'id' | 'createdAt' | 'read'>,
    notifySystem = true
  ) => {
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

    if (notifySystem) {
      triggerSystemNotification(nextNotification.title, nextNotification.description);
    }
  }, [triggerSystemNotification]);

  useEffect(() => {
    setActiveSection(defaultSection);
  }, [defaultSection]);

  useEffect(() => {
    applyingRemoteSnapshotRef.current = false;
    lastGlobalSnapshotHashRef.current = '';
    setRemoteGlobalSyncEnabled(true);
    notifiedRemoteSyncUnavailableRef.current = false;
  }, [profile.id]);

  useEffect(() => {
    if (remoteGlobalSyncEnabled) {
      notifiedRemoteSyncUnavailableRef.current = false;
      return;
    }

    if (notifiedRemoteSyncUnavailableRef.current) return;
    notifiedRemoteSyncUnavailableRef.current = true;
    toast.error('Sincronizacao social indisponivel. Atualize as migrations do Supabase para usar pedidos de amizade.');
  }, [remoteGlobalSyncEnabled]);

  useEffect(() => {
    setFriendRequestsLoaded(false);
    setChatEventsLoaded(false);
    setRemoteSnapshotLoaded(false);

    const storedGlobalPosts = window.localStorage.getItem(SOCIAL_GLOBAL_FEED_STORAGE_KEY);
    if (storedGlobalPosts) {
      try {
        const parsed = JSON.parse(storedGlobalPosts) as SocialFeedPost[];
        setGlobalPosts(sanitizePosts(parsed));
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

    const storedSeenFriendRequests = window.localStorage.getItem(seenFriendRequestsStorageKey);
    if (storedSeenFriendRequests) {
      try {
        const parsed = JSON.parse(storedSeenFriendRequests) as string[];
        setSeenIncomingRequestIds(
          sanitizeSeenFriendRequestIds(Array.isArray(parsed) ? parsed : [])
        );
      } catch (error) {
        console.error('Erro ao carregar solicitacoes vistas:', error);
        setSeenIncomingRequestIds([]);
      }
    } else {
      setSeenIncomingRequestIds([]);
    }

    const storedGlobalChatEvents = window.localStorage.getItem(SOCIAL_GLOBAL_CHAT_EVENTS_STORAGE_KEY);
    if (storedGlobalChatEvents) {
      try {
        const parsed = JSON.parse(storedGlobalChatEvents) as SocialGlobalChatEvent[];
        setGlobalChatEvents(sanitizeChatEvents(Array.isArray(parsed) ? parsed : []));
      } catch (error) {
        console.error('Erro ao carregar eventos globais de chat:', error);
        setGlobalChatEvents([]);
      }
    } else {
      setGlobalChatEvents([]);
    }

    const storedSeenChatEvents = window.localStorage.getItem(seenChatEventsStorageKey);
    if (storedSeenChatEvents) {
      try {
        const parsed = JSON.parse(storedSeenChatEvents) as string[];
        setSeenChatEventIds(sanitizeSeenChatEventIds(Array.isArray(parsed) ? parsed : []));
      } catch (error) {
        console.error('Erro ao carregar eventos de chat vistos:', error);
        setSeenChatEventIds([]);
      }
    } else {
      setSeenChatEventIds([]);
    }
    setFriendRequestsLoaded(true);
    setChatEventsLoaded(true);
  }, [seenChatEventsStorageKey, seenFriendRequestsStorageKey]);

  useEffect(() => {
    window.localStorage.setItem(
      SOCIAL_GLOBAL_FEED_STORAGE_KEY,
      JSON.stringify(sanitizePosts(globalPosts))
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
    if (!friendRequestsLoaded) return;
    window.localStorage.setItem(
      seenFriendRequestsStorageKey,
      JSON.stringify(sanitizeSeenFriendRequestIds(seenIncomingRequestIds))
    );
  }, [seenIncomingRequestIds, seenFriendRequestsStorageKey, friendRequestsLoaded]);

  useEffect(() => {
    if (!chatEventsLoaded) return;
    window.localStorage.setItem(
      SOCIAL_GLOBAL_CHAT_EVENTS_STORAGE_KEY,
      JSON.stringify(sanitizeChatEvents(globalChatEvents))
    );
  }, [globalChatEvents, chatEventsLoaded]);

  useEffect(() => {
    if (!chatEventsLoaded) return;
    window.localStorage.setItem(
      seenChatEventsStorageKey,
      JSON.stringify(sanitizeSeenChatEventIds(seenChatEventIds))
    );
  }, [seenChatEventIds, seenChatEventsStorageKey, chatEventsLoaded]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === SOCIAL_GLOBAL_FEED_STORAGE_KEY) {
        try {
          const parsed = event.newValue ? (JSON.parse(event.newValue) as SocialFeedPost[]) : [];
          setGlobalPosts(sanitizePosts(parsed));
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

      if (event.key === seenFriendRequestsStorageKey) {
        try {
          const parsed = event.newValue ? (JSON.parse(event.newValue) as string[]) : [];
          setSeenIncomingRequestIds(
            sanitizeSeenFriendRequestIds(Array.isArray(parsed) ? parsed : [])
          );
        } catch (error) {
          console.error('Erro ao sincronizar solicitacoes vistas:', error);
        }
      }

      if (event.key === SOCIAL_GLOBAL_CHAT_EVENTS_STORAGE_KEY) {
        try {
          const parsed = event.newValue ? (JSON.parse(event.newValue) as SocialGlobalChatEvent[]) : [];
          setGlobalChatEvents(sanitizeChatEvents(Array.isArray(parsed) ? parsed : []));
        } catch (error) {
          console.error('Erro ao sincronizar eventos globais de chat:', error);
        }
      }

      if (event.key === seenChatEventsStorageKey) {
        try {
          const parsed = event.newValue ? (JSON.parse(event.newValue) as string[]) : [];
          setSeenChatEventIds(sanitizeSeenChatEventIds(Array.isArray(parsed) ? parsed : []));
        } catch (error) {
          console.error('Erro ao sincronizar eventos de chat vistos:', error);
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [seenChatEventsStorageKey, seenFriendRequestsStorageKey]);

  const fetchRemoteGlobalSnapshot = useCallback(async () => {
    if (!remoteGlobalSyncEnabled) {
      setRemoteSnapshotLoaded(true);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('social_global_state')
        .select('feed_posts, stories, friend_requests, chat_events')
        .eq('id', SOCIAL_GLOBAL_STATE_ID)
        .maybeSingle();

      if (error) {
        if (isMissingSocialGlobalStateError(error)) {
          setRemoteGlobalSyncEnabled(false);
          setRemoteSnapshotLoaded(true);
          return;
        }
        console.error('Erro ao carregar snapshot social global:', error);
        setRemoteSnapshotLoaded(true);
        return;
      }

      if (!data) {
        const emptySnapshot = createSanitizedGlobalSnapshot([], [], [], []);
        const { error: upsertError } = await supabase
          .from('social_global_state')
          .upsert(
            {
              id: SOCIAL_GLOBAL_STATE_ID,
              feed_posts: emptySnapshot.feed_posts,
              stories: emptySnapshot.stories,
              friend_requests: emptySnapshot.friend_requests,
              chat_events: emptySnapshot.chat_events,
              updated_by: profile.id,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' }
          );

        if (upsertError) {
          if (isMissingSocialGlobalStateError(upsertError)) {
            setRemoteGlobalSyncEnabled(false);
            setRemoteSnapshotLoaded(true);
            return;
          }
          console.error('Erro ao inicializar snapshot social global:', upsertError);
        } else {
          lastGlobalSnapshotHashRef.current = getGlobalSnapshotHash(emptySnapshot);
        }

        setRemoteSnapshotLoaded(true);
        return;
      }

      const nextSnapshot = createSanitizedGlobalSnapshot(
        Array.isArray(data.feed_posts) ? (data.feed_posts as SocialFeedPost[]) : [],
        Array.isArray(data.stories) ? (data.stories as SocialStory[]) : [],
        Array.isArray(data.friend_requests) ? (data.friend_requests as SocialFriendRequest[]) : [],
        Array.isArray(data.chat_events) ? (data.chat_events as SocialGlobalChatEvent[]) : []
      );

      const nextHash = getGlobalSnapshotHash(nextSnapshot);
      if (nextHash !== lastGlobalSnapshotHashRef.current) {
        applyingRemoteSnapshotRef.current = true;
        setGlobalPosts(nextSnapshot.feed_posts);
        setGlobalStories(nextSnapshot.stories);
        setFriendRequests(nextSnapshot.friend_requests);
        setGlobalChatEvents(nextSnapshot.chat_events);
        lastGlobalSnapshotHashRef.current = nextHash;
      }

      setRemoteSnapshotLoaded(true);
    } catch (error) {
      console.error('Erro ao sincronizar snapshot social global:', error);
      setRemoteSnapshotLoaded(true);
    }
  }, [profile.id, remoteGlobalSyncEnabled]);

  useEffect(() => {
    if (!remoteGlobalSyncEnabled) return;
    void fetchRemoteGlobalSnapshot();

    const intervalId = window.setInterval(() => {
      void fetchRemoteGlobalSnapshot();
    }, GLOBAL_SYNC_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [fetchRemoteGlobalSnapshot, remoteGlobalSyncEnabled]);

  useEffect(() => {
    if (!remoteSnapshotLoaded) return;
    if (!remoteGlobalSyncEnabled) return;

    if (applyingRemoteSnapshotRef.current) {
      applyingRemoteSnapshotRef.current = false;
      return;
    }

    const snapshot = createSanitizedGlobalSnapshot(
      globalPosts,
      globalStories,
      friendRequests,
      globalChatEvents
    );
    const nextHash = getGlobalSnapshotHash(snapshot);
    if (nextHash === lastGlobalSnapshotHashRef.current) return;

    let canceled = false;
    const syncTimer = window.setTimeout(async () => {
      const { error } = await supabase
        .from('social_global_state')
        .upsert(
          {
            id: SOCIAL_GLOBAL_STATE_ID,
            feed_posts: snapshot.feed_posts,
            stories: snapshot.stories,
            friend_requests: snapshot.friend_requests,
            chat_events: snapshot.chat_events,
            updated_by: profile.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );

      if (canceled) return;

      if (error) {
        if (isMissingSocialGlobalStateError(error)) {
          setRemoteGlobalSyncEnabled(false);
          return;
        }
        console.error('Erro ao enviar snapshot social global:', error);
        return;
      }

      lastGlobalSnapshotHashRef.current = nextHash;
    }, 240);

    return () => {
      canceled = true;
      window.clearTimeout(syncTimer);
    };
  }, [
    friendRequests,
    globalChatEvents,
    globalPosts,
    globalStories,
    profile.id,
    remoteGlobalSyncEnabled,
    remoteSnapshotLoaded,
  ]);

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
      const parsedFriends = Array.isArray(parsed.friends)
        ? parsed.friends
            .filter(
              (friend): friend is Partial<SocialFriend> =>
                Boolean(friend) && typeof friend === 'object'
            )
            .map((friend, index) => {
              const fallbackName = typeof friend.name === 'string' && friend.name.trim()
                ? friend.name.trim()
                : `Perfil ${index + 1}`;
              return {
                id: typeof friend.id === 'string' && friend.id
                  ? friend.id
                  : `friend-legacy-${index}-${createId()}`,
                name: fallbackName,
                handle: toHandle(friend.handle || fallbackName),
                goal: typeof friend.goal === 'string' && friend.goal.trim()
                  ? friend.goal.trim()
                  : 'Sem meta definida',
                addedAt: typeof friend.addedAt === 'string' && friend.addedAt
                  ? friend.addedAt
                  : new Date().toISOString(),
              };
            })
        : [];
      setSocialState({
        friends: parsedFriends,
        clans: parsed.clans || [],
        posts: [],
        chatMessages: sanitizeChatMessages(parsed.chatMessages),
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
          (
            request.receiverProfileId === profile.id ||
            normalizeHandle(request.receiverHandle) === normalizedProfileHandle
          )
      ),
    [friendRequests, normalizedProfileHandle, profile.id]
  );

  const outgoingPendingFriendRequests = useMemo(
    () =>
      friendRequests.filter(
        (request) => request.status === 'pending' && request.senderProfileId === profile.id
      ),
    [friendRequests, profile.id]
  );

  useEffect(() => {
    if (!friendRequestsLoaded) return;

    const seenRequestIds = new Set(seenIncomingRequestIds);
    const unseenRequests = incomingFriendRequests.filter(
      (request) => !seenRequestIds.has(request.id)
    );
    if (!unseenRequests.length) return;

    unseenRequests.forEach((request) => {
      pushNotification({
        type: 'friend',
        title: 'Novo pedido para seguir',
        description: `${request.senderName} quer seguir voce.`,
      });
      toast.info(`Novo pedido para seguir de ${request.senderName}.`);
    });

    setSeenIncomingRequestIds((previous) =>
      sanitizeSeenFriendRequestIds([...previous, ...unseenRequests.map((request) => request.id)])
    );
  }, [
    friendRequestsLoaded,
    incomingFriendRequests,
    pushNotification,
    seenIncomingRequestIds,
  ]);

  useEffect(() => {
    if (!friendRequestsLoaded) return;

    const trackedStatuses = outgoingRequestStatusRef.current;
    const myRequests = friendRequests.filter((request) => request.senderProfileId === profile.id);

    if (!initializedOutgoingRequestStatusRef.current) {
      myRequests.forEach((request) => trackedStatuses.set(request.id, request.status));
      initializedOutgoingRequestStatusRef.current = true;
      return;
    }

    const activeIds = new Set<string>();
    myRequests.forEach((request) => {
      activeIds.add(request.id);
      const previousStatus = trackedStatuses.get(request.id);
      if (!previousStatus) {
        trackedStatuses.set(request.id, request.status);
        return;
      }
      if (previousStatus === request.status) return;
      trackedStatuses.set(request.id, request.status);

      if (request.status === 'accepted') {
        pushNotification({
          type: 'friend',
          title: 'Pedido aceito',
          description: `${request.receiverName} aceitou seu pedido para seguir.`,
        });
        toast.success(`${request.receiverName} aceitou seu pedido.`);
      }

      if (request.status === 'rejected') {
        pushNotification({
          type: 'friend',
          title: 'Pedido recusado',
          description: `${request.receiverName} recusou seu pedido para seguir.`,
        });
        toast.error(`${request.receiverName} recusou seu pedido.`);
      }
    });

    Array.from(trackedStatuses.keys()).forEach((requestId) => {
      if (activeIds.has(requestId)) return;
      trackedStatuses.delete(requestId);
    });
  }, [friendRequests, friendRequestsLoaded, profile.id, pushNotification]);

  useEffect(() => {
    if (!friendRequestsLoaded) {
      initializedOutgoingRequestStatusRef.current = false;
      outgoingRequestStatusRef.current.clear();
      return;
    }
  }, [friendRequestsLoaded]);

  const fetchRemoteProfilesByHandle = useCallback(async (
    rawQuery: string,
    limitCount = 12
  ): Promise<DiscoverableProfile[]> => {
    const normalizedQuery = sanitizeHandleInput(rawQuery);
    if (!normalizedQuery) return [];

    const { data, error } = await supabase.rpc('search_profiles_by_handle', {
      query_text: normalizedQuery,
      limit_count: limitCount,
      exclude_profile_id: profile.id,
    });

    if (!error && Array.isArray(data)) {
      return mapRemoteProfilesToDiscoverable(data, normalizedProfileHandle);
    }

    if (error && !isMissingRpcFunctionError(error)) {
      console.error('Erro ao buscar perfis por @usuario (rpc):', error);
    }

    const { data: fallbackRows, error: fallbackError } = await supabase
      .from('profiles')
      .select('id, name, handle, goal')
      .neq('id', profile.id)
      .ilike('handle', `%${normalizedQuery}%`)
      .order('updated_at', { ascending: false })
      .limit(limitCount);

    if (fallbackError) {
      console.error('Erro ao buscar perfis por @usuario (fallback):', fallbackError);
      return [];
    }

    const mappedRows: RemoteProfileSearchResult[] = (fallbackRows || []).map((row) => ({
      profile_id: row.id,
      name: row.name,
      handle: row.handle,
      goal: row.goal,
    }));

    return mapRemoteProfilesToDiscoverable(mappedRows, normalizedProfileHandle);
  }, [normalizedProfileHandle, profile.id]);

  const friendHandleSearch = useMemo(() => sanitizeHandleInput(friendHandle), [friendHandle]);

  useEffect(() => {
    if (!friendHandleSearch) {
      setRemoteDiscoverableProfiles([]);
      setIsSearchingProfiles(false);
      return;
    }

    let canceled = false;
    const searchTimer = window.setTimeout(async () => {
      setIsSearchingProfiles(true);
      const remoteProfiles = await fetchRemoteProfilesByHandle(friendHandleSearch, 12);
      if (canceled) return;

      setRemoteDiscoverableProfiles(remoteProfiles);
      setIsSearchingProfiles(false);
    }, 220);

    return () => {
      canceled = true;
      window.clearTimeout(searchTimer);
    };
  }, [fetchRemoteProfilesByHandle, friendHandleSearch]);

  const localDiscoverableProfiles = useMemo(() => {
    const catalog = new Map<string, DiscoverableProfile>();

    const registerProfile = (
      rawName: string,
      rawHandle: string,
      rawGoal?: string,
      profileId?: string
    ) => {
      const normalizedHandle = sanitizeHandleInput(rawHandle);
      if (!normalizedHandle || normalizedHandle === normalizedProfileHandle) return;

      const fallbackName = rawName?.trim() || `@${normalizedHandle}`;
      const nextEntry: DiscoverableProfile = {
        profileId,
        handle: toHandle(normalizedHandle),
        normalizedHandle,
        name: fallbackName,
        goal: rawGoal?.trim() || 'Sem meta definida',
      };

      const existing = catalog.get(normalizedHandle);
      if (!existing) {
        catalog.set(normalizedHandle, nextEntry);
        return;
      }

      if (existing.name.startsWith('@') && !nextEntry.name.startsWith('@')) {
        existing.name = nextEntry.name;
      }
      if (existing.goal === 'Sem meta definida' && nextEntry.goal !== 'Sem meta definida') {
        existing.goal = nextEntry.goal;
      }
      if (!existing.profileId && profileId) {
        existing.profileId = profileId;
      }
    };

    socialState.friends.forEach((friend) => registerProfile(friend.name, friend.handle, friend.goal));
    friendRequests.forEach((request) => {
      registerProfile(request.senderName, request.senderHandle, request.senderGoal, request.senderProfileId);
      registerProfile(request.receiverName, request.receiverHandle, request.receiverGoal, request.receiverProfileId);
    });
    globalPosts.forEach((post) => registerProfile(post.authorName, post.authorHandle));
    globalStories.forEach((story) => registerProfile(story.authorName, story.authorHandle));

    return Array.from(catalog.values()).sort((a, b) => a.handle.localeCompare(b.handle));
  }, [friendRequests, globalPosts, globalStories, normalizedProfileHandle, socialState.friends]);

  const discoverableProfiles = useMemo(() => {
    const catalog = new Map<string, DiscoverableProfile>();

    const registerProfile = (candidate: DiscoverableProfile) => {
      const normalizedHandle = sanitizeHandleInput(candidate.handle);
      if (!normalizedHandle || normalizedHandle === normalizedProfileHandle) return;

      const current = catalog.get(normalizedHandle);
      if (!current) {
        catalog.set(normalizedHandle, {
          ...candidate,
          handle: toHandle(candidate.handle),
          normalizedHandle,
          goal: candidate.goal?.trim() || 'Sem meta definida',
        });
        return;
      }

      if (current.name.startsWith('@') && !candidate.name.startsWith('@')) {
        current.name = candidate.name;
      }
      if (current.goal === 'Sem meta definida' && candidate.goal !== 'Sem meta definida') {
        current.goal = candidate.goal;
      }
      if (!current.profileId && candidate.profileId) {
        current.profileId = candidate.profileId;
      }
    };

    localDiscoverableProfiles.forEach(registerProfile);
    remoteDiscoverableProfiles.forEach(registerProfile);

    return Array.from(catalog.values()).sort((a, b) => a.handle.localeCompare(b.handle));
  }, [localDiscoverableProfiles, normalizedProfileHandle, remoteDiscoverableProfiles]);

  const resolveDiscoverableProfileByHandle = useCallback(async (
    normalizedHandle: string
  ): Promise<DiscoverableProfile | null> => {
    const localExact = discoverableProfiles.find(
      (candidate) => candidate.normalizedHandle === normalizedHandle
    );
    if (localExact) return localExact;

    const remoteCandidates = await fetchRemoteProfilesByHandle(normalizedHandle, 12);
    const remoteExact = remoteCandidates.find(
      (candidate) => candidate.normalizedHandle === normalizedHandle
    );
    return remoteExact ?? null;
  }, [discoverableProfiles, fetchRemoteProfilesByHandle]);

  const filteredDiscoverableProfiles = useMemo(() => {
    if (!friendHandle.trim()) return [];
    if (!friendHandleSearch) return discoverableProfiles.slice(0, 8);

    return discoverableProfiles
      .filter(
        (candidate) =>
          candidate.normalizedHandle.includes(friendHandleSearch) ||
          candidate.name.toLowerCase().includes(friendHandleSearch)
      )
      .sort((a, b) => {
        const aStartsWith = a.normalizedHandle.startsWith(friendHandleSearch) ? 0 : 1;
        const bStartsWith = b.normalizedHandle.startsWith(friendHandleSearch) ? 0 : 1;
        if (aStartsWith !== bStartsWith) return aStartsWith - bStartsWith;
        return a.handle.localeCompare(b.handle);
      })
      .slice(0, 8);
  }, [discoverableProfiles, friendHandle, friendHandleSearch]);

  const relatedAcceptedRequests = useMemo(
    () =>
      friendRequests.filter((request) => {
        if (request.status !== 'accepted') return false;
        if (request.senderProfileId === profile.id) return true;
        if (request.receiverProfileId === profile.id) return true;
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
          handle: toHandle(normalizedFriendHandle),
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

  const friendsByHandle = useMemo(
    () =>
      new Map(
        socialState.friends.map((friend) => [normalizeHandle(friend.handle), friend] as const)
      ),
    [socialState.friends]
  );

  const postsById = useMemo(
    () => new Map(globalPosts.map((post) => [post.id, post])),
    [globalPosts]
  );

  const storiesById = useMemo(
    () => new Map(sanitizeStories(globalStories).map((story) => [story.id, story])),
    [globalStories]
  );

  const sharePost = useMemo(
    () => globalPosts.find((post) => post.id === sharePostId) ?? null,
    [globalPosts, sharePostId]
  );

  const shareStory = useMemo(
    () => sanitizeStories(globalStories).find((story) => story.id === shareStoryId) ?? null,
    [globalStories, shareStoryId]
  );

  const filteredShareFriends = useMemo(() => {
    const query = shareSearch.trim().toLowerCase();
    if (!query) return socialState.friends;
    return socialState.friends.filter(
      (friend) => {
        const friendName = (friend.name || '').toLowerCase();
        const friendHandle = toHandle(friend.handle || friend.name || 'fit.user').toLowerCase();
        return friendName.includes(query) || friendHandle.includes(query);
      }
    );
  }, [socialState.friends, shareSearch]);

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
    if (!chatEventsLoaded) return;

    const unseenIncomingEvents = globalChatEvents.filter(
      (event) =>
        event.senderProfileId !== profile.id &&
        normalizeHandle(event.receiverHandle) === normalizedProfileHandle &&
        !seenChatEventIds.includes(event.id)
    );
    if (!unseenIncomingEvents.length) return;

    const existingEventIds = new Set(
      socialState.chatMessages
        .map((message) => message.externalEventId)
        .filter((eventId): eventId is string => Boolean(eventId))
    );
    const nextFriendsToAdd: SocialFriend[] = [];
    const nextMessages: SocialChatMessage[] = [];

    unseenIncomingEvents.forEach((event) => {
      if (existingEventIds.has(event.id)) return;

      const senderHandle = normalizeHandle(event.senderHandle);
      const knownFriend =
        friendsByHandle.get(senderHandle) ||
        nextFriendsToAdd.find((friend) => normalizeHandle(friend.handle) === senderHandle);

      let friendId = knownFriend?.id || '';
      if (!friendId) {
        friendId = `friend-chat-${senderHandle || createId()}`;
        nextFriendsToAdd.push({
          id: friendId,
          name: event.senderName,
          handle: toHandle(senderHandle || event.senderHandle),
          goal: 'Sem meta definida',
          addedAt: event.createdAt,
        });
      }

      nextMessages.push({
        id: createId(),
        friendId,
        sender: 'friend',
        text: event.text,
        createdAt: event.createdAt,
        postId: event.postId,
        storyId: event.storyId,
        externalEventId: event.id,
      });
    });

    if (nextFriendsToAdd.length || nextMessages.length) {
      setSocialState((previous) => {
        const knownHandles = new Set(previous.friends.map((friend) => normalizeHandle(friend.handle)));
        const mergedFriends = [...previous.friends];
        nextFriendsToAdd.forEach((friend) => {
          const normalized = normalizeHandle(friend.handle);
          if (!normalized || knownHandles.has(normalized)) return;
          mergedFriends.unshift(friend);
          knownHandles.add(normalized);
        });
        return {
          ...previous,
          friends: mergedFriends,
          chatMessages: [...previous.chatMessages, ...nextMessages],
        };
      });

      nextMessages.forEach((message) => {
        const sender = nextFriendsToAdd.find((friend) => friend.id === message.friendId) ||
          friendsById.get(message.friendId);
        pushNotification({
          type: 'chat',
          title: `Nova mensagem de ${sender?.name || 'Contato'}`,
          description: message.text,
        });
      });
    }

    setSeenChatEventIds((previous) => sanitizeSeenChatEventIds([...previous, ...unseenIncomingEvents.map((event) => event.id)]));
  }, [
    chatEventsLoaded,
    friendsByHandle,
    friendsById,
    globalChatEvents,
    normalizedProfileHandle,
    profile.id,
    pushNotification,
    seenChatEventIds,
    socialState.chatMessages,
  ]);

  useEffect(() => {
    if (!isShareDialogOpen) return;
    if (sharePostId) {
      if (globalPosts.some((post) => post.id === sharePostId)) return;
      setIsShareDialogOpen(false);
      setSharePostId('');
      setShareStoryId('');
      setShareSearch('');
      setShareMessage('');
      setSelectedShareFriendIds([]);
      return;
    }

    if (shareStoryId) {
      if (storiesById.has(shareStoryId)) return;
      setIsShareDialogOpen(false);
      setSharePostId('');
      setShareStoryId('');
      setShareSearch('');
      setShareMessage('');
      setSelectedShareFriendIds([]);
    }
  }, [globalPosts, isShareDialogOpen, sharePostId, shareStoryId, storiesById]);

  useEffect(() => {
    const container = chatMessagesContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [activeChatMessages]);

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

  const handleFriendHandleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setFriendHandle(formatHandleInput(event.target.value));
  };

  const handleSelectDiscoverableProfile = (candidate: DiscoverableProfile) => {
    setFriendHandle(candidate.handle);
    if (!friendName.trim() || friendName.trim().startsWith('@')) {
      setFriendName(candidate.name.startsWith('@') ? '' : candidate.name);
    }
    if (!friendGoal.trim()) {
      setFriendGoal(candidate.goal);
    }
  };

  const handleAddFriend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (remoteGlobalSyncEnabled && !remoteSnapshotLoaded) {
      toast.error('Aguarde a sincronizacao inicial da comunidade e tente novamente.');
      return;
    }

    if (!remoteGlobalSyncEnabled) {
      toast.error('Nao foi possivel sincronizar pedidos. Atualize as migrations do Supabase.');
      return;
    }

    const receiverHandleValue = sanitizeHandleInput(friendHandle);
    if (!receiverHandleValue) {
      toast.error('Informe o @usuario para seguir.');
      return;
    }
    if (receiverHandleValue.length < 3) {
      toast.error('Digite pelo menos 3 caracteres do @usuario.');
      return;
    }

    if (receiverHandleValue === normalizedProfileHandle) {
      toast.error('Nao e possivel seguir voce mesmo.');
      return;
    }

    const targetProfile = await resolveDiscoverableProfileByHandle(receiverHandleValue);
    if (!targetProfile?.profileId) {
      toast.error('Perfil nao encontrado. Use o @usuario exato para enviar o pedido.');
      return;
    }

    const receiverProfileId = targetProfile.profileId;
    if (receiverProfileId === profile.id) {
      toast.error('Nao e possivel seguir voce mesmo.');
      return;
    }

    const receiverNameCandidate = friendName.trim() || targetProfile?.name || receiverHandleValue;
    const receiverName = receiverNameCandidate.startsWith('@')
      ? receiverNameCandidate.slice(1)
      : receiverNameCandidate;
    const receiverGoalLabel = friendGoal.trim() || targetProfile?.goal || 'Sem meta definida';
    const receiverHandle = toHandle(targetProfile?.handle || receiverHandleValue);

    if (socialState.friends.some((friend) => normalizeHandle(friend.handle) === receiverHandleValue)) {
      toast.error('Voce ja segue esse usuario.');
      return;
    }

    const hasOutgoingPending = friendRequests.some(
      (request) =>
        request.status === 'pending' &&
        request.senderProfileId === profile.id &&
        (
          (Boolean(request.receiverProfileId) &&
            Boolean(receiverProfileId) &&
            request.receiverProfileId === receiverProfileId) ||
          normalizeHandle(request.receiverHandle) === receiverHandleValue
        )
    );

    if (hasOutgoingPending) {
      toast.error('Solicitacao para seguir ja enviada para esse usuario.');
      return;
    }

    const hasIncomingPending = friendRequests.some(
      (request) =>
        request.status === 'pending' &&
        (
          (Boolean(receiverProfileId) && request.senderProfileId === receiverProfileId) ||
          normalizeHandle(request.senderHandle) === receiverHandleValue
        ) &&
        (
          request.receiverProfileId === profile.id ||
          normalizeHandle(request.receiverHandle) === normalizedProfileHandle
        )
    );

    if (hasIncomingPending) {
      toast.info('Esse usuario ja solicitou seguir voce. Aceite na lista de recebidas.');
      return;
    }

    const nextRequest: SocialFriendRequest = {
      id: createId(),
      senderProfileId: profile.id,
      senderName: profile.name,
      senderHandle: profileHandle,
      senderGoal: PROFILE_GOAL_LABEL[profile.goal],
      receiverProfileId,
      receiverName,
      receiverHandle,
      receiverGoal: receiverGoalLabel,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    setFriendRequests((previous) => sanitizeFriendRequests([nextRequest, ...previous]));
    pushNotification({
      type: 'friend',
      title: 'Solicitacao enviada',
      description: `Aguardando ${receiverName} aceitar seu pedido para seguir.`,
    });

    setFriendName('');
    setFriendHandle('');
    setFriendGoal('');
    toast.success('Solicitacao para seguir enviada.');
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
      title: 'Seguindo confirmado',
      description: `Agora voce e ${request.senderName} se seguem.`,
    });
    toast.success('Solicitacao para seguir aceita.');
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

    toast.success('Solicitacao para seguir recusada.');
  };

  const handleCancelOutgoingFriendRequest = (requestId: string) => {
    const request = outgoingPendingFriendRequests.find((item) => item.id === requestId);
    if (!request) return;

    const respondedAt = new Date().toISOString();
    setFriendRequests((previous) =>
      sanitizeFriendRequests(
        previous.map((item) =>
          item.id === requestId ? { ...item, status: 'canceled', respondedAt } : item
        )
      )
    );

    pushNotification({
      type: 'friend',
      title: 'Solicitacao cancelada',
      description: `Voce cancelou o pedido para seguir ${request.receiverName}.`,
    }, false);
    toast.success('Solicitacao cancelada.');
  };

  const handleRemoveFriend = (friendId: string) => {
    const friend = friendsById.get(friendId);
    if (!friend) return;

    const normalizedFriendHandle = sanitizeHandleInput(friend.handle);

    setSocialState((previous) => ({
      ...previous,
      friends: previous.friends.filter((item) => item.id !== friendId),
      clans: previous.clans.map((clan) => ({
        ...clan,
        memberIds: clan.memberIds.filter((memberId) => memberId !== friendId),
      })),
      chatMessages: previous.chatMessages.filter((message) => message.friendId !== friendId),
    }));

    setClanMemberIds((previous) => previous.filter((memberId) => memberId !== friendId));
    setFriendRequests((previous) =>
      sanitizeFriendRequests(
        previous.filter((request) => {
          const senderHandle = sanitizeHandleInput(request.senderHandle);
          const receiverHandle = sanitizeHandleInput(request.receiverHandle);
          const isBetweenUsers =
            (senderHandle === normalizedProfileHandle && receiverHandle === normalizedFriendHandle) ||
            (senderHandle === normalizedFriendHandle && receiverHandle === normalizedProfileHandle);
          return !isBetweenUsers;
        })
      )
    );

    pushNotification({
      type: 'friend',
      title: 'Seguindo removido',
      description: `Voce deixou de seguir ${friend.name}.`,
    });
    toast.success(`${friend.name} removido de quem voce segue.`);
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
      toast.error('Defina um nome para o CLA.');
      return;
    }
    if (!clanMemberIds.length) {
      toast.error('Selecione ao menos 1 perfil seguido para o CLA.');
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
      title: 'CLA criado',
      description: `${nextClan.name} pronto para metas coletivas.`,
    });

    setClanName('');
    setClanDescription('');
    setClanMemberIds([]);
    toast.success('CLA criado.');
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
        likedByHandles: [],
        sharedCount: 0,
        comments: [],
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
      likes: 0,
      likedByHandles: [],
      sharedCount: 0,
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
      previous.map((post) => {
        if (post.id !== postId) return post;
        const likedBySet = new Set(post.likedByHandles.map((handle) => normalizeHandle(handle)));
        if (likedBySet.has(normalizedProfileHandle)) {
          likedBySet.delete(normalizedProfileHandle);
        } else {
          likedBySet.add(normalizedProfileHandle);
        }
        const likedByHandles = Array.from(likedBySet).map((handle) => toHandle(handle));
        return {
          ...post,
          likedByHandles,
          likes: likedByHandles.length,
        };
      })
    );
  };

  const handleAddPostComment = (postId: string) => {
    const text = (postCommentInputs[postId] || '').trim();
    if (!text) return;

    const nextComment: SocialPostComment = {
      id: createId(),
      authorName: profile.name,
      authorHandle: profileHandle,
      text,
      createdAt: new Date().toISOString(),
      likes: 0,
      likedByHandles: [],
    };

    setGlobalPosts((previous) =>
      previous.map((post) =>
        post.id === postId
          ? { ...post, comments: [...post.comments, nextComment] }
          : post
      )
    );
    setPostCommentInputs((previous) => ({ ...previous, [postId]: '' }));
    toast.success('Comentario publicado.');
  };

  const handleLikeComment = (postId: string, commentId: string) => {
    setGlobalPosts((previous) =>
      previous.map((post) => {
        if (post.id !== postId) return post;
        return {
          ...post,
          comments: post.comments.map((comment) => {
            if (comment.id !== commentId) return comment;

            const likedBySet = new Set(
              comment.likedByHandles.map((handle) => normalizeHandle(handle))
            );
            if (likedBySet.has(normalizedProfileHandle)) {
              likedBySet.delete(normalizedProfileHandle);
            } else {
              likedBySet.add(normalizedProfileHandle);
            }

            const likedByHandles = Array.from(likedBySet).map((handle) => toHandle(handle));
            return {
              ...comment,
              likedByHandles,
              likes: likedByHandles.length,
            };
          }),
        };
      })
    );
  };

  const handleLikeStory = (storyId: string) => {
    setGlobalStories((previous) =>
      previous.map((story) => {
        if (story.id !== storyId) return story;
        const likedBySet = new Set(story.likedByHandles.map((handle) => normalizeHandle(handle)));
        if (likedBySet.has(normalizedProfileHandle)) {
          likedBySet.delete(normalizedProfileHandle);
        } else {
          likedBySet.add(normalizedProfileHandle);
        }
        const likedByHandles = Array.from(likedBySet).map((handle) => toHandle(handle));
        return {
          ...story,
          likedByHandles,
          likes: likedByHandles.length,
        };
      })
    );
  };

  const markPostAsShared = (postId: string) => {
    setGlobalPosts((previous) =>
      previous.map((post) =>
        post.id === postId ? { ...post, sharedCount: post.sharedCount + 1 } : post
      )
    );
  };

  const markStoryAsShared = (storyId: string) => {
    setGlobalStories((previous) =>
      previous.map((story) =>
        story.id === storyId ? { ...story, sharedCount: story.sharedCount + 1 } : story
      )
    );
  };

  const buildPostShareText = (post: SocialFeedPost) =>
    `${post.caption}\n\nCompartilhado via FitTrack ${post.authorHandle}\n#FitTrack #JornadaFitness`;

  const buildStoryShareText = (story: SocialStory) =>
    `${story.caption || 'Story compartilhada'}\n\nStory de ${story.authorHandle} no FitTrack\n#FitTrack #Story`;

  const handleShareOnWhatsApp = (item: SocialFeedPost | SocialStory, type: 'post' | 'story') => {
    const text = type === 'post' ? buildPostShareText(item) : buildStoryShareText(item);
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    const popup = window.open(url, '_blank', 'noopener,noreferrer');
    if (!popup) {
      toast.error('Nao foi possivel abrir o WhatsApp. Verifique o bloqueio de pop-up.');
      return;
    }
    if (type === 'post') {
      markPostAsShared(item.id);
    } else {
      markStoryAsShared(item.id);
    }
    toast.success('Abrindo WhatsApp.');
  };

  const handleShareOnInstagram = async (
    item: SocialFeedPost | SocialStory,
    type: 'post' | 'story'
  ) => {
    const text = type === 'post' ? buildPostShareText(item) : buildStoryShareText(item);
    if (navigator.share) {
      try {
        const file = await dataUrlToFile(
          item.imageDataUrl,
          type === 'post' ? `fittrack-post-${item.id}.jpg` : `fittrack-story-${item.id}.jpg`
        );
        const canShareWithFile = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
        if (canShareWithFile) {
          await navigator.share({ title: 'Meu progresso no FitTrack', text, files: [file] });
        } else {
          await navigator.share({ title: 'Meu progresso no FitTrack', text });
        }
        if (type === 'post') {
          markPostAsShared(item.id);
        } else {
          markStoryAsShared(item.id);
        }
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
    if (type === 'post') {
      markPostAsShared(item.id);
    } else {
      markStoryAsShared(item.id);
    }
  };

  const handleCopyShareText = async (item: SocialFeedPost | SocialStory, type: 'post' | 'story') => {
    try {
      const text = type === 'post' ? buildPostShareText(item) : buildStoryShareText(item);
      await navigator.clipboard.writeText(text);
      toast.success(type === 'post' ? 'Texto do post copiado.' : 'Texto da story copiado.');
    } catch (error) {
      console.error('Erro ao copiar texto:', error);
      toast.error(
        type === 'post'
          ? 'Nao foi possivel copiar o texto do post.'
          : 'Nao foi possivel copiar o texto da story.'
      );
    }
  };

  const appendGlobalChatEvent = (event: SocialGlobalChatEvent) => {
    setGlobalChatEvents((previous) => sanitizeChatEvents([...previous, event]));
  };

  const appendChatMessage = (message: SocialChatMessage) => {
    setSocialState((prev) => ({
      ...prev,
      chatMessages: [...prev.chatMessages, message],
    }));
  };

  const sendMessageToFollowedProfile = (
    friendId: string,
    text: string,
    postId?: string,
    storyId?: string
  ) => {
    const friend = friendsById.get(friendId);
    if (!friend) return false;

    const createdAt = new Date().toISOString();
    appendChatMessage({
      id: createId(),
      friendId,
      sender: 'me',
      text,
      createdAt,
      postId,
      storyId,
    });

    appendGlobalChatEvent({
      id: createId(),
      senderProfileId: profile.id,
      senderName: profile.name,
      senderHandle: profileHandle,
      receiverHandle: friend.handle,
      text,
      createdAt,
      postId,
      storyId,
    });

    return true;
  };

  const handleSendChatMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeChatFriendId) {
      toast.error('Selecione quem voce segue para conversar.');
      return;
    }
    const text = chatInput.trim();
    if (!text) return;

    const wasSent = sendMessageToFollowedProfile(activeChatFriendId, text);
    if (!wasSent) {
      toast.error('Nao foi possivel enviar para esse perfil.');
      return;
    }
    setChatInput('');
  };

  const handleSharePostWithFriend = (
    post: SocialFeedPost,
    friendId?: string,
    customMessage?: string
  ) => {
    const resolvedFriendId = friendId || feedShareFriendId || activeChatFriendId;
    if (!resolvedFriendId) {
      toast.error('Selecione quem voce segue para compartilhar.');
      return;
    }

    const friend = friendsById.get(resolvedFriendId);
    if (!friend) {
      toast.error('Perfil selecionado nao encontrado.');
      return;
    }

    const text = customMessage?.trim()
      ? `${customMessage.trim()}\n\nCompartilhei este post com voce: ${post.caption}`
      : `Compartilhei este post com voce: ${post.caption}`;

    const wasSent = sendMessageToFollowedProfile(resolvedFriendId, text, post.id);
    if (!wasSent) {
      toast.error('Nao foi possivel compartilhar no chat.');
      return;
    }

    markPostAsShared(post.id);
    setActiveChatFriendId(resolvedFriendId);
    pushNotification({
      type: 'chat',
      title: 'Post compartilhado',
      description: `${friend?.name || 'Contato'} recebeu um compartilhamento do feed.`,
    }, false);
  };

  const handleShareStoryWithFriend = (
    story: SocialStory,
    friendId?: string,
    customMessage?: string
  ) => {
    const resolvedFriendId = friendId || feedShareFriendId || activeChatFriendId;
    if (!resolvedFriendId) {
      toast.error('Selecione quem voce segue para compartilhar.');
      return;
    }

    const friend = friendsById.get(resolvedFriendId);
    if (!friend) {
      toast.error('Perfil selecionado nao encontrado.');
      return;
    }

    const storyText = story.caption || 'Story compartilhada';
    const text = customMessage?.trim()
      ? `${customMessage.trim()}\n\nCompartilhei esta story com voce: ${storyText}`
      : `Compartilhei esta story com voce: ${storyText}`;

    const wasSent = sendMessageToFollowedProfile(resolvedFriendId, text, undefined, story.id);
    if (!wasSent) {
      toast.error('Nao foi possivel compartilhar no chat.');
      return;
    }

    markStoryAsShared(story.id);
    setActiveChatFriendId(resolvedFriendId);
    pushNotification({
      type: 'chat',
      title: 'Story compartilhada',
      description: `${friend?.name || 'Contato'} recebeu uma story sua.`,
    }, false);
  };

  const openShareDialog = (post: SocialFeedPost) => {
    setSharePostId(post.id);
    setShareStoryId('');
    setShareSearch('');
    setShareMessage('');
    setSelectedShareFriendIds(feedShareFriendId ? [feedShareFriendId] : []);
    setIsShareDialogOpen(true);
  };

  const openStoryShareDialog = (story: SocialStory) => {
    setShareStoryId(story.id);
    setSharePostId('');
    setShareSearch('');
    setShareMessage('');
    setSelectedShareFriendIds(feedShareFriendId ? [feedShareFriendId] : []);
    setIsShareDialogOpen(true);
    setActiveStoryId('');
  };

  const closeShareDialog = () => {
    setIsShareDialogOpen(false);
    setSharePostId('');
    setShareStoryId('');
    setShareSearch('');
    setShareMessage('');
    setSelectedShareFriendIds([]);
  };

  const toggleShareFriendSelection = (friendId: string) => {
    setSelectedShareFriendIds((previous) =>
      previous.includes(friendId)
        ? previous.filter((id) => id !== friendId)
        : [...previous, friendId]
    );
  };

  const handleSendShareFromDialog = () => {
    if (!selectedShareFriendIds.length) {
      toast.error('Selecione ao menos um perfil para compartilhar.');
      return;
    }

    if (sharePost) {
      selectedShareFriendIds.forEach((friendId) =>
        handleSharePostWithFriend(sharePost, friendId, shareMessage)
      );

      toast.success(
        selectedShareFriendIds.length > 1
          ? 'Post enviado para os perfis selecionados.'
          : 'Post enviado no chat.'
      );
      closeShareDialog();
      return;
    }

    if (shareStory) {
      selectedShareFriendIds.forEach((friendId) =>
        handleShareStoryWithFriend(shareStory, friendId, shareMessage)
      );

      toast.success(
        selectedShareFriendIds.length > 1
          ? 'Story enviada para os perfis selecionados.'
          : 'Story enviada no chat.'
      );
      closeShareDialog();
      return;
    }

    toast.error('Selecione um post ou story para compartilhar.');
    closeShareDialog();
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

  const isFeedSection = activeSection === 'feed';

  return (
    <div className={cn('pb-24 md:pb-8', isFeedSection ? 'space-y-4' : 'space-y-6')}>
      {!isFeedSection && (
        <div>
          <p className="text-sm text-muted-foreground">
            Seguindo, notificacoes, CLAs com metas e desafios coletivos em um unico lugar.
          </p>
          <h1 className="mt-1 text-2xl md:text-3xl font-bold">
            Comunidade <span className="gradient-text">FitTrack</span>
          </h1>
        </div>
      )}

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
        className={cn('space-y-4', isFeedSection && 'space-y-3')}
      >
        {showSectionTabs && (
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 md:grid-cols-6">
            <TabsTrigger value="search" className="py-2 text-xs md:text-sm">
              <Search className="mr-1 h-4 w-4" />
              Pesquisa
            </TabsTrigger>
            <TabsTrigger value="friends" className="py-2 text-xs md:text-sm">
              <Users className="mr-1 h-4 w-4" />
              Seguindo
            </TabsTrigger>
            <TabsTrigger value="clans" className="py-2 text-xs md:text-sm">
              <Trophy className="mr-1 h-4 w-4" />
              CLA
            </TabsTrigger>
            <TabsTrigger value="chat" className="py-2 text-xs md:text-sm">
              <MessageCircle className="mr-1 h-4 w-4" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="feed" className="py-2 text-xs md:text-sm">
              <ImagePlus className="mr-1 h-4 w-4" />
              Feed
            </TabsTrigger>
            <TabsTrigger value="notifications" className="py-2 text-xs md:text-sm">
              <BellRing className="mr-1 h-4 w-4" />
              Notificacoes
            </TabsTrigger>
          </TabsList>
        )}

        <TabsContent value="search" className="space-y-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg">Pesquisar usuarios</CardTitle>
              <CardDescription>
                Comece a digitar o @usuario para ver perfis correspondentes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={handleAddFriend}>
                <div className="space-y-2">
                  <Label htmlFor="friend-handle-search">Buscar por @usuario</Label>
                  <Input
                    id="friend-handle-search"
                    value={friendHandle}
                    onChange={handleFriendHandleChange}
                    placeholder="@anafit"
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">
                    Digite para filtrar em tempo real.
                  </p>
                  {isSearchingProfiles && (
                    <p className="text-xs text-muted-foreground">Buscando perfis...</p>
                  )}
                  {!!friendHandle.trim() && !isSearchingProfiles && !filteredDiscoverableProfiles.length && (
                    <p className="text-xs text-muted-foreground">Nenhum perfil encontrado.</p>
                  )}
                  {!!filteredDiscoverableProfiles.length && (
                    <div className="max-h-52 overflow-y-auto rounded-lg border border-border/70 bg-card/50 p-1">
                      {filteredDiscoverableProfiles.map((candidate) => (
                        <button
                          key={candidate.normalizedHandle}
                          type="button"
                          onClick={() => handleSelectDiscoverableProfile(candidate)}
                          className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left hover:bg-secondary/60"
                        >
                          <span className="line-clamp-1 text-sm font-medium">{candidate.name}</span>
                          <span className="text-xs text-muted-foreground">{candidate.handle}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="friend-name-search">Nome (opcional)</Label>
                  <Input
                    id="friend-name-search"
                    value={friendName}
                    onChange={(event) => setFriendName(event.target.value)}
                    placeholder="Nome do perfil (opcional)"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="friend-goal-search">Objetivo do perfil</Label>
                  <Input
                    id="friend-goal-search"
                    value={friendGoal}
                    onChange={(event) => setFriendGoal(event.target.value)}
                    placeholder="Ex: correr 5 km"
                  />
                </div>
                <Button type="submit" variant="energy" className="w-full">
                  <UserPlus className="h-4 w-4" />
                  Enviar pedido para seguir
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="friends" className="space-y-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg">Solicitacoes para seguir</CardTitle>
              <CardDescription>
                Busque por @usuario e envie o pedido para seguir.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 xl:grid-cols-2">
              <form className="space-y-3" onSubmit={handleAddFriend}>
                <div className="space-y-2">
                  <Label htmlFor="friend-handle">Buscar por @usuario</Label>
                  <Input
                    id="friend-handle"
                    value={friendHandle}
                    onChange={handleFriendHandleChange}
                    placeholder="@anafit"
                  />
                  <p className="text-xs text-muted-foreground">
                    Digite para ver sugestoes de perfis em tempo real.
                  </p>
                  {!!filteredDiscoverableProfiles.length && (
                    <div className="max-h-40 overflow-y-auto rounded-lg border border-border/70 bg-card/50 p-1">
                      {filteredDiscoverableProfiles.map((candidate) => (
                        <button
                          key={candidate.normalizedHandle}
                          type="button"
                          onClick={() => handleSelectDiscoverableProfile(candidate)}
                          className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left hover:bg-secondary/60"
                        >
                          <span className="line-clamp-1 text-sm font-medium">{candidate.name}</span>
                          <span className="text-xs text-muted-foreground">{candidate.handle}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="friend-name">Nome (opcional)</Label>
                  <Input
                    id="friend-name"
                    value={friendName}
                    onChange={(event) => setFriendName(event.target.value)}
                    placeholder="Nome do perfil (opcional)"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="friend-goal">Objetivo do perfil</Label>
                  <Input
                    id="friend-goal"
                    value={friendGoal}
                    onChange={(event) => setFriendGoal(event.target.value)}
                    placeholder="Ex: correr 5 km"
                  />
                </div>
                <Button type="submit" variant="energy" className="w-full">
                  <UserPlus className="h-4 w-4" />
                  Enviar pedido para seguir
                </Button>
              </form>

              <div className="space-y-3">
                <h3 className="font-semibold">Pedidos recebidos</h3>
                {!incomingFriendRequests.length && (
                  <p className="text-sm text-muted-foreground">Nenhum pedido pendente.</p>
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
              <CardTitle className="text-lg">Rede de seguindo</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-2">
                <h3 className="font-semibold">Perfis que voce segue</h3>
                {!socialState.friends.length && (
                  <p className="text-sm text-muted-foreground">Voce ainda nao segue ninguem.</p>
                )}
                {socialState.friends.map((friend) => (
                  <div key={friend.id} className="rounded-lg border border-border/70 bg-card/40 p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{friend.name}</p>
                        <p className="text-sm text-muted-foreground">{friend.handle}</p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleRemoveFriend(friend.id)}
                      >
                        <UserMinus className="h-4 w-4" />
                        Remover
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Meta: {friend.goal}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold">Pedidos enviados</h3>
                {!outgoingPendingFriendRequests.length && (
                  <p className="text-sm text-muted-foreground">Nenhum pedido pendente.</p>
                )}
                {outgoingPendingFriendRequests.map((request) => (
                  <div key={request.id} className="rounded-lg border border-border/70 bg-card/40 p-3 space-y-3">
                    <p className="font-semibold">{request.receiverName}</p>
                    <p className="text-sm text-muted-foreground">{request.receiverHandle}</p>
                    <p className="text-xs text-muted-foreground mt-1">Enviado em {formatDateTime(request.createdAt)}</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleCancelOutgoingFriendRequest(request.id)}
                    >
                      <X className="h-4 w-4" />
                      Cancelar solicitacao
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="clans" className="space-y-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg">Criacao de CLA</CardTitle>
              <CardDescription>Adicione perfis que voce segue e defina metas e desafios juntos.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 xl:grid-cols-2">
              <form className="space-y-3" onSubmit={handleCreateClan}>
                <div className="space-y-2">
                  <Label htmlFor="clan-name">Nome do CLA</Label>
                  <Input id="clan-name" value={clanName} onChange={(event) => setClanName(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clan-description">Descricao</Label>
                  <Textarea id="clan-description" value={clanDescription} onChange={(event) => setClanDescription(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Membros</Label>
                  <div className="rounded-lg border border-border/70 p-2 max-h-40 overflow-y-auto space-y-2">
                    {!socialState.friends.length && <p className="text-sm text-muted-foreground">Siga perfis primeiro.</p>}
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
                  Criar CLA
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
                    {!socialState.clans.length && <option value="">Nenhum CLA</option>}
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
                    {!socialState.clans.length && <option value="">Nenhum CLA</option>}
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
              <CardTitle className="text-lg">CLAs criados</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!socialState.clans.length && <p className="text-sm text-muted-foreground">Nenhum CLA criado.</p>}
              {socialState.clans.map((clan) => (
                <div key={clan.id} className="rounded-lg border border-border/70 bg-card/40 p-3 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{clan.name}</p>
                      <p className="text-xs text-muted-foreground">Criado em {formatDate(clan.createdAt)}</p>
                    </div>
                    <Badge variant="outline">{clan.memberIds.length} seguindo</Badge>
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
              <CardDescription>Converse e compartilhe posts direto com quem voce segue.</CardDescription>
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
                  {!socialState.friends.length && <option value="">Nenhum perfil seguido disponivel</option>}
                  {socialState.friends.map((friend) => (
                    <option key={friend.id} value={friend.id}>
                      {friend.name}
                    </option>
                  ))}
                </select>
              </div>

              {!socialState.friends.length && (
                <p className="text-sm text-muted-foreground">Siga perfis para iniciar o chat.</p>
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
                      const sharedStory = message.storyId ? storiesById.get(message.storyId) : null;
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
                            {!sharedPost && sharedStory && (
                              <div className="mt-2 rounded-md border border-white/20 bg-black/20 p-2">
                                <img
                                  src={sharedStory.imageDataUrl}
                                  alt={`Story de ${sharedStory.authorName}`}
                                  className="h-24 w-full rounded-md object-cover"
                                />
                                <p className="mt-1 text-xs text-slate-200 line-clamp-2">
                                  Story: {sharedStory.caption || 'Sem legenda'}
                                </p>
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

        <TabsContent value="feed" className="social-feed-column space-y-4 md:space-y-5">
          <div className="flex items-center justify-between px-1">
            <p className="hidden text-sm text-muted-foreground md:block">Home</p>
            <Button
              type="button"
              size="icon"
              className="h-10 w-10 rounded-full"
              onClick={() => openComposer('post')}
            >
              <Plus className="h-5 w-5" />
              <span className="sr-only">Criar post</span>
            </Button>
          </div>

          <div className="rounded-2xl border border-border/80 bg-card/65 px-3 py-3">
            <div className="social-stories-row">
              <button
                type="button"
                onClick={() => openComposer('story')}
                className="flex w-[74px] shrink-0 flex-col items-center gap-1 text-center"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-primary/80 bg-primary/10">
                  <Plus className="h-5 w-5 text-primary" />
                </div>
                <span className="line-clamp-1 text-[11px]">Seu story</span>
              </button>

              {activeStories.map((story) => (
                <button
                  key={story.id}
                  type="button"
                  onClick={() => setActiveStoryId(story.id)}
                  className="flex w-[74px] shrink-0 flex-col items-center gap-1 text-center"
                >
                  <div className="social-story-ring">
                    <img
                      src={story.imageDataUrl}
                      alt={`Story de ${story.authorName}`}
                      className="h-16 w-16 rounded-full border-2 border-background object-cover"
                    />
                  </div>
                  <span className="line-clamp-1 text-[11px]">
                    {story.authorName.split(' ')[0]}
                  </span>
                </button>
              ))}
            </div>
            {!activeStories.length && (
              <p className="mt-2 text-xs text-muted-foreground">Sem stories nas ultimas 24h.</p>
            )}
          </div>

          {!globalPosts.length && (
            <div className="rounded-2xl border border-border/80 bg-card/65 p-4">
              <p className="text-sm text-muted-foreground">Ainda nao ha posts no feed.</p>
            </div>
          )}

          <div className="space-y-4">
            {globalPosts.map((post) => {
              const likedByMe = post.likedByHandles.some(
                (handle) => normalizeHandle(handle) === normalizedProfileHandle
              );

              return (
                <article key={post.id} className="social-feed-post">
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="social-story-ring">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-card text-xs font-semibold">
                          {getInitials(post.authorName)}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{post.authorName}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {post.authorHandle} - {formatDateTime(post.createdAt)}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="hidden md:inline-flex">
                      {post.sharedCount} compartilhamentos
                    </Badge>
                  </div>

                  <img
                    src={post.imageDataUrl}
                    alt={`Post de ${post.authorName}`}
                    className="aspect-square w-full object-cover"
                  />

                  <div className="space-y-3 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant={likedByMe ? 'default' : 'ghost'}
                          className="h-8 rounded-full px-3"
                          onClick={() => handleLikePost(post.id)}
                        >
                          <Heart className="h-4 w-4" />
                          {post.likes}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 rounded-full px-3"
                          onClick={() => openShareDialog(post)}
                        >
                          <Send className="h-4 w-4" />
                          Compartilhar
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {post.comments.length} comentario(s)
                      </p>
                    </div>

                    {!!post.caption && (
                      <p className="text-sm">
                        <span className="mr-1 font-semibold">{post.authorName}</span>
                        {post.caption}
                      </p>
                    )}

                    <div className="space-y-2 rounded-xl border border-border/70 bg-background/40 p-2.5">
                      {!post.comments.length && (
                        <p className="text-xs text-muted-foreground">
                          Seja o primeiro a comentar.
                        </p>
                      )}
                      {post.comments.map((comment) => {
                        const likedCommentByMe = comment.likedByHandles.some(
                          (handle) => normalizeHandle(handle) === normalizedProfileHandle
                        );
                        return (
                          <div key={comment.id} className="rounded-lg border border-border/60 bg-card/45 p-2">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-xs font-semibold">
                                  {comment.authorName}{' '}
                                  <span className="text-muted-foreground">{comment.authorHandle}</span>
                                </p>
                                <p className="text-sm">{comment.text}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {formatDateTime(comment.createdAt)}
                                </p>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant={likedCommentByMe ? 'default' : 'ghost'}
                                className="h-7 min-w-7 rounded-full px-2"
                                onClick={() => handleLikeComment(post.id, comment.id)}
                              >
                                <Heart className="h-3.5 w-3.5" />
                                {comment.likes}
                              </Button>
                            </div>
                          </div>
                        );
                      })}

                      <form
                        className="flex items-center gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          handleAddPostComment(post.id);
                        }}
                      >
                        <Input
                          value={postCommentInputs[post.id] || ''}
                          onChange={(event) =>
                            setPostCommentInputs((previous) => ({
                              ...previous,
                              [post.id]: event.target.value,
                            }))
                          }
                          placeholder="Adicione um comentario..."
                          className="h-9 rounded-full bg-secondary/65"
                        />
                        <Button
                          type="submit"
                          size="sm"
                          variant="outline"
                          className="h-9 rounded-full px-3"
                          disabled={!(postCommentInputs[post.id] || '').trim()}
                        >
                          <Send className="h-3.5 w-3.5" />
                        </Button>
                      </form>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
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
                <CardTitle className="text-lg">Solicitacoes para seguir pendentes</CardTitle>
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

      <Dialog open={isShareDialogOpen} onOpenChange={(open) => (open ? setIsShareDialogOpen(true) : closeShareDialog())}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Compartilhar</DialogTitle>
            <DialogDescription>
              Escolha para quem enviar, como no painel do Instagram.
            </DialogDescription>
          </DialogHeader>

          {sharePost && (
            <div className="rounded-lg border border-border/70 bg-card/40 p-2">
              <div className="flex items-center gap-3">
                <img
                  src={sharePost.imageDataUrl}
                  alt={`Post de ${sharePost.authorName}`}
                  className="h-14 w-14 rounded-md object-cover"
                />
                <div>
                  <p className="text-sm font-medium line-clamp-1">{sharePost.authorName}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{sharePost.caption}</p>
                </div>
              </div>
            </div>
          )}
          {!sharePost && shareStory && (
            <div className="rounded-lg border border-border/70 bg-card/40 p-2">
              <div className="flex items-center gap-3">
                <img
                  src={shareStory.imageDataUrl}
                  alt={`Story de ${shareStory.authorName}`}
                  className="h-14 w-14 rounded-md object-cover"
                />
                <div>
                  <p className="text-sm font-medium line-clamp-1">{shareStory.authorName}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {shareStory.caption || 'Story sem legenda'}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="share-search">Pesquisar perfil</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="share-search"
                value={shareSearch}
                onChange={(event) => setShareSearch(event.target.value)}
                className="pl-10"
                placeholder="Digite nome ou @usuario"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Enviar para</Label>
            <div className="max-h-44 overflow-y-auto rounded-lg border border-border/70 p-2">
              {!filteredShareFriends.length && (
                <p className="text-sm text-muted-foreground">Nenhum perfil encontrado.</p>
              )}
              <div className="grid grid-cols-3 gap-2">
                {filteredShareFriends.map((friend) => {
                  const selected = selectedShareFriendIds.includes(friend.id);
                  return (
                    <button
                      key={friend.id}
                      type="button"
                      onClick={() => toggleShareFriendSelection(friend.id)}
                      className={`rounded-lg border p-2 text-center transition-colors ${
                        selected
                          ? 'border-primary bg-primary/15'
                          : 'border-border/70 hover:border-primary/40 hover:bg-secondary/40'
                      }`}
                    >
                      <div className="mx-auto mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-warning/50 via-primary/35 to-success/45 text-sm font-semibold">
                        {getInitials(friend.name)}
                      </div>
                      <p className="line-clamp-1 text-xs font-medium">{friend.name}</p>
                      <p className="line-clamp-1 text-[10px] text-muted-foreground">{friend.handle}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="share-message">Mensagem (opcional)</Label>
            <Textarea
              id="share-message"
              value={shareMessage}
              onChange={(event) => setShareMessage(event.target.value)}
              placeholder="Digite uma mensagem para acompanhar o compartilhamento."
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                sharePost
                  ? handleShareOnInstagram(sharePost, 'post')
                  : shareStory && handleShareOnInstagram(shareStory, 'story')
              }
              disabled={!sharePost && !shareStory}
            >
              <Instagram className="h-4 w-4" />
              Instagram
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                sharePost
                  ? handleShareOnWhatsApp(sharePost, 'post')
                  : shareStory && handleShareOnWhatsApp(shareStory, 'story')
              }
              disabled={!sharePost && !shareStory}
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                sharePost
                  ? handleCopyShareText(sharePost, 'post')
                  : shareStory && handleCopyShareText(shareStory, 'story')
              }
              disabled={!sharePost && !shareStory}
            >
              <Copy className="h-4 w-4" />
              Copiar
            </Button>
          </div>

          <Button
            type="button"
            variant="energy"
            className="w-full"
            disabled={(!sharePost && !shareStory) || !selectedShareFriendIds.length}
            onClick={handleSendShareFromDialog}
          >
            <Send className="h-4 w-4" />
            Enviar ({selectedShareFriendIds.length})
          </Button>
        </DialogContent>
      </Dialog>

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
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-4 text-white space-y-3">
                {!!activeStory.caption && (
                  <p className="text-sm">{activeStory.caption}</p>
                )}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={
                        activeStory.likedByHandles.some(
                          (handle) => normalizeHandle(handle) === normalizedProfileHandle
                        )
                          ? 'default'
                          : 'outline'
                      }
                      className="h-8 border-white/40 bg-black/30 text-white hover:bg-black/45"
                      onClick={() => handleLikeStory(activeStory.id)}
                    >
                      <Heart className="h-3.5 w-3.5" />
                      {activeStory.likes}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 border-white/40 bg-black/30 text-white hover:bg-black/45"
                      onClick={() => openStoryShareDialog(activeStory)}
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      Compartilhar
                    </Button>
                  </div>
                  <span className="text-xs text-slate-200">
                    {activeStory.sharedCount} compartilhamentos
                  </span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}


