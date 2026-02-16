export type SocialNotificationType = 'friend' | 'clan' | 'goal' | 'challenge' | 'post' | 'chat' | 'system';
export type SocialSection = 'friends' | 'clans' | 'chat' | 'feed' | 'notifications';

export interface SocialFriend {
  id: string;
  name: string;
  handle: string;
  goal: string;
  addedAt: string;
}

export interface SocialFriendRequest {
  id: string;
  senderProfileId: string;
  senderName: string;
  senderHandle: string;
  senderGoal: string;
  receiverName: string;
  receiverHandle: string;
  receiverGoal: string;
  status: 'pending' | 'accepted' | 'rejected';
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
}

export interface SocialClanChallenge {
  id: string;
  title: string;
  description: string;
  points: number;
  dueDate: string;
  completed: boolean;
}

export interface SocialClan {
  id: string;
  name: string;
  description: string;
  memberIds: string[];
  createdAt: string;
  goals: SocialClanGoal[];
  challenges: SocialClanChallenge[];
}

export interface SocialFeedPost {
  id: string;
  authorName: string;
  authorHandle: string;
  caption: string;
  imageDataUrl: string;
  createdAt: string;
  likes: number;
  sharedCount: number;
}

export interface SocialStory {
  id: string;
  authorName: string;
  authorHandle: string;
  caption: string;
  imageDataUrl: string;
  createdAt: string;
  expiresAt: string;
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
}

export interface SocialState {
  friends: SocialFriend[];
  clans: SocialClan[];
  posts: SocialFeedPost[];
  chatMessages: SocialChatMessage[];
  notifications: SocialNotification[];
}
