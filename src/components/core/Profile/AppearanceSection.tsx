import React from 'react';
import { Moon, Sun, Palette, Check } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { useTheme, type Theme, type Accent } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';

const OPTIONS: { value: Theme; label: string; description: string; icon: React.ElementType }[] = [
  { value: 'dark', label: 'Dark', description: 'Near-black surfaces, the platform default.', icon: Moon },
  { value: 'light', label: 'Light', description: 'Soft off-white surfaces for bright rooms.', icon: Sun },
];

/** Accent schemes. `gradient` / `solid` mirror the CSS tokens so the swatch is a
 *  faithful live preview of what the app will look like once selected. */
const ACCENT_OPTIONS: {
  value: Accent;
  label: string;
  description: string;
  gradient: string;
  solid: string;
}[] = [
  {
    value: 'green',
    label: 'Olive',
    description: 'Warm quiet-luxury khaki. The platform default.',
    gradient: 'linear-gradient(135deg, #4a4726 0%, #65623c 46%, #8f8c5a 100%)',
    solid: '#7d7a4e',
  },
  {
    value: 'blue',
    label: 'Blue',
    description: 'Deep B2B navy-to-blue. Crisp and corporate.',
    gradient: 'linear-gradient(135deg, #0f2547 0%, #1c5091 46%, #2f6fed 100%)',
    solid: '#1e5ecc',
  },
];

/**
 * Appearance card — lets the user pick a light/dark theme. The choice is applied
 * instantly across the app and saved to their profile (and localStorage) so it
 * persists across reloads and devices. Mounted inside ProfileTab.
 */
export const AppearanceSection: React.FC = () => {
  const { theme, setTheme, accent, setAccent } = useTheme();

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

        {/* Accent color picker — gradient swatches, applies to both light & dark */}
        <div className="mt-8">
          <div className="flex items-baseline justify-between mb-1">
            <h3 className="text-sm font-medium">Accent color</h3>
            <span className="text-[11px] text-muted-foreground">Applies to light &amp; dark</span>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Sets the primary buttons, focus rings, active nav and identity gradient.
          </p>
          <div
            role="radiogroup"
            aria-label="Accent color"
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
          >
            {ACCENT_OPTIONS.map((opt) => {
              const active = accent === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setAccent(opt.value)}
                  className={cn(
                    'group relative flex flex-col gap-3 rounded-xl border-2 p-3 text-left transition-colors',
                    active
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/40 hover:bg-muted/50',
                  )}
                >
                  {/* Gradient preview bar with a solid-primary chip riding on it */}
                  <span
                    className="relative h-14 w-full overflow-hidden rounded-lg ring-1 ring-black/10"
                    style={{ background: opt.gradient }}
                  >
                    <span
                      className="absolute bottom-2 left-2 h-7 w-7 rounded-full ring-2 ring-white/80 shadow"
                      style={{ background: opt.solid }}
                    />
                    {active && (
                      <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-black shadow">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    )}
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
        </div>
      </CardContent>
    </Card>
  );
};
