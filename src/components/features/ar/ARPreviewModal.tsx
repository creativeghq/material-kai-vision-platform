/**
 * ARPreviewModal Component
 * Full-screen 3D product viewer using React Three Fiber.
 *
 * Two rendering paths (#321 asset foundation):
 * - A real glb/gltf model exists in `product_3d_models` → render it via
 *   ProductModelStage. iOS Quick Look (usdz) was REMOVED 2026-08-11: nothing in the
 *   platform can produce a usdz, so the path advertised a capability that would
 *   never arrive and showed every iPhone visitor a "no AR model yet" placard.
 * - No model → the original PBR-textured swatch plane with the tiling slider.
 *
 * Still future: WebXR immersive-ar sessions (@react-three/xr v5 — R3F v8 line).
 */

import React, { Suspense, useState, useEffect, useMemo, useRef } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
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
import { ProductModelStage } from './ProductModelViewer';
import { PresetLighting, DEFAULT_PRESET, PRESET_OPTIONS } from '@/components/features/lighting/PresetLighting';
import { sceneSettingsService, type SceneSettings } from '@/services/sceneSettingsService';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import type { PresetKey } from '@/components/features/lighting/lightingPresets';
import {
  productMaterialMapsService,
  type MaterialMapUrls,
} from '@/services/productMaterialMapsService';
// Loader + error boundary moved to CanvasChrome when the #260 configurator became a second
// canvas surface — a copied error boundary drifts and nobody notices.
import { CanvasLoader, ThreeErrorBoundary } from './CanvasChrome';
import { product3dService, modelPublicUrl, type Product3DModel } from '@/services/product3dService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ARPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  productName?: string;
  productImage: string;
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
  /** Shared preset (#335) — a material is judged under light, so this is the control that matters. */
  lighting: PresetKey;
  exposure?: number;
}

const Scene: React.FC<SceneProps> = (props) => {
  return (
    <>
      <PresetLighting preset={props.lighting} castShadow exposure={props.exposure} />

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
// ---------------------------------------------------------------------------
// ARPreviewModal (exported)
// ---------------------------------------------------------------------------

export const ARPreviewModal: React.FC<ARPreviewModalProps> = ({
  isOpen,
  onClose,
  productId,
  productName,
  productImage,
}) => {
  const { mode, isMobile } = useARSupport();
  const [tileScale, setTileScale] = useState(2);
  const [lighting, setLighting] = useState<PresetKey>(DEFAULT_PRESET);
  // The workspace's own look (#335), resolved through the one ladder. The picker below still
  // overrides it for this session — a merchant setting a default should not stop somebody
  // checking a material under a different light.
  const { activeWorkspaceId } = useWorkspace();
  const [scene, setScene] = useState<SceneSettings | null>(null);
  useEffect(() => {
    if (!isOpen || !activeWorkspaceId || !productId) return;
    let live = true;
    sceneSettingsService
      .resolve(activeWorkspaceId, productId)
      .then((s2) => {
        if (!live) return;
        setScene(s2);
        setLighting(s2.preset);
      })
      .catch(() => { if (live) setScene(null); });
    return () => { live = false; };
  }, [isOpen, activeWorkspaceId, productId]);
  const linkRef = useRef<HTMLAnchorElement>(null);

  // Real 3D models for this product, if any. null = still loading — the swatch
  // renders immediately as the fast path and is swapped out when a model lands.
  const [models, setModels] = useState<Product3DModel[] | null>(null);
  useEffect(() => {
    if (!isOpen || !productId) return;
    let live = true;
    product3dService
      .listModels(productId)
      .then((rows) => { if (live) setModels(rows.filter((m) => m.status === 'ready')); })
      .catch(() => { if (live) setModels([]); });
    return () => { live = false; };
  }, [isOpen, productId]);

  // AI-derived material maps for this product (#321). Loaded HERE rather than passed in: the
  // prop used to be `product.metadata?.pbr_maps`, which no code has ever written — four callers
  // handing down a value that was always undefined.
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

  const glbModel = models?.find((m) => m.format === 'glb') ?? models?.find((m) => m.format === 'gltf');
  const modelUrl = glbModel ? modelPublicUrl(glbModel) : null;

  // A derived tileable texture if one exists, else the product photo.
  //
  // The fallback is NOT equivalent and the UI says so below: a product photo has lighting baked
  // in, edges, and often a whole tile with its grout — tiled across a plane it reads as a
  // photograph repeated, not a surface. Presenting it silently as a material is what this
  // previously did.
  const derivedAlbedo = maps?.albedo_url ?? null;
  const albedoUrl = derivedAlbedo || productImage;

  const handleDownload = () => {
    if (!linkRef.current) return;
    if (modelUrl && glbModel) {
      linkRef.current.href = modelUrl;
      linkRef.current.download = `${productName || 'product'}.${glbModel.format}`;
    } else {
      linkRef.current.href = albedoUrl;
      linkRef.current.download = `${productName || 'material'}-texture.jpg`;
    }
    linkRef.current.click();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[95vh] max-w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:h-[90vh] sm:max-w-4xl">
        {/* sr-only because the design has no room for a visible heading. Radix logs a runtime
            warning without one and, more importantly, a screen reader announces the dialog with
            no name at all. */}
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
                {modelUrl ? (
                  <ProductModelStage
                    url={modelUrl}
                    lighting={lighting}
                    exposure={scene?.exposure}
                    showBackground={scene?.show_background}
                  />
                ) : (
                  <Scene
                    albedoUrl={albedoUrl}
                    normalUrl={maps?.normal_url ?? undefined}
                    roughnessUrl={maps?.roughness_url ?? undefined}
                    tileScale={tileScale}
                    lighting={lighting}
                    exposure={scene?.exposure}
                  />
                )}
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
          {isMobile && mode !== 'webxr' && (
            <div className="absolute left-4 top-4 max-w-xs rounded-lg bg-black/60 px-3 py-2 text-xs text-white backdrop-blur-sm">
              <Smartphone className="mb-1 inline h-3 w-3" /> For the full AR
              experience, use the latest Chrome on Android.
            </div>
          )}

          {/* Desktop → phone handoff. Real AR needs a phone, and on desktop this modal
              previously offered only the 3D turntable with no way to get there. The QR
              points at /ar/:productId (App.tsx), the same route ARPage already serves.
              This is the one behaviour the orphaned ViewInARButton had that the modal
              did not — folded in here rather than left as a second, unreachable door. */}
          {!isMobile && productId && (
            <div className="absolute right-4 top-4 flex flex-col items-center gap-2 rounded-lg bg-background/90 p-3 shadow-lg backdrop-blur-sm">
              <QRCodeSVG value={`${window.location.origin}/ar/${productId}`} size={96} />
              <p className="max-w-[8rem] text-center text-[11px] leading-tight text-muted-foreground">
                <Smartphone className="mb-0.5 inline h-3 w-3" /> Scan to view in AR on your phone
              </p>
            </div>
          )}

        </div>

        {/* Bottom controls bar */}
        <div className="flex flex-col gap-3 border-t bg-background/80 px-4 py-3 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
          {/* Lighting (#335). Applies to BOTH paths — a model and a material are each judged under
              light, and until now every viewer in the platform was pinned to one midday preset. */}
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap text-xs text-muted-foreground">Lighting</span>
            <select
              aria-label="Lighting preset"
              className="h-7 rounded-md border border-border/60 bg-background px-2 text-xs"
              value={lighting}
              onChange={(e) => setLighting(e.target.value as PresetKey)}
            >
              {PRESET_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>{o.name}</option>
              ))}
            </select>
          </div>

          {/* Tile scale slider — tiling only applies to the swatch plane */}
          {modelUrl ? (
            <span className="text-xs text-muted-foreground">3D model preview</span>
          ) : (
            <div className="flex items-center gap-3">
              <span id="ar-tile-scale-label" className="whitespace-nowrap text-xs text-muted-foreground">
                Tile Scale
              </span>
              {/* Say which one this is. A product photo has its lighting baked in and usually its
                  own edges, so tiled across a plane it reads as a repeated photograph rather than a
                  surface — presenting that silently as a material is what this used to do. */}
              {!derivedAlbedo && (
                <span className="whitespace-nowrap text-[10px] text-muted-foreground/70">
                  product photo, not a seamless texture
                </span>
              )}
              <Slider
                aria-labelledby="ar-tile-scale-label"
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
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={handleDownload}
            >
              <Download className="mr-1.5 h-4 w-4" />
              {modelUrl ? 'Download model' : 'Download texture'}
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
