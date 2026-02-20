import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';

export type AccentTheme =
  | 'blue'
  | 'green'
  | 'red'
  | 'purple'
  | 'pink'
  | 'orange'
  | 'neon-pink'
  | 'neon-green'
  | 'light-blue';

type AccentOption = {
  value: AccentTheme;
  label: string;
  preview: string;
};

const ACCENT_STORAGE_KEY = 'fit-journey.appearance.accent';
const DEFAULT_ACCENT_THEME: AccentTheme = 'green';

const ACCENT_OPTIONS: AccentOption[] = [
  { value: 'blue', label: 'Azul', preview: 'linear-gradient(135deg, #1d4ed8, #38bdf8)' },
  { value: 'green', label: 'Verde', preview: 'linear-gradient(135deg, #15803d, #84cc16)' },
  { value: 'red', label: 'Vermelho', preview: 'linear-gradient(135deg, #dc2626, #fb923c)' },
  { value: 'purple', label: 'Roxo', preview: 'linear-gradient(135deg, #6d28d9, #4f46e5)' },
  { value: 'pink', label: 'Rosa', preview: 'linear-gradient(135deg, #f97316, #db2777)' },
  { value: 'orange', label: 'Laranja', preview: 'linear-gradient(135deg, #ea580c, #facc15)' },
  { value: 'neon-pink', label: 'Rosa fluorescente', preview: 'linear-gradient(135deg, #ff00a8, #a855f7)' },
  { value: 'neon-green', label: 'Verde fluorescente', preview: 'linear-gradient(135deg, #7fff00, #00ffb3)' },
  { value: 'light-blue', label: 'Azul claro', preview: 'linear-gradient(135deg, #0ea5e9, #60a5fa)' },
];

type AppearanceContextValue = {
  accentTheme: AccentTheme;
  setAccentTheme: (accentTheme: AccentTheme) => void;
  accentOptions: AccentOption[];
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

const isAccentTheme = (value: string): value is AccentTheme =>
  ACCENT_OPTIONS.some((option) => option.value === value);

type AppearanceProviderProps = {
  children: ReactNode;
};

export function AppearanceProvider({ children }: AppearanceProviderProps) {
  const [accentTheme, setAccentThemeState] = useState<AccentTheme>(DEFAULT_ACCENT_THEME);

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(ACCENT_STORAGE_KEY);
      if (storedValue && isAccentTheme(storedValue)) {
        setAccentThemeState(storedValue);
      }
    } catch {
      // Ignore storage failures.
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-accent', accentTheme);
    try {
      window.localStorage.setItem(ACCENT_STORAGE_KEY, accentTheme);
    } catch {
      // Ignore storage failures.
    }
  }, [accentTheme]);

  const setAccentTheme = (nextAccentTheme: AccentTheme) => {
    setAccentThemeState(nextAccentTheme);
  };

  const value = useMemo(
    () => ({
      accentTheme,
      setAccentTheme,
      accentOptions: ACCENT_OPTIONS,
    }),
    [accentTheme]
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) {
    throw new Error('useAppearance must be used within AppearanceProvider');
  }
  return context;
}
