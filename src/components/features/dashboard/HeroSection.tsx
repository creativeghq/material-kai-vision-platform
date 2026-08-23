import React, { useRef, useState } from 'react';
import { Search, ArrowRight } from 'lucide-react';

import { Button } from '@/components/core/ui/button';

import { heroConfig, heroTasks, type HeroTask } from './dashboardData';

interface HeroSectionProps {
  onNavigate: (path: string) => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onNavigate }) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    // Empty is this control's RESTING state, so it must not be expressed by disabling
    // the button: `disabled:opacity-50` over the olive light-theme primary drops white
    // text to roughly 2:1, i.e. the hero's one CTA reads as broken on arrival. Send the
    // caret where the missing input goes instead.
    if (!q) {
      inputRef.current?.focus();
      return;
    }
    onNavigate(`/agent-hub?q=${encodeURIComponent(q)}`);
  }

  return (
    <div className="relative overflow-hidden h-full min-h-[280px] sm:min-h-[400px] flex items-center rounded-2xl border border-hairline bg-card">
      {/* Brand glow backdrop for depth — soft radial accents, not decorative motion */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(600px 300px at 82% 0%, hsl(var(--primary) / 0.13), transparent 65%), radial-gradient(420px 300px at 8% 100%, hsl(var(--primary) / 0.06), transparent 60%)' }}
      />

      <div className="relative z-10 w-full p-5 sm:p-8 flex flex-col gap-5 sm:gap-6">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-primary">
          <heroConfig.badge.icon className="h-3.5 w-3.5" />
          {heroConfig.badge.text}
        </div>

        <h1 className="font-display text-3xl sm:text-4xl md:text-[2.75rem] tracking-tight leading-[1.1] max-w-xl">
          {heroConfig.title}
          <br />
          <span className="text-primary">{heroConfig.subtitle}</span>
        </h1>

        {/* Search — the primary job of this surface. Painted with the same tokens as
            `Input`, but on `bg-background` so it reads as recessed inside this `bg-card`
            panel: opaque fill, hairline edge, accent border + 3px halo on focus. The
            pill it replaces was `border-white/10` over a translucent fill, which a light
            theme cannot show at all, and a 999px radius wrapped around a 4px-radius
            button. */}
        <form onSubmit={submitSearch}>
          <div className="flex items-center gap-2 rounded-sm border border-hairline bg-background p-1 pl-3 transition-colors hover:border-muted-foreground/50 focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/20">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={heroConfig.searchPlaceholder}
              aria-label="Search materials"
              className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <Button type="submit" className="h-8 px-4 shrink-0">
              Search
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 ml-3">
            Search by {heroConfig.searchHints.join(' · ')}
          </p>
        </form>

        {/* Task tiles — one click to the four things people actually come here to do */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {heroTasks.map((task: HeroTask) => (
            <button
              key={task.path}
              onClick={() => onNavigate(task.path)}
              className="group flex items-center gap-3 rounded-xl border border-hairline bg-background/50 p-3 text-left transition-colors hover:border-primary/40 hover:bg-background/80"
            >
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <task.icon className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-tight truncate">{task.title}</p>
                <p className="text-[11px] text-muted-foreground truncate">{task.description}</p>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
