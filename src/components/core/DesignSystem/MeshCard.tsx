import React from 'react';
import { useNavigate } from 'react-router-dom';

import { cn } from '@/lib/utils';

import { CircleAction } from './MetricParts';

interface MeshCardProps {
  /** Small caption in the top-left, e.g. "Insights". */
  eyebrow?: string;
  /** The headline. Kept as a node so a value can be emphasised inline. */
  children: React.ReactNode;
  to?: string;
  /** Dot pager along the top-right, as in the reference. */
  pager?: { count: number; active: number };
  className?: string;
}

/**
 * MeshCard — the single saturated surface on a screen.
 *
 * Both reference dashboards keep exactly ONE loud blurred-gradient panel and let
 * everything else stay quiet; that restraint is what makes it read as a focal
 * point. Rendering two on one view defeats the purpose.
 */
export const MeshCard: React.FC<MeshCardProps> = ({
  eyebrow,
  children,
  to,
  pager,
  className,
}) => {
  const navigate = useNavigate();

  return (
    <div className={cn('mesh-card p-6 flex flex-col justify-between min-h-[15rem]', className)}>
      <div className="flex items-start justify-between gap-4">
        {eyebrow && (
          <span className="text-xs uppercase tracking-[0.09em] font-semibold text-white/85">
            {eyebrow}
          </span>
        )}
        {pager && pager.count > 1 && (
          <div className="flex items-center gap-1.5 pt-1" aria-hidden="true">
            {Array.from({ length: pager.count }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-0.5 rounded-full transition-all',
                  i === pager.active ? 'w-5 bg-white' : 'w-3 bg-white/40',
                )}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 flex items-end justify-between gap-4">
        <div className="text-2xl sm:text-[1.75rem] leading-[1.15] font-display text-white drop-shadow-sm">
          {children}
        </div>
        {to && (
          <CircleAction
            label="Open insight"
            onClick={() => navigate(to)}
            className="border-white/45 text-white hover:bg-white hover:border-white hover:text-black"
          />
        )}
      </div>
    </div>
  );
};
