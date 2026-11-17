import React, { useState } from 'react';
import { Card } from '@/components/core/ui/card';
import { CalloutCanvas, type CalloutAnnotation } from './CalloutCanvas';
import { DimensionCanvas, type Dimension, type TileCallout } from './DimensionCanvas';
import {
  FixtureSymbolCanvas,
  PLUMBING_FIXTURE_DEFS,
  ELECTRICAL_FIXTURE_DEFS,
  PLUMBING_RUN_DEFS,
  ELECTRICAL_RUN_DEFS,
  type FixtureSymbol,
  type FixtureRun,
  type LegendEntry,
  type SheetTitleBlock,
} from './FixtureSymbolCanvas';
import { Droplets, Zap } from 'lucide-react';
import { DeckBuilderCanvas } from './DeckBuilderCanvas';
import { SheetPreviewCard } from './SheetPreviewCard';
import type { SheetType } from '@/services/moodboardSheetsService';

/**
 * Chat-attached card that mounts the correct canvas widget for an interactive
 * sheet type (lighting_plan, annotated_render, elevation_render_pair).
 * Once the user clicks "Render PDF" inside the canvas, the card swaps to a
 * SheetPreviewCard with the download link.
 */

export interface SheetCanvasCardProps {
  sheetId: string;
  sheetType: SheetType;
  moodboardId: string;
  initialData: Record<string, any>;
  title?: string;
}

export function SheetCanvasCard({ sheetId, sheetType, moodboardId, initialData, title }: SheetCanvasCardProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  if (pdfUrl) {
    return (
      <SheetPreviewCard
        sheetId={sheetId}
        sheetType={sheetType}
        title={title || 'Sheet'}
        pdfUrl={pdfUrl}
      />
    );
  }

  return (
    <Card className="p-4 space-y-3 dashboard-card">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-white/5 px-2 py-0.5 rounded-full">
          {sheetType.replace(/_/g, ' ')}
        </span>
        {title && <span className="text-sm font-medium">{title}</span>}
      </div>

      {sheetType === 'annotated_render' && (
        <CalloutCanvas
          sheetId={sheetId}
          backdropImageUrl={initialData.backdrop_image_url || ''}
          initialAnnotations={(initialData.annotations || []) as CalloutAnnotation[]}
          onPdfReady={setPdfUrl}
        />
      )}

      {sheetType === 'elevation_render_pair' && (
        <DimensionCanvas
          sheetId={sheetId}
          elevationImageUrl={initialData.elevation_image_url || ''}
          renderImageUrl={initialData.render_image_url}
          initialDimensions={(initialData.dimensions || []) as Dimension[]}
          initialTileCallouts={(initialData.tile_callouts || []) as TileCallout[]}
          onPdfReady={setPdfUrl}
        />
      )}

      {sheetType === 'lighting_plan' && (
        <FixtureSymbolCanvas
          sheetId={sheetId}
          backdrop={initialData.backdrop || { kind: 'rect', width_mm: 4000, height_mm: 3000 }}
          initialSymbols={(initialData.symbols || []) as FixtureSymbol[]}
          initialLegend={(initialData.legend || []) as LegendEntry[]}
          initialRuns={(initialData.runs || []) as FixtureRun[]}
          initialTitleBlock={initialData.title_block as SheetTitleBlock | undefined}
          onPdfReady={setPdfUrl}
        />
      )}

      {sheetType === 'plumbing_plan' && (
        <FixtureSymbolCanvas
          sheetId={sheetId}
          backdrop={initialData.backdrop || { kind: 'rect', width_mm: 4000, height_mm: 3000 }}
          initialSymbols={(initialData.symbols || []) as FixtureSymbol[]}
          initialLegend={(initialData.legend || []) as LegendEntry[]}
          initialRuns={(initialData.runs || []) as FixtureRun[]}
          initialTitleBlock={initialData.title_block as SheetTitleBlock | undefined}
          fixtureDefs={PLUMBING_FIXTURE_DEFS}
          runDefs={PLUMBING_RUN_DEFS}
          paletteIcon={Droplets}
          onPdfReady={setPdfUrl}
        />
      )}

      {sheetType === 'electrical_plan' && (
        <FixtureSymbolCanvas
          sheetId={sheetId}
          backdrop={initialData.backdrop || { kind: 'rect', width_mm: 4000, height_mm: 3000 }}
          initialSymbols={(initialData.symbols || []) as FixtureSymbol[]}
          initialLegend={(initialData.legend || []) as LegendEntry[]}
          initialRuns={(initialData.runs || []) as FixtureRun[]}
          initialTitleBlock={initialData.title_block as SheetTitleBlock | undefined}
          fixtureDefs={ELECTRICAL_FIXTURE_DEFS}
          runDefs={ELECTRICAL_RUN_DEFS}
          paletteIcon={Zap}
          onPdfReady={setPdfUrl}
        />
      )}

      {sheetType === 'full_deck' && (
        <DeckBuilderCanvas
          sheetId={sheetId}
          moodboardId={moodboardId}
          initialData={initialData as any}
          onPdfReady={setPdfUrl}
        />
      )}
    </Card>
  );
}
