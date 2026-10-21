import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BookOpen, ChevronLeft, ChevronRight, Loader2, Play, RotateCcw, Trash2, TriangleAlert } from 'lucide-react';

import { HubRecordPage } from '@/components/core/hub';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { HubTabNav } from '@/components/core/hub/HubTabNav';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { FormField, FormGrid } from '@/components/core/ui/form-layout';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/core/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { PART_KINDS, type InstallationGuideData, type PageBox, type PartKind } from '@/lib/installation/guideSchema';
import { installationGuideService, type InstallationGuideRow } from '@/services/installationGuideService';
import { GUIDE_STATUS } from './GuidesPage';
import { usePageAspects } from '@/components/features/guides/usePageAspects';
import { GuideLookEditor } from './GuideLookEditor';

function PageBoxEditor({ url, aspect, box, onChange }: { url: string | null; aspect: number; box: PageBox; onChange: (b: PageBox) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<PageBox | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const at = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1), y: Math.min(Math.max((e.clientY - r.top) / r.height, 0), 1) };
  };
  const shown = draft ?? box;
  return (
    <div
      ref={ref}
      className="relative w-full cursor-crosshair touch-none select-none overflow-hidden rounded-sm border border-hairline bg-white"
      style={{ aspectRatio: `1 / ${aspect}` }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        origin.current = at(e);
        setDraft({ x0: origin.current.x, y0: origin.current.y, x1: origin.current.x, y1: origin.current.y });
      }}
      onPointerMove={(e) => {
        if (!origin.current) return;
        const p = at(e);
        const o = origin.current;
        setDraft({ x0: Math.min(o.x, p.x), y0: Math.min(o.y, p.y), x1: Math.max(o.x, p.x), y1: Math.max(o.y, p.y) });
      }}
      onPointerUp={() => {
        if (draft && draft.x1 - draft.x0 > 0.03 && draft.y1 - draft.y0 > 0.03) onChange(draft);
        origin.current = null;
        setDraft(null);
      }}
    >
      {url && <img src={url} alt="" draggable={false} className="pointer-events-none block h-full w-full object-contain" />}
      <div
        className="pointer-events-none absolute rounded-sm border-2 border-amber-500 bg-amber-400/15"
        style={{ left: `${shown.x0 * 100}%`, top: `${shown.y0 * 100}%`, width: `${(shown.x1 - shown.x0) * 100}%`, height: `${(shown.y1 - shown.y0) * 100}%` }}
      />
    </div>
  );
}

function StepsEditor({ row, guide, pageUrls, onChange }: { row: InstallationGuideRow; guide: InstallationGuideData; pageUrls: string[]; onChange: (g: InstallationGuideData) => void }) {
  const [selected, setSelected] = useState(0);
  const aspects = usePageAspects(pageUrls, row.page_aspect);
  const step = guide.steps[Math.min(selected, guide.steps.length - 1)];
  const patch = (p: Partial<typeof step>) => onChange({ ...guide, steps: guide.steps.map((s, i) => (i === selected ? { ...s, ...p } : s)) });
  if (!step) return null;
  return (
    <div className="grid gap-3 xl:grid-cols-[16rem_minmax(0,1fr)]">
      <div className="flex items-center gap-2 xl:hidden">
        <Button variant="outline" size="sm" className="h-10 w-10 shrink-0 p-0" disabled={selected <= 0} onClick={() => setSelected((n) => Math.max(0, n - 1))} aria-label="Previous step">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Select value={String(selected)} onValueChange={(v) => setSelected(Number(v))}>
          <SelectTrigger className="h-10 min-w-0 flex-1" aria-label="Step"><SelectValue /></SelectTrigger>
          <SelectContent>
            {guide.steps.map((s, i) => <SelectItem key={i} value={String(i)}>{i ? `${i}. ${s.title}` : `The kit · ${s.title}`}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-10 w-10 shrink-0 p-0" disabled={selected >= guide.steps.length - 1} onClick={() => setSelected((n) => Math.min(guide.steps.length - 1, n + 1))} aria-label="Next step">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <Card className="hidden h-fit xl:block">
        <CardContent className="p-1.5">
          <ol className="space-y-0.5">
            {guide.steps.map((s, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => setSelected(i)}
                  className={cn('flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted', i === selected ? 'bg-primary/10 text-foreground' : 'text-muted-foreground')}
                >
                  <span className="w-5 shrink-0 text-right text-xs tabular-nums">{i || '—'}</span>
                  <span className="min-w-0 flex-1 truncate">{s.title}</span>
                  <span className="shrink-0 text-[11px] tabular-nums">p{s.page}</span>
                </button>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{selected ? `Step ${selected}` : 'The kit'}</CardTitle>
          <p className="text-xs text-muted-foreground">Drag on the page to re-draw the box around this step's drawing.</p>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <FormField label="Title"><Input value={step.title} maxLength={80} onChange={(e) => patch({ title: e.target.value })} /></FormField>
            <FormField label="Instruction"><Textarea rows={5} value={step.instruction} maxLength={600} onChange={(e) => patch({ instruction: e.target.value })} /></FormField>
            <FormField label="Warning (optional)"><Input value={step.warning} maxLength={300} onChange={(e) => patch({ warning: e.target.value })} /></FormField>
            <FormGrid>
              <FormField label="Page">
                <Select value={String(step.page)} onValueChange={(v) => patch({ page: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Array.from({ length: row.page_count }, (_, i) => <SelectItem key={i} value={String(i + 1)}>Page {i + 1}</SelectItem>)}</SelectContent>
                </Select>
              </FormField>
              <FormField label="People"><Input type="number" min={1} max={6} value={step.people} onChange={(e) => patch({ people: Math.min(6, Math.max(1, Number(e.target.value) || 1)) })} /></FormField>
            </FormGrid>
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">Parts this step puts in</p>
              {step.parts_used.length === 0 ? (
                <p className="text-xs text-muted-foreground">None.</p>
              ) : (
                <ul className="space-y-0.5 text-sm">
                  {step.parts_used.map((u) => {
                    const part = guide.parts.find((p) => p.id === u.part_id);
                    return <li key={u.part_id} className="flex justify-between gap-2"><span>{part?.name ?? u.part_id}{part?.code && <span className="ml-1 font-mono text-xs text-muted-foreground">{part.code}</span>}</span><span className="tabular-nums text-muted-foreground">{u.quantity}x</span></li>;
                  })}
                </ul>
              )}
            </div>
          </div>
          <PageBoxEditor url={pageUrls[step.page - 1] ?? null} aspect={aspects[step.page - 1] ?? row.page_aspect} box={step.box} onChange={(b) => patch({ box: b })} />
        </CardContent>
      </Card>
    </div>
  );
}

function PartsEditor({ guide, onChange }: { guide: InstallationGuideData; onChange: (g: InstallationGuideData) => void }) {
  const patch = (id: string, p: Record<string, unknown>) => onChange({ ...guide, parts: guide.parts.map((x) => (x.id === id ? { ...x, ...p } : x)) });
  return (
    <Card>
      <CardHeader>
        <CardTitle>The kit</CardTitle>
        <p className="text-xs text-muted-foreground">Names, printed part numbers and counts, as read from the manual.</p>
      </CardHeader>
      <div className="table-scroll">
        <table className="w-full text-sm">
          <thead className="bg-surface-sunken text-left text-[11px] font-semibold text-muted-foreground">
            <tr><th className="px-3 py-2">Part</th><th className="px-3 py-2">Code</th><th className="px-3 py-2">Kind</th><th className="px-3 py-2 text-right">Count</th></tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {guide.parts.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-1.5"><Input className="h-8" value={p.name} maxLength={80} onChange={(e) => patch(p.id, { name: e.target.value })} /></td>
                <td className="px-3 py-1.5"><Input className="h-8 w-32 font-mono" value={p.code} maxLength={40} onChange={(e) => patch(p.id, { code: e.target.value })} /></td>
                <td className="px-3 py-1.5">
                  <Select value={p.kind} onValueChange={(v) => patch(p.id, { kind: v as PartKind })}>
                    <SelectTrigger className="h-8 w-32 capitalize"><SelectValue /></SelectTrigger>
                    <SelectContent>{PART_KINDS.map((k) => <SelectItem key={k} value={k} className="capitalize">{k}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-1.5 text-right"><Input type="number" min={1} className="ml-auto h-8 w-20 text-right tabular-nums" value={p.quantity} onChange={(e) => patch(p.id, { quantity: Math.max(1, Math.round(Number(e.target.value) || 1)) })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function GuideDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [row, setRow] = useState<InstallationGuideRow | null>(null);
  const [missing, setMissing] = useState(false);
  const [pageUrls, setPageUrls] = useState<string[]>([]);
  const [draft, setDraft] = useState<InstallationGuideData | null>(null);
  const [tab, setTab] = useState('steps');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReread, setConfirmReread] = useState(false);

  const load = useCallback(async () => {
    try {
      const g = await installationGuideService.get(id);
      if (!g) { setMissing(true); return; }
      setRow(g);
      setDraft((d) => d ?? g.guide);
      if (g.page_count) setPageUrls(await installationGuideService.pageUrls(g));
    } catch (e) {
      toast({ title: 'The guide could not be loaded', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  }, [id, toast]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (row?.status !== 'extracting') return;
    const t = setInterval(async () => {
      const g = await installationGuideService.get(id).catch(() => null);
      if (g && g.status !== 'extracting') {
        setRow(g);
        setDraft(g.guide);
      }
    }, 4000);
    return () => clearInterval(t);
  }, [row?.status, id]);

  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(row?.guide);

  const save = async (status?: 'review' | 'published') => {
    if (!row) return;
    setSaving(true);
    try {
      const updated = await installationGuideService.save(row.id, { guide: draft ?? undefined, status, title: draft?.title });
      setRow(updated);
      setDraft(updated.guide);
      toast({ title: status === 'published' ? 'Guide published' : 'Changes saved' });
    } catch (e) {
      toast({ title: 'The guide could not be saved', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const reread = async () => {
    if (!row) return;
    try {
      await installationGuideService.read(row.id);
      setRow({ ...row, status: 'extracting', error: null });
    } catch (e) {
      toast({ title: 'The manual could not be sent for reading', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const remove = async () => {
    if (!row) return;
    try {
      await installationGuideService.remove(row);
      navigate('/guides');
    } catch (e) {
      toast({ title: 'The guide could not be deleted', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  if (missing) {
    return (
      <div className="min-h-screen bg-background p-6">
        <HubEmptyState icon={BookOpen} title="Guide not found" description="It may have been deleted, or it belongs to another workspace." action={<Button asChild variant="outline"><Link to="/guides">All guides</Link></Button>} />
      </div>
    );
  }
  if (!row) return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  const status = GUIDE_STATUS[row.status];
  const stale = row.status === 'extracting' && Date.now() - new Date(row.updated_at).getTime() > 10 * 60 * 1000;
  const g = draft;
  const left = (
    <Card>
      <CardContent className="space-y-3 p-4">
        <Badge variant={status.variant}>{status.label}</Badge>
        {g ? (
          <FormField label="Title"><Input value={g.title} maxLength={120} onChange={(e) => setDraft({ ...g, title: e.target.value })} /></FormField>
        ) : (
          <p className="text-sm font-medium">{row.title}</p>
        )}
        <dl className="grid grid-cols-3 gap-2 text-center">
          {[['Pages', row.page_count], ['Parts', g?.parts.length ?? 0], ['Steps', g ? Math.max(g.steps.length - 1, 0) : 0]].map(([k, v]) => (
            <div key={k as string} className="rounded-sm bg-surface-sunken py-1.5">
              <dt className="text-[11px] text-muted-foreground">{k}</dt>
              <dd className="text-base font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        {g && !g.assembly.available && (
          <p className="text-xs text-muted-foreground">The finished shape was not read from this manual, so the 3D shows the parts going in beside the kit rather than assembled.</p>
        )}
        <div className="flex flex-col gap-2">
          {g && (
            <Button asChild className="gap-1.5"><Link to={`/guides/${row.id}/play`}><Play className="h-4 w-4" />Open the guide</Link></Button>
          )}
          {(row.status !== 'extracting' || stale) && row.page_count > 0 && (
            <Button variant="outline" className="gap-1.5" onClick={() => (g && !stale ? setConfirmReread(true) : reread())}>
              <RotateCcw className="h-4 w-4" />Read the manual again
            </Button>
          )}
          <Button variant="ghost" className="gap-1.5 text-destructive" onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4" />Delete</Button>
        </div>
      </CardContent>
    </Card>
  );

  let body: React.ReactNode;
  if (row.status === 'extracting') {
    body = (
      <Card>
        <CardContent className="flex items-center gap-3 p-6 text-sm">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          {stale
            ? 'This read stopped without finishing. Read the manual again to retry.'
            : `Reading ${row.page_count} pages — the parts, part numbers and every step. This usually takes one to three minutes; the page updates by itself.`}
        </CardContent>
      </Card>
    );
  } else if (row.status === 'failed' && !g) {
    body = (
      <Card>
        <CardContent className="space-y-3 p-6">
          <p className="flex gap-2 text-sm text-destructive"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />{row.error || 'Reading the manual failed.'}</p>
          {row.page_count > 0 && <Button variant="outline" onClick={reread} className="gap-1.5"><RotateCcw className="h-4 w-4" />Try again</Button>}
        </CardContent>
      </Card>
    );
  } else if (!g) {
    body = (
      <HubEmptyState
        icon={BookOpen}
        title="This manual has not been read yet"
        description="Read it to turn its pages into the parts and the steps."
        action={row.page_count > 0 ? <Button onClick={reread}>Read the manual</Button> : undefined}
      />
    );
  } else {
    body = (
      <div className="space-y-3">
        {row.status === 'failed' && row.error && (
          <p className="flex gap-2 text-sm text-destructive"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />The last read failed: {row.error}</p>
        )}
        <HubTabNav
          items={[{ id: 'steps', label: 'Steps', count: g.steps.length }, { id: 'parts', label: 'Parts', count: g.parts.length }, { id: 'look', label: 'Look', count: row.appearance?.finishes.length ?? 0 }]}
          activeId={tab}
          onSelect={setTab}
          aria-label="Guide sections"
        />
        {tab === 'steps' && <StepsEditor row={row} guide={g} pageUrls={pageUrls} onChange={setDraft} />}
        {tab === 'parts' && <PartsEditor guide={g} onChange={setDraft} />}
        {tab === 'look' && <GuideLookEditor row={row} toast={toast} onSaved={(appearance) => setRow({ ...row, appearance })} />}
      </div>
    );
  }

  return (
    <HubRecordPage
      icon={BookOpen}
      title={g?.title || row.title}
      subtitle={row.status === 'review' ? 'Check the parts and steps, then publish.' : undefined}
      breadcrumbs={[{ label: 'Installation guides', to: '/guides' }, { label: g?.title || row.title }]}
      actions={g ? (
        <div className="flex gap-2">
          <Button variant="outline" disabled={!dirty || saving} onClick={() => save()}>Save changes</Button>
          {row.status !== 'published' ? (
            <Button disabled={saving} onClick={() => save('published')}>Publish</Button>
          ) : (
            <Button variant="outline" disabled={saving} onClick={() => save('review')}>Unpublish</Button>
          )}
        </div>
      ) : undefined}
      left={left}
      overlays={(
        <>
        <AlertDialog open={confirmReread} onOpenChange={setConfirmReread}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Read the manual again?</AlertDialogTitle>
              <AlertDialogDescription>The steps and parts are read from the pages again and replace the current guide, including any edits made here. It is charged per page.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={reread}>Read it again</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this guide?</AlertDialogTitle>
              <AlertDialogDescription>The guide, its pages and the uploaded PDF are removed. This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        </>
      )}
    >
      {body}
    </HubRecordPage>
  );
}
