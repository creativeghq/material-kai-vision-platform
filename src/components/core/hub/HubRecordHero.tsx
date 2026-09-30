import React, { useState } from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface HubHeroFact {
  icon?: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  alert?: boolean;
}

interface HubRecordHeroProps {
  imageUrl?: string | null;
  placeholder?: React.ReactNode;
  badges?: React.ReactNode;
  headline?: React.ReactNode;
  description?: string | null;
  facts?: HubHeroFact[];
  actions?: React.ReactNode;
  className?: string;
}

const CLAMP_AT = 240;

export const HubHeroChip: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <span className={cn('inline-flex items-center gap-1 rounded-sm border border-white/30 bg-black/40 px-2 py-0.5 text-[11px] font-semibold capitalize text-white', className)}>
    {children}
  </span>
);

export const HubRecordHero: React.FC<HubRecordHeroProps> = ({
  imageUrl, placeholder, badges, headline, description, facts, actions, className,
}) => {
  const [expanded, setExpanded] = useState(false);
  const long = (description?.length ?? 0) > CLAMP_AT;

  return (
    <section className={cn('relative overflow-hidden rounded-md border border-hairline bg-surface-sunken', className)}>
      {imageUrl ? (
        <img src={imageUrl} alt="" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">{placeholder}</div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/55 to-black/10" aria-hidden="true" />

      {actions && <div className="absolute right-3 top-3 z-10 flex gap-2">{actions}</div>}

      <div className="relative flex min-h-[260px] flex-col justify-end gap-3 p-4 text-white sm:min-h-[320px] sm:p-6">
        {badges && <div className="flex flex-wrap items-center gap-1.5">{badges}</div>}
        {headline && <p className="font-sans text-2xl font-semibold tabular-nums sm:text-3xl">{headline}</p>}
        {description && (
          <div className="max-w-3xl">
            <p className={cn('whitespace-pre-wrap text-sm leading-relaxed text-white/90', !expanded && 'line-clamp-3')}>
              {description}
            </p>
            {long && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-1 text-xs font-semibold text-white/80 underline-offset-2 hover:text-white hover:underline"
              >
                {expanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        )}
        {facts && facts.length > 0 && (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-white/20 pt-3 sm:flex sm:flex-wrap">
            {facts.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.label} className="min-w-0">
                  <dt className="flex items-center gap-1 text-[11px] font-semibold text-white/70">
                    {Icon && <Icon className="h-3 w-3" aria-hidden="true" />}
                    {f.label}
                  </dt>
                  <dd className="truncate text-sm font-semibold tabular-nums">{f.value}</dd>
                  {f.hint && (
                    <dd className="truncate text-[11px] text-white/70">
                      {f.alert
                        ? <span className="rounded-sm bg-destructive px-1 font-semibold text-destructive-foreground">{f.hint}</span>
                        : f.hint}
                    </dd>
                  )}
                </div>
              );
            })}
          </dl>
        )}
      </div>
    </section>
  );
};
