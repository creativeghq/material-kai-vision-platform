import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FileText, Loader2, Download, ExternalLink, Pencil, Trash2, AlertCircle } from 'lucide-react';
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

interface MoodboardSheetsTabProps {
  moodboardId: string;
  moodboardTitle: string;
}

const SHEET_TYPE_DESCRIPTIONS: Record<SheetType, string> = {
  material_board: 'Selected materials with descriptions and swatches',
  color_palette: 'Color palette extracted from your moodboard',
  concept_board: 'Inspiration collage with curated images',
  lighting_plan: 'Top-down floor plan with fixture symbols',
  annotated_render: 'Render with AI-detected callouts',
  elevation_render_pair: 'Uploaded elevation with dimensions + render',
  ffe_schedule: 'Furniture, Fixtures & Equipment table',
  full_deck: 'Multi-page presentation deck assembling other sheets',
};

const SHEET_GROUPS: { label: string; types: SheetType[] }[] = [
  { label: 'Boards', types: ['material_board', 'color_palette', 'concept_board'] },
  { label: 'Plans', types: ['lighting_plan', 'annotated_render', 'elevation_render_pair'] },
  { label: 'Schedules', types: ['ffe_schedule'] },
  { label: 'Decks', types: ['full_deck'] },
];

export function MoodboardSheetsTab({ moodboardId, moodboardTitle }: MoodboardSheetsTabProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [sheets, setSheets] = useState<PresentationSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await moodboardSheetsService.list(moodboardId);
        if (!cancelled) setSheets(list);
      } catch (err) {
        toast({
          title: 'Could not load sheets',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [moodboardId, toast]);

  const launchAgentForSheet = (sheetType: SheetType) => {
    // Hand off to KAI agent with a context-rich first message that triggers
    // the generate_presentation_sheet tool.
    const params = new URLSearchParams();
    params.set('agent', 'kai');
    params.set(
      'q',
      `Create a ${SHEET_TYPE_LABELS[sheetType]} for moodboard ${moodboardId} ("${moodboardTitle}"). ` +
      `Walk me through the steps to gather the inputs, then call generate_presentation_sheet with sheet_type="${sheetType}".`,
    );
    navigate(`/agent-hub?${params.toString()}`);
  };

  const handleDelete = async (sheet: PresentationSheet) => {
    if (!confirm(`Delete sheet "${sheet.title}"?`)) return;
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
    const url = sheet.pdf_url || (await moodboardSheetsService.refreshPdfUrl(sheet.id));
    if (url) window.open(url, '_blank');
    else {
      toast({
        title: 'No PDF available',
        description: 'This sheet has not been rendered yet.',
        variant: 'destructive',
      });
    }
  };

  const handleEdit = (sheet: PresentationSheet) => {
    const params = new URLSearchParams();
    params.set('agent', 'kai');
    params.set(
      'q',
      `Continue editing sheet ${sheet.id} (${SHEET_TYPE_LABELS[sheet.sheet_type]}, "${sheet.title}") on moodboard ${moodboardId}.`,
    );
    navigate(`/agent-hub?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      {/* New Sheet launcher */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-base font-semibold">Presentation Sheets</h3>
          <p className="text-xs text-muted-foreground">
            Generate client-ready sheets from this moodboard via the KAI agent.
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="rounded-full gap-2">
              <Plus className="h-4 w-4" />
              New Sheet
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            {SHEET_GROUPS.map((group, gi) => (
              <React.Fragment key={group.label}>
                {gi > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </DropdownMenuLabel>
                {group.types.map((t) => (
                  <DropdownMenuItem
                    key={t}
                    onClick={() => launchAgentForSheet(t)}
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
          <p className="text-sm text-muted-foreground">No sheets generated yet.</p>
          <p className="text-xs text-muted-foreground">
            Click <span className="text-foreground">New Sheet</span> above to start.
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

              <div className="flex items-center gap-1 pt-1">
                {sheet.status === 'ready' && (
                  <>
                    <Button size="sm" variant="ghost" className="h-7 px-2 gap-1" onClick={() => handleOpenPdf(sheet)}>
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span className="text-xs">Open</span>
                    </Button>
                  </>
                )}
                <Button size="sm" variant="ghost" className="h-7 px-2 gap-1" onClick={() => handleEdit(sheet)}>
                  <Pencil className="h-3.5 w-3.5" />
                  <span className="text-xs">Edit</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 gap-1 ml-auto text-red-400 hover:text-red-300"
                  onClick={() => handleDelete(sheet)}
                  disabled={deletingId === sheet.id}
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
