import { useCallback, useEffect, useMemo, useState, type FC, type ReactNode } from 'react';
import { RefreshCw, ShieldCheck, AlertTriangle, Wrench, EyeOff, Loader2 } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Switch } from '@/components/core/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { GlobalAdminHeader } from './GlobalAdminHeader';
import { TaricReferencePanel } from './TaricReferencePanel';
import { TaricRulesPanel } from './TaricRulesPanel';
import { formatDate } from '@/utils/datetime';
import { cn } from '@/lib/utils';
import {
  HubEmptyState,
  HubFilterSelect,
  HubResetFilters,
  HubSortButton,
  HubToolbar,
  HUB_FILTER_ALL,
  useHubTable,
  type HubSort,
  type HubTableField,
} from '@/components/core/hub';
import {
  dataIntegrityService as svc,
  type IntegrityCheck, type IntegrityFinding, type IntegrityRun, type IntegritySeverity,
} from '@/services/dataIntegrityService';

const sevTone: Record<IntegritySeverity, string> = {
  critical: 'text-red-500 dark:text-red-400',
  warning: 'text-amber-600 dark:text-amber-400',
  info: 'text-sky-600 dark:text-sky-400',
};

const SEVERITY_RANK: Record<IntegritySeverity, number> = { critical: 3, warning: 2, info: 1 };
const capitalize = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

const CHECK_FIELDS: HubTableField<IntegrityCheck>[] = [
  { id: 'check', sortValue: (c) => c.title, searchText: (c) => `${c.title} ${c.key} ${c.description ?? ''}` },
  { id: 'domain', sortValue: (c) => c.domain, filterValue: (c) => c.domain, filterLabel: 'Domain' },
  {
    id: 'severity',
    sortValue: (c) => SEVERITY_RANK[c.severity],
    filterValue: (c) => c.severity,
    filterLabel: 'Severity',
    filterOptionLabel: capitalize,
  },
];

const RUN_FIELDS: HubTableField<IntegrityRun>[] = [
  { id: 'started', sortValue: (r) => r.started_at },
  {
    id: 'by',
    sortValue: (r) => r.triggered_by,
    filterValue: (r) => (r.triggered_by === 'cron' ? 'cron' : r.autoheal ? 'admin · heal' : 'admin'),
    filterLabel: 'Triggered by',
  },
  { id: 'checks', sortValue: (r) => r.checks_run },
  { id: 'open', sortValue: (r) => r.findings_open },
  { id: 'healed', sortValue: (r) => r.findings_healed },
];

const SortHead: FC<{
  id: string;
  sort?: HubSort;
  onSort: (id: string) => void;
  align?: 'left' | 'right';
  className?: string;
  children: ReactNode;
}> = ({ id, sort, onSort, align, className, children }) => {
  const active = sort?.columnId === id ? sort.direction : undefined;
  return (
    <TableHead
      className={cn(align === 'right' && 'text-right', className)}
      aria-sort={active ? (active === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      <HubSortButton active={active} align={align} onClick={() => onSort(id)}>
        {children}
      </HubSortButton>
    </TableHead>
  );
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
  const findingFields = useMemo<HubTableField<IntegrityFinding>[]>(() => [
    {
      id: 'check',
      sortValue: (f) => checkByKey.get(f.check_key)?.title ?? f.check_key,
      searchText: (f) => `${checkByKey.get(f.check_key)?.title ?? ''} ${f.check_key} ${f.entity_table ?? ''} ${f.entity_id ?? ''}`,
    },
    {
      id: 'severity',
      sortValue: (f) => SEVERITY_RANK[f.severity],
      filterValue: (f) => f.severity,
      filterLabel: 'Severity',
      filterOptionLabel: capitalize,
    },
    { id: 'domain', filterValue: (f) => f.domain, filterLabel: 'Domain' },
    { id: 'entity', sortValue: (f) => f.entity_table, filterValue: (f) => f.entity_table, filterLabel: 'Entity' },
  ], [checkByKey]);
  const findingTable = useHubTable(findings, findingFields);
  const checkTable = useHubTable(checks, CHECK_FIELDS);
  const runTable = useHubTable(runs, RUN_FIELDS);
  const { search: findingSearch, filters: findingFilters } = findingTable;
  const { filters: runFilters } = runTable;
  useEffect(() => { setFindingsPage(1); }, [findingSearch, findingFilters]);
  useEffect(() => { setRunsPage(1); }, [runFilters]);
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
                  ? `Last run ${formatDate(lastRun.started_at, { withTime: true })} · ${lastRun.checks_run} checks · ${lastRun.findings_healed} healed`
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

        {/* The nomenclature above is the vocabulary; these rules are how a product gets mapped
            into it. Both are admin-global reference data, and both are things whose staleness
            shows up as a finding on this page. */}
        <TaricRulesPanel />

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
                  <HubToolbar
                    search={findingTable.search}
                    onSearchChange={findingTable.setSearch}
                    searchPlaceholder="Search findings"
                    filters={
                      <>
                        <HubFilterSelect
                          label="Severity"
                          value={findingTable.filters.severity ?? HUB_FILTER_ALL}
                          options={findingTable.filterOptions.severity}
                          onChange={(v) => findingTable.setFilter('severity', v)}
                        />
                        <HubFilterSelect
                          label="Domain"
                          value={findingTable.filters.domain ?? HUB_FILTER_ALL}
                          options={findingTable.filterOptions.domain}
                          onChange={(v) => findingTable.setFilter('domain', v)}
                        />
                        <HubFilterSelect
                          label="Entity"
                          value={findingTable.filters.entity ?? HUB_FILTER_ALL}
                          options={findingTable.filterOptions.entity}
                          onChange={(v) => findingTable.setFilter('entity', v)}
                        />
                        <HubResetFilters count={findingTable.activeFilterCount} onReset={findingTable.reset} />
                      </>
                    }
                  />
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortHead id="check" sort={findingTable.sort} onSort={findingTable.toggleSort}>Check</SortHead>
                        <SortHead id="severity" sort={findingTable.sort} onSort={findingTable.toggleSort}>Severity</SortHead>
                        <SortHead id="entity" sort={findingTable.sort} onSort={findingTable.toggleSort} className="hidden sm:table-cell">Entity</SortHead>
                        <TableHead className="hidden lg:table-cell">Detail</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {findingTable.rows.length === 0 && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={5} className="p-0">
                            <HubEmptyState
                              variant="filtered"
                              title="No findings match these filters"
                              action={<Button variant="outline" size="sm" onClick={findingTable.reset}>Clear filters</Button>}
                            />
                          </TableCell>
                        </TableRow>
                      )}
                      {paginate(findingTable.rows, findingsPage).map((f) => {
                        const c = checkByKey.get(f.check_key);
                        return (
                          <TableRow key={f.id}>
                            <TableCell><div className="font-medium">{c?.title ?? f.check_key}</div><div className="text-[11px] text-muted-foreground">{f.domain}</div></TableCell>
                            <TableCell><span className={`text-xs capitalize ${sevTone[f.severity]}`}>{f.severity}</span></TableCell>
                            <TableCell className="hidden text-xs sm:table-cell"><div>{f.entity_table ?? '—'}</div><div className="font-mono text-muted-foreground">{f.entity_id?.slice(0, 8) ?? '—'}</div></TableCell>
                            <TableCell className="hidden text-[11px] text-muted-foreground font-mono lg:table-cell">
                              <span className="block max-w-[18rem] truncate" title={JSON.stringify(f.detail)}>{JSON.stringify(f.detail)}</span>
                            </TableCell>
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
                    total={findingTable.rows.length}
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
                <HubToolbar
                  search={checkTable.search}
                  onSearchChange={checkTable.setSearch}
                  searchPlaceholder="Search checks"
                  filters={
                    <>
                      <HubFilterSelect
                        label="Domain"
                        value={checkTable.filters.domain ?? HUB_FILTER_ALL}
                        options={checkTable.filterOptions.domain}
                        onChange={(v) => checkTable.setFilter('domain', v)}
                      />
                      <HubFilterSelect
                        label="Severity"
                        value={checkTable.filters.severity ?? HUB_FILTER_ALL}
                        options={checkTable.filterOptions.severity}
                        onChange={(v) => checkTable.setFilter('severity', v)}
                      />
                      <HubResetFilters count={checkTable.activeFilterCount} onReset={checkTable.reset} />
                    </>
                  }
                />
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortHead id="check" sort={checkTable.sort} onSort={checkTable.toggleSort}>Check</SortHead>
                      <SortHead id="domain" sort={checkTable.sort} onSort={checkTable.toggleSort} className="hidden md:table-cell">Domain</SortHead>
                      <SortHead id="severity" sort={checkTable.sort} onSort={checkTable.toggleSort} className="hidden sm:table-cell">Severity</SortHead>
                      <TableHead className="text-center">Enabled</TableHead><TableHead className="text-center">Auto-heal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {checkTable.rows.length === 0 && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={5} className="p-0">
                          {checkTable.activeFilterCount > 0 ? (
                            <HubEmptyState
                              variant="filtered"
                              title="No checks match these filters"
                              action={<Button variant="outline" size="sm" onClick={checkTable.reset}>Clear filters</Button>}
                            />
                          ) : (
                            <HubEmptyState title="No checks registered" />
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                    {checkTable.rows.map((c) => (
                      <TableRow key={c.key}>
                        <TableCell><div className="font-medium">{c.title}</div><div className="text-[11px] text-muted-foreground max-w-[420px] break-words">{c.description}</div></TableCell>
                        <TableCell className="hidden text-xs md:table-cell">{c.domain}</TableCell>
                        <TableCell className="hidden sm:table-cell"><span className={`text-xs capitalize ${sevTone[c.severity]}`}>{c.severity}</span></TableCell>
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
                <HubToolbar
                  filters={
                    <>
                      <HubFilterSelect
                        label="Triggered by"
                        value={runTable.filters.by ?? HUB_FILTER_ALL}
                        options={runTable.filterOptions.by}
                        onChange={(v) => runTable.setFilter('by', v)}
                      />
                      <HubResetFilters count={runTable.activeFilterCount} onReset={runTable.reset} />
                    </>
                  }
                />
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortHead id="started" sort={runTable.sort} onSort={runTable.toggleSort}>Started</SortHead>
                      <SortHead id="by" sort={runTable.sort} onSort={runTable.toggleSort} className="hidden sm:table-cell">By</SortHead>
                      <SortHead id="checks" sort={runTable.sort} onSort={runTable.toggleSort} align="right" className="hidden sm:table-cell">Checks</SortHead>
                      <SortHead id="open" sort={runTable.sort} onSort={runTable.toggleSort} align="right">Open</SortHead>
                      <SortHead id="healed" sort={runTable.sort} onSort={runTable.toggleSort} align="right">Healed</SortHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginate(runTable.rows, runsPage).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap text-xs">{formatDate(r.started_at, { withTime: true })}</TableCell>
                        <TableCell className="hidden text-xs sm:table-cell">{r.triggered_by === 'cron' ? 'cron' : r.autoheal ? 'admin · heal' : 'admin'}</TableCell>
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">{r.checks_run}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.findings_open}</TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">{r.findings_healed}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <TablePagination
                  page={runsPage}
                  total={runTable.rows.length}
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
