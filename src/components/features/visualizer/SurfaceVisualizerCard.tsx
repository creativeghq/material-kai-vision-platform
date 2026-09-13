/** The chat card for a `visualizer_render` chunk: the same renderer, compact, with a link to the full page. */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Loader2 } from 'lucide-react';
import { roomPlannerService } from '@/services/roomPlannerService';
import { visualizerService, type VisualizerScene, type VisualizerSurface, type SurfaceProduct } from '@/services/visualizerService';
import { PATTERNS, type Pattern } from '@/lib/surfaceRenderer';
import { SurfaceVisualizer } from './SurfaceVisualizer';

export interface VisualizerRenderData {
  scene_id: string;
  scene_name: string;
  surface_key: string;
  surface_kind: string;
  product_id: string;
  product_name: string;
  pattern: string;
  grout_width_mm: number;
  grout_color_hex: string | null;
  rotation_deg: number;
  url: string;
}

export const SurfaceVisualizerCard: React.FC<{ data: VisualizerRenderData; workspaceId: string }> = ({ data, workspaceId }) => {
  const [scene, setScene] = useState<VisualizerScene | null>(null);
  const [surfaces, setSurfaces] = useState<VisualizerSurface[]>([]);
  const [products, setProducts] = useState<SurfaceProduct[]>([]);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([
      visualizerService.getScene(data.scene_id),
      roomPlannerService.surfaceTexturesForProducts(workspaceId, [data.product_id]),
    ])
      .then(([s, textures]) => {
        if (!live) return;
        setScene(s.scene);
        setSurfaces(s.surfaces);
        const texture = textures.get(data.product_id);
        setProducts(texture?.url ? [{ id: data.product_id, name: data.product_name, texture }] : []);
        if (!texture?.url) setFailure('This product has no image to tile.');
      })
      .catch((e: unknown) => { if (live) setFailure(e instanceof Error ? e.message : 'Could not load the preview'); });
    return () => { live = false; };
  }, [data.scene_id, data.product_id, data.product_name, workspaceId]);

  const pattern = (PATTERNS as readonly string[]).includes(data.pattern) ? (data.pattern as Pattern) : 'stack';

  return (
    <div className="dashboard-card p-3">
      {failure ? (
        <p className="text-xs text-destructive">{failure}</p>
      ) : !scene ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Drawing the preview…</div>
      ) : (
        <SurfaceVisualizer
          compact
          scene={scene}
          surfaces={surfaces}
          products={products}
          workspaceId={workspaceId}
          initialState={{
            sceneId: scene.id,
            surfaceKey: data.surface_key,
            productId: data.product_id,
            pattern,
            groutWidthMm: data.grout_width_mm,
            groutColorHex: data.grout_color_hex ?? undefined,
            rotationDeg: data.rotation_deg,
          }}
        />
      )}
      <Link to={data.url} className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">
        Open in the visualizer <ExternalLink className="h-3 w-3" />
      </Link>
    </div>
  );
};
