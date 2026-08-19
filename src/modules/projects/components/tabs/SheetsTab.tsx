import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileImage, Loader2, ArrowRight, Palette, Plus, Ruler } from 'lucide-react';

import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { SheetWizardModal } from '@/components/features/sheets/SheetWizardModal';
import { SheetCanvasCard } from '@/components/features/sheets/SheetCanvasCard';
import {
  moodboardSheetsService,
  INTERACTIVE_SHEET_TYPES,
  type PresentationSheet,
  type SheetType,
} from '@/services/moodboardSheetsService';
import { projectsService } from '../../services/projectsService';
import { humanizeLabel } from '@/utils/humanize';
import { statusTone } from '@/utils/statusTone';
import { HubEmptyState } from '@/components/core/hub';

interface SheetsTabProps {
  projectId: string;
  /**
   * Collaborators can READ sheets (RLS grants it) but cannot insert one. Without
   * this they would see the create button, fill in the whole wizard, and hit an
   * opaque row-level-security failure at the end.
   */
  isOwner?: boolean;
}

const SHEET_TYPE_LABEL: Record<string, string> = {
  material_board: 'Material Board',
  color_palette: 'Color Palette',
  concept_board: 'Concept Board',
  lighting_plan: 'Lighting Plan',
  plumbing_plan: 'Plumbing Plan',
  electrical_plan: 'Electrical Plan',
  area_breakdown: 'Area Breakdown',
  annotated_render: 'Annotated Render',
  elevation_render_pair: 'Elevation / Render',
  ffe_schedule: 'FF&E Schedule',
  full_deck: 'Full Deck',
};

type Sheet = Awaited<ReturnType<typeof projectsService.listProjectSheets>>[number];


export const SheetsTab: React.FC<SheetsTabProps> = ({ projectId, isOwner = true }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [canvasSheet, setCanvasSheet] = useState<PresentationSheet | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await projectsService.listProjectSheets(projectId);
      setSheets(data);
    } catch (_err) {
      toast({ title: 'Failed to load sheets', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => { load(); }, [load]);

  // Sheets owned by the project itself — technical plans, which are not the
  // output of any mood board and so have no group to sit under.
  const projectOwned = useMemo(() => sheets.filter(s => !s.moodboard_id), [sheets]);

  // The rest group by moodboard, one row per source board.
  const grouped = useMemo(() => {
    const m = new Map<string, { moodboard_id: string; moodboard_title: string | null; sheets: Sheet[] }>();
    for (const s of sheets) {
      if (!s.moodboard_id) continue;
      if (!m.has(s.moodboard_id)) m.set(s.moodboard_id, { moodboard_id: s.moodboard_id, moodboard_title: s.moodboard_title, sheets: [] });
      m.get(s.moodboard_id)!.sheets.push(s);
    }
    return Array.from(m.values());
  }, [sheets]);

  const SheetRow: React.FC<{ s: Sheet }> = ({ s }) => (
    <li
      className="p-3 flex items-center gap-3 hover:bg-muted/40 transition-colors cursor-pointer"
      role="button"
      tabIndex={0}
      onClick={() => { if (INTERACTIVE_SHEET_TYPES.has(s.sheet_type as SheetType)) void openCanvas(s.id); }}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && INTERACTIVE_SHEET_TYPES.has(s.sheet_type as SheetType)) {
          e.preventDefault();
          void openCanvas(s.id);
        }
      }}
    >
      <FileImage className="h-4 w-4 text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {s.title || SHEET_TYPE_LABEL[s.sheet_type] || s.sheet_type}
        </p>
        <p className="text-xs text-muted-foreground">
          {SHEET_TYPE_LABEL[s.sheet_type] || s.sheet_type} ·
          Created {new Date(s.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
        </p>
      </div>
      <span className={`text-xs capitalize ${statusTone(s.status)}`}>{humanizeLabel(s.status)}</span>
      {s.pdf_storage_path && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
    </li>
  );

  const NewPlanButton = () => (
    isOwner ? (
      <Button size="sm" className="gap-2" onClick={() => setWizardOpen(true)}>
        <Plus className="h-4 w-4" />
        New technical plan
      </Button>
    ) : null
  );

  // Interactive types are created as a DRAFT and finished on the canvas. Without
  // this the credits are debited and the user is left with a plan they cannot
  // draw — the paid-but-stuck flow the moodboard tab already had to fix once.
  const openCanvas = async (sheetId: string) => {
    try {
      const sheet = await moodboardSheetsService.get(sheetId);
      if (sheet) setCanvasSheet(sheet);
      else toast({ title: 'Sheet not found', variant: 'destructive' });
    } catch (err) {
      toast({
        title: 'Could not open the canvas',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    }
  };

  const wizard = (
    <>
      <SheetWizardModal
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        presetProjectId={projectId}
        onCreated={(res) => {
          setWizardOpen(false);
          void load();
          if (res.is_interactive) {
            toast({ title: 'Draft created', description: 'Finishing it in the canvas…' });
            void openCanvas(res.sheet_id);
          }
        }}
      />

      <Dialog open={!!canvasSheet} onOpenChange={(o) => { if (!o) { setCanvasSheet(null); void load(); } }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{canvasSheet ? (SHEET_TYPE_LABEL[canvasSheet.sheet_type] ?? 'Sheet') : 'Sheet'}</DialogTitle>
            <DialogDescription className="sr-only">Finish this sheet on the canvas.</DialogDescription>
          </DialogHeader>
          {canvasSheet && (
            <SheetCanvasCard
              sheetId={canvasSheet.id}
              sheetType={canvasSheet.sheet_type}
              // Project-owned plans have no moodboard; only the deck builder
              // reads this, and a deck is never project-owned.
              moodboardId={canvasSheet.moodboard_id ?? ''}
              initialData={canvasSheet.data ?? {}}
              title={canvasSheet.title}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (sheets.length === 0) {
    return (
      <>
        <Card>
          <HubEmptyState
            icon={FileImage}
            title="No sheets yet"
            description="Technical plans — electrical, plumbing, lighting — belong to the project and are created here. Presentation sheets are made inside a moodboard and roll up automatically."
            action={<NewPlanButton />}
          />
        </Card>
        {wizard}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <NewPlanButton />
      </div>

      {projectOwned.length > 0 && (
        <Card className="dashboard-card">
          <div className="px-4 py-2 border-b border-hairline flex items-center gap-2">
            <Ruler className="h-3.5 w-3.5 text-primary" />
            <span className="text-sm font-medium">Technical plans</span>
            <span className="text-xs text-muted-foreground ml-auto">
              {projectOwned.length} {projectOwned.length === 1 ? 'sheet' : 'sheets'}
            </span>
          </div>
          <CardContent className="p-0">
            <ul className="divide-y divide-hairline">
              {projectOwned.map(s => <SheetRow key={s.id} s={s} />)}
            </ul>
          </CardContent>
        </Card>
      )}

      {grouped.map(g => (
        <Card key={g.moodboard_id} className="dashboard-card">
          <div className="px-4 py-2 border-b border-hairline flex items-center gap-2">
            <Palette className="h-3.5 w-3.5 text-primary" />
            <button
              type="button"
              className="text-sm font-medium truncate hover:text-primary transition-colors"
              onClick={() => navigate(`/moodboard/${g.moodboard_id}`)}
            >
              {g.moodboard_title || `Moodboard #${g.moodboard_id.slice(0, 8)}`}
            </button>
            <span className="text-xs text-muted-foreground ml-auto">{g.sheets.length} {g.sheets.length === 1 ? 'sheet' : 'sheets'}</span>
          </div>
          <CardContent className="p-0">
            <ul className="divide-y divide-hairline">
              {g.sheets.map(s => <SheetRow key={s.id} s={s} />)}
            </ul>
          </CardContent>
        </Card>
      ))}
      {wizard}
    </div>
  );
};
