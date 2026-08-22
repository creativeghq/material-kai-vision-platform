import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Sparkles, FileImage, Layers, Lightbulb, Droplets, Zap, Ruler, ListTree, FileText, Album, LayoutGrid, ListChecks } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  SHEET_TYPE_LABELS,
  SHEET_TYPE_CREDITS,
  type SheetType,
} from '@/services/moodboardSheetsService';
import { SheetTypeIllustration } from './SheetTypeIllustration';

/**
 * Pre-flight modal shown when the user picks a sheet type from the dropdown.
 *
 * Purpose: let the user *see* what the sheet will look like and understand
 * what inputs the agent will gather, BEFORE jumping into the chat. This
 * eliminates the "I clicked something but nothing happened" problem and lets
 * the user back out without spending credits or starting a conversation they
 * don't want.
 *
 * Reference images live in the public `moodboard-sheet-references` bucket
 * keyed by `<sheet_type>.png`. If a reference is missing, we fall back to a
 * lucide icon glyph so the modal still works on a fresh deploy.
 */

interface SheetTypeMeta {
  icon: React.ComponentType<{ className?: string }>;
  what: string;        // 1-line description
  produces: string;    // What the user gets at the end
  inputs: string[];    // What the agent will ask for
  bestFor: string;     // When to pick this one
}

const SHEET_TYPE_META: Record<SheetType, SheetTypeMeta> = {
  material_board: {
    icon: Layers,
    what: 'A grid of selected products with names, categories and short descriptions — the classic FF&E board you hand to a client to show "these are the materials we picked".',
    produces: 'A 1-page A3 PDF with up to 8 product chips arranged 4×2, each showing the catalog image, product name, category, and description.',
    inputs: ['Which products from the moodboard to feature (max 8)', 'Optional: override descriptions per product'],
    bestFor: 'Sharing the curated material selection at any stage of the project.',
  },
  color_palette: {
    icon: FileImage,
    what: 'Up to 8 color swatches with hex codes and names, extracted from your moodboard or supplied directly.',
    produces: 'A 1-page A3 PDF with a swatch grid — large color blocks, hex labels, and friendly names ("Warm Travertine", "Charcoal").',
    inputs: ['Hex codes + names for the swatches you want to feature (max 8)'],
    bestFor: 'Locking down the project color story before deeper material selection.',
  },
  concept_board: {
    icon: Album,
    what: 'A collage of inspiration images from the moodboard with optional captions. Lighter than the Material Board — more about mood and feel.',
    produces: 'A 1-page A3 PDF with a 3×2 image collage and short captions per image.',
    inputs: ['Which moodboard images to feature (max 6)', 'Optional captions per image'],
    bestFor: 'Pitching the design direction at kickoff or first client review.',
  },
  lighting_plan: {
    icon: Lightbulb,
    what: 'A top-down room view with fixture symbols (recessed, pendant, wall, spot, LED strip, floor, table) placed where you want them, plus a legend on the right.',
    produces: 'A 1-page A3 PDF with the floor plan, all symbols at their normalized positions, and a labeled legend.',
    inputs: ['A floor plan image OR room dimensions in millimeters', 'Drop fixture symbols on the canvas (interactive)'],
    bestFor: 'Coordinating with the electrician/lighting designer on circuit layouts.',
  },
  plumbing_plan: {
    icon: Droplets,
    what: 'A top-down room view with plumbing fixture symbols (WC, basin, bath, shower, floor drain, water supply, waste/soil stack, water heater, tap) placed where you want them, plus a legend on the right.',
    produces: 'A 1-page A3 PDF with the floor plan, all plumbing symbols at their normalized positions, and a labeled legend.',
    inputs: ['A floor plan image OR room dimensions in millimeters', 'Drop plumbing symbols on the canvas (interactive)'],
    bestFor: 'Coordinating with the plumber on fixture positions, supply/waste runs, and the wet-room layout.',
  },
  electrical_plan: {
    icon: Zap,
    what: 'A top-down room view with IEC-style electrical symbols (sockets, switches, dimmers, distribution board, data/TV outlets, dedicated appliance points, junction boxes, earth) placed where you want them, plus a legend on the right.',
    produces: 'A 1-page A3 PDF with the floor plan, all electrical symbols at their normalized positions, and a labeled legend.',
    inputs: ['A floor plan image OR room dimensions in millimeters', 'Drop electrical symbols on the canvas (interactive)'],
    bestFor: 'Agreeing socket and switch positions with the electrician and the client before first fix.',
  },
  annotated_render: {
    icon: Sparkles,
    what: 'A render of a room with red callout dots and leader lines pointing to materials, plus a side legend showing the matched products.',
    produces: 'A 1-page A3 PDF with the render on the left (65%), callouts, and a material legend with thumbnails on the right.',
    inputs: ['A render image URL (or generate one with the 3D tool first)', 'Click on the render to drop callouts (interactive)'],
    bestFor: 'Showing the client exactly which material goes where, in the context of the room.',
  },
  elevation_render_pair: {
    icon: Ruler,
    what: 'A dimensioned wall elevation on top, the matching photoreal render on the bottom — same wall, two views.',
    produces: 'A 1-page A3 PDF, top half is the elevation with red dimension lines and tile callouts, bottom half is the render.',
    inputs: ['An elevation image upload', 'Optional render image URL', 'Click two points to drop dimensions, single-click for tile callouts (interactive)'],
    bestFor: 'Bathroom + kitchen specs where you need to show both the technical drawing and the look-and-feel together.',
  },
  ffe_schedule: {
    icon: ListTree,
    what: 'A table of FF&E items pulled from a quote, with room, dimensions, install requirements, delivery date, qty, and price.',
    produces: 'A 1-page A3 PDF with an 8-column table (#, Room, Item, Dimensions, Install, Delivery, Qty, Price), one row per item.',
    inputs: ['A quote ID linked to this moodboard (preferred) — or enter items inline'],
    bestFor: 'The procurement deliverable: sending the contractor exactly what to buy and when it arrives.',
  },
  area_breakdown: {
    icon: LayoutGrid,
    what: 'A single composited "design breakdown" board — hero render, dimensioned plan, elevation, a Material & Finishes column, accessory/fitting columns, notes, and a color-palette strip, all on one page (like a Zubexa-style spec board).',
    produces: 'A 1-page A3 PDF: big hero render top-left, plan + elevation stacked top-right, then finishes + fitting columns + notes below, with a palette strip along the bottom.',
    inputs: ['A hero render image', 'Optional plan + elevation images', 'Finishes (label + spec + swatch)', 'Fitting/accessory columns', 'Color palette + notes'],
    bestFor: 'A complete single-board summary of one room or area you can hand a client or contractor.',
  },
  scope_of_works: {
    icon: ListChecks,
    what: 'What will HAPPEN, rather than what will be supplied — the phases of work and the items inside them. Every other sheet describes a thing; this one describes the doing, which is the part a client actually signs off on.',
    produces: 'A 1-page A3 PDF: numbered phases with their date ranges, the works inside each, and milestones marked. No prices — money stays on the FF&E schedule and the quote, so there is only ever one place it is totalled.',
    inputs: [
      'The project — its phases and works are derived from the task list, so changing the schedule and re-rendering keeps the proposal correct',
      'Optional: a short intro paragraph',
      'Optional: show who is doing each item (off by default — a client document should not disclose your subcontractors unless you decide it should)',
    ],
    bestFor: 'The scope section of a proposal, and the programme a client refers back to once work starts.',
  },
  full_deck: {
    icon: FileText,
    what: 'Multi-page presentation that wraps a cover page + a chosen subset of your existing tools’ outputs in any order. The polished thing you actually email the client.',
    produces: 'A multi-page A3 PDF: cover (title + description + client + date + cover image) followed by every selected output in display order.',
    inputs: ['Cover details (title, description, client name, date, cover image)', 'Which existing outputs to include and their order'],
    bestFor: 'The end-of-project handoff or any milestone client review.',
  },
};

interface SheetTypePreviewModalProps {
  open: boolean;
  sheetType: SheetType | null;
  onCancel: () => void;
  onContinue: (sheetType: SheetType) => void;
}

export function SheetTypePreviewModal({ open, sheetType, onCancel, onContinue }: SheetTypePreviewModalProps) {
  // Every hook must run BEFORE the `if (!sheetType) return null` bail-out below. Place one
  // after it and a null→set transition changes the hook count between renders, which React
  // rejects with "Rendered more hooks than during the previous render".
  // Reference image with cache-busting. We fetch the bucket's file list once
  // per modal mount and use each file's updated_at as a `?v=` query string —
  // when admins regenerate, the URL changes and browsers refetch instantly.
  const [versions, setVersions] = React.useState<Record<string, string>>({});
  const [imgError, setImgError] = React.useState(false);
  React.useEffect(() => { setImgError(false); }, [sheetType]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.storage
        .from('moodboard-sheet-references')
        .list('', { limit: 100 });
      if (cancelled || !data) return;
      const map: Record<string, string> = {};
      for (const f of data) {
        const ver = f.updated_at ? new Date(f.updated_at).getTime().toString(36) : 'static';
        map[f.name] = ver;
      }
      setVersions(map);
    })();
    return () => { cancelled = true; };
  }, []);

  // Bail-out AFTER the hooks (see note above) — everything below dereferences sheetType.
  if (!sheetType) return null;
  const meta = SHEET_TYPE_META[sheetType];
  const Icon = meta.icon;
  const credits = SHEET_TYPE_CREDITS[sheetType];

  const fileName = `${sheetType}.png`;
  const { data: imgData } = supabase.storage
    .from('moodboard-sheet-references')
    .getPublicUrl(fileName);
  const ver = versions[fileName];
  const referenceUrl = imgData?.publicUrl
    ? `${imgData.publicUrl}${ver ? `?v=${ver}` : ''}`
    : undefined;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            {SHEET_TYPE_LABELS[sheetType]}
            {credits > 0 && (
              <span className="ml-2 text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-normal">
                {credits} credits
              </span>
            )}
            {credits === 0 && (
              <span className="ml-2 text-[11px] bg-emerald-500/10 text-emerald-300 px-2 py-0.5 rounded-full font-normal">
                Free
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="text-sm">{meta.what}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 my-2">
          {/* Reference image: uploaded asset wins, otherwise the bundled SVG
              illustration so the modal still looks rich on a fresh deploy. */}
          <div className="rounded-lg overflow-hidden border border-white/15 bg-white/5 aspect-[4/3] flex items-center justify-center">
            {referenceUrl && !imgError ? (
              <img
                src={referenceUrl}
                alt={`Example ${SHEET_TYPE_LABELS[sheetType]}`}
                className="w-full h-full object-contain"
                onError={() => setImgError(true)}
              />
            ) : (
              <SheetTypeIllustration sheetType={sheetType} className="w-full h-full" />
            )}
          </div>

          {/* Right-hand info column */}
          <div className="space-y-3 text-sm">
            <Section title="What you'll get">
              <p className="text-muted-foreground">{meta.produces}</p>
            </Section>

            <Section title="What the agent will ask for">
              <ul className="space-y-1 text-muted-foreground list-disc list-inside marker:text-primary/60">
                {meta.inputs.map((input) => (
                  <li key={input}>{input}</li>
                ))}
              </ul>
            </Section>

            <Section title="Best for">
              <p className="text-muted-foreground italic">{meta.bestFor}</p>
            </Section>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button className="gap-2" onClick={() => onContinue(sheetType)}>
            <Sparkles className="h-4 w-4" />
            Continue with KAI
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{title}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}
