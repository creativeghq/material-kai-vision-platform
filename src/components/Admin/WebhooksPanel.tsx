/**
 * Webhooks Panel
 *
 * Admin-only view of webhook health, mirroring CronJobsPanel. Two sections:
 *  - Inbound flow webhooks: every flow with trigger_type='webhook' + its last
 *    run / 24h stats from flow_runs ("did this webhook fire properly last time?").
 *  - Outbound webhook endpoints: configured delivery targets (webhook_endpoints)
 *    + their delivery health from webhook_calls.
 *
 * Mounted inside SystemHealthMonitor on /admin → Operations → System Health,
 * directly below the Cron Jobs panel.
 *
 * Data sources (admin-gated SECURITY DEFINER RPCs):
 *   public.get_webhook_inbound_status()
 *   public.get_webhook_outbound_status()
 *   public.get_webhook_inbound_history(flow_id, limit)
 */

import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { TablePagination, paginate } from '@/components/core/ui/table-pagination';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import {
  Webhook,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  AlertTriangle,
  History,
  ArrowDownToLine,
  ArrowUpFromLine,
} from 'lucide-react';

interface InboundRow {
  flow_id: string;
  flow_name: string;
  status: string;
  is_locked: boolean;
  last_run_at: string | null;
  last_run_status: 'completed' | 'failed' | 'running' | string | null;
  last_run_duration_ms: number | null;
  last_run_error: string | null;
  runs_24h: number;
  failures_24h: number;
  total_runs: number;
}

interface OutboundRow {
  endpoint_id: string;
  name: string;
  url: string;
  is_active: boolean;
  events: string[] | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  failure_count: number;
  calls_24h: number;
  failures_24h: number;
  pending: number;
  last_call_at: string | null;
  last_call_status: string | null;
}

interface InboundHistoryRow {
  run_id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  duration_ms: number | null;
  error_message: string | null;
  trigger_event_data: Record<string, unknown> | null;
}

const formatRelative = (iso: string | null): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
};

const formatDuration = (ms: number | null): string => {
  if (ms == null) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
};

// flow_runs uses 'completed'/'failed'; webhook_calls uses 'success'/'failed'/'pending'.
const StatusBadge: React.FC<{ status: string | null }> = ({ status }) => {
  if (!status) return <span className="text-xs text-muted-foreground">Never fired</span>;
  if (status === 'completed' || status === 'success' || status === 'succeeded') {
    return (
      <span className="inline-flex items-center text-xs text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Success
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center text-xs text-red-500 dark:text-red-400">
        <XCircle className="h-3 w-3 mr-1" />
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-xs text-amber-600 dark:text-amber-400">
      <Clock className="h-3 w-3 mr-1" />
      {status}
    </span>
  );
};

export const WebhooksPanel: React.FC = () => {
  const [inbound, setInbound] = useState<InboundRow[]>([]);
  const [outbound, setOutbound] = useState<OutboundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFlow, setSelectedFlow] = useState<{ id: string; name: string } | null>(null);
  const [history, setHistory] = useState<InboundHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    const [inRes, outRes] = await Promise.all([
      supabase.rpc('get_webhook_inbound_status'),
      supabase.rpc('get_webhook_outbound_status'),
    ]);
    if (inRes.error) {
      setError(inRes.error.message);
      setInbound([]);
    } else {
      setInbound((inRes.data ?? []) as InboundRow[]);
    }
    if (outRes.error) {
      // Don't clobber an inbound error; outbound is secondary.
      if (!inRes.error) setError(outRes.error.message);
      setOutbound([]);
    } else {
      setOutbound((outRes.data ?? []) as OutboundRow[]);
    }
    setLoading(false);
  };

  const openHistory = async (flowId: string, flowName: string) => {
    setSelectedFlow({ id: flowId, name: flowName });
    setHistory([]);
    setHistoryPage(1); // opening a different flow must not inherit the previous flow's page
    setHistoryLoading(true);
    const { data, error: rpcError } = await supabase.rpc('get_webhook_inbound_history', {
      p_flow_id: flowId,
      // Raised from 30 now that the dialog pages — a busy webhook buries its own history.
      p_limit: 200,
    });
    if (!rpcError) setHistory((data ?? []) as InboundHistoryRow[]);
    setHistoryLoading(false);
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 60000); // refresh every 60s
    return () => clearInterval(interval);
  }, []);

  const inboundFailures24h = inbound.reduce((s, r) => s + (r.failures_24h || 0), 0);
  const outboundFailures24h = outbound.reduce((s, r) => s + (r.failures_24h || 0), 0);
  const pausedInbound = inbound.filter((r) => r.status !== 'active').length;

  return (
    <Card className="dashboard-card">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Webhook className="h-4 w-4" />
              Webhooks
              {(inboundFailures24h + outboundFailures24h) > 0 && (
                <Badge variant="destructive">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {inboundFailures24h + outboundFailures24h} failure
                  {inboundFailures24h + outboundFailures24h === 1 ? '' : 's'} in 24h
                </Badge>
              )}
              {pausedInbound > 0 && (
                <Badge variant="outline" className="border-yellow-500 text-yellow-500">
                  {pausedInbound} paused
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Inbound flow webhooks (external systems → a flow) and outbound delivery
              endpoints. Click an inbound row to see its run history.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAll}
            disabled={loading}
            className="rounded-full"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0 space-y-6">
        {error && (
          <div className="mx-6 p-3 rounded-md border border-destructive/50 bg-destructive/10 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* ── Inbound flow webhooks ─────────────────────────── */}
        <div>
          <div className="px-6 pb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <ArrowDownToLine className="h-3.5 w-3.5" />
            Inbound — flows triggered by an external POST
          </div>
          {loading && inbound.length === 0 ? (
            <div className="px-6 py-6 text-center text-sm text-muted-foreground">Loading…</div>
          ) : inbound.length === 0 ? (
            <div className="px-6 py-6 text-center text-sm text-muted-foreground">
              No webhook-triggered flows yet. Create a flow with a <strong>Webhook</strong> trigger,
              then POST to <code className="text-xs">/functions/v1/flow-webhook?flow_id=&lt;id&gt;</code> to see it here.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Flow</th>
                    <th className="px-3 py-3 font-medium">Flow status</th>
                    <th className="px-3 py-3 font-medium">Last fired</th>
                    <th className="px-3 py-3 font-medium">Result</th>
                    <th className="px-3 py-3 font-medium">Duration</th>
                    <th className="px-3 py-3 font-medium text-right">24h</th>
                    <th className="px-3 py-3 font-medium text-right">24h fail</th>
                    <th className="px-6 py-3 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {inbound.map((r) => (
                    <tr
                      key={r.flow_id}
                      className="border-b border-border/40 hover:bg-muted/30 cursor-pointer"
                      // Row onClick is a MOUSE CONVENIENCE only — the keyboard/AT path is the button on the
                      // primary cell. A <tr> cannot be made focusable correctly: tabIndex + role="button" on a
                      // row is invalid ARIA and yields a focus stop with no name.
                      onClick={() => openHistory(r.flow_id, r.flow_name)}
                    >
                      <td className="px-6 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={(e) => { e.stopPropagation(); openHistory(r.flow_id, r.flow_name); }} className="text-left hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">{r.flow_name}</button>
                          <History className="h-3 w-3 text-muted-foreground" />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {r.status === 'active' ? (
                          <span className="text-xs text-emerald-600 dark:text-emerald-400">Active</span>
                        ) : (
                          <span className="text-xs text-muted-foreground capitalize">{r.status}</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{formatRelative(r.last_run_at)}</td>
                      <td className="px-3 py-3"><StatusBadge status={r.last_run_status} /></td>
                      <td className="px-3 py-3 text-muted-foreground">{formatDuration(r.last_run_duration_ms)}</td>
                      <td className="px-3 py-3 text-right">{r.runs_24h}</td>
                      <td className="px-3 py-3 text-right">
                        {r.failures_24h > 0 ? (
                          <span className="text-destructive font-semibold">{r.failures_24h}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right text-muted-foreground">{r.total_runs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Outbound webhook endpoints ────────────────────── */}
        <div>
          <div className="px-6 pb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <ArrowUpFromLine className="h-3.5 w-3.5" />
            Outbound — platform delivers to a configured endpoint
          </div>
          {loading && outbound.length === 0 ? (
            <div className="px-6 py-6 text-center text-sm text-muted-foreground">Loading…</div>
          ) : outbound.length === 0 ? (
            <div className="px-6 py-6 text-center text-sm text-muted-foreground">
              No outbound webhook endpoints configured.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Endpoint</th>
                    <th className="px-3 py-3 font-medium">URL</th>
                    <th className="px-3 py-3 font-medium">Last call</th>
                    <th className="px-3 py-3 font-medium">Result</th>
                    <th className="px-3 py-3 font-medium text-right">24h</th>
                    <th className="px-3 py-3 font-medium text-right">24h fail</th>
                    <th className="px-3 py-3 font-medium text-right">Pending</th>
                    <th className="px-6 py-3 font-medium text-right">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {outbound.map((r) => (
                    <tr key={r.endpoint_id} className="border-b border-border/40 hover:bg-muted/30">
                      <td className="px-6 py-3 font-medium">{r.name}</td>
                      <td className="px-3 py-3 font-mono text-xs text-muted-foreground max-w-[260px] truncate" title={r.url}>
                        {r.url}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{formatRelative(r.last_call_at)}</td>
                      <td className="px-3 py-3"><StatusBadge status={r.last_call_status} /></td>
                      <td className="px-3 py-3 text-right">{r.calls_24h}</td>
                      <td className="px-3 py-3 text-right">
                        {r.failures_24h > 0 ? (
                          <span className="text-destructive font-semibold">{r.failures_24h}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right text-muted-foreground">{r.pending}</td>
                      <td className="px-6 py-3 text-right">
                        {r.is_active ? (
                          <span className="text-xs text-emerald-600 dark:text-emerald-400">on</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">off</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>

      {/* Inbound run-history drill-down */}
      <Dialog open={selectedFlow !== null} onOpenChange={(open) => !open && setSelectedFlow(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Webhook runs — <span className="font-mono text-base">{selectedFlow?.name}</span>
            </DialogTitle>
          </DialogHeader>
          {historyLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading history…</div>
          ) : history.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No runs recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Fired</th>
                    <th className="py-2 pr-3 font-medium">Result</th>
                    <th className="py-2 pr-3 font-medium">Duration</th>
                    <th className="py-2 font-medium">Payload / Error</th>
                  </tr>
                </thead>
                <tbody>
                  {paginate(history, historyPage).map((r) => (
                    <tr key={r.run_id} className="border-b border-border/40 align-top">
                      <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                        {new Date(r.started_at).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3"><StatusBadge status={r.status} /></td>
                      <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">
                        {formatDuration(r.duration_ms)}
                      </td>
                      <td className="py-2 text-xs font-mono break-all text-muted-foreground">
                        {r.error_message
                          ? r.error_message
                          : r.trigger_event_data
                          ? JSON.stringify(r.trigger_event_data).slice(0, 200)
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <TablePagination
                page={historyPage}
                total={history.length}
                onPageChange={setHistoryPage}
                label="runs"
                className="px-0"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};
