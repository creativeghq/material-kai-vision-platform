import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileDown, FileText, Printer, Wrench } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { AssemblySheets } from '@/components/features/scenestudio/AssemblyDrawings';
import { KitchenDrawings, type CutLine } from '@/components/features/scenestudio/KitchenDrawings';
import { useToast } from '@/hooks/use-toast';
import type { DrawRun } from '@/lib/scene/kitchenDrawings';
import { cabinetAssemblies, DEFAULT_CONSTRUCTION, type BoardSlot } from '@/lib/scene/cabinetPanels';
import { KITCHEN_KINDS, assemblyPiecesOf, drawingChecks } from '@/lib/scene/kitchenComposition';
import { projectPlansService } from '@/services/projectPlansService';
import { publicUrl, sceneStudioService, type SceneData, type SceneObject } from '@/services/sceneStudioService';

const PRINT_CLASS = 'print-kitchen-drawings';

export interface DrawingSetSaved { sheet_id: string | null; title: string; project_id: string | null; pdf_path: string; page_count: number; set?: 'drawings' | 'assembly' }

const WORKTOP_MM = 40;

export async function sheetsToPdf(root: HTMLElement): Promise<{ pdf: Blob; pages: number }> {
  const svgs = [...root.querySelectorAll<SVGSVGElement>('.kitchen-sheet svg')];
  if (!svgs.length) throw new Error('There is nothing to draw yet.');
  const [{ jsPDF }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  for (let i = 0; i < svgs.length; i++) {
    if (i) doc.addPage('a4', 'landscape');
    await doc.svg(svgs[i], { x: 0, y: 0, width: 297, height: 210 });
  }
  return { pdf: doc.output('blob'), pages: svgs.length };
}

export const KitchenDrawingsDialog: React.FC<{
  open: boolean;
  onOpenChange(open: boolean): void;
  data: SceneData;
  objects: SceneObject[];
  autoSave?: boolean;
  onSaved?(saved: DrawingSetSaved): void;
  set?: 'drawings' | 'assembly';
  onSetChange?(set: 'drawings' | 'assembly'): void;
}> = ({ open, onOpenChange, data, objects, autoSave = false, onSaved, set = 'drawings', onSetChange }) => {
  const { toast } = useToast();
  const [lines, setLines] = useState<CutLine[]>([]);
  const [linesReady, setLinesReady] = useState(false);
  const [company, setCompany] = useState('');
  const [saving, setSaving] = useState(false);
  const sheetRoot = useRef<HTMLDivElement>(null);
  const autoSaved = useRef(false);
  const planId = data.scene.project_plan_id;
  useEffect(() => {
    let live = true;
    setLinesReady(false);
    if (!open || !planId) { setLines([]); setLinesReady(open); return; }
    void projectPlansService.listItems(planId)
      .then((items) => { if (live) setLines(items.filter((i) => i.kind === 'task' && i.is_schedule && Number(i.quantity) > 0).map((i) => ({ label: i.label, quantity: Number(i.quantity), unit: i.unit }))); })
      .catch(() => { if (live) setLines([]); })
      .finally(() => { if (live) setLinesReady(true); });
    return () => { live = false; };
  }, [open, planId]);
  useEffect(() => {
    if (!open) return;
    void sceneStudioService.businessName(data.scene.workspace_id).then(setCompany).catch(() => setCompany(''));
  }, [open, data.scene.workspace_id]);

  const toDraw = (o: SceneObject): DrawRun => ({
    id: o.id, label: o.label, kind: o.kind, x_mm: o.x_mm, y_mm: o.y_mm, rotation_deg: o.rotation_deg,
    width_mm: o.width_mm, depth_mm: o.depth_mm, height_mm: o.height_mm, elevation_mm: o.elevation_mm, kitchen_layout: o.kitchen_layout,
  });
  const live = useMemo(() => objects.filter((o) => !o.removed_at), [objects]);
  const runs = useMemo(() => live.filter((o) => KITCHEN_KINDS.has(o.kind)).map(toDraw), [live]);
  const furniture = useMemo(() => live.filter((o) => !KITCHEN_KINDS.has(o.kind)).map(toDraw), [live]);
  const drawable = data.walls.length > 0 || data.rooms.length > 0 || runs.length > 0;

  const assemblies = useMemo(() => {
    const boards = (objectId: string): Partial<Record<BoardSlot, string>> => {
      const out: Partial<Record<BoardSlot, string>> = {};
      for (const f of data.finishes.filter((x) => x.object_id === objectId)) {
        const name = f.decor_code ? [f.decor_brand, f.decor_code, f.decor_name].filter(Boolean).join(' ') : f.product_id ? data.products[f.product_id]?.name : f.colour_hex ? `Colour ${f.colour_hex}` : null;
        if (name && (f.slot === 'carcass' || f.slot === 'fronts' || f.slot === 'plinth')) out[f.slot] = name;
      }
      return out;
    };
    const build = { plinth_mm: DEFAULT_CONSTRUCTION.plinth_mm, front_mm: DEFAULT_CONSTRUCTION.front_mm, worktop_mm: WORKTOP_MM };
    return cabinetAssemblies(runs.flatMap((r) => assemblyPiecesOf(r, build).map((p) => ({ ...p, boards: boards(r.id) }))));
  }, [runs, data.finishes, data.products]);
  const assemblyView = set === 'assembly' && runs.length > 0;
  const checks = useMemo(() => drawingChecks(runs.map((r) => ({ ...r, kitchen_layout: r.kitchen_layout ?? null }))), [runs]);
  const src = data.scene.source_storage_path;
  const sourceUrl = src && !src.endsWith('.pdf') && data.scene.source_kind === 'plan_image' ? publicUrl(src) : null;
  const sheets = assemblyView ? <AssemblySheets assemblies={assemblies} project={data.scene.name} company={company} /> : (
    <KitchenDrawings
      project={data.scene.name} company={company} rooms={data.rooms} walls={data.walls} openings={data.openings} runs={runs} furniture={furniture} lines={lines}
      notes={data.scene.extract_notes?.assumptions ?? []} sourceUrl={sourceUrl} checks={checks}
    />
  );
  const print = () => {
    document.body.classList.add(PRINT_CLASS);
    const done = () => { document.body.classList.remove(PRINT_CLASS); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  };

  const save = async () => {
    if (!sheetRoot.current || saving) return;
    setSaving(true);
    try {
      const { pdf, pages } = await sheetsToPdf(sheetRoot.current);
      const saved = await sceneStudioService.saveDrawingSet(data.scene, pdf, pages, assemblyView ? 'assembly' : 'drawings');
      onSaved?.({ ...saved, page_count: pages, set: assemblyView ? 'assembly' : 'drawings' });
      toast({ title: assemblyView ? 'Assembly sheets saved' : 'Drawings saved', description: assemblyView ? `${pages} ${pages === 1 ? 'sheet' : 'sheets'} saved as a PDF in the conversation.` : saved.project_id ? `${pages} ${pages === 1 ? 'sheet' : 'sheets'} on the project, ready for the client view and the deck.` : `${pages} ${pages === 1 ? 'sheet' : 'sheets'} saved as a PDF in the conversation.` });
    } catch (e) {
      toast({ title: 'The drawings could not be saved', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!open) { autoSaved.current = false; return; }
    if (!autoSave || autoSaved.current || !linesReady || !drawable || (set === 'assembly' && !assemblies.length)) return;
    autoSaved.current = true;
    const t = setTimeout(() => void save(), 400);
    return () => clearTimeout(t);
  }, [open, autoSave, linesReady, drawable, set, assemblies.length]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{assemblyView ? 'Workshop Assembly' : 'Drawings'}</DialogTitle>
            <DialogDescription>{assemblyView ? `One sheet per distinct cabinet (${assemblies.length}): an exploded view with numbered parts, the panel list with sizes and edge banding, the hardware, and the checks before cutting. Built from the same panels as the 3D room and the cut list.` : <>
              Floor plan with wall lengths, room areas and furniture{runs.length ? `, an elevation and a services sheet (sockets, water, waste, gas, extraction) per kitchen wall and the cut list${planId ? '' : ' (price the kitchen to add it)'}, from the same units as the 3D room and the price` : ''}.
              {data.scene.project_id ? '' : ' The room is on no project, so saving puts the PDF in the conversation.'}
            </>}</DialogDescription>

          </DialogHeader>
          <div ref={sheetRoot} className="rounded-sm border border-hairline bg-surface-sunken p-3">{sheets}</div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            {runs.length > 0 && onSetChange && (
              <Button variant="outline" className="gap-1.5" onClick={() => onSetChange(assemblyView ? 'drawings' : 'assembly')}>
                {assemblyView ? <FileText className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}{assemblyView ? 'Drawing set' : 'Workshop assembly'}
              </Button>
            )}
            <Button variant="outline" className="gap-1.5" onClick={print} disabled={!drawable}><Printer className="h-4 w-4" />Print</Button>
            <Button className="gap-1.5" onClick={() => void save()} disabled={!drawable || saving}><FileDown className="h-4 w-4" />{saving ? 'Saving…' : data.scene.project_id && !assemblyView ? 'Save to project' : 'Save as PDF'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {open && createPortal(<div className="kitchen-drawings-print">{sheets}</div>, document.body)}
    </>
  );
};
