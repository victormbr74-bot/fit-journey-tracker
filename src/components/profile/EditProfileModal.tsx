import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useProfile } from '@/hooks/useProfile';
import { GOALS, MUSCLE_GROUPS, Goal } from '@/types/user';
import { Edit, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function EditProfileModal() {
  const { profile, updateProfile } = useProfile();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [name, setName] = useState(profile?.name || '');
  const [birthdate, setBirthdate] = useState(profile?.birthdate || '');
  const [weight, setWeight] = useState(profile?.weight?.toString() || '');
  const [height, setHeight] = useState(profile?.height?.toString() || '');
  const [goal, setGoal] = useState<Goal['id'] | null>(profile?.goal || null);
  const [selectedMuscles, setSelectedMuscles] = useState<string[]>(profile?.muscle_groups || []);
  const [frequency, setFrequency] = useState(profile?.training_frequency || 3);

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && profile) {
      setName(profile.name);
      setBirthdate(profile.birthdate || '');
      setWeight(profile.weight?.toString() || '');
      setHeight(profile.height?.toString() || '');
      setGoal(profile.goal);
      setSelectedMuscles(profile.muscle_groups || []);
      setFrequency(profile.training_frequency || 3);
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
    setSelectedMuscles(prev => 
      prev.includes(muscleId) 
        ? prev.filter(m => m !== muscleId)
        : [...prev, muscleId]
    );
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    if (!birthdate) {
      toast.error('Data de nascimento é obrigatória');
      return;
    }

    const parsedWeight = parseFloat(weight);
    const parsedHeight = parseFloat(height);

    if (isNaN(parsedWeight) || parsedWeight <= 0) {
      toast.error('Peso inválido');
      return;
    }

    if (isNaN(parsedHeight) || parsedHeight <= 0) {
      toast.error('Altura inválida');
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

    setLoading(true);

    const age = calculateAge(birthdate);

    const { error } = await updateProfile({
      name: name.trim(),
      birthdate,
      age,
      weight: parsedWeight,
      height: parsedHeight,
      goal,
      muscle_groups: selectedMuscles,
      training_frequency: frequency,
    });

    setLoading(false);

    if (error) {
      toast.error('Erro ao salvar alterações');
      console.error(error);
    } else {
      toast.success('Perfil atualizado com sucesso! 🎉');
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
          {/* Nome */}
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
            />
          </div>

          {/* Data de nascimento */}
          <div className="space-y-2">
            <Label htmlFor="birthdate">Data de Nascimento</Label>
            <Input
              id="birthdate"
              type="date"
              value={birthdate}
              onChange={(e) => setBirthdate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
            />
          </div>

          {/* Peso */}
          <div className="space-y-2">
            <Label htmlFor="weight">Peso (kg)</Label>
            <Input
              id="weight"
              type="number"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="Seu peso"
              min="1"
              step="0.1"
            />
          </div>

          {/* Altura */}
          <div className="space-y-2">
            <Label htmlFor="height">Altura (cm)</Label>
            <Input
              id="height"
              type="number"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              placeholder="Sua altura"
              min="1"
            />
          </div>

          {/* Objetivo */}
          <div className="space-y-2">
            <Label>Objetivo</Label>
            <div className="grid grid-cols-2 gap-2">
              {GOALS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGoal(g.id)}
                  className={`p-3 rounded-xl border-2 transition-all duration-300 flex flex-col items-center gap-1 ${
                    goal === g.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-secondary/30 hover:border-primary/50'
                  }`}
                >
                  <span className="text-2xl">{g.icon}</span>
                  <span className="font-medium text-xs">{g.label}</span>
                  {goal === g.id && (
                    <Check className="w-4 h-4 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Grupos Musculares */}
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
                  {selectedMuscles.includes(muscle.id) && (
                    <Check className="w-4 h-4 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Frequência de Treino */}
          <div className="space-y-2">
            <Label>Frequência Semanal</Label>
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

          {/* Botões */}
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              className="flex-1"
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              variant="energy"
              onClick={handleSave}
              className="flex-1"
              disabled={loading}
            >
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
