import React, { useEffect, useState } from 'react';
import { Plus, FileText, Loader2, Download, ExternalLink, Pencil, Trash2, AlertCircle, RotateCw, Copy, Share2, Check } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Card } from '@/components/core/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/core/ui/dropdown-menu';
import {
  moodboardSheetsService,
  type PresentationSheet,
  type SheetType,
  SHEET_TYPE_LABELS,
  SHEET_TYPE_CREDITS,
} from '@/services/moodboardSheetsService';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/core/ui/dialog';
import { SheetTypePreviewModal } from '@/components/features/sheets/SheetTypePreviewModal';
import { SheetWizardModal, type SheetWizardResult } from '@/components/features/sheets/SheetWizardModal';
import { SheetCanvasCard } from '@/components/features/sheets/SheetCanvasCard';

interface MoodboardSheetsTabProps {
  moodboardId: string;
  moodboardTitle: string;
}

const SHEET_TYPE_DESCRIPTIONS: Record<SheetType, string> = {
  material_board: 'Selected materials with descriptions and swatches',
  color_palette: 'Color palette extracted from your moodboard',
  concept_board: 'Inspiration collage with curated images',
  lighting_plan: 'Top-down floor plan with fixture symbols',
  plumbing_plan: 'Top-down plan with plumbing fixtures (WC, basin, bath, drains)',
  annotated_render: 'Render with AI-detected callouts',
  elevation_render_pair: 'Uploaded elevation with dimensions + render',
  ffe_schedule: 'Furniture, Fixtures & Equipment table',
  area_breakdown: 'Composited design board: hero render + plan + elevation + finishes',
  full_deck: 'Multi-page presentation deck assembling outputs from other tools',
};

// Sheet types finished on a drawing canvas (SheetCanvasCard) rather than up-front wizard inputs.
const INTERACTIVE_SHEET_TYPES = new Set<SheetType>(['annotated_render', 'elevation_render_pair', 'lighting_plan', 'plumbing_plan']);

const SHEET_GROUPS: { label: string; types: SheetType[] }[] = [
  { label: 'Boards', types: ['material_board', 'color_palette', 'concept_board', 'area_breakdown'] },
  { label: 'Plans', types: ['lighting_plan', 'plumbing_plan', 'annotated_render', 'elevation_render_pair'] },
  { label: 'Schedules', types: ['ffe_schedule'] },
  { label: 'Decks', types: ['full_deck'] },
];

export function MoodboardSheetsTab({ moodboardId, moodboardTitle }: MoodboardSheetsTabProps) {
  const { toast } = useToast();
  const [sheets, setSheets] = useState<PresentationSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [sharedTokenId, setSharedTokenId] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<SheetType | null>(null);
  // The guided creation wizard (replaces the seeded-chat handoff).
  const [wizardType, setWizardType] = useState<SheetType | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  // The in-tab canvas for interactive sheets — mounts SheetCanvasCard DIRECTLY so finishing a
  // paid draft is deterministic (was a prose /agent-hub prompt that only worked if the LLM
  // happened to call the sheet tool → paid-but-stuck when it didn't).
  const [canvasSheet, setCanvasSheet] = useState<PresentationSheet | null>(null);

  const openCanvas = async (sheetId: string) => {
    try {
      const sheet = await moodboardSheetsService.get(sheetId);
      if (sheet) setCanvasSheet(sheet);
      else toast({ title: 'Sheet not found', variant: 'destructive' });
    } catch (err) {
      toast({ title: 'Could not open the canvas', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    }
  };

  const reloadSheets = async () => {
    try {
      const list = await moodboardSheetsService.list(moodboardId);
      setSheets(list);
    } catch (err) {
      toast({ title: 'Could not load tools', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await moodboardSheetsService.list(moodboardId);
        if (!cancelled) setSheets(list);
      } catch (err) {
        toast({
          title: 'Could not load tools',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [moodboardId, toast]);

  // Step 1 — user picks a sheet type from the dropdown. We open a preview modal
  // so they can see what the sheet looks like + what the agent will ask for,
  // BEFORE we send them off to the chat.
  const openSheetPreview = (sheetType: SheetType) => {
    setPreviewType(sheetType);
  };

  // Step 2 — user clicks "Continue" in the preview modal. Open the guided wizard
  // (moodboard already known → it skips straight to the type-specific inputs).
  const launchWizardForSheet = (sheetType: SheetType) => {
    setPreviewType(null);
    setWizardType(sheetType);
    setWizardOpen(true);
  };

  // After a sheet is created: passive types are already rendered (show in list);
  // interactive types are a draft awaiting canvas input → open the canvas in KAI.
  const handleSheetCreated = (res: SheetWizardResult) => {
    void reloadSheets();
    if (res.is_interactive) {
      toast({ title: 'Draft created', description: 'Finishing it in the canvas…' });
      void openCanvas(res.sheet_id);
    } else {
      toast({ title: 'Sheet ready', description: `${res.title} generated${res.credits_charged ? ` · ${res.credits_charged} cr` : ''}.` });
    }
  };

  const handleDelete = async (sheet: PresentationSheet) => {
    if (!confirm(`Delete "${sheet.title}"? The PDF will be removed too.`)) return;
    setDeletingId(sheet.id);
    try {
      await moodboardSheetsService.remove(sheet.id);
      setSheets((arr) => arr.filter((s) => s.id !== sheet.id));
    } catch (err) {
      toast({
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleOpenPdf = async (sheet: PresentationSheet) => {
    // Always re-sign from pdf_storage_path — the persisted pdf_url is a 7-day signed
    // URL that 403s once expired (audit #217 H16). Fall back to the stored URL only
    // if re-signing yields nothing (e.g. legacy rows without a storage path).
    const url = (await moodboardSheetsService.refreshPdfUrl(sheet.id)) || sheet.pdf_url;
    if (url) window.open(url, '_blank');
    else {
      toast({
        title: 'No PDF available',
        description: 'This one hasn’t been rendered yet — open it in KAI to finish it.',
        variant: 'destructive',
      });
    }
  };

  const handleEdit = (sheet: PresentationSheet) => {
    // Interactive sheets edit in the in-tab canvas; passive sheets have no canvas — re-run the
    // wizard for them (their inputs are collected up-front, not drawn).
    if (INTERACTIVE_SHEET_TYPES.has(sheet.sheet_type)) void openCanvas(sheet.id);
    else { setWizardType(sheet.sheet_type); setWizardOpen(true); }
  };

  const handleRetry = async (sheet: PresentationSheet) => {
    setRetryingId(sheet.id);
    try {
      await moodboardSheetsService.retry(sheet.id);
      const list = await moodboardSheetsService.list(moodboardId);
      setSheets(list);
      toast({ title: 'Re-rendered', description: `${sheet.title} is ready.` });
    } catch (err) {
      toast({
        title: 'Retry failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setRetryingId(null);
    }
  };

  const handleDuplicate = async (sheet: PresentationSheet) => {
    setDuplicatingId(sheet.id);
    try {
      const dup = await moodboardSheetsService.duplicate(sheet.id);
      setSheets((arr) => [dup, ...arr]);
      toast({ title: 'Duplicated', description: `Created "${dup.title}". Open in KAI to render it.` });
    } catch (err) {
      toast({
        title: 'Duplicate failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleShare = async (sheet: PresentationSheet) => {
    try {
      const { url } = await moodboardSheetsService.share(sheet.id, 30);
      await navigator.clipboard.writeText(url);
      setSharedTokenId(sheet.id);
      setTimeout(() => setSharedTokenId(null), 2500);
      toast({
        title: 'Share link copied',
        description: 'A 30-day public link has been copied to your clipboard.',
      });
    } catch (err) {
      toast({
        title: 'Could not create share link',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4">
      <SheetTypePreviewModal
        open={previewType !== null}
        sheetType={previewType}
        onCancel={() => setPreviewType(null)}
        onContinue={launchWizardForSheet}
      />

      <SheetWizardModal
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        presetMoodboardId={moodboardId}
        presetMoodboardTitle={moodboardTitle}
        presetType={wizardType ?? undefined}
        onCreated={handleSheetCreated}
      />

      {/* Deterministic in-tab canvas for interactive sheets (no LLM round-trip). */}
      <Dialog open={!!canvasSheet} onOpenChange={(o) => { if (!o) { setCanvasSheet(null); void reloadSheets(); } }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{canvasSheet ? SHEET_TYPE_LABELS[canvasSheet.sheet_type] : 'Sheet'}</DialogTitle>
            <DialogDescription className="sr-only">Finish this sheet on the canvas.</DialogDescription>
          </DialogHeader>
          {canvasSheet && (
            <SheetCanvasCard
              sheetId={canvasSheet.id}
              sheetType={canvasSheet.sheet_type}
              moodboardId={moodboardId}
              initialData={canvasSheet.data ?? {}}
              title={canvasSheet.title}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* New Tool launcher */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-base font-semibold">Presentation Tools</h3>
          <p className="text-xs text-muted-foreground">
            Pick a tool to produce a client-ready deliverable from this moodboard. KAI walks you through the inputs.
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="rounded-full gap-2">
              <Plus className="h-4 w-4" />
              New Tool
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            side="bottom"
            avoidCollisions={false}
            className="w-72 max-h-[60vh] overflow-y-auto"
          >
            {SHEET_GROUPS.map((group, gi) => (
              <React.Fragment key={group.label}>
                {gi > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </DropdownMenuLabel>
                {group.types.map((t) => (
                  <DropdownMenuItem
                    key={t}
                    onClick={() => openSheetPreview(t)}
                    className="flex flex-col items-start gap-0.5 py-2"
                  >
                    <div className="flex items-center gap-2 w-full">
                      <span className="font-medium text-sm">{SHEET_TYPE_LABELS[t]}</span>
                      {SHEET_TYPE_CREDITS[t] > 0 && (
                        <span className="ml-auto text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                          {SHEET_TYPE_CREDITS[t]} cr
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {SHEET_TYPE_DESCRIPTIONS[t]}
                    </span>
                  </DropdownMenuItem>
                ))}
              </React.Fragment>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Sheet list */}
      {loading ? (
        <Card className="dashboard-card p-12 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </Card>
      ) : sheets.length === 0 ? (
        <Card className="dashboard-card p-12 text-center space-y-3">
          <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">Nothing here yet.</p>
          <p className="text-xs text-muted-foreground">
            Pick a <span className="text-foreground">New Tool</span> above to produce your first deliverable.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sheets.map((sheet) => (
            <Card key={sheet.id} className="dashboard-card p-4 space-y-2">
              <div className="flex items-start gap-2">
                <FileText className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{sheet.title}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {SHEET_TYPE_LABELS[sheet.sheet_type]}
                  </div>
                </div>
                <StatusBadge status={sheet.status} />
              </div>

              <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
                {sheet.page_count != null && (
                  <span>{sheet.page_count} page{sheet.page_count === 1 ? '' : 's'}</span>
                )}
                {sheet.credits_used > 0 && <span>· {sheet.credits_used} cr</span>}
                <span className="ml-auto">
                  {new Date(sheet.updated_at).toLocaleDateString()}
                </span>
              </div>

              {sheet.error_message && (
                <div className="text-[11px] text-red-400 flex items-start gap-1">
                  <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <span className="line-clamp-2">{sheet.error_message}</span>
                </div>
              )}

              <div className="flex items-center gap-0.5 pt-1 flex-wrap">
                {sheet.status === 'ready' && (
                  <>
                    <Button size="sm" variant="ghost" className="h-7 px-2 gap-1" onClick={() => handleOpenPdf(sheet)} title="Open PDF">
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span className="text-xs">Open</span>
                    </Button>
                    <Button
                      size="sm" variant="ghost" className="h-7 px-2 gap-1"
                      onClick={() => handleShare(sheet)}
                      title="Copy a public share link (30 days)"
                    >
                      {sharedTokenId === sheet.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Share2 className="h-3.5 w-3.5" />}
                      <span className="text-xs">Share</span>
                    </Button>
                  </>
                )}
                {sheet.status === 'failed' && (
                  <Button
                    size="sm" variant="ghost" className="h-7 px-2 gap-1"
                    onClick={() => handleRetry(sheet)}
                    disabled={retryingId === sheet.id}
                    title="Retry the render"
                  >
                    {retryingId === sheet.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                    <span className="text-xs">Retry</span>
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="h-7 px-2 gap-1" onClick={() => handleEdit(sheet)} title="Open in KAI to edit">
                  <Pencil className="h-3.5 w-3.5" />
                  <span className="text-xs">Edit</span>
                </Button>
                <Button
                  size="sm" variant="ghost" className="h-7 px-2 gap-1"
                  onClick={() => handleDuplicate(sheet)}
                  disabled={duplicatingId === sheet.id}
                  title="Duplicate as a draft"
                >
                  {duplicatingId === sheet.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 gap-1 ml-auto text-red-400 hover:text-red-300"
                  onClick={() => handleDelete(sheet)}
                  disabled={deletingId === sheet.id}
                  title="Delete (PDF removed too)"
                >
                  {deletingId === sheet.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: PresentationSheet['status'] }) {
  const variants: Record<PresentationSheet['status'], string> = {
    draft: 'bg-muted text-muted-foreground',
    generating: 'bg-blue-500/10 text-blue-300',
    ready: 'bg-emerald-500/10 text-emerald-300',
    failed: 'bg-red-500/10 text-red-300',
  };
  return (
    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${variants[status]}`}>
      {status}
    </span>
  );
}
