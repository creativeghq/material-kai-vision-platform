/** Work & Quality — every AI capability's output and cost, and the quality of the content it wrote. */
import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { HubStatGrid, HubStatTile } from '@/components/core/hub/HubStatTile';
import { timeAgo } from '@/utils/datetime';
import { COPY_WARNING_LABELS, type CopyWarningCode } from '@/config/writingVocabulary';
import { Panel } from './HarnessPanels';
import { delta, fmtInt, fmtPct, fmtUsd, ratio } from './harnessFormat';
import type { ContentProducerRow, WorkAreaRow, WorkQuality, WorkStatus } from './harnessTypes';

const STATUS_BADGE: Record<WorkStatus, { label: string; variant: 'neutral' | 'warning' | 'error' | 'info' }> = {
  ok: { label: 'Measured', variant: 'info' },
  no_data: { label: 'None This Window', variant: 'neutral' },
  not_collected: { label: 'Not Collected', variant: 'warning' },
  collector_failed: { label: 'Unknown', variant: 'error' },
};

const statusBadge = (s: WorkStatus | string) => {
  const b = STATUS_BADGE[s as WorkStatus] ?? STATUS_BADGE.collector_failed;
  return <Badge variant={b.variant}>{b.label}</Badge>;
};

const warningLabel = (code: string) => COPY_WARNING_LABELS[code as CopyWarningCode] ?? code;

const AreasTable: React.FC<{ rows: WorkAreaRow[]; caption: string }> = ({ rows, caption }) => {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Area</TableHead>
          <TableHead className="text-right">Calls</TableHead>
          <TableHead className="text-right">Cost</TableHead>
          <TableHead className="text-right">Billed</TableHead>
          <TableHead className="text-right">Kinds of Work</TableHead>
          <TableHead>Last</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const d = delta(r.calls, r.calls_prev, true, caption);
          const expanded = open === r.area;
          return (
            <React.Fragment key={r.area}>
              <TableRow className="cursor-pointer" onClick={() => setOpen(expanded ? null : r.area)}>
                <TableCell>
                  <div className="flex items-start gap-1.5">
                    {r.operations.length > 0
                      ? (expanded ? <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />)
                      : <span className="w-3.5 shrink-0" />}
                    <div>
                      <div className="font-medium">{r.label}</div>
                      <div className="text-xs text-muted-foreground">{r.description}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtInt(r.calls)}
                  {d && <div className="text-[11px] text-muted-foreground">{d.value} {caption}</div>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmtUsd(r.cost_usd)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtUsd(r.billed_usd)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtInt(r.operations.length)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.last_at ? timeAgo(r.last_at) : '—'}</TableCell>
                <TableCell>{statusBadge(r.status)}</TableCell>
              </TableRow>
              {expanded && r.operations.map((o) => (
                <TableRow key={`${r.area}:${o.label}`} className="bg-surface-sunken">
                  <TableCell className="pl-10 text-sm">{o.label}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{fmtInt(o.calls)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{fmtUsd(o.cost_usd)}</TableCell>
                  <TableCell colSpan={4} />
                </TableRow>
              ))}
            </React.Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
};

const ContentTable: React.FC<{ rows: ContentProducerRow[] }> = ({ rows }) => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Writer</TableHead>
        <TableHead className="text-right">Outputs</TableHead>
        <TableHead className="text-right">With Warnings</TableHead>
        <TableHead className="text-right">Warnings per Output</TableHead>
        <TableHead className="text-right">Words to Avoid</TableHead>
        <TableHead className="text-right">Went Out</TableHead>
        <TableHead className="text-right">Edited First</TableHead>
        <TableHead>Most Common</TableHead>
        <TableHead>Status</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {rows.map((r) => (
        <TableRow key={r.producer}>
          <TableCell>
            <div className="font-medium">{r.label}</div>
            {r.channels.length > 0 && <div className="text-xs text-muted-foreground">{r.channels.join(', ')}</div>}
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {fmtInt(r.outputs)}
            {r.outputs === 0 && r.calls > 0 && <div className="text-[11px] text-muted-foreground">{fmtInt(r.calls)} calls</div>}
          </TableCell>
          <TableCell className="text-right tabular-nums">{r.checked ? fmtPct(ratio(r.with_warnings, r.checked)) : '—'}</TableCell>
          <TableCell className="text-right tabular-nums">{r.warnings_per_output ?? '—'}</TableCell>
          <TableCell className="text-right tabular-nums">{r.outputs ? fmtInt(r.avoid_hit_outputs) : '—'}</TableCell>
          <TableCell className="text-right tabular-nums">{r.outputs ? fmtInt(r.published) : '—'}</TableCell>
          <TableCell className="text-right tabular-nums">{r.published ? fmtPct(ratio(r.edited_before_outcome, r.published)) : '—'}</TableCell>
          <TableCell className="text-xs">
            {r.top_warnings.length
              ? r.top_warnings.slice(0, 3).map((w) => `${warningLabel(w.code)} (${w.outputs})`).join(', ')
              : '—'}
          </TableCell>
          <TableCell>
            {statusBadge(r.status)}
            {r.note && <div className="mt-1 max-w-[16rem] text-[11px] text-muted-foreground">{r.note}</div>}
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);

const SeoQuality: React.FC<{ seo: WorkQuality['seo'] }> = ({ seo }) => {
  const a = seo.articles;
  const c = seo.answer_checks;
  const l = seo.lessons;
  return (
    <div className="space-y-3">
      <HubStatGrid>
        <HubStatTile
          label="Articles"
          value={a.status === 'no_data' ? '—' : fmtInt(a.completed)}
          category={a.status === 'no_data' ? 'None this window' : `${fmtInt(a.started)} started · ${fmtInt(a.failed)} failed · ${fmtInt(a.published)} published`}
          help="seo_articles created in this window."
        />
        <HubStatTile
          label="SEO Score"
          value={a.avg_seo_score ?? '—'}
          category={a.min_seo_score != null ? `Lowest ${a.min_seo_score} · ${fmtInt(a.avg_words)} words on average` : 'No completed article'}
          help="Average seo_score of completed articles, out of 100."
        />
        <HubStatTile
          label="Readability"
          value={a.readability_status === 'ok' ? a.avg_readability ?? '—' : '—'}
          category={a.readability_status === 'not_collected' ? 'Never measured: no article records a readability score' : a.readability_status === 'no_data' ? 'No completed article' : 'Average'}
          help="readability_score is a column on seo_articles that no pipeline stage fills in yet."
        />
        <HubStatTile
          label="Cited by AI Answers"
          value={c.status === 'ok' ? fmtPct(c.cited_rate) : '—'}
          category={c.status === 'ok'
            ? `${fmtInt(c.cited)} of ${fmtInt(c.answered)} answers${c.failed ? ` · ${fmtInt(c.failed)} checks failed` : ''}`
            : c.status === 'collector_failed' ? `All ${fmtInt(c.checks)} checks failed: unknown, not zero` : 'No checks this window'}
          help="Share of AI answer checks that cite our domain, out of the checks that returned an answer."
        />
        <HubStatTile
          label="Writer Lessons Waiting"
          value={fmtInt(l.pending)}
          category={l.pending
            ? `Oldest ${l.oldest_pending_at ? timeAgo(l.oldest_pending_at) : '—'} · ${fmtInt(l.approved)} approved so far`
            : `${fmtInt(l.approved)} approved · ${fmtInt(l.dismissed)} dismissed`}
          help="Lessons learned from edits to articles. A proposed lesson reaches the writer only once someone approves it."
        />
      </HubStatGrid>
      {l.pending > 0 && l.approved === 0 && (
        <div className="flex items-start gap-2 rounded-sm border border-hairline bg-surface-sunken p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--warning))]" />
          <span>
            {fmtInt(l.pending)} lessons learned from editors' changes are waiting and none has ever been approved, so the article writer
            has not learned anything from them yet.
          </span>
        </div>
      )}
      {a.lowest && a.lowest.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Lowest scored: {a.lowest.map((x) => `${x.keyword} (${x.seo_score})`).join(' · ')}
        </p>
      )}
    </div>
  );
};

export const WorkQualitySection: React.FC<{ days: number; windowCaption: string }> = ({ days, windowCaption }) => {
  const [data, setData] = useState<WorkQuality | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: row, error: err } = await supabase.rpc('admin_agent_work_quality' as never, { p_days: days } as never);
    if (err) {
      setError(err.message || 'Could not load the work and quality report.');
      setData(null);
    } else {
      setData(row as unknown as WorkQuality);
    }
    setLoading(false);
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  if (loading && !data) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }
  if (error || !data) {
    return (
      <HubEmptyState
        icon={AlertTriangle}
        title="Could not load Work & Quality"
        description={error ?? undefined}
        action={<Button size="sm" variant="outline" onClick={() => void load()}>Try again</Button>}
      />
    );
  }

  const active = data.areas.filter((a) => a.status !== 'not_collected');
  return (
    <>
      <Panel
        title="AI Work by Area"
        description="Every model and data call the platform made, grouped by what it was for. Open an area for its kinds of work. Cost is what we paid; billed is what was charged to workspaces."
        flush
      >
        {active.length
          ? <AreasTable rows={data.areas} caption={windowCaption} />
          : <HubEmptyState title="No AI work recorded in this window" />}
        {data.unclassified.length > 0 && (
          <div className="border-t border-hairline p-3 text-sm">
            <span className="font-medium">{fmtInt(data.unclassified.length)} kinds of work are not in the registry yet: </span>
            <span className="text-muted-foreground">{data.unclassified.slice(0, 8).map((u) => `${u.operation} (${fmtInt(u.calls)})`).join(', ')}</span>
          </div>
        )}
      </Panel>
      <Panel
          title="Content Quality"
          description="Every caption, subject line and email body the writers produced, checked against the writing rules and your words to avoid. Edited First is how often a person changed it before it went out."
          flush
        >
          <ContentTable rows={data.content} />
        </Panel>
        <Panel title="SEO Articles" description="Article scores, how often AI answers cite us, and what the writer has learned from editors.">
          <SeoQuality seo={data.seo} />
        </Panel>
    </>
  );
};

export default WorkQualitySection;
