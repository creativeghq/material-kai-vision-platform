/**
 * The workspace CBAM position for a year, and the extract that reconciles it (#429).
 *
 * There is no CBAM API: the Declarants Portal is the unique entry point and takes manual upload
 * only, so what we owe ourselves is a figure shaped like the portal's own screen that an operator
 * can tie out against it. Nothing here is transmitted anywhere.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle, CheckCircle2, Download, Scale } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import { downloadCSV } from '@/components/analytics/shared/analyticsUtils';
import {
  cbamService, cbamNeedsAttention, cbamIsWatched, formatTonnes, extractToRows,
  type CbamYearPosition, type CbamExtractRow,
} from '@/modules/finance/services/cbamService';

interface ScopeRow {
  cn_prefix: string;
  description: string;
  in_scope: boolean;
  note: string | null;
}

/** The definitive regime began 1 January 2026; there is nothing to report before it. */
const FIRST_YEAR = 2026;

const years = () => {
  const now = new Date().getFullYear();
  const out: number[] = [];
  for (let y = Math.max(now, FIRST_YEAR); y >= FIRST_YEAR; y -= 1) out.push(y);
  return out;
};

export const CbamPositionCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [year, setYear] = useState(() => Math.max(new Date().getFullYear(), FIRST_YEAR));
  const [position, setPosition] = useState<CbamYearPosition | null>(null);
  const [rows, setRows] = useState<CbamExtractRow[]>([]);
  const [scope, setScope] = useState<ScopeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, r, s] = await Promise.all([
        cbamService.yearPosition(workspaceId, year),
        cbamService.portalExtract(workspaceId, year),
        // The Annex I table itself, so an operator can CHECK it rather than trust it. 7324 and
        // 7326 are one digit apart and only one of them is liable.
        cbamService.scopeTable().catch(() => [] as unknown[]),
      ]);
      setPosition(p); setRows(r); setScope(s as ScopeRow[]); setFailed(false);
    } catch {
      setPosition(null); setRows([]); setScope([]); setFailed(true);
    } finally { setLoading(false); }
  }, [workspaceId, year]);

  useEffect(() => { void load(); }, [load]);

  const download = () => {
    if (rows.length === 0) { toast({ title: 'Nothing to export for this year' }); return; }
    downloadCSV(`cbam-${year}.csv`, extractToRows(rows));
  };

  const tone = cbamNeedsAttention(position)
    ? 'border-destructive/40 bg-destructive/10 text-destructive'
    : cbamIsWatched(position)
      ? 'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300'
      : 'border-hairline bg-surface-sunken text-muted-foreground';

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="h-4 w-4 text-primary" /> Carbon border adjustment (CBAM)
          </CardTitle>
          <CardDescription>
            Ceramics are not in Annex I. What counts is the metal on the same orders — fixings,
            frames, profiles — measured as net mass across the whole calendar year.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years().map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={download} disabled={loading || rows.length === 0}>
            <Download className="mr-2 h-3.5 w-3.5" /> Extract
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {loading && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Deriving the {year} position…
          </p>
        )}

        {!loading && failed && (
          <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The {year} position could not be derived just now. That is not a statement that the year
            is under the threshold.
          </p>
        )}

        {!loading && !failed && position && (
          <div className={`rounded-md border p-2 text-xs ${tone}`}>
            <div className="flex flex-wrap items-center gap-2 font-medium">
              {cbamNeedsAttention(position) || cbamIsWatched(position)
                ? <AlertTriangle className="h-3.5 w-3.5" />
                : <CheckCircle2 className="h-3.5 w-3.5" />}
              <span className="tabular-nums">{formatTonnes(position.net_mass_kg)}</span>
              {position.threshold_kg != null && (
                <span className="tabular-nums">of {formatTonnes(position.threshold_kg)}</span>
              )}
            </div>
            <p className="mt-1">{position.reason}</p>
            {position.retroactive_from && (
              <p className="mt-1 font-medium">
                Liable from {position.retroactive_from}, not from the crossing date.
              </p>
            )}
            {(position.exempt_origin_entries ?? 0) > 0 && (
              <p className="mt-1">
                {position.exempt_origin_entries} entries are excluded by Annex III origin (Iceland,
                Liechtenstein, Norway, Switzerland and five territories). Turkey is not among them.
              </p>
            )}
            {position.legal_basis && <p className="mt-1">{position.legal_basis}</p>}
          </div>
        )}

        {!loading && !failed && rows.length === 0 && (
          <HubEmptyState
            title={`Nothing in scope for ${year}`}
            description="Annex I entries are recorded from a purchase order's Customs tab, once the consignment clears."
          />
        )}

        {!loading && rows.length > 0 && (
          <div className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sector</TableHead>
                  <TableHead>Goods code</TableHead>
                  <TableHead>Country of origin</TableHead>
                  <TableHead className="text-right">Entries</TableHead>
                  <TableHead className="text-right">Net mass</TableHead>
                  <TableHead className="text-right">Carbon price paid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={`${r.sector}:${r.goods_code}:${r.country_of_origin}`}>
                    <TableCell>{r.sector}</TableCell>
                    <TableCell className="tabular-nums">{r.goods_code}</TableCell>
                    <TableCell>{r.country_of_origin}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.entries}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatTonnes(r.net_mass_kg)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {/* Left as a dash on purpose: art. 9(1) counts only a price EFFECTIVELY
                          PAID, and art. 9(4) default values are published from 2027. */}
                      {r.carbon_price_paid_eur == null ? '—' : r.carbon_price_paid_eur}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {scope.length > 0 && (
          <details className="text-[11px] text-muted-foreground">
            <summary className="cursor-pointer">
              What counts as Annex I, and what was checked and ruled out
            </summary>
            <ul className="mt-1 space-y-0.5">
              {scope.map((s) => (
                <li key={s.cn_prefix}>
                  <span className="tabular-nums">{s.cn_prefix}</span>{' '}
                  {s.in_scope ? 'IN' : 'out'} — {s.description}
                  {s.note ? ` (${s.note})` : ''}
                </li>
              ))}
            </ul>
          </details>
        )}

        <p className="text-[11px] text-muted-foreground">
          There is no CBAM API — the Declarants Portal is the unique entry point and takes manual
          upload only. This extract is shaped like its Query goods and emissions screen so the two
          can be tied out; nothing here is transmitted.
        </p>
      </CardContent>
    </Card>
  );
};
