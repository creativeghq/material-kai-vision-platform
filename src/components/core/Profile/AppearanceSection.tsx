import React from 'react';
import { Moon, Sun, Palette, Check } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { useTheme, type Theme, type Accent } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';

const OPTIONS: { value: Theme; label: string; description: string; icon: React.ElementType }[] = [
  { value: 'dark', label: 'Dark', description: 'Near-black surfaces, the platform default.', icon: Moon },
  { value: 'light', label: 'Light', description: 'Soft off-white surfaces for bright rooms.', icon: Sun },
];

/** Accent schemes. Label + gradient are per-mode because the default scheme is
 *  olive in light but magenta in dark — the swatch must preview the CURRENT
 *  theme so the chip matches what you'll actually get. */
const ACCENT_OPTIONS: {
  value: Accent;
  label: { light: string; dark: string };
  description: string;
  gradient: { light: string; dark: string };
}[] = [
  {
    value: 'green',
    label: { light: 'Olive', dark: 'Magenta' },
    description: 'The platform default — warm olive in light, magenta in dark.',
    gradient: {
      light: 'linear-gradient(135deg, #4a4726 0%, #65623c 46%, #8f8c5a 100%)',
      dark: 'linear-gradient(135deg, #3a1230 0%, #7a2456 46%, #c93d84 100%)',
    },
  },
  {
    value: 'blue',
    label: { light: 'Blue', dark: 'Blue' },
    description: 'Cool B2B navy-to-blue in both light and dark.',
    gradient: {
      light: 'linear-gradient(135deg, #0f2547 0%, #1c5091 46%, #2f6fed 100%)',
      dark: 'linear-gradient(135deg, #0c1e3d 0%, #1a4a86 46%, #3a86e0 100%)',
    },
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
          <Palette className="h-4 w-4 text-primary" />
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

        {/* Accent color picker — small inline chips, applies to both light & dark */}
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-sm font-medium">Accent</h3>
            <span className="text-[11px] text-muted-foreground">light &amp; dark</span>
          </div>
          <div role="radiogroup" aria-label="Accent color" className="flex flex-wrap gap-2">
            {ACCENT_OPTIONS.map((opt) => {
              const active = accent === opt.value;
              const mode = theme === 'dark' ? 'dark' : 'light';
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  title={opt.description}
                  onClick={() => setAccent(opt.value)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border pl-1.5 pr-3 py-1 text-xs font-medium transition-colors',
                    active
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/50',
                  )}
                >
                  <span
                    className="flex h-5 w-5 items-center justify-center rounded-full ring-1 ring-black/10"
                    style={{ background: opt.gradient[mode] }}
                  >
                    {active && <Check className="h-3 w-3 text-white drop-shadow" />}
                  </span>
                  {opt.label[mode]}
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
