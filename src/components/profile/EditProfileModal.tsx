import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useProfile } from '@/hooks/useProfile';
import { Switch } from '@/components/ui/switch';
import { GOALS, MUSCLE_GROUPS, Goal } from '@/types/user';
import { Edit, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatHandleInput, getHandleBodyLimits, isValidHandle, toHandle } from '@/lib/handleUtils';

type HandleState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

const { min: handleMinLength, max: handleMaxLength } = getHandleBodyLimits();

export function EditProfileModal() {
  const { checkHandleAvailability, profile, reserveUniqueHandle, updateProfile } = useProfile();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState(profile?.name || '');
  const [handle, setHandle] = useState(profile?.handle || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [birthdate, setBirthdate] = useState(profile?.birthdate || '');
  const [weight, setWeight] = useState(profile?.weight?.toString() || '');
  const [height, setHeight] = useState(profile?.height?.toString() || '');
  const [goal, setGoal] = useState<Goal['id'] | null>(profile?.goal || null);
  const [selectedMuscles, setSelectedMuscles] = useState<string[]>(profile?.muscle_groups || []);
  const [frequency, setFrequency] = useState(profile?.training_frequency || 3);
  const [hasPersonalPackage, setHasPersonalPackage] = useState(Boolean(profile?.has_personal_package));
  const [hasNutritionistPackage, setHasNutritionistPackage] = useState(Boolean(profile?.has_nutritionist_package));
  const [handleState, setHandleState] = useState<HandleState>('idle');
  const [handleHint, setHandleHint] = useState('');
  const isClientAccount = profile?.profile_type === 'client';

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && profile) {
      setName(profile.name);
      setHandle(profile.handle || '');
      setPhone(profile.phone || '');
      setBirthdate(profile.birthdate || '');
      setWeight(profile.weight?.toString() || '');
      setHeight(profile.height?.toString() || '');
      setGoal(profile.goal);
      setSelectedMuscles(profile.muscle_groups || []);
      setFrequency(profile.training_frequency || 3);
      setHasPersonalPackage(Boolean(profile.has_personal_package));
      setHasNutritionistPackage(Boolean(profile.has_nutritionist_package));
      setHandleState('idle');
      setHandleHint('');
    }
  };

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

  const toggleMuscle = (muscleId: string) => {
    setSelectedMuscles((prev) =>
      prev.includes(muscleId) ? prev.filter((m) => m !== muscleId) : [...prev, muscleId]
    );
  };

  const validateHandleAvailability = async () => {
    if (!profile) return false;

    const normalizedHandle = toHandle(handle || profile.handle || profile.name);
    setHandle(normalizedHandle);

    if (!isValidHandle(normalizedHandle)) {
      setHandleState('invalid');
      setHandleHint(`Use ${handleMinLength}-${handleMaxLength} caracteres validos.`);
      return false;
    }

    if (normalizedHandle === profile.handle) {
      setHandleState('available');
      setHandleHint('Este e o seu @usuario atual.');
      return true;
    }

    setHandleState('checking');
    const { available, error } = await checkHandleAvailability(normalizedHandle, true);
    if (error) {
      setHandleState('idle');
      setHandleHint('Nao foi possivel validar agora.');
      return false;
    }

    if (available) {
      setHandleState('available');
      setHandleHint('@usuario disponivel.');
      return true;
    }

    const { handle: suggestedHandle } = await reserveUniqueHandle(normalizedHandle, true);
    setHandleState('taken');
    if (suggestedHandle) {
      setHandleHint(`@usuario indisponivel. Sugestao: ${suggestedHandle}`);
    } else {
      setHandleHint('@usuario indisponivel.');
    }
    return false;
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Nome e obrigatorio');
      return;
    }

    const normalizedPhone = phone.trim();
    if (normalizedPhone && !/^[0-9()+\-\s]{8,20}$/.test(normalizedPhone)) {
      toast.error('Celular invalido');
      return;
    }

    let parsedWeight = profile?.weight || 0;
    let parsedHeight = profile?.height || 0;
    let age = profile?.age || 0;

    if (isClientAccount) {
      if (!birthdate) {
        toast.error('Data de nascimento e obrigatoria');
        return;
      }

      parsedWeight = parseFloat(weight);
      parsedHeight = parseFloat(height);

      if (isNaN(parsedWeight) || parsedWeight <= 0) {
        toast.error('Peso invalido');
        return;
      }

      if (isNaN(parsedHeight) || parsedHeight <= 0) {
        toast.error('Altura invalida');
        return;
      }

      if (!goal) {
        toast.error('Selecione um objetivo');
        return;
      }

      if (selectedMuscles.length === 0) {
        toast.error('Selecione pelo menos um grupo muscular');
        return;
      }

      age = calculateAge(birthdate);
    }

    const normalizedHandle = toHandle(handle || profile?.handle || name);
    setHandle(normalizedHandle);

    if (!isValidHandle(normalizedHandle)) {
      setHandleState('invalid');
      setHandleHint(`Use ${handleMinLength}-${handleMaxLength} caracteres validos.`);
      toast.error('Formato de @usuario invalido');
      return;
    }

    if (profile?.handle !== normalizedHandle) {
      const isAvailable = await validateHandleAvailability();
      if (!isAvailable) {
        toast.error('Escolha um @usuario disponivel.');
        return;
      }
    }

    setLoading(true);

    const { error } = await updateProfile({
      name: name.trim(),
      handle: normalizedHandle,
      phone: normalizedPhone,
      ...(isClientAccount
        ? {
            birthdate,
            age,
            weight: parsedWeight,
            height: parsedHeight,
            goal: goal || 'maintain',
            muscle_groups: selectedMuscles,
            training_frequency: frequency,
            has_personal_package: hasPersonalPackage,
            has_nutritionist_package: hasNutritionistPackage,
          }
        : {}),
    });

    setLoading(false);

    if (error) {
      toast.error('Erro ao salvar alteracoes');
      console.error(error);
    } else {
      toast.success('Perfil atualizado com sucesso!');
      setOpen(false);
    }
  };

  if (!profile) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Edit className="w-4 h-4" />
          Editar Perfil
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Dados Pessoais</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Seu nome"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="handle">@usuario</Label>
            <div className="flex gap-2">
              <Input
                id="handle"
                value={handle}
                onChange={(event) => {
                  setHandle(formatHandleInput(event.target.value));
                  setHandleState('idle');
                  setHandleHint('');
                }}
                placeholder="@seu.usuario"
              />
              <Button
                type="button"
                variant="outline"
                onClick={validateHandleAvailability}
                disabled={handleState === 'checking'}
              >
                {handleState === 'checking' ? 'Validando...' : 'Verificar'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {handleHint || `Permitido: ${handleMinLength}-${handleMaxLength} caracteres, letras, numeros, . e _.`}
            </p>
          </div>

          <div className="rounded-lg border border-border/70 bg-secondary/20 p-3 text-xs text-muted-foreground space-y-1">
            <p>Tipo de conta definido no cadastro e nao pode ser alterado por esta tela.</p>
            {profile.profile_type !== 'client' && (
              <p>A liberacao da area profissional depende da confirmacao da mensalidade.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Celular</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="(11) 99999-9999"
              autoComplete="tel"
            />
            <p className="text-xs text-muted-foreground">
              Opcional. Use apenas numeros e sinais comuns.
            </p>
          </div>

          {isClientAccount && (
            <>
              <div className="space-y-3 rounded-lg border border-border/70 p-4">
                <div>
                  <Label className="text-sm">Pacotes Profissionais</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ative para liberar planos personalizados com personal ou nutricionista.
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Pacote com personal</p>
                    <p className="text-xs text-muted-foreground">
                      Libera recebimento de treino personalizado.
                    </p>
                  </div>
                  <Switch checked={hasPersonalPackage} onCheckedChange={setHasPersonalPackage} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Pacote com nutricionista</p>
                    <p className="text-xs text-muted-foreground">
                      Libera recebimento de dieta personalizada.
                    </p>
                  </div>
                  <Switch
                    checked={hasNutritionistPackage}
                    onCheckedChange={setHasNutritionistPackage}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="birthdate">Data de Nascimento</Label>
                <Input
                  id="birthdate"
                  type="date"
                  value={birthdate}
                  onChange={(event) => setBirthdate(event.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="weight">Peso (kg)</Label>
                <Input
                  id="weight"
                  type="number"
                  value={weight}
                  onChange={(event) => setWeight(event.target.value)}
                  placeholder="Seu peso"
                  min="1"
                  step="0.1"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="height">Altura (cm)</Label>
                <Input
                  id="height"
                  type="number"
                  value={height}
                  onChange={(event) => setHeight(event.target.value)}
                  placeholder="Sua altura"
                  min="1"
                />
              </div>

              <div className="space-y-2">
                <Label>Objetivo</Label>
                <div className="grid grid-cols-2 gap-2">
                  {GOALS.map((currentGoal) => (
                    <button
                      key={currentGoal.id}
                      type="button"
                      onClick={() => setGoal(currentGoal.id)}
                      className={`p-3 rounded-xl border-2 transition-all duration-300 flex flex-col items-center gap-1 ${
                        goal === currentGoal.id
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-secondary/30 hover:border-primary/50'
                      }`}
                    >
                      <span className="text-2xl">{currentGoal.icon}</span>
                      <span className="font-medium text-xs">{currentGoal.label}</span>
                      {goal === currentGoal.id && <Check className="w-4 h-4 text-primary" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Grupos Musculares</Label>
                <div className="grid grid-cols-2 gap-2">
                  {MUSCLE_GROUPS.map((muscle) => (
                    <button
                      key={muscle.id}
                      type="button"
                      onClick={() => toggleMuscle(muscle.id)}
                      className={`p-3 rounded-xl border-2 transition-all duration-300 flex flex-col items-center gap-1 ${
                        selectedMuscles.includes(muscle.id)
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-secondary/30 hover:border-primary/50'
                      }`}
                    >
                      <span className="text-xl">{muscle.icon}</span>
                      <span className="font-medium text-xs">{muscle.label}</span>
                      {selectedMuscles.includes(muscle.id) && <Check className="w-4 h-4 text-primary" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Frequencia Semanal</Label>
                <div className="grid grid-cols-7 gap-1">
                  {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setFrequency(day)}
                      className={`p-2 rounded-lg border-2 transition-all duration-300 flex flex-col items-center ${
                        frequency === day
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-secondary/30 hover:border-primary/50'
                      }`}
                    >
                      <span className="text-sm font-bold">{day}</span>
                    </button>
                  ))}
                </div>
                <p className="text-center text-sm text-muted-foreground">
                  {frequency} {frequency === 1 ? 'dia' : 'dias'} por semana
                </p>
              </div>
            </>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              className="flex-1"
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button variant="energy" onClick={handleSave} className="flex-1" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Salvando...
                </>
              ) : (
                'Salvar'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
