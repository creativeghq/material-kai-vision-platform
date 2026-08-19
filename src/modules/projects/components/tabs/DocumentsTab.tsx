/**
 * Drawings / documents register (WS6 #285).
 *
 * A document is a named slot; revisions stack under it and exactly one is current. Clients see
 * only the current revision of `client_visible` documents — enforced by RLS, not by this UI.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, FileStack, Download, Trash2, Eye, EyeOff, Upload, History, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/utils/datetime';
import {
  projectDocumentsService,
  type ProjectDocumentWithRevisions, type ProjectDocumentRevision,
} from '../../services/projectDocumentsService';
import { HubEmptyState } from '@/components/core/hub';

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
                      <p className="font-medium">{d.title}</p>
                      {d.discipline && <span className="text-[11px] text-muted-foreground">· {d.discipline}</span>}
                      {d.current
                        ? <span className="text-[11px] text-primary">Rev {d.current.rev_label}</span>
                        : <span className="text-[11px] text-amber-400">No revision uploaded</span>}
                    </div>
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
                              {formatDate(r.created_at)}{r.notes ? ` · ${r.notes}` : ''}
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
                      <Button size="sm" variant="outline" className="rounded-full" onClick={() => open(d.current!)}>
                        <Download className="h-3.5 w-3.5 mr-1" /> Open
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
  const [discipline, setDiscipline] = useState('');
  const [clientVisible, setClientVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) { toast({ title: 'Title required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await projectDocumentsService.createDocument(projectId, {
        title: title.trim(),
        discipline: discipline.trim() || null,
        client_visible: clientVisible,
      });
      onSaved();
    } catch (err: any) {
      toast({ title: 'Failed to create', description: err?.message, variant: 'destructive' });
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New document</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Kitchen elevations" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Discipline</Label>
            <Input value={discipline} onChange={(e) => setDiscipline(e.target.value)} placeholder="e.g. Joinery, Electrical (optional)" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={clientVisible} onCheckedChange={(v) => setClientVisible(!!v)} />
            Show the current revision to the client
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" className="rounded-full" onClick={save} disabled={saving}>
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
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!rev.trim()) { toast({ title: 'Revision label required', variant: 'destructive' }); return; }
    if (!file) { toast({ title: 'Choose a file', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await projectDocumentsService.uploadRevision(doc.id, projectId, rev.trim(), file, notes.trim() || null);
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
          <div className="space-y-1">
            <Label className="text-xs">What changed</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
          <p className="text-[11px] text-muted-foreground">
            This becomes the current revision. The previous one is kept and stays viewable.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" className="rounded-full" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Upload'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DocumentsTab;
