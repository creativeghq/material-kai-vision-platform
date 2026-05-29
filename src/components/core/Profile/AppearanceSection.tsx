import React from 'react';
import { Moon, Sun, Palette } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { useTheme, type Theme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';

const OPTIONS: { value: Theme; label: string; description: string; icon: React.ElementType }[] = [
  { value: 'dark', label: 'Dark', description: 'Near-black surfaces, the platform default.', icon: Moon },
  { value: 'light', label: 'Light', description: 'Soft off-white surfaces for bright rooms.', icon: Sun },
];

/**
 * Appearance card — lets the user pick a light/dark theme. The choice is applied
 * instantly across the app and saved to their profile (and localStorage) so it
 * persists across reloads and devices. Mounted inside ProfileTab.
 */
export const AppearanceSection: React.FC = () => {
  const { theme, setTheme } = useTheme();

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5 text-primary" />
          Appearance
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Choose how the platform looks. Your choice is saved to your account and remembered next time.
        </p>
        <div
          role="radiogroup"
          aria-label="Color theme"
          className="grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          {OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = theme === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTheme(opt.value)}
                className={cn(
                  'flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors',
                  active
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/40 hover:bg-muted/50',
                )}
              >
                <span
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                    active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium">{opt.label}</span>
                    {active && (
                      <span className="text-[10px] uppercase tracking-wide text-primary">Active</span>
                    )}
                  </span>
                  <span className="block text-xs text-muted-foreground mt-0.5">{opt.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
