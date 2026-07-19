/**
 * TechRadarFindingsCard — renders a `tech_radar_findings` chunk from Pepper's
 * Tech Radar review as a rich card in chat: a verdict summary + ring-grouped
 * findings (adopt / trial / assess / hold) with inline accept/dismiss actions.
 *
 * Accept/dismiss write directly to tech_radar_findings via the supabase client
 * (RLS = workspace member), mirroring the price-monitoring anomaly Trust/Dismiss
 * pattern — no agent round-trip needed for a one-field status change.
 */

import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface TechRadarFinding {
  id?: string;
  title: string;
  category?: string;
  ring: 'adopt' | 'trial' | 'assess' | 'hold' | string;
  rationale?: string;
  recommendation?: string;
  effort?: string | null;
  impact?: string | null;
  evidence?: Array<{ title?: string; url?: string; note?: string }>;
  status?: string;
  is_new?: boolean;
}

export interface TechRadarFindingsData {
  subject?: { id?: string | null; title?: string; component?: string | null };
  summary?: string;
  findings: TechRadarFinding[];
  new_count?: number;
  saved?: boolean;
}

const RING_META: Record<string, { label: string; cls: string; blurb: string; order: number }> = {
  adopt:  { label: 'Adopt',  cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30', blurb: 'Proven — safe to put into production now.', order: 0 },
  trial:  { label: 'Trial',  cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30',                 blurb: 'Promising — try it on a low-risk project first.', order: 1 },
  assess: { label: 'Assess', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',        blurb: 'Worth a look — run a spike before committing.', order: 2 },
  hold:   { label: 'Hold',   cls: 'bg-muted text-muted-foreground border-border',                                  blurb: 'Not now — avoid new use until things change.', order: 3 },
};

const RING_ORDER: Array<keyof typeof RING_META | string> = ['adopt', 'trial', 'assess', 'hold'];

function levelDot(level?: string | null): string {
  if (level === 'high') return '●●●';
  if (level === 'medium') return '●●○';
  if (level === 'low') return '●○○';
  return '';
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function statusLabel(status: string): string {
  if (status === 'in_progress') return 'in progress';
  return status;
}

function statusBadgeCls(status: string): string {
  switch (status) {
    case 'accepted':
    case 'done':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30';
    case 'in_progress':
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30';
    case 'dismissed':
      return 'bg-muted text-muted-foreground border-border';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

export function TechRadarFindingsCard({ data }: { data: TechRadarFindingsData }) {
  const { toast } = useToast();
  const [statuses, setStatuses] = useState<Record<string, string>>({});

  const setStatus = async (f: TechRadarFinding, status: 'accepted' | 'dismissed') => {
    if (!f.id) {
      toast({ title: 'Not saved yet', description: 'Run with save=true (or track it) to act on findings.', variant: 'destructive' });
      return;
    }
    setStatuses((s) => ({ ...s, [f.id!]: status }));
    const { error } = await supabase
      .from('tech_radar_findings')
      .update({ status, is_new: false })
      .eq('id', f.id);
    if (error) {
      setStatuses((s) => ({ ...s, [f.id!]: '' }));
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: status === 'accepted' ? 'Accepted' : 'Dismissed', description: f.title });
    }
  };

  const sorted = [...(data.findings || [])].sort(
    (a, b) => (RING_META[a.ring]?.order ?? 9) - (RING_META[b.ring]?.order ?? 9),
  );

  // Which rings are actually present, in radar order — drives the legend.
  const ringsPresent = RING_ORDER.filter((r) => sorted.some((f) => f.ring === r));

  // "What to do next" — the most actionable findings (Adopt/Trial first) that
  // carry a concrete recommendation. Only render what's in the data.
  const actions = sorted
    .filter((f) => f.recommendation && f.recommendation.trim().length > 0)
    .sort((a, b) => (RING_META[a.ring]?.order ?? 9) - (RING_META[b.ring]?.order ?? 9))
    .slice(0, 4);

  return (
    <div className="bg-card text-card-foreground rounded-xl p-4 border border-border space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">Tech Radar · technology recommendations{data.saved === false ? ' · one-shot (not saved)' : ''}</div>
          <div className="flex items-center gap-2 mt-0.5">
            <div className="text-sm font-semibold line-clamp-1">{data.subject?.title || 'Review'}</div>
            {typeof data.new_count === 'number' && data.new_count > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full border bg-primary/15 text-primary border-primary/30 shrink-0">
                {data.new_count} new
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-muted-foreground">{sorted.length === 1 ? 'finding' : 'findings'}</div>
          <div className="text-2xl font-semibold leading-none">{sorted.length}</div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        Each technology is placed in one of four rings — how ready it is to use. Accept the ones you'll pursue and dismiss the rest to keep your radar focused.
      </p>

      {data.summary && <p className="text-sm leading-relaxed">{data.summary}</p>}

      {/* Ring legend — explains what each ring means, only for rings in view */}
      {ringsPresent.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {ringsPresent.map((r) => {
            const meta = RING_META[r] || RING_META.assess;
            return (
              <span key={r} className={`text-[10px] px-2 py-0.5 rounded-full border ${meta.cls}`} title={meta.blurb}>
                {meta.label}
              </span>
            );
          })}
        </div>
      )}

      {/* What to do next — top recommendations */}
      {actions.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">What to do next</div>
          <ol className="space-y-2">
            {actions.map((f, i) => (
              <li key={f.id || `${i}-${f.title}`} className="flex gap-2 text-sm">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
                  {i + 1}
                </span>
                <span>
                  <span className="font-medium">{f.title}</span>
                  <span className="block text-xs text-muted-foreground">{f.recommendation}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="space-y-2">
        {sorted.map((f, idx) => {
          const ring = RING_META[f.ring] || RING_META.assess;
          const decided = (f.id ? statuses[f.id] : '') || f.status || '';
          return (
            <div
              key={f.id || `${idx}-${f.title}`}
              className={`bg-muted/40 rounded-lg p-2.5 border border-border transition-opacity ${decided === 'dismissed' ? 'opacity-40' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${ring.cls}`}>{ring.label}</span>
                    {f.category && <span className="text-[10px] text-muted-foreground">{f.category}</span>}
                    {f.is_new && <span className="text-[10px] text-primary font-medium">new</span>}
                  </div>
                  <div className="text-sm font-medium mt-1 line-clamp-2">{f.title}</div>
                </div>
                {f.id && !decided && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setStatus(f, 'accepted')}
                      className="text-[11px] text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400 px-1"
                      title="Accept — add to your plan"
                    >✓</button>
                    <button
                      type="button"
                      onClick={() => setStatus(f, 'dismissed')}
                      className="text-[11px] text-muted-foreground hover:text-red-600 dark:hover:text-red-400 px-1"
                      title="Dismiss — hide from the radar"
                    >✕</button>
                  </div>
                )}
                {decided && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${statusBadgeCls(decided)}`}>
                    {statusLabel(decided)}
                  </span>
                )}
              </div>

              {f.rationale && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{f.rationale}</p>}

              {f.recommendation && (
                <p className="text-xs text-primary font-medium mt-1 leading-relaxed">→ {f.recommendation}</p>
              )}

              <div className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-3 flex-wrap">
                {f.effort && <span title="How much work to adopt">effort {levelDot(f.effort)}</span>}
                {f.impact && <span title="Expected payoff">impact {levelDot(f.impact)}</span>}
                {(f.evidence || []).slice(0, 3).map((e, i) =>
                  e.url ? (
                    <a key={i} href={e.url} target="_blank" rel="noreferrer" className="text-primary hover:underline line-clamp-1">
                      {e.title || safeHostname(e.url)}
                    </a>
                  ) : null,
                )}
              </div>

              {(f.evidence || []).length > 0 && (
                <details className="group rounded-lg border border-border bg-muted/40 mt-1.5">
                  <summary className="cursor-pointer list-none px-2.5 py-2 text-sm flex items-center justify-between gap-2">
                    <span className="font-medium">Evidence &amp; sources</span>
                    <span className="text-xs text-muted-foreground">{f.evidence!.length}</span>
                  </summary>
                  <div className="px-2.5 pb-2.5 pt-0.5 space-y-2 text-xs">
                    {f.evidence!.map((e, i) => (
                      <div key={i} className="space-y-0.5">
                        {e.url ? (
                          <a
                            href={e.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline break-words"
                          >
                            {e.title || safeHostname(e.url)}
                          </a>
                        ) : e.title ? (
                          <div className="font-medium">{e.title}</div>
                        ) : null}
                        {e.note && <div className="text-muted-foreground leading-relaxed">{e.note}</div>}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
