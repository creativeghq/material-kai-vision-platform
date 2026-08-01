/**
 * Profile → Document Templates: the per-workspace PDF design for the presentation/sales
 * documents (quotes, catalogs, proformas). Invoices + receipts are fiscal documents and
 * keep their own compliant design. Owner-managed, workspace-scoped. Uploads are free-form
 * (any image you want) — no hardcoded filenames.
 *
 * Backend: `workspace_pdf_templates` (workspace_id PK; cover/background/backcover paths
 * + cover dimensions). Files live in the private `quote-templates` bucket under the
 * workspace prefix. The shared PDF renderer (_shared/pdf/branding.ts) reads this row.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FileImage, Loader2, Trash2, Upload } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';

type Slot = 'cover' | 'intro' | 'background' | 'backcover';
const SLOT_COL: Record<Slot, 'cover_path' | 'intro_path' | 'background_path' | 'backcover_path'> = {
  cover: 'cover_path', intro: 'intro_path', background: 'background_path', backcover: 'backcover_path',
};
const SLOTS: Array<{ slot: Slot; label: string; hint: string }> = [
  { slot: 'cover', label: 'Cover', hint: 'Page 1. Its size sets the PDF page size & orientation.' },
  { slot: 'intro', label: 'Introduction', hint: 'Optional page 2 — leave empty for no intro page.' },
  { slot: 'background', label: 'Background', hint: 'Full-page background behind the item pages.' },
  { slot: 'backcover', label: 'Back cover', hint: 'Last page.' },
];

interface TemplateRow {
  cover_path: string | null;
  intro_path: string | null;
  background_path: string | null;
  backcover_path: string | null;
  cover_width: number | null;
  cover_height: number | null;
}

const BUCKET = 'quote-templates';

/**
 * Downscale + re-encode to JPEG before upload. Full-page template images are often huge
 * (e.g. 4200px photos); pdf-lib decodes PNGs fully into memory when embedding, which OOMs
 * the PDF worker. Capping the long edge (~2000px) as JPEG keeps the aspect ratio (so the
 * page size stays correct) while making the file tiny and cheap to embed.
 */
async function downscaleToJpeg(file: File, maxEdge = 2000): Promise<{ blob: Blob; w: number; h: number }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available');
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), 'image/jpeg', 0.85));
  if (!blob) throw new Error('Could not encode image');
  return { blob, w, h };
}

export const WorkspacePdfTemplateCard: React.FC = () => {
  const { activeWorkspaceId } = useWorkspace();
  const { toast } = useToast();
  const [row, setRow] = useState<TemplateRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Slot | null>(null);
  const [previews, setPreviews] = useState<Partial<Record<Slot, string>>>({});
  const [enlarged, setEnlarged] = useState<string | null>(null);
  const inputs = {
    cover: useRef<HTMLInputElement>(null),
    intro: useRef<HTMLInputElement>(null),
    background: useRef<HTMLInputElement>(null),
    backcover: useRef<HTMLInputElement>(null),
  };

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from('workspace_pdf_templates')
      .select('cover_path, intro_path, background_path, backcover_path, cover_width, cover_height')
      .eq('workspace_id', activeWorkspaceId)
      .maybeSingle();
    setRow((data as TemplateRow) ?? { cover_path: null, intro_path: null, background_path: null, backcover_path: null, cover_width: null, cover_height: null });
    // Sign preview URLs for whatever's set.
    const next: Partial<Record<Slot, string>> = {};
    for (const { slot } of SLOTS) {
      const path = (data as any)?.[SLOT_COL[slot]] as string | null;
      if (path) {
        const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 30);
        if (signed?.signedUrl) next[slot] = signed.signedUrl;
      }
    }
    setPreviews(next);
    setLoading(false);
  }, [activeWorkspaceId]);

  useEffect(() => { load(); }, [load]);

  const onPick = async (slot: Slot, file: File) => {
    if (!activeWorkspaceId) return;
    if (!/^image\/(png|jpe?g)$/.test(file.type)) {
      toast({ title: 'PNG or JPG only', variant: 'destructive' });
      return;
    }
    try {
      setBusy(slot);
      // Downscale + JPEG-encode before upload so large template photos don't OOM the PDF worker.
      const { blob, w, h } = await downscaleToJpeg(file);
      const path = `${activeWorkspaceId}/pdf-${slot}-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
      if (upErr) throw upErr;

      const patch: Record<string, unknown> = { workspace_id: activeWorkspaceId, [SLOT_COL[slot]]: path, updated_at: new Date().toISOString() };
      if (slot === 'cover') { patch.cover_width = w; patch.cover_height = h; }
      // Remove the previous file for this slot (best-effort) before repointing.
      const prev = row ? (row[SLOT_COL[slot]] as string | null) : null;
      const { error: dbErr } = await (supabase as any).from('workspace_pdf_templates').upsert(patch, { onConflict: 'workspace_id' });
      if (dbErr) throw dbErr;
      if (prev && prev !== path) await supabase.storage.from(BUCKET).remove([prev]).catch(() => {});

      toast({ title: `${SLOTS.find((s) => s.slot === slot)?.label} uploaded` });
      await load();
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e?.message ?? String(e), variant: 'destructive' });
    } finally {
      setBusy(slot);
      setBusy(null);
    }
  };

  const onClear = async (slot: Slot) => {
    if (!activeWorkspaceId) return;
    try {
      setBusy(slot);
      const prev = row ? (row[SLOT_COL[slot]] as string | null) : null;
      const patch: Record<string, unknown> = { workspace_id: activeWorkspaceId, [SLOT_COL[slot]]: null, updated_at: new Date().toISOString() };
      if (slot === 'cover') { patch.cover_width = null; patch.cover_height = null; }
      await (supabase as any).from('workspace_pdf_templates').upsert(patch, { onConflict: 'workspace_id' });
      if (prev) await supabase.storage.from(BUCKET).remove([prev]).catch(() => {});
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="dashboard-card">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <FileImage className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold">Document Templates</div>
            <p className="text-xs text-muted-foreground">
              The branded cover / background / back cover for your <strong>quotes, catalogs &amp; proformas</strong>.
              (Invoices and receipts are fiscal documents and keep their own design.) Upload any image; the cover's size sets the page size and orientation.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {SLOTS.map(({ slot, label, hint }) => {
              const url = previews[slot];
              const isBusy = busy === slot;
              const optional = slot === 'intro';
              return (
                <div key={slot} className="rounded-md border border-border/60 p-2 space-y-1.5">
                  <div className="text-[11px] font-medium flex items-center gap-1">
                    {label}{optional && <span className="text-[9px] text-muted-foreground font-normal">(optional)</span>}
                  </div>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => (url ? setEnlarged(url) : inputs[slot].current?.click())}
                    className="aspect-[3/4] w-full overflow-hidden rounded border border-dashed border-border/60 bg-muted/30 flex items-center justify-center group relative hover:border-primary/50 transition-colors"
                    title={url ? 'Click to enlarge' : 'Click to upload'}
                  >
                    {url ? (
                      <>
                        <img src={url} alt={label} className="h-full w-full object-contain" />
                        <span className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/30 text-[10px] text-white">Click to enlarge</span>
                      </>
                    ) : (
                      <span className="text-[10px] text-muted-foreground px-1 text-center flex flex-col items-center gap-1 group-hover:text-primary">
                        <Upload className="h-4 w-4 opacity-70" />
                        Click to upload
                      </span>
                    )}
                  </button>
                  <p className="text-[10px] text-muted-foreground leading-tight">{hint}</p>
                  <input
                    ref={inputs[slot]}
                    type="file"
                    accept="image/png,image/jpeg"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onPick(slot, f); }}
                  />
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="flex-1 rounded-full h-7 text-[11px] px-2" disabled={isBusy} onClick={() => inputs[slot].current?.click()}>
                      {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
                      {url ? 'Replace' : 'Upload'}
                    </Button>
                    {url && (
                      <Button size="sm" variant="ghost" className="rounded-full h-7 w-7 p-0 text-muted-foreground hover:text-destructive" disabled={isBusy} onClick={() => onClear(slot)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {row?.cover_width && row?.cover_height && (
          <p className="text-[11px] text-muted-foreground">Cover size: {row.cover_width}×{row.cover_height}px — PDFs use this aspect ratio &amp; orientation.</p>
        )}

        <Dialog open={!!enlarged} onOpenChange={(o) => !o && setEnlarged(null)}>
          <DialogContent className="max-w-4xl p-2 bg-transparent border-0 shadow-none">
            {/* sr-only because the design has no room for a visible heading. Radix logs a runtime
                warning without one and, more importantly, a screen reader announces the dialog with
                no name at all. (audit #302 finding 5) */}
            <DialogTitle className="sr-only">Template preview</DialogTitle>
            {enlarged && <img src={enlarged} alt="Template preview" className="w-full h-auto max-h-[85vh] object-contain rounded-md" />}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default WorkspacePdfTemplateCard;
