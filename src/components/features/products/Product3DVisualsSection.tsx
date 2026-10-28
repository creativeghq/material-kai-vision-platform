import React, { useEffect, useState } from 'react';
import { Box, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { product3dService } from '@/services/product3dService';
import { ProductShapePreview } from './ProductShapePreview';
import type { PlaceholderShape } from './productShape';

interface Product3DVisualsSectionProps {
  productId: string;
  /** Catalog sizes to draw as a stand-in while there is no model. */
  shapes?: PlaceholderShape[];
  /** The four model, scene, texture and readiness cards, stacked as before. */
  children: React.ReactNode;
}

/** With no model yet the four cards collapse into one; with a model they show as they were. */
export const Product3DVisualsSection: React.FC<Product3DVisualsSectionProps> = ({ productId, shapes = [], children }) => {
  const [hasModel, setHasModel] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    product3dService
      .listModels(productId)
      .then((rows) => { if (live) setHasModel(rows.length > 0); })
      .catch(() => { if (live) setHasModel(true); });
    return () => { live = false; };
  }, [productId]);

  if (hasModel !== false) return <>{children}</>;

  return (
    <div className="space-y-6">
      <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
              <Box className="h-4 w-4" />
              3D &amp; visuals
            </h3>
            <p className="text-xs text-muted-foreground mt-1">No 3D model yet. What you can do:</p>
          </div>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => setOpen((o) => !o)}>
            {open ? <ChevronUp className="mr-1.5 h-3.5 w-3.5" /> : <ChevronDown className="mr-1.5 h-3.5 w-3.5" />}
            {open ? 'Hide tools' : 'Open tools'}
          </Button>
        </div>
        <div className="mt-4 grid gap-6 sm:grid-cols-[minmax(0,17rem)_1fr] sm:items-start">
          {shapes.length > 0 && <ProductShapePreview shapes={shapes} />}
          <ul className="space-y-1.5 text-xs text-muted-foreground list-disc pl-4 sm:col-start-2 sm:row-start-1">
            <li>Upload a .glb or .gltf from the manufacturer&apos;s CAD or BIM files. This unlocks the 3D viewer, AR and the configurator.</li>
            <li>For a flat surface such as a tile or fabric, add texture maps instead. The surface itself is the product.</li>
            <li>Set the real width, height and depth so the room planner draws it to scale rather than as a 60 × 60 cm placeholder.</li>
          </ul>
        </div>
      </div>
      {open && <div className="space-y-6">{children}</div>}
    </div>
  );
};
