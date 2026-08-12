import { Mail, Eye, MousePointerClick, AlertTriangle, Check } from 'lucide-react';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/core/ui/hover-card';
import { formatDate } from '@/utils/datetime';
import type { DeliveryTrail } from '@/services/documentDeliveryService';

/**
 * The delivery-trail list cell: three small icons — was it emailed, did they
 * open the page, did they act — with the actual timeline on hover.
 *
 * Design-system notes: plain coloured glyphs, no Badge and no pill background
 * (tables render status as plain coloured words here). The cell is a single
 * focusable trigger so the timeline is reachable by keyboard, not mouse-only.
 *
 * This component FORMATS a derived trail. It performs no derivation of its own —
 * see documentDeliveryService.
 */

interface Props {
  trail: DeliveryTrail | undefined;
  /** Whether this document type has a public page at all. Quotes/invoices do; an
   *  internal-only document would show the email half alone. */
  hasPublicPage?: boolean;
  className?: string;
}

/** Tone per email state. Muted = nothing happened yet; destructive = it failed. */
const EMAIL_TONE: Record<string, string> = {
  not_sent: 'text-muted-foreground/40',
  sent: 'text-muted-foreground',
  delivered: 'text-foreground/70',
  opened: 'text-emerald-500',
  clicked: 'text-emerald-500',
  bounced: 'text-destructive',
  complained: 'text-destructive',
  failed: 'text-destructive',
};

const EMAIL_LABEL: Record<string, string> = {
  not_sent: 'Not emailed',
  sent: 'Sent — no delivery confirmation yet',
  delivered: 'Delivered',
  opened: 'Opened',
  clicked: 'Link clicked',
  bounced: 'Bounced — it never arrived',
  complained: 'Marked as spam',
  failed: 'Send failed',
};

const PAGE_TONE: Record<string, string> = {
  not_viewed: 'text-muted-foreground/40',
  viewed: 'text-emerald-500',
  downloaded: 'text-emerald-500',
  paid: 'text-emerald-500',
  signed: 'text-emerald-500',
  accepted: 'text-emerald-500',
  declined: 'text-amber-500',
};

const COMPLETED_LABEL: Record<string, string> = {
  paid: 'Paid',
  signed: 'Signed',
  accepted: 'Accepted',
  declined: 'Declined',
};

function when(ts: string | null): string {
  return ts ? formatDate(ts, { withTime: true }) : '—';
}

export function DeliveryTrailCell({ trail, hasPublicPage = true, className }: Props) {
  const t = trail;
  const emailStatus = t?.emailStatus ?? 'not_sent';
  const pageStatus = t?.pageStatus ?? 'not_viewed';
  const viewCount = t?.viewCount ?? 0;
  const isFailed = emailStatus === 'bounced' || emailStatus === 'complained' || emailStatus === 'failed';
  const completed = t?.completedEvent ?? null;

  // Nothing has ever happened to this document — render a quiet placeholder
  // rather than three greyed icons, which reads as broken rather than as idle.
  const nothingYet = emailStatus === 'not_sent' && viewCount === 0 && !completed;

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          // The row around this cell navigates on click; the trail is informational.
          onClick={(e) => e.stopPropagation()}
          className={`inline-flex items-center gap-1.5 rounded px-1 py-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className ?? ''}`}
          aria-label={
            nothingYet
              ? 'No delivery activity'
              : `${EMAIL_LABEL[emailStatus]}${viewCount > 0 ? `, page viewed ${viewCount} times` : ''}`
          }
        >
          {nothingYet ? (
            <span className="text-xs text-muted-foreground/50">—</span>
          ) : (
            <>
              {isFailed
                ? <AlertTriangle className={`h-3.5 w-3.5 ${EMAIL_TONE[emailStatus]}`} aria-hidden />
                : <Mail className={`h-3.5 w-3.5 ${EMAIL_TONE[emailStatus]}`} aria-hidden />}

              {hasPublicPage && (
                <span className="inline-flex items-center gap-0.5">
                  <Eye className={`h-3.5 w-3.5 ${PAGE_TONE[pageStatus]}`} aria-hidden />
                  {viewCount > 1 && (
                    <span className="text-[10px] tabular-nums text-muted-foreground">{viewCount}</span>
                  )}
                </span>
              )}

              {completed
                ? <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
                : (t?.clickCount ?? 0) > 0
                  ? <MousePointerClick className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
                  : null}
            </>
          )}
        </button>
      </HoverCardTrigger>

      <HoverCardContent align="start" className="w-72 text-xs">
        {nothingYet ? (
          <p className="text-muted-foreground">
            Not emailed and never opened. Nothing has reached the customer yet.
          </p>
        ) : (
          <div className="space-y-3">
            {/* ── Email half ─────────────────────────────────────────── */}
            <div className="space-y-1">
              <p className={`font-medium ${EMAIL_TONE[emailStatus]}`}>{EMAIL_LABEL[emailStatus]}</p>
              {t?.recipients?.length ? (
                <p className="text-muted-foreground truncate" title={t.recipients.join(', ')}>
                  To {t.recipients.slice(0, 2).join(', ')}
                  {t.recipients.length > 2 ? ` +${t.recipients.length - 2} more` : ''}
                </p>
              ) : null}
              {t?.sentAt && <p className="text-muted-foreground">Sent {when(t.sentAt)}</p>}
              {t?.deliveredAt && <p className="text-muted-foreground">Delivered {when(t.deliveredAt)}</p>}
              {t?.firstOpenedAt && (
                <p className="text-muted-foreground">
                  Opened {when(t.firstOpenedAt)}
                  {t.openCount > 1 ? ` · ${t.openCount}× total, last ${when(t.lastOpenedAt)}` : ''}
                </p>
              )}
              {t?.bouncedAt && (
                <p className="text-destructive">
                  Bounced {when(t.bouncedAt)}
                  {t.bounceReason ? ` — ${t.bounceReason}` : ''}
                </p>
              )}
              {(t?.sendCount ?? 0) > 1 && (
                <p className="text-muted-foreground">Sent {t!.sendCount}× in total</p>
              )}
            </div>

            {/* ── Page half ──────────────────────────────────────────── */}
            {hasPublicPage && (
              <div className="space-y-1 border-t border-border/50 pt-2">
                {viewCount === 0 ? (
                  <p className="text-muted-foreground">Public page never opened.</p>
                ) : (
                  <>
                    <p className="font-medium text-foreground/80">
                      Page viewed {viewCount}×
                      {t!.distinctViewers > 1 ? ` by ${t!.distinctViewers} visitors` : ''}
                    </p>
                    {t?.firstViewedAt && (
                      <p className="text-muted-foreground">
                        First {when(t.firstViewedAt)} · last {when(t.lastViewedAt)}
                      </p>
                    )}
                    {(t?.downloadCount ?? 0) > 0 && (
                      <p className="text-muted-foreground">Downloaded {t!.downloadCount}×</p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Outcome ────────────────────────────────────────────── */}
            {completed && (
              <div className="border-t border-border/50 pt-2">
                <p className="font-medium text-emerald-500">
                  {COMPLETED_LABEL[completed] ?? completed} {when(t!.completedAt)}
                </p>
              </div>
            )}

            {/* Opens are a pixel fetch. Apple Mail Privacy Protection and Gmail's
                image proxy load it without a human reading anything, and a client
                with images off never loads it at all. Saying so in the tooltip is
                cheaper than an operator building a false theory about a customer. */}
            {t?.firstOpenedAt && (
              <p className="border-t border-border/50 pt-2 text-[10px] leading-snug text-muted-foreground/70">
                "Opened" is measured by a tracking pixel — mail privacy features can
                trigger it without a person reading, and blocked images can hide a
                real open. Page views and clicks are exact.
              </p>
            )}
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
