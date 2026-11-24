import React, { useRef, useState } from 'react';
import { FileDown } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { sheetsToPdf } from '@/components/features/scenestudio/KitchenDrawingsDialog';
import { TileSetOutSheets, type TileSetOutInput } from '@/components/features/scenestudio/TileDrawings';
import { useToast } from '@/hooks/use-toast';

const TileDrawingsDialog: React.FC<{ open: boolean; onOpenChange(open: boolean): void; input: TileSetOutInput; project: string }> = ({ open, onOpenChange, input, project }) => {
  const { toast } = useToast();
  const root = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const download = async () => {
    if (!root.current) return;
    setBusy(true);
    try {
      const { pdf } = await sheetsToPdf(root.current);
      const url = URL.createObjectURL(pdf);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'tiling'}-setting-out.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      toast({ title: 'The PDF could not be made', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tiling Setting Out</DialogTitle>
          <DialogDescription>Every tile and cut from the same layout as the quantities: the start lines, the edge piece on each wall, the cut schedule and the checks before laying.</DialogDescription>
        </DialogHeader>
        <div ref={root} className="rounded-sm border border-hairline bg-surface-sunken p-3">
          <TileSetOutSheets input={input} project={project} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button className="gap-1.5" disabled={busy} onClick={() => void download()}><FileDown className="h-4 w-4" />{busy ? 'Making the PDF…' : 'Download PDF'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TileDrawingsDialog;
