/**
 * SheetWizardModal — the single guided "New Sheet" flow.
 *
 * Opened from BOTH entry points (MoodboardSheetsTab "+ New Sheet" with a moodboard
 * pre-selected; the Presentation Sheets toolkit quick-starts with a type
 * pre-selected). Walks: type → moodboard → type-specific inputs → submit. Submit
 * calls the UNIFIED backend (moodboardSheetsService.createSheet → the
 * generate-moodboard-sheet-pdf `create` action) so credits + auto-extract run in
 * one place. Passive types come back rendered; interactive types come back for the
 * canvas — the host decides what to show via onCreated.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, ImagePlus, ChevronLeft, Check } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { moodboardAPI } from '@/services/moodboardAPI';
import {
  moodboardSheetsService, SHEET_TYPE_LABELS, SHEET_TYPE_CREDITS, type SheetType,
} from '@/services/moodboardSheetsService';

export interface SheetWizardResult {
  sheet_id: string;
  sheet_type: SheetType;
  moodboard_id: string;
  title: string;
  is_interactive: boolean;
  status?: string;
  pdf_url?: string;
  page_count?: number;
  credits_charged?: number;
  initial_data?: Record<string, any>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** When set, the moodboard step is skipped (launched from inside a moodboard). */
  presetMoodboardId?: string;
  presetMoodboardTitle?: string;
  /** When set, the type step is skipped (launched from a typed quick-start). */
  presetType?: SheetType;
  onCreated?: (result: SheetWizardResult) => void;
}

const TYPE_GROUPS: { group: string; types: SheetType[] }[] = [
  { group: 'Boards', types: ['material_board', 'color_palette', 'concept_board', 'area_breakdown'] },
  { group: 'Plans', types: ['lighting_plan', 'plumbing_plan', 'electrical_plan'] },
  { group: 'Renders', types: ['annotated_render', 'elevation_render_pair'] },
  { group: 'Schedules', types: ['ffe_schedule'] },
  { group: 'Decks', types: ['full_deck'] },
];

type Mb = { id: string; title: string };
type Item = { id: string; product_id: string | null; name: string; image_url: string | null };
type QuoteRow = { id: string; label: string };
type SheetRow = { id: string; label: string };

export function SheetWizardModal({ open, onClose, presetMoodboardId, presetMoodboardTitle, presetType, onCreated }: Props) {
  const { toast } = useToast();

  const [type, setType] = useState<SheetType | null>(presetType ?? null);
  const [moodboardId, setMoodboardId] = useState<string>(presetMoodboardId ?? '');
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // dynamic data
  const [moodboards, setMoodboards] = useState<Mb[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [existingSheets, setExistingSheets] = useState<SheetRow[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // per-type selections
  const [productIds, setProductIds] = useState<string[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [quoteId, setQuoteId] = useState('');
  const [heroUrl, setHeroUrl] = useState('');
  const [planUrl, setPlanUrl] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [backdropKind, setBackdropKind] = useState<'upload' | 'rect'>('upload');
  const [backdropUrl, setBackdropUrl] = useState('');
  const [rectW, setRectW] = useState('');
  const [rectH, setRectH] = useState('');
  const [elevationUrl, setElevationUrl] = useState('');
  const [includedSheetIds, setIncludedSheetIds] = useState<string[]>([]);

  // Which steps apply, in order.
  const steps = useMemo(() => {
    const s: ('type' | 'moodboard' | 'details')[] = [];
    if (!presetType) s.push('type');
    if (!presetMoodboardId) s.push('moodboard');
    s.push('details');
    return s;
  }, [presetType, presetMoodboardId]);
  const [stepIdx, setStepIdx] = useState(0);
  const step = steps[stepIdx];

  // Reset everything when (re)opened.
  useEffect(() => {
    if (!open) return;
    setType(presetType ?? null);
    setMoodboardId(presetMoodboardId ?? '');
    setTitle('');
    setStepIdx(0);
    setProductIds([]); setImageUrls([]); setQuoteId(''); setHeroUrl(''); setPlanUrl(''); setSubtitle('');
    setBackdropKind('upload'); setBackdropUrl(''); setRectW(''); setRectH('');
    setElevationUrl(''); setIncludedSheetIds([]);
  }, [open, presetType, presetMoodboardId]);

  // Load the user's moodboards (only when the moodboard step is in play).
  useEffect(() => {
    if (!open || presetMoodboardId) return;
    moodboardAPI.getUserMoodBoards()
      .then((list) => setMoodboards(list.map((m: any) => ({ id: m.id, title: m.title || 'Untitled' }))))
      .catch(() => setMoodboards([]));
  }, [open, presetMoodboardId]);

  // Default the title once type is known.
  useEffect(() => {
    if (type && !title) setTitle(presetMoodboardTitle ? `${presetMoodboardTitle} — ${SHEET_TYPE_LABELS[type]}` : SHEET_TYPE_LABELS[type]);
  }, [type, presetMoodboardTitle]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load the type-specific data set for the chosen moodboard when we reach details.
  useEffect(() => {
    if (!open || step !== 'details' || !moodboardId || !type) return;
    let cancelled = false;
    const needsItems = ['material_board', 'concept_board', 'area_breakdown', 'annotated_render', 'elevation_render_pair', 'lighting_plan', 'plumbing_plan', 'electrical_plan'].includes(type);
    const run = async () => {
      setLoadingData(true);
      try {
        if (needsItems) {
          const rows = await moodboardAPI.getMoodBoardItems(moodboardId);
          if (!cancelled) {
            setItems((rows || []).map((it: any) => ({
              id: it.id,
              product_id: it.material?.id ?? null,
              name: it.material?.name || it.media_title || 'Item',
              image_url: it.material?.thumbnail_url || it.media_url || null,
            })));
          }
        }
        if (type === 'ffe_schedule') {
          const { data: { user } } = await supabase.auth.getUser();
          const { data } = await supabase.from('quotes')
            .select('id, quote_number, name, grand_total, currency')
            .eq('user_id', user?.id ?? '')
            .order('created_at', { ascending: false })
            .limit(50);
          if (!cancelled) {
            setQuotes((data || []).map((q: any) => ({
              id: q.id,
              label: `${q.quote_number || q.name || q.id.slice(0, 8)}${q.grand_total != null ? ` · ${q.grand_total} ${q.currency || ''}` : ''}`,
            })));
          }
        }
        if (type === 'full_deck') {
          const list = await moodboardSheetsService.list(moodboardId);
          if (!cancelled) {
            setExistingSheets(list
              .filter((s) => s.sheet_type !== 'full_deck')
              .map((s) => ({ id: s.id, label: `${s.title} · ${SHEET_TYPE_LABELS[s.sheet_type]}` })));
          }
        }
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [open, step, moodboardId, type]);

  const toggle = (arr: string[], set: (v: string[]) => void, val: string, cap?: number) => {
    if (arr.includes(val)) set(arr.filter((x) => x !== val));
    else if (!cap || arr.length < cap) set([...arr, val]);
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      const path = `u/${user?.id ?? 'anon'}/sheet-uploads/${Date.now()}.${ext}`;
      const { data, error } = await supabase.storage.from('generation-images').upload(path, file, { upsert: true });
      if (error || !data) throw error;
      return supabase.storage.from('generation-images').getPublicUrl(data.path).data.publicUrl;
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e?.message, variant: 'destructive' });
      return null;
    }
  };

  // Build the per-type initial_data payload. Returns null + a reason if incomplete.
  const buildInitialData = (): { data: Record<string, any> } | { error: string } => {
    if (!type) return { error: 'Pick a sheet type.' };
    switch (type) {
      case 'material_board':
        if (productIds.length === 0) return { error: 'Select at least one product.' };
        return { data: { product_ids: productIds } };
      case 'color_palette':
        return { data: {} }; // backend auto-extracts from the moodboard images
      case 'concept_board':
        if (imageUrls.length === 0) return { error: 'Select at least one image.' };
        return { data: { layout: imageUrls.map((u) => ({ image_url: u })) } };
      case 'ffe_schedule':
        if (!quoteId) return { error: 'Pick a quote.' };
        return { data: { quote_id: quoteId } };
      case 'area_breakdown':
        if (!heroUrl) return { error: 'Add a hero render image.' };
        return { data: {
          hero_image_url: heroUrl,
          ...(planUrl ? { plan_image_url: planUrl } : {}),
          ...(elevationUrl ? { elevation_image_url: elevationUrl } : {}),
          ...(subtitle ? { subtitle } : {}),
        } };
      case 'lighting_plan':
      case 'plumbing_plan':
      case 'electrical_plan':
        if (backdropKind === 'upload') {
          if (!backdropUrl) return { error: 'Upload or pick a floor-plan image.' };
          return { data: { backdrop: { kind: 'upload', image_url: backdropUrl } } };
        }
        if (!rectW || !rectH) return { error: 'Enter room width and height in mm.' };
        return { data: { backdrop: { kind: 'rect', width_mm: Number(rectW), height_mm: Number(rectH) } } };
      case 'annotated_render':
        if (!backdropUrl) return { error: 'Add the render image to annotate.' };
        return { data: { backdrop_image_url: backdropUrl } };
      case 'elevation_render_pair':
        if (!elevationUrl) return { error: 'Add the elevation image.' };
        return { data: { elevation_image_url: elevationUrl } };
      case 'full_deck':
        if (includedSheetIds.length === 0) return { error: 'Select at least one sheet to include.' };
        return { data: { included_sheet_ids: includedSheetIds, cover: { title: title || 'Presentation', date: new Date().toISOString() } } };
    }
    return { error: 'Unsupported sheet type.' };
  };

  const canNext = (step === 'type' && !!type) || (step === 'moodboard' && !!moodboardId);

  const submit = async () => {
    if (!type || !moodboardId) return;
    const built = buildInitialData();
    if ('error' in built) { toast({ title: 'Almost there', description: built.error }); return; }
    setSubmitting(true);
    try {
      const res = await moodboardSheetsService.createSheet({
        moodboard_id: moodboardId,
        sheet_type: type,
        title: title || SHEET_TYPE_LABELS[type],
        initial_data: built.data,
      });
      onCreated?.({
        sheet_id: res.sheet_id,
        sheet_type: type,
        moodboard_id: moodboardId,
        title: title || SHEET_TYPE_LABELS[type],
        is_interactive: res.is_interactive,
        status: res.status,
        pdf_url: res.pdf_url,
        page_count: res.page_count,
        credits_charged: res.credits_charged,
        initial_data: res.initial_data,
      });
      onClose();
    } catch (e: any) {
      toast({ title: 'Could not create sheet', description: e?.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const credits = type ? SHEET_TYPE_CREDITS[type] : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {stepIdx > 0 && (
              <button onClick={() => setStepIdx((i) => Math.max(0, i - 1))} className="p-1 rounded hover:bg-muted text-muted-foreground">
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            New Sheet{type ? ` · ${SHEET_TYPE_LABELS[type]}` : ''}
          </DialogTitle>
        </DialogHeader>

        {/* STEP: type */}
        {step === 'type' && (
          <div className="space-y-3">
            {TYPE_GROUPS.map((g) => (
              <div key={g.group}>
                <div className="text-[11px] font-medium text-muted-foreground mb-1">{g.group}</div>
                <div className="grid grid-cols-2 gap-2">
                  {g.types.map((t) => (
                    <button
                      key={t}
                      onClick={() => { setType(t); setTitle(''); setStepIdx((i) => i + 1); }}
                      className={`text-left text-sm px-3 py-2 rounded-md border transition-colors ${type === t ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'}`}
                    >
                      {SHEET_TYPE_LABELS[t]}
                      <span className="block text-[10px] text-muted-foreground">{SHEET_TYPE_CREDITS[t]} credit{SHEET_TYPE_CREDITS[t] === 1 ? '' : 's'}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* STEP: moodboard */}
        {step === 'moodboard' && (
          <div className="space-y-2">
            <Label className="text-xs">Which moodboard?</Label>
            <Select value={moodboardId} onValueChange={setMoodboardId}>
              <SelectTrigger><SelectValue placeholder="Select a moodboard…" /></SelectTrigger>
              <SelectContent>
                {moodboards.map((m) => <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>)}
              </SelectContent>
            </Select>
            {moodboards.length === 0 && <p className="text-xs text-muted-foreground">No moodboards yet — create one first.</p>}
          </div>
        )}

        {/* STEP: details */}
        {step === 'details' && type && (
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Sheet title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={SHEET_TYPE_LABELS[type]} />
            </div>

            {loadingData && <div className="py-4 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></div>}

            {!loadingData && type === 'material_board' && (
              <div>
                <Label className="text-xs">Products to feature ({productIds.length}/8)</Label>
                <div className="mt-1 max-h-56 overflow-y-auto space-y-1 rounded-md border border-border p-1">
                  {items.filter((i) => i.product_id).length === 0 && <p className="p-2 text-xs text-muted-foreground">No products in this moodboard.</p>}
                  {items.filter((i) => i.product_id).map((i) => (
                    <button key={i.id} onClick={() => toggle(productIds, setProductIds, i.product_id!, 8)}
                      className={`w-full flex items-center gap-2 text-left text-sm px-2 py-1.5 rounded ${productIds.includes(i.product_id!) ? 'bg-primary/10' : 'hover:bg-muted/50'}`}>
                      {i.image_url ? <img src={i.image_url} className="w-7 h-7 rounded object-cover" alt="" /> : <div className="w-7 h-7 rounded bg-muted" />}
                      <span className="flex-1 truncate">{i.name}</span>
                      {productIds.includes(i.product_id!) && <Check className="h-4 w-4 text-primary" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!loadingData && type === 'color_palette' && (
              <p className="text-xs text-muted-foreground">The palette is auto-extracted from this moodboard's images. You can refine the swatches after it's generated.</p>
            )}

            {!loadingData && type === 'concept_board' && (
              <div>
                <Label className="text-xs">Images ({imageUrls.length}/6)</Label>
                <div className="mt-1 grid grid-cols-4 gap-2 max-h-56 overflow-y-auto">
                  {items.filter((i) => i.image_url).map((i) => (
                    <button key={i.id} onClick={() => toggle(imageUrls, setImageUrls, i.image_url!, 6)}
                      className={`relative aspect-square rounded overflow-hidden border-2 ${imageUrls.includes(i.image_url!) ? 'border-primary' : 'border-transparent'}`}>
                      <img src={i.image_url!} className="w-full h-full object-cover" alt="" />
                      {imageUrls.includes(i.image_url!) && <span className="absolute top-0.5 right-0.5 bg-primary rounded-full p-0.5"><Check className="h-3 w-3 text-primary-foreground" /></span>}
                    </button>
                  ))}
                </div>
                {items.filter((i) => i.image_url).length === 0 && <p className="text-xs text-muted-foreground">No images in this moodboard.</p>}
              </div>
            )}

            {!loadingData && type === 'ffe_schedule' && (
              <div>
                <Label className="text-xs">Quote</Label>
                <Select value={quoteId} onValueChange={setQuoteId}>
                  <SelectTrigger><SelectValue placeholder="Pick a quote…" /></SelectTrigger>
                  <SelectContent>{quotes.map((q) => <SelectItem key={q.id} value={q.id}>{q.label}</SelectItem>)}</SelectContent>
                </Select>
                {quotes.length === 0 && <p className="text-xs text-muted-foreground mt-1">No quotes found.</p>}
              </div>
            )}

            {!loadingData && type === 'area_breakdown' && (
              <div className="space-y-2">
                <ImagePick label="Hero render" value={heroUrl} onChange={setHeroUrl} items={items} onUpload={uploadImage} />
                <ImagePick label="Dimensioned plan (optional)" value={planUrl} onChange={setPlanUrl} items={items} onUpload={uploadImage} />
                <ImagePick label="Elevation (optional)" value={elevationUrl} onChange={setElevationUrl} items={items} onUpload={uploadImage} />
                <div><Label className="text-xs">Subtitle (optional)</Label><Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="e.g. Modern Bathroom Design" /></div>
              </div>
            )}

            {!loadingData && (type === 'lighting_plan' || type === 'plumbing_plan' || type === 'electrical_plan') && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant={backdropKind === 'upload' ? 'default' : 'outline'} onClick={() => setBackdropKind('upload')}>Floor-plan image</Button>
                  <Button type="button" size="sm" variant={backdropKind === 'rect' ? 'default' : 'outline'} onClick={() => setBackdropKind('rect')}>Blank room (mm)</Button>
                </div>
                {backdropKind === 'upload'
                  ? <ImagePick label="Floor plan" value={backdropUrl} onChange={setBackdropUrl} items={items} onUpload={uploadImage} />
                  : <div className="grid grid-cols-2 gap-2">
                      <div><Label className="text-xs">Width (mm)</Label><Input type="number" value={rectW} onChange={(e) => setRectW(e.target.value)} placeholder="e.g. 3000" /></div>
                      <div><Label className="text-xs">Height (mm)</Label><Input type="number" value={rectH} onChange={(e) => setRectH(e.target.value)} placeholder="e.g. 2400" /></div>
                    </div>}
                <p className="text-[11px] text-muted-foreground">You'll place the symbols on the canvas after this.</p>
              </div>
            )}

            {!loadingData && type === 'annotated_render' && (
              <div className="space-y-1">
                <ImagePick label="Render to annotate" value={backdropUrl} onChange={setBackdropUrl} items={items} onUpload={uploadImage} />
                <p className="text-[11px] text-muted-foreground">Callouts are auto-detected, then you refine them on the canvas.</p>
              </div>
            )}

            {!loadingData && type === 'elevation_render_pair' && (
              <div className="space-y-1">
                <ImagePick label="Elevation image" value={elevationUrl} onChange={setElevationUrl} items={items} onUpload={uploadImage} />
                <p className="text-[11px] text-muted-foreground">You'll add dimensions + tile callouts on the canvas.</p>
              </div>
            )}

            {!loadingData && type === 'full_deck' && (
              <div>
                <Label className="text-xs">Sheets to include ({includedSheetIds.length})</Label>
                <div className="mt-1 max-h-56 overflow-y-auto space-y-1 rounded-md border border-border p-1">
                  {existingSheets.length === 0 && <p className="p-2 text-xs text-muted-foreground">No other sheets on this moodboard yet — create some first.</p>}
                  {existingSheets.map((s) => (
                    <button key={s.id} onClick={() => toggle(includedSheetIds, setIncludedSheetIds, s.id)}
                      className={`w-full flex items-center gap-2 text-left text-sm px-2 py-1.5 rounded ${includedSheetIds.includes(s.id) ? 'bg-primary/10' : 'hover:bg-muted/50'}`}>
                      <span className="flex-1 truncate">{s.label}</span>
                      {includedSheetIds.includes(s.id) && <Check className="h-4 w-4 text-primary" />}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">You can reorder + add a cover on the canvas after this.</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {step !== 'details' ? (
            <Button onClick={() => setStepIdx((i) => i + 1)} disabled={!canNext}>Next</Button>
          ) : (
            <Button onClick={submit} disabled={submitting || !moodboardId || !type}>
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Generate{credits > 0 ? ` (${credits} cr)` : ''}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Pick an image from the moodboard's items or upload a new one. */
const ImagePick: React.FC<{
  label: string;
  value: string;
  onChange: (url: string) => void;
  items: Item[];
  onUpload: (file: File) => Promise<string | null>;
}> = ({ label, value, onChange, items, onUpload }) => {
  const [uploading, setUploading] = useState(false);
  const withImages = items.filter((i) => i.image_url);
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      {value && <img src={value} className="mt-1 max-h-32 rounded border border-border object-contain" alt="" />}
      <div className="mt-1 grid grid-cols-5 gap-1.5">
        {withImages.map((i) => (
          <button key={i.id} onClick={() => onChange(i.image_url!)} aria-label={`Use image ${i.id}`}
            className={`relative aspect-square rounded overflow-hidden border-2 ${value === i.image_url ? 'border-primary' : 'border-transparent'}`}>
            <img src={i.image_url!} className="w-full h-full object-cover" alt="" />
          </button>
        ))}
        <label className="aspect-square rounded border border-dashed border-border flex items-center justify-center cursor-pointer hover:bg-muted/50 text-muted-foreground">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return;
            setUploading(true);
            const url = await onUpload(f);
            setUploading(false);
            if (url) onChange(url);
          }} />
        </label>
      </div>
    </div>
  );
};

export default SheetWizardModal;
