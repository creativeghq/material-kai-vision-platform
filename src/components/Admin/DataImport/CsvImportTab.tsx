import { useRef, useState } from 'react';
import { FileSpreadsheet, Loader2, Upload } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { parseCsv } from '@/utils/csv';

const COLUMNS = [
  'name', 'sku', 'description', 'category', 'barcode', 'country_of_origin',
  'warranty', 'product_url',
] as const;

const BATCH = 500;

type Result = { created: number; updated: number; skipped: number; unkeyed: number };

const ISO2 = /^[A-Za-z]{2}$/;


export function CsvImportTab() {
  const { activeWorkspaceId } = useWorkspace();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const { toast } = useToast();

  const pick = async (file: File) => {
    setResult(null);
    setFileName(file.name);
    try {
      const parsed = parseCsv(await file.text());
      setRows(parsed);
      if (parsed.length === 0) {
        toast({ title: 'Nothing to import', description: 'That file has no data rows.' });
      }
    } catch {
      setRows(null);
      toast({ title: 'Could not read that file', description: 'It does not parse as CSV.', variant: 'destructive' });
    }
  };

  const namedRows = rows?.filter((r) => (r.name ?? '').trim() !== '').length ?? 0;
  const unnamed = (rows?.length ?? 0) - namedRows;

  const run = async () => {
    if (!rows || !activeWorkspaceId) return;
    setBusy(true);
    const total: Result = { created: 0, updated: 0, skipped: 0, unkeyed: 0 };
    try {
      for (let i = 0; i < rows.length; i += BATCH) {
        const slice = rows.slice(i, i + BATCH).map((r) => {
          const row: Record<string, string> = {};
          for (const c of COLUMNS) if (r[c] !== undefined) row[c] = r[c];
          const cc = (row.country_of_origin ?? '').trim();
          if (cc && ISO2.test(cc)) row.country_of_origin = cc.toUpperCase();
          else if (cc) delete row.country_of_origin;
          return row;
        });
        const { data, error } = await supabase.rpc('import_catalogue_rows', {
          p_workspace_id: activeWorkspaceId,
          p_rows: slice,
        });
        if (error) throw error;
        const got = (Array.isArray(data) ? data[0] : data) as Result | undefined;
        total.created += got?.created ?? 0;
        total.updated += got?.updated ?? 0;
        total.skipped += got?.skipped ?? 0;
        total.unkeyed += got?.unkeyed ?? 0;
      }
      setResult(total);
    } catch (err) {
      setResult(total);
      const done = total.created + total.updated;
      toast({
        title: 'Import stopped partway',
        description: `${done} product${done === 1 ? '' : 's'} were already written before it failed. `
          + (total.unkeyed > 0
            ? `${total.unkeyed} of them had no SKU, so re-importing this file adds them again `
              + '— put a sku column on every row first. '
            : 'Re-importing the same file updates those rather than duplicating them. ')
          + (err instanceof Error ? err.message : 'The import could not be completed.'),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-sans text-base">Import products from a spreadsheet</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="max-w-prose text-sm text-muted-foreground">
          Save your sheet as CSV. The first row is the header, and these columns are read:{' '}
          <span className="font-medium">{COLUMNS.join(', ')}</span>. Anything else is ignored —
          price and cost are never taken from a file. A country must be a two-letter code. `category` is stored as text and does not file the product under a catalogue category.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            id="csv-import-file"
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void pick(f);
              e.target.value = '';
            }}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" />
            <span className="ml-2">Choose a CSV</span>
          </Button>
          {fileName && (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              {fileName}
            </span>
          )}
        </div>

        {rows && rows.length > 0 && (
          <div className="space-y-2 border-t border-hairline pt-3">
            <p className="text-sm">
              <span className="font-semibold tabular-nums">{namedRows}</span> product
              {namedRows === 1 ? '' : 's'} to import
              {unnamed > 0 && (
                <span className="text-muted-foreground">
                  {' '}— {unnamed} row{unnamed === 1 ? '' : 's'} have no name and will be skipped
                </span>
              )}
              .
            </p>
            <p className="text-xs text-muted-foreground">
              A row whose SKU already exists in this workspace updates that product rather than
              adding a second one. A row with no SKU cannot be matched, so a second import adds
              it again. Imported products arrive as drafts.
            </p>
            <Button onClick={() => void run()} disabled={busy || namedRows === 0}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              <span className="ml-2">{busy ? 'Importing…' : 'Import'}</span>
            </Button>
          </div>
        )}

        {result && (
          <p className="border-t border-hairline pt-3 text-sm">
            <span className="font-semibold">{result.created}</span> created,{' '}
            <span className="font-semibold">{result.updated}</span> updated
            {result.unkeyed > 0 && (
              <>, <span className="font-semibold">{result.unkeyed}</span> of them with no SKU (a re-import cannot match those)</>
            )}
            {result.skipped > 0 && (
              <>, <span className="font-semibold">{result.skipped}</span> skipped for having no name</>
            )}
            . They stay drafts until you activate them.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
