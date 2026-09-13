/**
 * The capability ledger — what this workspace can do, and where it cannot, the stated reason.
 *
 * Derived entirely by `get_workspace_capabilities`; this file FORMATS and never re-decides. The
 * pair that earns the panel is `no_data` vs `failed`: price monitoring finding nothing because
 * nothing is tracked, and mention monitoring finding nothing because the provider refuses every
 * call, were indistinguishable on every screen before this.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';

interface CapabilityRow {
  key: string;
  area: string;
  label: string;
  status: string;
  since: string | null;
  detail: string | null;
  destination: string | null;
  evidence: Record<string, unknown> | null;
}

/** Worst first. A ledger that opens with what works buries the reason someone came to it. */
const ORDER: Record<string, number> = {
  failed: 0, never_run: 1, not_connected: 2, no_data: 3, not_entitled: 4, unknown: 5, working: 6,
};

/**
 * One row per status, so the vocabulary is stated on screen rather than assumed. An unrecognised
 * status falls through to `unknown` — never to "working", which would read a shape we do not
 * understand as a clean bill of health.
 */
const PRESENTATION: Record<string, { label: string; variant: 'success' | 'warning' | 'error' | 'info' | 'neutral' }> = {
  working: { label: 'Working', variant: 'success' },
  failed: { label: 'Failing', variant: 'error' },
  never_run: { label: 'Never run', variant: 'warning' },
  not_connected: { label: 'Not connected', variant: 'info' },
  no_data: { label: 'Nothing to do', variant: 'neutral' },
  not_entitled: { label: 'Not activated', variant: 'neutral' },
  unknown: { label: 'Unknown', variant: 'warning' },
};

const present = (status: string) => PRESENTATION[status] ?? PRESENTATION.unknown;

export const CapabilityLedgerPanel: React.FC = () => {
  const { activeWorkspaceId } = useWorkspace();
  const [rows, setRows] = useState<CapabilityRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeWorkspaceId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('get_workspace_capabilities', {
      p_workspace_id: activeWorkspaceId,
    });
    // A failed derivation must not render as an empty ledger — that reads as "everything is fine"
    // and is the exact shape this panel exists to make impossible.
    if (err) { setError(err.message); setRows(null); } else { setRows((data ?? []) as CapabilityRow[]); }
    setLoading(false);
  }, [activeWorkspaceId]);

  useEffect(() => { void load(); }, [load]);

  const sorted = useMemo(
    () => (rows ?? []).slice().sort(
      (a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9)
        || a.area.localeCompare(b.area)
        || a.label.localeCompare(b.label),
    ),
    [rows],
  );
  const problems = sorted.filter((r) => r.status !== 'working').length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            What this workspace can do
          </CardTitle>
          <CardDescription>
            Derived from entitlement, configuration and real activity — not a checklist anyone
            maintains. &ldquo;Nothing to do&rdquo; means nothing is configured to act on;
            &ldquo;Failing&rdquo; means it ran and the answer is unknown, not zero.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="flex items-start gap-2 text-sm text-[hsl(var(--error))]">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>Could not read the ledger: {error}. This is not a clean bill of health — it is an unanswered question.</span>
          </div>
        )}

        {!error && loading && rows === null && (
          <div className="text-sm text-muted-foreground">Checking…</div>
        )}

        {!error && rows !== null && sorted.length === 0 && (
          <HubEmptyState
            title="No capabilities registered"
            description="The capability registry is empty, so there is nothing to report on yet."
          />
        )}

        {!error && sorted.length > 0 && (
          <>
            <div className="text-sm text-muted-foreground mb-3">
              {problems === 0
                ? `All ${sorted.length} capabilities are working.`
                : `${problems} of ${sorted.length} need attention.`}
            </div>
            {/* Every table scrolls horizontally — <main> is overflow-x-hidden, so a wider table is
                CLIPPED rather than scrolled and the right-hand columns simply vanish. */}
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-sunken">
                    <th className="text-left text-[11px] font-semibold px-3 py-2 border-b border-hairline">Capability</th>
                    <th className="text-left text-[11px] font-semibold px-3 py-2 border-b border-hairline">Area</th>
                    <th className="text-left text-[11px] font-semibold px-3 py-2 border-b border-hairline">Status</th>
                    <th className="text-left text-[11px] font-semibold px-3 py-2 border-b border-hairline">Why</th>
                    <th className="text-right text-[11px] font-semibold px-3 py-2 border-b border-hairline">Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => {
                    const p = present(r.status);
                    return (
                      <tr key={r.key} className="border-b border-hairline last:border-0">
                        <td className="px-3 py-2 font-medium">{r.label}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.area}</td>
                        <td className="px-3 py-2"><Badge variant={p.variant}>{p.label}</Badge></td>
                        <td className="px-3 py-2 text-muted-foreground">{r.detail || '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                          {r.since ? new Date(r.since).toISOString().slice(0, 10) : '—'}
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
