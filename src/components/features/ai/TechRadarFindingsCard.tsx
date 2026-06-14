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

const RING_META: Record<string, { label: string; cls: string; order: number }> = {
  adopt:  { label: 'Adopt',  cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', order: 0 },
  trial:  { label: 'Trial',  cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30',             order: 1 },
  assess: { label: 'Assess', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30',       order: 2 },
  hold:   { label: 'Hold',   cls: 'bg-white/10 text-white/50 border-white/15',                order: 3 },
};

function levelDot(level?: string | null): string {
  if (level === 'high') return '●●●';
  if (level === 'medium') return '●●○';
  if (level === 'low') return '●○○';
  return '';
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

  return (
    <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-3">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-xs text-white/60">Tech Radar{data.saved === false ? ' · one-shot (not saved)' : ''}</div>
          <div className="text-sm font-medium mt-0.5 line-clamp-1">{data.subject?.title || 'Review'}</div>
        </div>
        <div className="text-2xl font-light text-white/80 shrink-0">
          {sorted.length}
          <span className="text-xs text-white/40 ml-1">{sorted.length === 1 ? 'idea' : 'ideas'}</span>
        </div>
      </div>

      {data.summary && <p className="text-xs text-white/70 leading-relaxed">{data.summary}</p>}

      <div className="space-y-2">
        {sorted.map((f, idx) => {
          const ring = RING_META[f.ring] || RING_META.assess;
          const decided = f.id ? statuses[f.id] : '';
          return (
            <div
              key={f.id || `${idx}-${f.title}`}
              className={`bg-black/20 rounded-md p-2.5 border border-white/5 transition-opacity ${decided === 'dismissed' ? 'opacity-40' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${ring.cls}`}>{ring.label}</span>
                    {f.category && <span className="text-[10px] text-white/40">{f.category}</span>}
                    {f.is_new && <span className="text-[10px] text-pink-300">new</span>}
                  </div>
                  <div className="text-sm font-medium mt-1 line-clamp-2">{f.title}</div>
                </div>
                {f.id && !decided && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setStatus(f, 'accepted')}
                      className="text-[11px] text-white/50 hover:text-emerald-400 px-1"
                      title="Accept"
                    >✓</button>
                    <button
                      type="button"
                      onClick={() => setStatus(f, 'dismissed')}
                      className="text-[11px] text-white/50 hover:text-red-400 px-1"
                      title="Dismiss"
                    >✕</button>
                  </div>
                )}
                {decided && <span className="text-[11px] text-white/40 shrink-0">{decided}</span>}
              </div>

              {f.rationale && <p className="text-xs text-white/60 mt-1 leading-relaxed">{f.rationale}</p>}

              <div className="text-[11px] text-white/40 mt-1 flex items-center gap-3 flex-wrap">
                {f.effort && <span>effort {levelDot(f.effort)}</span>}
                {f.impact && <span>impact {levelDot(f.impact)}</span>}
                {(f.evidence || []).slice(0, 3).map((e, i) =>
                  e.url ? (
                    <a key={i} href={e.url} target="_blank" rel="noreferrer" className="text-sky-300/70 hover:underline line-clamp-1">
                      {e.title || new URL(e.url).hostname}
                    </a>
                  ) : null,
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
