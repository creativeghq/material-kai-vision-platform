import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, Plus, FileText, Share2, Link2, Trash2, RefreshCw, Eye,
  MessageSquare, Check, Pencil, X, ExternalLink, GripVertical,
} from 'lucide-react';

import { Card, CardContent } from '@/components/core/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Switch } from '@/components/core/ui/switch';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';

import { projectsService } from '../../services/projectsService';
import {
  clientViewsService,
  type ClientView,
  type ClientViewFeedback,
} from '@/services/clientViewsService';
import { SHEET_TYPE_LABELS, type SheetType } from '@/services/moodboardSheetsService';

interface ClientViewTabProps {
  projectId: string;
  projectName: string;
  isOwner: boolean;
}

type AvailableSheet = Awaited<ReturnType<typeof projectsService.listProjectSheets>>[number];
type ProjectQuote = { id: string; name: string | null; quote_number: string | null; status: string | null; grand_total: number | null; currency: string | null };
type VrWorld = { id: string; display_name: string | null; thumbnail_url: string | null };

const STATUS_TONE: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  generating: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  completed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  failed: 'bg-destructive/15 text-destructive border-destructive/30',
};

interface FormState {
  id: string | null;
  title: string;
  subtitle: string;
  clientName: string;
  date: string;
  selectedSheetIds: string[];
  embedVr: boolean;
  embedLighting: boolean;
  embedFfe: boolean;
  feedbackEnabled: boolean;
  quoteId: string;
  vrWorldId: string;
}

const emptyForm = (): FormState => ({
  id: null,
  title: 'Client Presentation',
  subtitle: '',
  clientName: '',
  date: new Date().toISOString().slice(0, 10),
  selectedSheetIds: [],
  embedVr: true,
  embedLighting: true,
  embedFfe: true,
  feedbackEnabled: true,
  quoteId: '',
  vrWorldId: '',
});

export const ClientViewTab: React.FC<ClientViewTabProps> = ({ projectId, projectName, isOwner }) => {
  const { toast } = useToast();
  const [views, setViews] = useState<ClientView[]>([]);
  const [sheets, setSheets] = useState<AvailableSheet[]>([]);
  const [quotes, setQuotes] = useState<ProjectQuote[]>([]);
  const [vrWorlds, setVrWorlds] = useState<VrWorld[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedbackByView, setFeedbackByView] = useState<Record<string, ClientViewFeedback[]>>({});

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [v, s, q, w] = await Promise.all([
        clientViewsService.listForProject(projectId),
        projectsService.listProjectSheets(projectId),
        projectsService.listProjectQuotes(projectId),
        clientViewsService.listVrWorlds(),
      ]);
      setViews(v);
      setSheets(s);
      setQuotes((q || []).map((x: any) => ({ id: x.id, name: x.name, quote_number: x.quote_number, status: x.status ?? null, grand_total: x.grand_total ?? null, currency: x.currency ?? null })));
      setVrWorlds(w);
    } catch {
      toast({ title: 'Failed to load client views', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => { load(); }, [load]);

  const sheetById = useMemo(() => new Map(sheets.map((s) => [s.id, s])), [sheets]);

  const openCreate = () => {
    setForm({ ...emptyForm(), title: `${projectName} — Client Presentation`, clientName: '' });
    setEditorOpen(true);
  };

  const openEdit = (view: ClientView) => {
    setForm({
      id: view.id,
      title: view.title,
      subtitle: view.cover?.subtitle || '',
      clientName: view.cover?.client_name || '',
      date: (view.cover?.date || new Date().toISOString()).slice(0, 10),
      selectedSheetIds: [...(view.sheet_ids || [])],
      embedVr: view.embed_vr,
      embedLighting: view.embed_lighting,
      embedFfe: view.embed_ffe,
      feedbackEnabled: view.feedback_enabled,
      quoteId: view.quote_id || '',
      vrWorldId: view.vr_world_id || '',
    });
    setEditorOpen(true);
  };

  const toggleSheet = (id: string) => {
    setForm((f) => {
      const has = f.selectedSheetIds.includes(id);
      return {
        ...f,
        selectedSheetIds: has
          ? f.selectedSheetIds.filter((x) => x !== id)
          : [...f.selectedSheetIds, id],
      };
    });
  };

  const moveSheet = (id: string, dir: -1 | 1) => {
    setForm((f) => {
      const arr = [...f.selectedSheetIds];
      const i = arr.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return f;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...f, selectedSheetIds: arr };
    });
  };

  const buildPayload = () => ({
    title: form.title.trim() || 'Client Presentation',
    sheet_ids: form.selectedSheetIds,
    cover: {
      title: form.title.trim() || 'Client Presentation',
      subtitle: form.subtitle.trim() || undefined,
      client_name: form.clientName.trim() || undefined,
      date: new Date(form.date).toISOString(),
    },
    embed_vr: form.embedVr,
    embed_lighting: form.embedLighting,
    embed_ffe: form.embedFfe,
    feedback_enabled: form.feedbackEnabled,
    quote_id: form.quoteId || null,
    vr_world_id: form.vrWorldId || null,
  });

  const save = async (thenGenerate: boolean) => {
    if (form.selectedSheetIds.length === 0) {
      toast({ title: 'Pick at least one sheet to include', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload();
      let viewId = form.id;
      if (viewId) {
        await clientViewsService.update(viewId, payload);
      } else {
        const created = await clientViewsService.create({ project_id: projectId, ...payload });
        viewId = created.id;
      }
      setEditorOpen(false);
      if (thenGenerate && viewId) {
        await doGenerate(viewId);
      }
      await load();
      toast({ title: form.id ? 'Client view updated' : 'Client view created' });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const doGenerate = async (id: string) => {
    setBusyId(id);
    try {
      await clientViewsService.generatePdf(id, true);
      await load();
      toast({ title: 'Presentation PDF generated' });
    } catch (err: any) {
      toast({ title: 'PDF generation failed', description: err?.message, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const openPdf = async (view: ClientView) => {
    setBusyId(view.id);
    try {
      const url = await clientViewsService.refreshPdfUrl(view.id);
      if (url) window.open(url, '_blank');
      else toast({ title: 'No PDF yet — generate it first' });
    } finally {
      setBusyId(null);
    }
  };

  const share = async (view: ClientView) => {
    setBusyId(view.id);
    try {
      const { url } = await clientViewsService.share(view.id);
      await navigator.clipboard.writeText(url).catch(() => {});
      await load();
      toast({ title: 'Share link copied', description: url });
    } catch (err: any) {
      toast({ title: 'Could not create share link', description: err?.message, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const copyExisting = async (view: ClientView) => {
    if (!view.public_share_token) return;
    const url = `${window.location.origin}/cv/${view.public_share_token}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    toast({ title: 'Share link copied', description: url });
  };

  const revoke = async (view: ClientView) => {
    setBusyId(view.id);
    try {
      await clientViewsService.revokeShare(view.id);
      await load();
      toast({ title: 'Share link disabled' });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (view: ClientView) => {
    if (!confirm('Delete this client view? The shared link will stop working and the PDF will be removed.')) return;
    setBusyId(view.id);
    try {
      await clientViewsService.remove(view.id);
      await load();
      toast({ title: 'Client view deleted' });
    } finally {
      setBusyId(null);
    }
  };

  const loadFeedback = async (view: ClientView) => {
    if (feedbackByView[view.id]) {
      setFeedbackByView((m) => { const c = { ...m }; delete c[view.id]; return c; });
      return;
    }
    const fb = await clientViewsService.listFeedback(view.id);
    setFeedbackByView((m) => ({ ...m, [view.id]: fb }));
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (!isOwner) {
    return (
      <Card className="dashboard-card">
        <CardContent className="p-6 text-sm text-muted-foreground">
          Client presentations are managed by the project owner.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Client Views</h3>
          <p className="text-sm text-muted-foreground">
            Bundle sheets from any of this project's moodboards into one client-ready PDF + online presentation.
          </p>
        </div>
        {!editorOpen && (
          <Button onClick={openCreate} className="rounded-full">
            <Plus className="h-4 w-4 mr-1" /> New Client View
          </Button>
        )}
      </div>

      {/* Editor */}
      {editorOpen && (
        <Card className="dashboard-card">
          <CardContent className="p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold">{form.id ? 'Edit Client View' : 'New Client View'}</h4>
              <Button variant="ghost" size="sm" onClick={() => setEditorOpen(false)}><X className="h-4 w-4" /></Button>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Subtitle</Label>
                <Input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} placeholder="e.g. Modern Bathroom Design" />
              </div>
              <div className="space-y-1.5">
                <Label>Client name</Label>
                <Input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} placeholder="Prepared for…" />
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
            </div>

            {/* Sheet selection */}
            <div className="space-y-2">
              <Label>Sheets to include {form.selectedSheetIds.length > 0 && <span className="text-muted-foreground">({form.selectedSheetIds.length} selected, in order)</span>}</Label>
              {sheets.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sheets yet. Create sheets on this project's moodboards first (via the KAI agent or the moodboard Sheets tab).</p>
              ) : (
                <div className="space-y-3">
                  {/* Ordered selection */}
                  {form.selectedSheetIds.length > 0 && (
                    <div className="rounded-md border border-border divide-y divide-border/60">
                      {form.selectedSheetIds.map((id, idx) => {
                        const s = sheetById.get(id);
                        if (!s) return null;
                        return (
                          <div key={id} className="flex items-center gap-2 px-3 py-2 text-sm">
                            <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="w-5 text-muted-foreground">{idx + 1}</span>
                            <span className="flex-1 truncate">{s.title || SHEET_TYPE_LABELS[s.sheet_type as SheetType] || s.sheet_type}</span>
                            <span className="text-xs text-muted-foreground capitalize">{SHEET_TYPE_LABELS[s.sheet_type as SheetType] || s.sheet_type}</span>
                            <span className="text-xs text-muted-foreground hidden sm:inline">{s.moodboard_title}</span>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveSheet(id, -1)} disabled={idx === 0}>↑</Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveSheet(id, 1)} disabled={idx === form.selectedSheetIds.length - 1}>↓</Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleSheet(id)}><X className="h-3.5 w-3.5" /></Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Available to add */}
                  <div className="flex flex-wrap gap-2">
                    {sheets.filter((s) => !form.selectedSheetIds.includes(s.id)).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleSheet(s.id)}
                        className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs hover:bg-muted transition"
                      >
                        <Plus className="h-3 w-3" />
                        {s.title || SHEET_TYPE_LABELS[s.sheet_type as SheetType] || s.sheet_type}
                        <span className="text-muted-foreground">· {SHEET_TYPE_LABELS[s.sheet_type as SheetType] || s.sheet_type}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Online embeds */}
            <div className="grid sm:grid-cols-2 gap-3">
              <ToggleRow label="3D walkthrough (Marble)" desc="Embed an explorable 3D world in the online version" checked={form.embedVr} onChange={(v) => setForm({ ...form, embedVr: v })} />
              <ToggleRow label="Lighting moods" desc="Let the client preview the render under different lighting" checked={form.embedLighting} onChange={(v) => setForm({ ...form, embedLighting: v })} />
              <ToggleRow label="Live FF&E pricing" desc="Show an interactive FF&E table from a quote" checked={form.embedFfe} onChange={(v) => setForm({ ...form, embedFfe: v })} />
              <ToggleRow label="Client feedback" desc="Allow inline approve / comment on the online page" checked={form.feedbackEnabled} onChange={(v) => setForm({ ...form, feedbackEnabled: v })} />
            </div>

            {/* Embed sources */}
            <div className="grid sm:grid-cols-2 gap-4">
              {form.embedFfe && (
                <div className="space-y-1.5">
                  <Label>FF&E source quote</Label>
                  <Select value={form.quoteId || '__none__'} onValueChange={(v) => setForm({ ...form, quoteId: v === '__none__' ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="— none —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— none —</SelectItem>
                      {quotes.map((q) => (
                        <SelectItem key={q.id} value={q.id}>
                          {q.name || q.quote_number || q.id.slice(0, 8)}
                          {q.status ? ` · ${q.status}` : ''}{q.grand_total != null ? ` · ${Number(q.grand_total).toFixed(2)} ${q.currency ?? ''}`.trimEnd() : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(() => {
                    const sel = quotes.find((q) => q.id === form.quoteId);
                    if (sel && sel.status && sel.status !== 'accepted') {
                      return <p className="text-[11px] text-amber-500">This quote is <strong>{sel.status}</strong>, not accepted — its pricing will be shown to the client as-is.</p>;
                    }
                    return null;
                  })()}
                </div>
              )}
              {form.embedVr && (
                <div className="space-y-1.5">
                  <Label>3D world</Label>
                  <Select value={form.vrWorldId || '__none__'} onValueChange={(v) => setForm({ ...form, vrWorldId: v === '__none__' ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="— none —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— none —</SelectItem>
                      {vrWorlds.map((w) => (
                        <SelectItem key={w.id} value={w.id}>{w.display_name || w.id.slice(0, 8)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button onClick={() => save(true)} disabled={saving} className="rounded-full">
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileText className="h-4 w-4 mr-1" />}
                Save &amp; generate PDF
              </Button>
              <Button variant="outline" onClick={() => save(false)} disabled={saving} className="rounded-full">Save draft</Button>
              <Button variant="ghost" onClick={() => setEditorOpen(false)} className="rounded-full">Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Existing views */}
      {views.length === 0 && !editorOpen ? (
        <Card className="dashboard-card">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No client views yet. Create one to bundle sheets into a shareable PDF + online presentation.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {views.map((view) => {
            const fb = feedbackByView[view.id];
            return (
              <Card key={view.id} className="dashboard-card">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold truncate">{view.title}</h4>
                        <Badge variant="outline" className={STATUS_TONE[view.pdf_generation_status] || STATUS_TONE.draft}>
                          {view.pdf_generation_status}
                        </Badge>
                        {view.public_share_enabled && (
                          <Badge variant="outline" className="bg-primary/15 text-primary border-primary/30">
                            <Eye className="h-3 w-3 mr-1" />{view.share_view_count} views
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {(view.sheet_ids?.length || 0)} sheet{(view.sheet_ids?.length || 0) === 1 ? '' : 's'}
                        {view.page_count ? ` · ${view.page_count} pages` : ''}
                        {view.cover?.client_name ? ` · for ${view.cover.client_name}` : ''}
                      </p>
                      {view.error_message && (
                        <p className="text-xs text-destructive mt-1">{view.error_message}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="sm" variant="outline" className="rounded-full" disabled={busyId === view.id} onClick={() => doGenerate(view.id)}>
                        {busyId === view.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                        {view.pdf_storage_path ? 'Regenerate' : 'Generate'}
                      </Button>
                      {view.pdf_storage_path && (
                        <Button size="sm" variant="ghost" className="rounded-full" disabled={busyId === view.id} onClick={() => openPdf(view)}>
                          <FileText className="h-3.5 w-3.5 mr-1" /> PDF
                        </Button>
                      )}
                      {view.public_share_enabled ? (
                        <>
                          <Button size="sm" variant="ghost" className="rounded-full" onClick={() => copyExisting(view)}>
                            <Link2 className="h-3.5 w-3.5 mr-1" /> Copy link
                          </Button>
                          {view.public_share_token && (
                            <Button asChild size="sm" variant="ghost" className="rounded-full">
                              <a href={`/cv/${view.public_share_token}`} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5 mr-1" /> Open</a>
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="rounded-full text-muted-foreground" disabled={busyId === view.id} onClick={() => revoke(view)}>Disable link</Button>
                        </>
                      ) : (
                        <Button size="sm" variant="outline" className="rounded-full" disabled={busyId === view.id || !view.pdf_storage_path} onClick={() => share(view)}>
                          <Share2 className="h-3.5 w-3.5 mr-1" /> Share
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="rounded-full" onClick={() => loadFeedback(view)}>
                        <MessageSquare className="h-3.5 w-3.5 mr-1" /> Feedback
                      </Button>
                      <Button size="sm" variant="ghost" className="rounded-full" onClick={() => openEdit(view)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="rounded-full text-destructive" disabled={busyId === view.id} onClick={() => remove(view)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>

                  {fb && (
                    <div className="mt-3 border-t border-border/60 pt-3 space-y-2">
                      {fb.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No client feedback yet.</p>
                      ) : fb.map((f) => (
                        <div key={f.id} className="text-sm flex items-start gap-2">
                          {f.status === 'approved'
                            ? <Check className="h-4 w-4 text-emerald-400 mt-0.5" />
                            : <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5" />}
                          <div>
                            <span className="font-medium">{f.author_name || 'Client'}</span>
                            <span className="text-muted-foreground"> · {f.status || f.kind} · {new Date(f.created_at).toLocaleDateString()}</span>
                            {f.body && <p className="text-muted-foreground">{f.body}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

const ToggleRow: React.FC<{ label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, desc, checked, onChange }) => (
  <div className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2.5">
    <div>
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">{desc}</p>
    </div>
    <Switch checked={checked} onCheckedChange={onChange} />
  </div>
);
