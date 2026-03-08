import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

const KEY = 'datatools-theme';

interface ThemeContextType {
  dark: boolean;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY);
      if (stored === 'dark') setDark(true);
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('dark-mode', dark);
    try {
      localStorage.setItem(KEY, dark ? 'dark' : 'light');
    } catch {}
  }, [dark]);
  const toggle = () => setDark((d) => !d);
  return <ThemeContext.Provider value={{ dark, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  return ctx ?? { dark: false, toggle: () => {} };
}
