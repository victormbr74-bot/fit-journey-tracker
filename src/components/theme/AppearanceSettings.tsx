import { Check, Moon, Palette, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

import { useAppearance } from '@/context/AppearanceContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function AppearanceSettings() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { accentTheme, setAccentTheme, accentOptions } = useAppearance();

  return (
    <section className="glass-card mb-6 p-6">
      <div className="mb-4 flex items-center gap-2">
        <Palette className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Aparencia</h3>
      </div>

      <div className="mb-5">
        <p className="mb-2 text-sm font-medium">Tema</p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={resolvedTheme === 'light' ? 'default' : 'outline'}
            onClick={() => setTheme('light')}
            className="justify-start"
          >
            <Sun className="h-4 w-4" />
            Claro
          </Button>
          <Button
            type="button"
            variant={resolvedTheme === 'dark' ? 'default' : 'outline'}
            onClick={() => setTheme('dark')}
            className="justify-start"
          >
            <Moon className="h-4 w-4" />
            Escuro
          </Button>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Paleta de cores</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {accentOptions.map((option) => {
            const isActive = option.value === accentTheme;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setAccentTheme(option.value)}
                className={cn(
                  'relative flex items-center gap-2 rounded-xl border px-2 py-2 text-left text-xs transition-colors',
                  isActive
                    ? 'border-primary bg-primary/10'
                    : 'border-border/70 bg-card/50 hover:border-primary/40 hover:bg-secondary/50'
                )}
              >
                <span
                  className="h-6 w-6 shrink-0 rounded-full border border-white/35"
                  style={{ background: option.preview }}
                />
                <span className="line-clamp-1">{option.label}</span>
                {isActive && (
                  <Check className="ml-auto h-3.5 w-3.5 text-primary" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Tema atual: {theme === 'dark' ? 'Escuro' : theme === 'light' ? 'Claro' : 'Sistema'}.
      </p>
    </section>
  );
}

