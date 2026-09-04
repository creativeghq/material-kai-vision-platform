/**
 * Drawings / documents register (WS6 #285).
 *
 * A document is a named slot; revisions stack under it and exactly one is current. Clients see
 * only the current revision of `client_visible` documents — enforced by RLS, not by this UI.
 *
 * What makes it a REGISTER rather than a file list is the drawing number (the sheet's own
 * identity, unique per project) and, per revision, the issue date and the purpose it was issued
 * for. `for_construction` is the only status somebody may build from, so a current revision that
 * is anything else is called out here rather than left for the reader to notice.
 *
 * The title-block scanner PREFILLS this form and writes nothing. A scanner that also created the
 * register entry would file a whole drawing set off a model's reading, and a wrong drawing number
 * stays invisible until somebody builds from the wrong sheet.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Loader2, Plus, FileStack, Download, Trash2, Eye, EyeOff, Upload, History, FileText, ScanLine,
  PenLine,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Badge } from '@/components/core/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/utils/datetime';
import {
  projectDocumentsService,
  type ProjectDocumentWithRevisions, type ProjectDocumentRevision,
} from '../../services/projectDocumentsService';
import { HubEmptyState } from '@/components/core/hub';
import { DrawingMarkupDialog } from '../DrawingMarkupDialog';
import { DrawingTakeoffDialog } from '../DrawingTakeoffDialog';
import { humanizeLabel } from '@/utils/humanize';
import {
  DOCUMENT_KINDS, DISCIPLINES, DRAWING_PURPOSES, BUILDABLE_PURPOSES,
  type DocumentKind, type DrawingPurpose,
} from '../../drawingVocabulary';

export const DocumentsTab: React.FC<{ projectId: string; isOwner: boolean }> = ({ projectId, isOwner }) => {
  const { toast } = useToast();
  const [docs, setDocs] = useState<ProjectDocumentWithRevisions[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [uploadFor, setUploadFor] = useState<ProjectDocumentWithRevisions | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try { setLoading(true); setDocs(await projectDocumentsService.list(projectId)); }
    catch (err: any) { toast({ title: 'Failed to load documents', description: err?.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [projectId, toast]);
  useEffect(() => { void load(); }, [load]);

  /**
   * The revision open in the markup viewer, with the signed URL it was opened with.
   *
   * The URL is minted here and held in state rather than stored on the row: signed URLs expire,
   * and a persisted one is a link that works today and 404s in a week (storage convention 7).
   */
  const [markup, setMarkup] = useState<{
    rev: ProjectDocumentRevision; url: string; label: string;
  } | null>(null);

  /**
   * The revision whose printed schedules are being read into a takeoff. No URL: the reader is
   * given the revision id and fetches the file server-side from the row's own bucket and path, so
   * a URL in the request body can never point it somewhere else (invariant 7).
   */
  const [takeoff, setTakeoff] = useState<{
    rev: ProjectDocumentRevision; label: string;
  } | null>(null);

  const openMarkup = async (doc: ProjectDocumentWithRevisions, rev: ProjectDocumentRevision) => {
    try {
      const url = await projectDocumentsService.downloadUrl(rev);
      setMarkup({ rev, url, label: doc.drawing_number || doc.title });
    } catch (err: any) {
      toast({ title: 'Could not open the drawing', description: err?.message, variant: 'destructive' });
    }
  };

  const open = async (rev: ProjectDocumentRevision) => {
    try {
      const url = await projectDocumentsService.downloadUrl(rev);
      window.open(url, '_blank', 'noopener');
    } catch (err: any) {
      toast({ title: 'Could not open', description: err?.message, variant: 'destructive' });
    }
  };

  const toggleVisible = async (doc: ProjectDocumentWithRevisions) => {
    const next = !doc.client_visible;
    setDocs((list) => list.map((d) => (d.id === doc.id ? { ...d, client_visible: next } : d)));
    try { await projectDocumentsService.setClientVisible(doc.id, next); }
    catch (err: any) {
      toast({ title: 'Failed to update', description: err?.message, variant: 'destructive' });
      void load();
    }
  };

  const makeCurrent = async (rev: ProjectDocumentRevision) => {
    try { await projectDocumentsService.makeCurrent(rev.id); await load(); toast({ title: `Rev ${rev.rev_label} is now current` }); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };

  const remove = async (doc: ProjectDocumentWithRevisions) => {
    if (!confirm(`Delete "${doc.title}" and all ${doc.revisions.length} revision(s)?`)) return;
    try { await projectDocumentsService.deleteDocument(doc.id); await load(); }
    catch (err: any) { toast({ title: 'Failed to delete', description: err?.message, variant: 'destructive' }); }
  };

  const toggleExpand = (id: string) =>
    setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <Card className="dashboard-card">
      <CardHeader className="border-b border-hairline px-5 py-3 flex-row items-center justify-between space-y-0 gap-3 flex-wrap">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <FileStack className="h-4 w-4 text-primary" /> Drawings &amp; documents
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Clients always see the current revision — never an older one.
          </p>
        </div>
        {isOwner && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus /> New document
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {docs.length === 0 ? (
          <HubEmptyState
            icon={FileText}
            title="No documents yet"
            description="Create the document first, then upload revisions against it. Clients always see the current revision, never an older one."
            action={isOwner ? <Button size="sm" onClick={() => setCreating(true)}><Plus /> New document</Button> : undefined}
          />
        ) : (
          <div className="divide-y divide-hairline">
            {docs.map((d) => (
              <div key={d.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {d.drawing_number && (
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">{d.drawing_number}</span>
                      )}
                      <p className="font-medium">{d.title}</p>
                      {d.discipline && <span className="text-[11px] text-muted-foreground">· {humanizeLabel(d.discipline)}</span>}
                      {d.current
                        ? <span className="text-[11px] text-primary">Rev {d.current.rev_label}</span>
                        : <span className="text-[11px] text-amber-800 dark:text-amber-400">No revision uploaded</span>}
                      {d.current?.purpose && (
                        <Badge variant={BUILDABLE_PURPOSES.includes(d.current.purpose) ? 'success' : 'warning'}>
                          {humanizeLabel(d.current.purpose)}
                        </Badge>
                      )}
                    </div>
                    {(d.current?.issued_at || d.scale) && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {d.current?.issued_at && <>Issued {formatDate(d.current.issued_at)}</>}
                        {d.current?.issued_at && d.scale && ' · '}
                        {d.scale}
                        {d.sheet_size && ` · ${d.sheet_size}`}
                      </p>
                    )}
                    {d.current?.notes && <p className="mt-1 text-sm text-muted-foreground">{d.current.notes}</p>}
                    {d.revisions.length > 1 && (
                      <button
                        type="button"
                        className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                        onClick={() => toggleExpand(d.id)}
                      >
                        <History className="h-3 w-3" />
                        {expanded.has(d.id) ? 'Hide' : 'Show'} {d.revisions.length - 1} earlier revision(s)
                      </button>
                    )}
                    {expanded.has(d.id) && (
                      <div className="mt-2 rounded-md border border-white/10 divide-y divide-hairline">
                        {d.revisions.filter((r) => !r.is_current).map((r) => (
                          <div key={r.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                            <span className="w-14 shrink-0 text-xs text-muted-foreground">Rev {r.rev_label}</span>
                            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                              {/* The issue date when the sheet carries one — `created_at` is when
                                  it was uploaded here, which is a different fact and usually later. */}
                              {formatDate(r.issued_at ?? r.created_at)}
                              {r.purpose ? ` · ${humanizeLabel(r.purpose)}` : ''}
                              {r.superseded_at ? ` · superseded ${formatDate(r.superseded_at)}` : ''}
                              {r.notes ? ` · ${r.notes}` : ''}
                            </span>
                            <button type="button" className="text-muted-foreground hover:text-foreground" title="Open" onClick={() => open(r)}>
                              <Download className="h-3.5 w-3.5" />
                            </button>
                            {isOwner && (
                              <button type="button" className="text-[11px] text-muted-foreground hover:text-primary" onClick={() => makeCurrent(r)}>
                                Make current
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {d.current && (
                      <Button size="sm" variant="outline" onClick={() => open(d.current!)}>
                        <Download className="h-3.5 w-3.5 mr-1" /> Open
                      </Button>
                    )}
                    {/* Markup is offered on DRAWINGS only. A cloud round a paragraph of a
                        specification is a comment on a document, and the measuring half of this
                        viewer means nothing there. */}
                    {d.current && d.kind === 'drawing' && (
                      <Button
                        size="sm" variant="ghost" title="Mark up"
                        onClick={() => void openMarkup(d, d.current!)}
                      >
                        <PenLine className="h-4 w-4" />
                      </Button>
                    )}
                    {/* Reads the schedules PRINTED on the sheet. Owner only, because it costs a
                        credit and it proposes lines for a priced schedule. */}
                    {isOwner && d.current && d.kind === 'drawing' && (
                      <Button
                        size="sm" variant="ghost" title="Read printed schedules"
                        onClick={() => setTakeoff({
                          rev: d.current!, label: d.drawing_number || d.title,
                        })}
                      >
                        <ScanLine className="h-4 w-4" />
                      </Button>
                    )}
                    {isOwner && (
                      <>
                        <Button size="sm" variant="ghost" title="Upload revision" onClick={() => setUploadFor(d)}>
                          <Upload className="h-4 w-4" />
                        </Button>
                        <button
                          type="button"
                          title={d.client_visible ? 'Visible to the client' : 'Internal only'}
                          className={d.client_visible ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}
                          onClick={() => toggleVisible(d)}
                        >
                          {d.client_visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        </button>
                        <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => remove(d)}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {creating && (
        <NewDocumentDialog
          projectId={projectId}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); void load(); }}
        />
      )}
      {markup && (
        <DrawingMarkupDialog
          revisionId={markup.rev.id}
          fileUrl={markup.url}
          drawingLabel={markup.label}
          revLabel={markup.rev.rev_label}
          isOwner={isOwner}
          onClose={() => setMarkup(null)}
          onRfiRaised={() => { void load(); }}
        />
      )}

      {takeoff && (
        <DrawingTakeoffDialog
          revisionId={takeoff.rev.id}
          projectId={projectId}
          drawingLabel={takeoff.label}
          revLabel={takeoff.rev.rev_label}
          onClose={() => setTakeoff(null)}
        />
      )}

      {uploadFor && (
        <UploadRevisionDialog
          doc={uploadFor}
          projectId={projectId}
          onClose={() => setUploadFor(null)}
          onSaved={() => { setUploadFor(null); void load(); }}
        />
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------

const NewDocumentDialog: React.FC<{ projectId: string; onClose: () => void; onSaved: () => void }> = ({
  projectId, onClose, onSaved,
}) => {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [drawingNumber, setDrawingNumber] = useState('');
  const [kind, setKind] = useState<DocumentKind>('drawing');
  const [discipline, setDiscipline] = useState('');
  const [scale, setScale] = useState('');
  const [sheetSize, setSheetSize] = useState('');
  const [clientVisible, setClientVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);

  /**
   * Read a sheet's title block and prefill the form. Nothing is written, and a field the sheet
   * does not state leaves whatever is already typed rather than blanking it.
   */
  const scan = async (file: File) => {
    setScanning(true);
    try {
      const res = await projectDocumentsService.scanTitleBlock(projectId, file);
      if (res.status === 'unreadable') {
        toast({
          title: 'Could not read the title block',
          description: 'Try a sharper scan, or fill the fields in by hand.',
          variant: 'destructive',
        });
        return;
      }
      const f = res.fields;
      if (f.drawing_number) setDrawingNumber(f.drawing_number);
      if (f.title) setTitle(f.title);
      if (f.discipline) setDiscipline(f.discipline);
      if (f.scale) setScale(f.scale);
      if (f.sheet_size) setSheetSize(f.sheet_size);

      // What the sheet said that the controlled lists could not accept. Told to the operator
      // rather than dropped: a silent blank looks like a title block that omitted the field.
      const unmapped = Object.entries(res.unmapped ?? {});
      toast({
        title: 'Title block read',
        description: unmapped.length
          ? `Check the fields. The sheet says ${unmapped.map(([k, v]) => `${k} "${v}"`).join(', ')}, which is not one of the options.`
          : 'Check the fields before creating the entry.',
      });
    } catch (err: any) {
      toast({ title: 'Scan failed', description: err?.message, variant: 'destructive' });
    } finally {
      setScanning(false);
    }
  };

  const save = async () => {
    if (!title.trim()) { toast({ title: 'Title required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await projectDocumentsService.createDocument(projectId, {
        title: title.trim(),
        drawing_number: drawingNumber,
        kind,
        discipline: discipline || null,
        scale,
        sheet_size: sheetSize,
        client_visible: clientVisible,
      });
      onSaved();
    } catch (err: any) {
      const dup = /already uses that drawing number|duplicate key|unique/i.test(err?.message ?? '');
      toast({
        title: dup ? 'That drawing number is taken' : 'Failed to create',
        description: dup ? 'Another document in this project already uses it.' : err?.message,
        variant: 'destructive',
      });
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New document</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-sm border border-hairline bg-surface-sunken p-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4 text-primary" />}
              <span>{scanning ? 'Reading the title block…' : 'Read the title block from a sheet'}</span>
              <input
                type="file" className="hidden" accept="application/pdf,image/*" disabled={scanning}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void scan(f); e.target.value = ''; }}
              />
            </label>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Fills the fields below so you can check them. Nothing is saved until you press Create,
              and the file is still uploaded as the first revision afterwards.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Number</Label>
              <Input value={drawingNumber} onChange={(e) => setDrawingNumber(e.target.value)} placeholder="A-101" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Ground Floor Plan" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Kind</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as DocumentKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOCUMENT_KINDS.map((k) => <SelectItem key={k} value={k}>{humanizeLabel(k)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Discipline</Label>
              <Select value={discipline || 'none'} onValueChange={(v) => setDiscipline(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Not stated" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not stated</SelectItem>
                  {DISCIPLINES.map((d) => <SelectItem key={d} value={d}>{humanizeLabel(d)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Scale</Label>
              <Input value={scale} onChange={(e) => setScale(e.target.value)} placeholder="1:50 (optional)" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sheet size</Label>
              <Input value={sheetSize} onChange={(e) => setSheetSize(e.target.value)} placeholder="A1 (optional)" />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={clientVisible} onCheckedChange={(v) => setClientVisible(!!v)} />
            Show the current revision to the client
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Create'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const UploadRevisionDialog: React.FC<{
  doc: ProjectDocumentWithRevisions; projectId: string; onClose: () => void; onSaved: () => void;
}> = ({ doc, projectId, onClose, onSaved }) => {
  const { toast } = useToast();
  // Suggest the next letter after the current rev, which is how drawing revs are usually labelled.
  const suggested = (() => {
    const cur = doc.current?.rev_label ?? '';
    if (/^[A-Za-z]$/.test(cur)) return String.fromCharCode(cur.toUpperCase().charCodeAt(0) + 1);
    if (/^\d+$/.test(cur)) return String(Number(cur) + 1);
    return doc.revisions.length === 0 ? 'A' : '';
  })();

  const [rev, setRev] = useState(suggested);
  const [notes, setNotes] = useState('');
  const [issuedAt, setIssuedAt] = useState('');
  const [purpose, setPurpose] = useState<DrawingPurpose | ''>('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!rev.trim()) { toast({ title: 'Revision label required', variant: 'destructive' }); return; }
    if (!file) { toast({ title: 'Choose a file', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await projectDocumentsService.uploadRevision(doc.id, projectId, rev.trim(), file, {
        notes: notes.trim() || null,
        // Deliberately not defaulted to today: an issue date nobody typed must stay blank, or the
        // register shows a drawing issued late as issued on time.
        issued_at: issuedAt || null,
        purpose: purpose || null,
      });
      onSaved();
    } catch (err: any) {
      // The unique (document_id, rev_label) constraint is the likely cause; say so plainly.
      const dup = /duplicate key|unique/i.test(err?.message ?? '');
      toast({
        title: dup ? `Revision ${rev} already exists` : 'Upload failed',
        description: dup ? 'Use a different revision label.' : err?.message,
        variant: 'destructive',
      });
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="truncate">New revision — {doc.title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Revision</Label>
            <Input value={rev} onChange={(e) => setRev(e.target.value)} placeholder="A, B, C… or 1, 2, 3" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">File</Label>
            <input type="file" className="text-xs" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Issued on</Label>
              <Input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">The date printed on the sheet.</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Issued for</Label>
              <Select value={purpose || 'none'} onValueChange={(v) => setPurpose(v === 'none' ? '' : v as DrawingPurpose)}>
                <SelectTrigger><SelectValue placeholder="Not stated" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not stated</SelectItem>
                  {DRAWING_PURPOSES.map((pp) => <SelectItem key={pp} value={pp}>{humanizeLabel(pp)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">What changed</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
          <p className="text-[11px] text-muted-foreground">
            This becomes the current revision. The previous one is kept and stays viewable.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Upload'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DocumentsTab;
