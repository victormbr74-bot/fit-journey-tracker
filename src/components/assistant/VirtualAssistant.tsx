import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '@/hooks/useProfile';
import { generateDietPlan } from '@/lib/dietGenerator';
import { supabase } from '@/integrations/supabase/client';
import {
  ASSISTANT_CHAT_STORAGE_PREFIX,
  ASSISTANT_REMINDER_STORAGE_PREFIX,
  ASSISTANT_STATE_STORAGE_PREFIX,
  DIET_PLAN_STORAGE_PREFIX,
  WORKOUT_PLAN_STORAGE_PREFIX,
} from '@/lib/storageKeys';
import { WorkoutPlan } from '@/types/workout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Bell,
  Bot,
  CheckCircle2,
  Dumbbell,
  Flame,
  Send,
  Sparkles,
  Target,
  Trash2,
  Utensils,
} from 'lucide-react';

type AssistantRole = 'assistant' | 'user';
type FocusId = 'peito' | 'costas' | 'pernas' | 'ombros' | 'bracos' | 'core' | 'cardio';
type PendingAction = 'workout' | 'diet' | 'reminder' | null;
type NotificationState = NotificationPermission | 'unsupported';

interface AssistantMessage {
  id: string;
  role: AssistantRole;
  text: string;
  createdAt: string;
}

interface AssistantReminder {
  id: string;
  title: string;
  dueAt: string;
  done: boolean;
  notified: boolean;
}

interface ConversationState {
  pendingAction: PendingAction;
  workout: {
    goal?: WorkoutPlan['goal'];
    focuses: FocusId[];
    days?: number;
  };
  reminder: {
    title?: string;
  };
}

const focusLabels: Record<FocusId, string> = {
  peito: 'Peito',
  costas: 'Costas',
  pernas: 'Pernas',
  ombros: 'Ombros',
  bracos: 'Bracos',
  core: 'Core',
  cardio: 'Cardio',
};

const focusKeywords: Record<FocusId, string[]> = {
  peito: ['peito', 'supino', 'peitoral'],
  costas: ['costas', 'remada', 'puxada'],
  pernas: ['perna', 'pernas', 'agachamento', 'coxa'],
  ombros: ['ombro', 'ombros', 'desenvolvimento'],
  bracos: ['braco', 'bracos', 'biceps', 'triceps', 'rosca'],
  core: ['core', 'abdomen', 'abdominal', 'prancha'],
  cardio: ['cardio', 'corrida', 'esteira', 'bike', 'hiit'],
};

const quickPrompts = [
  'Quero um treino focado em pernas 4 dias',
  'Monta uma dieta para perder peso',
  'Como estao meus desafios hoje?',
  'Me lembre de treinar 18:30',
  'Estou sem motivacao hoje',
];

const responseOpeners = ['Perfeito.', 'Boa.', 'Fechado.', 'Excelente.'];

const motivationalPhrases = [
  'Consistencia vence motivacao. Hoje ja vale por aparecer.',
  'Um treino bom hoje vale mais do que um treino perfeito nunca feito.',
  'Seu progresso vem da frequencia, nao da perfeicao.',
  'Vamos de passo curto e constante. Funciona.',
];

const emptyState = (): ConversationState => ({
  pendingAction: null,
  workout: { focuses: [] },
  reminder: {},
});

const normalizeText = (value: string): string =>
  value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

const containsAny = (text: string, terms: string[]): boolean => terms.some((term) => text.includes(term));

const pickRandom = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

const uniqueValues = <T,>(items: T[]): T[] => Array.from(new Set(items));

const nowIso = (): string => new Date().toISOString();

const formatMessageTime = (value: string): string =>
  new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const formatReminderDate = (value: string): string =>
  new Date(value).toLocaleString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const getNotificationState = (): NotificationState => {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
};

const welcomeMessage = (name: string): AssistantMessage => ({
  id: crypto.randomUUID(),
  role: 'assistant',
  text:
    `Oi ${name}. Sou seu assistente virtual com memoria de conversa.\n` +
    'Me diga naturalmente o que voce quer e eu vou perguntando os detalhes.',
  createdAt: nowIso(),
});

const defaultFocusesForGoal = (goal: WorkoutPlan['goal']): FocusId[] => {
  if (goal === 'lose_weight') return ['cardio', 'pernas', 'core'];
  if (goal === 'gain_muscle') return ['peito', 'costas', 'pernas', 'ombros'];
  if (goal === 'endurance') return ['cardio', 'pernas', 'core'];
  return ['peito', 'costas', 'pernas'];
};

const detectGoal = (normalizedMessage: string): WorkoutPlan['goal'] | null => {
  if (containsAny(normalizedMessage, ['perder peso', 'secar', 'emagrecer'])) return 'lose_weight';
  if (containsAny(normalizedMessage, ['ganhar massa', 'hipertrofia', 'ganho muscular'])) return 'gain_muscle';
  if (containsAny(normalizedMessage, ['resistencia', 'endurance'])) return 'endurance';
  if (containsAny(normalizedMessage, ['manter', 'manutencao'])) return 'maintain';
  return null;
};

const extractFocuses = (normalizedMessage: string): FocusId[] => {
  const matches: FocusId[] = [];

  (Object.keys(focusKeywords) as FocusId[]).forEach((focus) => {
    if (focusKeywords[focus].some((keyword) => normalizedMessage.includes(keyword))) {
      matches.push(focus);
    }
  });

  return uniqueValues(matches);
};

const extractDays = (normalizedMessage: string): number | null => {
  const match = normalizedMessage.match(/(\d+)\s*(dias|dia|x|vezes)/);
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return Math.max(1, Math.min(7, value));
};

const extractTime = (message: string): { hours: number; minutes: number } | null => {
  const match = message.match(/(?:^|\s)([01]?\d|2[0-3])[:h]([0-5]\d)(?:\s|$)/i);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  return { hours, minutes };
};

const extractReminderTitle = (message: string): string =>
  message
    .replace(/me lembre de/gi, '')
    .replace(/me lembra de/gi, '')
    .replace(/lembrete de/gi, '')
    .replace(/lembrete/gi, '')
    .replace(/criar/gi, '')
    .replace(/crie/gi, '')
    .replace(/as/gi, '')
    .replace(/(?:^|\s)([01]?\d|2[0-3])[:h]([0-5]\d)(?:\s|$)/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

const parseEnergyLevel = (normalizedMessage: string): number | null => {
  const match = normalizedMessage.match(/\b(10|[0-9])\b/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(10, value));
};

const buildWorkoutPlan = (
  userName: string,
  goal: WorkoutPlan['goal'],
  focuses: FocusId[],
  days: number
): WorkoutPlan => {
  const finalFocuses = focuses.length > 0 ? uniqueValues(focuses) : ['cardio'];

  const daysList = Array.from({ length: Math.max(1, Math.min(7, days)) }).map((_, index) => {
    const focus = finalFocuses[index % finalFocuses.length];
    const label = focusLabels[focus];
    const icon = focus === 'cardio' ? '🏃' : '🏋️';

    return {
      id: crypto.randomUUID(),
      dayName: `Treino ${index + 1}`,
      focus: `Foco em ${label}`,
      estimatedMinutes: 50,
      exercises: [
        {
          id: crypto.randomUUID(),
          name: `${label} - Exercicio Base`,
          sets: 4,
          reps: '8-12',
          restSeconds: 90,
          muscleGroup: label,
          icon,
        },
        {
          id: crypto.randomUUID(),
          name: `${label} - Exercicio Complementar`,
          sets: 3,
          reps: '10-15',
          restSeconds: 60,
          muscleGroup: label,
          icon,
        },
      ],
    };
  });

  return {
    id: crypto.randomUUID(),
    name: `Plano focado em ${finalFocuses.map((focus) => focusLabels[focus]).join(', ')}`,
    description: `Treino criado pelo assistente para ${userName}.`,
    daysPerWeek: daysList.length,
    days: daysList,
    goal,
  };
};

const buildReminder = (title: string, time: { hours: number; minutes: number }): AssistantReminder => {
  const dueAt = new Date();
  dueAt.setHours(time.hours, time.minutes, 0, 0);

  if (dueAt.getTime() <= Date.now()) {
    dueAt.setDate(dueAt.getDate() + 1);
  }

  return {
    id: crypto.randomUUID(),
    title: title || 'Lembrete personalizado',
    dueAt: dueAt.toISOString(),
    done: false,
    notified: false,
  };
};

export function VirtualAssistant() {
  const navigate = useNavigate();
  const { profile, runSessions, userChallenges, completeChallenge } = useProfile();
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [reminders, setReminders] = useState<AssistantReminder[]>([]);
  const [conversationState, setConversationState] = useState<ConversationState>(emptyState());
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [notificationState, setNotificationState] = useState<NotificationState>(() => getNotificationState());
  const [loadedChatKey, setLoadedChatKey] = useState<string | null>(null);
  const [loadedReminderKey, setLoadedReminderKey] = useState<string | null>(null);
  const [loadedStateKey, setLoadedStateKey] = useState<string | null>(null);
  const [aiFailures, setAiFailures] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const chatStorageKey = useMemo(
    () => (profile ? `${ASSISTANT_CHAT_STORAGE_PREFIX}${profile.id}` : null),
    [profile?.id]
  );
  const reminderStorageKey = useMemo(
    () => (profile ? `${ASSISTANT_REMINDER_STORAGE_PREFIX}${profile.id}` : null),
    [profile?.id]
  );
  const stateStorageKey = useMemo(
    () => (profile ? `${ASSISTANT_STATE_STORAGE_PREFIX}${profile.id}` : null),
    [profile?.id]
  );

  const isLoadingStorage =
    (chatStorageKey !== null && loadedChatKey !== chatStorageKey) ||
    (reminderStorageKey !== null && loadedReminderKey !== reminderStorageKey) ||
    (stateStorageKey !== null && loadedStateKey !== stateStorageKey);

  const sortedReminders = useMemo(
    () => [...reminders].sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()),
    [reminders]
  );

  const appendMessage = (role: AssistantRole, text: string) => {
    setMessages((current) => [...current, { id: crypto.randomUUID(), role, text, createdAt: nowIso() }]);
  };

  const requestNotificationPermission = async (): Promise<NotificationState> => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationState('unsupported');
      return 'unsupported';
    }

    if (Notification.permission === 'granted') {
      setNotificationState('granted');
      return 'granted';
    }

    const permission = await Notification.requestPermission();
    setNotificationState(permission);
    return permission;
  };

  const generateStatusSummary = (): string => {
    if (!profile) return 'Complete seu perfil para eu gerar um resumo completo.';

    const totalDistance = runSessions.reduce((sum, session) => sum + session.distance, 0);
    const completedChallenges = userChallenges.filter((challenge) => challenge.is_completed).length;
    const pendingChallenges = userChallenges.filter((challenge) => !challenge.is_completed).length;

    return [
      `Resumo rapido para voce, ${profile.name.split(' ')[0]}:`,
      `- Pontos: ${profile.points}`,
      `- Corridas: ${runSessions.length} (${totalDistance.toFixed(1)} km)`,
      `- Desafios concluidos: ${completedChallenges}`,
      `- Desafios pendentes: ${pendingChallenges}`,
    ].join('\n');
  };

  const buildProfileContext = (): string => {
    if (!profile) return 'Perfil indisponivel';

    return [
      `Nome: ${profile.name}`,
      `Objetivo: ${profile.goal}`,
      `Treinos por semana: ${profile.training_frequency}`,
      `Pontos: ${profile.points}`,
      `Peso: ${profile.weight}kg`,
      `Altura: ${profile.height}cm`,
    ].join(' | ');
  };

  const humanizeWithAI = async ({
    userMessage,
    baseReply,
    pendingAction,
  }: {
    userMessage: string;
    baseReply: string;
    pendingAction: PendingAction;
  }): Promise<string | null> => {
    if (aiFailures >= 2) return null;

    const history = messages
      .slice(-6)
      .map((message) => `${message.role === 'assistant' ? 'Assistente' : 'Usuario'}: ${message.text}`)
      .join('\n');

    const systemPrompt =
      'Voce e um assistente virtual de fitness em portugues-BR, humano, natural e objetivo. ' +
      'Reescreva a resposta base em tom conversacional, mantendo exatamente fatos, numeros, horarios e instrucoes. ' +
      'Nao invente dados. Nao use markdown pesado. Limite em no maximo 90 palavras.';

    const userPrompt = [
      `Perfil: ${buildProfileContext()}`,
      `Pendencia: ${pendingAction || 'nenhuma'}`,
      `Resumo: ${generateStatusSummary().replace(/\n/g, ' | ')}`,
      history ? `Historico recente:\n${history}` : 'Historico recente: sem mensagens',
      `Mensagem atual do usuario: ${userMessage}`,
      `Resposta base a ser humanizada: ${baseReply}`,
      'Agora gere somente a resposta final.',
    ].join('\n\n');

    try {
      const { data, error } = await supabase.functions.invoke('assistant-chat', {
        body: {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
          maxTokens: 220,
        },
      });

      if (error || !data || typeof data.reply !== 'string' || !data.reply.trim()) {
        setAiFailures((current) => current + 1);
        return null;
      }

      setAiFailures(0);
      return data.reply.trim();
    } catch (error) {
      console.error('Erro ao chamar IA remota:', error);
      setAiFailures((current) => current + 1);
      return null;
    }
  };

  const handleAssistantLogic = async (message: string): Promise<string> => {
    const normalizedMessage = normalizeText(message);

    const nextState: ConversationState = {
      pendingAction: conversationState.pendingAction,
      workout: {
        goal: conversationState.workout.goal,
        focuses: [...conversationState.workout.focuses],
        days: conversationState.workout.days,
      },
      reminder: {
        title: conversationState.reminder.title,
      },
    };

    const respond = async (text: string): Promise<string> => {
      setConversationState(nextState);
      const rewritten = await humanizeWithAI({
        userMessage: message,
        baseReply: text,
        pendingAction: nextState.pendingAction,
      });
      return rewritten || text;
    };

    const firstName = profile?.name.split(' ')[0] || 'voce';

    if (containsAny(normalizedMessage, ['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'e ai'])) {
      nextState.pendingAction = null;
      return respond(`Oi ${firstName}. Fala comigo como quiser. Quer foco em treino, dieta, desafios ou lembrete agora?`);
    }

    if (containsAny(normalizedMessage, ['obrigado', 'valeu', 'brigado'])) {
      return respond('Tamo junto. Se quiser, ja seguimos pro proximo passo.');
    }

    if (containsAny(normalizedMessage, ['abrir treino'])) {
      navigate('/workout');
      return respond('Abri o menu Treino para voce.');
    }

    if (containsAny(normalizedMessage, ['abrir dieta'])) {
      navigate('/diet');
      return respond('Abri o menu Dieta para voce.');
    }

    if (containsAny(normalizedMessage, ['abrir corrida'])) {
      navigate('/running');
      return respond('Abri o menu Corrida para voce.');
    }

    if (containsAny(normalizedMessage, ['abrir dashboard'])) {
      navigate('/dashboard');
      return respond('Abri o dashboard para voce.');
    }

    if (containsAny(normalizedMessage, ['notific'])) {
      const permission = await requestNotificationPermission();

      if (permission === 'granted') return respond('Perfeito. Notificacoes ativadas.');
      if (permission === 'denied') {
        return respond('As notificacoes estao bloqueadas no navegador. Libere nas configuracoes do site.');
      }
      if (permission === 'default') return respond('A permissao de notificacao ainda nao foi concedida.');
      return respond('Seu navegador nao suporta notificacoes locais.');
    }

    const wantsReminder =
      containsAny(normalizedMessage, ['lembrete', 'lembrar', 'me lembre', 'me lembra']) ||
      nextState.pendingAction === 'reminder';

    if (wantsReminder) {
      const extractedTitle = extractReminderTitle(message);
      if (extractedTitle) {
        nextState.reminder.title = extractedTitle;
      }

      const time = extractTime(message);
      if (!time) {
        nextState.pendingAction = 'reminder';
        if (nextState.reminder.title) {
          return respond(`Boa. Em qual horario quer o lembrete de "${nextState.reminder.title}"? Exemplo: 19:30.`);
        }
        return respond('Perfeito. Qual lembrete voce quer criar e em qual horario? Exemplo: beber agua 09:30.');
      }

      const reminder = buildReminder(nextState.reminder.title || extractedTitle || 'Lembrete personalizado', time);
      setReminders((current) => [...current, reminder]);
      nextState.pendingAction = null;
      nextState.reminder = {};

      return respond(`${pickRandom(responseOpeners)} Lembrete criado para ${formatReminderDate(reminder.dueAt)}.`);
    }

    const wantsWorkout =
      (containsAny(normalizedMessage, ['treino', 'workout']) &&
        containsAny(normalizedMessage, ['mont', 'ger', 'cri', 'planej', 'foc', 'ajusta'])) ||
      nextState.pendingAction === 'workout';

    if (wantsWorkout) {
      if (!profile) {
        nextState.pendingAction = null;
        return respond('Preciso do seu perfil para montar treino.');
      }

      const goal = detectGoal(normalizedMessage);
      const focuses = extractFocuses(normalizedMessage);
      const days = extractDays(normalizedMessage);

      if (goal) nextState.workout.goal = goal;
      if (focuses.length > 0) nextState.workout.focuses = uniqueValues([...nextState.workout.focuses, ...focuses]);
      if (days !== null) nextState.workout.days = days;

      if (containsAny(normalizedMessage, ['pode escolher', 'voce escolhe', 'surpreenda'])) {
        if (nextState.workout.focuses.length === 0) {
          nextState.workout.focuses = defaultFocusesForGoal(nextState.workout.goal || profile.goal);
        }
        if (!nextState.workout.days) {
          nextState.workout.days = profile.training_frequency || 3;
        }
      }

      if (nextState.workout.focuses.length === 0) {
        nextState.pendingAction = 'workout';
        return respond('Fechado. Qual foco voce quer? Exemplo: pernas, costas, peito, cardio ou core.');
      }

      if (!nextState.workout.days) {
        nextState.pendingAction = 'workout';
        return respond('Quantos dias por semana voce quer treinar?');
      }

      const finalGoal = nextState.workout.goal || profile.goal;
      const finalPlan = buildWorkoutPlan(profile.name, finalGoal, nextState.workout.focuses, nextState.workout.days);
      window.localStorage.setItem(`${WORKOUT_PLAN_STORAGE_PREFIX}${profile.id}`, JSON.stringify(finalPlan));
      toast.success('Treino aplicado no menu Treino.');

      const focusText = nextState.workout.focuses.map((focus) => focusLabels[focus]).join(', ');
      nextState.pendingAction = null;
      nextState.workout = { focuses: [] };

      return respond(
        `${pickRandom(responseOpeners)} Montei e apliquei seu treino (${finalPlan.daysPerWeek} dias, foco em ${focusText}). Quer que eu ajuste a dieta tambem?`
      );
    }

    const wantsDiet =
      containsAny(normalizedMessage, ['dieta', 'alimentacao', 'plano alimentar', 'comida']) ||
      nextState.pendingAction === 'diet';

    if (wantsDiet) {
      if (!profile) {
        nextState.pendingAction = null;
        return respond('Preciso do seu perfil para gerar dieta.');
      }

      const goal = detectGoal(normalizedMessage);
      if (!goal && !containsAny(normalizedMessage, ['pode escolher', 'voce escolhe'])) {
        nextState.pendingAction = 'diet';
        return respond('Claro. Qual objetivo da dieta: perder peso, ganhar massa, manter forma ou resistencia?');
      }

      const finalGoal = goal || profile.goal;
      const plan = generateDietPlan({
        weight: profile.weight,
        height: profile.height,
        age: profile.age,
        goal: finalGoal,
      });

      window.localStorage.setItem(`${DIET_PLAN_STORAGE_PREFIX}${profile.id}`, JSON.stringify(plan));
      toast.success('Dieta aplicada no menu Dieta.');

      nextState.pendingAction = null;
      return respond(
        `${pickRandom(responseOpeners)} Dieta aplicada: ${plan.dailyCalories} kcal por dia. Macros: P ${plan.proteinGrams}g, C ${plan.carbsGrams}g, G ${plan.fatGrams}g.`
      );
    }

    if (containsAny(normalizedMessage, ['desafio', 'desafios'])) {
      const pendingChallenges = userChallenges.filter((challenge) => !challenge.is_completed && challenge.challenge);

      if (containsAny(normalizedMessage, ['concluir', 'finalizar', 'completar'])) {
        if (pendingChallenges.length === 0) return respond('Voce nao tem desafios pendentes no momento.');

        const target = pendingChallenges[0];
        const result = await completeChallenge(target.id);
        if (result.error) return respond(`Nao consegui concluir agora: ${result.error.message}`);
        return respond(`Perfeito. Marquei como concluido: ${target.challenge?.name}.`);
      }

      if (pendingChallenges.length === 0) {
        return respond('Todos os desafios do momento estao concluidos. Excelente.');
      }

      const list = pendingChallenges
        .slice(0, 4)
        .map((challenge) => `- ${challenge.challenge?.name} (${challenge.current_value}/${challenge.challenge?.target_value})`)
        .join('\n');

      return respond(`Seus desafios pendentes:\n${list}\nSe quiser, diga: concluir desafio.`);
    }

    if (containsAny(normalizedMessage, ['motiv', 'desanim', 'cansad', 'preguica', 'sem vontade'])) {
      return respond(`${pickRandom(motivationalPhrases)} Se quiser, me diz sua energia de 0 a 10.`);
    }

    const energy = parseEnergyLevel(normalizedMessage);
    if (energy !== null) {
      if (energy <= 4) return respond('Entendi. Hoje vamos em um treino curto de 20 minutos, sem sobrecarga.');
      if (energy <= 7) return respond('Boa. Energia media. Da para fazer um treino objetivo de 40 minutos.');
      return respond('Excelente energia. Dia bom para treino forte e fechar desafios.');
    }

    if (containsAny(normalizedMessage, ['resumo', 'status', 'progresso'])) {
      return respond(generateStatusSummary());
    }

    if (containsAny(normalizedMessage, ['sim', 'claro', 'quero'])) {
      if (conversationState.pendingAction === 'workout') {
        return respond('Perfeito. Me fala o foco e dias. Exemplo: costas e pernas 4 dias.');
      }
      if (conversationState.pendingAction === 'diet') {
        return respond('Me diga seu objetivo principal para dieta e eu gero agora.');
      }
    }

    return respond(
      'Te entendi. Quer que eu te ajude agora com treino, dieta, desafios ou lembretes? Pode falar de forma natural.'
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = input.trim();
    if (!message) return;

    appendMessage('user', message);
    setInput('');
    setIsThinking(true);

    try {
      const reply = await handleAssistantLogic(message);
      appendMessage('assistant', reply);
    } catch (error) {
      console.error('Erro no assistente:', error);
      appendMessage('assistant', 'Tive um erro agora, mas posso tentar de novo.');
    } finally {
      setIsThinking(false);
    }
  };

  const toggleReminderDone = (reminderId: string) => {
    setReminders((current) =>
      current.map((reminder) => (reminder.id === reminderId ? { ...reminder, done: !reminder.done } : reminder))
    );
  };

  const deleteReminder = (reminderId: string) => {
    setReminders((current) => current.filter((reminder) => reminder.id !== reminderId));
  };

  useEffect(() => {
    setNotificationState(getNotificationState());
  }, []);

  useEffect(() => {
    if (!chatStorageKey || !profile) {
      setMessages([]);
      setLoadedChatKey(null);
      return;
    }

    const stored = window.localStorage.getItem(chatStorageKey);

    if (!stored) {
      setMessages([welcomeMessage(profile.name.split(' ')[0])]);
      setLoadedChatKey(chatStorageKey);
      return;
    }

    try {
      const parsed = JSON.parse(stored) as AssistantMessage[];
      if (!Array.isArray(parsed) || parsed.length === 0) {
        setMessages([welcomeMessage(profile.name.split(' ')[0])]);
      } else {
        setMessages(parsed);
      }
    } catch (error) {
      console.error('Erro ao carregar chat:', error);
      setMessages([welcomeMessage(profile.name.split(' ')[0])]);
    }

    setLoadedChatKey(chatStorageKey);
  }, [chatStorageKey, profile]);

  useEffect(() => {
    if (!reminderStorageKey) {
      setReminders([]);
      setLoadedReminderKey(null);
      return;
    }

    const stored = window.localStorage.getItem(reminderStorageKey);

    if (!stored) {
      setReminders([]);
      setLoadedReminderKey(reminderStorageKey);
      return;
    }

    try {
      const parsed = JSON.parse(stored) as AssistantReminder[];
      setReminders(Array.isArray(parsed) ? parsed : []);
    } catch (error) {
      console.error('Erro ao carregar lembretes:', error);
      setReminders([]);
    }

    setLoadedReminderKey(reminderStorageKey);
  }, [reminderStorageKey]);

  useEffect(() => {
    if (!stateStorageKey) {
      setConversationState(emptyState());
      setLoadedStateKey(null);
      return;
    }

    const stored = window.localStorage.getItem(stateStorageKey);

    if (!stored) {
      setConversationState(emptyState());
      setLoadedStateKey(stateStorageKey);
      return;
    }

    try {
      const parsed = JSON.parse(stored) as ConversationState;
      if (!parsed || !parsed.workout || !Array.isArray(parsed.workout.focuses)) {
        setConversationState(emptyState());
      } else {
        setConversationState({
          pendingAction: parsed.pendingAction || null,
          workout: {
            goal: parsed.workout.goal,
            focuses: parsed.workout.focuses,
            days: parsed.workout.days,
          },
          reminder: {
            title: parsed.reminder?.title,
          },
        });
      }
    } catch (error) {
      console.error('Erro ao carregar estado do assistente:', error);
      setConversationState(emptyState());
    }

    setLoadedStateKey(stateStorageKey);
  }, [stateStorageKey]);

  useEffect(() => {
    if (!chatStorageKey || loadedChatKey !== chatStorageKey) return;
    window.localStorage.setItem(chatStorageKey, JSON.stringify(messages.slice(-120)));
  }, [messages, chatStorageKey, loadedChatKey]);

  useEffect(() => {
    if (!reminderStorageKey || loadedReminderKey !== reminderStorageKey) return;
    window.localStorage.setItem(reminderStorageKey, JSON.stringify(reminders));
  }, [reminders, reminderStorageKey, loadedReminderKey]);

  useEffect(() => {
    if (!stateStorageKey || loadedStateKey !== stateStorageKey) return;
    window.localStorage.setItem(stateStorageKey, JSON.stringify(conversationState));
  }, [conversationState, stateStorageKey, loadedStateKey]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setReminders((current) => {
        let changed = false;
        const now = Date.now();

        const next = current.map((reminder) => {
          if (reminder.done || reminder.notified || new Date(reminder.dueAt).getTime() > now) {
            return reminder;
          }

          changed = true;
          toast.info(`Lembrete: ${reminder.title}`);

          if (notificationState === 'granted' && typeof window !== 'undefined' && 'Notification' in window) {
            new Notification('FitTrack - Lembrete', { body: reminder.title });
          }

          return { ...reminder, notified: true };
        });

        return changed ? next : current;
      });
    }, 15000);

    return () => window.clearInterval(timerId);
  }, [notificationState]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  if (isLoadingStorage) {
    return (
      <div className="pb-24 md:pb-8">
        <Card className="glass-card">
          <CardContent className="py-16 text-center text-muted-foreground">Carregando assistente...</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="pb-24 md:pb-8 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">
          Assistente <span className="gradient-text">Virtual</span>
        </h1>
        <p className="text-muted-foreground mt-1">
          Conversa natural para treino, dieta, desafios, lembretes e tarefas do sistema.
        </p>
      </div>

      <Card className="glass-card">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-primary" />
              Chat do Assistente
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Modo IA conversacional</Badge>
              <Badge variant={aiFailures >= 2 ? 'outline' : 'default'}>
                IA remota: {aiFailures >= 2 ? 'offline (fallback local)' : 'ativa'}
              </Badge>
              {conversationState.pendingAction && (
                <Badge variant="outline">Aguardando: {conversationState.pendingAction}</Badge>
              )}
              <Badge variant={notificationState === 'granted' ? 'default' : 'secondary'}>
                Notificacoes: {notificationState === 'unsupported' ? 'indisponivel' : notificationState}
              </Badge>
              <Button type="button" size="sm" variant="outline" className="gap-2" onClick={requestNotificationPermission}>
                <Bell className="w-4 h-4" />
                Ativar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {quickPrompts.map((prompt) => (
              <Button key={prompt} type="button" size="sm" variant="outline" onClick={() => setInput(prompt)} className="text-xs">
                {prompt}
              </Button>
            ))}
          </div>

          <div className="h-[420px] rounded-xl border border-border bg-secondary/20 p-3 overflow-y-auto space-y-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`rounded-xl px-3 py-2 max-w-[90%] ${
                  message.role === 'assistant'
                    ? 'bg-primary/10 border border-primary/20'
                    : 'ml-auto bg-card border border-border'
                }`}
              >
                <p className="text-sm whitespace-pre-line">{message.text}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{formatMessageTime(message.createdAt)}</p>
              </div>
            ))}

            {isThinking && (
              <div className="rounded-xl px-3 py-2 max-w-[90%] bg-primary/10 border border-primary/20">
                <p className="text-sm flex items-center gap-2">
                  <Sparkles className="w-4 h-4 animate-pulse" />
                  Pensando...
                </p>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Digite naturalmente o que voce quer..."
              disabled={isThinking}
            />
            <Button type="submit" variant="energy" disabled={isThinking || !input.trim()}>
              <Send className="w-4 h-4" />
              Enviar
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-warning" />
            Lembretes Ativos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sortedReminders.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum lembrete criado ainda.</p>
          ) : (
            <div className="space-y-3">
              {sortedReminders.map((reminder) => (
                <div key={reminder.id} className="rounded-xl border border-border bg-secondary/30 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={`font-medium ${reminder.done ? 'line-through' : ''}`}>{reminder.title}</p>
                      <p className="text-xs text-muted-foreground">{formatReminderDate(reminder.dueAt)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => toggleReminderDone(reminder.id)}>
                        <CheckCircle2 className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => deleteReminder(reminder.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardContent className="py-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <Dumbbell className="w-4 h-4 text-primary" />
              Conversa e monta treino em etapas
            </div>
            <div className="flex items-center gap-2">
              <Utensils className="w-4 h-4 text-success" />
              Ajusta dieta conforme objetivo
            </div>
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-warning" />
              Motivacao, desafios e lembretes no mesmo chat
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
