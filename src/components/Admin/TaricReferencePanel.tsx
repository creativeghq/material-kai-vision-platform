/**
 * Import + health for the EU TARIC nomenclature.
 *
 * Lives on Data Health rather than in a settings screen because that is where the problem is
 * reported: `taric_reference_stale` fires when this table is empty or two months old, and the
 * fix should not be somewhere else in the app.
 *
 * CSV/TSV only. The nomenclature is published as spreadsheets on CIRCABC ("TARIC & Quota Data
 * and Information") — one "Save as CSV" beats shipping a spreadsheet parser to a browser and an
 * edge function. Column names are matched server-side against an alias table, so the EU export,
 * the Greek national export and an admin's own re-export all load without configuration.
 *
 * WHY THIS SCREEN EXISTS AT ALL — it is not a design preference. The EU publishes the 10-digit
 * TARIC nomenclature only as HTML query tools on the open-data portal; the machine-readable
 * monthly extractions live on CIRCABC behind a UUID that changes every month, with no public
 * listing API. There is no URL that can be hardcoded to mean "this month's TARIC". (The
 * Combined Nomenclature IS openly downloadable, but it is 8-digit and carries no declarability,
 * which is the one thing the picker and the classifier depend on.)
 *
 * So the URL is supplied once by a human and REMEMBERED: `taric-reference-refresh-monthly`
 * re-fetches it every month. This screen is the bootstrap and the fallback, not the routine.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Upload, Ship, CheckCircle2, AlertTriangle, Link2, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Label } from '@/components/core/ui/label';
import { Input } from '@/components/core/ui/input';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { taricService } from '@/services/taricService';
import { formatDate } from '@/utils/datetime';
import { formatNumber } from '@/utils/decimal';

/** Refuse to read a file the browser would choke on before the request is even built. */
const MAX_FILE_BYTES = 40 * 1024 * 1024;

export const TaricReferencePanel: React.FC = () => {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [stats, setStats] = useState<{ total: number; declarable: number; last_import: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [source, setSource] = useState<'taric_eu' | 'gr_national'>('gr_national');
  const [lastResult, setLastResult] = useState<any>(null);
  const [url, setUrl] = useState('');
  const [remember, setRemember] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try { setStats(await taricService.stats()); }
    catch { setStats(null); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);

  const onFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      toast({ title: 'File too large', description: 'Split the export, or import one chapter at a time.', variant: 'destructive' });
      return;
    }
    setImporting(true);
    setLastResult(null);
    try {
      const text = await file.text();
      const res = await taricService.importReference(text, source);
      setLastResult(res);
      toast({
        title: 'Nomenclature imported',
        description: `${res.rows_upserted} codes from ${res.rows_in_file} rows.`,
      });
      await refresh();
    } catch (err: any) {
      toast({ title: 'Import failed', description: err?.message, variant: 'destructive' });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onUrl = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setImporting(true);
    setLastResult(null);
    try {
      const res = await taricService.importReferenceFromUrl(trimmed, source, { remember });
      setLastResult(res);
      toast({
        title: 'Nomenclature imported',
        description: `${res.rows_upserted} codes from ${res.rows_in_file} rows.` +
          (remember
            ? (res.remembered
                ? ' Saved for the monthly refresh.'
                : ' Imported, but the URL could not be saved — the monthly refresh is still unset.')
            : ''),
      });
      await refresh();
    } catch (err: any) {
      toast({ title: 'Import failed', description: err?.message, variant: 'destructive' });
    } finally { setImporting(false); }
  };

  const stale = !!stats?.last_import &&
    Date.now() - new Date(stats.last_import).getTime() > 60 * 24 * 3600 * 1000;
  const empty = !stats || stats.total === 0;

  return (
    <Card className="dashboard-card">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Ship className="h-4 w-4 text-primary" />
            TARIC nomenclature
          </CardTitle>
          <CardDescription>
            {loading
              ? 'Checking…'
              : empty
                ? 'Not imported yet — the code picker and the classifier have nothing to match against.'
                : `${formatNumber(stats!.total)} codes (${formatNumber(stats!.declarable)} declarable) · last import ${formatDate(stats!.last_import!)}`}
          </CardDescription>
        </div>
        <div className="flex items-end gap-2 shrink-0">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Source</Label>
            <Select value={source} onValueChange={(v) => setSource(v as 'taric_eu' | 'gr_national')}>
              <SelectTrigger className="h-9 text-xs w-[190px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gr_national">Greek national extract</SelectItem>
                <SelectItem value="taric_eu">EU TARIC extract</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* Visually hidden and driven by the button beside it, so it carries its own label. */}
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv" className="hidden"
            aria-label="TARIC nomenclature CSV file"
            onChange={(e) => onFile(e.target.files)} />
          <Button size="sm" variant="outline" disabled={importing}
            onClick={() => fileRef.current?.click()}>
            {importing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
            Upload CSV
          </Button>
        </div>
      </CardHeader>

      {/* The preferred route. CIRCABC file links are unauthenticated, so pasting one skips the
          download-and-upload round trip — and, remembered, it is the same URL the monthly cron
          re-fetches, which is what turns this from a chore into a one-time setup. */}
      <CardContent className="pt-0 pb-3 space-y-2">
        <Label htmlFor="taric-url" className="text-[11px] text-muted-foreground">
          Import from a link (right-click the file in CIRCABC → copy link)
        </Label>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Link2 className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              id="taric-url"
              className="h-9 pl-7 text-xs"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://circabc.europa.eu/sd/a/…/goods-nomenclature.csv"
            />
          </div>
          <Button size="sm" disabled={importing || !url.trim()} onClick={onUrl}>
            {importing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Fetch &amp; import
          </Button>
        </div>
        <label htmlFor="taric-remember" className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer">
          <Checkbox id="taric-remember" checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
          <span>
            Re-fetch this link monthly (saves it as <code>TARIC_REFERENCE_URL</code>). The EU
            publishes no stable TARIC download URL, so this is what makes the refresh automatic.
          </span>
        </label>
      </CardContent>

      {(empty || stale || lastResult) && (
        <CardContent className="pt-0 space-y-2">
          {(empty || stale) && (
            <p className="flex items-start gap-2 text-xs text-amber-500">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {empty
                ? 'Export the goods-nomenclature sheet from the CIRCABC TARIC library as CSV and import it here. Set TARIC_REFERENCE_URL in platform secrets to have the monthly cron refresh it on its own.'
                : 'The nomenclature changes monthly. This copy is more than 60 days old.'}
            </p>
          )}
          {lastResult && (
            <div className="rounded-md border border-border/60 bg-muted/20 p-2.5 text-xs space-y-1">
              <p className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                {lastResult.rows_upserted} codes written
                {lastResult.rows_skipped > 0 && (
                  <span className="font-normal text-muted-foreground">
                    · {lastResult.rows_skipped} rows skipped (no usable code)
                  </span>
                )}
              </p>
              {/* Which header mapped to which field — the one thing that silently goes wrong on
                  a file layout nobody has seen before. */}
              <p className="text-[11px] text-muted-foreground">
                Columns read: {Object.entries(lastResult.columns ?? {})
                  .map(([field, header]) => `${field} ← "${header}"`).join(' · ')}
              </p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};

export default TaricReferencePanel;
