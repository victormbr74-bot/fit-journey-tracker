import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { GOALS, MUSCLE_GROUPS, Goal } from '@/types/user';
import { ArrowRight, ArrowLeft, Check, Ruler, Weight, Calendar, Target, Dumbbell, Clock, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { formatHandleInput, getHandleBodyLimits, isValidHandle, toHandle } from '@/lib/handleUtils';

type Step = 'handle' | 'phone' | 'birthdate' | 'weight' | 'height' | 'goal' | 'muscles' | 'frequency';

const steps: Step[] = ['handle', 'phone', 'birthdate', 'weight', 'height', 'goal', 'muscles', 'frequency'];
const { min: handleMinLength, max: handleMaxLength } = getHandleBodyLimits();

export function OnboardingFlow() {
  const [currentStep, setCurrentStep] = useState(0);
  const [handle, setHandle] = useState('');
  const [phone, setPhone] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [goal, setGoal] = useState<Goal['id'] | null>(null);
  const [selectedMuscles, setSelectedMuscles] = useState<string[]>([]);
  const [frequency, setFrequency] = useState(3);
  const [loading, setLoading] = useState(false);
  const [checkingHandle, setCheckingHandle] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  
  const { user, signOut } = useAuth();
  const { checkHandleAvailability, createProfile, reserveUniqueHandle } = useProfile();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    const seed = user.name || user.email?.split('@')[0] || 'fit.user';
    setHandle(toHandle(seed));
    setPhone(user.phone || '');
  }, [user]);

  const calculateAge = (dateString: string): number => {
    const today = new Date();
    const birth = new Date(dateString);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const handleNext = async () => {
    if (steps[currentStep] === 'handle') {
      const normalizedHandle = toHandle(handle);
      if (!isValidHandle(normalizedHandle)) {
        toast.error(`Use um @usuario com ${handleMinLength} a ${handleMaxLength} caracteres.`);
        return;
      }

      setCheckingHandle(true);
      const { available, error } = await checkHandleAvailability(normalizedHandle, false);
      if (error) {
        toast.error('Nao foi possivel validar o @usuario agora.');
        setCheckingHandle(false);
        return;
      }
      if (!available) {
        const { handle: suggestedHandle } = await reserveUniqueHandle(normalizedHandle, false);
        if (suggestedHandle) {
          setHandle(suggestedHandle);
          toast.error(`Esse @usuario ja existe. Sugestao: ${suggestedHandle}`);
        } else {
          toast.error('Esse @usuario ja esta em uso.');
        }
        setCheckingHandle(false);
        return;
      }
      setHandle(normalizedHandle);
      setCheckingHandle(false);
    }

    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
      return;
    }

    if (goal && user) {
      setLoading(true);
      const age = calculateAge(birthdate);

      const { error } = await createProfile({
        name: user.name || user.email?.split('@')[0] || 'Usuario',
        handle: toHandle(handle),
        email: user.email || '',
        phone: phone.trim() || user.phone || '',
        birthdate,
        age,
        weight: parseFloat(weight),
        height: parseFloat(height),
        goal,
        muscle_groups: selectedMuscles,
        training_frequency: frequency,
      });

      if (error) {
        toast.error(error.message || 'Erro ao salvar perfil. Tente novamente.');
        console.error(error);
      } else {
        toast.success('Perfil criado com sucesso!');
        navigate('/dashboard');
      }
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleCancel = async () => {
    if (loading || checkingHandle || cancelling) return;

    setCancelling(true);
    const { error } = await signOut();

    if (error) {
      toast.error('Nao foi possivel cancelar agora.');
      setCancelling(false);
      return;
    }

    toast.info('Checklist cancelado.');
    navigate('/');
  };

  const toggleMuscle = (muscleId: string) => {
    setSelectedMuscles(prev => 
      prev.includes(muscleId) 
        ? prev.filter(m => m !== muscleId)
        : [...prev, muscleId]
    );
  };

  const canProceed = () => {
    switch (steps[currentStep]) {
      case 'handle':
        return isValidHandle(toHandle(handle));
      case 'birthdate': {
        if (!birthdate) return false;
        const age = calculateAge(birthdate);
        return age >= 10 && age <= 120;
      }
      case 'phone':
        return !phone.trim() || /^[0-9()+\-\s]{8,20}$/.test(phone.trim());
      case 'weight':
        return weight && parseFloat(weight) > 0;
      case 'height':
        return height && parseFloat(height) > 0;
      case 'goal':
        return goal !== null;
      case 'muscles':
        return selectedMuscles.length > 0;
      case 'frequency':
        return frequency >= 1 && frequency <= 7;
      default:
        return false;
    }
  };

  const renderStep = () => {
    const stepConfig = {
      handle: {
        icon: Target,
        title: 'Escolha seu @usuario',
        subtitle: 'Seu @ sera unico e pode ser alterado no perfil',
      },
      phone: {
        icon: Smartphone,
        title: 'Qual seu celular?',
        subtitle: 'Opcional, para facilitar contato e recuperacao',
      },
      birthdate: {
        icon: Calendar,
        title: 'Qual sua data de nascimento?',
        subtitle: 'Isso nos ajuda a personalizar seus treinos',
      },
      weight: {
        icon: Weight,
        title: 'Qual seu peso atual?',
        subtitle: 'Em quilogramas (kg)',
      },
      height: {
        icon: Ruler,
        title: 'Qual sua altura?',
        subtitle: 'Em centímetros (cm)',
      },
      goal: {
        icon: Target,
        title: 'Qual seu objetivo?',
        subtitle: 'Escolha o que mais combina com você',
      },
      muscles: {
        icon: Dumbbell,
        title: 'Quais grupos musculares deseja treinar?',
        subtitle: 'Selecione todos os que desejar',
      },
      frequency: {
        icon: Clock,
        title: 'Quantas vezes por semana você treina?',
        subtitle: 'Selecione a frequência ideal',
      },
    };

    const config = stepConfig[steps[currentStep]];
    const Icon = config.icon;

    return (
      <div className="slide-up">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-primary/20 rounded-2xl flex items-center justify-center mb-4">
            <Icon className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-center">{config.title}</h2>
          <p className="text-muted-foreground text-center mt-2">{config.subtitle}</p>
        </div>

        {steps[currentStep] === 'handle' && (
          <div className="space-y-3">
            <Input
              type="text"
              value={handle}
              onChange={(event) => setHandle(formatHandleInput(event.target.value))}
              className="text-center text-xl h-16"
              placeholder="@seu.usuario"
            />
            <p className="text-xs text-muted-foreground text-center">
              Use letras minusculas, numeros, ponto e underscore.
            </p>
          </div>
        )}

        {steps[currentStep] === 'birthdate' && (
          <Input
            type="date"
            value={birthdate}
            onChange={(e) => setBirthdate(e.target.value)}
            className="text-center text-xl h-16"
            max={new Date().toISOString().split('T')[0]}
          />
        )}

        {steps[currentStep] === 'phone' && (
          <div className="space-y-3">
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="text-center text-xl h-16"
              placeholder="(11) 99999-9999"
              autoComplete="tel"
            />
            <p className="text-xs text-muted-foreground text-center">
              Campo opcional. Se preencher, use apenas numeros e sinais comuns.
            </p>
          </div>
        )}

        {steps[currentStep] === 'weight' && (
          <div className="relative">
            <Input
              type="number"
              placeholder="Seu peso"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="text-center text-2xl h-16 pr-12"
              min="1"
              step="0.1"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
              kg
            </span>
          </div>
        )}

        {steps[currentStep] === 'height' && (
          <div className="relative">
            <Input
              type="number"
              placeholder="Sua altura"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              className="text-center text-2xl h-16 pr-12"
              min="1"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
              cm
            </span>
          </div>
        )}

        {steps[currentStep] === 'goal' && (
          <div className="grid grid-cols-2 gap-3">
            {GOALS.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setGoal(g.id)}
                className={`p-4 rounded-xl border-2 transition-all duration-300 flex flex-col items-center gap-2 ${
                  goal === g.id
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-secondary/30 hover:border-primary/50'
                }`}
              >
                <span className="text-3xl">{g.icon}</span>
                <span className="font-medium text-sm">{g.label}</span>
                {goal === g.id && (
                  <Check className="w-5 h-5 text-primary" />
                )}
              </button>
            ))}
          </div>
        )}

        {steps[currentStep] === 'muscles' && (
          <div className="grid grid-cols-2 gap-3">
            {MUSCLE_GROUPS.map((muscle) => (
              <button
                key={muscle.id}
                type="button"
                onClick={() => toggleMuscle(muscle.id)}
                className={`p-4 rounded-xl border-2 transition-all duration-300 flex flex-col items-center gap-2 ${
                  selectedMuscles.includes(muscle.id)
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-secondary/30 hover:border-primary/50'
                }`}
              >
                <span className="text-2xl">{muscle.icon}</span>
                <span className="font-medium text-sm">{muscle.label}</span>
                {selectedMuscles.includes(muscle.id) && (
                  <Check className="w-5 h-5 text-primary" />
                )}
              </button>
            ))}
          </div>
        )}

        {steps[currentStep] === 'frequency' && (
          <div className="space-y-4">
            <div className="grid grid-cols-7 gap-2">
              {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => setFrequency(day)}
                  className={`p-4 rounded-xl border-2 transition-all duration-300 flex flex-col items-center gap-1 ${
                    frequency === day
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-secondary/30 hover:border-primary/50'
                  }`}
                >
                  <span className="text-xl font-bold">{day}</span>
                  <span className="text-xs text-muted-foreground">
                    {day === 1 ? 'vez' : 'vezes'}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-center text-muted-foreground">
              {frequency} {frequency === 1 ? 'dia' : 'dias'} por semana
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-32 w-64 h-64 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`h-2 flex-1 mx-1 rounded-full transition-all duration-500 ${
                  index <= currentStep ? 'bg-primary' : 'bg-secondary'
                }`}
              />
            ))}
          </div>
          <p className="text-center text-sm text-muted-foreground">
            Passo {currentStep + 1} de {steps.length}
          </p>
        </div>

        {/* Welcome message */}
        {currentStep === 0 && user && (
          <p className="text-center text-lg mb-4 fade-in">
            Olá, <span className="text-primary font-semibold">{user.name || user.email?.split('@')[0]}</span>! 👋
          </p>
        )}

        {/* Form Card */}
        <div className="glass-card p-6 md:p-8">
          {renderStep()}

          <div className="flex gap-3 mt-8">
            <Button
              type="button"
              variant="ghost"
              size="lg"
              onClick={handleCancel}
              className="px-4"
              disabled={loading || checkingHandle || cancelling}
            >
              {cancelling ? 'Cancelando...' : 'Cancelar'}
            </Button>
            {currentStep > 0 && (
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={handleBack}
                className="flex-1"
                disabled={loading || cancelling}
              >
                <ArrowLeft className="w-5 h-5" />
                Voltar
              </Button>
            )}
            <Button
              type="button"
              variant="energy"
              size="lg"
              onClick={handleNext}
              disabled={!canProceed() || loading || checkingHandle || cancelling}
              className="flex-1"
            >
              {loading ? 'Salvando...' : checkingHandle ? 'Validando @...' : currentStep === steps.length - 1 ? 'Comecar' : 'Proximo'}
              <ArrowRight className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}




