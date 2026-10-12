import React, { useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { edgeErrorMessage } from '@/utils/edgeError';
import { fillImageSlot, imageSlots, removeImageSlot, type ImageSlot } from '@/services/seo/imageSlots';

/** The picture slots the writer left, each generated (credit-priced) or removed, then saved. */
export const ArticleImageSlots: React.FC<{
  markdown: string | null;
  workspaceId: string | null;
  onSave: (next: string) => Promise<{ ok: boolean; error?: string }>;
}> = ({ markdown, workspaceId, onSave }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const slots = imageSlots(markdown);
  if (!slots.length || !markdown) return null;

  const generate = async (slot: ImageSlot) => {
    setBusy(slot.line);
    try {
      const { data, error } = await supabase.functions.invoke('generate-social-image', {
        body: { prompt: slot.prompt, image_type: 'interior', aspect_ratio: '16:9', workspace_id: workspaceId, purpose: 'article' },
      });
      if (error) throw new Error(await edgeErrorMessage(error, 'Image not generated'));
      if (!data?.success || !data.image_url) throw new Error(data?.error || 'Image not generated');
      const saved = await onSave(fillImageSlot(markdown, slot, String(data.image_url)));
      if (!saved.ok) throw new Error(saved.error || 'The image was made but the article was not saved');
      toast({ title: 'Image added', description: `${data.credits_used ?? '?'} credits.` });
    } catch (e) {
      toast({ title: 'No image', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const remove = async (slot: ImageSlot) => {
    setBusy(slot.line);
    const saved = await onSave(removeImageSlot(markdown, slot));
    setBusy(null);
    if (!saved.ok) toast({ title: 'Not removed', description: saved.error, variant: 'destructive' });
  };

  return (
    <div className="mb-3 rounded-sm border border-hairline bg-card p-3">
      <p className="text-xs font-semibold">Picture slots ({slots.length})</p>
      <p className="mb-2 text-[11px] text-muted-foreground">
        The writer asked for a picture where none of your own photos fitted. Generate one, or remove the slot. An article with an
        empty slot is not published.
      </p>
      <div className="divide-y divide-hairline">
        {slots.map((s) => (
          <div key={s.line} className="flex flex-wrap items-center gap-2 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{s.alt}</div>
              <div className="truncate text-[11px] text-muted-foreground">{s.prompt}</div>
            </div>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => void generate(s)} disabled={!!busy}>
              {busy === s.line ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />} Generate
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void remove(s)} disabled={!!busy} title="Remove this slot">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};
