import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUser } from '@/context/UserContext';
import { X, Scale, Check } from 'lucide-react';

interface AddWeightModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddWeightModal({ isOpen, onClose }: AddWeightModalProps) {
  const [weight, setWeight] = useState('');
  const { addWeightEntry, user } = useUser();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (weight && parseFloat(weight) > 0) {
      addWeightEntry(parseFloat(weight));
      setWeight('');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm fade-in">
      <div className="glass-card w-full max-w-sm p-6 slide-up">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Registrar Peso</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <div className="flex items-center justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
                <Scale className="w-8 h-8 text-primary" />
              </div>
            </div>

            {user && (
              <p className="text-center text-muted-foreground text-sm mb-4">
                Peso anterior: <span className="text-foreground font-medium">{user.weight} kg</span>
              </p>
            )}

            <div className="relative">
              <Input
                type="number"
                placeholder="Novo peso"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="text-center text-2xl h-16 pr-12"
                step="0.1"
                min="1"
                autoFocus
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                kg
              </span>
            </div>
          </div>

          <Button type="submit" variant="energy" size="lg" className="w-full" disabled={!weight || parseFloat(weight) <= 0}>
            <Check className="w-5 h-5" />
            Salvar Registro
          </Button>
        </form>
      </div>
    </div>
  );
}
