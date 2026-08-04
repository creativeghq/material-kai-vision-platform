import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileImage, Loader2, ArrowRight, Palette, Plus, Ruler } from 'lucide-react';

import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { SheetWizardModal } from '@/components/features/sheets/SheetWizardModal';
import { projectsService } from '../../services/projectsService';
import { humanizeLabel } from '@/utils/humanize';
import { statusTone } from '@/utils/statusTone';

interface SheetsTabProps {
  projectId: string;
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

export const SheetsTab: React.FC<SheetsTabProps> = ({ projectId }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);

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
    <li className="p-3 flex items-center gap-3 hover:bg-muted/40 transition-colors">
      <FileImage className="h-4 w-4 text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {s.title || SHEET_TYPE_LABEL[s.sheet_type] || s.sheet_type}
        </p>
        <p className="text-xs text-muted-foreground">
          {SHEET_TYPE_LABEL[s.sheet_type] || s.sheet_type} ·
          Created {new Date(s.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
        </p>
      </div>
      <span className={`text-xs capitalize ${statusTone(s.status)}`}>{humanizeLabel(s.status)}</span>
      {s.pdf_storage_path && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
    </li>
  );

  const NewPlanButton = () => (
    <Button size="sm" className="gap-2" onClick={() => setWizardOpen(true)}>
      <Plus className="h-4 w-4" />
      New technical plan
    </Button>
  );

  const wizard = (
    <SheetWizardModal
      open={wizardOpen}
      onClose={() => setWizardOpen(false)}
      presetProjectId={projectId}
      onCreated={() => { setWizardOpen(false); void load(); }}
    />
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
        <Card className="dashboard-card">
          <CardContent className="py-12 text-center">
            <FileImage className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-3">No sheets yet.</p>
            <p className="text-xs text-muted-foreground mb-4 max-w-md mx-auto">
              Technical plans — electrical, plumbing, lighting — belong to the project and can be
              created here. Presentation sheets are made inside a moodboard and roll up automatically.
            </p>
            <NewPlanButton />
          </CardContent>
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
          <div className="px-4 py-2 border-b border-white/8 flex items-center gap-2">
            <Ruler className="h-3.5 w-3.5 text-primary" />
            <span className="text-sm font-medium">Technical plans</span>
            <span className="text-xs text-muted-foreground ml-auto">
              {projectOwned.length} {projectOwned.length === 1 ? 'sheet' : 'sheets'}
            </span>
          </div>
          <CardContent className="p-0">
            <ul className="divide-y divide-white/8">
              {projectOwned.map(s => <SheetRow key={s.id} s={s} />)}
            </ul>
          </CardContent>
        </Card>
      )}

      {grouped.map(g => (
        <Card key={g.moodboard_id} className="dashboard-card">
          <div className="px-4 py-2 border-b border-white/8 flex items-center gap-2">
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
            <ul className="divide-y divide-white/8">
              {g.sheets.map(s => <SheetRow key={s.id} s={s} />)}
            </ul>
          </CardContent>
        </Card>
      ))}
      {wizard}
    </div>
  );
};
