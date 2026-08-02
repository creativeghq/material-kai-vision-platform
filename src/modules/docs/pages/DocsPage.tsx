// Docs module — internal documentation. List + editor. The doc creator and the workspace
// owner can edit; other members read (and, as a follow-up, will propose edits). The KAI agent
// searches published docs via FTS (no embeddings).
import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { BookText, Plus, Save, Trash2, Loader2, Pencil } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { lazyWithRetry } from '@/utils/lazyWithRetry';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';

// lazy-load the MarkdownEditor (MDXEditor) so its ~400KB chunk loads only when a doc is
// actually opened, not on the docs list view.
// lazyWithRetry (not raw React.lazy): after a frontend deploy, a client on the previous
// build holds stale chunk URLs; the dynamic import then rejects / resolves undefined and
// React throws "Cannot read properties of undefined (reading 'default')" (Sentry KAI-A2).
// lazyWithRetry forces a single full reload to pull the fresh index + chunk URLs.
const MarkdownEditorLazy = lazyWithRetry(() =>
  import('@/components/shared/MarkdownEditor').then((m) => ({ default: m.MarkdownEditor })),
);
function MarkdownEditor(props: React.ComponentProps<typeof MarkdownEditorLazy>) {
  return (
    <Suspense fallback={<div className="flex items-center gap-2 text-sm text-muted-foreground py-8"><Loader2 className="h-4 w-4 animate-spin" /> Loading editor…</div>}>
      <MarkdownEditorLazy {...props} />
    </Suspense>
  );
}
import { Badge } from '@/components/core/ui/badge';
import { statusTone } from '@/utils/statusTone';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { FilterBar, useFilters } from '@/components/core/filters';
import { buildDocsFilters } from './docsFilters';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  listDocs, createDoc, updateDoc, deleteDoc,
  listPendingSuggestions, createSuggestion, reviewSuggestion,
  type WorkspaceDoc, type DocSuggestion,
} from '../services/docsService';

const NEW = '__new__';

const DocsPage: React.FC = () => {
  const { activeWorkspaceId, workspaceRole, isPlatformOperator } = useWorkspace();
  const { user } = useAuth();
  const { toast } = useToast();

  const [docs, setDocs] = useState<WorkspaceDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // editor fields
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('published');

  const isOwner = workspaceRole === 'owner' || isPlatformOperator;

  // suggestions (members propose; creator/owner reviews)
  const [suggestions, setSuggestions] = useState<DocSuggestion[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestBody, setSuggestBody] = useState('');
  const [suggestReason, setSuggestReason] = useState('');

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
    setCategory((d as any).category ?? '');
    setStatus(d.status);
  };
  const openNew = () => {
    setSelectedId(NEW);
    setTitle(''); setBody(''); setTags(''); setCategory(''); setStatus('published');
  };

  const save = async () => {
    if (!activeWorkspaceId || !user?.id) return;
    if (!title.trim()) { toast({ title: 'Title required', variant: 'destructive' }); return; }
    setBusy(true);
    const input = {
      title: title.trim(),
      content_markdown: body,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      category: category.trim() || null,
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

  // Load pending suggestions for reviewers (creator / workspace owner) of the open doc.
  useEffect(() => {
    if (selected && canEdit && selectedId !== NEW) {
      listPendingSuggestions(selected.id).then(setSuggestions).catch(() => setSuggestions([]));
    } else {
      setSuggestions([]);
    }
    setSuggesting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, canEdit]);

  const submitSuggest = async () => {
    if (!activeWorkspaceId || !user?.id || !selected) return;
    setBusy(true);
    try {
      await createSuggestion(activeWorkspaceId, selected.id, user.id, suggestBody, suggestReason);
      toast({ title: 'Suggestion sent', description: 'The document owner will review it.' });
      setSuggesting(false);
    } catch (e) {
      toast({ title: 'Could not send suggestion', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const doReview = async (id: string, action: 'accept' | 'reject') => {
    setBusy(true);
    try {
      await reviewSuggestion(id, action);
      toast({ title: action === 'accept' ? 'Suggestion accepted' : 'Suggestion rejected' });
      const fresh = await listDocs(activeWorkspaceId!);
      setDocs(fresh);
      const updated = selected ? fresh.find((d) => d.id === selected.id) : null;
      if (updated) openDoc(updated);
      if (selected) setSuggestions(await listPendingSuggestions(selected.id));
    } catch (e) {
      toast({ title: 'Review failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const filterGroups = useMemo(() => buildDocsFilters(docs, user?.id), [docs, user?.id]);
  const { values: filterValues, setValues: setFilterValues, filtered, previewCount } =
    useFilters<WorkspaceDoc>(docs, filterGroups);

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
      <PageHeader
        icon={BookText}
        title="Docs"
        subtitle="Internal team documentation — searchable by the KAI agent"
        actions={<Button size="sm" onClick={openNew} className="gap-1 rounded-full"><Plus className="h-4 w-4" /> New doc</Button>}
      />
      <div className="px-3 sm:px-6 py-4 sm:py-6">
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          {/* List */}
          <div className="space-y-3">
            <FilterBar
              groups={filterGroups}
              values={filterValues}
              onChange={setFilterValues}
              previewCount={previewCount}
              title="Filter docs"
              searchPlaceholder="Search docs…"
            />
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
                      {d.status === 'draft' && <span className={`text-[10px] capitalize ${statusTone('draft')}`}>draft</span>}
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
              <div className="space-y-4">
              <Card>
                <CardContent className="p-4 space-y-3">
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Document title" className="text-lg font-medium" />
                  <div className="flex items-center gap-2">
                    <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category (optional)" className="w-44" />
                    <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="tags, comma, separated" className="flex-1" />
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="published">Published</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <MarkdownEditor value={body} onChange={setBody} placeholder="Write your document…" minHeight={420} />
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

              {suggestions.length > 0 && (
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <h3 className="font-medium">Suggested edits ({suggestions.length})</h3>
                    {suggestions.map((s) => (
                      <div key={s.id} className="rounded-lg border p-3 space-y-2">
                        {s.rationale && (
                          <p className="text-sm"><span className="text-muted-foreground">Reason:</span> {s.rationale}</p>
                        )}
                        <details>
                          <summary className="text-sm cursor-pointer text-muted-foreground">View proposed content</summary>
                          <pre className="mt-2 text-xs bg-muted rounded p-2 whitespace-pre-wrap max-h-64 overflow-auto">{s.proposed_content_markdown}</pre>
                        </details>
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => doReview(s.id, 'reject')} disabled={busy}>Reject</Button>
                          <Button size="sm" onClick={() => doReview(s.id, 'accept')} disabled={busy}>Accept</Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
              </div>
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
                  {!suggesting ? (
                    <div className="pt-2 border-t flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">Only the doc owner or workspace owner can edit directly.</span>
                      <Button
                        size="sm" variant="outline" className="gap-1"
                        onClick={() => { setSuggestBody(selected?.content_markdown || ''); setSuggestReason(''); setSuggesting(true); }}
                      >
                        <Pencil className="h-4 w-4" /> Suggest an edit
                      </Button>
                    </div>
                  ) : (
                    <div className="pt-3 border-t space-y-2">
                      <p className="text-sm font-medium">Propose changes</p>
                      <MarkdownEditor value={suggestBody} onChange={setSuggestBody} minHeight={240} />
                      <Input value={suggestReason} onChange={(e) => setSuggestReason(e.target.value)} placeholder="Why this change? (optional)" />
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setSuggesting(false)}>Cancel</Button>
                        <Button size="sm" onClick={submitSuggest} disabled={busy}>
                          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send suggestion'}
                        </Button>
                      </div>
                    </div>
                  )}
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
