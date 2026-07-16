import React, { useState } from 'react';
import { Search, ArrowRight } from 'lucide-react';

import { Button } from '@/components/core/ui/button';

import { heroConfig, heroTasks, type HeroTask } from './dashboardData';

interface HeroSectionProps {
  onNavigate: (path: string) => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onNavigate }) => {
  const [query, setQuery] = useState('');

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    onNavigate(`/agent-hub?q=${encodeURIComponent(q)}`);
  }

  return (
    <div className="relative overflow-hidden h-full min-h-[280px] sm:min-h-[400px] flex items-center rounded-2xl border border-white/8 bg-card">
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

        {/* Search — the primary job of this surface */}
        <form onSubmit={submitSearch} className="max-w-2xl">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-background/70 backdrop-blur-sm p-1.5 pl-4 focus-within:border-primary/50 transition-colors">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={heroConfig.searchPlaceholder}
              aria-label="Search materials"
              className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <Button type="submit" disabled={!query.trim()} className="h-9 px-5 shrink-0">
              Search
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 ml-4">
            Search by {heroConfig.searchHints.join(' · ')}
          </p>
        </form>

        {/* Task tiles — one click to the four things people actually come here to do */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-2xl">
          {heroTasks.map((task: HeroTask) => (
            <button
              key={task.path}
              onClick={() => onNavigate(task.path)}
              className="group flex items-center gap-3 rounded-xl border border-white/8 bg-background/50 p-3 text-left transition-colors hover:border-primary/40 hover:bg-background/80"
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
