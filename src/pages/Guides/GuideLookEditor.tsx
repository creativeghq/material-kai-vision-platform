import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, ImageIcon, Loader2, Search, Sparkles } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { FormField } from '@/components/core/ui/form-layout';
import { Input } from '@/components/core/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { hardwareShape, partNumber } from '@/components/features/guides/partModels';
import type { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDate } from '@/utils/datetime';
import { FINISH_KINDS, type FinishKind, type GuideAppearance, type GuideFinish } from '@/lib/installation/guideSchema';
import { installationGuideService, type InstallationGuideRow } from '@/services/installationGuideService';

const NONE = '__none';

function ownLook(kind: string, name: string): string {
  if (kind === 'panel' || kind === 'fitting') return 'Plain (not in the photo)';
  const shape = hardwareShape(name);
  if (shape === 'dowel') return 'Its own look: wood';
  if (shape === 'foot') return 'Its own look: black plastic';
  return 'Its own look: steel';
}
type Candidate = { thumb: string; full: string; title: string | null };
const foundFor = new Map<string, { candidates: Candidate[]; picked: string }>();

function Swatch({ finish, photoUrl }: { finish: GuideFinish; photoUrl: string | null }) {
  const s = finish.swatch;
  const style = s && photoUrl
    ? {
      backgroundImage: `url("${photoUrl}")`,
      backgroundSize: `${100 / (s.x1 - s.x0)}% ${100 / (s.y1 - s.y0)}%`,
      backgroundPosition: `${(s.x0 / Math.max(1e-3, 1 - (s.x1 - s.x0))) * 100}% ${(s.y0 / Math.max(1e-3, 1 - (s.y1 - s.y0))) * 100}%`,
    }
    : { backgroundColor: finish.color };
  return <span className="block h-9 w-9 shrink-0 rounded-sm border border-hairline" style={style} />;
}

export function GuideLookEditor({ row, onSaved, toast }: {
  row: InstallationGuideRow;
  onSaved: (appearance: GuideAppearance | null) => void;
  toast: ReturnType<typeof useToast>['toast'];
}) {
  const parts = row.guide?.parts ?? [];
  const [draft, setDraft] = useState<GuideAppearance | null>(row.appearance);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [candidates, setCandidatesState] = useState<Candidate[] | null>(() => foundFor.get(row.id)?.candidates ?? null);
  const [picked, setPickedState] = useState(() => foundFor.get(row.id)?.picked ?? '');
  const setCandidates = (c: Candidate[] | null) => {
    setCandidatesState(c);
    if (c) foundFor.set(row.id, { candidates: c, picked: '' });
    else foundFor.delete(row.id);
  };
  const setPicked = (p: string) => {
    setPickedState(p);
    const kept = foundFor.get(row.id);
    if (kept) foundFor.set(row.id, { ...kept, picked: p });
  };
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState<'search' | 'read' | 'save' | null>(null);

  useEffect(() => { setDraft(row.appearance); }, [row.appearance]);
  useEffect(() => {
    let live = true;
    void installationGuideService.productPhotoUrl(row).then((u) => { if (live) setPhotoUrl(u); });
    return () => { live = false; };
  }, [row]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(row.appearance), [draft, row.appearance]);

  const search = async () => {
    setBusy('search');
    try {
      const found = await installationGuideService.findProductPhotos(row);
      setCandidates(found);
      if (found.length === 0) toast({ title: 'No photos found', description: 'Paste the product page or photo address instead.' });
    } catch (e) {
      toast({ title: 'Photo search failed', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const read = async () => {
    const typed = address.trim();
    const source = typed
      ? (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(typed) ? { image_url: typed } : { page_url: typed })
      : { image_url: picked, fallback_url: candidates?.find((c) => c.full === picked)?.thumb };
    setBusy('read');
    try {
      const { appearance, usedPreview } = await installationGuideService.readAppearance(row.id, source);
      onSaved(appearance);
      setAddress('');
      toast(usedPreview
        ? { title: 'Read from a small preview', description: 'The full photo could not be downloaded, so the colours came from the search preview and textures will look soft. Pick another photo or paste the product page for a sharper result.' }
        : { title: 'Finishes read', description: `${appearance.finishes.length} finishes and the room are now on the 3D. Check them below.` });
    } catch (e) {
      toast({ title: 'The finishes could not be read', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy('save');
    try {
      await installationGuideService.saveAppearance(row.id, draft);
      onSaved(draft);
      toast({ title: 'Look saved' });
    } catch (e) {
      toast({ title: 'The look could not be saved', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const patchFinish = (id: string, p: Partial<GuideFinish>) =>
    draft && setDraft({ ...draft, finishes: draft.finishes.map((f) => (f.id === id ? { ...f, ...p } : f)) });
  const setPartFinish = (partId: string, finishId: string) => {
    if (!draft) return;
    const next = { ...draft.parts };
    if (finishId === NONE) delete next[partId];
    else next[partId] = finishId;
    setDraft({ ...draft, parts: next });
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>The product photo</CardTitle>
          <p className="text-xs text-muted-foreground">Find the product, tap the photo that matches yours, then press Read the finishes. The 3D takes its colours, its wood and stone textures and the room around it (wall and floor) from that photo. Reading a photo costs a few credits.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {photoUrl && (
            <div className="flex flex-wrap items-start gap-3">
              <img src={photoUrl} alt="The product photo the finishes were read from" className="h-40 w-auto max-w-full rounded-sm border border-hairline object-contain" />
              {draft?.source_url && (
                <a href={draft.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <ExternalLink className="h-3.5 w-3.5" />Where it came from
                </a>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-1.5" disabled={busy !== null} onClick={() => void search()}>
              {busy === 'search' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Find photos of {row.guide?.title || row.title}
            </Button>
          </div>
          {candidates && candidates.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-8">
              {candidates.map((c) => (
                <button
                  key={c.full}
                  type="button"
                  onClick={() => { setPicked(c.full); setAddress(''); }}
                  className={cn('relative aspect-square overflow-hidden rounded-sm border bg-white', picked === c.full ? 'border-primary ring-2 ring-primary' : 'border-hairline')}
                  title={c.title ?? undefined}
                >
                  <img src={c.thumb} alt={c.title ?? 'Product photo'} className="h-full w-full object-contain" loading="lazy" />
                  {(draft?.source_url === c.full || draft?.source_url === c.thumb) && (
                    <span className="absolute inset-x-0 bottom-0 bg-primary py-0.5 text-center text-[10px] font-semibold text-primary-foreground">In use</span>
                  )}
                </button>
              ))}
            </div>
          )}
          {candidates && candidates.length > 0 && (
            <p className="text-xs text-muted-foreground">{picked ? 'Picked. Press Read the finishes to apply it.' : 'Tap the photo that matches your product.'}</p>
          )}
          <FormField label="Or paste a product page or photo address">
            <Input value={address} placeholder="https://www.ikea.com/…" onChange={(e) => { setAddress(e.target.value); setPicked(''); }} />
          </FormField>
          <Button className="gap-1.5" disabled={busy !== null || (!picked && !/^https:\/\//i.test(address.trim()))} onClick={() => void read()}>
            {busy === 'read' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Read the finishes
          </Button>
        </CardContent>
      </Card>

      {draft && draft.finishes.length > 0 ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Finishes</CardTitle>
              <p className="text-xs text-muted-foreground">Correct a colour or a material if the photo misled the reader.</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {draft.finishes.map((f) => (
                <div key={f.id} className="flex flex-wrap items-center gap-2">
                  <Swatch finish={f} photoUrl={photoUrl} />
                  <Input className="h-9 min-w-0 flex-1" value={f.name} maxLength={60} onChange={(e) => patchFinish(f.id, { name: e.target.value })} aria-label="Finish name" />
                  <input type="color" value={f.color} onChange={(e) => patchFinish(f.id, { color: e.target.value })} className="h-9 w-12 cursor-pointer rounded-sm border border-hairline bg-transparent" aria-label={`${f.name} colour`} />
                  <Select value={f.kind} onValueChange={(v) => patchFinish(f.id, { kind: v as FinishKind })}>
                    <SelectTrigger className="h-9 w-28 capitalize"><SelectValue /></SelectTrigger>
                    <SelectContent>{FINISH_KINDS.map((k) => <SelectItem key={k} value={k} className="capitalize">{k}</SelectItem>)}</SelectContent>
                  </Select>
                  {f.swatch && (
                    <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => patchFinish(f.id, { swatch: null })}>Plain colour</Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Which part has which finish</CardTitle>
              <p className="text-xs text-muted-foreground">
                {draft.read_at ? `Read from the photo on ${formatDate(draft.read_at, { withTime: true })}. ` : ''}
                {Object.keys(draft.parts).length} of {parts.length} parts take a finish from the photo
                {draft.finishes.map((f) => ` · ${f.name}: ${Object.values(draft.parts).filter((v) => v === f.id).length}`).join('')}.
                Hidden hardware keeps its own look.
              </p>
            </CardHeader>
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead className="bg-surface-sunken text-left text-[11px] font-semibold text-muted-foreground">
                  <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Part</th><th className="px-3 py-2">Finish</th></tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {parts.map((p, i) => (
                    <tr key={p.id}>
                      <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{partNumber(i)}</td>
                      <td className="px-3 py-1.5">{p.name}</td>
                      <td className="px-3 py-1.5">
                        <Select value={draft.parts[p.id] ?? NONE} onValueChange={(v) => setPartFinish(p.id, v)}>
                          <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>{ownLook(p.kind, p.name)}</SelectItem>
                            {draft.finishes.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <div className="flex gap-2">
            <Button disabled={!dirty || busy !== null} onClick={() => void save()}>{busy === 'save' ? 'Saving…' : 'Save the look'}</Button>
            <Button variant="ghost" disabled={busy !== null} onClick={() => setDraft({ ...draft, finishes: [], parts: {} })}>Clear the finishes</Button>
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
            <ImageIcon className="h-5 w-5 shrink-0" />No finishes yet. The 3D shows plain laminate until a product photo is read.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
