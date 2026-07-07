// Docs module (#254) — internal documentation. List + editor. The doc creator and the workspace
// owner can edit; other members read (and, as a follow-up, will propose edits). The KAI agent
// searches published docs via FTS (no embeddings).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookText, Plus, Save, Trash2, Loader2, Search } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Badge } from '@/components/core/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAuth } from '@/contexts/AuthContext';
import { listDocs, createDoc, updateDoc, deleteDoc, type WorkspaceDoc } from '../services/docsService';

const NEW = '__new__';

const DocsPage: React.FC = () => {
  const { activeWorkspaceId, workspaceRole, isPlatformOperator } = useWorkspace();
  const { user } = useAuth();
  const { toast } = useToast();

  const [docs, setDocs] = useState<WorkspaceDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);

  // editor fields
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [status, setStatus] = useState('published');

  const isOwner = workspaceRole === 'owner' || isPlatformOperator;

  const load = useCallback(async () => {
    if (!activeWorkspaceId) { setLoading(false); return; }
    setLoading(true);
    try {
      setDocs(await listDocs(activeWorkspaceId));
    } catch (e) {
      toast({ title: 'Could not load docs', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId, toast]);

  useEffect(() => { void load(); }, [load]);

  const selected = selectedId && selectedId !== NEW ? docs.find((d) => d.id === selectedId) ?? null : null;
  const canEdit = selectedId === NEW || (!!selected && (isOwner || selected.created_by === user?.id));

  const openDoc = (d: WorkspaceDoc) => {
    setSelectedId(d.id);
    setTitle(d.title);
    setBody(d.content_markdown);
    setTags((d.tags ?? []).join(', '));
    setStatus(d.status);
  };
  const openNew = () => {
    setSelectedId(NEW);
    setTitle(''); setBody(''); setTags(''); setStatus('published');
  };

  const save = async () => {
    if (!activeWorkspaceId || !user?.id) return;
    if (!title.trim()) { toast({ title: 'Title required', variant: 'destructive' }); return; }
    setBusy(true);
    const input = {
      title: title.trim(),
      content_markdown: body,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      category: null,
      status,
    };
    try {
      if (selectedId === NEW) {
        const created = await createDoc(activeWorkspaceId, user.id, input);
        toast({ title: 'Doc created' });
        await load();
        openDoc(created);
      } else if (selected) {
        const updated = await updateDoc(selected.id, user.id, input);
        toast({ title: 'Doc saved' });
        await load();
        openDoc(updated);
      }
    } catch (e) {
      toast({ title: 'Save failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await deleteDoc(selected.id);
      toast({ title: 'Doc deleted' });
      setSelectedId(null);
      await load();
    } catch (e) {
      toast({ title: 'Delete failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) => d.title.toLowerCase().includes(q) || (d.tags ?? []).some((t) => t.toLowerCase().includes(q)));
  }, [docs, filter]);

  if (!activeWorkspaceId) {
    return (
      <div>
        <PageHeader icon={BookText} title="Docs" subtitle="Internal documentation" />
        <div className="p-6 text-sm text-muted-foreground">Select a workspace to view its docs.</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader icon={BookText} title="Docs" subtitle="Internal team documentation — searchable by the KAI agent" />
      <div className="px-3 sm:px-6 py-4 sm:py-6">
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          {/* List */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search docs…" className="pl-8" />
              </div>
              <Button size="sm" onClick={openNew} className="gap-1"><Plus className="h-4 w-4" /> New</Button>
            </div>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-6"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
            ) : filtered.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No docs yet. Click <strong>New</strong> to write one.</CardContent></Card>
            ) : (
              <div className="space-y-1">
                {filtered.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => openDoc(d)}
                    className={`w-full text-left rounded-lg px-3 py-2 transition-colors ${selectedId === d.id ? 'bg-primary/10' : 'hover:bg-muted'}`}
                  >
                    <div className="font-medium truncate flex items-center gap-2">
                      {d.title}
                      {d.status === 'draft' && <Badge variant="outline" className="text-[10px]">draft</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{(d.tags ?? []).join(', ') || '—'}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Editor / viewer */}
          <div>
            {selectedId === null ? (
              <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">
                Select a doc to read, or create a new one.
              </CardContent></Card>
            ) : canEdit ? (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Document title" className="text-lg font-medium" />
                  <div className="flex items-center gap-2">
                    <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="tags, comma, separated" className="flex-1" />
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="published">Published</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write in Markdown…" className="min-h-[420px] font-mono text-sm" />
                  <div className="flex justify-between">
                    <div>
                      {selected && (
                        <Button variant="outline" size="sm" className="gap-1 text-destructive" onClick={remove} disabled={busy}>
                          <Trash2 className="h-4 w-4" /> Delete
                        </Button>
                      )}
                    </div>
                    <Button size="sm" className="gap-1" onClick={save} disabled={busy}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              // Read-only view for members who don't own the doc.
              <Card>
                <CardContent className="p-6 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-xl font-semibold">{selected?.title}</h2>
                    {selected?.status === 'draft' && <Badge variant="outline">draft</Badge>}
                  </div>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{selected?.content_markdown || '_This document is empty._'}</ReactMarkdown>
                  </div>
                  <p className="text-xs text-muted-foreground pt-2 border-t">
                    Only the document owner or the workspace owner can edit this. (Suggesting edits — coming soon.)
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocsPage;
