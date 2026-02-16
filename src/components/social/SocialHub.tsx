import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  BellRing,
  Camera,
  CheckCircle2,
  Copy,
  Heart,
  Instagram,
  MessageCircle,
  Target,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

import { SOCIAL_HUB_STORAGE_PREFIX } from '@/lib/storageKeys';
import { UserProfile } from '@/types/user';
import {
  SocialClan,
  SocialClanChallenge,
  SocialClanGoal,
  SocialFeedPost,
  SocialFriend,
  SocialNotification,
  SocialNotificationType,
  SocialState,
} from '@/types/social';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

interface SocialHubProps {
  profile: UserProfile;
}

const EMPTY_SOCIAL_STATE: SocialState = {
  friends: [],
  clans: [],
  posts: [],
  notifications: [],
};

const NOTIFICATION_LIMIT = 120;
const MAX_IMAGE_SIZE = 1080;

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const normalizeHandle = (value: string) => value.trim().replace(/^@+/, '').toLowerCase();

const formatDateTime = (isoDate: string) => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR');
};

const formatDate = (isoDate: string) => {
  if (!isoDate) return '-';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
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
  friend: 'Amigo',
  clan: 'Cla',
  goal: 'Meta',
  challenge: 'Desafio',
  post: 'Feed',
  system: 'Sistema',
};

export function SocialHub({ profile }: SocialHubProps) {
  const storageKey = useMemo(() => `${SOCIAL_HUB_STORAGE_PREFIX}${profile.id}`, [profile.id]);
  const profileHandle = useMemo(
    () => `@${profile.name.trim().toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9._]/g, '') || 'fit.user'}`,
    [profile.name]
  );

  const [socialState, setSocialState] = useState<SocialState>(EMPTY_SOCIAL_STATE);
  const [loadedStorageKey, setLoadedStorageKey] = useState<string | null>(null);

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

  const [postCaption, setPostCaption] = useState('');
  const [postImageDataUrl, setPostImageDataUrl] = useState('');
  const [processingImage, setProcessingImage] = useState(false);

  const postImageInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) {
      setSocialState(EMPTY_SOCIAL_STATE);
      setLoadedStorageKey(storageKey);
      return;
    }

    try {
      const parsed = JSON.parse(stored) as Partial<SocialState>;
      setSocialState({
        friends: parsed.friends || [],
        clans: parsed.clans || [],
        posts: parsed.posts || [],
        notifications: parsed.notifications || [],
      });
    } catch (error) {
      console.error('Erro ao carregar dados sociais:', error);
      setSocialState(EMPTY_SOCIAL_STATE);
      toast.error('Nao foi possivel carregar dados do modulo social.');
    }

    setLoadedStorageKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    if (loadedStorageKey !== storageKey) return;
    window.localStorage.setItem(storageKey, JSON.stringify(socialState));
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

  const unreadNotifications = useMemo(
    () => socialState.notifications.filter((notification) => !notification.read).length,
    [socialState.notifications]
  );

  const friendsById = useMemo(
    () => new Map(socialState.friends.map((friend) => [friend.id, friend])),
    [socialState.friends]
  );

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
    const name = friendName.trim();
    const handleValue = normalizeHandle(friendHandle);
    if (!name || !handleValue) {
      toast.error('Preencha nome e usuario do amigo.');
      return;
    }
    if (socialState.friends.some((friend) => normalizeHandle(friend.handle) === handleValue)) {
      toast.error('Esse amigo ja foi adicionado.');
      return;
    }

    const newFriend: SocialFriend = {
      id: createId(),
      name,
      handle: `@${handleValue}`,
      goal: friendGoal.trim() || 'Sem meta definida',
      addedAt: new Date().toISOString(),
    };

    setSocialState((prev) => ({ ...prev, friends: [newFriend, ...prev.friends] }));
    pushNotification({
      type: 'friend',
      title: 'Novo amigo adicionado',
      description: `${newFriend.name} entrou na sua rede fitness.`,
    });

    setFriendName('');
    setFriendHandle('');
    setFriendGoal('');
    toast.success('Amigo adicionado.');
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
      toast.error('Defina um nome para o cla.');
      return;
    }
    if (!clanMemberIds.length) {
      toast.error('Selecione ao menos 1 amigo para o cla.');
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
      title: 'Cla criado',
      description: `${nextClan.name} pronto para metas coletivas.`,
    });

    setClanName('');
    setClanDescription('');
    setClanMemberIds([]);
    toast.success('Cla criado.');
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

  const handlePostImageSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Selecione uma imagem valida.');
      return;
    }

    setProcessingImage(true);
    try {
      const dataUrl = await convertImageToDataUrl(file);
      setPostImageDataUrl(dataUrl);
    } catch (error) {
      console.error('Erro ao processar imagem:', error);
      toast.error('Nao foi possivel processar a imagem.');
    } finally {
      setProcessingImage(false);
    }
  };

  const handleCreatePost = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!postCaption.trim() || !postImageDataUrl) {
      toast.error('Adicione foto e legenda para publicar.');
      return;
    }

    const nextPost: SocialFeedPost = {
      id: createId(),
      authorName: profile.name,
      authorHandle: profileHandle,
      caption: postCaption.trim(),
      imageDataUrl: postImageDataUrl,
      createdAt: new Date().toISOString(),
      likes: 0,
      sharedCount: 0,
    };

    setSocialState((prev) => ({ ...prev, posts: [nextPost, ...prev.posts] }));
    pushNotification({
      type: 'post',
      title: 'Novo post no feed',
      description: `${profile.name} publicou uma nova foto.`,
    });

    setPostCaption('');
    setPostImageDataUrl('');
    if (postImageInputRef.current) {
      postImageInputRef.current.value = '';
    }
    toast.success('Post publicado.');
  };

  const handleLikePost = (postId: string) => {
    setSocialState((prev) => ({
      ...prev,
      posts: prev.posts.map((post) => (post.id === postId ? { ...post, likes: post.likes + 1 } : post)),
    }));
  };

  const markPostAsShared = (postId: string) => {
    setSocialState((prev) => ({
      ...prev,
      posts: prev.posts.map((post) =>
        post.id === postId ? { ...post, sharedCount: post.sharedCount + 1 } : post
      ),
    }));
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
          Amigos, notificacoes, clas com metas e desafios coletivos em um unico lugar.
        </p>
        <h1 className="mt-1 text-2xl md:text-3xl font-bold">
          Comunidade <span className="gradient-text">FitTrack</span>
        </h1>
      </div>

      <Tabs defaultValue="friends" className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 md:grid-cols-4">
          <TabsTrigger value="friends" className="py-2 text-xs md:text-sm">Amigos</TabsTrigger>
          <TabsTrigger value="clans" className="py-2 text-xs md:text-sm">Clas</TabsTrigger>
          <TabsTrigger value="feed" className="py-2 text-xs md:text-sm">Feed</TabsTrigger>
          <TabsTrigger value="notifications" className="py-2 text-xs md:text-sm">Notificacoes</TabsTrigger>
        </TabsList>

        <TabsContent value="friends" className="space-y-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg">Adicionar amigos</CardTitle>
              <CardDescription>Monte sua rede para desafios e metas em conjunto.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <form className="space-y-3" onSubmit={handleAddFriend}>
                <div className="space-y-2">
                  <Label htmlFor="friend-name">Nome</Label>
                  <Input id="friend-name" value={friendName} onChange={(event) => setFriendName(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="friend-handle">Usuario</Label>
                  <Input id="friend-handle" value={friendHandle} onChange={(event) => setFriendHandle(event.target.value)} placeholder="@anafit" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="friend-goal">Meta</Label>
                  <Input id="friend-goal" value={friendGoal} onChange={(event) => setFriendGoal(event.target.value)} placeholder="Ex: correr 5 km" />
                </div>
                <Button type="submit" variant="energy" className="w-full">
                  <UserPlus className="h-4 w-4" />
                  Adicionar amigo
                </Button>
              </form>

              <div className="space-y-2">
                {!socialState.friends.length && <p className="text-sm text-muted-foreground">Nenhum amigo adicionado.</p>}
                {socialState.friends.map((friend) => (
                  <div key={friend.id} className="rounded-lg border border-border/70 bg-card/40 p-3">
                    <p className="font-semibold">{friend.name}</p>
                    <p className="text-sm text-muted-foreground">{friend.handle}</p>
                    <p className="text-xs text-muted-foreground mt-1">Meta: {friend.goal}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="clans" className="space-y-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg">Criacao de cla</CardTitle>
              <CardDescription>Adicione amigos e defina metas e desafios juntos.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 xl:grid-cols-2">
              <form className="space-y-3" onSubmit={handleCreateClan}>
                <div className="space-y-2">
                  <Label htmlFor="clan-name">Nome do cla</Label>
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
                  Criar cla
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
                    {!socialState.clans.length && <option value="">Nenhum cla</option>}
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
                    {!socialState.clans.length && <option value="">Nenhum cla</option>}
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
              <CardTitle className="text-lg">Clas criados</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!socialState.clans.length && <p className="text-sm text-muted-foreground">Nenhum cla criado.</p>}
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

        <TabsContent value="feed" className="space-y-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg">Novo post no feed</CardTitle>
              <CardDescription>Publique fotos e compartilhe no WhatsApp ou Instagram.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={handleCreatePost}>
                <Textarea value={postCaption} onChange={(event) => setPostCaption(event.target.value)} placeholder="Conte como foi seu treino." />
                <input
                  ref={postImageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePostImageSelected}
                  className="block w-full rounded-lg border border-border bg-secondary/50 p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground"
                />
                {processingImage && <p className="text-sm text-muted-foreground">Processando imagem...</p>}
                {postImageDataUrl && (
                  <img src={postImageDataUrl} alt="Pre-visualizacao" className="h-64 w-full object-cover rounded-lg border border-border/70" />
                )}
                <Button type="submit" variant="energy" className="w-full" disabled={!postCaption.trim() || !postImageDataUrl || processingImage}>
                  <Camera className="h-4 w-4" />
                  Publicar
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg">Feed da comunidade</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!socialState.posts.length && <p className="text-sm text-muted-foreground">Ainda nao ha posts.</p>}
              {socialState.posts.map((post) => (
                <div key={post.id} className="rounded-lg border border-border/70 bg-card/40 p-3 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{post.authorName}</p>
                      <p className="text-xs text-muted-foreground">{post.authorHandle} • {formatDateTime(post.createdAt)}</p>
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
    </div>
  );
}
