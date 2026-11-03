/** Specification → Takeoff: drop drawing PDFs, read them, confirm what they say, send it to the bill (#532). */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Upload, ScanLine, RefreshCw, FilePlus2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { HubEmptyState } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/utils/datetime';
import { projectDocumentsService } from '../../services/projectDocumentsService';
import { takeoffService, type TakeoffDrawingSummary } from '../../services/takeoffService';
import { TakeoffReviewer } from '../TakeoffReviewer';
import { UploadRevisionDialog } from './DocumentsTab';

const isPdf = (f: File) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');

const statusBadge = (d: TakeoffDrawingSummary) =>
  d.takeoff_status === 'running' ? <Badge variant="info">Analysing…</Badge>
    : d.takeoff_status === 'failed' ? <Badge variant="error">Failed</Badge>
      : d.takeoff_status === 'done' ? <Badge variant="success">Read</Badge>
        : <Badge variant="neutral">Not analysed</Badge>;

export const TakeoffTab: React.FC<{ projectId: string; canSendToBill: boolean }> = ({ projectId, canSendToBill }) => {
  const { toast } = useToast();
  const [sp, setSp] = useSearchParams();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [drawings, setDrawings] = useState<TakeoffDrawingSummary[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [newRevFor, setNewRevFor] = useState<TakeoffDrawingSummary | null>(null);
  const [runs, setRuns] = useState(0);

  const selectedId = sp.get('revision');
  const setSelected = (id: string) => setSp((prev) => { const p = new URLSearchParams(prev); p.set('revision', id); return p; }, { replace: true });

  const load = useCallback(async () => {
    try { setDrawings((await takeoffService.projectSummary(projectId)).drawings); }
    catch (e) {
      toast({ title: 'Could not load the drawings', description: (e as Error).message, variant: 'destructive' });
      setDrawings([]);
    }
  }, [projectId, toast]);
  useEffect(() => { void load(); }, [load]);

  const anyRunning = drawings?.some((d) => d.takeoff_status === 'running') ?? false;
  useEffect(() => {
    if (!anyRunning) return undefined;
    const t = window.setInterval(() => { void load(); }, 5000);
    return () => window.clearInterval(t);
  }, [anyRunning, load]);

  const analyze = async (revisionId: string) => {
    setBusy(revisionId);
    try { await takeoffService.analyze(revisionId); setRuns((n) => n + 1); await load(); }
    catch (e) { toast({ title: 'Could not start the analysis', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  const upload = async (files: FileList | null) => {
    const list = [...(files ?? [])];
    const rejected = list.filter((f) => !isPdf(f));
    if (rejected.length) {
      toast({ title: 'PDF only', description: `${rejected.map((f) => f.name).join(', ')} ${rejected.length === 1 ? 'is' : 'are'} not a PDF. Export the drawing to PDF and upload that.`, variant: 'destructive' });
    }
    const pdfs = list.filter(isPdf);
    if (!pdfs.length) return;
    setUploading(true);
    let first: string | null = null;
    for (const file of pdfs) {
      try {
        const doc = await projectDocumentsService.createDocument(projectId, { title: file.name.replace(/\.pdf$/i, ''), kind: 'drawing' });
        const rev = await projectDocumentsService.uploadRevision(doc.id, projectId, 'A', file);
        first ??= rev.id;
        await takeoffService.analyze(rev.id);
      } catch (e) {
        toast({ title: `Could not add ${file.name}`, description: (e as Error).message, variant: 'destructive' });
      }
    }
    setUploading(false);
    if (fileInput.current) fileInput.current.value = '';
    await load();
    if (first) setSelected(first);
  };

  if (drawings === null) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const selected = drawings.find((d) => d.revision_id === selectedId) ?? drawings[0] ?? null;
  const uploadButton = (
    <Button size="sm" onClick={() => fileInput.current?.click()} disabled={uploading}>
      {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Add drawings
    </Button>
  );

  return (
    <div className="space-y-4">
      <input ref={fileInput} type="file" accept="application/pdf,.pdf" multiple className="hidden"
        onChange={(e) => void upload(e.target.files)} />
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 border-b border-hairline px-5 py-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2"><ScanLine className="h-4 w-4 text-primary" /> Takeoff</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload the drawings and the engineer's study as PDF. Printed tables are read, symbols are counted and
              runs are measured on CAD-exported pages; nothing reaches the bill until you confirm it.
            </p>
          </div>
          {uploadButton}
        </CardHeader>
        <CardContent className="p-0">
          {drawings.length === 0 ? (
            <HubEmptyState
              icon={ScanLine}
              title="No drawings yet"
              description="Add the plan PDFs and the study (προμέτρηση, schedules). Each one is read page by page."
              action={uploadButton}
            />
          ) : (
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-sunken text-[11px] font-semibold text-muted-foreground">
                    <th className="px-5 py-2 text-left">Drawing</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-right">Pages</th>
                    <th className="px-3 py-2 text-right">To review</th>
                    <th className="px-3 py-2 text-right">Confirmed</th>
                    <th className="px-5 py-2"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {drawings.map((d) => (
                    <tr key={d.revision_id}
                      className={`cursor-pointer border-t border-hairline ${selected?.revision_id === d.revision_id ? 'bg-surface-sunken' : ''}`}
                      onClick={() => setSelected(d.revision_id)}>
                      <td className="px-5 py-2">
                        <span className="font-medium">{d.label}</span>
                        <span className="ml-2 text-[11px] text-muted-foreground">Rev {d.rev_label}</span>
                        {d.takeoff_at && <span className="ml-2 text-[11px] text-muted-foreground">{formatDate(d.takeoff_at)}</span>}
                      </td>
                      <td className="px-3 py-2">{statusBadge(d)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">
                        {d.pages ? `${d.pages} (${d.vector_pages} CAD · ${d.scan_pages} scan)` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.proposed || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.confirmed || '—'}</td>
                      <td className="whitespace-nowrap px-5 py-2 text-right">
                        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setNewRevFor(d); }}>
                          <FilePlus2 className="h-3.5 w-3.5" /> New revision
                        </Button>
                        <Button size="sm" variant="ghost" disabled={busy === d.revision_id || d.takeoff_status === 'running'}
                          onClick={(e) => { e.stopPropagation(); void analyze(d.revision_id); }}>
                          {busy === d.revision_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                          {d.takeoff_status ? 'Re-analyse' : 'Analyse'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {newRevFor && (
        <UploadRevisionDialog
          pdfOnly
          doc={{ id: newRevFor.document_id, title: newRevFor.title, current: { rev_label: newRevFor.rev_label }, revisions: [newRevFor] }}
          projectId={projectId}
          onClose={() => setNewRevFor(null)}
          onSaved={(revisionId) => { setNewRevFor(null); setSelected(revisionId); void analyze(revisionId); }}
        />
      )}

      {selected && (
        <TakeoffReviewer
          key={`${selected.revision_id}:${runs}`}
          revisionId={selected.revision_id}
          projectId={projectId}
          label={selected.label}
          canSendToBill={canSendToBill}
          onChanged={() => void load()}
        />
      )}
    </div>
  );
};

export default TakeoffTab;
