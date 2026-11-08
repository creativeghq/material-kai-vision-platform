import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileImage, Loader2, ExternalLink, Palette, Pencil, Plus, Ruler } from 'lucide-react';

import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { SheetWizardModal } from '@/components/features/sheets/SheetWizardModal';
import { formatDate } from '@/utils/datetime';
import { SheetCanvasCard } from '@/components/features/sheets/SheetCanvasCard';
import {
  moodboardSheetsService,
  INTERACTIVE_SHEET_TYPES,
  SHEET_TYPE_LABELS,
  type PresentationSheet,
  type SheetType,
} from '@/services/moodboardSheetsService';
import { projectsService } from '../../services/projectsService';
import { goToSectionLabel, projectSectionPath } from '../../projectSections';
import { humanizeLabel } from '@/utils/humanize';
import { statusTone } from '@/utils/statusTone';
import { HubEmptyState } from '@/components/core/hub';
import { openSignedPdf } from './openSignedPdf';

interface SheetsTabProps {
  projectId: string;
  /** Collaborators can read sheets (RLS) but not insert one, so they get no create actions. */
  isOwner?: boolean;
}

type Sheet = Awaited<ReturnType<typeof projectsService.listProjectSheets>>[number];

const typeLabel = (t: string) => SHEET_TYPE_LABELS[t as SheetType] ?? humanizeLabel(t);
const isInteractive = (s: Sheet) => INTERACTIVE_SHEET_TYPES.has(s.sheet_type as SheetType);

const SheetRow: React.FC<{
  s: Sheet;
  busy: boolean;
  onOpenPdf: (s: Sheet) => void;
  /** Null for a collaborator: the canvas edits and renders, which only the team may do. */
  onOpenCanvas: ((id: string) => void) | null;
}> = ({ s, busy, onOpenPdf, onOpenCanvas }) => {
  const hasPdf = !!s.pdf_storage_path;
  const primary = hasPdf ? () => onOpenPdf(s) : isInteractive(s) && onOpenCanvas ? () => onOpenCanvas(s.id) : null;
  return (
    <li
      className={`p-3 flex items-center gap-3 transition-colors ${primary ? 'hover:bg-muted/40 cursor-pointer' : ''}`}
      role={primary ? 'button' : undefined}
      tabIndex={primary ? 0 : undefined}
      aria-label={primary ? `${hasPdf ? 'Open PDF of' : 'Finish'} ${s.title || typeLabel(s.sheet_type)}` : undefined}
      onClick={primary ?? undefined}
      onKeyDown={primary ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); primary(); }
      } : undefined}
    >
      <FileImage className="h-4 w-4 text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{s.title || typeLabel(s.sheet_type)}</p>
        <p className="text-xs text-muted-foreground">
          {typeLabel(s.sheet_type)} · Created {formatDate(s.created_at)}
        </p>
      </div>
      <span className={`text-xs ${statusTone(s.status)}`}>{humanizeLabel(s.status)}</span>
      {hasPdf && isInteractive(s) && onOpenCanvas && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          onClick={(e) => { e.stopPropagation(); onOpenCanvas(s.id); }}
        >
          <Pencil className="h-3.5 w-3.5 mr-1" /> Canvas
        </Button>
      )}
      {busy
        ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        : hasPdf && <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
    </li>
  );
};

export const SheetsTab: React.FC<SheetsTabProps> = ({ projectId, isOwner = true }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [canvasSheet, setCanvasSheet] = useState<PresentationSheet | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setSheets(await projectsService.listProjectSheets(projectId));
    } catch (_err) {
      toast({ title: 'Failed to load sheets', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => { void load(); }, [load]);

  // Technical plans belong to the project itself, not to any moodboard.
  const projectOwned = useMemo(() => sheets.filter(s => !s.moodboard_id), [sheets]);

  const grouped = useMemo(() => {
    const m = new Map<string, { moodboard_id: string; moodboard_title: string | null; sheets: Sheet[] }>();
    for (const s of sheets) {
      if (!s.moodboard_id) continue;
      if (!m.has(s.moodboard_id)) m.set(s.moodboard_id, { moodboard_id: s.moodboard_id, moodboard_title: s.moodboard_title, sheets: [] });
      m.get(s.moodboard_id)!.sheets.push(s);
    }
    return Array.from(m.values());
  }, [sheets]);

  // Interactive types are created as a DRAFT and finished on the canvas; without this the
  // credits are debited and the plan cannot be drawn.
  const openCanvas = useCallback(async (sheetId: string) => {
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
  }, [toast]);

  const openPdf = useCallback(async (s: Sheet) => {
    setOpeningId(s.id);
    try {
      const opened = await openSignedPdf(() => moodboardSheetsService.refreshPdfUrl(s.id));
      if (!opened) toast({ title: 'The PDF is not available', description: 'Regenerate the sheet to rebuild it.', variant: 'destructive' });
    } catch (err) {
      toast({ title: 'Could not open the PDF', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setOpeningId(null);
    }
  }, [toast]);

  const rowProps = {
    onOpenPdf: (s: Sheet) => void openPdf(s),
    onOpenCanvas: isOwner ? (id: string) => void openCanvas(id) : null,
  };

  const newPlanButton = isOwner ? (
    <Button size="sm" className="gap-2" onClick={() => setWizardOpen(true)}>
      <Plus className="h-4 w-4" />
      New technical plan
    </Button>
  ) : null;

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
            <DialogTitle>{canvasSheet ? typeLabel(canvasSheet.sheet_type) : 'Sheet'}</DialogTitle>
            <DialogDescription className="sr-only">Finish this sheet on the canvas.</DialogDescription>
          </DialogHeader>
          {canvasSheet && (
            <SheetCanvasCard
              sheetId={canvasSheet.id}
              sheetType={canvasSheet.sheet_type}
              // Only the deck builder reads this, and a deck is never project-owned.
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
            description={isOwner
              ? 'Draw a technical plan (electrical, plumbing, lighting) here, or open a moodboard to make material boards and presentation decks. Both appear in this list.'
              : 'Technical plans and presentation sheets appear here once the project team makes them.'}
            action={isOwner ? (
              <div className="flex flex-wrap justify-center gap-2">
                {newPlanButton}
                <Button size="sm" variant="outline" className="gap-2" onClick={() => navigate(projectSectionPath(projectId, 'moodboards'))}>
                  <Palette className="h-4 w-4" />
                  {goToSectionLabel('moodboards')}
                </Button>
              </div>
            ) : undefined}
          />
        </Card>
        {wizard}
      </>
    );
  }

  return (
    <div className="space-y-4">
      {newPlanButton && <div className="flex justify-end">{newPlanButton}</div>}

      {projectOwned.length > 0 && (
        <Card className="dashboard-card">
          <div className="px-4 py-2 border-b border-hairline flex items-center gap-2">
            <Ruler className="h-3.5 w-3.5 text-primary" />
            <span className="text-sm font-medium">Technical Plans</span>
            <span className="text-xs text-muted-foreground ml-auto">
              {projectOwned.length} {projectOwned.length === 1 ? 'sheet' : 'sheets'}
            </span>
          </div>
          <CardContent className="p-0">
            <ul className="divide-y divide-hairline">
              {projectOwned.map(s => <SheetRow key={s.id} s={s} busy={openingId === s.id} {...rowProps} />)}
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
              {g.sheets.map(s => <SheetRow key={s.id} s={s} busy={openingId === s.id} {...rowProps} />)}
            </ul>
          </CardContent>
        </Card>
      ))}
      {wizard}
    </div>
  );
};
