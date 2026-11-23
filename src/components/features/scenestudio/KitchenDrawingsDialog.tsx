import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { KitchenDrawings, type CutLine } from '@/components/features/scenestudio/KitchenDrawings';
import type { DrawRun } from '@/lib/scene/kitchenDrawings';
import { KITCHEN_KINDS } from '@/lib/scene/kitchenComposition';
import { projectPlansService } from '@/services/projectPlansService';
import type { SceneData, SceneObject } from '@/services/sceneStudioService';

const PRINT_CLASS = 'print-kitchen-drawings';

export const KitchenDrawingsDialog: React.FC<{
  open: boolean;
  onOpenChange(open: boolean): void;
  data: SceneData;
  objects: SceneObject[];
}> = ({ open, onOpenChange, data, objects }) => {
  const [lines, setLines] = useState<CutLine[]>([]);
  const planId = data.scene.project_plan_id;
  useEffect(() => {
    let live = true;
    if (!open || !planId) { setLines([]); return; }
    void projectPlansService.listItems(planId)
      .then((items) => { if (live) setLines(items.filter((i) => i.kind === 'task' && i.is_schedule && Number(i.quantity) > 0).map((i) => ({ label: i.label, quantity: Number(i.quantity), unit: i.unit }))); })
      .catch(() => { if (live) setLines([]); });
    return () => { live = false; };
  }, [open, planId]);

  const runs: DrawRun[] = useMemo(() => objects
    .filter((o) => !o.removed_at && KITCHEN_KINDS.has(o.kind))
    .map((o) => ({
      id: o.id, label: o.label, kind: o.kind, x_mm: o.x_mm, y_mm: o.y_mm, rotation_deg: o.rotation_deg,
      width_mm: o.width_mm, depth_mm: o.depth_mm, height_mm: o.height_mm, elevation_mm: o.elevation_mm, kitchen_layout: o.kitchen_layout,
    })), [objects]);

  const sheets = <KitchenDrawings project={data.scene.name} rooms={data.rooms} walls={data.walls} openings={data.openings} runs={runs} lines={lines} />;
  const print = () => {
    document.body.classList.add(PRINT_CLASS);
    const done = () => { document.body.classList.remove(PRINT_CLASS); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Kitchen Drawings</DialogTitle>
            <DialogDescription>
              Floor plan with dimensions, one elevation per wall and the cut list{planId ? '' : ' (price the kitchen to add it)'}, from the same units as the 3D room and the price.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-sm border border-hairline bg-surface-sunken p-3">{sheets}</div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            <Button className="gap-1.5" onClick={print} disabled={!runs.length}><Printer className="h-4 w-4" />Print</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {open && createPortal(<div className="kitchen-drawings-print">{sheets}</div>, document.body)}
    </>
  );
};
