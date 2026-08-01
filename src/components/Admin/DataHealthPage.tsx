import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, ShieldCheck, AlertTriangle, Wrench, Check, EyeOff, Loader2 } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Switch } from '@/components/core/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { GlobalAdminHeader } from './GlobalAdminHeader';
import { TaricReferencePanel } from './TaricReferencePanel';
import {
  dataIntegrityService as svc,
  type IntegrityCheck, type IntegrityFinding, type IntegrityRun, type IntegritySeverity,
} from '@/services/dataIntegrityService';

const sevTone: Record<IntegritySeverity, string> = {
  critical: 'text-red-500 dark:text-red-400',
  warning: 'text-amber-600 dark:text-amber-400',
  info: 'text-sky-600 dark:text-sky-400',
};

export default function DataHealthPage() {
  const { toast } = useToast();
  const [checks, setChecks] = useState<IntegrityCheck[]>([]);
  const [findings, setFindings] = useState<IntegrityFinding[]>([]);
  const [runs, setRuns] = useState<IntegrityRun[]>([]);
  const [findingsPage, setFindingsPage] = useState(1);
  const [runsPage, setRunsPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Runs are paged, so pull a real window rather than the 8 that used to fit the card.
      const [c, f, r] = await Promise.all([svc.listChecks(), svc.listFindings({ status: 'open' }), svc.listRuns(200)]);
      setChecks(c); setFindings(f); setRuns(r);
      // Healing / ignoring shrinks the finding set — clamp so the reader isn't left on a blank page.
      setFindingsPage((p) => clampPage(p, f.length));
      setRunsPage((p) => clampPage(p, r.length));
    } catch (err: any) {
      toast({ title: 'Failed to load', description: err?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const checkByKey = useMemo(() => new Map(checks.map((c) => [c.key, c])), [checks]);
  const openCritical = findings.filter((f) => f.severity === 'critical').length;
  const lastRun = runs[0] ?? null;

  const runNow = async (autoheal: boolean) => {
    setRunning(true);
    try {
      await svc.run({ autoheal });
      toast({ title: autoheal ? 'Checks run + safe issues healed' : 'Checks run' });
      await load();
    } catch (err: any) {
      toast({ title: 'Run failed', description: err?.message, variant: 'destructive' });
    } finally { setRunning(false); }
  };

  const healCheck = async (key: string) => {
    setBusyKey(key);
    try {
      const r = await svc.healCheck(key);
      toast({ title: `Healed ${r.healed} row(s)` });
      await load();
    } catch (err: any) {
      toast({ title: 'Heal failed', description: err?.message, variant: 'destructive' });
    } finally { setBusyKey(null); }
  };

  const ignoreFinding = async (id: string) => {
    try { await svc.ignoreFinding(id); await load(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };

  const setAutoheal = async (key: string, enabled: boolean) => {
    setChecks((cs) => cs.map((c) => c.key === key ? { ...c, autoheal_enabled: enabled } : c));
    try { await svc.setAutoheal(key, enabled); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); void load(); }
  };
  const toggleCheck = async (key: string, enabled: boolean) => {
    setChecks((cs) => cs.map((c) => c.key === key ? { ...c, is_enabled: enabled } : c));
    try { await svc.toggleCheck(key, enabled); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); void load(); }
  };

  return (
    <>
      <GlobalAdminHeader
        title="Data Health"
        description="Continuous integrity checks across the platform — drift the database can't prevent on its own."
        badge={openCritical > 0 ? `${openCritical} critical` : undefined}
      />
      <div className="p-4 sm:p-6 space-y-4">
        {/* Summary + run controls */}
        <Card className="dashboard-card">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                {findings.length === 0
                  ? <><ShieldCheck className="h-4 w-4 text-emerald-500" /> All clear</>
                  : <><AlertTriangle className="h-4 w-4 text-amber-500" /> {findings.length} open finding{findings.length === 1 ? '' : 's'}</>}
              </CardTitle>
              <CardDescription>
                {lastRun
                  ? `Last run ${new Date(lastRun.started_at).toLocaleString()} · ${lastRun.checks_run} checks · ${lastRun.findings_healed} healed`
                  : 'No runs yet.'}
              </CardDescription>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => runNow(false)} disabled={running}>
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />} Run checks
              </Button>
              <Button size="sm" onClick={() => runNow(true)} disabled={running}>
                <Wrench className="h-4 w-4 mr-1" /> Run + auto-heal
              </Button>
            </div>
          </CardHeader>
        </Card>

        {/* Reference data whose staleness IS one of the checks above — the fix belongs next to
            the finding, not in a settings screen the operator has to go hunting for. */}
        <TaricReferencePanel />

        <Tabs defaultValue="findings">
          <TabsList>
            <TabsTrigger value="findings">Findings{findings.length > 0 ? ` (${findings.length})` : ''}</TabsTrigger>
            <TabsTrigger value="checks">Checks ({checks.length})</TabsTrigger>
            <TabsTrigger value="runs">Runs</TabsTrigger>
          </TabsList>

          {/* ── Findings ── */}
          <TabsContent value="findings">
            <Card className="dashboard-card">
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
                ) : findings.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">No open findings. Everything checks out. ✓</div>
                ) : (
                  <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Check</TableHead><TableHead>Severity</TableHead>
                        <TableHead>Entity</TableHead><TableHead>Detail</TableHead><TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginate(findings, findingsPage).map((f) => {
                        const c = checkByKey.get(f.check_key);
                        return (
                          <TableRow key={f.id}>
                            <TableCell><div className="font-medium">{c?.title ?? f.check_key}</div><div className="text-[11px] text-muted-foreground">{f.domain}</div></TableCell>
                            <TableCell><span className={`text-xs capitalize ${sevTone[f.severity]}`}>{f.severity}</span></TableCell>
                            <TableCell className="text-xs"><div>{f.entity_table}</div><div className="font-mono text-muted-foreground">{f.entity_id?.slice(0, 8)}</div></TableCell>
                            <TableCell className="text-[11px] text-muted-foreground max-w-[280px] truncate font-mono">{JSON.stringify(f.detail)}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              {c?.can_autoheal && (
                                <Button variant="ghost" size="sm" disabled={busyKey === f.check_key} onClick={() => healCheck(f.check_key)} title="Run this check's heal">
                                  {busyKey === f.check_key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Wrench className="h-3.5 w-3.5 mr-1" /> Heal</>}
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" onClick={() => ignoreFinding(f.id)} title="Accept / Won't-fix"><EyeOff className="h-3.5 w-3.5 mr-1" /> Ignore</Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  <TablePagination
                    page={findingsPage}
                    total={findings.length}
                    onPageChange={setFindingsPage}
                    label="findings"
                  />
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Checks registry ── */}
          <TabsContent value="checks">
            <Card className="dashboard-card">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Check</TableHead><TableHead>Domain</TableHead><TableHead>Severity</TableHead>
                      <TableHead className="text-center">Enabled</TableHead><TableHead className="text-center">Auto-heal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {checks.map((c) => (
                      <TableRow key={c.key}>
                        <TableCell><div className="font-medium">{c.title}</div><div className="text-[11px] text-muted-foreground max-w-[420px]">{c.description}</div></TableCell>
                        <TableCell className="text-xs">{c.domain}</TableCell>
                        <TableCell><span className={`text-xs capitalize ${sevTone[c.severity]}`}>{c.severity}</span></TableCell>
                        <TableCell className="text-center"><Switch checked={c.is_enabled} onCheckedChange={(v) => toggleCheck(c.key, v)} /></TableCell>
                        <TableCell className="text-center">
                          {c.can_autoheal
                            ? <Switch checked={c.autoheal_enabled} onCheckedChange={(v) => setAutoheal(c.key, v)} />
                            : <span className="text-[11px] text-muted-foreground">manual</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Runs ── */}
          <TabsContent value="runs">
            <Card className="dashboard-card">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Started</TableHead><TableHead>By</TableHead><TableHead className="text-center">Checks</TableHead>
                      <TableHead className="text-center">Open</TableHead><TableHead className="text-center">Healed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginate(runs, runsPage).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs">{new Date(r.started_at).toLocaleString()}</TableCell>
                        <TableCell className="text-xs">{r.triggered_by === 'cron' ? 'cron' : r.autoheal ? 'admin · heal' : 'admin'}</TableCell>
                        <TableCell className="text-center tabular-nums">{r.checks_run}</TableCell>
                        <TableCell className="text-center tabular-nums">{r.findings_open}</TableCell>
                        <TableCell className="text-center tabular-nums text-emerald-500">{r.findings_healed}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <TablePagination
                  page={runsPage}
                  total={runs.length}
                  onPageChange={setRunsPage}
                  label="runs"
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
