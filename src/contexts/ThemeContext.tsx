import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'mk-theme';
const DEFAULT_THEME: Theme = 'light';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (ctx === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
};

/** Read the persisted theme from localStorage (runs sync, before first paint). */
function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* localStorage unavailable (private mode / SSR) — fall through */
  }
  return DEFAULT_THEME;
}

/** Toggle the `light`/`dark` classes on <html> so both CSS-var tokens and
 *  Tailwind `dark:` variants (darkMode: 'class') track the active theme. */
function applyThemeClass(theme: Theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme === 'light');
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  // Keep the <html> class in sync with state (covers the initial mount too).
  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  // Apply + persist. DB write is best-effort and only when signed in; the
  // localStorage write makes the choice survive reloads even for guests and
  // gives an instant, flash-free read on the next visit.
  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    if (user?.id) {
      // NB: the supabase query builder is lazy — the request only fires when
      // `.then()`/`await` is invoked. `void supabase…eq()` (no then) silently
      // never sends, which is why theme writes used to no-op and reload reverted
      // to the stale DB value. Calling `.then()` here is what actually persists.
      void supabase
        .from('user_profiles')
        .update({ theme_preference: next, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .then(({ error }) => {
          if (error) {
            console.warn('[theme] failed to persist preference:', error.message);
          }
        });
    }
  }, [user?.id]);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  // On sign-in, hydrate from the user's saved preference. The DB row is the
  // source of truth across devices; localStorage is just the fast local cache.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('theme_preference')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled || error || !data) return;
      const stored = (data as { theme_preference?: string }).theme_preference;
      if (stored === 'light' || stored === 'dark') {
        setThemeState(stored);
        try {
          window.localStorage.setItem(STORAGE_KEY, stored);
        } catch {
          /* ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
