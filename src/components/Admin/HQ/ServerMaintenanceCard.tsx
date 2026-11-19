import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Play } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { formatDate, timeAgo } from '@/utils/datetime';

const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

type Verdict = 'ok' | 'degraded' | 'failed' | 'critical' | 'skipped';
type StepStatus = 'ok' | 'failed' | 'warning' | 'skipped';

interface Versions { kernel: string | null; kernel_installed: string | null; nginx: string | null; os: string | null; upgradable: number | null }
interface Step { name: string; status: StepStatus; detail: string; output: string; seconds: number; at: string | null }
interface Advisory { title: string; severity: string; cves: string[]; fixed_in: string[] }
interface Run {
  id: string; trigger: 'scheduled' | 'on_demand'; verdict: Verdict; reason: string | null;
  started_at: string; finished_at: string | null; rebooted: boolean;
  versions_before: Versions | null; versions_after: Versions | null;
  disk_total_bytes: number | null; disk_used_before: number | null; disk_used_after: number | null; freed_bytes: number | null;
  upstream_gap: Advisory[]; steps: Step[];
}
interface Server { server: string; label: string; public_health_url: string; last_poll_at: string | null; run_requested_at: string | null; runs: Run[] }
interface Payload { auto_review_server: boolean; servers: Server[] }

const VERDICT: Record<Verdict, { label: string; badge: 'success' | 'warning' | 'error' | 'neutral' }> = {
  ok: { label: 'OK', badge: 'success' },
  degraded: { label: 'Degraded', badge: 'warning' },
  failed: { label: 'Failed', badge: 'error' },
  critical: { label: 'Critical', badge: 'error' },
  skipped: { label: 'Skipped', badge: 'neutral' },
};
const STEP: Record<StepStatus, 'success' | 'warning' | 'error' | 'neutral'> = { ok: 'success', warning: 'warning', failed: 'error', skipped: 'neutral' };
const STEP_LABEL: Record<string, string> = {
  preflight: 'Drain', backup: 'Config Backup', update: 'Package Update', upstream: 'nginx.org Advisories',
  reboot: 'Reboot', restart: 'Service Restart', boot: 'Back After Reboot', nginx_rollback: 'nginx Rollback',
  verify: 'Verify', clean: 'Clean Up',
};

const gb = (b: number | null | undefined) => (b == null ? '—' : `${(b / 1024 ** 3).toFixed(1)} GB`);
const mb = (b: number | null | undefined) => (b == null ? '—' : `${Math.max(0, Math.round(b / 1024 ** 2)).toLocaleString()} MB`);
const pct = (used: number | null, total: number | null) => (used == null || !total ? '—' : `${Math.round((100 * used) / total)}%`);
const change = (a: string | null | undefined, b: string | null | undefined) => (!a && !b ? '—' : a === b ? (b ?? '—') : `${a ?? '—'} → ${b ?? '—'}`);

export const ServerMaintenanceCard: React.FC = () => {
  const { toast } = useToast();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: d, error: e } = await rpc('admin_server_maintenance');
    if (e) setError(e.message); else { setError(null); setData(d as Payload); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const call = async (key: string, fn: string, args: Record<string, unknown>, ok: string) => {
    setBusy(key);
    const { error: e } = await rpc(fn, args);
    setBusy(null);
    if (e) toast({ title: 'That did not work', description: e.message, variant: 'destructive' });
    else toast({ title: ok });
    void load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div>
          <CardTitle>Server Maintenance</CardTitle>
          <CardDescription>
            Every Sunday at 23:00 Athens time each server waits for document processing to finish, updates its packages
            (nginx from nginx.org), reboots if the update needs it, checks everything is up, then cleans old logs and caches.
            A failed or missing run opens an Agent Ops case.
          </CardDescription>
        </div>
        {data && (
          <div className="flex items-center gap-2">
            <Switch id="ops-auto-review-server" checked={data.auto_review_server} disabled={busy === 'auto'}
              onCheckedChange={(on) => void call('auto', 'admin_ops_server_auto_review', { p_on: on },
                on ? 'Server cases are reviewed by Stark and Veritas automatically.' : 'Server cases wait for Run Review.')} />
            <Label htmlFor="ops-auto-review-server" className="text-xs">Auto-Review Server Cases</Label>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {error && <p role="alert" className="text-sm text-[hsl(var(--error))]">Could not load server maintenance: {error}</p>}
        {!data && !error && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" /></div>}
        {data?.servers.map((s) => {
          const last = s.runs[0];
          const runNow = (
            <Button variant="outline" size="sm" className="gap-1.5" disabled={!!busy || !!s.run_requested_at}
              onClick={() => void call(`run:${s.server}`, 'admin_request_server_maintenance', { p_server: s.server },
                'Requested. The server starts within 15 minutes, once no document is processing.')}>
              {busy === `run:${s.server}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
              {s.run_requested_at ? 'Run Requested' : 'Run Now'}
            </Button>
          );
          return (
            <section key={s.server} aria-labelledby={`srv-${s.server}`} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 id={`srv-${s.server}`} className="text-sm font-semibold">{s.label}</h3>
                  <p className="text-xs text-muted-foreground">
                    Last check-in {s.last_poll_at ? timeAgo(s.last_poll_at) : 'never'}
                    {s.run_requested_at && <> · run requested {timeAgo(s.run_requested_at)}</>}
                  </p>
                </div>
                {runNow}
              </div>

              {!last ? (
                <HubEmptyState title="No run has reported yet" description="The first run happens on Sunday night, or start one now." action={runNow} />
              ) : (
                <>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                    <div><dt className="text-xs text-muted-foreground">Last Run</dt>
                      <dd className="flex items-center gap-1.5"><Badge variant={VERDICT[last.verdict].badge}>{VERDICT[last.verdict].label}</Badge>
                        <span className="text-xs text-muted-foreground">{timeAgo(last.finished_at ?? last.started_at)}</span></dd></div>
                    <div><dt className="text-xs text-muted-foreground">Kernel</dt><dd className="tabular-nums">{change(last.versions_before?.kernel, last.versions_after?.kernel)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">nginx</dt><dd className="tabular-nums">{change(last.versions_before?.nginx, last.versions_after?.nginx)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Disk</dt>
                      <dd className="tabular-nums">{pct(last.disk_used_after, last.disk_total_bytes)} of {gb(last.disk_total_bytes)} · freed {mb(last.freed_bytes)}</dd></div>
                  </dl>
                  {last.reason && last.verdict !== 'ok' && <p className="text-sm text-muted-foreground">{last.reason}</p>}
                  {last.upstream_gap.length > 0 && (
                    <div className="rounded-sm border border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning-bg))] px-3 py-2 text-sm">
                      <p className="font-medium">nginx is affected by {last.upstream_gap.length} nginx.org advisor{last.upstream_gap.length === 1 ? 'y' : 'ies'}</p>
                      <ul className="mt-1 list-disc pl-5 text-xs">
                        {last.upstream_gap.map((g) => <li key={g.title}>{g.title} ({g.severity}){g.cves.length ? ` · ${g.cves.join(', ')}` : ''} · fixed in {g.fixed_in.join(', ') || '—'}</li>)}
                      </ul>
                    </div>
                  )}

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Step</TableHead>
                        <TableHead>Result</TableHead>
                        <TableHead>Detail</TableHead>
                        <TableHead className="text-right">Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {last.steps.map((st, i) => (
                        <TableRow key={`${st.name}-${i}`}>
                          <TableCell className="text-sm font-medium">{STEP_LABEL[st.name] ?? st.name}</TableCell>
                          <TableCell><Badge variant={STEP[st.status]} className="capitalize">{st.status}</Badge></TableCell>
                          <TableCell className="max-w-[520px] text-sm">
                            {st.detail}
                            {st.status !== 'ok' && st.output && (
                              <details className="mt-1"><summary className="cursor-pointer text-xs text-primary">Output</summary>
                                <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded-sm bg-surface-sunken p-2 text-xs">{st.output}</pre>
                              </details>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{st.seconds ? `${st.seconds}s` : '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {s.runs.length > 1 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Earlier Runs</TableHead>
                          <TableHead>Trigger</TableHead>
                          <TableHead>Verdict</TableHead>
                          <TableHead>Rebooted</TableHead>
                          <TableHead className="text-right">Freed</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {s.runs.slice(1).map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="text-sm">{formatDate(r.started_at, { withTime: true })}</TableCell>
                            <TableCell className="text-sm">{r.trigger === 'on_demand' ? 'On Demand' : 'Scheduled'}</TableCell>
                            <TableCell><Badge variant={VERDICT[r.verdict].badge}>{VERDICT[r.verdict].label}</Badge></TableCell>
                            <TableCell className="text-sm">{r.rebooted ? 'Yes' : 'No'}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm">{mb(r.freed_bytes)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </>
              )}
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
};
