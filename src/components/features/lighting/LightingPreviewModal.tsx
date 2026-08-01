import React, { lazy, Suspense } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { Loader2 } from 'lucide-react';

const MaterialLightingViewer = lazy(() => import('./MaterialLightingViewer'));

interface LightingPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  productImage: string;
  productName?: string;
  productCategory?: string;
  pbrMaps?: {
    normal_url?: string;
    roughness_url?: string;
    metalness_url?: string;
  };
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
  pbrMaps,
}: LightingPreviewModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl h-[85vh] p-4 flex flex-col gap-0 overflow-hidden">
        <div className="mb-2 flex items-center justify-between">
          {/* DialogTitle, not a raw h2 — Radix needs it to supply the accessible name.
              (audit #302 finding 5) */}
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
                albedoUrl={productImage}
                normalUrl={pbrMaps?.normal_url}
                roughnessUrl={pbrMaps?.roughness_url}
                metalnessUrl={pbrMaps?.metalness_url}
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
