import React, { lazy, Suspense, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { Loader2 } from 'lucide-react';

import {
  productMaterialMapsService,
  type MaterialMapUrls,
} from '@/services/productMaterialMapsService';

const MaterialLightingViewer = lazy(() => import('./MaterialLightingViewer'));

interface LightingPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  productImage: string;
  productName?: string;
  productCategory?: string;
  /**
   * Loads this product's AI-derived material maps (#321). Previously the caller handed down
   * `product.metadata?.pbr_maps`, which nothing has ever written — so the viewer has always lit a
   * flat photo with no surface detail.
   */
  productId?: string;
}

function LoadingFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
        <p className="text-sm text-muted-foreground">Loading lighting preview...</p>
      </div>
    </div>
  );
}

export default function LightingPreviewModal({
  isOpen,
  onClose,
  productImage,
  productName,
  productCategory,
  productId,
}: LightingPreviewModalProps) {
  const [maps, setMaps] = useState<MaterialMapUrls | null>(null);
  useEffect(() => {
    if (!isOpen || !productId) return;
    let live = true;
    productMaterialMapsService
      .selectedFor(productId)
      .then((m) => { if (live) setMaps(m); })
      .catch(() => { if (live) setMaps(null); });
    return () => { live = false; };
  }, [isOpen, productId]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl h-[85vh] p-4 flex flex-col gap-0 overflow-hidden">
        <div className="mb-2 flex items-center justify-between">
          {/* DialogTitle, not a raw h2 — Radix needs it to supply the accessible name. */}
          <DialogTitle className="text-lg font-semibold text-foreground">
            Lighting Preview
            {productName && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                - {productName}
              </span>
            )}
          </DialogTitle>
        </div>
        <div className="flex-1 min-h-0">
          <Suspense fallback={<LoadingFallback />}>
            {isOpen && (
              <MaterialLightingViewer
                albedoUrl={maps?.albedo_url ?? productImage}
                normalUrl={maps?.normal_url ?? undefined}
                roughnessUrl={maps?.roughness_url ?? undefined}
                materialCategory={productCategory}
                productName={productName}
              />
            )}
          </Suspense>
        </div>
      </DialogContent>
    </Dialog>
  );
}
