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
 */
import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Upload, Ship, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { taricService } from '@/services/taricService';

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
                : `${stats!.total.toLocaleString()} codes (${stats!.declarable.toLocaleString()} declarable) · last import ${new Date(stats!.last_import!).toLocaleDateString()}`}
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
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv" className="hidden"
            onChange={(e) => onFile(e.target.files)} />
          <Button size="sm" className="rounded-full" disabled={importing}
            onClick={() => fileRef.current?.click()}>
            {importing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
            Import CSV
          </Button>
        </div>
      </CardHeader>

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
