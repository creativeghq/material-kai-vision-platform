/**
 * ARPreviewModal Component
 * Full-screen 3D material swatch viewer using React Three Fiber.
 * Shows a PBR-textured plane with orbit controls, environment lighting,
 * and a tiling scale slider. Works on all platforms as a baseline 3D preview.
 *
 * Future enhancements:
 * - WebXR: integrate @react-three/xr for immersive-ar sessions
 * - iOS Quick Look: generate USDZ and use <a rel="ar"> for native AR
 * - model-viewer: load from CDN for cross-platform AR fallback
 */

import React, { Suspense, useState, useMemo, useRef } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import { TextureLoader, RepeatWrapping } from 'three';
import { X, Download, RotateCcw, Smartphone, ZoomIn } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/core/ui/button';
import { Slider } from '@/components/core/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { useARSupport } from './useARSupport';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ARPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  productName?: string;
  productImage: string;
  pbrMaps?: {
    tileable_url?: string;
    normal_url?: string;
    roughness_url?: string;
    metalness_url?: string;
  };
}

// ---------------------------------------------------------------------------
// MaterialSwatch — the 3D textured plane
// ---------------------------------------------------------------------------

interface MaterialSwatchProps {
  albedoUrl: string;
  normalUrl?: string;
  roughnessUrl?: string;
  metalnessUrl?: string;
  tileScale: number;
}

const PLACEHOLDER_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12P4/x8AAwAB/aurH8kAAAAASUVORK5CYII=';

const MaterialSwatch: React.FC<MaterialSwatchProps> = ({
  albedoUrl,
  normalUrl,
  roughnessUrl,
  metalnessUrl,
  tileScale,
}) => {
  // Build texture map — useTexture always needs the same shape to avoid
  // conditional hook violations. We load a 1x1 placeholder for missing maps
  // and discard the result.
  const hasNormal = !!normalUrl;
  const hasRoughness = !!roughnessUrl;
  const hasMetalness = !!metalnessUrl;

  // Load all textures using useLoader — always pass the same number of URLs
  // to avoid conditional hook calls. Use placeholder for missing maps.
  const [albedoTex, normalTex, roughnessTex, metalnessTex] = (useLoader as any)(
    TextureLoader,
    [
      albedoUrl,
      normalUrl || PLACEHOLDER_1X1,
      roughnessUrl || PLACEHOLDER_1X1,
      metalnessUrl || PLACEHOLDER_1X1,
    ],
  );

  // Configure tiling on all loaded textures
  useMemo(() => {
    const allTextures = [
      albedoTex,
      hasNormal ? normalTex : null,
      hasRoughness ? roughnessTex : null,
      hasMetalness ? metalnessTex : null,
    ].filter(Boolean);

    for (const tex of allTextures) {
      tex.wrapS = RepeatWrapping;
      tex.wrapT = RepeatWrapping;
      tex.repeat.set(tileScale, tileScale);
      tex.needsUpdate = true;
    }
  }, [albedoTex, normalTex, roughnessTex, metalnessTex, hasNormal, hasRoughness, hasMetalness, tileScale]);

  return (
    <mesh rotation={[-Math.PI / 4, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[3, 3, 64, 64]} />
      <meshPhysicalMaterial
        map={albedoTex}
        normalMap={hasNormal ? normalTex : undefined}
        roughnessMap={hasRoughness ? roughnessTex : undefined}
        metalnessMap={hasMetalness ? metalnessTex : undefined}
        roughness={hasRoughness ? 1 : 0.7}
        metalness={hasMetalness ? 1 : 0.0}
        clearcoat={0.1}
        clearcoatRoughness={0.4}
      />
    </mesh>
  );
};

// ---------------------------------------------------------------------------
// Scene — full lighting, controls, swatch
// ---------------------------------------------------------------------------

interface SceneProps {
  albedoUrl: string;
  normalUrl?: string;
  roughnessUrl?: string;
  metalnessUrl?: string;
  tileScale: number;
}

const Scene: React.FC<SceneProps> = (props) => {
  return (
    <>
      <Environment preset="apartment" background={false} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 8, 5]} intensity={1.0} castShadow />
      <directionalLight position={[-3, 4, -2]} intensity={0.4} />
      <pointLight position={[0, 5, 0]} intensity={0.3} />

      <MaterialSwatch {...props} />

      <OrbitControls
        enablePan={false}
        enableZoom
        enableRotate
        minDistance={2}
        maxDistance={8}
        target={[0, 0, 0]}
      />
    </>
  );
};

// ---------------------------------------------------------------------------
// Loading fallback
// ---------------------------------------------------------------------------

const CanvasLoader: React.FC = () => (
  <div className="flex h-full w-full items-center justify-center">
    <div className="flex flex-col items-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <p className="text-sm text-muted-foreground">Loading 3D preview...</p>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Error boundary for Three.js
// ---------------------------------------------------------------------------

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ThreeErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex h-full w-full items-center justify-center bg-muted/30 p-8">
            <div className="text-center">
              <p className="text-sm font-medium text-destructive">
                Failed to load 3D preview
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {this.state.error?.message || 'An unexpected error occurred'}
              </p>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// ARPreviewModal (exported)
// ---------------------------------------------------------------------------

export const ARPreviewModal: React.FC<ARPreviewModalProps> = ({
  isOpen,
  onClose,
  productId,
  productName,
  productImage,
  pbrMaps,
}) => {
  const { mode, isMobile } = useARSupport();
  const [tileScale, setTileScale] = useState(2);
  const linkRef = useRef<HTMLAnchorElement>(null);

  // Determine the best albedo source: tileable PBR > raw product image
  const albedoUrl = pbrMaps?.tileable_url || productImage;

  const handleDownload = () => {
    if (!linkRef.current) return;
    linkRef.current.href = albedoUrl;
    linkRef.current.download = `${productName || 'material'}-texture.jpg`;
    linkRef.current.click();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[95vh] max-w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:h-[90vh] sm:max-w-4xl">
        {/* sr-only because the design has no room for a visible heading. Radix logs a runtime
            warning without one and, more importantly, a screen reader announces the dialog with
            no name at all. (audit #302 finding 5) */}
        <DialogTitle className="sr-only">Material preview</DialogTitle>
        {/* Hidden download anchor. Not a link in the accessibility sense — it is a DOM handle whose
            href is assigned at runtime through the ref and then clicked programmatically. It is
            aria-hidden and display:none, so assistive tech never reaches it.
            Giving it href="#" to satisfy the rule would be worse: that makes it a genuinely
            focusable link that navigates nowhere. */}
        {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
        <a ref={linkRef} className="hidden" aria-hidden="true" />

        {/* Header bar */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium">
              {productName || 'Material Preview'}
            </h2>
            {mode === 'webxr' && (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                AR Ready
              </span>
            )}
            {mode === 'quicklook' && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                Quick Look
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* 3D Canvas */}
        <div className="relative flex-1 bg-gradient-to-br from-background to-muted/50">
          <ThreeErrorBoundary>
            <Suspense fallback={<CanvasLoader />}>
              <Canvas
                camera={{ position: [0, 2, 4], fov: 50 }}
                gl={{ antialias: true, alpha: true }}
                style={{ width: '100%', height: '100%' }}
              >
                <Scene
                  albedoUrl={albedoUrl}
                  normalUrl={pbrMaps?.normal_url}
                  roughnessUrl={pbrMaps?.roughness_url}
                  metalnessUrl={pbrMaps?.metalness_url}
                  tileScale={tileScale}
                />
              </Canvas>
            </Suspense>
          </ThreeErrorBoundary>

          {/* Interaction hints (shown briefly) */}
          <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2">
            <div className="flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 text-xs text-white backdrop-blur-sm">
              <RotateCcw className="h-3 w-3" />
              <span>Drag to rotate</span>
              <ZoomIn className="ml-1 h-3 w-3" />
              <span>Scroll to zoom</span>
            </div>
          </div>

          {/* Mobile AR hint */}
          {isMobile && mode !== 'webxr' && mode !== 'quicklook' && (
            <div className="absolute left-4 top-4 max-w-xs rounded-lg bg-black/60 px-3 py-2 text-xs text-white backdrop-blur-sm">
              <Smartphone className="mb-1 inline h-3 w-3" /> For the full AR
              experience, use the latest Chrome on Android or Safari on iOS.
            </div>
          )}

          {/* Desktop → phone handoff. Real AR needs a phone, and on desktop this modal
              previously offered only the 3D turntable with no way to get there. The QR
              points at /ar/:productId (App.tsx), the same route ARPage already serves.
              This is the one behaviour the orphaned ViewInARButton had that the modal
              did not — folded in here rather than left as a second, unreachable door.
              (audit #304 finding 14) */}
          {!isMobile && productId && (
            <div className="absolute right-4 top-4 flex flex-col items-center gap-2 rounded-lg bg-background/90 p-3 shadow-lg backdrop-blur-sm">
              <QRCodeSVG value={`${window.location.origin}/ar/${productId}`} size={96} />
              <p className="max-w-[8rem] text-center text-[11px] leading-tight text-muted-foreground">
                <Smartphone className="mb-0.5 inline h-3 w-3" /> Scan to view in AR on your phone
              </p>
            </div>
          )}

          {/* iOS Quick Look hint */}
          {mode === 'quicklook' && (
            <div className="absolute left-4 top-4 max-w-xs rounded-lg bg-blue-600/80 px-3 py-2 text-xs text-white backdrop-blur-sm">
              <Smartphone className="mb-1 inline h-3 w-3" /> AR Quick Look
              support coming soon. Use 3D preview below for now.
            </div>
          )}
        </div>

        {/* Bottom controls bar */}
        <div className="flex flex-col gap-3 border-t bg-background/80 px-4 py-3 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
          {/* Tile scale slider */}
          <div className="flex items-center gap-3">
            <label className="whitespace-nowrap text-xs text-muted-foreground">
              Tile Scale
            </label>
            <Slider
              value={[tileScale]}
              onValueChange={([v]) => setTileScale(v)}
              min={1}
              max={8}
              step={0.5}
              className="w-32"
            />
            <span className="min-w-[2rem] text-xs text-muted-foreground">
              {tileScale}x
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={handleDownload}
            >
              <Download className="mr-1.5 h-4 w-4" />
              Download texture
            </Button>
            <Button
              variant="default"
              size="sm"
              className="rounded-full"
              onClick={onClose}
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
