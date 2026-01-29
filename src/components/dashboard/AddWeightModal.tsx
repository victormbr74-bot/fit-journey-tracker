import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useProfile } from '@/hooks/useProfile';
import { Scale, Plus } from 'lucide-react';
import { toast } from 'sonner';

interface AddWeightModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddWeightModal({ isOpen, onClose }: AddWeightModalProps) {
  const [weight, setWeight] = useState('');
  const [loading, setLoading] = useState(false);
  const { addWeightEntry, profile } = useProfile();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!weight || parseFloat(weight) <= 0) {
      toast.error('Por favor, insira um peso válido');
      return;
    }

    setLoading(true);
    const { error } = await addWeightEntry(parseFloat(weight));
    
    if (error) {
      toast.error('Erro ao registrar peso');
    } else {
      toast.success('Peso registrado! +10 pontos 🎉');
      setWeight('');
      onClose();
    }
    setLoading(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-primary" />
            Registrar Peso
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {profile && (
            <p className="text-center text-muted-foreground text-sm">
              Peso anterior: <span className="text-foreground font-medium">{profile.weight} kg</span>
            </p>
          )}
          
          <div className="relative">
            <Input
              type="number"
              placeholder="Seu peso"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="text-center text-2xl h-16 pr-12"
              min="1"
              step="0.1"
              autoFocus
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
              kg
            </span>
          </div>
          
          <Button
            type="submit"
            variant="energy"
            className="w-full"
            disabled={loading || !weight || parseFloat(weight) <= 0}
          >
            <Plus className="w-4 h-4" />
            {loading ? 'Salvando...' : 'Registrar'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
