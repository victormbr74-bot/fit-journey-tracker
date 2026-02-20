import { ChangeEvent, FormEvent, SyntheticEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bell,
  Camera,
  ChevronLeft,
  ChevronRight,
  Check,
  CheckCheck,
  CheckCircle2,
  Copy,
  Heart,
  ImagePlus,
  Instagram,
  Lock,
  Loader2,
  Mic,
  MessageCircle,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Send,
  Share2,
  Smile,
  Smartphone,
  Square,
  Target,
  Trophy,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  SOCIAL_CHAT_READ_STATE_STORAGE_PREFIX,
  SOCIAL_CHAT_SETTINGS_STORAGE_PREFIX,
  SOCIAL_GLOBAL_CHAT_EVENTS_STORAGE_KEY,
  SOCIAL_GLOBAL_FEED_STORAGE_KEY,
  SOCIAL_GLOBAL_FRIEND_REQUESTS_STORAGE_KEY,
  SOCIAL_GLOBAL_STORIES_STORAGE_KEY,
  SOCIAL_PERSONAL_GOAL_REQUEST_STORAGE_PREFIX,
  SOCIAL_PROFILE_STORAGE_PREFIX,
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
  SocialClanAutoGoalTemplate,
  SocialClan,
  SocialClanChallenge,
  SocialClanGoal,
  SocialChatMessage,
  SocialContentVisibility,
  SocialFeedPost,
  SocialFriend,
  SocialFriendRequest,
  SocialGlobalChatEvent,
  SocialNotification,
  SocialNotificationTarget,
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
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { disableSocialGlobalState, isSocialGlobalStateAvailable } from '@/lib/socialSyncCapability';
import { useIsMobile } from '@/hooks/use-mobile';
import { useProfile } from '@/hooks/useProfile';

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

interface RemotePhoneProfileSearchResult {
  profile_id: string;
  name: string | null;
  handle: string;
  goal: string | null;
  phone: string | null;
}

interface RemotePublicProfileSummaryResult {
  profile_id: string;
  name: string | null;
  handle: string;
  goal: string | null;
  points: number | null;
}

interface FriendProfileSummary {
  profileId?: string;
  name: string;
  handle: string;
  goal: string;
  points: number | null;
}

interface ContactPickerResult {
  name?: string[];
  tel?: string[];
}

type NavigatorWithContacts = Navigator & {
  contacts?: {
    select: (
      properties: Array<'name' | 'tel'>,
      options?: { multiple?: boolean }
    ) => Promise<ContactPickerResult[]>;
  };
};

interface DevicePhoneContact {
  name: string;
  phone: string;
  normalizedPhone: string;
}

interface MatchedPhoneContact {
  id: string;
  contactName: string;
  contactPhone: string;
  profile: DiscoverableProfile;
}

interface ChatAttachmentDraft {
  name: string;
  type: string;
  dataUrl: string;
}

interface StoryGroup {
  authorHandle: string;
  authorName: string;
  previewImageDataUrl: string;
  latestCreatedAt: string;
  stories: SocialStory[];
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
const MAX_CHAT_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_GLOBAL_CHAT_ATTACHMENT_DATA_URL_LENGTH = 700000;
const MAX_GLOBAL_CHAT_AUDIO_ATTACHMENT_DATA_URL_LENGTH = 4000000;
const MAX_VOICE_RECORDING_SECONDS = 60;
const DEFAULT_GOAL_TARGET = 1;
const DEFAULT_GOAL_UNIT = 'tarefas';
const DEFAULT_GOAL_AUTO_DUE_DAYS = 7;
const DEFAULT_AUTO_DAILY_GOAL_TITLE = 'Treino diario';
const DEFAULT_AUTO_WEEKLY_GOAL_TITLE = 'Treino semanal';
const DEFAULT_AUTO_DAILY_GOAL_TARGET = 1;
const DEFAULT_AUTO_WEEKLY_GOAL_TARGET = 4;
const DEFAULT_AUTO_GOAL_UNIT = 'treinos';
const CLAN_SELF_MEMBER_KEY = '__self__';
const GLOBAL_FEED_POST_LIMIT = 500;
const GLOBAL_STORY_LIMIT = 500;
const GLOBAL_FRIEND_REQUEST_LIMIT = 500;
const GLOBAL_CHAT_EVENT_LIMIT = 1000;
const SEEN_CHAT_EVENT_LIMIT = 2000;
const SEEN_FRIEND_REQUEST_LIMIT = 1200;
const STORY_DURATION_HOURS = 24;
const SOCIAL_GLOBAL_STATE_ID = true;
const GLOBAL_SYNC_POLL_INTERVAL_MS = 3500;
const PHONE_REGEX = /^[0-9()+\-\s]{8,20}$/;
const FIT_CHAT_ENTRY_PATH = '/chat';
const FIT_CHAT_WEB_PUSH_PUBLIC_KEY = import.meta.env.VITE_FITCHAT_WEB_PUSH_PUBLIC_KEY as string | undefined;
const APP_NOTIFICATION_ICON = '/favicon.png';
const APP_NOTIFICATION_BADGE = '/favicon.png';
const CHAT_QUICK_EMOJIS = [
  '😀',
  '😁',
  '😂',
  '😅',
  '😉',
  '😊',
  '😍',
  '🤩',
  '🔥',
  '💪',
  '👏',
  '🎯',
  '🏃',
  '🏋️',
  '🥗',
  '💧',
];

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const sanitizeHandleInput = (value: string) => sanitizeHandleBody(value);
const normalizePhoneDigits = (value: string) => value.replace(/\D+/g, '');
const resolveSocialContentVisibility = (value: unknown): SocialContentVisibility =>
  value === 'private' ? 'private' : 'public';
const parseProfileAccountVisibility = (value: string | null): SocialContentVisibility => {
  if (!value) return 'public';
  try {
    const parsed = JSON.parse(value) as {
      accountVisibility?: unknown;
      visibility?: unknown;
    };
    return resolveSocialContentVisibility(parsed.accountVisibility ?? parsed.visibility);
  } catch {
    return 'public';
  }
};
const SOCIAL_SECTION_PATH: Record<SocialSection, string> = {
  search: '/search',
  friends: '/friends',
  clans: '/clans',
  chat: '/chat',
  feed: '/feed',
  notifications: '/notifications',
};
const DEFAULT_NOTIFICATION_SECTION_BY_TYPE: Record<SocialNotificationType, SocialSection> = {
  friend: 'notifications',
  clan: 'clans',
  goal: 'clans',
  challenge: 'clans',
  post: 'feed',
  chat: 'chat',
  system: 'notifications',
};
const isSocialNotificationType = (value: unknown): value is SocialNotificationType =>
  value === 'friend' ||
  value === 'clan' ||
  value === 'goal' ||
  value === 'challenge' ||
  value === 'post' ||
  value === 'chat' ||
  value === 'system';
const isSocialSection = (value: unknown): value is SocialSection =>
  value === 'search' ||
  value === 'friends' ||
  value === 'clans' ||
  value === 'chat' ||
  value === 'feed' ||
  value === 'notifications';
const sanitizeNotificationTarget = (target: unknown): SocialNotificationTarget | undefined => {
  if (!target || typeof target !== 'object') return undefined;
  const rawTarget = target as Partial<SocialNotificationTarget>;
  const section = isSocialSection(rawTarget.section) ? rawTarget.section : undefined;
  const path =
    typeof rawTarget.path === 'string' && rawTarget.path.trim().startsWith('/')
      ? rawTarget.path.trim()
      : undefined;
  const friendId =
    typeof rawTarget.friendId === 'string' && rawTarget.friendId.trim()
      ? rawTarget.friendId.trim()
      : undefined;
  const normalizedFriendHandle = normalizeHandle(
    typeof rawTarget.friendHandle === 'string' ? rawTarget.friendHandle : ''
  );
  const friendHandle = normalizedFriendHandle ? toHandle(normalizedFriendHandle) : undefined;
  const messageId =
    typeof rawTarget.messageId === 'string' && rawTarget.messageId.trim()
      ? rawTarget.messageId.trim()
      : undefined;
  const postId =
    typeof rawTarget.postId === 'string' && rawTarget.postId.trim()
      ? rawTarget.postId.trim()
      : undefined;
  const storyId =
    typeof rawTarget.storyId === 'string' && rawTarget.storyId.trim()
      ? rawTarget.storyId.trim()
      : undefined;

  if (!section && !path && !friendId && !friendHandle && !messageId && !postId && !storyId) {
    return undefined;
  }

  return {
    section,
    path,
    friendId,
    friendHandle,
    messageId,
    postId,
    storyId,
  };
};
const sanitizeNotifications = (notifications: unknown): SocialNotification[] => {
  if (!Array.isArray(notifications)) return [];

  return notifications
    .map((notification, index) => {
      if (!notification || typeof notification !== 'object') return null;
      const rawNotification = notification as Partial<SocialNotification>;
      const createdAt =
        isValidIsoDate(rawNotification.createdAt) ? rawNotification.createdAt : new Date().toISOString();
      const title = rawNotification.title?.toString().trim() || 'Atualizacao';
      const description = rawNotification.description?.toString().trim() || 'Toque para abrir';

      return {
        id:
          typeof rawNotification.id === 'string' && rawNotification.id.trim()
            ? rawNotification.id.trim()
            : `notification-${index}-${createId()}`,
        type: isSocialNotificationType(rawNotification.type) ? rawNotification.type : 'system',
        title,
        description,
        createdAt,
        read: Boolean(rawNotification.read),
        target: sanitizeNotificationTarget(rawNotification.target),
      } as SocialNotification;
    })
    .filter((notification): notification is SocialNotification => Boolean(notification))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, NOTIFICATION_LIMIT);
};
const buildChatEntryPath = (options?: { friendHandle?: string; messageId?: string }) => {
  const params = new URLSearchParams();
  const normalizedFriendHandle = normalizeHandle(options?.friendHandle || '');
  if (normalizedFriendHandle) {
    params.set('friend', toHandle(normalizedFriendHandle));
  }
  const messageId = options?.messageId?.trim();
  if (messageId) {
    params.set('message', messageId);
  }
  const queryString = params.toString();
  return queryString ? `${FIT_CHAT_ENTRY_PATH}?${queryString}` : FIT_CHAT_ENTRY_PATH;
};
const isValidPhoneInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed || !PHONE_REGEX.test(trimmed)) return false;
  const normalized = normalizePhoneDigits(trimmed);
  return normalized.length >= 8 && normalized.length <= 20;
};

const decodeBase64UrlToUint8Array = (value: string) => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = `${base64}${padding}`;
  const raw = window.atob(normalized);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
};

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

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeGoalUnit = (value: string) => {
  const raw = value.trim().toLowerCase();
  if (!raw) return DEFAULT_GOAL_UNIT;
  if (raw.startsWith('km') || raw.includes('quilomet')) return 'km';
  if (raw.startsWith('trein')) return 'treinos';
  if (raw.startsWith('dia')) return 'dias';
  if (raw.startsWith('hora')) return 'horas';
  if (raw.startsWith('min')) return 'minutos';
  if (raw.startsWith('pass')) return 'passos';
  if (raw.startsWith('cal')) return 'calorias';
  if (raw.startsWith('repet') || raw.startsWith('rep')) return 'repeticoes';
  if (raw.startsWith('seri')) return 'series';
  if (raw.startsWith('lit')) return 'litros';
  if (raw.startsWith('cop')) return 'copos';
  return raw;
};

const calculateGoalAwardPoints = (targetValue: number) => {
  const safeTarget = Math.max(1, Math.round(targetValue));
  return Math.max(15, Math.min(250, 10 + safeTarget * 4));
};

const calculateGoalPenaltyPoints = (awardPoints: number) => {
  const safeAward = Math.max(1, Math.round(awardPoints));
  return Math.max(5, Math.round(safeAward * 0.5));
};

const resolveGoalDueTimestamp = (dueDate: string) => {
  if (!dueDate) return null;
  const parsedDate = new Date(dueDate);
  if (Number.isNaN(parsedDate.getTime())) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    parsedDate.setHours(23, 59, 59, 999);
  }
  return parsedDate.getTime();
};

const isValidIsoDate = (value: unknown): value is string =>
  typeof value === 'string' && Boolean(value) && !Number.isNaN(new Date(value).getTime());

const getWeekStartDate = (referenceDate: Date) => {
  const normalizedDate = new Date(referenceDate);
  normalizedDate.setHours(0, 0, 0, 0);
  const weekDay = normalizedDate.getDay();
  const diffToMonday = weekDay === 0 ? -6 : 1 - weekDay;
  normalizedDate.setDate(normalizedDate.getDate() + diffToMonday);
  return normalizedDate;
};

const getWeekPeriodKey = (referenceDate: Date) => {
  const weekStart = getWeekStartDate(referenceDate);
  return `week-${toDateInputValue(weekStart)}`;
};

const getWeekDueDate = (referenceDate: Date) => {
  const weekStart = getWeekStartDate(referenceDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  return toDateInputValue(weekEnd);
};

const resolveAutoGoalSchedule = (
  frequency: SocialClanAutoGoalTemplate['frequency'],
  referenceDate: Date
) => {
  if (frequency === 'weekly') {
    return {
      dueDate: getWeekDueDate(referenceDate),
      periodKey: getWeekPeriodKey(referenceDate),
      goalType: 'auto_weekly' as const,
    };
  }

  return {
    dueDate: toDateInputValue(referenceDate),
    periodKey: toDateInputValue(referenceDate),
    goalType: 'auto_daily' as const,
  };
};

const normalizeGoalType = (goal: Partial<SocialClanGoal>): NonNullable<SocialClanGoal['goalType']> => {
  if (
    goal.goalType === 'manual' ||
    goal.goalType === 'personal' ||
    goal.goalType === 'auto_daily' ||
    goal.goalType === 'auto_weekly'
  ) {
    return goal.goalType;
  }

  if (goal.createdBy === 'personal') return 'personal';
  return 'manual';
};

const applyClanMemberPointsDelta = (
  clan: SocialClan,
  memberKey: string,
  delta: number
): Pick<SocialClan, 'memberPoints' | 'scoreUpdatedAt'> => {
  const nextMemberPoints = sanitizeClanMemberPoints(clan.memberPoints, clan.memberIds);
  const currentPoints = Number(nextMemberPoints[memberKey]) || 0;
  nextMemberPoints[memberKey] = currentPoints + delta;
  return {
    memberPoints: nextMemberPoints,
    scoreUpdatedAt: new Date().toISOString(),
  };
};

interface ParsedGoalRequest {
  title: string;
  targetValue: number;
  unit: string;
  dueDate: string;
}

const parseGoalRequest = (requestText: string): ParsedGoalRequest => {
  const trimmed = requestText.trim();
  const normalized = trimmed.replace(/\s+/g, ' ');
  const fallbackTitle = normalized || 'Meta personalizada';

  const targetMatch = normalized.match(
    /(\d+(?:[.,]\d+)?)\s*(km|quilometros?|treinos?|dias?|min(?:utos?)?|horas?|passos?|calorias?|series?|repeticoes?|reps?|vezes?|copos?|litros?)/i
  );
  const numericTarget = targetMatch?.[1]?.replace(',', '.');
  const parsedTarget = numericTarget ? Number.parseFloat(numericTarget) : Number.NaN;
  const targetValue = Number.isFinite(parsedTarget) && parsedTarget > 0
    ? Math.max(1, Math.round(parsedTarget))
    : DEFAULT_GOAL_TARGET;
  const unit = normalizeGoalUnit(targetMatch?.[2] || DEFAULT_GOAL_UNIT);

  let dueDate = '';
  const isoDateMatch = normalized.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (isoDateMatch?.[1]) {
    dueDate = isoDateMatch[1];
  } else {
    const brDateMatch = normalized.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
    if (brDateMatch) {
      const day = String(Number(brDateMatch[1])).padStart(2, '0');
      const month = String(Number(brDateMatch[2])).padStart(2, '0');
      const year = brDateMatch[3];
      dueDate = `${year}-${month}-${day}`;
    } else {
      const daysFromNowMatch = normalized.match(/\bem\s+(\d+)\s+dias?\b/i);
      const weeksFromNowMatch = normalized.match(/\bem\s+(\d+)\s+semanas?\b/i);
      const daysToAdd =
        daysFromNowMatch?.[1]
          ? Number(daysFromNowMatch[1])
          : weeksFromNowMatch?.[1]
            ? Number(weeksFromNowMatch[1]) * 7
            : /\bamanh[aã]\b/i.test(normalized)
              ? 1
              : DEFAULT_GOAL_AUTO_DUE_DAYS;
      const baseDate = new Date();
      baseDate.setDate(baseDate.getDate() + Math.max(1, daysToAdd));
      dueDate = toDateInputValue(baseDate);
    }
  }

  return {
    title: fallbackTitle.slice(0, 120),
    targetValue,
    unit,
    dueDate,
  };
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
        parentCommentId:
          typeof rawComment.parentCommentId === 'string' && rawComment.parentCommentId.trim()
            ? rawComment.parentCommentId.trim()
            : undefined,
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
        authorProfileId:
          typeof rawPost.authorProfileId === 'string' && rawPost.authorProfileId.trim()
            ? rawPost.authorProfileId.trim()
            : undefined,
        authorName: rawPost.authorName?.trim() || `Perfil ${index + 1}`,
        authorHandle: toHandle(rawPost.authorHandle || rawPost.authorName || `post.${index}`),
        caption: rawPost.caption?.trim() || '',
        imageDataUrl: rawPost.imageDataUrl,
        createdAt,
        visibility: resolveSocialContentVisibility(rawPost.visibility),
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
        authorProfileId:
          typeof rawStory.authorProfileId === 'string' && rawStory.authorProfileId.trim()
            ? rawStory.authorProfileId.trim()
            : undefined,
        authorName: rawStory.authorName?.trim() || `Perfil ${index + 1}`,
        authorHandle: toHandle(rawStory.authorHandle || rawStory.authorName || `story.${index}`),
        caption: rawStory.caption?.trim() || '',
        imageDataUrl: rawStory.imageDataUrl,
        createdAt,
        expiresAt,
        visibility: resolveSocialContentVisibility(rawStory.visibility),
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
    .map((event) => {
      if (!event || typeof event !== 'object') return null;
      if (!event.id || !event.senderProfileId || !event.senderHandle || !event.receiverHandle) return null;

      const createdAt = event.createdAt && !Number.isNaN(new Date(event.createdAt).getTime())
        ? event.createdAt
        : new Date().toISOString();
      const trimmedText = event.text?.toString().trim() || '';
      const attachmentDataUrl = event.attachmentDataUrl?.toString() || '';
      const attachmentName = event.attachmentName?.toString().trim() || '';
      const attachmentType = event.attachmentType?.toString().trim() || '';
      const maxAttachmentDataUrlLength = getGlobalChatAttachmentDataUrlLimit(attachmentType);
      const shouldKeepAttachmentDataUrl =
        isGlobalChatAttachmentMediaType(attachmentType) &&
        attachmentDataUrl.length > 0 &&
        attachmentDataUrl.length <= maxAttachmentDataUrlLength;
      const safeAttachmentDataUrl = shouldKeepAttachmentDataUrl ? attachmentDataUrl : '';

      if (!trimmedText && !safeAttachmentDataUrl && !attachmentName) return null;

      return {
        ...event,
        text: trimmedText || 'Arquivo compartilhado',
        createdAt,
        attachmentName: attachmentName || undefined,
        attachmentType: attachmentType || undefined,
        attachmentDataUrl: safeAttachmentDataUrl || undefined,
      } as SocialGlobalChatEvent;
    })
    .filter((event): event is SocialGlobalChatEvent => Boolean(event))
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

const mapRemotePhoneProfilesToDiscoverable = (
  rows: RemotePhoneProfileSearchResult[],
  normalizedProfileHandle: string
): (DiscoverableProfile & { phone: string })[] =>
  rows
    .map((item) => {
      const normalizedHandle = normalizeHandle(item.handle);
      const normalizedPhone = normalizePhoneDigits(item.phone || '');
      if (!normalizedHandle || normalizedHandle === normalizedProfileHandle || !normalizedPhone) return null;

      const fallbackName = item.name?.trim() || toHandle(item.handle);
      return {
        profileId: item.profile_id,
        handle: toHandle(item.handle),
        normalizedHandle,
        name: fallbackName,
        goal: resolveGoalLabel(item.goal),
        phone: normalizedPhone,
      } as DiscoverableProfile & { phone: string };
    })
    .filter((item): item is DiscoverableProfile & { phone: string } => Boolean(item));

const createFriendProfileSummaryFallback = (friend: SocialFriend): FriendProfileSummary => ({
  profileId: friend.profileId,
  name: friend.name?.trim() || 'Perfil',
  handle: toHandle(friend.handle || friend.name || 'fit.user'),
  goal: friend.goal?.trim() || 'Sem meta definida',
  points: null,
});

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
      const attachmentDataUrl = rawMessage.attachmentDataUrl?.toString() || '';
      const attachmentName = rawMessage.attachmentName?.toString().trim() || '';
      const messageText = rawMessage.text?.toString().trim() || '';
      if (!messageText && !attachmentDataUrl && !attachmentName) return null;

      return {
        id: rawMessage.id,
        friendId: rawMessage.friendId,
        sender: rawMessage.sender === 'friend' ? 'friend' : 'me',
        text: messageText || 'Arquivo compartilhado',
        createdAt,
        postId: rawMessage.postId,
        storyId: rawMessage.storyId,
        attachmentName: attachmentName || undefined,
        attachmentType: rawMessage.attachmentType?.toString().trim() || undefined,
        attachmentDataUrl: attachmentDataUrl || undefined,
        externalEventId: rawMessage.externalEventId,
      } as SocialChatMessage;
    })
    .filter((message): message is SocialChatMessage => Boolean(message))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
};

const sanitizeChatReadState = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object') return {};

  const nextState: Record<string, string> = {};
  Object.entries(value).forEach(([friendId, readAt]) => {
    if (!friendId.trim() || typeof readAt !== 'string') return;
    const parsedReadAt = new Date(readAt);
    if (Number.isNaN(parsedReadAt.getTime())) return;
    nextState[friendId] = parsedReadAt.toISOString();
  });
  return nextState;
};

const isGlobalChatAttachmentMediaType = (attachmentType: string) =>
  attachmentType.startsWith('image/') || attachmentType.startsWith('audio/');

const getGlobalChatAttachmentDataUrlLimit = (attachmentType: string) =>
  attachmentType.startsWith('audio/')
    ? MAX_GLOBAL_CHAT_AUDIO_ATTACHMENT_DATA_URL_LENGTH
    : MAX_GLOBAL_CHAT_ATTACHMENT_DATA_URL_LENGTH;

const getAudioAttachmentExtension = (mimeType: string) => {
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
};

const sanitizeClanAutoGoalTemplates = (templates: unknown): SocialClanAutoGoalTemplate[] => {
  if (!Array.isArray(templates)) return [];

  const templatesByFrequency = new Map<SocialClanAutoGoalTemplate['frequency'], SocialClanAutoGoalTemplate>();
  templates.forEach((template, index) => {
    if (!template || typeof template !== 'object') return;
    const rawTemplate = template as Partial<SocialClanAutoGoalTemplate>;
    const frequency: SocialClanAutoGoalTemplate['frequency'] =
      rawTemplate.frequency === 'weekly' ? 'weekly' : 'daily';
    const fallbackTarget =
      frequency === 'weekly' ? DEFAULT_AUTO_WEEKLY_GOAL_TARGET : DEFAULT_AUTO_DAILY_GOAL_TARGET;
    const parsedTarget = Number(rawTemplate.targetValue);
    const targetValue =
      Number.isFinite(parsedTarget) && parsedTarget > 0
        ? Math.max(1, Math.round(parsedTarget))
        : fallbackTarget;
    const createdAt = isValidIsoDate(rawTemplate.createdAt)
      ? rawTemplate.createdAt
      : new Date().toISOString();
    const updatedAt = isValidIsoDate(rawTemplate.updatedAt)
      ? rawTemplate.updatedAt
      : undefined;
    const fallbackTitle =
      frequency === 'weekly' ? DEFAULT_AUTO_WEEKLY_GOAL_TITLE : DEFAULT_AUTO_DAILY_GOAL_TITLE;
    const nextTemplate: SocialClanAutoGoalTemplate = {
      id:
        typeof rawTemplate.id === 'string' && rawTemplate.id
          ? rawTemplate.id
          : `clan-auto-template-${frequency}-${index}-${createId()}`,
      title: rawTemplate.title?.trim() || fallbackTitle,
      targetValue,
      unit: normalizeGoalUnit(rawTemplate.unit || DEFAULT_AUTO_GOAL_UNIT),
      frequency,
      enabled: typeof rawTemplate.enabled === 'boolean' ? rawTemplate.enabled : true,
      createdAt,
      updatedAt,
    };

    const previousTemplate = templatesByFrequency.get(frequency);
    if (!previousTemplate) {
      templatesByFrequency.set(frequency, nextTemplate);
      return;
    }

    const previousTimestamp = new Date(
      previousTemplate.updatedAt || previousTemplate.createdAt
    ).getTime();
    const nextTimestamp = new Date(nextTemplate.updatedAt || nextTemplate.createdAt).getTime();
    if (nextTimestamp >= previousTimestamp) {
      templatesByFrequency.set(frequency, nextTemplate);
    }
  });

  return Array.from(templatesByFrequency.values());
};

const sanitizeClanGoals = (goals: unknown): SocialClanGoal[] => {
  if (!Array.isArray(goals)) return [];

  return goals
    .map((goal, index) => {
      if (!goal || typeof goal !== 'object') return null;
      const rawGoal = goal as Partial<SocialClanGoal>;
      const title = rawGoal.title?.trim() || `Meta ${index + 1}`;
      const parsedTarget = Number(rawGoal.targetValue);
      const targetValue =
        Number.isFinite(parsedTarget) && parsedTarget > 0
          ? Math.max(1, Math.round(parsedTarget))
          : DEFAULT_GOAL_TARGET;
      const parsedCurrent = Number(rawGoal.currentValue);
      const currentValue = Number.isFinite(parsedCurrent)
        ? Math.max(0, Math.min(targetValue, Math.round(parsedCurrent)))
        : 0;
      const pointsAwarded = Number.isFinite(Number(rawGoal.pointsAwarded)) && Number(rawGoal.pointsAwarded) > 0
        ? Math.max(1, Math.round(Number(rawGoal.pointsAwarded)))
        : calculateGoalAwardPoints(targetValue);
      const pointsPenalty = Number.isFinite(Number(rawGoal.pointsPenalty)) && Number(rawGoal.pointsPenalty) > 0
        ? Math.max(1, Math.round(Number(rawGoal.pointsPenalty)))
        : calculateGoalPenaltyPoints(pointsAwarded);
      const dueDate = typeof rawGoal.dueDate === 'string' ? rawGoal.dueDate : '';
      const goalType = normalizeGoalType(rawGoal);
      const createdBy = rawGoal.createdBy === 'personal' ? 'personal' : 'user';
      const completed = Boolean(rawGoal.completed) || currentValue >= targetValue;

      let autoPeriodKey =
        typeof rawGoal.autoPeriodKey === 'string' && rawGoal.autoPeriodKey.trim()
          ? rawGoal.autoPeriodKey.trim()
          : undefined;
      if (!autoPeriodKey && goalType === 'auto_daily' && /^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
        autoPeriodKey = dueDate;
      }
      if (!autoPeriodKey && goalType === 'auto_weekly' && dueDate) {
        const dueDateObject = new Date(dueDate);
        if (!Number.isNaN(dueDateObject.getTime())) {
          autoPeriodKey = getWeekPeriodKey(dueDateObject);
        }
      }

      return {
        id: rawGoal.id || `clan-goal-${index}-${createId()}`,
        title: title.slice(0, 120),
        targetValue,
        currentValue,
        unit: normalizeGoalUnit(rawGoal.unit || DEFAULT_GOAL_UNIT),
        dueDate,
        completed,
        pointsAwarded,
        pointsPenalty,
        scoredAt: isValidIsoDate(rawGoal.scoredAt) ? rawGoal.scoredAt : undefined,
        penalizedAt: isValidIsoDate(rawGoal.penalizedAt) ? rawGoal.penalizedAt : undefined,
        createdBy,
        requestText: rawGoal.requestText?.trim() || undefined,
        goalType,
        autoTemplateId:
          typeof rawGoal.autoTemplateId === 'string' && rawGoal.autoTemplateId.trim()
            ? rawGoal.autoTemplateId.trim()
            : undefined,
        autoPeriodKey,
      } as SocialClanGoal;
    })
    .filter((goal): goal is SocialClanGoal => Boolean(goal));
};

const sanitizeClanChallenges = (challenges: unknown): SocialClanChallenge[] => {
  if (!Array.isArray(challenges)) return [];

  return challenges
    .map((challenge, index) => {
      if (!challenge || typeof challenge !== 'object') return null;
      const rawChallenge = challenge as Partial<SocialClanChallenge>;
      const parsedPoints = Number(rawChallenge.points);
      const points =
        Number.isFinite(parsedPoints) && parsedPoints > 0 ? Math.round(parsedPoints) : 100;

      return {
        id: rawChallenge.id || `clan-challenge-${index}-${createId()}`,
        title: rawChallenge.title?.trim() || `Desafio ${index + 1}`,
        description: rawChallenge.description?.trim() || '',
        points,
        dueDate: typeof rawChallenge.dueDate === 'string' ? rawChallenge.dueDate : '',
        completed: Boolean(rawChallenge.completed),
      } as SocialClanChallenge;
    })
    .filter((challenge): challenge is SocialClanChallenge => Boolean(challenge));
};

const sanitizeClanMemberPoints = (
  rawMemberPoints: unknown,
  memberIds: string[]
): Record<string, number> => {
  const nextPoints: Record<string, number> = {};
  if (rawMemberPoints && typeof rawMemberPoints === 'object') {
    Object.entries(rawMemberPoints as Record<string, unknown>).forEach(([memberKey, rawPoints]) => {
      if (!memberKey) return;
      const parsedPoints = Number(rawPoints);
      if (!Number.isFinite(parsedPoints)) return;
      nextPoints[memberKey] = Math.round(parsedPoints);
    });
  }

  if (!Object.prototype.hasOwnProperty.call(nextPoints, CLAN_SELF_MEMBER_KEY)) {
    nextPoints[CLAN_SELF_MEMBER_KEY] = 0;
  }

  memberIds.forEach((memberId) => {
    if (!Object.prototype.hasOwnProperty.call(nextPoints, memberId)) {
      nextPoints[memberId] = 0;
    }
  });

  return nextPoints;
};

const sanitizeClans = (
  clans: unknown,
  currentProfile: Pick<UserProfile, 'id' | 'name' | 'handle' | 'email'>
): SocialClan[] => {
  if (!Array.isArray(clans)) return [];

  const fallbackProfileHandle = toHandle(
    currentProfile.handle || currentProfile.name || currentProfile.email || 'fit.user'
  );
  const normalizedFallbackHandle = normalizeHandle(fallbackProfileHandle);
  const fallbackAdminHandle = normalizedFallbackHandle
    ? toHandle(normalizedFallbackHandle)
    : fallbackProfileHandle;
  const fallbackAdminName = currentProfile.name?.trim() || 'Voce';

  return clans
    .map((clan, index) => {
      if (!clan || typeof clan !== 'object') return null;
      const rawClan = clan as Partial<SocialClan>;
      const memberIds = Array.isArray(rawClan.memberIds)
        ? Array.from(
            new Set(rawClan.memberIds.filter((memberId): memberId is string => typeof memberId === 'string' && memberId))
          )
        : [];
      const createdAt = isValidIsoDate(rawClan.createdAt) ? rawClan.createdAt : new Date().toISOString();
      const adminProfileId =
        typeof rawClan.adminProfileId === 'string' && rawClan.adminProfileId
          ? rawClan.adminProfileId
          : undefined;
      const normalizedAdminHandle = normalizeHandle(rawClan.adminHandle || '');
      const adminHandle = normalizedAdminHandle ? toHandle(normalizedAdminHandle) : undefined;
      const adminFriendId =
        typeof rawClan.adminFriendId === 'string' &&
        rawClan.adminFriendId &&
        memberIds.includes(rawClan.adminFriendId)
          ? rawClan.adminFriendId
          : undefined;
      const hasExplicitAdmin = Boolean(adminProfileId || adminHandle || adminFriendId);

      return {
        id: rawClan.id || `clan-${index}-${createId()}`,
        name: rawClan.name?.trim() || `CLA ${index + 1}`,
        description: rawClan.description?.trim() || '',
        memberIds,
        adminProfileId: hasExplicitAdmin ? adminProfileId : currentProfile.id,
        adminHandle: hasExplicitAdmin ? adminHandle : fallbackAdminHandle,
        adminName: rawClan.adminName?.trim() || (hasExplicitAdmin ? 'Administrador do CLA' : fallbackAdminName),
        adminFriendId,
        adminDefinedAt: isValidIsoDate(rawClan.adminDefinedAt) ? rawClan.adminDefinedAt : createdAt,
        createdAt,
        goals: sanitizeClanGoals(rawClan.goals),
        challenges: sanitizeClanChallenges(rawClan.challenges),
        autoGoalTemplates: sanitizeClanAutoGoalTemplates(rawClan.autoGoalTemplates),
        memberPoints: sanitizeClanMemberPoints(rawClan.memberPoints, memberIds),
        scoreUpdatedAt: isValidIsoDate(rawClan.scoreUpdatedAt) ? rawClan.scoreUpdatedAt : undefined,
      } as SocialClan;
    })
    .filter((clan): clan is SocialClan => Boolean(clan));
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

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Erro ao processar audio.'));
    reader.readAsDataURL(blob);
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
  chat: 'FitChat',
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

const DEFAULT_CHAT_AVATAR = '/placeholder.svg';

const CHAT_BACKGROUND_STYLE = {
  backgroundColor: 'hsl(var(--background))',
  backgroundImage:
    'radial-gradient(circle at 1px 1px, hsl(var(--border) / 0.45) 1px, transparent 0)',
  backgroundSize: '22px 22px',
};

const formatChatListTime = (isoDate: string) => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isSameDay) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

const formatChatDayLabel = (isoDate: string) => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isSameDay) return 'HOJE';
  return date.toLocaleDateString('pt-BR').toUpperCase();
};

const formatChatPreview = (message: SocialChatMessage | null) => {
  if (!message) return 'Toque para iniciar conversa';
  if (message.postId) return message.sender === 'me' ? 'Voce compartilhou um post' : 'Compartilhou um post';
  if (message.storyId) return message.sender === 'me' ? 'Voce compartilhou uma story' : 'Compartilhou uma story';
  if (message.attachmentName || message.attachmentDataUrl) {
    const isAudio = (message.attachmentType || '').startsWith('audio/');
    const isImage = (message.attachmentType || '').startsWith('image/');
    if (message.sender === 'me') {
      if (isAudio) return 'Voce enviou um audio';
      return isImage ? 'Voce enviou uma foto' : 'Voce enviou um arquivo';
    }
    if (isAudio) return 'Enviou um audio';
    return isImage ? 'Enviou uma foto' : 'Enviou um arquivo';
  }
  return message.text.replace(/\s+/g, ' ').trim();
};

const formatDurationLabel = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
};

const getOutgoingMessageStatus = (
  message: SocialChatMessage,
  conversationMessages: SocialChatMessage[]
): 'delivered' | 'read' => {
  const sentAt = new Date(message.createdAt).getTime();
  const hasReplyAfter = conversationMessages.some(
    (item) => item.sender === 'friend' && new Date(item.createdAt).getTime() >= sentAt
  );
  return hasReplyAfter ? 'read' : 'delivered';
};

export function SocialHub({ profile, defaultSection = 'friends', showSectionTabs = true }: SocialHubProps) {
  const { updateProfile } = useProfile();
  const navigate = useNavigate();
  const location = useLocation();
  const storageKey = useMemo(() => `${SOCIAL_HUB_STORAGE_PREFIX}${profile.id}`, [profile.id]);
  const socialProfileStorageKey = useMemo(
    () => `${SOCIAL_PROFILE_STORAGE_PREFIX}${profile.id}`,
    [profile.id]
  );
  const seenChatEventsStorageKey = useMemo(
    () => `${SOCIAL_SEEN_CHAT_EVENTS_STORAGE_PREFIX}${profile.id}`,
    [profile.id]
  );
  const seenFriendRequestsStorageKey = useMemo(
    () => `${SOCIAL_SEEN_FRIEND_REQUESTS_STORAGE_PREFIX}${profile.id}`,
    [profile.id]
  );
  const personalGoalRequestStorageKey = useMemo(
    () => `${SOCIAL_PERSONAL_GOAL_REQUEST_STORAGE_PREFIX}${profile.id}`,
    [profile.id]
  );
  const chatSettingsStorageKey = useMemo(
    () => `${SOCIAL_CHAT_SETTINGS_STORAGE_PREFIX}${profile.id}`,
    [profile.id]
  );
  const chatReadStateStorageKey = useMemo(
    () => `${SOCIAL_CHAT_READ_STATE_STORAGE_PREFIX}${profile.id}`,
    [profile.id]
  );
  const profileHandle = useMemo(
    () => profile.handle || toHandle(profile.name || profile.email || 'fit.user'),
    [profile.email, profile.handle, profile.name]
  );
  const normalizedProfileHandle = useMemo(() => normalizeHandle(profileHandle), [profileHandle]);
  const contactPickerSupported = useMemo(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    const navigatorWithContacts = navigator as NavigatorWithContacts;
    return typeof navigatorWithContacts.contacts?.select === 'function';
  }, []);
  const isMobile = useIsMobile();

  const [socialState, setSocialState] = useState<SocialState>(EMPTY_SOCIAL_STATE);
  const [globalPosts, setGlobalPosts] = useState<SocialFeedPost[]>([]);
  const [globalStories, setGlobalStories] = useState<SocialStory[]>([]);
  const [friendRequests, setFriendRequests] = useState<SocialFriendRequest[]>([]);
  const [friendRequestsLoaded, setFriendRequestsLoaded] = useState(false);
  const [seenIncomingRequestIds, setSeenIncomingRequestIds] = useState<string[]>([]);
  const [globalChatEvents, setGlobalChatEvents] = useState<SocialGlobalChatEvent[]>([]);
  const [seenChatEventIds, setSeenChatEventIds] = useState<string[]>([]);
  const [chatLastReadAtByFriend, setChatLastReadAtByFriend] = useState<Record<string, string>>({});
  const [chatReadStateLoaded, setChatReadStateLoaded] = useState(false);
  const [loadedStorageKey, setLoadedStorageKey] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SocialSection>(defaultSection);
  const [remoteSnapshotLoaded, setRemoteSnapshotLoaded] = useState(false);
  const [remoteGlobalSyncEnabled, setRemoteGlobalSyncEnabled] = useState(
    isSocialGlobalStateAvailable()
  );

  const [friendName, setFriendName] = useState('');
  const [friendHandle, setFriendHandle] = useState('');
  const [friendGoal, setFriendGoal] = useState('');
  const [remoteDiscoverableProfiles, setRemoteDiscoverableProfiles] = useState<DiscoverableProfile[]>([]);
  const [isSearchingProfiles, setIsSearchingProfiles] = useState(false);

  const [clanName, setClanName] = useState('');
  const [clanDescription, setClanDescription] = useState('');
  const [clanMemberIds, setClanMemberIds] = useState<string[]>([]);
  const [clanAdminMemberId, setClanAdminMemberId] = useState('self');

  const [goalClanId, setGoalClanId] = useState('');
  const [goalTitle, setGoalTitle] = useState('');
  const [goalTargetValue, setGoalTargetValue] = useState('10');
  const [goalUnit, setGoalUnit] = useState('treinos');
  const [goalDueDate, setGoalDueDate] = useState('');
  const [goalRequestText, setGoalRequestText] = useState('');
  const [autoDailyGoalEnabled, setAutoDailyGoalEnabled] = useState(true);
  const [autoDailyGoalTitle, setAutoDailyGoalTitle] = useState(DEFAULT_AUTO_DAILY_GOAL_TITLE);
  const [autoDailyGoalTargetValue, setAutoDailyGoalTargetValue] = useState(
    String(DEFAULT_AUTO_DAILY_GOAL_TARGET)
  );
  const [autoDailyGoalUnit, setAutoDailyGoalUnit] = useState(DEFAULT_AUTO_GOAL_UNIT);
  const [autoWeeklyGoalEnabled, setAutoWeeklyGoalEnabled] = useState(true);
  const [autoWeeklyGoalTitle, setAutoWeeklyGoalTitle] = useState(DEFAULT_AUTO_WEEKLY_GOAL_TITLE);
  const [autoWeeklyGoalTargetValue, setAutoWeeklyGoalTargetValue] = useState(
    String(DEFAULT_AUTO_WEEKLY_GOAL_TARGET)
  );
  const [autoWeeklyGoalUnit, setAutoWeeklyGoalUnit] = useState(DEFAULT_AUTO_GOAL_UNIT);

  const [challengeClanId, setChallengeClanId] = useState('');
  const [challengeTitle, setChallengeTitle] = useState('');
  const [challengeDescription, setChallengeDescription] = useState('');
  const [challengePoints, setChallengePoints] = useState('150');
  const [challengeDueDate, setChallengeDueDate] = useState('');

  const [activeChatFriendId, setActiveChatFriendId] = useState('');
  const [pendingChatMessageId, setPendingChatMessageId] = useState('');
  const [highlightedChatMessageId, setHighlightedChatMessageId] = useState('');
  const [feedShareFriendId, setFeedShareFriendId] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [pendingChatAttachment, setPendingChatAttachment] = useState<ChatAttachmentDraft | null>(null);
  const [processingChatAttachment, setProcessingChatAttachment] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceRecordingSeconds, setVoiceRecordingSeconds] = useState(0);
  const [chatEventsLoaded, setChatEventsLoaded] = useState(false);
  const [isRegisteringPush, setIsRegisteringPush] = useState(false);
  const [pushNotificationsReady, setPushNotificationsReady] = useState(false);
  const [chatFriendSearch, setChatFriendSearch] = useState('');
  const [pendingChatFriendId, setPendingChatFriendId] = useState('');
  const [showChatListOnMobile, setShowChatListOnMobile] = useState(true);
  const [keepChatHistory, setKeepChatHistory] = useState(true);
  const [chatHistoryPreferenceLoaded, setChatHistoryPreferenceLoaded] = useState(false);
  const [communityFriendsTab, setCommunityFriendsTab] = useState('search');
  const [isFriendProfileDialogOpen, setIsFriendProfileDialogOpen] = useState(false);
  const [activeFriendProfileId, setActiveFriendProfileId] = useState('');
  const [friendProfileSummary, setFriendProfileSummary] = useState<FriendProfileSummary | null>(null);
  const [isFriendProfileSummaryLoading, setIsFriendProfileSummaryLoading] = useState(false);

  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [sharePostId, setSharePostId] = useState('');
  const [shareStoryId, setShareStoryId] = useState('');
  const [chatSharedPostPreviewId, setChatSharedPostPreviewId] = useState('');
  const [chatSharedStoryPreviewId, setChatSharedStoryPreviewId] = useState('');
  const [shareSearch, setShareSearch] = useState('');
  const [feedSearch, setFeedSearch] = useState('');
  const [feedRemoteProfiles, setFeedRemoteProfiles] = useState<DiscoverableProfile[]>([]);
  const [isSearchingFeedProfiles, setIsSearchingFeedProfiles] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const [selectedShareFriendIds, setSelectedShareFriendIds] = useState<string[]>([]);
  const [postCommentInputs, setPostCommentInputs] = useState<Record<string, string>>({});
  const [replyCommentInputs, setReplyCommentInputs] = useState<Record<string, string>>({});
  const [openReplyComposerByPostId, setOpenReplyComposerByPostId] = useState<Record<string, string>>({});

  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<'post' | 'story'>('post');
  const [composerCaption, setComposerCaption] = useState('');
  const [composerImageDataUrl, setComposerImageDataUrl] = useState('');
  const [processingComposerImage, setProcessingComposerImage] = useState(false);
  const [activeStoryGroupHandle, setActiveStoryGroupHandle] = useState('');
  const [activeStoryIndex, setActiveStoryIndex] = useState(0);
  const [matchedPhoneContacts, setMatchedPhoneContacts] = useState<MatchedPhoneContact[]>([]);
  const [isImportingContacts, setIsImportingContacts] = useState(false);
  const [importedContactsCount, setImportedContactsCount] = useState(0);

  const [isEditContentDialogOpen, setIsEditContentDialogOpen] = useState(false);
  const [editingPostId, setEditingPostId] = useState('');
  const [editingStoryId, setEditingStoryId] = useState('');
  const [editingContentCaption, setEditingContentCaption] = useState('');

  const composerGalleryInputRef = useRef<HTMLInputElement | null>(null);
  const composerCameraInputRef = useRef<HTMLInputElement | null>(null);
  const chatAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const chatCameraInputRef = useRef<HTMLInputElement | null>(null);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceRecordingTimerRef = useRef<number | null>(null);
  const voiceAutoStopTimeoutRef = useRef<number | null>(null);
  const chatMessagesContainerRef = useRef<HTMLDivElement | null>(null);
  const chatMessageElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const chatMessageHighlightTimeoutRef = useRef<number | null>(null);
  const outgoingRequestStatusRef = useRef<Map<string, SocialFriendRequest['status']>>(new Map());
  const initializedOutgoingRequestStatusRef = useRef(false);
  const applyingRemoteSnapshotRef = useRef(false);
  const lastGlobalSnapshotHashRef = useRef('');
  const notifiedRemoteSyncUnavailableRef = useRef(false);
  const profilePointsRef = useRef(profile.points || 0);
  const autoGoalFormClanIdRef = useRef('');

  const triggerSystemNotification = useCallback(async (title: string, description: string) => {
    if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
      navigator.vibrate([70, 40, 90]);
    }

    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          await registration.showNotification(title, {
            body: description,
            tag: `fitchat-${Date.now()}`,
            renotify: true,
            icon: APP_NOTIFICATION_ICON,
            badge: APP_NOTIFICATION_BADGE,
          });
          return;
        }
      }

      new Notification(title, {
        body: description,
        icon: APP_NOTIFICATION_ICON,
        badge: APP_NOTIFICATION_BADGE,
      });
    } catch (error) {
      console.error('Erro ao disparar notificacao nativa:', error);
      new Notification(title, {
        body: description,
        icon: APP_NOTIFICATION_ICON,
        badge: APP_NOTIFICATION_BADGE,
      });
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
      void triggerSystemNotification(nextNotification.title, nextNotification.description);
    }
  }, [triggerSystemNotification]);

  useEffect(() => {
    profilePointsRef.current = profile.points || 0;
  }, [profile.points]);

  const markChatAsRead = useCallback((friendId: string, readAt?: string) => {
    if (!friendId) return;
    const parsedReadAt = readAt ? new Date(readAt) : new Date();
    const normalizedReadAt = Number.isNaN(parsedReadAt.getTime())
      ? new Date().toISOString()
      : parsedReadAt.toISOString();
    const nextReadTimestamp = new Date(normalizedReadAt).getTime();

    setChatLastReadAtByFriend((previous) => {
      const previousReadAt = previous[friendId];
      const previousReadTimestamp = previousReadAt ? new Date(previousReadAt).getTime() : 0;
      if (nextReadTimestamp <= previousReadTimestamp) return previous;
      return {
        ...previous,
        [friendId]: normalizedReadAt,
      };
    });
  }, []);

  const applyProfilePointsDelta = useCallback(async (delta: number, reason: string) => {
    if (!delta) return;

    const currentPoints = profilePointsRef.current;
    const nextPoints = Math.max(0, currentPoints + delta);
    profilePointsRef.current = nextPoints;

    const { data, error } = await updateProfile({ points: nextPoints });
    if (error) {
      console.error('Erro ao atualizar pontuacao do perfil:', error);
      profilePointsRef.current = profile.points || currentPoints;
      toast.error('Nao foi possivel atualizar sua pontuacao agora.');
      return;
    }

    profilePointsRef.current = data?.points || nextPoints;
    if (delta > 0) {
      toast.success(`${reason} (+${delta} pts)`);
      return;
    }

    toast.info(`${reason} (${delta} pts)`);
  }, [profile.points, updateProfile]);

  const registerPushSubscriptionForCurrentDevice = useCallback(async (
    options?: { requestPermission?: boolean; notifyOnError?: boolean }
  ) => {
    const requestPermission = options?.requestPermission ?? false;
    const notifyOnError = options?.notifyOnError ?? true;

    if (typeof window === 'undefined') return false;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      if (notifyOnError) {
        toast.error('Seu dispositivo nao suporta notificacoes push do FitChat.');
      }
      setPushNotificationsReady(false);
      return false;
    }

    if (!FIT_CHAT_WEB_PUSH_PUBLIC_KEY) {
      if (notifyOnError) {
        toast.error('Chave de push nao configurada no app (VITE_FITCHAT_WEB_PUSH_PUBLIC_KEY).');
      }
      setPushNotificationsReady(false);
      return false;
    }

    try {
      let permission = Notification.permission;
      if (permission !== 'granted' && requestPermission) {
        permission = await Notification.requestPermission();
      }

      if (permission !== 'granted') {
        setPushNotificationsReady(false);
        return false;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeBase64UrlToUint8Array(FIT_CHAT_WEB_PUSH_PUBLIC_KEY),
        });
      }

      const serialized = subscription.toJSON();
      const p256dh = serialized.keys?.p256dh;
      const auth = serialized.keys?.auth;
      if (!p256dh || !auth) {
        throw new Error('Assinatura de push invalida.');
      }

      const { error } = await supabase
        .from('chat_push_subscriptions')
        .upsert(
          {
            profile_id: profile.id,
            endpoint: subscription.endpoint,
            p256dh,
            auth,
            user_agent: navigator.userAgent || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'endpoint' }
        );

      if (error) {
        throw new Error(error.message);
      }

      setPushNotificationsReady(true);
      return true;
    } catch (error) {
      console.error('Erro ao registrar push do FitChat:', error);
      setPushNotificationsReady(false);
      if (notifyOnError) {
        toast.error('Nao foi possivel ativar o push do FitChat neste dispositivo.');
      }
      return false;
    }
  }, [profile.id]);

  useEffect(() => {
    setActiveSection(defaultSection);
  }, [defaultSection]);

  useEffect(() => {
    if (!isMobile) {
      setShowChatListOnMobile(false);
      return;
    }

    if (activeSection === 'chat') {
      setShowChatListOnMobile(true);
    }
  }, [activeSection, isMobile]);

  useEffect(() => {
    if (!isMobile) return;
    if (socialState.friends.length) return;
    setShowChatListOnMobile(true);
  }, [isMobile, socialState.friends.length]);

  useEffect(() => {
    if (activeSection !== 'friends') return;
    setCommunityFriendsTab('search');
  }, [activeSection]);

  useEffect(() => {
    applyingRemoteSnapshotRef.current = false;
    lastGlobalSnapshotHashRef.current = '';
    setRemoteGlobalSyncEnabled(isSocialGlobalStateAvailable());
    notifiedRemoteSyncUnavailableRef.current = false;
    setChatHistoryPreferenceLoaded(false);
  }, [profile.id]);

  useEffect(() => {
    let canceled = false;

    const syncPushSubscription = async () => {
      const success = await registerPushSubscriptionForCurrentDevice({
        requestPermission: false,
        notifyOnError: false,
      });
      if (canceled) return;
      setPushNotificationsReady(success);
    };

    void syncPushSubscription();
    return () => {
      canceled = true;
    };
  }, [registerPushSubscriptionForCurrentDevice]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(chatSettingsStorageKey);
      if (!stored) {
        setKeepChatHistory(true);
        setChatHistoryPreferenceLoaded(true);
        return;
      }

      const parsed = JSON.parse(stored) as { keepHistory?: unknown };
      setKeepChatHistory(parsed.keepHistory !== false);
    } catch (error) {
      console.error('Erro ao carregar preferencias do FitChat:', error);
      setKeepChatHistory(true);
    } finally {
      setChatHistoryPreferenceLoaded(true);
    }
  }, [chatSettingsStorageKey]);

  useEffect(() => {
    if (!chatHistoryPreferenceLoaded) return;
    window.localStorage.setItem(
      chatSettingsStorageKey,
      JSON.stringify({ keepHistory: keepChatHistory })
    );
  }, [chatSettingsStorageKey, chatHistoryPreferenceLoaded, keepChatHistory]);

  useEffect(() => {
    setChatReadStateLoaded(false);
    try {
      const stored = window.localStorage.getItem(chatReadStateStorageKey);
      if (!stored) {
        setChatLastReadAtByFriend({});
        setChatReadStateLoaded(true);
        return;
      }

      const parsed = JSON.parse(stored) as unknown;
      setChatLastReadAtByFriend(sanitizeChatReadState(parsed));
    } catch (error) {
      console.error('Erro ao carregar estado de leitura do FitChat:', error);
      setChatLastReadAtByFriend({});
    } finally {
      setChatReadStateLoaded(true);
    }
  }, [chatReadStateStorageKey]);

  useEffect(() => {
    if (!chatReadStateLoaded) return;
    window.localStorage.setItem(chatReadStateStorageKey, JSON.stringify(chatLastReadAtByFriend));
  }, [chatLastReadAtByFriend, chatReadStateLoaded, chatReadStateStorageKey]);

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
          disableSocialGlobalState();
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
            disableSocialGlobalState();
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
    if (!remoteGlobalSyncEnabled) return;

    const channel = supabase
      .channel(`social-global-state-${profile.id}-${createId()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'social_global_state',
          filter: 'id=eq.true',
        },
        () => {
          void fetchRemoteGlobalSnapshot();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void fetchRemoteGlobalSnapshot();
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchRemoteGlobalSnapshot, profile.id, remoteGlobalSyncEnabled]);

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
          disableSocialGlobalState();
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
    if (!chatHistoryPreferenceLoaded) return;

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
                profileId: typeof friend.profileId === 'string' && friend.profileId
                  ? friend.profileId
                  : undefined,
                name: fallbackName,
                handle: toHandle(friend.handle || fallbackName),
                goal: typeof friend.goal === 'string' && friend.goal.trim()
                  ? friend.goal.trim()
                  : 'Sem meta definida',
                addedAt: typeof friend.addedAt === 'string' && friend.addedAt
                  ? friend.addedAt
                  : new Date().toISOString(),
                avatarUrl: typeof friend.avatarUrl === 'string' && friend.avatarUrl
                  ? friend.avatarUrl
                  : undefined,
              };
            })
        : [];
      setSocialState({
        friends: parsedFriends,
        clans: sanitizeClans(parsed.clans, profile),
        posts: [],
        chatMessages: keepChatHistory ? sanitizeChatMessages(parsed.chatMessages) : [],
        notifications: sanitizeNotifications(parsed.notifications),
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
  }, [chatHistoryPreferenceLoaded, keepChatHistory, profile, storageKey]);

  useEffect(() => {
    if (!chatHistoryPreferenceLoaded) return;
    if (loadedStorageKey !== storageKey) return;
    const { posts: _ignoredPosts, ...stateWithoutPosts } = socialState;
    const nextPersistedState = keepChatHistory
      ? stateWithoutPosts
      : { ...stateWithoutPosts, chatMessages: [] as SocialChatMessage[] };
    window.localStorage.setItem(storageKey, JSON.stringify(nextPersistedState));
  }, [
    chatHistoryPreferenceLoaded,
    keepChatHistory,
    socialState,
    storageKey,
    loadedStorageKey,
  ]);

  useEffect(() => {
    if (!chatHistoryPreferenceLoaded || keepChatHistory) return;
    setSocialState((previous) => {
      if (!previous.chatMessages.length) return previous;
      return { ...previous, chatMessages: [] };
    });
  }, [chatHistoryPreferenceLoaded, keepChatHistory]);

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
    if (goalClanId === autoGoalFormClanIdRef.current) return;
    autoGoalFormClanIdRef.current = goalClanId;

    const targetClan = socialState.clans.find((clan) => clan.id === goalClanId);
    if (!targetClan) {
      setAutoDailyGoalEnabled(true);
      setAutoDailyGoalTitle(DEFAULT_AUTO_DAILY_GOAL_TITLE);
      setAutoDailyGoalTargetValue(String(DEFAULT_AUTO_DAILY_GOAL_TARGET));
      setAutoDailyGoalUnit(DEFAULT_AUTO_GOAL_UNIT);
      setAutoWeeklyGoalEnabled(true);
      setAutoWeeklyGoalTitle(DEFAULT_AUTO_WEEKLY_GOAL_TITLE);
      setAutoWeeklyGoalTargetValue(String(DEFAULT_AUTO_WEEKLY_GOAL_TARGET));
      setAutoWeeklyGoalUnit(DEFAULT_AUTO_GOAL_UNIT);
      return;
    }

    const dailyTemplate = targetClan.autoGoalTemplates?.find((template) => template.frequency === 'daily');
    const weeklyTemplate = targetClan.autoGoalTemplates?.find((template) => template.frequency === 'weekly');

    setAutoDailyGoalEnabled(Boolean(dailyTemplate?.enabled));
    setAutoDailyGoalTitle(dailyTemplate?.title || DEFAULT_AUTO_DAILY_GOAL_TITLE);
    setAutoDailyGoalTargetValue(String(dailyTemplate?.targetValue || DEFAULT_AUTO_DAILY_GOAL_TARGET));
    setAutoDailyGoalUnit(dailyTemplate?.unit || DEFAULT_AUTO_GOAL_UNIT);
    setAutoWeeklyGoalEnabled(Boolean(weeklyTemplate?.enabled));
    setAutoWeeklyGoalTitle(weeklyTemplate?.title || DEFAULT_AUTO_WEEKLY_GOAL_TITLE);
    setAutoWeeklyGoalTargetValue(
      String(weeklyTemplate?.targetValue || DEFAULT_AUTO_WEEKLY_GOAL_TARGET)
    );
    setAutoWeeklyGoalUnit(weeklyTemplate?.unit || DEFAULT_AUTO_GOAL_UNIT);
  }, [goalClanId, socialState.clans]);

  useEffect(() => {
    const stored = window.localStorage.getItem(personalGoalRequestStorageKey);
    if (!stored) return;

    try {
      const parsed = JSON.parse(stored) as { requestText?: string };
      if (typeof parsed.requestText === 'string' && parsed.requestText.trim()) {
        setGoalRequestText(parsed.requestText.trim());
        if (!goalClanId && socialState.clans.length) {
          setGoalClanId(socialState.clans[0].id);
        }
        toast.info('Solicitacao do Personal carregada na criacao de meta do CLA.');
      }
    } catch (error) {
      console.error('Erro ao ler solicitacao do Personal para meta:', error);
    } finally {
      window.localStorage.removeItem(personalGoalRequestStorageKey);
    }
  }, [goalClanId, personalGoalRequestStorageKey, socialState.clans]);

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

  useEffect(() => {
    if (clanAdminMemberId === 'self') return;
    if (socialState.friends.some((friend) => friend.id === clanAdminMemberId)) return;
    setClanAdminMemberId('self');
  }, [clanAdminMemberId, socialState.friends]);

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

  const outgoingPendingHandles = useMemo(
    () =>
      new Set(
        outgoingPendingFriendRequests.map((request) => normalizeHandle(request.receiverHandle))
      ),
    [outgoingPendingFriendRequests]
  );

  const incomingPendingHandles = useMemo(
    () =>
      new Set(
        incomingFriendRequests.map((request) => normalizeHandle(request.senderHandle))
      ),
    [incomingFriendRequests]
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

  const fetchRemoteProfilesByText = useCallback(async (
    rawQuery: string,
    limitCount = 12
  ): Promise<DiscoverableProfile[]> => {
    const queryText = rawQuery.trim();
    if (!queryText) return [];

    const { data, error } = await supabase.rpc('search_profiles_by_handle', {
      query_text: queryText,
      limit_count: limitCount,
      exclude_profile_id: profile.id,
    });

    if (!error && Array.isArray(data)) {
      return mapRemoteProfilesToDiscoverable(data, normalizedProfileHandle);
    }

    if (error && !isMissingRpcFunctionError(error)) {
      console.error('Erro ao buscar perfis por texto (rpc):', error);
    }

    const normalizedHandleQuery = sanitizeHandleInput(queryText);
    const fallbackCatalog = new Map<string, RemoteProfileSearchResult>();

    if (normalizedHandleQuery) {
      const { data: handleRows, error: handleError } = await supabase
        .from('profiles')
        .select('id, name, handle, goal')
        .neq('id', profile.id)
        .ilike('handle', `%${normalizedHandleQuery}%`)
        .order('updated_at', { ascending: false })
        .limit(limitCount);

      if (handleError) {
        console.error('Erro ao buscar perfis por texto (fallback handle):', handleError);
      } else {
        (handleRows || []).forEach((row) => {
          fallbackCatalog.set(row.id, {
            profile_id: row.id,
            name: row.name,
            handle: row.handle,
            goal: row.goal,
          });
        });
      }
    }

    const { data: nameRows, error: nameError } = await supabase
      .from('profiles')
      .select('id, name, handle, goal')
      .neq('id', profile.id)
      .ilike('name', `%${queryText}%`)
      .order('updated_at', { ascending: false })
      .limit(limitCount);

    if (nameError) {
      console.error('Erro ao buscar perfis por texto (fallback nome):', nameError);
    } else {
      (nameRows || []).forEach((row) => {
        fallbackCatalog.set(row.id, {
          profile_id: row.id,
          name: row.name,
          handle: row.handle,
          goal: row.goal,
        });
      });
    }

    return mapRemoteProfilesToDiscoverable(Array.from(fallbackCatalog.values()), normalizedProfileHandle);
  }, [normalizedProfileHandle, profile.id]);

  const fetchRemoteProfilesByPhone = useCallback(async (
    phoneInputs: string[],
    limitCount = 120
  ): Promise<(DiscoverableProfile & { phone: string })[]> => {
    const normalizedPhones = Array.from(
      new Set(
        phoneInputs
          .map((phone) => normalizePhoneDigits(phone))
          .filter((phone) => phone.length >= 8 && phone.length <= 20)
      )
    );
    if (!normalizedPhones.length) return [];

    const { data, error } = await supabase.rpc('search_profiles_by_phone', {
      phones_input: normalizedPhones,
      limit_count: limitCount,
      exclude_profile_id: profile.id,
    });

    if (!error && Array.isArray(data)) {
      return mapRemotePhoneProfilesToDiscoverable(data, normalizedProfileHandle);
    }

    if (error && !isMissingRpcFunctionError(error)) {
      console.error('Erro ao buscar perfis por celular (rpc):', error);
    }

    const { data: fallbackRows, error: fallbackError } = await supabase
      .from('profiles')
      .select('id, name, handle, goal, phone')
      .neq('id', profile.id)
      .not('phone', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(limitCount);

    if (fallbackError) {
      console.error('Erro ao buscar perfis por celular (fallback):', fallbackError);
      return [];
    }

    const normalizedSet = new Set(normalizedPhones);
    const mappedRows: RemotePhoneProfileSearchResult[] = (fallbackRows || [])
      .filter((row) => normalizedSet.has(normalizePhoneDigits(row.phone || '')))
      .map((row) => ({
        profile_id: row.id,
        name: row.name,
        handle: row.handle,
        goal: row.goal,
        phone: row.phone,
      }));

    return mapRemotePhoneProfilesToDiscoverable(mappedRows, normalizedProfileHandle);
  }, [normalizedProfileHandle, profile.id]);

  const fetchFriendPublicProfileSummary = useCallback(async (
    friend: SocialFriend
  ): Promise<FriendProfileSummary> => {
    const fallbackSummary = createFriendProfileSummaryFallback(friend);
    const normalizedHandle = normalizeHandle(friend.handle || friend.name || '');
    const targetHandle = normalizedHandle ? toHandle(normalizedHandle) : null;

    const { data, error } = await supabase.rpc('get_profile_public_summary', {
      target_profile_id: friend.profileId || null,
      target_handle: targetHandle,
    });

    if (!error && Array.isArray(data) && data.length) {
      const summaryRow = data[0] as RemotePublicProfileSummaryResult;
      const parsedPoints = Number(summaryRow.points);
      return {
        profileId: summaryRow.profile_id || fallbackSummary.profileId,
        name: summaryRow.name?.trim() || fallbackSummary.name,
        handle: toHandle(summaryRow.handle || fallbackSummary.handle),
        goal: resolveGoalLabel(summaryRow.goal || fallbackSummary.goal),
        points: Number.isFinite(parsedPoints) ? Math.max(0, Math.round(parsedPoints)) : null,
      };
    }

    if (error && !isMissingRpcFunctionError(error)) {
      console.error('Erro ao buscar resumo publico do perfil:', error);
    }

    if (!targetHandle) return fallbackSummary;

    const { data: handleRows, error: handleError } = await supabase.rpc('search_profiles_by_handle', {
      query_text: targetHandle,
      limit_count: 10,
      exclude_profile_id: profile.id,
    });

    if (handleError && !isMissingRpcFunctionError(handleError)) {
      console.error('Erro ao buscar resumo publico do perfil por handle:', handleError);
      return fallbackSummary;
    }

    const matchedHandleRow = Array.isArray(handleRows)
      ? handleRows.find((row) => normalizeHandle(row.handle) === normalizedHandle) || handleRows[0]
      : null;

    if (!matchedHandleRow) return fallbackSummary;

    return {
      profileId: matchedHandleRow.profile_id || fallbackSummary.profileId,
      name: matchedHandleRow.name?.trim() || fallbackSummary.name,
      handle: toHandle(matchedHandleRow.handle || fallbackSummary.handle),
      goal: resolveGoalLabel(matchedHandleRow.goal || fallbackSummary.goal),
      points: fallbackSummary.points,
    };
  }, [profile.id]);

  const handleImportDeviceContacts = async () => {
    if (!contactPickerSupported) {
      toast.error('Leitura de contatos nao suportada neste dispositivo/navegador.');
      return;
    }

    const navigatorWithContacts = navigator as NavigatorWithContacts;
    if (!navigatorWithContacts.contacts?.select) {
      toast.error('Leitura de contatos nao suportada neste dispositivo/navegador.');
      return;
    }

    setIsImportingContacts(true);
    try {
      const pickedContacts = await navigatorWithContacts.contacts.select(['name', 'tel'], {
        multiple: true,
      });

      const collectedContacts: DevicePhoneContact[] = [];
      pickedContacts.forEach((contact, index) => {
        const fallbackName = `Contato ${index + 1}`;
        const contactName =
          (Array.isArray(contact.name) && contact.name.find((name) => name?.trim())?.trim()) ||
          fallbackName;
        const phones = Array.isArray(contact.tel) ? contact.tel : [];

        phones.forEach((rawPhone) => {
          const trimmedPhone = (rawPhone || '').trim();
          if (!trimmedPhone || !isValidPhoneInput(trimmedPhone)) return;
          const normalizedPhone = normalizePhoneDigits(trimmedPhone);
          collectedContacts.push({
            name: contactName,
            phone: trimmedPhone,
            normalizedPhone,
          });
        });
      });

      const uniqueContactsMap = new Map<string, DevicePhoneContact>();
      collectedContacts.forEach((contact) => {
        if (uniqueContactsMap.has(contact.normalizedPhone)) return;
        uniqueContactsMap.set(contact.normalizedPhone, contact);
      });

      const uniqueContacts = Array.from(uniqueContactsMap.values());
      setImportedContactsCount(uniqueContacts.length);

      if (!uniqueContacts.length) {
        setMatchedPhoneContacts([]);
        toast.info('Nenhum celular valido encontrado nos contatos selecionados.');
        return;
      }

      const matchingProfiles = await fetchRemoteProfilesByPhone(
        uniqueContacts.map((contact) => contact.normalizedPhone),
        200
      );

      const profilesByPhone = new Map<string, DiscoverableProfile>();
      matchingProfiles.forEach((profileMatch) => {
        if (profilesByPhone.has(profileMatch.phone)) return;
        profilesByPhone.set(profileMatch.phone, profileMatch);
      });

      const nextMatchedContacts = uniqueContacts
        .map((contact) => {
          const match = profilesByPhone.get(contact.normalizedPhone);
          if (!match) return null;
          return {
            id: `${contact.normalizedPhone}-${match.profileId || match.normalizedHandle}`,
            contactName: contact.name,
            contactPhone: contact.phone,
            profile: match,
          } as MatchedPhoneContact;
        })
        .filter((match): match is MatchedPhoneContact => Boolean(match))
        .sort((a, b) => a.contactName.localeCompare(b.contactName));

      setMatchedPhoneContacts(nextMatchedContacts);
      if (!nextMatchedContacts.length) {
        toast.info('Nenhum contato encontrado no SouFit.');
        return;
      }

      toast.success(`${nextMatchedContacts.length} contato(s) encontrado(s) no SouFit.`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.error('Erro ao importar contatos:', error);
      toast.error('Nao foi possivel ler os contatos do aparelho.');
    } finally {
      setIsImportingContacts(false);
    }
  };

  const friendHandleSearch = useMemo(() => sanitizeHandleInput(friendHandle), [friendHandle]);
  const feedSearchQuery = useMemo(() => feedSearch.trim(), [feedSearch]);

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

  useEffect(() => {
    if (!feedSearchQuery || feedSearchQuery.length < 2) {
      setFeedRemoteProfiles([]);
      setIsSearchingFeedProfiles(false);
      return;
    }

    let canceled = false;
    const searchTimer = window.setTimeout(async () => {
      setIsSearchingFeedProfiles(true);
      const remoteProfiles = await fetchRemoteProfilesByText(feedSearchQuery, 10);
      if (canceled) return;

      setFeedRemoteProfiles(remoteProfiles);
      setIsSearchingFeedProfiles(false);
    }, 240);

    return () => {
      canceled = true;
      window.clearTimeout(searchTimer);
    };
  }, [feedSearchQuery, fetchRemoteProfilesByText]);

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
        const friendProfileId = isSender ? request.receiverProfileId || undefined : request.senderProfileId;

        if (!normalizedFriendHandle || normalizedFriendHandle === normalizedProfileHandle) return;
        if (knownHandles.has(normalizedFriendHandle)) {
          if (!friendProfileId) return;
          const existingIndex = nextFriends.findIndex(
            (friend) => normalizeHandle(friend.handle) === normalizedFriendHandle
          );
          if (existingIndex === -1) return;
          if (nextFriends[existingIndex].profileId) return;
          nextFriends[existingIndex] = {
            ...nextFriends[existingIndex],
            profileId: friendProfileId,
          };
          return;
        }

        nextFriends.unshift({
          id: `friend-${request.id}-${isSender ? 'receiver' : 'sender'}`,
          profileId: friendProfileId,
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

  const activeFriendProfile = useMemo(
    () => socialState.friends.find((friend) => friend.id === activeFriendProfileId) || null,
    [activeFriendProfileId, socialState.friends]
  );

  const activeFriendProfileHandle = useMemo(
    () =>
      normalizeHandle(
        friendProfileSummary?.handle ||
        activeFriendProfile?.handle ||
        activeFriendProfile?.name ||
        ''
      ),
    [activeFriendProfile?.handle, activeFriendProfile?.name, friendProfileSummary?.handle]
  );

  const friendsByHandle = useMemo(
    () =>
      new Map(
        socialState.friends.map((friend) => [normalizeHandle(friend.handle), friend] as const)
      ),
    [socialState.friends]
  );

  const isCurrentProfileClanAdmin = useCallback(
    (clan: SocialClan) => {
      const normalizedAdminHandle = normalizeHandle(clan.adminHandle || '');
      if (normalizedAdminHandle) {
        return normalizedAdminHandle === normalizedProfileHandle;
      }
      if (clan.adminProfileId) {
        return clan.adminProfileId === profile.id;
      }
      if (clan.adminFriendId) {
        return false;
      }
      return true;
    },
    [normalizedProfileHandle, profile.id]
  );

  const selectedGoalClan = useMemo(
    () => socialState.clans.find((clan) => clan.id === goalClanId) || null,
    [goalClanId, socialState.clans]
  );

  const goalClanManagedByCurrentUser = useMemo(
    () => (selectedGoalClan ? isCurrentProfileClanAdmin(selectedGoalClan) : false),
    [isCurrentProfileClanAdmin, selectedGoalClan]
  );

  const activeStories = useMemo(() => sanitizeStories(globalStories), [globalStories]);

  const canViewContent = useCallback(
    (content: {
      authorProfileId?: string;
      authorHandle?: string;
      visibility?: SocialContentVisibility;
    }) => {
      const visibility = resolveSocialContentVisibility(content.visibility);
      if (visibility !== 'private') return true;
      if (content.authorProfileId === profile.id) return true;

      const normalizedAuthorHandle = normalizeHandle(content.authorHandle || '');
      if (!normalizedAuthorHandle) return false;
      if (normalizedAuthorHandle === normalizedProfileHandle) return true;
      return friendsByHandle.has(normalizedAuthorHandle);
    },
    [friendsByHandle, normalizedProfileHandle, profile.id]
  );

  const visibleFeedPosts = useMemo(
    () => globalPosts.filter((post) => canViewContent(post)),
    [canViewContent, globalPosts]
  );

  const visibleStories = useMemo(
    () => activeStories.filter((story) => canViewContent(story)),
    [activeStories, canViewContent]
  );

  const postsById = useMemo(
    () => new Map(visibleFeedPosts.map((post) => [post.id, post])),
    [visibleFeedPosts]
  );

  const storiesById = useMemo(
    () => new Map(visibleStories.map((story) => [story.id, story])),
    [visibleStories]
  );

  const activeFriendFeedPosts = useMemo(() => {
    if (!activeFriendProfileHandle) return [];
    return visibleFeedPosts
      .filter(
        (post) =>
          normalizeHandle(post.authorHandle || post.authorName) === activeFriendProfileHandle
      )
      .slice(0, 18);
  }, [activeFriendProfileHandle, visibleFeedPosts]);

  const displayedFriendProfileSummary = useMemo(
    () =>
      activeFriendProfile
        ? friendProfileSummary || createFriendProfileSummaryFallback(activeFriendProfile)
        : null,
    [activeFriendProfile, friendProfileSummary]
  );

  useEffect(() => {
    if (!activeFriendProfileId) return;
    if (socialState.friends.some((friend) => friend.id === activeFriendProfileId)) return;
    setIsFriendProfileDialogOpen(false);
    setActiveFriendProfileId('');
    setFriendProfileSummary(null);
    setIsFriendProfileSummaryLoading(false);
  }, [activeFriendProfileId, socialState.friends]);

  useEffect(() => {
    if (!isFriendProfileDialogOpen || !activeFriendProfile) return;

    let cancelled = false;
    setFriendProfileSummary(createFriendProfileSummaryFallback(activeFriendProfile));
    setIsFriendProfileSummaryLoading(true);

    const loadFriendProfileSummary = async () => {
      const summary = await fetchFriendPublicProfileSummary(activeFriendProfile);
      if (cancelled) return;
      setFriendProfileSummary(summary);
      setIsFriendProfileSummaryLoading(false);
    };

    void loadFriendProfileSummary();
    return () => {
      cancelled = true;
    };
  }, [activeFriendProfile, fetchFriendPublicProfileSummary, isFriendProfileDialogOpen]);

  const friendAvatarUrlsByHandle = useMemo(() => {
    const avatarCandidates = new Map<string, { imageDataUrl: string; createdAt: number }>();

    visibleStories.forEach((story) => {
      const normalizedHandle = normalizeHandle(story.authorHandle || story.authorName);
      if (!normalizedHandle || !story.imageDataUrl) return;
      const createdAt = new Date(story.createdAt).getTime();
      if (Number.isNaN(createdAt)) return;

      const previous = avatarCandidates.get(normalizedHandle);
      if (!previous || createdAt > previous.createdAt) {
        avatarCandidates.set(normalizedHandle, { imageDataUrl: story.imageDataUrl, createdAt });
      }
    });

    visibleFeedPosts.forEach((post) => {
      const normalizedHandle = normalizeHandle(post.authorHandle || post.authorName);
      if (!normalizedHandle || !post.imageDataUrl) return;
      const createdAt = new Date(post.createdAt).getTime();
      if (Number.isNaN(createdAt)) return;

      const previous = avatarCandidates.get(normalizedHandle);
      if (!previous || createdAt > previous.createdAt) {
        avatarCandidates.set(normalizedHandle, { imageDataUrl: post.imageDataUrl, createdAt });
      }
    });

    return new Map(
      Array.from(avatarCandidates.entries()).map(([handle, value]) => [handle, value.imageDataUrl] as const)
    );
  }, [visibleFeedPosts, visibleStories]);

  const friendProfilePhotoUrlsByProfileId = useMemo(() => {
    const entries = new Map<string, string>();
    if (typeof window === 'undefined') return entries;

    socialState.friends.forEach((friend) => {
      if (!friend.profileId) return;
      try {
        const raw = window.localStorage.getItem(`${SOCIAL_PROFILE_STORAGE_PREFIX}${friend.profileId}`);
        if (!raw) return;
        const parsed = JSON.parse(raw) as { profilePhotoDataUrl?: unknown };
        if (typeof parsed.profilePhotoDataUrl !== 'string') return;
        const profilePhotoDataUrl = parsed.profilePhotoDataUrl.trim();
        if (!profilePhotoDataUrl) return;
        entries.set(friend.profileId, profilePhotoDataUrl);
      } catch {
        // Ignore malformed profile social storage values.
      }
    });

    return entries;
  }, [socialState.friends]);

  const resolveFriendAvatarUrl = useCallback(
    (friend: SocialFriend | null | undefined) => {
      if (!friend) return DEFAULT_CHAT_AVATAR;
      if (friend.avatarUrl?.trim()) return friend.avatarUrl;
      if (friend.profileId && friendProfilePhotoUrlsByProfileId.has(friend.profileId)) {
        return friendProfilePhotoUrlsByProfileId.get(friend.profileId) || DEFAULT_CHAT_AVATAR;
      }

      const normalizedHandle = normalizeHandle(friend.handle || friend.name);
      if (!normalizedHandle) return DEFAULT_CHAT_AVATAR;

      return friendAvatarUrlsByHandle.get(normalizedHandle) || DEFAULT_CHAT_AVATAR;
    },
    [friendAvatarUrlsByHandle, friendProfilePhotoUrlsByProfileId]
  );

  const handleAvatarImageError = (event: SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    if (image.getAttribute('data-fallback') === 'true') return;
    image.setAttribute('data-fallback', 'true');
    image.src = DEFAULT_CHAT_AVATAR;
  };

  const sharePost = useMemo(
    () => visibleFeedPosts.find((post) => post.id === sharePostId) ?? null,
    [sharePostId, visibleFeedPosts]
  );

  const shareStory = useMemo(
    () => visibleStories.find((story) => story.id === shareStoryId) ?? null,
    [shareStoryId, visibleStories]
  );

  const chatSharedPreviewPost = useMemo(
    () => (chatSharedPostPreviewId ? postsById.get(chatSharedPostPreviewId) ?? null : null),
    [chatSharedPostPreviewId, postsById]
  );

  const chatSharedPreviewStory = useMemo(
    () => (chatSharedStoryPreviewId ? storiesById.get(chatSharedStoryPreviewId) ?? null : null),
    [chatSharedStoryPreviewId, storiesById]
  );
  const chatSharedPreviewItem = chatSharedPreviewPost ?? chatSharedPreviewStory;

  const editingPost = useMemo(
    () => visibleFeedPosts.find((post) => post.id === editingPostId) ?? null,
    [editingPostId, visibleFeedPosts]
  );

  const editingStory = useMemo(
    () => visibleStories.find((story) => story.id === editingStoryId) ?? null,
    [editingStoryId, visibleStories]
  );

  const editingContentTarget = editingPost || editingStory;

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

  const filteredFeedProfiles = useMemo(() => {
    const query = feedSearchQuery.toLowerCase();
    if (!query) return [];

    const normalizedHandleQuery = sanitizeHandleInput(feedSearchQuery);
    const catalog = new Map<string, DiscoverableProfile>();
    const registerCandidate = (candidate: DiscoverableProfile) => {
      const normalizedHandle = sanitizeHandleInput(candidate.handle);
      if (!normalizedHandle || normalizedHandle === normalizedProfileHandle) return;
      if (catalog.has(normalizedHandle)) return;
      catalog.set(normalizedHandle, {
        ...candidate,
        handle: toHandle(candidate.handle),
        normalizedHandle,
      });
    };

    discoverableProfiles.forEach(registerCandidate);
    feedRemoteProfiles.forEach(registerCandidate);

    return Array.from(catalog.values())
      .filter((candidate) => {
        const candidateName = (candidate.name || '').toLowerCase();
        const candidateHandle = toHandle(candidate.handle || '').toLowerCase();
        return (
          candidateName.includes(query) ||
          candidateHandle.includes(query) ||
          (Boolean(normalizedHandleQuery) && candidate.normalizedHandle.includes(normalizedHandleQuery))
        );
      })
      .sort((a, b) => {
        const aHandleScore = a.normalizedHandle.startsWith(normalizedHandleQuery) ? 0 : 1;
        const bHandleScore = b.normalizedHandle.startsWith(normalizedHandleQuery) ? 0 : 1;
        if (aHandleScore !== bHandleScore) return aHandleScore - bHandleScore;
        return a.handle.localeCompare(b.handle);
      })
      .slice(0, 8);
  }, [
    discoverableProfiles,
    feedRemoteProfiles,
    feedSearchQuery,
    normalizedProfileHandle,
  ]);

  const filteredFeedPosts = useMemo(() => {
    const query = feedSearch.trim().toLowerCase();
    if (!query) return visibleFeedPosts;

    const normalizedHandleQuery = sanitizeHandleInput(query);

    return visibleFeedPosts.filter((post) => {
      const authorName = (post.authorName || '').toLowerCase();
      const authorHandle = toHandle(post.authorHandle || post.authorName || 'fit.user').toLowerCase();
      const caption = (post.caption || '').toLowerCase();
      const normalizedAuthorHandle = normalizeHandle(post.authorHandle || '');

      return (
        authorName.includes(query) ||
        authorHandle.includes(query) ||
        caption.includes(query) ||
        (!!normalizedHandleQuery && normalizedAuthorHandle.includes(normalizedHandleQuery))
      );
    });
  }, [feedSearch, visibleFeedPosts]);

  const storyGroups = useMemo(() => {
    const groups = new Map<string, StoryGroup>();
    visibleStories.forEach((story) => {
      const authorHandle = normalizeHandle(story.authorHandle || story.authorName || story.id);
      if (!authorHandle) return;

      const current = groups.get(authorHandle);
      if (!current) {
        groups.set(authorHandle, {
          authorHandle,
          authorName: story.authorName,
          previewImageDataUrl: story.imageDataUrl,
          latestCreatedAt: story.createdAt,
          stories: [story],
        });
        return;
      }

      current.stories.push(story);
      if (new Date(story.createdAt).getTime() > new Date(current.latestCreatedAt).getTime()) {
        current.latestCreatedAt = story.createdAt;
        current.previewImageDataUrl = story.imageDataUrl;
      }
      if (current.authorName.startsWith('@') && !story.authorName.startsWith('@')) {
        current.authorName = story.authorName;
      }
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        stories: [...group.stories].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        ),
      }))
      .sort((a, b) => new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime());
  }, [visibleStories]);

  useEffect(() => {
    if (!activeStoryGroupHandle) return;
    const group = storyGroups.find((item) => item.authorHandle === activeStoryGroupHandle);
    if (!group) {
      setActiveStoryGroupHandle('');
      setActiveStoryIndex(0);
      return;
    }

    if (activeStoryIndex < group.stories.length) return;
    setActiveStoryIndex(Math.max(0, group.stories.length - 1));
  }, [activeStoryGroupHandle, activeStoryIndex, storyGroups]);

  const activeStoryGroup = useMemo(
    () => storyGroups.find((group) => group.authorHandle === activeStoryGroupHandle) ?? null,
    [activeStoryGroupHandle, storyGroups]
  );

  const activeStory = useMemo(() => {
    if (!activeStoryGroup) return null;
    if (!activeStoryGroup.stories.length) return null;
    const safeIndex = Math.min(Math.max(activeStoryIndex, 0), activeStoryGroup.stories.length - 1);
    return activeStoryGroup.stories[safeIndex] ?? null;
  }, [activeStoryGroup, activeStoryIndex]);

  const isActiveStoryOwnedByMe = useMemo(
    () =>
      Boolean(
        activeStory &&
        normalizeHandle(activeStory.authorHandle || activeStory.authorName) === normalizedProfileHandle
      ),
    [activeStory, normalizedProfileHandle]
  );

  const canMoveToPreviousStory = Boolean(activeStoryGroup && activeStoryIndex > 0);
  const canMoveToNextStory = Boolean(
    activeStoryGroup && activeStoryIndex < activeStoryGroup.stories.length - 1
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

  const filteredChatFriends = useMemo(() => {
    const query = chatFriendSearch.trim().toLowerCase();
    if (!query) return socialState.friends;

    return socialState.friends.filter((friend) => {
      const name = (friend.name || '').toLowerCase();
      const handle = toHandle(friend.handle || friend.name || 'fit.user').toLowerCase();
      return name.includes(query) || handle.includes(query);
    });
  }, [chatFriendSearch, socialState.friends]);

  const chatMessagesByFriend = useMemo(() => {
    const grouped = new Map<string, SocialChatMessage[]>();
    socialState.chatMessages.forEach((message) => {
      const list = grouped.get(message.friendId) || [];
      list.push(message);
      grouped.set(message.friendId, list);
    });
    grouped.forEach((messages) => {
      messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    });
    return grouped;
  }, [socialState.chatMessages]);

  const chatFriendConversations = useMemo(
    () =>
      filteredChatFriends
        .map((friend) => {
          const friendMessages = chatMessagesByFriend.get(friend.id) || [];
          const lastMessage = friendMessages.length ? friendMessages[friendMessages.length - 1] : null;
          const lastReadAt = chatLastReadAtByFriend[friend.id];
          const lastReadTimestamp = lastReadAt ? new Date(lastReadAt).getTime() : 0;
          const unreadCount =
            friend.id === activeChatFriendId
              ? 0
              : friendMessages.filter((message) => {
                  if (message.sender !== 'friend') return false;
                  const messageTimestamp = new Date(message.createdAt).getTime();
                  return messageTimestamp > lastReadTimestamp;
                }).length;

          return {
            friend,
            lastMessage,
            unreadCount,
            lastActivityAt: lastMessage?.createdAt || friend.addedAt,
          };
        })
        .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()),
    [activeChatFriendId, chatLastReadAtByFriend, chatMessagesByFriend, filteredChatFriends]
  );

  const activeChatDayLabel = useMemo(() => {
    if (!activeChatMessages.length) return '';
    return formatChatDayLabel(activeChatMessages[0].createdAt);
  }, [activeChatMessages]);

  useEffect(() => {
    if (activeSection !== 'chat') return;
    if (!activeChatFriendId) return;

    const latestIncomingMessage = [...activeChatMessages]
      .reverse()
      .find((message) => message.sender === 'friend');
    markChatAsRead(activeChatFriendId, latestIncomingMessage?.createdAt);
  }, [activeChatFriendId, activeChatMessages, activeSection, markChatAsRead]);

  useEffect(() => {
    if (!socialState.friends.length) {
      setPendingChatFriendId('');
      return;
    }

    if (pendingChatFriendId && socialState.friends.some((friend) => friend.id === pendingChatFriendId)) {
      return;
    }

    if (activeChatFriendId && socialState.friends.some((friend) => friend.id === activeChatFriendId)) {
      setPendingChatFriendId(activeChatFriendId);
      return;
    }

    setPendingChatFriendId(socialState.friends[0].id);
  }, [activeChatFriendId, pendingChatFriendId, socialState.friends]);

  useEffect(() => {
    if (location.pathname !== FIT_CHAT_ENTRY_PATH) return;

    const params = new URLSearchParams(location.search);
    const normalizedFriendHandle = normalizeHandle(params.get('friend') || '');
    const targetMessageId = (params.get('message') || '').trim();

    if (normalizedFriendHandle) {
      const targetFriend = friendsByHandle.get(normalizedFriendHandle);
      if (targetFriend) {
        setPendingChatFriendId(targetFriend.id);
        setActiveChatFriendId(targetFriend.id);
        if (isMobile) {
          setShowChatListOnMobile(false);
        }
      }
    }

    if (targetMessageId) {
      setPendingChatMessageId((previous) => (
        previous === targetMessageId ? previous : targetMessageId
      ));
    }
  }, [friendsByHandle, isMobile, location.pathname, location.search]);

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
          profileId: event.senderProfileId,
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
        attachmentName: event.attachmentName,
        attachmentType: event.attachmentType,
        attachmentDataUrl: event.attachmentDataUrl,
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
          target: {
            section: 'chat',
            path: FIT_CHAT_ENTRY_PATH,
            friendId: message.friendId,
            friendHandle: sender?.handle,
            messageId: message.id,
            postId: message.postId,
            storyId: message.storyId,
          },
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
      if (visibleFeedPosts.some((post) => post.id === sharePostId)) return;
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
  }, [isShareDialogOpen, sharePostId, shareStoryId, storiesById, visibleFeedPosts]);

  useEffect(() => {
    const container = chatMessagesContainerRef.current;
    if (!container) return;
    if (pendingChatMessageId) return;
    container.scrollTop = container.scrollHeight;
  }, [activeChatMessages, pendingChatMessageId]);

  useEffect(() => {
    if (!pendingChatMessageId) return;
    if (activeSection !== 'chat') return;

    const targetElement = chatMessageElementsRef.current.get(pendingChatMessageId);
    if (!targetElement) return;

    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedChatMessageId(pendingChatMessageId);
    setPendingChatMessageId('');
  }, [activeSection, activeChatMessages, pendingChatMessageId]);

  useEffect(() => {
    if (!pendingChatMessageId) return;

    const timeoutId = window.setTimeout(() => {
      setPendingChatMessageId('');
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [pendingChatMessageId]);

  useEffect(() => {
    if (!highlightedChatMessageId) return;
    if (chatMessageHighlightTimeoutRef.current !== null) {
      window.clearTimeout(chatMessageHighlightTimeoutRef.current);
    }

    chatMessageHighlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedChatMessageId('');
      chatMessageHighlightTimeoutRef.current = null;
    }, 1800);

    return () => {
      if (chatMessageHighlightTimeoutRef.current !== null) {
        window.clearTimeout(chatMessageHighlightTimeoutRef.current);
        chatMessageHighlightTimeoutRef.current = null;
      }
    };
  }, [highlightedChatMessageId]);

  const handleEnableBrowserNotifications = async () => {
    if (isRegisteringPush) return;

    setIsRegisteringPush(true);
    const enabled = await registerPushSubscriptionForCurrentDevice({
      requestPermission: true,
      notifyOnError: true,
    });
    setIsRegisteringPush(false);

    if (!enabled) {
      if ('Notification' in window && Notification.permission !== 'granted') {
        toast.error('Permissao de notificacoes nao concedida.');
      }
      return;
    }
    toast.success('Notificacoes do FitChat ativadas no celular/navegador.');
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

  const closeFriendProfileDialog = () => {
    setIsFriendProfileDialogOpen(false);
    setActiveFriendProfileId('');
    setFriendProfileSummary(null);
    setIsFriendProfileSummaryLoading(false);
  };

  const handleOpenFriendProfileDialog = (friend: SocialFriend) => {
    setActiveFriendProfileId(friend.id);
    setFriendProfileSummary(createFriendProfileSummaryFallback(friend));
    setIsFriendProfileDialogOpen(true);
  };

  const requestFollowByHandle = async (
    rawHandle: string,
    options?: { preferredName?: string; preferredGoal?: string; clearInputs?: boolean }
  ) => {
    if (remoteGlobalSyncEnabled && !remoteSnapshotLoaded) {
      toast.error('Aguarde a sincronizacao inicial da comunidade e tente novamente.');
      return false;
    }

    if (!remoteGlobalSyncEnabled) {
      toast.error('Nao foi possivel sincronizar pedidos. Atualize as migrations do Supabase.');
      return false;
    }

    const receiverHandleValue = sanitizeHandleInput(rawHandle);
    if (!receiverHandleValue) {
      toast.error('Informe o @usuario para seguir.');
      return false;
    }
    if (receiverHandleValue.length < 3) {
      toast.error('Digite pelo menos 3 caracteres do @usuario.');
      return false;
    }

    if (receiverHandleValue === normalizedProfileHandle) {
      toast.error('Nao e possivel seguir voce mesmo.');
      return false;
    }

    const targetProfile = await resolveDiscoverableProfileByHandle(receiverHandleValue);
    if (!targetProfile?.profileId) {
      toast.error('Perfil nao encontrado. Use o @usuario exato para enviar o pedido.');
      return false;
    }

    const receiverProfileId = targetProfile.profileId;
    if (receiverProfileId === profile.id) {
      toast.error('Nao e possivel seguir voce mesmo.');
      return false;
    }

    const receiverNameCandidate =
      options?.preferredName?.trim() || friendName.trim() || targetProfile?.name || receiverHandleValue;
    const receiverName = receiverNameCandidate.startsWith('@')
      ? receiverNameCandidate.slice(1)
      : receiverNameCandidate;
    const receiverGoalLabel =
      options?.preferredGoal?.trim() || friendGoal.trim() || targetProfile?.goal || 'Sem meta definida';
    const receiverHandle = toHandle(targetProfile?.handle || receiverHandleValue);

    if (socialState.friends.some((friend) => normalizeHandle(friend.handle) === receiverHandleValue)) {
      toast.error('Voce ja segue esse usuario.');
      return false;
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
      return false;
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
      return false;
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

    if (options?.clearInputs) {
      setFriendName('');
      setFriendHandle('');
      setFriendGoal('');
    }
    toast.success('Solicitacao para seguir enviada.');
    return true;
  };

  const handleAddFriend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await requestFollowByHandle(friendHandle, {
      preferredName: friendName,
      preferredGoal: friendGoal,
      clearInputs: true,
    });
  };

  const handleFollowMatchedContact = async (match: MatchedPhoneContact) => {
    await requestFollowByHandle(match.profile.handle, {
      preferredName: match.profile.name,
      preferredGoal: match.profile.goal,
    });
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
    if (activeFriendProfileId === friendId) {
      closeFriendProfileDialog();
    }

    const normalizedFriendHandle = sanitizeHandleInput(friend.handle);

    setSocialState((previous) => ({
      ...previous,
      friends: previous.friends.filter((item) => item.id !== friendId),
      clans: previous.clans.map((clan) => {
        const nextMemberIds = clan.memberIds.filter((memberId) => memberId !== friendId);
        const nextMemberPoints = sanitizeClanMemberPoints(clan.memberPoints, nextMemberIds);
        delete nextMemberPoints[friendId];
        if (clan.adminFriendId !== friendId) {
          return {
            ...clan,
            memberIds: nextMemberIds,
            memberPoints: nextMemberPoints,
          };
        }

        return {
          ...clan,
          memberIds: nextMemberIds,
          adminFriendId: undefined,
          adminProfileId: profile.id,
          adminHandle: toHandle(profileHandle),
          adminName: profile.name?.trim() || 'Voce',
          adminDefinedAt: new Date().toISOString(),
          memberPoints: nextMemberPoints,
          scoreUpdatedAt: new Date().toISOString(),
        };
      }),
      chatMessages: previous.chatMessages.filter((message) => message.friendId !== friendId),
    }));
    setChatLastReadAtByFriend((previous) => {
      if (!(friendId in previous)) return previous;
      const nextState = { ...previous };
      delete nextState[friendId];
      return nextState;
    });

    setClanMemberIds((previous) => previous.filter((memberId) => memberId !== friendId));
    setClanAdminMemberId((previous) => (previous === friendId ? 'self' : previous));
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
    if (!checked && clanAdminMemberId === friendId) {
      setClanAdminMemberId('self');
    }
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

    const selectedAdminFriend = clanAdminMemberId !== 'self'
      ? socialState.friends.find((friend) => friend.id === clanAdminMemberId) || null
      : null;
    if (clanAdminMemberId !== 'self' && !selectedAdminFriend) {
      toast.error('Selecione um administrador valido para o CLA.');
      return;
    }

    const nowIso = new Date().toISOString();
    const adminName = selectedAdminFriend
      ? selectedAdminFriend.name
      : profile.name?.trim() || 'Voce';
    const nextMemberIds = selectedAdminFriend && !clanMemberIds.includes(selectedAdminFriend.id)
      ? [selectedAdminFriend.id, ...clanMemberIds]
      : clanMemberIds;
    const nextMemberPoints = sanitizeClanMemberPoints({}, nextMemberIds);

    const nextClan: SocialClan = {
      id: createId(),
      name: clanName.trim(),
      description: clanDescription.trim(),
      memberIds: nextMemberIds,
      adminProfileId: selectedAdminFriend ? selectedAdminFriend.profileId || undefined : profile.id,
      adminHandle: selectedAdminFriend ? toHandle(selectedAdminFriend.handle) : toHandle(profileHandle),
      adminName,
      adminFriendId: selectedAdminFriend?.id,
      adminDefinedAt: nowIso,
      createdAt: nowIso,
      goals: [],
      challenges: [],
      memberPoints: nextMemberPoints,
      scoreUpdatedAt: nowIso,
      autoGoalTemplates: [
        {
          id: `clan-auto-daily-${createId()}`,
          title: DEFAULT_AUTO_DAILY_GOAL_TITLE,
          targetValue: DEFAULT_AUTO_DAILY_GOAL_TARGET,
          unit: DEFAULT_AUTO_GOAL_UNIT,
          frequency: 'daily',
          enabled: false,
          createdAt: nowIso,
          updatedAt: nowIso,
        },
        {
          id: `clan-auto-weekly-${createId()}`,
          title: DEFAULT_AUTO_WEEKLY_GOAL_TITLE,
          targetValue: DEFAULT_AUTO_WEEKLY_GOAL_TARGET,
          unit: DEFAULT_AUTO_GOAL_UNIT,
          frequency: 'weekly',
          enabled: false,
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      ],
    };

    setSocialState((prev) => ({ ...prev, clans: [nextClan, ...prev.clans] }));
    pushNotification({
      type: 'clan',
      title: 'CLA criado',
      description: `${nextClan.name} pronto para metas coletivas. Admin: ${adminName}.`,
    });

    setClanName('');
    setClanDescription('');
    setClanMemberIds([]);
    setClanAdminMemberId('self');
    setGoalClanId(nextClan.id);
    toast.success('CLA criado.');
  };

  const createClanGoal = (
    clanId: string,
    options: {
      title: string;
      targetValue: number;
      unit: string;
      dueDate: string;
      createdBy: 'user' | 'personal';
      requestText?: string;
      goalType?: SocialClanGoal['goalType'];
      autoTemplateId?: string;
      autoPeriodKey?: string;
    }
  ) => {
    if (!clanId) return false;
    const targetClan = socialState.clans.find((clan) => clan.id === clanId);
    if (!targetClan) return false;

    const sanitizedTitle = options.title.trim().slice(0, 120);
    if (!sanitizedTitle) return false;
    const sanitizedTargetValue = Math.max(1, Math.round(options.targetValue));
    const normalizedUnit = normalizeGoalUnit(options.unit || DEFAULT_GOAL_UNIT);
    const pointsAwarded = calculateGoalAwardPoints(sanitizedTargetValue);
    const pointsPenalty = calculateGoalPenaltyPoints(pointsAwarded);

    const nextGoal: SocialClanGoal = {
      id: createId(),
      title: sanitizedTitle,
      targetValue: sanitizedTargetValue,
      currentValue: 0,
      unit: normalizedUnit,
      dueDate: options.dueDate,
      completed: false,
      pointsAwarded,
      pointsPenalty,
      createdBy: options.createdBy,
      requestText: options.requestText?.trim() || undefined,
      goalType: options.goalType || (options.createdBy === 'personal' ? 'personal' : 'manual'),
      autoTemplateId: options.autoTemplateId,
      autoPeriodKey: options.autoPeriodKey,
    };

    setSocialState((prev) => ({
      ...prev,
      clans: prev.clans.map((clan) =>
        clan.id === clanId ? { ...clan, goals: [nextGoal, ...clan.goals] } : clan
      ),
    }));

    pushNotification({
      type: 'goal',
      title: options.createdBy === 'personal' ? 'Meta criada pelo Personal' : 'Meta criada',
      description: `${nextGoal.title} em ${targetClan.name}. +${pointsAwarded} pts ao concluir e -${pointsPenalty} pts se atrasar.`,
    }, false);
    return true;
  };

  const handleCreateGoal = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const target = Number(goalTargetValue);
    if (!goalClanId || !goalTitle.trim() || !Number.isFinite(target) || target <= 0) {
      toast.error('Preencha os dados da meta.');
      return;
    }
    const targetClan = socialState.clans.find((clan) => clan.id === goalClanId);
    if (!targetClan) {
      toast.error('Selecione um CLA valido.');
      return;
    }
    if (!isCurrentProfileClanAdmin(targetClan)) {
      toast.error('Somente o admin do CLA pode criar metas.');
      return;
    }

    const created = createClanGoal(goalClanId, {
      title: goalTitle,
      targetValue: target,
      unit: goalUnit,
      dueDate: goalDueDate,
      createdBy: 'user',
      goalType: 'manual',
    });
    if (!created) {
      toast.error('Nao foi possivel criar a meta no CLA selecionado.');
      return;
    }

    setGoalTitle('');
    setGoalTargetValue('10');
    setGoalUnit('treinos');
    setGoalDueDate('');
    toast.success('Meta criada.');
  };

  const handleCreateGoalWithPersonal = () => {
    if (!goalClanId) {
      toast.error('Selecione um CLA para o Personal criar a meta.');
      return;
    }
    const targetClan = socialState.clans.find((clan) => clan.id === goalClanId);
    if (!targetClan) {
      toast.error('Selecione um CLA valido.');
      return;
    }
    if (!isCurrentProfileClanAdmin(targetClan)) {
      toast.error('Somente o admin do CLA pode criar metas.');
      return;
    }
    if (!goalRequestText.trim()) {
      toast.error('Escreva a solicitacao para o Personal criar a meta.');
      return;
    }

    const parsedRequest = parseGoalRequest(goalRequestText);
    const created = createClanGoal(goalClanId, {
      title: parsedRequest.title,
      targetValue: parsedRequest.targetValue,
      unit: parsedRequest.unit,
      dueDate: parsedRequest.dueDate,
      createdBy: 'personal',
      requestText: goalRequestText,
      goalType: 'personal',
    });
    if (!created) {
      toast.error('Nao foi possivel criar a meta com o Personal.');
      return;
    }

    setGoalTitle(parsedRequest.title);
    setGoalTargetValue(String(parsedRequest.targetValue));
    setGoalUnit(parsedRequest.unit);
    setGoalDueDate(parsedRequest.dueDate);
    setGoalRequestText('');
    toast.success('Meta criada pelo Personal conforme sua solicitacao.');
  };

  const handleSaveAutomaticGoals = () => {
    if (!goalClanId) {
      toast.error('Selecione um CLA para configurar metas automaticas.');
      return;
    }

    const targetClan = socialState.clans.find((clan) => clan.id === goalClanId);
    if (!targetClan) {
      toast.error('Selecione um CLA valido.');
      return;
    }
    if (!isCurrentProfileClanAdmin(targetClan)) {
      toast.error('Somente o admin do CLA pode configurar metas automaticas.');
      return;
    }

    const parsedDailyTarget = Number(autoDailyGoalTargetValue);
    const parsedWeeklyTarget = Number(autoWeeklyGoalTargetValue);
    if (
      autoDailyGoalEnabled &&
      (
        !autoDailyGoalTitle.trim() ||
        !Number.isFinite(parsedDailyTarget) ||
        parsedDailyTarget <= 0
      )
    ) {
      toast.error('Preencha corretamente a meta diaria automatica.');
      return;
    }
    if (
      autoWeeklyGoalEnabled &&
      (
        !autoWeeklyGoalTitle.trim() ||
        !Number.isFinite(parsedWeeklyTarget) ||
        parsedWeeklyTarget <= 0
      )
    ) {
      toast.error('Preencha corretamente a meta semanal automatica.');
      return;
    }

    const existingTemplates = targetClan.autoGoalTemplates || [];
    const dailyTemplate = existingTemplates.find((template) => template.frequency === 'daily');
    const weeklyTemplate = existingTemplates.find((template) => template.frequency === 'weekly');
    const nowIso = new Date().toISOString();
    const nextTemplates: SocialClanAutoGoalTemplate[] = [
      {
        id: dailyTemplate?.id || `clan-auto-daily-${createId()}`,
        title: autoDailyGoalTitle.trim() || DEFAULT_AUTO_DAILY_GOAL_TITLE,
        targetValue: Math.max(1, Math.round(parsedDailyTarget || DEFAULT_AUTO_DAILY_GOAL_TARGET)),
        unit: normalizeGoalUnit(autoDailyGoalUnit || DEFAULT_AUTO_GOAL_UNIT),
        frequency: 'daily',
        enabled: autoDailyGoalEnabled,
        createdAt: dailyTemplate?.createdAt || nowIso,
        updatedAt: nowIso,
      },
      {
        id: weeklyTemplate?.id || `clan-auto-weekly-${createId()}`,
        title: autoWeeklyGoalTitle.trim() || DEFAULT_AUTO_WEEKLY_GOAL_TITLE,
        targetValue: Math.max(1, Math.round(parsedWeeklyTarget || DEFAULT_AUTO_WEEKLY_GOAL_TARGET)),
        unit: normalizeGoalUnit(autoWeeklyGoalUnit || DEFAULT_AUTO_GOAL_UNIT),
        frequency: 'weekly',
        enabled: autoWeeklyGoalEnabled,
        createdAt: weeklyTemplate?.createdAt || nowIso,
        updatedAt: nowIso,
      },
    ];

    setSocialState((previous) => ({
      ...previous,
      clans: previous.clans.map((clan) =>
        clan.id === goalClanId
          ? { ...clan, autoGoalTemplates: nextTemplates }
          : clan
      ),
    }));

    const enabledCount = nextTemplates.filter((template) => template.enabled).length;
    pushNotification({
      type: 'goal',
      title: 'Metas automaticas atualizadas',
      description:
        enabledCount > 0
          ? `${targetClan.name} com ${enabledCount} meta(s) automatica(s) ativa(s).`
          : `Metas automaticas desativadas em ${targetClan.name}.`,
    }, false);
    toast.success('Configuracao de metas automaticas salva.');
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
    let awardedPoints = 0;
    let completedGoalTitle = '';

    setSocialState((prev) => ({
      ...prev,
      clans: prev.clans.map((clan) => {
        if (clan.id !== clanId) return clan;
        let awardedPointsInClan = 0;
        const nextGoals = clan.goals.map((goal) => {
          if (goal.id !== goalId) return goal;
          const nextValue = Math.min(goal.targetValue, goal.currentValue + 1);
          const completed = nextValue >= goal.targetValue;
          const justCompleted = completed && !goal.completed;

          if (justCompleted) {
            const pointsAwarded = goal.pointsAwarded ?? calculateGoalAwardPoints(goal.targetValue);
            awardedPoints += pointsAwarded;
            awardedPointsInClan += pointsAwarded;
            completedGoalTitle = goal.title;
            return {
              ...goal,
              currentValue: nextValue,
              completed: true,
              pointsAwarded,
              scoredAt: goal.scoredAt || new Date().toISOString(),
            };
          }

          return {
            ...goal,
            currentValue: nextValue,
            completed,
          };
        });

        if (!awardedPointsInClan) {
          return {
            ...clan,
            goals: nextGoals,
          };
        }

        return {
          ...clan,
          goals: nextGoals,
          ...applyClanMemberPointsDelta(clan, CLAN_SELF_MEMBER_KEY, awardedPointsInClan),
        };
      }),
    }));

    if (awardedPoints > 0) {
      void applyProfilePointsDelta(awardedPoints, `Meta concluida: ${completedGoalTitle}`);
      pushNotification({
        type: 'goal',
        title: 'Meta concluida',
        description: `${completedGoalTitle} finalizada. +${awardedPoints} pts.`,
      }, false);
    }
  };

  const applyAutomaticClanGoals = useCallback(() => {
    const referenceDate = new Date();

    setSocialState((previous) => {
      let changed = false;
      const nextClans = previous.clans.map((clan) => {
        if (!clan.adminDefinedAt) return clan;

        const activeTemplates = (clan.autoGoalTemplates || []).filter((template) => template.enabled);
        if (!activeTemplates.length) return clan;

        const nextGoals = [...clan.goals];
        let clanChanged = false;

        activeTemplates.forEach((template) => {
          const schedule = resolveAutoGoalSchedule(template.frequency, referenceDate);
          const hasGoalForCurrentPeriod = nextGoals.some((goal) => {
            if (goal.autoTemplateId && goal.autoPeriodKey) {
              return goal.autoTemplateId === template.id && goal.autoPeriodKey === schedule.periodKey;
            }
            if (goal.goalType !== schedule.goalType) return false;
            return (
              goal.autoPeriodKey === schedule.periodKey &&
              goal.title.trim().toLowerCase() === template.title.trim().toLowerCase()
            );
          });
          if (hasGoalForCurrentPeriod) return;

          const targetValue = Math.max(1, Math.round(template.targetValue || DEFAULT_GOAL_TARGET));
          const pointsAwarded = calculateGoalAwardPoints(targetValue);
          const pointsPenalty = calculateGoalPenaltyPoints(pointsAwarded);

          nextGoals.unshift({
            id: createId(),
            title: template.title.trim().slice(0, 120) || 'Meta automatica',
            targetValue,
            currentValue: 0,
            unit: normalizeGoalUnit(template.unit || DEFAULT_AUTO_GOAL_UNIT),
            dueDate: schedule.dueDate,
            completed: false,
            pointsAwarded,
            pointsPenalty,
            createdBy: 'user',
            goalType: schedule.goalType,
            autoTemplateId: template.id,
            autoPeriodKey: schedule.periodKey,
          });
          clanChanged = true;
        });

        if (!clanChanged) return clan;
        changed = true;
        return {
          ...clan,
          goals: nextGoals,
        };
      });

      if (!changed) return previous;
      return {
        ...previous,
        clans: nextClans,
      };
    });
  }, []);

  useEffect(() => {
    applyAutomaticClanGoals();
  }, [applyAutomaticClanGoals, socialState.clans]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      applyAutomaticClanGoals();
    }, 60 * 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [applyAutomaticClanGoals]);

  const applyOverdueGoalPenalties = useCallback(() => {
    const now = Date.now();
    let penalizedPoints = 0;
    const penalizedGoalTitles: string[] = [];

    setSocialState((previous) => {
      let changed = false;
      const nextClans = previous.clans.map((clan) => {
        let penalizedPointsInClan = 0;
        const nextGoals = clan.goals.map((goal) => {
          if (goal.completed || goal.penalizedAt || !goal.dueDate) return goal;

          const dueTimestamp = resolveGoalDueTimestamp(goal.dueDate);
          if (!dueTimestamp || dueTimestamp > now) return goal;

          changed = true;
          const pointsPenalty =
            goal.pointsPenalty ??
            calculateGoalPenaltyPoints(
              goal.pointsAwarded ?? calculateGoalAwardPoints(goal.targetValue)
            );

          penalizedPoints += pointsPenalty;
          penalizedPointsInClan += pointsPenalty;
          penalizedGoalTitles.push(goal.title);
          return {
            ...goal,
            pointsPenalty,
            penalizedAt: new Date().toISOString(),
          };
        });

        if (!penalizedPointsInClan) {
          return {
            ...clan,
            goals: nextGoals,
          };
        }

        return {
          ...clan,
          goals: nextGoals,
          ...applyClanMemberPointsDelta(clan, CLAN_SELF_MEMBER_KEY, -penalizedPointsInClan),
        };
      });

      if (!changed) return previous;
      return {
        ...previous,
        clans: nextClans,
      };
    });

    if (penalizedPoints > 0) {
      const firstGoalTitle = penalizedGoalTitles[0] || 'Meta atrasada';
      const moreCount = Math.max(0, penalizedGoalTitles.length - 1);
      const suffix = moreCount ? ` e mais ${moreCount}` : '';
      void applyProfilePointsDelta(-penalizedPoints, `Meta atrasada: ${firstGoalTitle}${suffix}`);
      pushNotification({
        type: 'goal',
        title: 'Penalidade aplicada em meta',
        description: `Foram descontados ${penalizedPoints} pts por metas de CLA vencidas.`,
      }, false);
    }
  }, [applyProfilePointsDelta, pushNotification]);

  useEffect(() => {
    applyOverdueGoalPenalties();
    const intervalId = window.setInterval(() => {
      applyOverdueGoalPenalties();
    }, 60 * 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [applyOverdueGoalPenalties]);

  const handleToggleChallengeDone = (clanId: string, challengeId: string) => {
    let pointsDelta = 0;
    let challengeTitle = '';
    let becameCompleted = false;

    setSocialState((prev) => ({
      ...prev,
      clans: prev.clans.map((clan) => {
        if (clan.id !== clanId) return clan;
        const nextChallenges = clan.challenges.map((challenge) => {
          if (challenge.id !== challengeId) return challenge;
          const nextCompleted = !challenge.completed;
          pointsDelta += nextCompleted ? challenge.points : -challenge.points;
          challengeTitle = challenge.title;
          becameCompleted = nextCompleted;
          return {
            ...challenge,
            completed: nextCompleted,
          };
        });

        if (!pointsDelta) {
          return {
            ...clan,
            challenges: nextChallenges,
          };
        }

        return {
          ...clan,
          challenges: nextChallenges,
          ...applyClanMemberPointsDelta(clan, CLAN_SELF_MEMBER_KEY, pointsDelta),
        };
      }),
    }));

    if (!pointsDelta) return;

    const reason = becameCompleted
      ? `Desafio concluido: ${challengeTitle}`
      : `Desafio desmarcado: ${challengeTitle}`;
    void applyProfilePointsDelta(pointsDelta, reason);
    pushNotification({
      type: 'challenge',
      title: becameCompleted ? 'Desafio concluido' : 'Desafio desmarcado',
      description: becameCompleted
        ? `${challengeTitle} somou +${pointsDelta} pts no CLA.`
        : `${challengeTitle} removeu ${Math.abs(pointsDelta)} pts no CLA.`,
    }, false);
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
      const accountVisibility = typeof window === 'undefined'
        ? 'public'
        : parseProfileAccountVisibility(window.localStorage.getItem(socialProfileStorageKey));
      const nextPost: SocialFeedPost = {
        id: createId(),
        authorProfileId: profile.id,
        authorName: profile.name,
        authorHandle: profileHandle,
        caption: composerCaption.trim(),
        imageDataUrl: composerImageDataUrl,
        createdAt: new Date().toISOString(),
        visibility: accountVisibility,
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
    const accountVisibility = typeof window === 'undefined'
      ? 'public'
      : parseProfileAccountVisibility(window.localStorage.getItem(socialProfileStorageKey));

    const nextStory: SocialStory = {
      id: createId(),
      authorProfileId: profile.id,
      authorName: profile.name,
      authorHandle: profileHandle,
      caption: composerCaption.trim(),
      imageDataUrl: composerImageDataUrl,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      visibility: accountVisibility,
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

  const handleOpenReplyComposer = (postId: string, commentId: string) => {
    setOpenReplyComposerByPostId((previous) => ({
      ...previous,
      [postId]: commentId,
    }));
  };

  const handleCloseReplyComposer = (postId: string) => {
    setOpenReplyComposerByPostId((previous) => {
      if (!(postId in previous)) return previous;
      const next = { ...previous };
      delete next[postId];
      return next;
    });
  };

  const handleAddPostComment = (postId: string, parentCommentId?: string) => {
    const text = parentCommentId
      ? (replyCommentInputs[parentCommentId] || '').trim()
      : (postCommentInputs[postId] || '').trim();
    if (!text) return;

    const nextComment: SocialPostComment = {
      id: createId(),
      authorName: profile.name,
      authorHandle: profileHandle,
      text,
      createdAt: new Date().toISOString(),
      likes: 0,
      likedByHandles: [],
      parentCommentId,
    };

    setGlobalPosts((previous) =>
      previous.map((post) =>
        post.id === postId
          ? { ...post, comments: [...post.comments, nextComment] }
          : post
      )
    );

    if (parentCommentId) {
      setReplyCommentInputs((previous) => ({ ...previous, [parentCommentId]: '' }));
      handleCloseReplyComposer(postId);
      toast.success('Resposta publicada.');
      return;
    }

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

  const openStoryGroup = (groupHandle: string, storyIndex = 0) => {
    setActiveStoryGroupHandle(groupHandle);
    setActiveStoryIndex(Math.max(0, storyIndex));
  };

  const handleMoveStoryWithinGroup = (step: -1 | 1) => {
    if (!activeStoryGroup) return;
    const nextIndex = activeStoryIndex + step;
    if (nextIndex < 0 || nextIndex >= activeStoryGroup.stories.length) return;
    setActiveStoryIndex(nextIndex);
  };

  const closeActiveStoryDialog = () => {
    setActiveStoryGroupHandle('');
    setActiveStoryIndex(0);
  };

  const openEditPostDialog = (post: SocialFeedPost) => {
    setEditingPostId(post.id);
    setEditingStoryId('');
    setEditingContentCaption(post.caption);
    setIsEditContentDialogOpen(true);
  };

  const openEditStoryDialog = (story: SocialStory, closeViewer = false) => {
    setEditingStoryId(story.id);
    setEditingPostId('');
    setEditingContentCaption(story.caption || '');
    setIsEditContentDialogOpen(true);
    if (closeViewer) {
      closeActiveStoryDialog();
    }
  };

  const closeEditContentDialog = () => {
    setIsEditContentDialogOpen(false);
    setEditingPostId('');
    setEditingStoryId('');
    setEditingContentCaption('');
  };

  const handleSaveEditedContent = () => {
    if (editingPostId) {
      const trimmedCaption = editingContentCaption.trim();
      if (!trimmedCaption) {
        toast.error('A legenda do post nao pode ficar vazia.');
        return;
      }
      setGlobalPosts((previous) =>
        previous.map((post) =>
          post.id === editingPostId ? { ...post, caption: trimmedCaption } : post
        )
      );
      toast.success('Post atualizado.');
      closeEditContentDialog();
      return;
    }

    if (editingStoryId) {
      const trimmedCaption = editingContentCaption.trim();
      setGlobalStories((previous) =>
        previous.map((story) =>
          story.id === editingStoryId ? { ...story, caption: trimmedCaption } : story
        )
      );
      toast.success('Story atualizada.');
      closeEditContentDialog();
      return;
    }

    closeEditContentDialog();
  };

  const handleDeletePost = (postId: string) => {
    const post = globalPosts.find((item) => item.id === postId);
    if (!post) return;

    const isOwner = normalizeHandle(post.authorHandle || post.authorName) === normalizedProfileHandle;
    if (!isOwner) {
      toast.error('Voce so pode excluir seus proprios posts.');
      return;
    }

    const confirmed = window.confirm('Excluir este post permanentemente?');
    if (!confirmed) return;

    setGlobalPosts((previous) => previous.filter((item) => item.id !== postId));
    if (editingPostId === postId) {
      closeEditContentDialog();
    }
    toast.success('Post excluido.');
  };

  const handleDeleteStory = (storyId: string, closeViewer = false) => {
    const story = globalStories.find((item) => item.id === storyId);
    if (!story) return;

    const isOwner = normalizeHandle(story.authorHandle || story.authorName) === normalizedProfileHandle;
    if (!isOwner) {
      toast.error('Voce so pode excluir suas proprias stories.');
      return;
    }

    const confirmed = window.confirm('Excluir esta story permanentemente?');
    if (!confirmed) return;

    setGlobalStories((previous) => previous.filter((item) => item.id !== storyId));
    if (editingStoryId === storyId) {
      closeEditContentDialog();
    }
    if (closeViewer) {
      closeActiveStoryDialog();
    }
    toast.success('Story excluida.');
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
    `${post.caption}\n\nCompartilhado via SouFit ${post.authorHandle}\n#SouFit #JornadaFitness`;

  const buildStoryShareText = (story: SocialStory) =>
    `${story.caption || 'Story compartilhada'}\n\nStory de ${story.authorHandle} no SouFit\n#SouFit #Story`;

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
          await navigator.share({ title: 'Meu progresso no SouFit', text, files: [file] });
        } else {
          await navigator.share({ title: 'Meu progresso no SouFit', text });
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

  const notifyFitChatPush = async (
    receiverHandle: string,
    text: string,
    postId?: string,
    storyId?: string
  ) => {
    const normalizedReceiverHandle = toHandle(receiverHandle);
    if (!normalizedReceiverHandle || normalizedReceiverHandle === profileHandle) return;

    const messagePreview = text.trim().slice(0, 160);
    if (!messagePreview) return;

    const { error } = await supabase.functions.invoke('fitchat-push', {
      body: {
        receiver_handle: normalizedReceiverHandle,
        sender_name: profile.name,
        sender_handle: profileHandle,
        text: messagePreview,
        post_id: postId || null,
        story_id: storyId || null,
        target_path: buildChatEntryPath({ friendHandle: profileHandle }),
      },
    });

    if (error) {
      console.error('Erro ao enviar push do FitChat:', error);
    }
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
    storyId?: string,
    attachment?: ChatAttachmentDraft
  ) => {
    const friend = friendsById.get(friendId);
    if (!friend) return false;

    const fallbackText = attachment
      ? (attachment.type || '').startsWith('image/')
        ? 'Imagem enviada'
        : (attachment.type || '').startsWith('audio/')
          ? 'Mensagem de voz'
          : 'Arquivo enviado'
      : '';
    const messageText = text.trim() || fallbackText;
    if (!messageText) return false;
    const attachmentType = attachment?.type || '';
    const isShareableGlobalAttachmentType = isGlobalChatAttachmentMediaType(attachmentType);
    const maxAttachmentDataUrlLength = getGlobalChatAttachmentDataUrlLimit(attachmentType);
    const shouldShareAttachmentDataUrl =
      Boolean(attachment?.dataUrl) &&
      isShareableGlobalAttachmentType &&
      (attachment?.dataUrl.length || 0) <= maxAttachmentDataUrlLength;
    if (attachment?.dataUrl && isShareableGlobalAttachmentType && !shouldShareAttachmentDataUrl) {
      toast.error('Audio muito grande para envio. Grave uma mensagem menor.');
      return false;
    }
    const globalAttachmentDataUrl = shouldShareAttachmentDataUrl ? attachment?.dataUrl : undefined;

    const createdAt = new Date().toISOString();
    appendChatMessage({
      id: createId(),
      friendId,
      sender: 'me',
      text: messageText,
      createdAt,
      postId,
      storyId,
      attachmentName: attachment?.name,
      attachmentType: attachment?.type,
      attachmentDataUrl: attachment?.dataUrl,
    });

    appendGlobalChatEvent({
      id: createId(),
      senderProfileId: profile.id,
      senderName: profile.name,
      senderHandle: profileHandle,
      receiverHandle: friend.handle,
      text: messageText,
      createdAt,
      postId,
      storyId,
      attachmentName: attachment?.name,
      attachmentType: attachment?.type,
      attachmentDataUrl: globalAttachmentDataUrl,
    });

    void notifyFitChatPush(friend.handle, messageText, postId, storyId);

    return true;
  };

  const startChatWithFriend = (friendId: string) => {
    if (!friendId) return;
    markChatAsRead(friendId);
    setPendingChatFriendId(friendId);
    setActiveChatFriendId(friendId);
    if (isMobile) {
      setShowChatListOnMobile(false);
    }
  };

  const handleStartChat = (friendId?: string) => {
    const targetFriendId =
      friendId ||
      pendingChatFriendId ||
      (filteredChatFriends.length ? filteredChatFriends[0].id : '');

    if (!targetFriendId) {
      toast.error('Selecione um contato para iniciar o FitChat.');
      return;
    }

    startChatWithFriend(targetFriendId);
  };

  const handleToggleKeepChatHistory = (checked: boolean) => {
    setKeepChatHistory(checked);
    if (checked) {
      toast.success('Historico do FitChat ativado.');
      return;
    }
    toast.info('Historico desativado. Novas mensagens nao serao salvas localmente.');
  };

  const handleDeleteConversationByFriend = (friendId: string) => {
    if (!friendId) return;

    const friend = friendsById.get(friendId);
    const confirmed = window.confirm(
      `Apagar o historico com ${friend?.name || 'este contato'} neste aparelho?`
    );
    if (!confirmed) return;

    setSocialState((previous) => ({
      ...previous,
      chatMessages: previous.chatMessages.filter((message) => message.friendId !== friendId),
    }));

    setChatLastReadAtByFriend((previous) => {
      if (!(friendId in previous)) return previous;
      const nextState = { ...previous };
      delete nextState[friendId];
      return nextState;
    });

    if (friendId === activeChatFriendId) {
      setPendingChatMessageId('');
      setHighlightedChatMessageId('');
    }

    toast.success('Conversa apagada.');
  };

  const handleClearActiveConversation = () => {
    if (!activeChatFriendId) {
      toast.error('Escolha um contato para apagar a conversa.');
      return;
    }
    handleDeleteConversationByFriend(activeChatFriendId);
  };

  const handleDeleteChatMessage = (messageId: string) => {
    const targetMessage = socialState.chatMessages.find((message) => message.id === messageId);
    if (!targetMessage) return;

    const senderLabel =
      targetMessage.sender === 'me'
        ? 'enviada por voce'
        : `de ${friendsById.get(targetMessage.friendId)?.name || 'contato'}`;
    const confirmed = window.confirm(`Excluir esta mensagem ${senderLabel} neste aparelho?`);
    if (!confirmed) return;

    setSocialState((previous) => ({
      ...previous,
      chatMessages: previous.chatMessages.filter((message) => message.id !== messageId),
    }));

    setPendingChatMessageId((previous) => (previous === messageId ? '' : previous));
    setHighlightedChatMessageId((previous) => (previous === messageId ? '' : previous));
    chatMessageElementsRef.current.delete(messageId);
    toast.success('Mensagem excluida.');
  };

  const handleClearAllChatHistory = () => {
    const confirmed = window.confirm('Apagar todo o historico do FitChat neste aparelho?');
    if (!confirmed) return;

    const incomingEventIds = globalChatEvents
      .filter((event) => normalizeHandle(event.receiverHandle) === normalizedProfileHandle)
      .map((event) => event.id);

    setSocialState((previous) => ({ ...previous, chatMessages: [] }));
    setChatLastReadAtByFriend({});
    setSeenChatEventIds((previous) =>
      sanitizeSeenChatEventIds([...previous, ...incomingEventIds])
    );

    toast.success('Historico do FitChat apagado.');
  };

  const handleSelectQuickEmoji = (emoji: string) => {
    setChatInput((previous) => `${previous}${emoji}`);
  };

  const stopVoiceRecordingTimers = () => {
    if (voiceRecordingTimerRef.current) {
      window.clearInterval(voiceRecordingTimerRef.current);
      voiceRecordingTimerRef.current = null;
    }
    if (voiceAutoStopTimeoutRef.current) {
      window.clearTimeout(voiceAutoStopTimeoutRef.current);
      voiceAutoStopTimeoutRef.current = null;
    }
  };

  const stopVoiceStreamTracks = () => {
    if (!voiceStreamRef.current) return;
    voiceStreamRef.current.getTracks().forEach((track) => track.stop());
    voiceStreamRef.current = null;
  };

  const stopVoiceRecording = () => {
    const recorder = voiceRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop();
  };

  const startVoiceRecording = async () => {
    if (isRecordingVoice) return;
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error('Seu dispositivo nao suporta gravacao de audio no navegador.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceStreamRef.current = stream;
      voiceChunksRef.current = [];

      const preferredMimeTypes = [
        'audio/mp4;codecs=mp4a.40.2',
        'audio/mp4',
        'audio/aac',
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
      ];
      const selectedMimeType = preferredMimeTypes.find(
        (type) => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(type)
      );
      const recorderOptions = selectedMimeType
        ? { mimeType: selectedMimeType, audioBitsPerSecond: 32000 }
        : { audioBitsPerSecond: 32000 };
      const recorder = new MediaRecorder(stream, recorderOptions);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          voiceChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        stopVoiceRecordingTimers();
        setIsRecordingVoice(false);
        setVoiceRecordingSeconds(0);

        const audioBlob = new Blob(voiceChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        voiceChunksRef.current = [];
        voiceRecorderRef.current = null;
        stopVoiceStreamTracks();

        if (!audioBlob.size) {
          toast.error('Nao foi possivel gerar o audio.');
          return;
        }

        if (audioBlob.size > MAX_CHAT_ATTACHMENT_SIZE_BYTES) {
          toast.error('Audio muito grande. Grave uma mensagem menor.');
          return;
        }

        void (async () => {
          try {
            const dataUrl = await blobToDataUrl(audioBlob);
            const maxDataUrlLength = getGlobalChatAttachmentDataUrlLimit(audioBlob.type || 'audio/webm');
            if (dataUrl.length > maxDataUrlLength) {
              toast.error('Audio muito grande para envio no chat. Grave uma mensagem menor.');
              return;
            }
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const extension = getAudioAttachmentExtension(audioBlob.type || 'audio/webm');
            setPendingChatAttachment({
              name: `voz-${timestamp}.${extension}`,
              type: audioBlob.type || 'audio/webm',
              dataUrl,
            });
            toast.success('Mensagem de voz pronta para envio.');
          } catch (error) {
            console.error('Erro ao processar audio:', error);
            toast.error('Nao foi possivel processar o audio gravado.');
          }
        })();
      };

      recorder.onerror = (error) => {
        console.error('Erro no gravador de audio:', error);
        stopVoiceRecordingTimers();
        setIsRecordingVoice(false);
        setVoiceRecordingSeconds(0);
        voiceRecorderRef.current = null;
        voiceChunksRef.current = [];
        stopVoiceStreamTracks();
        toast.error('Nao foi possivel gravar audio neste momento.');
      };

      recorder.start(250);
      voiceRecorderRef.current = recorder;
      setIsRecordingVoice(true);
      setVoiceRecordingSeconds(0);
      setIsEmojiPickerOpen(false);

      voiceRecordingTimerRef.current = window.setInterval(() => {
        setVoiceRecordingSeconds((previous) => previous + 1);
      }, 1000);

      voiceAutoStopTimeoutRef.current = window.setTimeout(() => {
        if (voiceRecorderRef.current && voiceRecorderRef.current.state !== 'inactive') {
          voiceRecorderRef.current.stop();
          toast.info('Gravacao encerrada apos 60 segundos.');
        }
      }, MAX_VOICE_RECORDING_SECONDS * 1000);
    } catch (error) {
      console.error('Erro ao iniciar gravacao de audio:', error);
      stopVoiceRecordingTimers();
      setIsRecordingVoice(false);
      setVoiceRecordingSeconds(0);
      voiceRecorderRef.current = null;
      voiceChunksRef.current = [];
      stopVoiceStreamTracks();
      toast.error('Permita acesso ao microfone para enviar mensagem de voz.');
    }
  };

  const handleChatAttachmentSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (file.size > MAX_CHAT_ATTACHMENT_SIZE_BYTES) {
      toast.error('Arquivo muito grande. Limite de 5 MB por envio.');
      return;
    }

    setProcessingChatAttachment(true);
    try {
      const isImage = file.type.startsWith('image/');
      const isAudio = file.type.startsWith('audio/');
      const dataUrl = isImage
        ? await convertImageToDataUrl(file)
        : isAudio
          ? await blobToDataUrl(file)
          : '';
      if (isAudio) {
        const maxDataUrlLength = getGlobalChatAttachmentDataUrlLimit(file.type || 'audio/webm');
        if (dataUrl.length > maxDataUrlLength) {
          toast.error('Audio muito grande para envio no chat. Grave uma mensagem menor.');
          return;
        }
      }

      setPendingChatAttachment({
        name: file.name || 'arquivo',
        type: file.type || 'application/octet-stream',
        dataUrl,
      });
      if (!isImage && !isAudio) {
        toast.success('Arquivo anexado. O chat exibira nome e tipo do arquivo.');
      }
      setIsEmojiPickerOpen(false);
    } catch (error) {
      console.error('Erro ao preparar anexo do chat:', error);
      toast.error('Nao foi possivel anexar esse arquivo.');
    } finally {
      setProcessingChatAttachment(false);
    }
  };

  const handleRemovePendingChatAttachment = () => {
    setPendingChatAttachment(null);
  };

  const handleSendChatMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeChatFriendId) {
      toast.error('Selecione um contato para conversar.');
      return;
    }
    const text = chatInput.trim();
    if (!text && !pendingChatAttachment) return;

    const wasSent = sendMessageToFollowedProfile(
      activeChatFriendId,
      text,
      undefined,
      undefined,
      pendingChatAttachment || undefined
    );
    if (!wasSent) {
      toast.error('Nao foi possivel enviar para esse perfil.');
      return;
    }
    setChatInput('');
    setPendingChatAttachment(null);
    setIsEmojiPickerOpen(false);
  };

  const handlePrimaryChatAction = () => {
    if (!activeChatFriendId) {
      toast.error('Selecione um contato para conversar.');
      return;
    }

    const hasChatPayload = Boolean(chatInput.trim() || pendingChatAttachment);
    if (hasChatPayload) {
      const text = chatInput.trim();
      const wasSent = sendMessageToFollowedProfile(
        activeChatFriendId,
        text,
        undefined,
        undefined,
        pendingChatAttachment || undefined
      );
      if (!wasSent) {
        toast.error('Nao foi possivel enviar para esse perfil.');
        return;
      }
      setChatInput('');
      setPendingChatAttachment(null);
      setIsEmojiPickerOpen(false);
      return;
    }

    if (isRecordingVoice) {
      stopVoiceRecording();
      return;
    }

    void startVoiceRecording();
  };

  useEffect(() => {
    return () => {
      stopVoiceRecordingTimers();
      if (voiceRecorderRef.current && voiceRecorderRef.current.state !== 'inactive') {
        voiceRecorderRef.current.onstop = null;
        voiceRecorderRef.current.onerror = null;
        voiceRecorderRef.current.stop();
      }
      voiceRecorderRef.current = null;
      voiceChunksRef.current = [];
      stopVoiceStreamTracks();
    };
  }, []);

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
      target: {
        section: 'chat',
        path: FIT_CHAT_ENTRY_PATH,
        friendId: resolvedFriendId,
        friendHandle: friend?.handle,
        postId: post.id,
      },
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
      target: {
        section: 'chat',
        path: FIT_CHAT_ENTRY_PATH,
        friendId: resolvedFriendId,
        friendHandle: friend?.handle,
        storyId: story.id,
      },
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
    closeActiveStoryDialog();
  };

  const closeShareDialog = () => {
    setIsShareDialogOpen(false);
    setSharePostId('');
    setShareStoryId('');
    setShareSearch('');
    setShareMessage('');
    setSelectedShareFriendIds([]);
  };

  const closeChatSharedPreview = () => {
    setChatSharedPostPreviewId('');
    setChatSharedStoryPreviewId('');
  };

  const openChatSharedPostPreview = (postId: string) => {
    if (!postId) return;
    const exists = postsById.has(postId);
    if (!exists) {
      toast.error('Esse post compartilhado nao esta mais disponivel.');
      return;
    }
    setChatSharedStoryPreviewId('');
    setChatSharedPostPreviewId(postId);
  };

  const openChatSharedStoryPreview = (storyId: string) => {
    if (!storyId) return;
    const exists = storiesById.has(storyId);
    if (!exists) {
      toast.error('Essa story compartilhada nao esta mais disponivel.');
      return;
    }
    setChatSharedPostPreviewId('');
    setChatSharedStoryPreviewId(storyId);
  };

  const handleOpenSharedOrigin = () => {
    if (chatSharedPreviewPost) {
      setActiveSection('feed');
      closeChatSharedPreview();
      return;
    }

    if (!chatSharedPreviewStory) return;
    setActiveSection('feed');
    const authorHandle = normalizeHandle(
      chatSharedPreviewStory.authorHandle || chatSharedPreviewStory.authorName || ''
    );
    const group = storyGroups.find((item) => item.authorHandle === authorHandle);
    if (group) {
      const storyIndex = group.stories.findIndex((story) => story.id === chatSharedPreviewStory.id);
      openStoryGroup(group.authorHandle, storyIndex >= 0 ? storyIndex : 0);
    }
    closeChatSharedPreview();
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

  const handleOpenNotification = (notification: SocialNotification) => {
    handleMarkNotificationAsRead(notification.id);

    const targetSection =
      notification.target?.section || DEFAULT_NOTIFICATION_SECTION_BY_TYPE[notification.type];
    const targetPath = notification.target?.path || SOCIAL_SECTION_PATH[targetSection];

    if (targetSection === 'chat') {
      const targetFromId = notification.target?.friendId;
      const targetFromHandle = normalizeHandle(notification.target?.friendHandle || '');
      const targetFriendId = targetFromId && friendsById.has(targetFromId)
        ? targetFromId
        : targetFromHandle
          ? friendsByHandle.get(targetFromHandle)?.id || ''
          : '';
      const targetFriendHandle = targetFromHandle
        ? toHandle(targetFromHandle)
        : targetFriendId
          ? friendsById.get(targetFriendId)?.handle
          : undefined;
      const targetMessageId = notification.target?.messageId?.trim() || '';

      if (targetFriendId) {
        setPendingChatFriendId(targetFriendId);
        setActiveChatFriendId(targetFriendId);
      }
      if (isMobile && targetFriendId) {
        setShowChatListOnMobile(false);
      }
      if (targetMessageId) {
        setPendingChatMessageId(targetMessageId);
      }

      if (targetFriendHandle || targetMessageId) {
        navigate(
          buildChatEntryPath({
            friendHandle: targetFriendHandle,
            messageId: targetMessageId || undefined,
          })
        );
        return;
      }

      navigate(targetPath || FIT_CHAT_ENTRY_PATH);
      return;
    }

    setActiveSection(targetSection);
    navigate(targetPath);
  };

  const handleClearNotifications = () => {
    if (!socialState.notifications.length) {
      toast.info('Nao ha notificacoes para limpar.');
      return;
    }

    const confirmed = window.confirm('Limpar todas as notificacoes locais?');
    if (!confirmed) return;

    setSocialState((prev) => ({
      ...prev,
      notifications: [],
    }));
    toast.success('Notificacoes limpas.');
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
            Comunidade <span className="gradient-text">SouFit</span>
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
      <input
        ref={chatAttachmentInputRef}
        type="file"
        className="hidden"
        onChange={handleChatAttachmentSelected}
      />
      <input
        ref={chatCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleChatAttachmentSelected}
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
              FitChat
            </TabsTrigger>
            <TabsTrigger value="feed" className="py-2 text-xs md:text-sm">
              <ImagePlus className="mr-1 h-4 w-4" />
              Feed
            </TabsTrigger>
            <TabsTrigger value="notifications" className="py-2 text-xs md:text-sm">
              <Bell className="mr-1 h-4 w-4" />
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
              <CardTitle className="text-lg">Comunidade Sou Fit</CardTitle>
              <CardDescription>
                Pesquise por @usuario, veja quem voce ja segue e gerencie solicitacoes pendentes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={communityFriendsTab} onValueChange={setCommunityFriendsTab} className="space-y-4">
                <TabsList className="grid h-auto w-full grid-cols-3 gap-1">
                  <TabsTrigger value="search" className="py-2 text-xs md:text-sm">
                    <Search className="mr-1 h-4 w-4" />
                    Pesquisar @
                  </TabsTrigger>
                  <TabsTrigger value="friends" className="py-2 text-xs md:text-sm">
                    <Users className="mr-1 h-4 w-4" />
                    Amigos
                  </TabsTrigger>
                  <TabsTrigger value="pending" className="py-2 text-xs md:text-sm">
                    <Bell className="mr-1 h-4 w-4" />
                    Pendentes
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="search" className="space-y-3">
                  <form className="space-y-3" onSubmit={handleAddFriend}>
                    <div className="space-y-2">
                      <Label htmlFor="community-friend-handle">Buscar por @usuario</Label>
                      <Input
                        id="community-friend-handle"
                        value={friendHandle}
                        onChange={handleFriendHandleChange}
                        placeholder="@anafit"
                      />
                      <p className="text-xs text-muted-foreground">
                        Digite para ver sugestoes de perfis em tempo real.
                      </p>
                      {isSearchingProfiles && (
                        <p className="text-xs text-muted-foreground">Buscando perfis...</p>
                      )}
                      {!!friendHandle.trim() && !isSearchingProfiles && !filteredDiscoverableProfiles.length && (
                        <p className="text-xs text-muted-foreground">Nenhum perfil encontrado.</p>
                      )}
                      {!!filteredDiscoverableProfiles.length && (
                        <div className="max-h-44 overflow-y-auto rounded-lg border border-border/70 bg-card/40 p-1">
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

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="community-friend-name">Nome (opcional)</Label>
                        <Input
                          id="community-friend-name"
                          value={friendName}
                          onChange={(event) => setFriendName(event.target.value)}
                          placeholder="Nome do perfil"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="community-friend-goal">Objetivo (opcional)</Label>
                        <Input
                          id="community-friend-goal"
                          value={friendGoal}
                          onChange={(event) => setFriendGoal(event.target.value)}
                          placeholder="Ex: correr 5 km"
                        />
                      </div>
                    </div>

                    <Button type="submit" variant="energy" className="w-full sm:w-auto">
                      <UserPlus className="h-4 w-4" />
                      Enviar pedido para seguir
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="friends" className="space-y-3">
                  {!socialState.friends.length && (
                    <p className="text-sm text-muted-foreground">Voce ainda nao segue ninguem.</p>
                  )}
                  <div className="space-y-2">
                    {socialState.friends.map((friend) => (
                      <div key={friend.id} className="rounded-lg border border-border/70 bg-card/40 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="line-clamp-1 font-semibold">{friend.name}</p>
                            <p className="line-clamp-1 text-sm text-muted-foreground">{friend.handle}</p>
                            <p className="mt-1 text-xs text-muted-foreground">Meta: {friend.goal}</p>
                          </div>
                          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenFriendProfileDialog(friend)}
                            >
                              <Search className="h-4 w-4" />
                              Ver perfil
                            </Button>
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
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="pending" className="grid gap-4 xl:grid-cols-2">
                  <div className="space-y-3">
                    <h3 className="font-semibold">Solicitacoes recebidas</h3>
                    {!incomingFriendRequests.length && (
                      <p className="text-sm text-muted-foreground">Nenhuma solicitacao aguardando aprovacao.</p>
                    )}
                    {incomingFriendRequests.map((request) => (
                      <div key={request.id} className="rounded-lg border border-border/70 bg-card/40 p-3 space-y-3">
                        <div>
                          <p className="font-semibold">{request.senderName}</p>
                          <p className="text-sm text-muted-foreground">{request.senderHandle}</p>
                          <p className="mt-1 text-xs text-muted-foreground">Meta: {request.senderGoal}</p>
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

                  <div className="space-y-3">
                    <h3 className="font-semibold">Solicitacoes enviadas</h3>
                    {!outgoingPendingFriendRequests.length && (
                      <p className="text-sm text-muted-foreground">Nenhuma solicitacao pendente.</p>
                    )}
                    {outgoingPendingFriendRequests.map((request) => (
                      <div key={request.id} className="rounded-lg border border-border/70 bg-card/40 p-3 space-y-3">
                        <div>
                          <p className="font-semibold">{request.receiverName}</p>
                          <p className="text-sm text-muted-foreground">{request.receiverHandle}</p>
                          <p className="mt-1 text-xs text-muted-foreground">Enviado em {formatDateTime(request.createdAt)}</p>
                        </div>
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
                </TabsContent>
              </Tabs>
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
                  <Label htmlFor="clan-admin-member">Administrador do CLA</Label>
                  <select
                    id="clan-admin-member"
                    className="flex h-12 w-full rounded-lg border border-border bg-secondary/50 px-3 text-sm"
                    value={clanAdminMemberId}
                    onChange={(event) => setClanAdminMemberId(event.target.value)}
                  >
                    <option value="self">Voce ({profile.name?.trim() || profileHandle})</option>
                    {socialState.friends.map((friend) => (
                      <option key={friend.id} value={friend.id}>{friend.name}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground">
                    As metas do CLA sao geridas pelo admin definido aqui.
                  </p>
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
                  {selectedGoalClan && (
                    <p className={cn(
                      'text-[11px]',
                      goalClanManagedByCurrentUser ? 'text-muted-foreground' : 'text-amber-600'
                    )}>
                      Admin do CLA: {selectedGoalClan.adminName || 'Nao definido'}.
                      {goalClanManagedByCurrentUser
                        ? ' Voce pode criar e configurar metas.'
                        : ' Somente o admin pode criar metas e automacoes.'}
                    </p>
                  )}
                  <Input value={goalTitle} onChange={(event) => setGoalTitle(event.target.value)} placeholder="Titulo da meta" />
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="number" min="1" value={goalTargetValue} onChange={(event) => setGoalTargetValue(event.target.value)} placeholder="Alvo" />
                    <Input value={goalUnit} onChange={(event) => setGoalUnit(event.target.value)} placeholder="Unidade" />
                  </div>
                  <Input type="date" value={goalDueDate} onChange={(event) => setGoalDueDate(event.target.value)} />
                  <div className="space-y-2 rounded-lg border border-border/70 bg-background/40 p-2">
                    <Label htmlFor="goal-request-text" className="text-xs text-muted-foreground">
                      Solicitar meta ao Personal
                    </Label>
                    <Textarea
                      id="goal-request-text"
                      value={goalRequestText}
                      onChange={(event) => setGoalRequestText(event.target.value)}
                      placeholder="Ex: Quero correr 30 km em 15 dias"
                      className="min-h-[84px]"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      O Personal interpreta sua solicitacao e cria a meta automaticamente.
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      type="submit"
                      variant="outline"
                      className="w-full"
                      disabled={!socialState.clans.length || !goalClanManagedByCurrentUser}
                    >
                      <Target className="h-4 w-4" />
                      Criar meta manual
                    </Button>
                    <Button
                      type="button"
                      variant="energy"
                      className="w-full"
                      disabled={!socialState.clans.length || !goalClanManagedByCurrentUser}
                      onClick={handleCreateGoalWithPersonal}
                    >
                      <Target className="h-4 w-4" />
                      Personal criar meta
                    </Button>
                  </div>
                  <div className="space-y-3 rounded-lg border border-border/70 bg-background/40 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">Metas automaticas</p>
                        <p className="text-[11px] text-muted-foreground">
                          Cria metas diarias e semanais automaticamente para o CLA.
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleSaveAutomaticGoals}
                        disabled={!socialState.clans.length || !goalClanManagedByCurrentUser}
                      >
                        Salvar automacoes
                      </Button>
                    </div>

                    <div className="space-y-2 rounded-md border border-border/70 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="auto-goal-daily-switch" className="text-xs font-medium">
                          Meta diaria automatica
                        </Label>
                        <Switch
                          id="auto-goal-daily-switch"
                          checked={autoDailyGoalEnabled}
                          onCheckedChange={setAutoDailyGoalEnabled}
                          disabled={!socialState.clans.length || !goalClanManagedByCurrentUser}
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <Input
                          value={autoDailyGoalTitle}
                          onChange={(event) => setAutoDailyGoalTitle(event.target.value)}
                          placeholder="Titulo diario"
                          disabled={!socialState.clans.length || !goalClanManagedByCurrentUser || !autoDailyGoalEnabled}
                        />
                        <Input
                          type="number"
                          min="1"
                          value={autoDailyGoalTargetValue}
                          onChange={(event) => setAutoDailyGoalTargetValue(event.target.value)}
                          placeholder="Alvo"
                          disabled={!socialState.clans.length || !goalClanManagedByCurrentUser || !autoDailyGoalEnabled}
                        />
                        <Input
                          value={autoDailyGoalUnit}
                          onChange={(event) => setAutoDailyGoalUnit(event.target.value)}
                          placeholder="Unidade"
                          disabled={!socialState.clans.length || !goalClanManagedByCurrentUser || !autoDailyGoalEnabled}
                        />
                      </div>
                    </div>

                    <div className="space-y-2 rounded-md border border-border/70 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="auto-goal-weekly-switch" className="text-xs font-medium">
                          Meta semanal automatica
                        </Label>
                        <Switch
                          id="auto-goal-weekly-switch"
                          checked={autoWeeklyGoalEnabled}
                          onCheckedChange={setAutoWeeklyGoalEnabled}
                          disabled={!socialState.clans.length || !goalClanManagedByCurrentUser}
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <Input
                          value={autoWeeklyGoalTitle}
                          onChange={(event) => setAutoWeeklyGoalTitle(event.target.value)}
                          placeholder="Titulo semanal"
                          disabled={!socialState.clans.length || !goalClanManagedByCurrentUser || !autoWeeklyGoalEnabled}
                        />
                        <Input
                          type="number"
                          min="1"
                          value={autoWeeklyGoalTargetValue}
                          onChange={(event) => setAutoWeeklyGoalTargetValue(event.target.value)}
                          placeholder="Alvo"
                          disabled={!socialState.clans.length || !goalClanManagedByCurrentUser || !autoWeeklyGoalEnabled}
                        />
                        <Input
                          value={autoWeeklyGoalUnit}
                          onChange={(event) => setAutoWeeklyGoalUnit(event.target.value)}
                          placeholder="Unidade"
                          disabled={!socialState.clans.length || !goalClanManagedByCurrentUser || !autoWeeklyGoalEnabled}
                        />
                      </div>
                    </div>
                  </div>
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
              {socialState.clans.map((clan) => {
                const clanMemberPointMap = sanitizeClanMemberPoints(clan.memberPoints, clan.memberIds);
                const clanScoreEntries = [
                  {
                    memberId: CLAN_SELF_MEMBER_KEY,
                    memberName: profile.name?.trim() || 'Voce',
                    points: clanMemberPointMap[CLAN_SELF_MEMBER_KEY] || 0,
                    isSelf: true,
                  },
                  ...clan.memberIds.map((friendId) => ({
                    memberId: friendId,
                    memberName: friendsById.get(friendId)?.name || 'Integrante',
                    points: clanMemberPointMap[friendId] || 0,
                    isSelf: false,
                  })),
                ].sort((a, b) => {
                  if (b.points !== a.points) return b.points - a.points;
                  return a.memberName.localeCompare(b.memberName);
                });
                const clanTotalPoints = clanScoreEntries.reduce((total, entry) => total + entry.points, 0);

                return (
                <div key={clan.id} className="rounded-lg border border-border/70 bg-card/40 p-3 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{clan.name}</p>
                      <p className="text-xs text-muted-foreground">Criado em {formatDate(clan.createdAt)}</p>
                      <p className="text-xs text-muted-foreground">Admin: {clan.adminName || 'Nao definido'}</p>
                    </div>
                    <div className="space-y-1 text-right">
                      <Badge variant="outline">{clan.memberIds.length} seguindo</Badge>
                      <Badge variant={isCurrentProfileClanAdmin(clan) ? 'default' : 'secondary'}>
                        {isCurrentProfileClanAdmin(clan) ? 'Voce admin' : 'Admin externo'}
                      </Badge>
                    </div>
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
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Pontuacao do CLA</p>
                      <Badge variant={clanTotalPoints >= 0 ? 'default' : 'destructive'}>
                        {clanTotalPoints} pts
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      {clanScoreEntries.map((entry) => (
                        <div
                          key={`${clan.id}-${entry.memberId}`}
                          className="flex items-center justify-between gap-2 rounded-md border border-border/70 p-2"
                        >
                          <p className="text-sm">
                            {entry.memberName}
                            {entry.isSelf ? ' (voce)' : ''}
                          </p>
                          <Badge variant={entry.isSelf ? 'default' : 'outline'}>
                            {entry.points} pts
                          </Badge>
                        </div>
                      ))}
                    </div>
                    {clan.scoreUpdatedAt && (
                      <p className="text-[11px] text-muted-foreground">
                        Atualizado em {formatDateTime(clan.scoreUpdatedAt)}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Metas automaticas</p>
                    {!clan.autoGoalTemplates?.length && (
                      <p className="text-sm text-muted-foreground">Sem configuracao automatica.</p>
                    )}
                    {(clan.autoGoalTemplates || []).map((template) => (
                      <div key={template.id} className="flex items-center justify-between gap-3 rounded-md border border-border/70 p-2">
                        <div className="min-w-0">
                          <p className="line-clamp-1 text-sm font-medium">{template.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {template.frequency === 'daily' ? 'Diaria' : 'Semanal'}: {template.targetValue} {template.unit}
                          </p>
                        </div>
                        <Badge variant={template.enabled ? 'default' : 'outline'}>
                          {template.enabled ? 'Ativa' : 'Inativa'}
                        </Badge>
                      </div>
                    ))}
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
                        <p className="text-xs text-muted-foreground">
                          Prazo: {goal.dueDate ? formatDate(goal.dueDate) : 'Sem prazo'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Pontuacao: +{goal.pointsAwarded ?? calculateGoalAwardPoints(goal.targetValue)} pts se concluir e -{goal.pointsPenalty ?? calculateGoalPenaltyPoints(goal.pointsAwarded ?? calculateGoalAwardPoints(goal.targetValue))} pts se vencer sem cumprir.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary">
                            {goal.goalType === 'auto_daily'
                              ? 'Automatica diaria'
                              : goal.goalType === 'auto_weekly'
                                ? 'Automatica semanal'
                                : goal.createdBy === 'personal'
                                  ? 'Criada pelo Personal'
                                  : 'Criada por voce'}
                          </Badge>
                          {goal.scoredAt && (
                            <Badge variant="outline">Recompensa aplicada</Badge>
                          )}
                          {goal.penalizedAt && (
                            <Badge variant="outline">Penalidade aplicada</Badge>
                          )}
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
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="chat" className="space-y-4">
          <Card className="glass-card overflow-hidden border-border/70">
            <CardContent className="p-0">
              <div className="grid min-h-[680px] md:grid-cols-[340px,1fr]">
                <section
                  className={cn(
                    'flex flex-col border-r border-border/70 bg-card',
                    !isMobile ? 'md:flex' : showChatListOnMobile ? 'flex' : 'hidden md:flex'
                  )}
                >
                  <header className="border-b border-border/70 bg-secondary/75 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-lg font-semibold">FitChat</p>
                        <p className="text-xs text-muted-foreground">Converse com seus contatos da comunidade.</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={handleImportDeviceContacts}
                          disabled={isImportingContacts || !contactPickerSupported}
                          className="rounded-full p-2 text-muted-foreground transition hover:bg-background/70 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                          title="Importar contatos do celular"
                        >
                          {isImportingContacts ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Smartphone className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartChat()}
                          disabled={!socialState.friends.length}
                          className="rounded-full p-2 text-muted-foreground transition hover:bg-background/70 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                          title="Iniciar chat"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </header>

                  <div className="space-y-2 border-b border-border/70 px-3 py-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={chatFriendSearch}
                        onChange={(event) => setChatFriendSearch(event.target.value)}
                        placeholder="Pesquisar contato"
                        className="h-9 rounded-full border-border/70 bg-background/70 pl-9"
                      />
                    </div>
                    {!contactPickerSupported && (
                      <p className="text-[11px] text-muted-foreground">
                        Seu navegador nao permite ler contatos do celular.
                      </p>
                    )}
                    {importedContactsCount > 0 && (
                      <p className="text-[11px] text-primary">
                        {importedContactsCount} contato(s) valido(s) analisado(s).
                      </p>
                    )}
                  </div>

                  {!!matchedPhoneContacts.length && (
                    <div className="border-b border-border/70 px-3 py-2">
                      <p className="text-[11px] font-medium text-primary">Contatos encontrados no SouFit</p>
                      <div className="mt-2 space-y-1.5">
                        {matchedPhoneContacts.slice(0, 3).map((match) => {
                          const normalizedHandle = match.profile.normalizedHandle;
                          const followedFriend = friendsByHandle.get(normalizedHandle);
                          const alreadyFollowing = Boolean(followedFriend);
                          const hasOutgoingRequest = outgoingPendingHandles.has(normalizedHandle);
                          const hasIncomingRequest = incomingPendingHandles.has(normalizedHandle);
                          const isMyOwnProfile = normalizedHandle === normalizedProfileHandle;

                          return (
                            <div
                              key={match.id}
                              className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/50 px-2 py-1.5"
                            >
                              <div className="min-w-0">
                                <p className="line-clamp-1 text-xs font-medium">{match.contactName}</p>
                                <p className="line-clamp-1 text-[11px] text-muted-foreground">{match.profile.handle}</p>
                              </div>
                              {alreadyFollowing && followedFriend ? (
                                <button
                                  type="button"
                                  onClick={() => startChatWithFriend(followedFriend.id)}
                                  className="rounded-full bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground"
                                >
                                  Abrir
                                </button>
                              ) : hasOutgoingRequest ? (
                                <span className="text-[11px] text-muted-foreground">Pendente</span>
                              ) : hasIncomingRequest ? (
                                <span className="text-[11px] text-muted-foreground">Aceite pedido</span>
                              ) : isMyOwnProfile ? (
                                <span className="text-[11px] text-muted-foreground">Voce</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleFollowMatchedContact(match)}
                                  className="rounded-full border border-primary/60 px-2 py-1 text-[11px] font-medium text-primary"
                                >
                                  Seguir
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex-1 overflow-y-auto">
                    {!socialState.friends.length && (
                      <p className="px-4 py-4 text-sm text-muted-foreground">
                        Siga perfis para iniciar o FitChat.
                      </p>
                    )}
                    {!!socialState.friends.length && !chatFriendConversations.length && (
                      <p className="px-4 py-4 text-sm text-muted-foreground">
                        Nenhum contato encontrado com essa busca.
                      </p>
                    )}
                    {chatFriendConversations.map(({ friend, lastMessage, unreadCount }) => {
                      const isPending = friend.id === pendingChatFriendId;
                      const isActive = friend.id === activeChatFriendId;
                      const preview = formatChatPreview(lastMessage);
                      const lastTime = lastMessage ? formatChatListTime(lastMessage.createdAt) : '';
                      const hasConversation = Boolean(lastMessage);
                      const highlightRow = isPending || isActive;

                      return (
                        <div
                          key={friend.id}
                          className={cn(
                            'flex items-start gap-2 px-3 py-2 transition',
                            highlightRow ? 'bg-primary/10' : 'hover:bg-secondary/60'
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => startChatWithFriend(friend.id)}
                            className="flex min-w-0 flex-1 items-start gap-3 text-left"
                          >
                            <img
                              src={resolveFriendAvatarUrl(friend)}
                              alt={`Foto de ${friend.name}`}
                              className="mt-1 h-12 w-12 shrink-0 rounded-full border border-border/70 object-cover bg-secondary"
                              onError={handleAvatarImageError}
                            />
                            <div className="min-w-0 flex-1 border-b border-border/50 pb-2.5 pr-1">
                              <div className="flex items-start justify-between gap-2">
                                <p className="line-clamp-1 text-sm font-semibold">{friend.name}</p>
                                <span className={cn('shrink-0 text-[11px]', unreadCount ? 'text-primary' : 'text-muted-foreground')}>
                                  {lastTime}
                                </span>
                              </div>
                              <div className="mt-1 flex items-center justify-between gap-2">
                                <p className="line-clamp-1 text-xs text-muted-foreground">{preview}</p>
                                {unreadCount > 0 && (
                                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
                                    {unreadCount > 99 ? '99+' : unreadCount}
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteConversationByFriend(friend.id)}
                            disabled={!hasConversation}
                            className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-background/70 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                            title={`Apagar conversa com ${friend.name}`}
                            aria-label={`Apagar conversa com ${friend.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="space-y-2 border-t border-border/70 bg-secondary/45 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="fit-chat-history" className="text-xs text-muted-foreground">
                        Manter historico local
                      </Label>
                      <Switch
                        id="fit-chat-history"
                        checked={keepChatHistory}
                        onCheckedChange={handleToggleKeepChatHistory}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleClearActiveConversation}
                        disabled={!activeChatFriendId}
                        className="rounded-full border border-border/80 bg-card/70 px-3 py-1 text-[11px] text-muted-foreground disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Apagar conversa
                      </button>
                      <button
                        type="button"
                        onClick={handleClearAllChatHistory}
                        disabled={!socialState.chatMessages.length}
                        className="rounded-full border border-border/80 bg-card/70 px-3 py-1 text-[11px] text-muted-foreground disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Limpar tudo
                      </button>
                    </div>
                  </div>
                </section>

                <section
                  className={cn(
                    'flex flex-col bg-card',
                    !isMobile ? 'md:flex' : showChatListOnMobile ? 'hidden md:flex' : 'flex'
                  )}
                >
                  {!!socialState.friends.length && activeChatFriend ? (
                    <>
                      <div className="flex items-center gap-2.5 border-b border-border/70 bg-secondary/75 px-3 py-2.5">
                        {isMobile && (
                          <button
                            type="button"
                            onClick={() => setShowChatListOnMobile(true)}
                            className="rounded-full p-1.5 text-muted-foreground hover:bg-background/70 hover:text-foreground"
                          >
                            <ArrowLeft className="h-4 w-4" />
                          </button>
                        )}
                        <img
                          src={resolveFriendAvatarUrl(activeChatFriend)}
                          alt={`Foto de ${activeChatFriend.name}`}
                          className="h-10 w-10 rounded-full border border-border/70 object-cover bg-secondary"
                          onError={handleAvatarImageError}
                        />
                        <div>
                          <p className="text-sm font-semibold leading-none">{activeChatFriend.name}</p>
                          <p className="mt-1 text-[11px] text-muted-foreground">{activeChatFriend.handle}</p>
                        </div>
                      </div>

                      <div
                        ref={chatMessagesContainerRef}
                        className="flex-1 overflow-y-auto px-3 py-3 md:px-4"
                        style={CHAT_BACKGROUND_STYLE}
                      >
                        {!!activeChatMessages.length && (
                          <div className="mx-auto mb-3 w-fit rounded-full border border-border/70 bg-card/90 px-3 py-1 text-[10px] font-semibold tracking-wide text-muted-foreground">
                            {activeChatDayLabel}
                          </div>
                        )}
                        <div className="mx-auto mb-3 flex w-full max-w-[720px] items-start gap-2 rounded-md border border-border/70 bg-card/85 px-3 py-2 text-[11px] text-muted-foreground shadow-sm">
                          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <p>
                            As mensagens e chamadas desta conversa sao protegidas com criptografia de ponta a ponta.
                          </p>
                        </div>

                        {!activeChatMessages.length && (
                          <p className="px-1 text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>
                        )}

                        <div className="space-y-1.5">
                          {activeChatMessages.map((message) => {
                            const sharedPost = message.postId ? postsById.get(message.postId) : null;
                            const sharedStory = message.storyId ? storiesById.get(message.storyId) : null;
                            const isMine = message.sender === 'me';
                            const receiptStatus = isMine
                              ? getOutgoingMessageStatus(message, activeChatMessages)
                              : null;
                            const isImageAttachment = (message.attachmentType || '').startsWith('image/');
                            const isAudioAttachment = (message.attachmentType || '').startsWith('audio/');
                            return (
                              <div
                                key={message.id}
                                ref={(node) => {
                                  if (node) {
                                    chatMessageElementsRef.current.set(message.id, node);
                                    return;
                                  }
                                  chatMessageElementsRef.current.delete(message.id);
                                }}
                                data-chat-message-id={message.id}
                                className={cn('flex', isMine ? 'justify-end' : 'justify-start')}
                              >
                                <div
                                  className={cn(
                                    'max-w-[85%] rounded-xl px-3 py-2 shadow-sm md:max-w-[72%]',
                                    isMine
                                      ? 'rounded-br-sm border border-primary/35 bg-primary/15 text-foreground'
                                      : 'rounded-bl-sm border border-border/70 bg-card text-foreground',
                                    message.id === highlightedChatMessageId &&
                                      'ring-2 ring-primary/50 ring-offset-2 ring-offset-background'
                                  )}
                                >
                                  <p className="whitespace-pre-wrap break-words text-sm">{message.text}</p>
                                  {!!(message.attachmentName || message.attachmentDataUrl) && (
                                    <div className="mt-2 rounded-md border border-border/70 bg-background/65 p-2">
                                      {isImageAttachment && message.attachmentDataUrl ? (
                                        <img
                                          src={message.attachmentDataUrl}
                                          alt={message.attachmentName || 'Imagem anexada'}
                                          className="max-h-48 w-full rounded-md object-contain bg-secondary/40"
                                        />
                                      ) : isAudioAttachment && message.attachmentDataUrl ? (
                                        <audio controls src={message.attachmentDataUrl} className="w-full">
                                          Seu navegador nao suporta audio HTML5.
                                        </audio>
                                      ) : isAudioAttachment ? (
                                        <p className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                          <Mic className="h-3.5 w-3.5" />
                                          {message.attachmentName || 'Mensagem de voz'}
                                        </p>
                                      ) : message.attachmentDataUrl ? (
                                        <a
                                          href={message.attachmentDataUrl}
                                          download={message.attachmentName || 'arquivo'}
                                          className="inline-flex items-center gap-2 text-xs font-medium text-primary underline-offset-2 hover:underline"
                                        >
                                          <Paperclip className="h-3.5 w-3.5" />
                                          {message.attachmentName || 'Baixar arquivo'}
                                        </a>
                                      ) : (
                                        <p className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                          <Paperclip className="h-3.5 w-3.5" />
                                          {message.attachmentName || 'Arquivo anexado'}
                                        </p>
                                      )}
                                      {!!message.attachmentName && isImageAttachment && (
                                        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                                          {message.attachmentName}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                  {sharedPost && (
                                    <div className="mt-2 rounded-md border border-border/70 bg-background/65 p-2">
                                      <img
                                        src={sharedPost.imageDataUrl}
                                        alt={`Post de ${sharedPost.authorName}`}
                                        className="h-24 w-full rounded-md object-contain bg-secondary/40"
                                      />
                                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{sharedPost.caption}</p>
                                    </div>
                                  )}
                                  {!sharedPost && sharedStory && (
                                    <div className="mt-2 rounded-md border border-border/70 bg-background/65 p-2">
                                      <img
                                        src={sharedStory.imageDataUrl}
                                        alt={`Story de ${sharedStory.authorName}`}
                                        className="h-24 w-full rounded-md object-contain bg-secondary/40"
                                      />
                                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                        Story: {sharedStory.caption || 'Sem legenda'}
                                      </p>
                                    </div>
                                  )}
                                  {!!message.postId && (
                                    <button
                                      type="button"
                                      onClick={() => openChatSharedPostPreview(message.postId)}
                                      className="mt-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
                                    >
                                      Abrir post compartilhado
                                    </button>
                                  )}
                                  {!message.postId && !!message.storyId && (
                                    <button
                                      type="button"
                                      onClick={() => openChatSharedStoryPreview(message.storyId)}
                                      className="mt-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
                                    >
                                      Abrir story compartilhada
                                    </button>
                                  )}
                                  <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteChatMessage(message.id)}
                                      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/80 transition hover:bg-background/70 hover:text-destructive"
                                      title="Excluir mensagem"
                                      aria-label="Excluir mensagem"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                    <span>{formatTime(message.createdAt)}</span>
                                    {isMine && (
                                      <CheckCheck
                                        className={cn(
                                          'h-3.5 w-3.5',
                                          receiptStatus === 'read' ? 'text-primary' : 'text-muted-foreground'
                                        )}
                                        title={receiptStatus === 'read' ? 'Mensagem lida' : 'Mensagem recebida'}
                                      />
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="relative border-t border-border/70 bg-card/95 px-2 py-2 md:px-3">
                        {isEmojiPickerOpen && (
                          <div className="absolute bottom-[3.45rem] left-3 z-20 rounded-xl border border-border/80 bg-card p-2 shadow-lg">
                            <div className="grid grid-cols-8 gap-1">
                              {CHAT_QUICK_EMOJIS.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => handleSelectQuickEmoji(emoji)}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-base transition hover:bg-secondary/70"
                                  title={`Inserir ${emoji}`}
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {(processingChatAttachment || pendingChatAttachment || isRecordingVoice) && (
                          <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-background/80 px-3 py-1.5 text-xs">
                            <span className="line-clamp-1">
                              {isRecordingVoice
                                ? `Gravando audio... ${formatDurationLabel(voiceRecordingSeconds)}`
                                : processingChatAttachment
                                ? 'Preparando anexo...'
                                : pendingChatAttachment
                                  ? `Anexo pronto: ${pendingChatAttachment.name}`
                                  : ''}
                            </span>
                            {!!pendingChatAttachment && !processingChatAttachment && (
                              <button
                                type="button"
                                onClick={handleRemovePendingChatAttachment}
                                className="rounded-full p-1 text-muted-foreground transition hover:bg-secondary/70 hover:text-foreground"
                                title="Remover anexo"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        )}

                        <form className="flex items-center gap-2" onSubmit={handleSendChatMessage}>
                          <div className="flex h-11 flex-1 items-center rounded-full border border-border/80 bg-background/80 px-2 shadow-sm">
                            <button
                              type="button"
                              onClick={() => setIsEmojiPickerOpen((previous) => !previous)}
                              className="rounded-full p-2 text-muted-foreground transition hover:bg-secondary/70 hover:text-foreground"
                              title="Emoji"
                            >
                              <Smile className="h-5 w-5" />
                            </button>
                            <Input
                              value={chatInput}
                              onChange={(event) => setChatInput(event.target.value)}
                              placeholder="Digite aqui..."
                              className="h-auto border-0 bg-transparent px-1 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-0"
                            />
                            <button
                              type="button"
                              onClick={() => chatAttachmentInputRef.current?.click()}
                              className="rounded-full p-2 text-muted-foreground transition hover:bg-secondary/70 hover:text-foreground"
                              title="Anexar"
                            >
                              <Paperclip className="h-4.5 w-4.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => chatCameraInputRef.current?.click()}
                              className="rounded-full p-2 text-muted-foreground transition hover:bg-secondary/70 hover:text-foreground"
                              title="Camera"
                            >
                              <Camera className="h-4.5 w-4.5" />
                            </button>
                          </div>
                          <Button
                            type="button"
                            className={cn(
                              'h-11 w-11 rounded-full p-0',
                              isRecordingVoice && 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                            )}
                            onClick={handlePrimaryChatAction}
                          >
                            {isRecordingVoice ? (
                              <Square className="h-4 w-4" />
                            ) : chatInput.trim() || pendingChatAttachment ? (
                              <Send className="h-4 w-4" />
                            ) : (
                              <Mic className="h-4.5 w-4.5" />
                            )}
                            <span className="sr-only">
                              {isRecordingVoice
                                ? 'Parar gravacao de audio'
                                : chatInput.trim() || pendingChatAttachment
                                  ? 'Enviar mensagem'
                                  : 'Gravar mensagem de voz'}
                            </span>
                          </Button>
                        </form>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground" style={CHAT_BACKGROUND_STYLE}>
                      Escolha um contato para iniciar uma conversa no FitChat.
                    </div>
                  )}
                </section>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="feed" className="social-feed-column space-y-4 md:space-y-5">
          <div className="flex items-center gap-2 px-1">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={feedSearch}
                onChange={(event) => setFeedSearch(event.target.value)}
                placeholder="Buscar posts e usuarios por nome, @usuario ou legenda"
                className="h-10 rounded-full pl-9"
              />
            </div>
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

          {(feedSearchQuery.length >= 2 || isSearchingFeedProfiles) && (
            <div className="space-y-2 rounded-2xl border border-border/80 bg-card/65 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Usuarios
                </p>
                {isSearchingFeedProfiles && (
                  <span className="text-xs text-muted-foreground">Buscando...</span>
                )}
              </div>

              {!isSearchingFeedProfiles && !filteredFeedProfiles.length && (
                <p className="text-xs text-muted-foreground">
                  Nenhum usuario novo encontrado para essa busca.
                </p>
              )}

              {!!filteredFeedProfiles.length && (
                <div className="space-y-1.5">
                  {filteredFeedProfiles.map((candidate) => {
                    const normalizedHandle = candidate.normalizedHandle;
                    const followedFriend = friendsByHandle.get(normalizedHandle);
                    const alreadyFollowing = Boolean(followedFriend);
                    const hasOutgoingRequest = outgoingPendingHandles.has(normalizedHandle);
                    const hasIncomingRequest = incomingPendingHandles.has(normalizedHandle);
                    const isMyOwnProfile = normalizedHandle === normalizedProfileHandle;

                    return (
                      <div
                        key={candidate.normalizedHandle}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/55 px-2 py-1.5"
                      >
                        <div className="min-w-0">
                          <p className="line-clamp-1 text-sm font-medium">{candidate.name}</p>
                          <p className="line-clamp-1 text-xs text-muted-foreground">{candidate.handle}</p>
                        </div>
                        {alreadyFollowing && followedFriend ? (
                          <button
                            type="button"
                            onClick={() => startChatWithFriend(followedFriend.id)}
                            className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground"
                          >
                            Abrir
                          </button>
                        ) : hasOutgoingRequest ? (
                          <span className="text-[11px] text-muted-foreground">Pendente</span>
                        ) : hasIncomingRequest ? (
                          <span className="text-[11px] text-muted-foreground">Aceite pedido</span>
                        ) : isMyOwnProfile ? (
                          <span className="text-[11px] text-muted-foreground">Voce</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              void requestFollowByHandle(candidate.handle, {
                                preferredName: candidate.name,
                                preferredGoal: candidate.goal,
                              })
                            }
                            className="rounded-full border border-primary/60 px-2.5 py-1 text-[11px] font-medium text-primary"
                          >
                            Seguir
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

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

              {storyGroups.map((group) => (
                <button
                  key={group.authorHandle}
                  type="button"
                  onClick={() => openStoryGroup(group.authorHandle)}
                  className="flex w-[74px] shrink-0 flex-col items-center gap-1 text-center"
                >
                  <div className="social-story-ring">
                    <div className="relative">
                      <img
                        src={group.previewImageDataUrl}
                        alt={`Story de ${group.authorName}`}
                        className="h-16 w-16 rounded-full border-2 border-background object-cover"
                      />
                      {group.stories.length > 1 && (
                        <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                          {group.stories.length}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="line-clamp-1 text-[11px]">
                    {group.authorName.split(' ')[0]}
                  </span>
                </button>
              ))}
            </div>
            {!storyGroups.length && (
              <p className="mt-2 text-xs text-muted-foreground">Sem stories nas ultimas 24h.</p>
            )}
          </div>

          {!visibleFeedPosts.length && (
            <div className="rounded-2xl border border-border/80 bg-card/65 p-4">
              <p className="text-sm text-muted-foreground">Ainda nao ha posts no feed.</p>
            </div>
          )}

          {!!visibleFeedPosts.length && !filteredFeedPosts.length && (
            <div className="rounded-2xl border border-border/80 bg-card/65 p-4">
              <p className="text-sm text-muted-foreground">
                Nenhum post encontrado para essa busca.
              </p>
            </div>
          )}

          <div className="space-y-4">
            {filteredFeedPosts.map((post) => {
              const likedByMe = post.likedByHandles.some(
                (handle) => normalizeHandle(handle) === normalizedProfileHandle
              );
              const postOwnedByMe =
                normalizeHandle(post.authorHandle || post.authorName) === normalizedProfileHandle;
              const topLevelComments = post.comments.filter((comment) => !comment.parentCommentId);
              const repliesCount = Math.max(0, post.comments.length - topLevelComments.length);

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
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="hidden md:inline-flex">
                        {post.sharedCount} compartilhamentos
                      </Badge>
                      {postOwnedByMe && (
                        <>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 rounded-full"
                            onClick={() => openEditPostDialog(post)}
                          >
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">Editar post</span>
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 rounded-full text-destructive hover:text-destructive"
                            onClick={() => handleDeletePost(post.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Excluir post</span>
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="w-full bg-secondary/45">
                    <img
                      src={post.imageDataUrl}
                      alt={`Post de ${post.authorName}`}
                      className="max-h-[72vh] w-full object-contain"
                    />
                  </div>

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
                        {topLevelComments.length} comentario(s){repliesCount ? ` e ${repliesCount} resposta(s)` : ''}
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
                      {topLevelComments.map((comment) => {
                        const likedCommentByMe = comment.likedByHandles.some(
                          (handle) => normalizeHandle(handle) === normalizedProfileHandle
                        );
                        const replyComments = post.comments.filter(
                          (candidate) => candidate.parentCommentId === comment.id
                        );
                        const isCommentReplyOpen = openReplyComposerByPostId[post.id] === comment.id;

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

                            <div className="mt-1 flex items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 rounded-full px-2 text-[11px]"
                                onClick={() => handleOpenReplyComposer(post.id, comment.id)}
                              >
                                Responder
                              </Button>
                            </div>

                            {isCommentReplyOpen && (
                              <form
                                className="mt-2 flex items-center gap-2"
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  handleAddPostComment(post.id, comment.id);
                                }}
                              >
                                <Input
                                  value={replyCommentInputs[comment.id] || ''}
                                  onChange={(event) =>
                                    setReplyCommentInputs((previous) => ({
                                      ...previous,
                                      [comment.id]: event.target.value,
                                    }))
                                  }
                                  placeholder={`Responder ${comment.authorName}...`}
                                  className="h-8 rounded-full bg-secondary/65 text-xs"
                                />
                                <Button
                                  type="submit"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 rounded-full px-2"
                                  disabled={!(replyCommentInputs[comment.id] || '').trim()}
                                >
                                  <Send className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 rounded-full px-2 text-xs"
                                  onClick={() => handleCloseReplyComposer(post.id)}
                                >
                                  Cancelar
                                </Button>
                              </form>
                            )}

                            {!!replyComments.length && (
                              <div className="mt-2 space-y-2 border-l border-border/70 pl-3">
                                {replyComments.map((reply) => {
                                  const likedReplyByMe = reply.likedByHandles.some(
                                    (handle) => normalizeHandle(handle) === normalizedProfileHandle
                                  );
                                  const isReplyComposerOpen = openReplyComposerByPostId[post.id] === reply.id;

                                  return (
                                    <div key={reply.id} className="rounded-md border border-border/60 bg-background/55 p-2">
                                      <div className="flex items-start justify-between gap-2">
                                        <div>
                                          <p className="text-xs font-semibold">
                                            {reply.authorName}{' '}
                                            <span className="text-muted-foreground">{reply.authorHandle}</span>
                                          </p>
                                          <p className="text-sm">{reply.text}</p>
                                          <p className="text-[11px] text-muted-foreground">
                                            {formatDateTime(reply.createdAt)}
                                          </p>
                                        </div>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant={likedReplyByMe ? 'default' : 'ghost'}
                                          className="h-7 min-w-7 rounded-full px-2"
                                          onClick={() => handleLikeComment(post.id, reply.id)}
                                        >
                                          <Heart className="h-3.5 w-3.5" />
                                          {reply.likes}
                                        </Button>
                                      </div>

                                      <div className="mt-1">
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 rounded-full px-2 text-[11px]"
                                          onClick={() => handleOpenReplyComposer(post.id, reply.id)}
                                        >
                                          Responder
                                        </Button>
                                      </div>

                                      {isReplyComposerOpen && (
                                        <form
                                          className="mt-2 flex items-center gap-2"
                                          onSubmit={(event) => {
                                            event.preventDefault();
                                            handleAddPostComment(post.id, reply.id);
                                          }}
                                        >
                                          <Input
                                            value={replyCommentInputs[reply.id] || ''}
                                            onChange={(event) =>
                                              setReplyCommentInputs((previous) => ({
                                                ...previous,
                                                [reply.id]: event.target.value,
                                              }))
                                            }
                                            placeholder={`Responder ${reply.authorName}...`}
                                            className="h-8 rounded-full bg-secondary/65 text-xs"
                                          />
                                          <Button
                                            type="submit"
                                            size="sm"
                                            variant="outline"
                                            className="h-8 rounded-full px-2"
                                            disabled={!(replyCommentInputs[reply.id] || '').trim()}
                                          >
                                            <Send className="h-3.5 w-3.5" />
                                          </Button>
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            className="h-8 rounded-full px-2 text-xs"
                                            onClick={() => handleCloseReplyComposer(post.id)}
                                          >
                                            Cancelar
                                          </Button>
                                        </form>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
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
            <CardContent className="flex flex-wrap gap-2 items-center">
              <Button
                type="button"
                variant="outline"
                onClick={handleEnableBrowserNotifications}
                disabled={isRegisteringPush}
              >
                {isRegisteringPush ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Ativando...
                  </>
                ) : (
                  <>
                    <Bell className="h-4 w-4" />
                    Ativar notificacoes do FitChat
                  </>
                )}
              </Button>
              <Button type="button" variant="outline" onClick={handleMarkAllNotificationsAsRead}>
                <CheckCircle2 className="h-4 w-4" />
                Marcar todas como lidas
              </Button>
              <Button type="button" variant="outline" onClick={handleClearNotifications}>
                <Trash2 className="h-4 w-4" />
                Limpar notificacoes
              </Button>
              <p className="text-xs text-muted-foreground">
                {pushNotificationsReady
                  ? 'Push ativo neste dispositivo.'
                  : 'Push ainda nao ativado neste dispositivo.'}
              </p>
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
                  onClick={() => handleOpenNotification(notification)}
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

      <Dialog
        open={isFriendProfileDialogOpen}
        onOpenChange={(open) => (open ? setIsFriendProfileDialogOpen(true) : closeFriendProfileDialog())}
      >
        <DialogContent className="max-w-2xl">
          {activeFriendProfile && displayedFriendProfileSummary && (
            <div className="space-y-4">
              <DialogHeader className="text-left">
                <DialogTitle>Perfil do amigo</DialogTitle>
                <DialogDescription>
                  Dados de {displayedFriendProfileSummary.name} e fotos publicadas no feed.
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <img
                  src={resolveFriendAvatarUrl(activeFriendProfile)}
                  alt={`Foto de ${displayedFriendProfileSummary.name}`}
                  className="h-20 w-20 rounded-full border border-border/70 object-cover bg-secondary"
                  onError={handleAvatarImageError}
                />
                <div className="min-w-0">
                  <p className="line-clamp-1 text-lg font-semibold">{displayedFriendProfileSummary.name}</p>
                  <p className="line-clamp-1 text-sm text-muted-foreground">{displayedFriendProfileSummary.handle}</p>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-border/70 bg-card/40 p-3">
                  <p className="text-xs text-muted-foreground">Nome</p>
                  <p className="line-clamp-1 text-sm font-semibold">{displayedFriendProfileSummary.name}</p>
                </div>
                <div className="rounded-lg border border-border/70 bg-card/40 p-3">
                  <p className="text-xs text-muted-foreground">Meta</p>
                  <p className="line-clamp-1 text-sm font-semibold">{displayedFriendProfileSummary.goal}</p>
                </div>
                <div className="rounded-lg border border-border/70 bg-card/40 p-3">
                  <p className="text-xs text-muted-foreground">Pontuacao</p>
                  <p className="line-clamp-1 text-sm font-semibold">
                    {isFriendProfileSummaryLoading
                      ? 'Carregando...'
                      : displayedFriendProfileSummary.points === null
                        ? 'Indisponivel'
                        : `${displayedFriendProfileSummary.points} pontos`}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold">
                  Fotos do feed ({activeFriendFeedPosts.length})
                </p>
                {!activeFriendFeedPosts.length && (
                  <p className="text-sm text-muted-foreground">
                    Esse perfil ainda nao publicou fotos no feed.
                  </p>
                )}
                {!!activeFriendFeedPosts.length && (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {activeFriendFeedPosts.map((post) => (
                      <img
                        key={post.id}
                        src={post.imageDataUrl}
                        alt={`Foto de ${displayedFriendProfileSummary.name}`}
                        className="aspect-square w-full rounded-md border border-border/70 bg-background/65 object-cover"
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={closeFriendProfileDialog}>
                  Fechar
                </Button>
                <Button
                  type="button"
                  variant="energy"
                  onClick={() => {
                    startChatWithFriend(activeFriendProfile.id);
                    closeFriendProfileDialog();
                  }}
                >
                  Abrir chat
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(chatSharedPreviewItem)}
        onOpenChange={(open) => !open && closeChatSharedPreview()}
      >
        <DialogContent className="max-w-md overflow-hidden p-0">
          {chatSharedPreviewItem && (
            <>
              <div className="w-full bg-secondary/45">
                <img
                  src={chatSharedPreviewItem.imageDataUrl}
                  alt={`${chatSharedPreviewPost ? 'Post' : 'Story'} de ${chatSharedPreviewItem.authorName}`}
                  className="max-h-[72vh] w-full object-contain"
                />
              </div>
              <div className="space-y-3 p-4">
                <DialogHeader className="space-y-1 text-left">
                  <DialogTitle>{chatSharedPreviewPost ? 'Post compartilhado' : 'Story compartilhada'}</DialogTitle>
                  <DialogDescription>
                    {chatSharedPreviewItem.authorName} • {formatDateTime(chatSharedPreviewItem.createdAt)}
                  </DialogDescription>
                </DialogHeader>
                <p className="text-sm">
                  {chatSharedPreviewItem.caption || (chatSharedPreviewPost ? 'Post sem legenda.' : 'Story sem legenda.')}
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={closeChatSharedPreview}>
                    Fechar
                  </Button>
                  <Button type="button" variant="energy" className="flex-1" onClick={handleOpenSharedOrigin}>
                    {chatSharedPreviewPost ? 'Ir para Feed' : 'Abrir Story'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

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
                className="h-64 w-full rounded-lg border border-border/70 bg-background/70 object-contain"
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

      <Dialog
        open={isEditContentDialogOpen}
        onOpenChange={(open) => (open ? setIsEditContentDialogOpen(true) : closeEditContentDialog())}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPostId ? 'Editar post' : 'Editar story'}</DialogTitle>
            <DialogDescription>
              {editingPostId
                ? 'Atualize a legenda do seu post.'
                : 'Atualize a legenda da sua story (opcional).'}
            </DialogDescription>
          </DialogHeader>

          {!editingContentTarget && (
            <p className="text-sm text-muted-foreground">Conteudo nao encontrado.</p>
          )}
          {editingContentTarget && (
            <div className="space-y-3">
              <img
                src={editingContentTarget.imageDataUrl}
                alt="Pre-visualizacao do conteudo"
                className="h-56 w-full rounded-lg border border-border/70 bg-background/70 object-contain"
              />
              <Textarea
                value={editingContentCaption}
                onChange={(event) => setEditingContentCaption(event.target.value)}
                placeholder={editingPostId ? 'Legenda do post' : 'Legenda da story (opcional)'}
              />
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={closeEditContentDialog}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="energy"
                  className="flex-1"
                  onClick={handleSaveEditedContent}
                  disabled={Boolean(editingPostId) && !editingContentCaption.trim()}
                >
                  Salvar alteracoes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(activeStory)} onOpenChange={(open) => !open && closeActiveStoryDialog()}>
        <DialogContent className="max-w-sm overflow-hidden p-0">
          {activeStory && (
            <div className="relative">
              <img
                src={activeStory.imageDataUrl}
                alt={`Story de ${activeStory.authorName}`}
                className="h-[72vh] w-full bg-black/55 object-contain"
              />

              {canMoveToPreviousStory && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="absolute left-2 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full bg-black/35 text-white hover:bg-black/55"
                  onClick={() => handleMoveStoryWithinGroup(-1)}
                >
                  <ChevronLeft className="h-5 w-5" />
                  <span className="sr-only">Story anterior</span>
                </Button>
              )}
              {canMoveToNextStory && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="absolute right-2 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full bg-black/35 text-white hover:bg-black/55"
                  onClick={() => handleMoveStoryWithinGroup(1)}
                >
                  <ChevronRight className="h-5 w-5" />
                  <span className="sr-only">Proxima story</span>
                </Button>
              )}

              <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/80 to-transparent p-4 text-white space-y-2">
                {activeStoryGroup && activeStoryGroup.stories.length > 1 && (
                  <div className="flex gap-1">
                    {activeStoryGroup.stories.map((story, index) => (
                      <span
                        key={story.id}
                        className={cn(
                          'h-1 flex-1 rounded-full',
                          index <= activeStoryIndex ? 'bg-white' : 'bg-white/35'
                        )}
                      />
                    ))}
                  </div>
                )}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{activeStory.authorName}</p>
                    <p className="text-xs">{formatDateTime(activeStory.createdAt)}</p>
                  </div>
                  {activeStoryGroup && activeStoryGroup.stories.length > 1 && (
                    <p className="text-[11px] text-slate-200">
                      {activeStoryIndex + 1}/{activeStoryGroup.stories.length}
                    </p>
                  )}
                </div>
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-4 text-white space-y-3">
                {!!activeStory.caption && (
                  <p className="text-sm">{activeStory.caption}</p>
                )}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
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
                    {isActiveStoryOwnedByMe && (
                      <>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-8 w-8 border-white/40 bg-black/30 text-white hover:bg-black/45"
                          onClick={() => openEditStoryDialog(activeStory, true)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span className="sr-only">Editar story</span>
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-8 w-8 border-white/40 bg-black/30 text-white hover:bg-black/45"
                          onClick={() => handleDeleteStory(activeStory.id, true)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span className="sr-only">Excluir story</span>
                        </Button>
                      </>
                    )}
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
