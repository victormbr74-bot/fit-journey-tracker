import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { GOALS, MUSCLE_GROUPS } from '@/types/user';
import {
  Calendar,
  Camera,
  Clock,
  Dumbbell,
  Images,
  MessageSquareText,
  Play,
  Ruler,
  Scale,
  Target,
  Trophy,
  TrendingUp,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { MusicPlayer } from '@/components/workout/MusicPlayer';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { EditProfileModal } from './EditProfileModal';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  SOCIAL_GLOBAL_FEED_STORAGE_KEY,
  SOCIAL_GLOBAL_STORIES_STORAGE_KEY,
  SOCIAL_HUB_STORAGE_PREFIX,
  SOCIAL_PROFILE_STORAGE_PREFIX,
} from '@/lib/storageKeys';
import { normalizeHandle, toHandle } from '@/lib/handleUtils';
import { SocialFeedPost, SocialState, SocialStory } from '@/types/social';

interface ProfileSocialInfo {
  phrase: string;
  message: string;
  profilePhotoDataUrl: string;
}

const EMPTY_PROFILE_SOCIAL: ProfileSocialInfo = {
  phrase: '',
  message: '',
  profilePhotoDataUrl: '',
};

const MAX_IMAGE_SIZE = 1080;
const GLOBAL_FEED_POST_LIMIT = 500;
const GLOBAL_STORY_LIMIT = 500;
const STORY_DURATION_HOURS = 24;

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const formatDateTime = (isoDate: string) => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR');
};
const isStoryActive = (story: SocialStory) => new Date(story.expiresAt).getTime() > Date.now();

const sanitizeStories = (stories: SocialStory[]) =>
  stories
    .filter((story) => story?.id && story.imageDataUrl && isStoryActive(story))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, GLOBAL_STORY_LIMIT);

const sanitizePosts = (posts: SocialFeedPost[]) =>
  posts
    .filter((post) => post?.id && post.imageDataUrl && post.authorHandle)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, GLOBAL_FEED_POST_LIMIT);

const parsePosts = (value: string | null) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as SocialFeedPost[];
    return Array.isArray(parsed) ? sanitizePosts(parsed) : [];
  } catch {
    return [];
  }
};

const parseStories = (value: string | null) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as SocialStory[];
    return Array.isArray(parsed) ? sanitizeStories(parsed) : [];
  } catch {
    return [];
  }
};

const parseProfileSocial = (value: string | null): ProfileSocialInfo => {
  if (!value) return EMPTY_PROFILE_SOCIAL;
  try {
    const parsed = JSON.parse(value) as Partial<ProfileSocialInfo>;
    return {
      phrase: (parsed.phrase?.toString() || (parsed as { bio?: string }).bio || '').toString(),
      message: parsed.message?.toString() || '',
      profilePhotoDataUrl: parsed.profilePhotoDataUrl?.toString() || '',
    };
  } catch {
    return EMPTY_PROFILE_SOCIAL;
  }
};

const parseFollowingCount = (value: string | null) => {
  if (!value) return 0;
  try {
    const parsed = JSON.parse(value) as Partial<SocialState>;
    return Array.isArray(parsed.friends) ? parsed.friends.length : 0;
  } catch {
    return 0;
  }
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

export function ProfilePage() {
  const { profile, runSessions, loading } = useProfile();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const [globalPosts, setGlobalPosts] = useState<SocialFeedPost[]>([]);
  const [globalStories, setGlobalStories] = useState<SocialStory[]>([]);
  const [followingCount, setFollowingCount] = useState(0);
  const [phrase, setPhrase] = useState('');
  const [message, setMessage] = useState('');
  const [profilePhotoDataUrl, setProfilePhotoDataUrl] = useState('');
  const [photoCaption, setPhotoCaption] = useState('');
  const [storyCaption, setStoryCaption] = useState('');
  const [activeStoryId, setActiveStoryId] = useState('');
  const [publishingMode, setPublishingMode] = useState<'post' | 'story' | null>(null);
  const [socialMediaLoaded, setSocialMediaLoaded] = useState(false);

  const profilePhotoInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const storyInputRef = useRef<HTMLInputElement | null>(null);

  const profileHandle = useMemo(
    () => profile?.handle || toHandle(profile?.name || profile?.email || 'fit.user'),
    [profile?.email, profile?.handle, profile?.name]
  );
  const normalizedProfileHandle = useMemo(() => normalizeHandle(profileHandle), [profileHandle]);
  const socialHubStorageKey = useMemo(
    () => (profile ? `${SOCIAL_HUB_STORAGE_PREFIX}${profile.id}` : ''),
    [profile]
  );
  const socialProfileStorageKey = useMemo(
    () => (profile ? `${SOCIAL_PROFILE_STORAGE_PREFIX}${profile.id}` : ''),
    [profile]
  );

  useEffect(() => {
    if (!profile) {
      setSocialMediaLoaded(false);
      return;
    }

    setGlobalPosts(parsePosts(window.localStorage.getItem(SOCIAL_GLOBAL_FEED_STORAGE_KEY)));
    setGlobalStories(parseStories(window.localStorage.getItem(SOCIAL_GLOBAL_STORIES_STORAGE_KEY)));
    setFollowingCount(parseFollowingCount(window.localStorage.getItem(socialHubStorageKey)));

    const socialInfo = parseProfileSocial(window.localStorage.getItem(socialProfileStorageKey));
    setPhrase(socialInfo.phrase);
    setMessage(socialInfo.message);
    setProfilePhotoDataUrl(socialInfo.profilePhotoDataUrl);
    setSocialMediaLoaded(true);
  }, [profile, socialHubStorageKey, socialProfileStorageKey]);

  useEffect(() => {
    if (!profile) return;

    const handleStorage = (event: StorageEvent) => {
      if (event.key === SOCIAL_GLOBAL_FEED_STORAGE_KEY) {
        setGlobalPosts(parsePosts(event.newValue));
      }
      if (event.key === SOCIAL_GLOBAL_STORIES_STORAGE_KEY) {
        setGlobalStories(parseStories(event.newValue));
      }
      if (event.key === socialHubStorageKey) {
        setFollowingCount(parseFollowingCount(event.newValue));
      }
      if (event.key === socialProfileStorageKey) {
        const socialInfo = parseProfileSocial(event.newValue);
        setPhrase(socialInfo.phrase);
        setMessage(socialInfo.message);
        setProfilePhotoDataUrl(socialInfo.profilePhotoDataUrl);
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [profile, socialHubStorageKey, socialProfileStorageKey]);

  useEffect(() => {
    if (!socialMediaLoaded) return;
    window.localStorage.setItem(
      SOCIAL_GLOBAL_FEED_STORAGE_KEY,
      JSON.stringify(globalPosts.slice(0, GLOBAL_FEED_POST_LIMIT))
    );
  }, [globalPosts, socialMediaLoaded]);

  useEffect(() => {
    if (!socialMediaLoaded) return;
    window.localStorage.setItem(
      SOCIAL_GLOBAL_STORIES_STORAGE_KEY,
      JSON.stringify(sanitizeStories(globalStories))
    );
  }, [globalStories, socialMediaLoaded]);

  const myPosts = useMemo(
    () =>
      globalPosts.filter(
        (post) => normalizeHandle(post.authorHandle) === normalizedProfileHandle
      ),
    [globalPosts, normalizedProfileHandle]
  );

  const myStories = useMemo(
    () =>
      sanitizeStories(globalStories).filter(
        (story) => normalizeHandle(story.authorHandle) === normalizedProfileHandle
      ),
    [globalStories, normalizedProfileHandle]
  );

  const activeStory = useMemo(
    () => myStories.find((story) => story.id === activeStoryId) ?? null,
    [myStories, activeStoryId]
  );

  useEffect(() => {
    if (!activeStoryId) return;
    if (!myStories.some((story) => story.id === activeStoryId)) {
      setActiveStoryId('');
    }
  }, [activeStoryId, myStories]);

  if (loading) {
    return (
      <div className="pb-24 md:pb-8 space-y-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!profile) return null;

  const goalInfo = GOALS.find((g) => g.id === profile.goal);
  const totalDistance = runSessions.reduce((acc, run) => acc + run.distance, 0);
  const totalTime = runSessions.reduce((acc, run) => acc + run.duration, 0);

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}min`;
    }
    return `${minutes}min`;
  };

  const selectedMuscleLabels =
    profile.muscle_groups
      ?.map((id) => MUSCLE_GROUPS.find((m) => m.id === id)?.label)
      .filter(Boolean)
      .join(', ') || 'Nao definido';

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  const saveSocialProfile = (overrides?: Partial<ProfileSocialInfo>, showToast = true) => {
    const payload: ProfileSocialInfo = {
      phrase: (overrides?.phrase ?? phrase).trim(),
      message: (overrides?.message ?? message).trim(),
      profilePhotoDataUrl: overrides?.profilePhotoDataUrl ?? profilePhotoDataUrl,
    };
    window.localStorage.setItem(socialProfileStorageKey, JSON.stringify(payload));
    if (showToast) {
      toast.success('Perfil social atualizado.');
    }
  };

  const handleProfilePhotoSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Selecione uma imagem valida para a foto de perfil.');
      return;
    }

    try {
      const imageDataUrl = await convertImageToDataUrl(file);
      setProfilePhotoDataUrl(imageDataUrl);
      saveSocialProfile({ profilePhotoDataUrl: imageDataUrl }, false);
      toast.success('Foto de perfil atualizada.');
    } catch (error) {
      console.error('Erro ao atualizar foto de perfil:', error);
      toast.error('Nao foi possivel atualizar a foto de perfil.');
    }
  };

  const publishProfileMedia = async (file: File, mode: 'post' | 'story') => {
    if (!file.type.startsWith('image/')) {
      toast.error('Selecione uma imagem valida.');
      return;
    }

    setPublishingMode(mode);
    try {
      const imageDataUrl = await convertImageToDataUrl(file);
      const now = new Date();

      if (mode === 'post') {
        const nextPost: SocialFeedPost = {
          id: createId(),
          authorName: profile.name,
          authorHandle: profileHandle,
          caption: photoCaption.trim() || 'Novo registro no perfil.',
          imageDataUrl,
          createdAt: now.toISOString(),
          likes: 0,
          likedByHandles: [],
          sharedCount: 0,
          comments: [],
        };

        setGlobalPosts((previous) => sanitizePosts([nextPost, ...previous]));
        setPhotoCaption('');
        toast.success('Foto adicionada ao seu perfil.');
        return;
      }

      const expiresAt = new Date(now.getTime() + STORY_DURATION_HOURS * 60 * 60 * 1000);
      const nextStory: SocialStory = {
        id: createId(),
        authorName: profile.name,
        authorHandle: profileHandle,
        caption: storyCaption.trim(),
        imageDataUrl,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        likes: 0,
        likedByHandles: [],
        sharedCount: 0,
      };

      setGlobalStories((previous) => sanitizeStories([nextStory, ...previous]));
      setStoryCaption('');
      setActiveStoryId(nextStory.id);
      toast.success('Story publicada no seu perfil.');
    } catch (error) {
      console.error('Erro ao publicar no perfil:', error);
      toast.error('Nao foi possivel publicar a imagem.');
    } finally {
      setPublishingMode(null);
    }
  };

  const handlePhotoSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await publishProfileMedia(file, 'post');
  };

  const handleStorySelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await publishProfileMedia(file, 'story');
  };

  return (
    <div className="pb-24 md:pb-8">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">
          <span className="gradient-text">Perfil</span>
        </h1>
        <p className="text-muted-foreground mt-1">Seu espaco pessoal e social no FitTrack</p>
      </div>

      <div className="glass-card mb-6 overflow-hidden border border-border/70">
        <div className="bg-gradient-to-r from-orange-300/20 via-rose-300/15 to-amber-300/20 p-6">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-gradient-to-br from-orange-400 via-rose-400 to-amber-400 p-1">
                {profilePhotoDataUrl ? (
                  <img
                    src={profilePhotoDataUrl}
                    alt={`Foto de perfil de ${profile.name}`}
                    className="h-20 w-20 rounded-full border border-border/50 bg-background object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-background text-2xl font-bold">
                    {profile.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div>
                <h2 className="text-2xl font-bold leading-none">{profile.name}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{profileHandle}</p>
                <p className="text-xs text-muted-foreground">{profile.email}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => profilePhotoInputRef.current?.click()}
                >
                  <Camera className="h-4 w-4" />
                  Alterar foto de perfil
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border border-border/60 bg-background/70 px-3 py-2">
                <p className="text-lg font-bold">{myPosts.length}</p>
                <p className="text-xs text-muted-foreground">Posts</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/70 px-3 py-2">
                <p className="text-lg font-bold">{myStories.length}</p>
                <p className="text-xs text-muted-foreground">Stories</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/70 px-3 py-2">
                <p className="text-lg font-bold">{followingCount}</p>
                <p className="text-xs text-muted-foreground">Seguindo</p>
              </div>
            </div>
          </div>

          {(phrase || message) && (
            <div className="mt-4 space-y-2 rounded-lg border border-border/60 bg-background/70 p-3">
              {!!phrase && <p className="text-sm font-medium">{phrase}</p>}
              {!!message && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{message}</p>}
            </div>
          )}
        </div>

        <div className="p-6 space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="profile-bio">Frase do perfil</Label>
              <Textarea
                id="profile-bio"
                rows={2}
                value={phrase}
                onChange={(event) => setPhrase(event.target.value)}
                placeholder="Ex: constancia diaria, sem atalhos."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-message">Mensagem sobre voce</Label>
              <Textarea
                id="profile-message"
                rows={2}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Conte um pouco sobre sua jornada fitness."
              />
            </div>
          </div>

          <Button type="button" variant="outline" onClick={() => saveSocialProfile()}>
            <MessageSquareText className="h-4 w-4" />
            Salvar perfil social
          </Button>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="profile-photo-caption">Legenda da foto</Label>
              <Input
                id="profile-photo-caption"
                value={photoCaption}
                onChange={(event) => setPhotoCaption(event.target.value)}
                placeholder="Ex: treino concluido hoje"
              />
              <Button
                type="button"
                variant="energy"
                className="w-full"
                disabled={publishingMode !== null}
                onClick={() => photoInputRef.current?.click()}
              >
                <Images className="h-4 w-4" />
                {publishingMode === 'post' ? 'Publicando foto...' : 'Adicionar foto ao perfil'}
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-story-caption">Legenda do story</Label>
              <Input
                id="profile-story-caption"
                value={storyCaption}
                onChange={(event) => setStoryCaption(event.target.value)}
                placeholder="Ex: cardio finalizado"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="energy"
                  className="flex-1"
                  disabled={publishingMode !== null}
                  onClick={() => storyInputRef.current?.click()}
                >
                  <Camera className="h-4 w-4" />
                  {publishingMode === 'story' ? 'Publicando...' : 'Adicionar story'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setActiveStoryId(myStories[0]?.id || '')}
                  disabled={!myStories.length}
                >
                  <Play className="h-4 w-4" />
                  Ver meu story
                </Button>
              </div>
            </div>
          </div>

          <input
            ref={profilePhotoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleProfilePhotoSelected}
          />
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoSelected}
          />
          <input
            ref={storyInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleStorySelected}
          />

          <div className="space-y-2">
            <p className="text-sm font-semibold">Minhas fotos</p>
            {!myPosts.length && (
              <p className="text-sm text-muted-foreground">
                Nenhuma foto publicada ainda. Use o botao acima para adicionar.
              </p>
            )}
            {!!myPosts.length && (
              <div className="grid grid-cols-3 gap-2">
                {myPosts.slice(0, 12).map((post) => (
                  <img
                    key={post.id}
                    src={post.imageDataUrl}
                    alt={`Foto de ${profile.name}`}
                    className="aspect-square w-full rounded-md border border-border/70 object-cover"
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="glass-card p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-success p-[2px]">
              {profilePhotoDataUrl ? (
                <img
                  src={profilePhotoDataUrl}
                  alt={`Foto de perfil de ${profile.name}`}
                  className="h-full w-full rounded-2xl border border-border/40 object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-2xl bg-background">
                  <span className="text-3xl font-bold text-primary">
                    {profile.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold">{profile.name}</h2>
              <p className="text-muted-foreground">{profile.email}</p>
              <div className="flex items-center gap-2 mt-1">
                <Trophy className="w-4 h-4 text-primary" />
                <span className="text-sm text-primary font-medium">{profile.points} pontos</span>
              </div>
            </div>
          </div>
          <EditProfileModal />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3 p-3 bg-secondary/30 rounded-lg">
            <Calendar className="w-5 h-5 text-info" />
            <div>
              <p className="text-xs text-muted-foreground">Idade</p>
              <p className="font-medium">{profile.age} anos</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-secondary/30 rounded-lg">
            <Ruler className="w-5 h-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Altura</p>
              <p className="font-medium">{profile.height} cm</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-secondary/30 rounded-lg">
            <Scale className="w-5 h-5 text-success" />
            <div>
              <p className="text-xs text-muted-foreground">Peso</p>
              <p className="font-medium">{profile.weight} kg</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-secondary/30 rounded-lg">
            <Target className="w-5 h-5 text-warning" />
            <div>
              <p className="text-xs text-muted-foreground">Objetivo</p>
              <p className="font-medium">
                {goalInfo?.icon} {goalInfo?.label}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Dumbbell className="w-5 h-5 text-primary" />
          Preferencias de treino
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-3 p-3 bg-secondary/30 rounded-lg">
            <Dumbbell className="w-5 h-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Grupos musculares</p>
              <p className="font-medium text-sm">{selectedMuscleLabels}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-secondary/30 rounded-lg">
            <Clock className="w-5 h-5 text-success" />
            <div>
              <p className="text-xs text-muted-foreground">Frequencia semanal</p>
              <p className="font-medium">{profile.training_frequency}x por semana</p>
            </div>
          </div>
        </div>
      </div>

      <div className="stat-card mb-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          Resumo de atividades
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold gradient-text">{runSessions.length}</p>
            <p className="text-sm text-muted-foreground">Corridas</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold gradient-text">{totalDistance.toFixed(1)}</p>
            <p className="text-sm text-muted-foreground">km total</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold gradient-text">{formatDuration(totalTime)}</p>
            <p className="text-sm text-muted-foreground">Tempo</p>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <MusicPlayer />
      </div>

      <div className="text-center space-y-4">
        <p className="text-sm text-muted-foreground">
          Membro desde {format(new Date(profile.created_at || new Date()), "MMMM 'de' yyyy", { locale: ptBR })}
        </p>
        <Button variant="outline" onClick={handleLogout}>
          Sair da conta
        </Button>
      </div>

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
