/**
 * Profile → Document Templates: the per-workspace PDF design used by EVERY generated
 * PDF (quotes, catalogs, proformas, invoices, statements). Owner-managed, workspace-
 * scoped. Uploads are free-form (any image you want) — no hardcoded filenames.
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
import { useToast } from '@/hooks/use-toast';

type Slot = 'cover' | 'background' | 'backcover';
const SLOT_COL: Record<Slot, 'cover_path' | 'background_path' | 'backcover_path'> = {
  cover: 'cover_path', background: 'background_path', backcover: 'backcover_path',
};
const SLOTS: Array<{ slot: Slot; label: string; hint: string }> = [
  { slot: 'cover', label: 'Cover', hint: 'First page. Its dimensions set the PDF page size.' },
  { slot: 'background', label: 'Background', hint: 'Full-page background behind the item pages.' },
  { slot: 'backcover', label: 'Back cover', hint: 'Closing page.' },
];

interface TemplateRow {
  cover_path: string | null;
  background_path: string | null;
  backcover_path: string | null;
  cover_width: number | null;
  cover_height: number | null;
}

const BUCKET = 'quote-templates';

/** Read a File's pixel dimensions (best-effort). */
function readImageSize(file: File): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { resolve(null); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

export const WorkspacePdfTemplateCard: React.FC = () => {
  const { activeWorkspaceId } = useWorkspace();
  const { toast } = useToast();
  const [row, setRow] = useState<TemplateRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Slot | null>(null);
  const [previews, setPreviews] = useState<Partial<Record<Slot, string>>>({});
  const inputs = { cover: useRef<HTMLInputElement>(null), background: useRef<HTMLInputElement>(null), backcover: useRef<HTMLInputElement>(null) };

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from('workspace_pdf_templates')
      .select('cover_path, background_path, backcover_path, cover_width, cover_height')
      .eq('workspace_id', activeWorkspaceId)
      .maybeSingle();
    setRow((data as TemplateRow) ?? { cover_path: null, background_path: null, backcover_path: null, cover_width: null, cover_height: null });
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
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const path = `${activeWorkspaceId}/pdf-${slot}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      const patch: Record<string, unknown> = { workspace_id: activeWorkspaceId, [SLOT_COL[slot]]: path, updated_at: new Date().toISOString() };
      if (slot === 'cover') {
        const size = await readImageSize(file);
        patch.cover_width = size?.w ?? null;
        patch.cover_height = size?.h ?? null;
      }
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
              The branded design used by every PDF this workspace generates — quotes, catalogs,
              proformas, invoices and statements. Upload any image; the cover's size sets the page size.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {SLOTS.map(({ slot, label, hint }) => {
              const url = previews[slot];
              const isBusy = busy === slot;
              return (
                <div key={slot} className="rounded-lg border border-border/60 p-3 space-y-2">
                  <div className="text-xs font-medium">{label}</div>
                  <div className="aspect-[3/4] w-full overflow-hidden rounded border border-dashed border-border/60 bg-muted/30 flex items-center justify-center">
                    {url ? (
                      <img src={url} alt={label} className="h-full w-full object-contain" />
                    ) : (
                      <span className="text-[11px] text-muted-foreground px-2 text-center">No image</span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">{hint}</p>
                  <input
                    ref={inputs[slot]}
                    type="file"
                    accept="image/png,image/jpeg"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onPick(slot, f); }}
                  />
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" className="flex-1 rounded-full h-8" disabled={isBusy} onClick={() => inputs[slot].current?.click()}>
                      {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                      {url ? 'Replace' : 'Upload'}
                    </Button>
                    {url && (
                      <Button size="sm" variant="ghost" className="rounded-full h-8 w-8 p-0 text-muted-foreground hover:text-destructive" disabled={isBusy} onClick={() => onClear(slot)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {row?.cover_width && row?.cover_height && (
          <p className="text-[11px] text-muted-foreground">Cover size: {row.cover_width}×{row.cover_height}px — PDFs use this aspect ratio.</p>
        )}
      </CardContent>
    </Card>
  );
};

export default WorkspacePdfTemplateCard;
