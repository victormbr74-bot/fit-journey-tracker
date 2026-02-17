export type SocialNotificationType = 'friend' | 'clan' | 'goal' | 'challenge' | 'post' | 'chat' | 'system';
export type SocialSection = 'search' | 'friends' | 'clans' | 'chat' | 'feed' | 'notifications';

export interface SocialFriend {
  id: string;
  profileId?: string;
  name: string;
  handle: string;
  goal: string;
  addedAt: string;
  avatarUrl?: string;
}

export interface SocialFriendRequest {
  id: string;
  senderProfileId: string;
  senderName: string;
  senderHandle: string;
  senderGoal: string;
  receiverProfileId?: string;
  receiverName: string;
  receiverHandle: string;
  receiverGoal: string;
  status: 'pending' | 'accepted' | 'rejected' | 'canceled';
  createdAt: string;
  respondedAt?: string;
}

export interface SocialClanGoal {
  id: string;
  title: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  dueDate: string;
  completed: boolean;
  pointsAwarded?: number;
  pointsPenalty?: number;
  scoredAt?: string;
  penalizedAt?: string;
  createdBy?: 'user' | 'personal';
  requestText?: string;
  goalType?: 'manual' | 'personal' | 'auto_daily' | 'auto_weekly';
  autoTemplateId?: string;
  autoPeriodKey?: string;
}

export interface SocialClanChallenge {
  id: string;
  title: string;
  description: string;
  points: number;
  dueDate: string;
  completed: boolean;
}

export interface SocialClanAutoGoalTemplate {
  id: string;
  title: string;
  targetValue: number;
  unit: string;
  frequency: 'daily' | 'weekly';
  enabled: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface SocialClan {
  id: string;
  name: string;
  description: string;
  memberIds: string[];
  adminProfileId?: string;
  adminHandle?: string;
  adminName?: string;
  adminFriendId?: string;
  adminDefinedAt?: string;
  createdAt: string;
  goals: SocialClanGoal[];
  challenges: SocialClanChallenge[];
  autoGoalTemplates?: SocialClanAutoGoalTemplate[];
  memberPoints?: Record<string, number>;
  scoreUpdatedAt?: string;
}

export interface SocialFeedPost {
  id: string;
  authorName: string;
  authorHandle: string;
  caption: string;
  imageDataUrl: string;
  createdAt: string;
  likes: number;
  likedByHandles: string[];
  sharedCount: number;
  comments: SocialPostComment[];
}

export interface SocialStory {
  id: string;
  authorName: string;
  authorHandle: string;
  caption: string;
  imageDataUrl: string;
  createdAt: string;
  expiresAt: string;
  likes: number;
  likedByHandles: string[];
  sharedCount: number;
}

export interface SocialPostComment {
  id: string;
  authorName: string;
  authorHandle: string;
  text: string;
  createdAt: string;
  likes: number;
  likedByHandles: string[];
  parentCommentId?: string;
}

export interface SocialNotification {
  id: string;
  type: SocialNotificationType;
  title: string;
  description: string;
  createdAt: string;
  read: boolean;
}

export interface SocialChatMessage {
  id: string;
  friendId: string;
  sender: 'me' | 'friend';
  text: string;
  createdAt: string;
  postId?: string;
  storyId?: string;
  attachmentName?: string;
  attachmentType?: string;
  attachmentDataUrl?: string;
  externalEventId?: string;
}

export interface SocialGlobalChatEvent {
  id: string;
  senderProfileId: string;
  senderName: string;
  senderHandle: string;
  receiverHandle: string;
  text: string;
  createdAt: string;
  postId?: string;
  storyId?: string;
  attachmentName?: string;
  attachmentType?: string;
  attachmentDataUrl?: string;
}

export interface SocialState {
  friends: SocialFriend[];
  clans: SocialClan[];
  posts: SocialFeedPost[];
  chatMessages: SocialChatMessage[];
  notifications: SocialNotification[];
}
