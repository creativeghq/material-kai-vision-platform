/**
 * What people asked the assistant that it could not do.
 *
 * Derived entirely by `agent_conversation_audit(p_days)`, which already computes the hard part
 * per conversation — the first question, every tool called, whether NO tool ran, and every hedge
 * phrase the reply contained. This file formats and never re-decides; the one judgement it makes
 * is the ordering, and that is stated below.
 *
 * @remarks Deliberately not a clustering pipeline. At ~3 real agent turns a day, similarity
 * scoring over this would be maintenance with no readers — the same test the platform applies to
 * rollup tables. The grouping here is an exact-match count on the opening question, which is
 * enough to make a repeated ask visible; when the volume makes that insufficient it will be
 * obvious from this screen, which is the right time to build the next thing.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { formatDate } from '@/utils/datetime';

interface AuditRow {
  conversation_id: string;
  agent_id: string | null;
  started_at: string;
  first_question: string | null;
  user_turns: number;
  tool_calls: number;
  tools: string | null;
  empty_or_failed_calls: number;
  no_tool_call: boolean;
  hedges: string | null;
  framework_used: boolean;
  no_response: boolean;
  credits: number | null;
  max_latency_ms: number | null;
}

const WINDOWS = [7, 30, 90] as const;

/**
 * Worst first, and "worst" here means most likely to be a missing capability rather than a
 * chatty turn: a reply that hedged AND called nothing is the shape this panel exists to surface.
 */
function severity(row: AuditRow): number {
  if (row.no_response) return 0;
  if (row.no_tool_call && row.hedges) return 1;
  if (row.hedges) return 2;
  if (row.no_tool_call) return 3;
  if (row.empty_or_failed_calls > 0) return 4;
  return 5;
}

const VERDICT: Record<number, { label: string; variant: 'error' | 'warning' | 'info' | 'neutral'; hint: string }> = {
  0: { label: 'No reply', variant: 'error', hint: 'The turn produced nothing at all.' },
  1: { label: 'No tool, hedged', variant: 'error', hint: 'Called nothing and said it could not — the strongest signal of a missing capability.' },
  2: { label: 'Hedged', variant: 'warning', hint: 'Used a tool but still told the user it could not do something.' },
  3: { label: 'No tool called', variant: 'warning', hint: 'Answered from the model alone. Fine for chat, a gap if it was asked to do something.' },
  4: { label: 'Tool found nothing', variant: 'info', hint: 'A tool ran and returned nothing, or failed.' },
  5: { label: 'Served', variant: 'neutral', hint: 'Tools ran and the reply did not hedge.' },
};

export const AgentUnmetRequestsPanel: React.FC = () => {
  const [days, setDays] = useState<number>(30);
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    // Operator-gated inside the function (is_platform_admin), so this is safe to call straight
    // from the client — the same shape as admin_agent_chat_stats on this page.
    const { data, error: rpcError } = await supabase.rpc('agent_conversation_audit' as never, { p_days: days } as never);
    if (rpcError) {
      setError(rpcError.message || 'Could not load the conversation audit.');
      setRows([]);
    } else {
      setRows((data ?? []) as unknown as AuditRow[]);
    }
    setLoading(false);
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  /** Conversations where the assistant probably could not do what was asked. */
  const unmet = useMemo(
    () => (rows ?? []).filter((r) => severity(r) <= 3).sort((a, b) => severity(a) - severity(b)
      || new Date(b.started_at).getTime() - new Date(a.started_at).getTime()),
    [rows],
  );

  /**
   * The same opening question asked more than once. Exact match on a normalised string — not
   * similarity. A repeated ask is the thing worth building a toolkit for, and at this volume an
   * exact repeat is already a strong signal.
   */
  const repeated = useMemo(() => {
    const counts = new Map<string, { question: string; count: number }>();
    for (const r of unmet) {
      const q = (r.first_question ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (q.length < 8) continue;
      const seen = counts.get(q);
      if (seen) seen.count += 1;
      else counts.set(q, { question: r.first_question!.trim(), count: 1 });
    }
    return [...counts.values()].filter((c) => c.count > 1).sort((a, b) => b.count - a.count);
  }, [unmet]);

  const served = (rows ?? []).length - unmet.length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>What the assistant could not do</CardTitle>
          <CardDescription>
            Conversations where no tool ran, or the reply hedged. Derived by{' '}
            <code className="text-xs">agent_conversation_audit</code> — the question is verbatim,
            the verdict is the RPC&apos;s.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {WINDOWS.map((w) => (
            <Button
              key={w}
              variant={days === w ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setDays(w)}
            >
              {w}d
            </Button>
          ))}
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading the audit…
          </div>
        )}

        {!loading && error && (
          <div className="flex items-start gap-2 rounded-sm border border-hairline bg-surface-sunken p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-800 dark:text-amber-300" />
            {/* Named, not swallowed: "operator-only" here means the signed-in account is not a
                platform admin, which is a different problem from the audit being empty. */}
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && rows && rows.length === 0 && (
          <HubEmptyState
            variant="empty"
            title="No conversations in this window"
            description="Nobody has used the assistant in the last few weeks, so there is nothing to audit yet."
          />
        )}

        {!loading && !error && rows && rows.length > 0 && unmet.length === 0 && (
          <HubEmptyState
            variant="empty"
            title="Every conversation was served"
            description={`All ${rows.length} conversations in the last ${days} days ran a tool and none hedged.`}
          />
        )}

        {!loading && !error && unmet.length > 0 && (
          <>
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">{unmet.length}</span> of{' '}
              <span className="tabular-nums">{unmet.length + served}</span> conversations in the last{' '}
              {days} days. Each row is a candidate for a toolkit — read the question, not the count.
            </p>

            {repeated.length > 0 && (
              <div className="rounded-sm border border-hairline bg-surface-sunken p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase-none text-muted-foreground">
                  Asked more than once
                </p>
                <ul className="space-y-1">
                  {repeated.map((r) => (
                    <li key={r.question} className="flex items-start gap-2 text-sm">
                      <Badge variant="warning">{r.count}x</Badge>
                      <span>{r.question}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Every table on this platform scrolls horizontally — `<main>` is overflow-x-hidden,
                so an unwrapped table is CLIPPED rather than scrolled. */}
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-sunken">
                  <tr className="text-left">
                    <th className="p-2 text-[11px] font-semibold">Verdict</th>
                    <th className="p-2 text-[11px] font-semibold">What they asked</th>
                    <th className="p-2 text-[11px] font-semibold">Agent</th>
                    <th className="p-2 text-[11px] font-semibold">Tools</th>
                    <th className="p-2 text-right text-[11px] font-semibold">Credits</th>
                    <th className="p-2 text-[11px] font-semibold">When</th>
                    <th className="p-2 text-[11px] font-semibold"><span className="sr-only">Open the conversation</span></th>
                  </tr>
                </thead>
                <tbody>
                  {unmet.map((r) => {
                    const v = VERDICT[severity(r)];
                    return (
                      <tr key={r.conversation_id} className="border-t border-hairline align-top">
                        <td className="p-2">
                          <Badge variant={v.variant}>{v.label}</Badge>
                        </td>
                        <td className="p-2 max-w-md">
                          <span className="block">{r.first_question || <span className="text-muted-foreground">—</span>}</span>
                          {r.hedges && (
                            <span className="mt-1 block text-xs text-muted-foreground">
                              said: {r.hedges}
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-muted-foreground">{r.agent_id || '—'}</td>
                        <td className="p-2 text-muted-foreground">
                          {r.tools || <span title={v.hint}>none</span>}
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {r.credits == null ? '—' : Number(r.credits).toFixed(2)}
                        </td>
                        <td className="p-2 text-muted-foreground whitespace-nowrap">
                          {formatDate(r.started_at)}
                        </td>
                        <td className="p-2">
                          {/* The conversation itself is the context a count can never carry. */}
                          <a
                            className="inline-flex items-center gap-1 text-xs underline"
                            href={`/agent-hub?conversation=${r.conversation_id}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open <ExternalLink className="h-3 w-3" />
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
