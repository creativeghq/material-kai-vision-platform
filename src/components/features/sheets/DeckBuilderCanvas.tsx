import React, { useEffect, useState } from 'react';
import { GripVertical, Save, Loader2, Image as ImageIcon, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import {
  moodboardSheetsService,
  type PresentationSheet,
  SHEET_TYPE_LABELS,
} from '@/services/moodboardSheetsService';
import { todayLocalISO } from '@/utils/datetime';

/**
 * Full-Deck composer. Lists all sheets attached to the moodboard, lets the
 * user check which to include and drag-reorder them, then renders the deck.
 *
 * The deck cover form (title, description, client, date, cover image) lives
 * here too — keeps everything one click away. Once the user clicks Render,
 * we update the sheet's `data` payload with `included_sheet_ids` (in display
 * order) and `cover {...}`, then invoke the PDF function.
 */
interface DeckBuilderCanvasProps {
  sheetId: string;
  moodboardId: string;
  initialData: {
    cover?: {
      title?: string;
      description?: string;
      client_name?: string;
      cover_image_url?: string;
      date?: string;
    };
    included_sheet_ids?: string[];
  };
  onPdfReady?: (pdfUrl: string) => void;
}

export function DeckBuilderCanvas({ sheetId, moodboardId, initialData, onPdfReady }: DeckBuilderCanvasProps) {
  const [allSheets, setAllSheets] = useState<PresentationSheet[]>([]);
  const [order, setOrder] = useState<string[]>(initialData.included_sheet_ids || []);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialData.included_sheet_ids || []));
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const [cover, setCover] = useState({
    title: initialData.cover?.title || '',
    description: initialData.cover?.description || '',
    client_name: initialData.cover?.client_name || '',
    cover_image_url: initialData.cover?.cover_image_url || '',
    date: initialData.cover?.date || todayLocalISO(),
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await moodboardSheetsService.list(moodboardId);
        if (cancelled) return;
        // Hide the deck-being-built itself, hide drafts, hide failures
        const usable = list.filter(
          (s) => s.id !== sheetId && s.status === 'ready' && s.sheet_type !== 'full_deck',
        );
        setAllSheets(usable);
        // Default selection: every ready sheet, in creation order if user hasn't set one yet
        if (order.length === 0) {
          const ids = usable.map((s) => s.id);
          setOrder(ids);
          setSelected(new Set(ids));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moodboardId, sheetId]);

  const toggleSelected = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** Reorder by one position. Drag-and-drop is mouse-only; these back the arrow buttons so a
   *  keyboard or touch user can reorder the deck at all. */
  const nudge = (id: string, delta: -1 | 1) => {
    setOrder((arr) => {
      const next = arr.slice();
      const i = next.indexOf(id);
      const j = i + delta;
      if (i === -1 || j < 0 || j >= next.length) return next;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const moveItem = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    setOrder((arr) => {
      const next = arr.slice();
      const fromIdx = next.indexOf(fromId);
      const toIdx = next.indexOf(toId);
      if (fromIdx === -1 || toIdx === -1) return next;
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  };

  // Sheets in user-specified order, then any not-yet-ordered appended at the end
  const orderedSheets = React.useMemo(() => {
    const byId = new Map(allSheets.map((s) => [s.id, s]));
    const inOrder: PresentationSheet[] = [];
    for (const id of order) {
      const s = byId.get(id);
      if (s) {
        inOrder.push(s);
        byId.delete(id);
      }
    }
    for (const s of byId.values()) inOrder.push(s);
    return inOrder;
  }, [allSheets, order]);

  const handleRender = async () => {
    setRendering(true);
    setError(null);
    try {
      const includedSheetIds = orderedSheets
        .filter((s) => selected.has(s.id))
        .map((s) => s.id);

      if (includedSheetIds.length === 0) {
        throw new Error('Pick at least one sheet to include in the deck.');
      }
      if (!cover.title.trim()) {
        throw new Error('Add a title for the deck cover.');
      }

      await moodboardSheetsService.update(sheetId, {
        data: {
          included_sheet_ids: includedSheetIds,
          cover: {
            ...cover,
            date: cover.date || new Date().toISOString(),
          },
        },
      });
      const result = await moodboardSheetsService.generatePdf(sheetId);
      onPdfReady?.(result.pdf_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Render failed');
    } finally {
      setRendering(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Cover form */}
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Cover</div>
          <Input
            placeholder="Deck title (e.g. Project Kitchen — Materials & Plans)"
            value={cover.title}
            onChange={(e) => setCover((c) => ({ ...c, title: e.target.value }))}
          />
          <Textarea
            placeholder="Optional 1–2 sentence description"
            value={cover.description}
            onChange={(e) => setCover((c) => ({ ...c, description: e.target.value }))}
            className="min-h-[60px]"
          />
          <Input
            placeholder="Client name (optional)"
            value={cover.client_name}
            onChange={(e) => setCover((c) => ({ ...c, client_name: e.target.value }))}
          />
          <Input
            type="date"
            value={cover.date}
            onChange={(e) => setCover((c) => ({ ...c, date: e.target.value }))}
          />
          <Input
            placeholder="Cover image URL (optional)"
            value={cover.cover_image_url}
            onChange={(e) => setCover((c) => ({ ...c, cover_image_url: e.target.value }))}
          />
          {cover.cover_image_url && (
            <div className="rounded-md overflow-hidden border border-white/10 mt-1" style={{ aspectRatio: '4/3' }}>
              <img src={cover.cover_image_url} alt="" className="w-full h-full object-cover" />
            </div>
          )}
        </div>

        {/* Order + select list */}
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Sheets ({selected.size} of {orderedSheets.length} selected)
          </div>
          {loading ? (
            <div className="p-6 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : orderedSheets.length === 0 ? (
            <div className="p-6 text-xs text-muted-foreground border border-dashed rounded-md">
              No ready sheets on this moodboard yet. Generate a Material Board, Color Palette, or Concept Board first.
            </div>
          ) : (
            <div className="space-y-1 max-h-[420px] overflow-y-auto">
              {orderedSheets.map((s, idx) => (
                <div
                  key={s.id}
                  role="presentation"
                  draggable
                  onDragStart={() => setDraggingId(s.id)}
                  onDragEnd={() => setDraggingId(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { if (draggingId) moveItem(draggingId, s.id); }}
                  className={`flex items-center gap-2 p-2 rounded border ${
                    selected.has(s.id) ? 'border-primary/60 bg-primary/5' : 'border-white/10'
                  } ${draggingId === s.id ? 'opacity-50' : ''}`}
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab flex-shrink-0" />
                  <Checkbox
                    checked={selected.has(s.id)}
                    onCheckedChange={() => toggleSelected(s.id)}
                    className="h-4 w-4 flex-shrink-0"
                   />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{s.title}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {SHEET_TYPE_LABELS[s.sheet_type]}
                      {s.page_count != null && ` · ${s.page_count} page${s.page_count === 1 ? '' : 's'}`}
                    </div>
                  </div>
                  <ImageIcon className="h-3 w-3 text-muted-foreground/40 flex-shrink-0" />
                  <div className="flex flex-col flex-shrink-0">
                    <button
                      type="button"
                      aria-label={`Move ${s.title} up`}
                      disabled={idx === 0}
                      onClick={() => nudge(s.id, -1)}
                      className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${s.title} down`}
                      disabled={idx === orderedSheets.length - 1}
                      onClick={() => nudge(s.id, 1)}
                      className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm" variant="default" className="gap-2 ml-auto"
          onClick={handleRender}
          disabled={rendering || selected.size === 0 || !cover.title.trim()}
        >
          <Save className="h-4 w-4" />
          {rendering ? 'Building deck…' : 'Render Deck'}
        </Button>
      </div>

      {error && (
        <div className="text-xs text-red-400 p-2 rounded border border-red-500/30 bg-red-500/10">
          {error}
        </div>
      )}
    </div>
  );
}
