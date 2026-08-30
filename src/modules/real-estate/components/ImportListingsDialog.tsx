import React, { useRef, useState } from 'react';
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { realEstateService, type ImportResult } from '../services/realEstateService';

/**
 * Bulk listing import — the onboarding path. Syndication is pull-OUT only, so an agency arriving
 * with a few hundred listings previously had to retype them.
 *
 * The flow is deliberately preview-then-commit: a dry run reports exactly what would be created,
 * updated and skipped (with the reason per row) before anything is written. Imported listings land
 * as unpublished drafts — they have not been through the compliance gate, and a bulk import that
 * silently pushed 300 listings to the public site and the portal feeds is not something you can undo.
 */

/**
 * Minimal RFC4180 CSV reader: quoted fields, escaped `""`, and newlines inside quotes. Written here
 * rather than pulled in as a dependency — this is the whole of what we need, and a spreadsheet
 * export with a comma in an address is the one case a naive `split(',')` gets wrong.
 */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, ''); // strip the BOM Excel writes

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',' || c === ';') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return rows.slice(1)
    .filter((r) => r.some((c) => c.trim() !== ''))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

export const ImportListingsDialog: React.FC<{
  ws: string | null; open: boolean; onOpenChange: (v: boolean) => void; onImported: () => void;
}> = ({ ws, open, onOpenChange, onImported }) => {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [xml, setXml] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => { setRows(null); setXml(null); setPreview(null); setFileName(''); if (fileRef.current) fileRef.current.value = ''; };

  const onFile = async (file: File) => {
    const text = await file.text();
    setFileName(file.name);
    setPreview(null);
    if (/^\s*<\?xml|<root|<kyero/i.test(text)) { setXml(text); setRows(null); }
    else { setRows(parseCsv(text)); setXml(null); }
  };

  const run = async (dryRun: boolean) => {
    if (!ws) return;
    setBusy(true);
    try {
      const r = await realEstateService.importListings(ws, xml ? { xml } : { rows: rows ?? [] }, dryRun);
      setPreview(r);
      if (!dryRun) {
        toast({ title: `Imported ${r.summary.created + r.summary.updated} listing(s)`, description: r.summary.skipped ? `${r.summary.skipped} skipped` : 'All rows accepted' });
        onImported();
      }
    } catch (e) {
      toast({ title: 'Import failed', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const count = xml ? undefined : rows?.length;
  const problems = preview?.results.filter((r) => r.action === 'skipped') ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Import listings</DialogTitle></DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-dashed p-6 text-center">
            <FileSpreadsheet className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <input ref={fileRef} type="file" accept=".csv,.xml,text/csv,text/xml,application/xml" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-1 h-4 w-4" /> Choose a CSV or Kyero XML file
            </Button>
            {fileName && (
              <p className="mt-2 text-sm">
                <span className="font-medium">{fileName}</span>
                {count != null && <span className="text-muted-foreground"> · {count} row{count === 1 ? '' : 's'}</span>}
                {xml && <span className="text-muted-foreground"> · Kyero XML</span>}
              </p>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">
              Required per row: <code>property_type</code>, <code>transaction_type</code>, a title or description, and a price
              (or <code>price_on_request</code>). A <code>reference_code</code> makes re-imports update instead of duplicate.
            </p>
          </div>

          {preview && (
            <div className="rounded-xl border p-4">
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-700 dark:text-emerald-500" /> {preview.summary.created} to create</span>
                <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-700 dark:text-emerald-500" /> {preview.summary.updated} to update</span>
                {preview.summary.skipped > 0 && (
                  <span className="flex items-center gap-1.5 text-amber-800 dark:text-amber-400"><AlertTriangle className="h-4 w-4" /> {preview.summary.skipped} skipped</span>
                )}
              </div>
              {problems.length > 0 && (
                <div className="mt-3 max-h-48 space-y-1 overflow-y-auto">
                  {problems.slice(0, 25).map((p) => (
                    <div key={p.row} className="text-xs">
                      <span className="text-muted-foreground">Row {p.row}{p.reference_code ? ` (${p.reference_code})` : ''}:</span>{' '}
                      <span className="text-destructive">{p.errors.join('; ')}</span>
                    </div>
                  ))}
                  {problems.length > 25 && <div className="text-xs text-muted-foreground">…and {problems.length - 25} more</div>}
                </div>
              )}
              {!preview.dry_run && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Imported listings are unpublished drafts — review them, then publish so the compliance gate runs.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button variant="outline" disabled={busy || (!rows?.length && !xml)} onClick={() => run(true)}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Preview
          </Button>
          <Button disabled={busy || !preview || preview.summary.created + preview.summary.updated === 0} onClick={() => run(false)}>
            Import {preview ? preview.summary.created + preview.summary.updated : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
