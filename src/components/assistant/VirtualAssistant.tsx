import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '@/hooks/useProfile';
import { generateDietPlan } from '@/lib/dietGenerator';
import {
  ASSISTANT_CHAT_STORAGE_PREFIX,
  ASSISTANT_REMINDER_STORAGE_PREFIX,
  DIET_PLAN_STORAGE_PREFIX,
  WORKOUT_PLAN_STORAGE_PREFIX,
} from '@/lib/storageKeys';
import { Exercise, WorkoutDay, WorkoutPlan } from '@/types/workout';
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
type FocusId = 'peito' | 'costas' | 'pernas' | 'ombros' | 'bracos' | 'core' | 'cardio' | 'gluteos';
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
  createdAt: string;
}

const focusLabels: Record<FocusId, string> = {
  peito: 'Peito',
  costas: 'Costas',
  pernas: 'Pernas',
  ombros: 'Ombros',
  bracos: 'Bracos',
  core: 'Core',
  cardio: 'Cardio',
  gluteos: 'Gluteos',
};

const focusKeywords: Record<FocusId, string[]> = {
  peito: ['peito', 'supino', 'peitoral'],
  costas: ['costas', 'remada', 'puxada', 'dorsal'],
  pernas: ['perna', 'pernas', 'agachamento', 'quadriceps', 'posterior', 'coxa'],
  ombros: ['ombro', 'ombros', 'deltoide', 'desenvolvimento'],
  bracos: ['braco', 'bracos', 'biceps', 'triceps', 'rosca'],
  core: ['core', 'abdomen', 'abdominal', 'prancha'],
  cardio: ['cardio', 'corrida', 'esteira', 'bike', 'hiit'],
  gluteos: ['gluteo', 'gluteos'],
};

const exerciseTemplates: Record<FocusId, Omit<Exercise, 'id'>[]> = {
  peito: [
    { name: 'Supino Reto', sets: 4, reps: '8-12', restSeconds: 90, muscleGroup: 'Peito', icon: '🏋️' },
    { name: 'Supino Inclinado', sets: 3, reps: '10-12', restSeconds: 75, muscleGroup: 'Peito', icon: '🏋️' },
    { name: 'Crucifixo', sets: 3, reps: '12-15', restSeconds: 60, muscleGroup: 'Peito', icon: '💪' },
    { name: 'Flexao de Braco', sets: 3, reps: '15-20', restSeconds: 45, muscleGroup: 'Peito', icon: '🤸' },
  ],
  costas: [
    { name: 'Puxada Frontal', sets: 4, reps: '8-12', restSeconds: 90, muscleGroup: 'Costas', icon: '💪' },
    { name: 'Remada Curvada', sets: 4, reps: '8-12', restSeconds: 90, muscleGroup: 'Costas', icon: '🏋️' },
    { name: 'Remada Unilateral', sets: 3, reps: '10-12', restSeconds: 60, muscleGroup: 'Costas', icon: '💪' },
    { name: 'Pulldown', sets: 3, reps: '12-15', restSeconds: 60, muscleGroup: 'Costas', icon: '💪' },
  ],
  pernas: [
    { name: 'Agachamento', sets: 4, reps: '8-12', restSeconds: 120, muscleGroup: 'Pernas', icon: '🦵' },
    { name: 'Leg Press', sets: 4, reps: '10-12', restSeconds: 90, muscleGroup: 'Pernas', icon: '🦵' },
    { name: 'Extensora', sets: 3, reps: '12-15', restSeconds: 60, muscleGroup: 'Pernas', icon: '🦵' },
    { name: 'Panturrilha', sets: 4, reps: '15-20', restSeconds: 45, muscleGroup: 'Pernas', icon: '🦵' },
  ],
  ombros: [
    { name: 'Desenvolvimento', sets: 4, reps: '8-12', restSeconds: 90, muscleGroup: 'Ombros', icon: '💪' },
    { name: 'Elevacao Lateral', sets: 3, reps: '12-15', restSeconds: 60, muscleGroup: 'Ombros', icon: '💪' },
    { name: 'Elevacao Frontal', sets: 3, reps: '12-15', restSeconds: 60, muscleGroup: 'Ombros', icon: '💪' },
    { name: 'Face Pull', sets: 3, reps: '12-15', restSeconds: 45, muscleGroup: 'Ombros', icon: '🧵' },
  ],
  bracos: [
    { name: 'Rosca Direta', sets: 3, reps: '10-12', restSeconds: 60, muscleGroup: 'Bracos', icon: '💪' },
    { name: 'Rosca Martelo', sets: 3, reps: '10-12', restSeconds: 60, muscleGroup: 'Bracos', icon: '💪' },
    { name: 'Triceps Pulley', sets: 3, reps: '10-12', restSeconds: 60, muscleGroup: 'Bracos', icon: '💪' },
    { name: 'Triceps Frances', sets: 3, reps: '10-12', restSeconds: 60, muscleGroup: 'Bracos', icon: '💪' },
  ],
  core: [
    { name: 'Prancha', sets: 3, reps: '30-60s', restSeconds: 45, muscleGroup: 'Core', icon: '🏋️' },
    { name: 'Abdominal Crunch', sets: 3, reps: '15-20', restSeconds: 45, muscleGroup: 'Core', icon: '🏋️' },
    { name: 'Elevacao de Pernas', sets: 3, reps: '12-15', restSeconds: 45, muscleGroup: 'Core', icon: '🏋️' },
    { name: 'Dead Bug', sets: 3, reps: '10-12', restSeconds: 45, muscleGroup: 'Core', icon: '🧠' },
  ],
  cardio: [
    { name: 'Esteira', sets: 1, reps: '20-30min', restSeconds: 0, muscleGroup: 'Cardio', icon: '🏃' },
    { name: 'Bicicleta', sets: 1, reps: '20-30min', restSeconds: 0, muscleGroup: 'Cardio', icon: '🚴' },
    { name: 'HIIT', sets: 1, reps: '15-20min', restSeconds: 0, muscleGroup: 'Cardio', icon: '⚡' },
    { name: 'Caminhada Rapida', sets: 1, reps: '30-40min', restSeconds: 0, muscleGroup: 'Cardio', icon: '🚶' },
  ],
  gluteos: [
    { name: 'Levantamento Terra Romeno', sets: 4, reps: '8-10', restSeconds: 90, muscleGroup: 'Gluteos', icon: '🦵' },
    { name: 'Hip Thrust', sets: 4, reps: '10-12', restSeconds: 90, muscleGroup: 'Gluteos', icon: '🦵' },
    { name: 'Afundo', sets: 3, reps: '10-12', restSeconds: 60, muscleGroup: 'Gluteos', icon: '🦵' },
    { name: 'Abducao de Quadril', sets: 3, reps: '15-20', restSeconds: 45, muscleGroup: 'Gluteos', icon: '🦵' },
  ],
};

const motivationalPhrases = [
  'Consistencia vence motivacao. Mantenha o ritmo hoje.',
  'Cada treino conta. Pequenos passos somam resultados grandes.',
  'Seu corpo responde ao que voce repete todos os dias.',
  'Voce nao precisa de perfeicao, precisa de frequencia.',
];

const normalizeText = (value: string): string =>
  value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const nowIso = () => new Date().toISOString();

const getNotificationState = (): NotificationState => {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
};

const buildWelcomeMessage = (name: string): AssistantMessage => ({
  id: crypto.randomUUID(),
  role: 'assistant',
  text:
    `Ola ${name}! Eu posso ajudar com treino, dieta, desafios, lembretes e notificacoes.\n` +
    'Exemplos: "montar treino focado em pernas 4 dias", "criar lembrete de agua 09:30", "como estao meus desafios?".',
  createdAt: nowIso(),
});

const defaultFocusesForGoal = (goal: WorkoutPlan['goal']): FocusId[] => {
  if (goal === 'lose_weight') return ['cardio', 'pernas', 'core'];
  if (goal === 'gain_muscle') return ['peito', 'costas', 'pernas', 'ombros'];
  if (goal === 'endurance') return ['cardio', 'pernas', 'core'];
  return ['peito', 'costas', 'pernas'];
};

const extractFocuses = (normalizedMessage: string): FocusId[] => {
  const detected = new Set<FocusId>();

  (Object.keys(focusKeywords) as FocusId[]).forEach((focus) => {
    if (focusKeywords[focus].some((keyword) => normalizedMessage.includes(keyword))) {
      detected.add(focus);
    }
  });

  return Array.from(detected);
};

const extractDays = (normalizedMessage: string, fallback: number): number => {
  const match = normalizedMessage.match(/(\d+)\s*(dias|dia|x|vezes)/);
  if (!match) return fallback;

  const days = Number(match[1]);
  if (!Number.isFinite(days)) return fallback;

  return Math.min(7, Math.max(1, days));
};

const detectGoal = (normalizedMessage: string): WorkoutPlan['goal'] | null => {
  if (
    normalizedMessage.includes('perder peso') ||
    normalizedMessage.includes('secar') ||
    normalizedMessage.includes('emagrecer')
  ) {
    return 'lose_weight';
  }

  if (
    normalizedMessage.includes('ganhar massa') ||
    normalizedMessage.includes('hipertrofia') ||
    normalizedMessage.includes('ganho muscular')
  ) {
    return 'gain_muscle';
  }

  if (normalizedMessage.includes('resistencia') || normalizedMessage.includes('endurance')) {
    return 'endurance';
  }

  if (normalizedMessage.includes('manter')) {
    return 'maintain';
  }

  return null;
};

const buildWorkoutPlan = (
  userName: string,
  goal: WorkoutPlan['goal'],
  focuses: FocusId[],
  daysPerWeek: number
): WorkoutPlan => {
  const safeDays = Math.max(1, Math.min(7, daysPerWeek));
  const selectedFocuses = focuses.length > 0 ? focuses : ['cardio'];
  const uniqueFocuses = Array.from(new Set(selectedFocuses));

  const days: WorkoutDay[] = Array.from({ length: safeDays }).map((_, index) => {
    const focus = uniqueFocuses[index % uniqueFocuses.length];
    const exercises = exerciseTemplates[focus].map((exercise) => ({
      ...exercise,
      id: crypto.randomUUID(),
    }));

    return {
      id: crypto.randomUUID(),
      dayName: `Treino ${index + 1}`,
      focus: `Foco em ${focusLabels[focus]}`,
      estimatedMinutes: 50,
      exercises,
    };
  });

  return {
    id: crypto.randomUUID(),
    name: `Plano Focado em ${uniqueFocuses.map((focus) => focusLabels[focus]).join(' + ')}`,
    description: `Plano criado pelo assistente para ${userName}.`,
    daysPerWeek: days.length,
    days,
    goal,
  };
};

const parseReminder = (message: string): { reminder?: AssistantReminder; error?: string } => {
  const timeMatch = message.match(/(\d{1,2})[:h](\d{2})/i);
  if (!timeMatch) {
    return { error: 'Informe o horario no formato 18:30 para eu criar o lembrete.' };
  }

  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) {
    return { error: 'Horario invalido. Use o formato 18:30.' };
  }

  const dueAt = new Date();
  dueAt.setHours(hours, minutes, 0, 0);

  if (dueAt.getTime() <= Date.now()) {
    dueAt.setDate(dueAt.getDate() + 1);
  }

  const title = message
    .replace(/me lembre de/gi, '')
    .replace(/lembrete de/gi, '')
    .replace(/lembrete/gi, '')
    .replace(/criar/gi, '')
    .replace(/as/gi, '')
    .replace(/(\d{1,2})[:h](\d{2})/i, '')
    .trim();

  return {
    reminder: {
      id: crypto.randomUUID(),
      title: title || 'Lembrete personalizado',
      dueAt: dueAt.toISOString(),
      done: false,
      notified: false,
      createdAt: nowIso(),
    },
  };
};

const formatReminderDate = (value: string): string =>
  new Date(value).toLocaleString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatMessageTime = (value: string): string =>
  new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const isOverdue = (reminder: AssistantReminder): boolean =>
  !reminder.done && new Date(reminder.dueAt).getTime() <= Date.now();

export function VirtualAssistant() {
  const navigate = useNavigate();
  const { profile, runSessions, userChallenges, completeChallenge } = useProfile();
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [reminders, setReminders] = useState<AssistantReminder[]>([]);
  const [loadedChatKey, setLoadedChatKey] = useState<string | null>(null);
  const [loadedReminderKey, setLoadedReminderKey] = useState<string | null>(null);
  const [notificationState, setNotificationState] = useState<NotificationState>(() => getNotificationState());
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const chatStorageKey = useMemo(
    () => (profile ? `${ASSISTANT_CHAT_STORAGE_PREFIX}${profile.id}` : null),
    [profile?.id]
  );

  const reminderStorageKey = useMemo(
    () => (profile ? `${ASSISTANT_REMINDER_STORAGE_PREFIX}${profile.id}` : null),
    [profile?.id]
  );

  const sortedReminders = useMemo(
    () => [...reminders].sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()),
    [reminders]
  );

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
      setMessages([buildWelcomeMessage(profile.name.split(' ')[0])]);
      setLoadedChatKey(chatStorageKey);
      return;
    }

    try {
      const parsed = JSON.parse(stored) as AssistantMessage[];
      if (!Array.isArray(parsed) || parsed.length === 0) {
        setMessages([buildWelcomeMessage(profile.name.split(' ')[0])]);
      } else {
        setMessages(parsed);
      }
    } catch (error) {
      console.error('Erro ao carregar chat do assistente:', error);
      setMessages([buildWelcomeMessage(profile.name.split(' ')[0])]);
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
      if (!Array.isArray(parsed)) {
        setReminders([]);
      } else {
        setReminders(parsed);
      }
    } catch (error) {
      console.error('Erro ao carregar lembretes:', error);
      setReminders([]);
    }

    setLoadedReminderKey(reminderStorageKey);
  }, [reminderStorageKey]);

  useEffect(() => {
    if (!chatStorageKey || loadedChatKey !== chatStorageKey) return;
    window.localStorage.setItem(chatStorageKey, JSON.stringify(messages.slice(-120)));
  }, [messages, chatStorageKey, loadedChatKey]);

  useEffect(() => {
    if (!reminderStorageKey || loadedReminderKey !== reminderStorageKey) return;
    window.localStorage.setItem(reminderStorageKey, JSON.stringify(reminders));
  }, [reminders, reminderStorageKey, loadedReminderKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
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

          return {
            ...reminder,
            notified: true,
          };
        });

        return changed ? next : current;
      });
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [notificationState]);

  const appendMessage = (role: AssistantRole, text: string) => {
    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role,
        text,
        createdAt: nowIso(),
      },
    ]);
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
      `Resumo rapido de hoje:`,
      `- Pontos: ${profile.points}`,
      `- Corridas registradas: ${runSessions.length} (${totalDistance.toFixed(1)} km)`,
      `- Desafios concluidos: ${completedChallenges}`,
      `- Desafios pendentes: ${pendingChallenges}`,
    ].join('\n');
  };

  const handleAssistantLogic = async (userMessage: string): Promise<string> => {
    const normalizedMessage = normalizeText(userMessage);

    if (normalizedMessage.includes('abrir treino')) {
      navigate('/workout');
      return 'Abri o menu de treino para voce.';
    }

    if (normalizedMessage.includes('abrir dieta')) {
      navigate('/diet');
      return 'Abri o menu de dieta para voce.';
    }

    if (normalizedMessage.includes('abrir corrida')) {
      navigate('/running');
      return 'Abri o menu de corrida para voce.';
    }

    if (normalizedMessage.includes('abrir dashboard')) {
      navigate('/dashboard');
      return 'Abri o dashboard para voce.';
    }

    if (normalizedMessage.includes('notific')) {
      const permission = await requestNotificationPermission();

      if (permission === 'granted') {
        return 'Notificacoes ativadas. Vou avisar quando seus lembretes chegarem.';
      }

      if (permission === 'denied') {
        return 'As notificacoes estao bloqueadas no navegador. Libere nas configuracoes do site para ativar.';
      }

      if (permission === 'default') {
        return 'Permissao de notificacao ainda nao concedida.';
      }

      return 'Seu navegador nao suporta notificacoes locais.';
    }

    if (normalizedMessage.includes('lembrete') || normalizedMessage.includes('lembrar')) {
      const parsed = parseReminder(userMessage);
      if (!parsed.reminder) {
        return parsed.error || 'Nao consegui criar o lembrete.';
      }

      setReminders((current) => [...current, parsed.reminder as AssistantReminder]);
      return `Lembrete criado para ${formatReminderDate(parsed.reminder.dueAt)}: ${parsed.reminder.title}`;
    }

    const wantsWorkoutPlan =
      normalizedMessage.includes('treino') &&
      ['montar', 'gerar', 'criar', 'focar', 'focado', 'planejar'].some((word) =>
        normalizedMessage.includes(word)
      );

    if (wantsWorkoutPlan) {
      if (!profile) {
        return 'Preciso do seu perfil carregado para montar o treino.';
      }

      const focusesFromMessage = extractFocuses(normalizedMessage);
      const selectedFocuses =
        focusesFromMessage.length > 0 ? focusesFromMessage : defaultFocusesForGoal(profile.goal);
      const daysPerWeek = extractDays(normalizedMessage, profile.training_frequency || 3);

      const plan = buildWorkoutPlan(profile.name, profile.goal, selectedFocuses, daysPerWeek);
      window.localStorage.setItem(`${WORKOUT_PLAN_STORAGE_PREFIX}${profile.id}`, JSON.stringify(plan));

      toast.success('Treino aplicado no menu Treino.');
      return [
        `Montei e apliquei um treino com ${plan.daysPerWeek} dias por semana.`,
        `Foco: ${selectedFocuses.map((focus) => focusLabels[focus]).join(', ')}.`,
        'Abra a tela Treino para ver, ajustar e editar os exercicios.',
      ].join(' ');
    }

    if (
      normalizedMessage.includes('dieta') ||
      normalizedMessage.includes('alimentacao') ||
      normalizedMessage.includes('alimentar')
    ) {
      if (!profile) {
        return 'Preciso do seu perfil para gerar uma dieta personalizada.';
      }

      const goal = detectGoal(normalizedMessage) || profile.goal;
      const plan = generateDietPlan({
        weight: profile.weight,
        height: profile.height,
        age: profile.age,
        goal,
      });

      window.localStorage.setItem(`${DIET_PLAN_STORAGE_PREFIX}${profile.id}`, JSON.stringify(plan));
      toast.success('Dieta aplicada no menu Dieta.');

      return [
        `Dieta gerada e aplicada no menu Dieta.`,
        `Meta diaria: ${plan.dailyCalories} kcal.`,
        `Macros: P ${plan.proteinGrams}g | C ${plan.carbsGrams}g | G ${plan.fatGrams}g.`,
      ].join(' ');
    }

    if (normalizedMessage.includes('desafio')) {
      const pendingChallenges = userChallenges.filter((challenge) => !challenge.is_completed && challenge.challenge);

      if (normalizedMessage.includes('concluir') || normalizedMessage.includes('finalizar')) {
        if (pendingChallenges.length === 0) {
          return 'Voce nao tem desafios pendentes neste momento.';
        }

        const targetText = normalizedMessage.replace('concluir desafio', '').replace('finalizar desafio', '').trim();

        const challengeToComplete =
          pendingChallenges.find((challenge) =>
            normalizeText(challenge.challenge?.name || '').includes(targetText)
          ) || pendingChallenges[0];

        const result = await completeChallenge(challengeToComplete.id);

        if (result.error) {
          return `Nao consegui concluir o desafio agora: ${result.error.message}`;
        }

        return `Desafio marcado como concluido: ${challengeToComplete.challenge?.name}.`;
      }

      if (pendingChallenges.length === 0) {
        return 'Voce esta com todos os desafios em dia. Excelente trabalho.';
      }

      const list = pendingChallenges
        .slice(0, 4)
        .map((challenge) => `- ${challenge.challenge?.name} (${challenge.current_value}/${challenge.challenge?.target_value})`)
        .join('\n');

      return `Seus desafios pendentes:\n${list}\nSe quiser, diga: "concluir desafio <nome>".`;
    }

    if (
      normalizedMessage.includes('motiv') ||
      normalizedMessage.includes('desanim') ||
      normalizedMessage.includes('cansad')
    ) {
      const phrase = motivationalPhrases[Math.floor(Math.random() * motivationalPhrases.length)];
      return `${phrase} Quer que eu monte um treino curto para hoje?`;
    }

    if (
      normalizedMessage.includes('resumo') ||
      normalizedMessage.includes('status') ||
      normalizedMessage.includes('progresso')
    ) {
      return generateStatusSummary();
    }

    return [
      'Posso te ajudar com:',
      '- Treino: "montar treino focado em pernas 4 dias"',
      '- Dieta: "gerar dieta para perder peso"',
      '- Desafios: "quais desafios faltam?"',
      '- Lembretes: "me lembre de beber agua 09:30"',
      '- Notificacoes: "ativar notificacoes"',
    ].join('\n');
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
      appendMessage('assistant', 'Nao consegui concluir esse pedido agora. Tente novamente em instantes.');
    } finally {
      setIsThinking(false);
    }
  };

  const handleQuickPrompt = (prompt: string) => {
    setInput(prompt);
  };

  const toggleReminderDone = (reminderId: string) => {
    setReminders((current) =>
      current.map((reminder) =>
        reminder.id === reminderId
          ? {
              ...reminder,
              done: !reminder.done,
            }
          : reminder
      )
    );
  };

  const deleteReminder = (reminderId: string) => {
    setReminders((current) => current.filter((reminder) => reminder.id !== reminderId));
  };

  const quickPrompts = [
    'Montar treino focado em pernas 4 dias',
    'Gerar dieta para perder peso',
    'Como estao meus desafios?',
    'Me lembre de treinar 18:30',
    'Me da motivacao para hoje',
  ];

  const isLoadingStorage =
    (chatStorageKey !== null && loadedChatKey !== chatStorageKey) ||
    (reminderStorageKey !== null && loadedReminderKey !== reminderStorageKey);

  if (isLoadingStorage) {
    return (
      <div className="pb-24 md:pb-8">
        <Card className="glass-card">
          <CardContent className="py-16 text-center text-muted-foreground">
            Carregando assistente...
          </CardContent>
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
          Converse para montar treino, dieta, lembretes, desafios e outras tarefas do app.
        </p>
      </div>

      <Card className="glass-card">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-primary" />
              Chat do Assistente
            </CardTitle>
            <div className="flex items-center gap-2">
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
              <Button
                key={prompt}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => handleQuickPrompt(prompt)}
                className="text-xs"
              >
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
              placeholder="Digite seu pedido..."
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
            <p className="text-sm text-muted-foreground">
              Nenhum lembrete criado. Exemplo: "me lembre de tomar agua 09:30".
            </p>
          ) : (
            <div className="space-y-3">
              {sortedReminders.map((reminder) => (
                <div
                  key={reminder.id}
                  className={`rounded-xl border p-3 ${
                    reminder.done
                      ? 'bg-success/10 border-success/30'
                      : isOverdue(reminder)
                        ? 'bg-warning/10 border-warning/30'
                        : 'bg-secondary/30 border-border'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={`font-medium ${reminder.done ? 'line-through' : ''}`}>{reminder.title}</p>
                      <p className="text-xs text-muted-foreground">{formatReminderDate(reminder.dueAt)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => toggleReminderDone(reminder.id)}
                      >
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
              Treinos focados aplicados automaticamente
            </div>
            <div className="flex items-center gap-2">
              <Utensils className="w-4 h-4 text-success" />
              Dieta gerada e salva para o menu Dieta
            </div>
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-warning" />
              Motivacao, desafios e lembretes em um lugar
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
