import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

const DEFAULT_ACCENT = '#d62718';
const STORAGE_KEY = 'aog.ui.accentColor';

type ThemeContextValue = {
  accentColor: string;
  setAccentColor: (color: string) => void;
  resetAccentColor: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function normalizeHexColor(value: string): string | null {
  const normalized = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : null;
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [accentColor, setAccentColorState] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored && normalizeHexColor(stored) ? stored : DEFAULT_ACCENT;
  });

  useEffect(() => {
    document.documentElement.style.setProperty('--aog-accent', accentColor);
    document.documentElement.style.setProperty('--aog-accent-dark', `color-mix(in srgb, ${accentColor} 15%, black)`);
    localStorage.setItem(STORAGE_KEY, accentColor);
  }, [accentColor]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      accentColor,
      setAccentColor(color) {
        const normalized = normalizeHexColor(color);
        if (!normalized) return;
        setAccentColorState(normalized);
      },
      resetAccentColor() {
        setAccentColorState(DEFAULT_ACCENT);
      },
    }),
    [accentColor],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme debe usarse dentro de ThemeProvider');
  }
  return context;
}

export { DEFAULT_ACCENT };
