/**
 * How this product is lit and framed (#335) — set it, and see it.
 *
 * #335 asked for "a visual editor for those values that shows the result live, rather than a form
 * of numbers", and that is the whole design here: every control writes straight to the preview
 * beside it. Exposure and framing are unjudgeable as numbers — 1.4 means nothing until a chair is
 * standing in it.
 *
 * TWO SCOPES, ONE CARD. A tenant almost always wants "make my catalogue look like this", and
 * occasionally "except this one product". Splitting those across two screens would hide the common
 * case behind navigation, so the card edits the product and can promote the same values to the
 * workspace default in one action.
 *
 * The precedence itself is NOT here. `resolve_scene_settings` answers embed key → product →
 * workspace default → code defaults, and this card only ever writes one scope and reads back what
 * the ladder returns — so what the preview shows is what every other surface will show.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Loader2, RotateCcw, Building2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Label } from '@/components/core/ui/label';
import { Slider } from '@/components/core/ui/slider';
import { Switch } from '@/components/core/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { ProductModelStage } from '@/components/features/ar/ProductModelViewer';
import { CanvasLoader, ThreeErrorBoundary } from '@/components/features/ar/CanvasChrome';
import { PRESET_OPTIONS } from '@/components/features/lighting/PresetLighting';
import type { PresetKey } from '@/components/features/lighting/lightingPresets';
import { product3dService, modelPublicUrl } from '@/services/product3dService';
import { sceneSettingsService, SCENE_DEFAULTS, type SceneSettings } from '@/services/sceneSettingsService';

interface Props {
  productId: string;
  workspaceId: string;
}

export const ProductSceneCard: React.FC<Props> = ({ productId, workspaceId }) => {
  const { toast } = useToast();
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [settings, setSettings] = useState<SceneSettings | null>(null);
  /** Whether THIS product has its own row, as opposed to inheriting. */
  const [hasOverride, setHasOverride] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    product3dService
      .listModels(productId)
      .then((rows) => {
        if (!live) return;
        const glb = rows.find((m) => m.status === 'ready' && (m.format === 'glb' || m.format === 'gltf'));
        setModelUrl(glb ? modelPublicUrl(glb) : null);
      })
      .catch(() => { if (live) setModelUrl(null); });
    return () => { live = false; };
  }, [productId]);

  const load = useCallback(async () => {
    const [resolved, own] = await Promise.all([
      sceneSettingsService.resolve(workspaceId, productId),
      sceneSettingsService.forScope(workspaceId, { productId }),
    ]);
    setSettings(resolved);
    setHasOverride(!!own);
  }, [workspaceId, productId]);

  useEffect(() => { void load().catch(() => setSettings(null)); }, [load]);

  // The preview updates on every change; the write is what waits for a decision.
  const patch = (values: Partial<SceneSettings>) =>
    setSettings((cur) => (cur ? { ...cur, ...values } : cur));

  const persist = async (scope: 'product' | 'workspace') => {
    if (!settings) return;
    setSaving(true);
    try {
      await sceneSettingsService.save(
        workspaceId,
        scope === 'product' ? { productId } : {},
        {
          preset: settings.preset,
          exposure: settings.exposure,
          camera_zoom: settings.camera_zoom,
          show_background: settings.show_background,
        },
      );
      await load();
      toast({
        title: scope === 'product'
          ? 'Saved for this product'
          : 'Saved as the workspace default',
      });
    } catch (e) {
      toast({
        title: 'Could not save',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return null;

  return (
    <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
      <div className="mb-1 flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold">Lighting &amp; framing</h3>
        {/* Inherited vs overridden, said plainly. Without it, clearing an override looks like it
            did nothing, because the values stay where they were. */}
        <span className="text-[10px] text-muted-foreground">
          {hasOverride ? 'set for this product' : 'inherited from the workspace'}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground mb-4">
        Applies wherever this product is rendered — the viewer, AR, the configurator and the website
        embed. Change anything and the preview follows.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="aspect-square overflow-hidden rounded-xl bg-muted/30">
          {modelUrl ? (
            <ThreeErrorBoundary>
              <React.Suspense fallback={<CanvasLoader />}>
                <Canvas camera={{ position: [0, 2, 4 * (settings.camera_zoom ?? 1)], fov: 50 }}>
                  <ProductModelStage
                    url={modelUrl}
                    lighting={settings.preset}
                    exposure={settings.exposure}
                    showBackground={settings.show_background}
                  />
                </Canvas>
              </React.Suspense>
            </ThreeErrorBoundary>
          ) : (
            <div className="flex h-full items-center justify-center px-4 text-center text-[11px] text-muted-foreground">
              Upload a 3D model to see these settings applied.
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <Label className="text-xs">Lighting</Label>
            <select
              className="mt-1 h-8 w-full rounded-md border border-border/60 bg-background px-2 text-xs"
              value={settings.preset}
              onChange={(e) => patch({ preset: e.target.value as PresetKey })}
            >
              {PRESET_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>{o.name}</option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {PRESET_OPTIONS.find((o) => o.key === settings.preset)?.description}
            </p>
          </div>

          <div>
            <Label className="text-xs">Exposure — {settings.exposure.toFixed(2)}</Label>
            <Slider
              className="mt-2"
              value={[settings.exposure]}
              min={0.1}
              max={3}
              step={0.05}
              onValueChange={([v]) => patch({ exposure: v })}
            />
          </div>

          <div>
            <Label className="text-xs">
              Framing — {settings.camera_zoom ? `${settings.camera_zoom.toFixed(2)}×` : 'auto'}
            </Label>
            <Slider
              className="mt-2"
              value={[settings.camera_zoom ?? 1]}
              min={0.5}
              max={4}
              step={0.05}
              onValueChange={([v]) => patch({ camera_zoom: v })}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <Label className="text-xs">Show the background</Label>
              <p className="text-[10px] text-muted-foreground">
                Off, the environment only lights the product — which is usually right on someone
                else's page.
              </p>
            </div>
            <Switch
              checked={settings.show_background}
              onCheckedChange={(v) => patch({ show_background: v })}
            />
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button size="sm" disabled={saving} onClick={() => persist('product')}>
          {saving && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
          Save for this product
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={saving}
          onClick={() => persist('workspace')}
        >
          <Building2 className="mr-1.5 h-3 w-3" />
          Use as workspace default
        </Button>
        {hasOverride && (
          <Button
            size="sm"
            variant="ghost"
            disabled={saving}
            onClick={async () => {
              await sceneSettingsService.clear(workspaceId, { productId });
              await load();
              toast({ title: 'This product follows the workspace default again' });
            }}
          >
            <RotateCcw className="mr-1.5 h-3 w-3" />
            Reset to workspace
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => patch({ ...SCENE_DEFAULTS, workspace_id: workspaceId } as Partial<SceneSettings>)}
        >
          Reset the sliders
        </Button>
      </div>
    </div>
  );
};
