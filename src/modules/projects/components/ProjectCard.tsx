/**
 * PROJECT CARD — one project on the /projects grid.
 *
 * Anatomy, top to bottom: the COVER (what the job looks like — set by the owner, borrowed
 * from a moodboard, or suggested from the project's own name), then WHO it is for and WHAT it
 * is called, then HOW the money is going, then a sunken footer with the counts and the one
 * date that matters. Before this the card was a name, three badges fighting for the same row,
 * and a progress bar, at whatever height its contents happened to reach.
 *
 * The whole card is a real link (`<Link>`), so it middle-clicks and ⌘-clicks like any other
 * row in this platform. It does not move on hover — the border darkens and the picture eases in
 * by a few percent, which is the `panel-interactive` treatment plus one honest cue that the
 * picture is part of the target.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Building2,
  Calendar,
  Clock,
  FileText,
  Palette,
  User as UserIcon,
} from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Progress } from '@/components/core/ui/progress';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/utils/decimal';
import { timeAgo } from '@/utils/datetime';
import { getOptimizedImageUrl } from '@/utils/imageUrl';
import type { ProjectWithClient } from '../services/projectsService';
import { PROJECT_STATUS_BADGE, PROJECT_STATUS_LABELS } from '../projectStatus';
import type { ResolvedProjectCover } from '../utils/projectCover';
import {
  DEADLINE_TONE_CLASS,
  budgetFigures,
  describeDeadline,
  projectClientLabel,
} from '../utils/projectPresentation';

interface ProjectCardProps {
  project: ProjectWithClient;
  cover: ResolvedProjectCover;
}

/** Library covers are static app assets; only storage URLs go through the image proxy. */
export function projectCoverSrc(cover: ResolvedProjectCover, width: number): string {
  return cover.source === 'library' ? cover.src : getOptimizedImageUrl(cover.src, { width, quality: 80 });
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ project: p, cover }) => {
  const client = projectClientLabel(p);
  const deadline = describeDeadline(p.deadline);
  const { budget, actual, pct, overBudget } = budgetFigures(p);
  const shared = p.is_mine === false;

  return (
    <Link
      to={`/projects/${p.id}`}
      className="group block h-full rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <article className="panel-interactive flex h-full flex-col overflow-hidden rounded-md border border-hairline bg-card">
        {/* Cover */}
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface-sunken">
          <img
            src={projectCoverSrc(cover, 800)}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
          />
          <div className="absolute inset-x-2 top-2 flex items-start justify-between gap-2">
            <Badge variant={PROJECT_STATUS_BADGE[p.status]} className="text-[11px]">
              {PROJECT_STATUS_LABELS[p.status]}
            </Badge>
            {shared && (
              <Badge
                variant="neutral"
                className="text-[11px]"
                title={p.owner_name ? `Owned by ${p.owner_name}` : 'Shared with you'}
              >
                Shared
              </Badge>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-1.5 p-4">
          {(p.category?.label || shared) && (
            <p className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
              {p.category?.label && <span className="truncate">{p.category.label}</span>}
              {p.category?.label && shared && <span aria-hidden="true">·</span>}
              {shared && <span className="truncate font-normal">Owned by {p.owner_name ?? 'someone else'}</span>}
            </p>
          )}
          <h3 className="line-clamp-2 font-sans text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
            {p.name}
          </h3>
          {client.label && (
            <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              {client.kind === 'company'
                ? <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                : <UserIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              <span className="truncate">{client.label}</span>
            </p>
          )}

          <div className="mt-auto pt-2">
            {budget > 0 ? (
              <>
                <div className="flex items-baseline justify-between gap-2 text-[11px] tabular-nums">
                  <span className="font-medium text-foreground">{formatMoney(actual, p.budget_currency)}</span>
                  <span className={cn('text-muted-foreground', overBudget && 'font-semibold text-destructive')}>
                    {pct}% of {formatMoney(budget, p.budget_currency)}
                  </span>
                </div>
                <Progress
                  value={pct}
                  aria-label={`${pct}% of budget used`}
                  className={cn('mt-1.5 h-1', overBudget && '[&>div]:bg-destructive')}
                />
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground">No budget set</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="flex items-center gap-3 border-t border-hairline bg-surface-sunken px-4 py-2 text-[11px] text-muted-foreground tabular-nums">
          <span className="inline-flex items-center gap-1" title="Moodboards">
            <Palette className="h-3.5 w-3.5" aria-hidden="true" />
            {p.moodboard_count}
          </span>
          <span className="inline-flex items-center gap-1" title="Accepted quotes">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            {p.accepted_quote_count}
          </span>
          {deadline ? (
            <span className={cn('ml-auto inline-flex items-center gap-1 font-medium', DEADLINE_TONE_CLASS[deadline.tone])}>
              {deadline.tone === 'overdue'
                ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                : <Calendar className="h-3.5 w-3.5" aria-hidden="true" />}
              {deadline.label}
            </span>
          ) : (
            <span className="ml-auto inline-flex items-center gap-1" title="Last activity">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {timeAgo(p.last_activity_at)}
            </span>
          )}
        </footer>
      </article>
    </Link>
  );
};
