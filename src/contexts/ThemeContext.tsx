import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type Theme = 'light' | 'dark';
export type Accent = 'green' | 'blue';

const STORAGE_KEY = 'mk-theme';
const ACCENT_STORAGE_KEY = 'mk-accent';
const DEFAULT_THEME: Theme = 'dark';
const DEFAULT_ACCENT: Accent = 'green';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  accent: Accent;
  setAccent: (accent: Accent) => void;
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

/** Read the persisted accent from localStorage (runs sync, before first paint). */
function readStoredAccent(): Accent {
  if (typeof window === 'undefined') return DEFAULT_ACCENT;
  try {
    const stored = window.localStorage.getItem(ACCENT_STORAGE_KEY);
    if (stored === 'green' || stored === 'blue') return stored;
  } catch {
    /* localStorage unavailable — fall through */
  }
  return DEFAULT_ACCENT;
}

/** Toggle the `light`/`dark` classes on <html> so both CSS-var tokens and
 *  Tailwind `dark:` variants (darkMode: 'class') track the active theme. */
function applyThemeClass(theme: Theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme === 'light');
}

/** Stamp `data-accent` on <html> so the CSS accent-override blocks apply.
 *  `green` is the default (no override needed) but we still set the attribute
 *  so the value is inspectable and future accents are a pure-CSS add. */
function applyAccentAttr(accent: Accent) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-accent', accent);
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const [accent, setAccentState] = useState<Accent>(readStoredAccent);

  // Keep the <html> class in sync with state (covers the initial mount too).
  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  // Keep the <html> data-accent attribute in sync with state.
  useEffect(() => {
    applyAccentAttr(accent);
  }, [accent]);

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

  // Apply + persist the accent, mirroring setTheme exactly (localStorage for a
  // flash-free guest read, best-effort DB write for cross-device when signed in).
  const setAccent = useCallback((next: Accent) => {
    setAccentState(next);
    try {
      window.localStorage.setItem(ACCENT_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    if (user?.id) {
      void supabase
        .from('user_profiles')
        .update({ accent_preference: next, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .then(({ error }) => {
          if (error) {
            console.warn('[theme] failed to persist accent:', error.message);
          }
        });
    }
  }, [user?.id]);

  // On sign-in, hydrate from the user's saved preference. The DB row is the
  // source of truth across devices; localStorage is just the fast local cache.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('theme_preference, accent_preference')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled || error || !data) return;
      const row = data as { theme_preference?: string; accent_preference?: string };
      if (row.theme_preference === 'light' || row.theme_preference === 'dark') {
        setThemeState(row.theme_preference);
        try {
          window.localStorage.setItem(STORAGE_KEY, row.theme_preference);
        } catch {
          /* ignore */
        }
      }
      if (row.accent_preference === 'green' || row.accent_preference === 'blue') {
        setAccentState(row.accent_preference);
        try {
          window.localStorage.setItem(ACCENT_STORAGE_KEY, row.accent_preference);
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
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, accent, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
};
