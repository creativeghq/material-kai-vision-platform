/**
 * Tech Radar findings detail for a single tech-radar agent.
 *
 * Mounted inside `AgentRunHistoryDrawer` only when `agent.agent_type === 'tech-radar'`,
 * above the run history — so the cron's accumulated findings are visible in the
 * SAME admin monitor as everything else (no separate page). Reads the subject +
 * its findings directly via the supabase client (RLS = workspace member) and lets
 * the operator accept / dismiss / progress each idea inline.
 */

import { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw, Radar } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Skeleton } from '@/components/core/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  /** tech_radar_subjects.id carried in background_agents.config.subject_id */
  subjectId: string;
}

interface Finding {
  id: string;
  title: string;
  category: string;
  ring: string;
  rationale: string | null;
  recommendation: string | null;
  effort: string | null;
  impact: string | null;
  evidence: Array<{ title?: string; url?: string; note?: string }> | null;
  status: string;
  is_new: boolean;
  created_at: string;
}

interface Subject {
  id: string;
  title: string;
  component: string | null;
  current_approach: string;
  last_reviewed_at: string | null;
  next_review_at: string | null;
  is_active: boolean;
}

const RING_META: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline'; cls: string; order: number }> = {
  adopt:  { label: 'Adopt',  variant: 'default',   cls: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30', order: 0 },
  trial:  { label: 'Trial',  variant: 'secondary', cls: 'bg-sky-500/15 text-sky-600 border-sky-500/30',             order: 1 },
  assess: { label: 'Assess', variant: 'outline',   cls: 'bg-amber-500/15 text-amber-600 border-amber-500/30',       order: 2 },
  hold:   { label: 'Hold',   variant: 'outline',   cls: 'bg-muted text-muted-foreground',                            order: 3 },
};

const STATUS_NEXT: Record<string, Array<{ to: string; label: string }>> = {
  new:         [{ to: 'accepted', label: 'Accept' }, { to: 'dismissed', label: 'Dismiss' }],
  reviewed:    [{ to: 'accepted', label: 'Accept' }, { to: 'dismissed', label: 'Dismiss' }],
  accepted:    [{ to: 'in_progress', label: 'Start' }, { to: 'dismissed', label: 'Dismiss' }],
  in_progress: [{ to: 'done', label: 'Done' }],
  dismissed:   [{ to: 'reviewed', label: 'Reopen' }],
  done:        [],
};

export function TechRadarFindingsPanel({ subjectId }: Props) {
  const { toast } = useToast();
  const [subject, setSubject] = useState<Subject | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    try {
      const [{ data: subj }, { data: finds }] = await Promise.all([
        supabase.from('tech_radar_subjects').select('id, title, component, current_approach, last_reviewed_at, next_review_at, is_active').eq('id', subjectId).maybeSingle(),
        supabase.from('tech_radar_findings').select('*').eq('subject_id', subjectId).order('created_at', { ascending: false }).limit(100),
      ]);
      setSubject(subj as Subject | null);
      setFindings((finds as Finding[]) || []);
    } catch (e: unknown) {
      toast({ title: 'Failed to load radar findings', description: String(e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [subjectId]);

  const setStatus = async (f: Finding, status: string) => {
    const prev = f.status;
    setFindings((arr) => arr.map((x) => (x.id === f.id ? { ...x, status, is_new: false } : x)));
    const { error } = await supabase.from('tech_radar_findings').update({ status, is_new: false }).eq('id', f.id);
    if (error) {
      setFindings((arr) => arr.map((x) => (x.id === f.id ? { ...x, status: prev } : x)));
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    }
  };

  const sorted = [...findings].sort((a, b) => (RING_META[a.ring]?.order ?? 9) - (RING_META[b.ring]?.order ?? 9));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Radar className="h-4 w-4 text-primary" />
          Tech Radar findings
        </div>
        <Button size="icon" variant="ghost" onClick={reload} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {subject && (
        <div className="text-xs text-muted-foreground mb-3">
          <span className="font-medium text-foreground">{subject.title}</span>
          {subject.last_reviewed_at && <> · last reviewed {formatDistanceToNow(new Date(subject.last_reviewed_at), { addSuffix: true })}</>}
          {subject.next_review_at && <> · next {formatDistanceToNow(new Date(subject.next_review_at), { addSuffix: true })}</>}
          {!subject.is_active && <> · paused</>}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">No findings yet. The monitor surfaces ideas on its next run.</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((f) => {
            const ring = RING_META[f.ring] || RING_META.assess;
            return (
              <div key={f.id} className={`border rounded-lg p-3 ${f.status === 'dismissed' ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${ring.cls}`}>{ring.label}</span>
                      <span className="text-[10px] text-muted-foreground">{f.category}</span>
                      {f.is_new && <Badge variant="secondary" className="text-[10px]">new</Badge>}
                      {f.status !== 'new' && <span className="text-[10px] text-muted-foreground">· {f.status}</span>}
                    </div>
                    <div className="text-sm font-medium">{f.title}</div>
                  </div>
                </div>
                {f.rationale && <p className="text-xs text-muted-foreground mt-1">{f.rationale}</p>}
                {f.recommendation && <p className="text-xs mt-1"><span className="text-muted-foreground">Next: </span>{f.recommendation}</p>}
                <div className="flex items-center justify-between gap-2 mt-2">
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                    {f.effort && <span>effort: {f.effort}</span>}
                    {f.impact && <span>impact: {f.impact}</span>}
                    {(f.evidence || []).slice(0, 2).map((e, i) =>
                      e.url ? (
                        <a key={i} href={e.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                          <ExternalLink className="h-3 w-3" />{e.title || 'source'}
                        </a>
                      ) : null,
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {(STATUS_NEXT[f.status] || []).map((s) => (
                      <Button key={s.to} size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setStatus(f, s.to)}>
                        {s.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
