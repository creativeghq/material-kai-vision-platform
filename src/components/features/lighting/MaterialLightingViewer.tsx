import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment, OrbitControls, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import {
  Sun,
  Sunrise,
  Cloud,
  Lightbulb,
  Lamp,
  Moon,
  Play,
  Pause,
  Camera,
  ChevronDown,
  ChevronUp,
  Compass,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Slider } from '@/components/core/ui/slider';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/core/ui/collapsible';
import {
  LIGHTING_PRESETS,
  MATERIAL_DEFAULTS,
  type LightingPreset,
  type PresetKey,
  type SurfaceType,
} from './lightingPresets';
import { useSunPosition, colorTempToHex } from './useSunPosition';

// ── Icon mapping ──────────────────────────────────────────────────────
const ICON_MAP: Record<string, React.ElementType> = {
  Sun,
  Sunrise,
  Cloud,
  Lightbulb,
  Lamp,
  Moon,
};

// ── Types ─────────────────────────────────────────────────────────────
interface MaterialLightingViewerProps {
  albedoUrl: string;
  normalUrl?: string;
  roughnessUrl?: string;
  metalnessUrl?: string;
  materialCategory?: string;
  productName?: string;
}

// ── Surface mesh component ────────────────────────────────────────────
interface MaterialSurfaceProps {
  albedoUrl: string;
  normalUrl?: string;
  roughnessUrl?: string;
  metalnessUrl?: string;
  surfaceType: SurfaceType;
  roughness: number;
  metalness: number;
  clearcoat: number;
  sheen: number;
}

function MaterialSurface({
  albedoUrl,
  normalUrl,
  roughnessUrl,
  metalnessUrl,
  surfaceType,
  roughness,
  metalness,
  clearcoat,
  sheen,
}: MaterialSurfaceProps) {
  // Build texture URL array: always load albedo, conditionally load others
  const textureUrls: string[] = [albedoUrl];
  if (normalUrl) textureUrls.push(normalUrl);
  if (roughnessUrl) textureUrls.push(roughnessUrl);
  if (metalnessUrl) textureUrls.push(metalnessUrl);

  const textures = useTexture(textureUrls);
  const textureArray = Array.isArray(textures) ? textures : [textures];

  let idx = 0;
  const albedoMap = textureArray[idx++] as THREE.Texture;
  const normalMap = normalUrl ? (textureArray[idx++] as THREE.Texture) : undefined;
  const roughnessMap = roughnessUrl ? (textureArray[idx++] as THREE.Texture) : undefined;
  const metalnessMap = metalnessUrl ? (textureArray[idx++] as THREE.Texture) : undefined;

  // Configure repeat wrapping on all textures
  [albedoMap, normalMap, roughnessMap, metalnessMap].forEach((tex) => {
    if (tex) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(2, 2);
    }
  });

  const materialProps = {
    map: albedoMap,
    normalMap: normalMap ?? undefined,
    roughnessMap: roughnessMap ?? undefined,
    metalnessMap: metalnessMap ?? undefined,
    roughness,
    metalness,
    clearcoat,
    sheen,
    sheenColor: new THREE.Color('#ffffff'),
    envMapIntensity: 1,
  };

  switch (surfaceType) {
    case 'floor':
      return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow castShadow>
          <planeGeometry args={[3, 3]} />
          <meshPhysicalMaterial {...materialProps} />
        </mesh>
      );
    case 'column':
      return (
        <mesh position={[0, 0, 0]} receiveShadow castShadow>
          <cylinderGeometry args={[0.5, 0.5, 2, 32]} />
          <meshPhysicalMaterial {...materialProps} />
        </mesh>
      );
    case 'curved':
      return (
        <mesh position={[0, 0, 0]} receiveShadow castShadow>
          <sphereGeometry args={[1.5, 32, 32, 0, Math.PI]} />
          <meshPhysicalMaterial {...materialProps} side={THREE.DoubleSide} />
        </mesh>
      );
    case 'wall':
    default:
      return (
        <mesh position={[0, 0, 0]} receiveShadow castShadow>
          <planeGeometry args={[2, 2]} />
          <meshPhysicalMaterial {...materialProps} />
        </mesh>
      );
  }
}

// ── Shadow ground plane ───────────────────────────────────────────────
function ShadowPlane() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.5, 0]} receiveShadow>
      <planeGeometry args={[10, 10]} />
      <shadowMaterial opacity={0.25} />
    </mesh>
  );
}

// ── Scene lighting sub-component ──────────────────────────────────────
interface SceneLightingProps {
  preset: LightingPreset;
  sunPosition: { x: number; y: number; z: number; intensity: number; colorTemp: number };
}

function SceneLighting({ preset, sunPosition }: SceneLightingProps) {
  const sunColor = colorTempToHex(sunPosition.colorTemp);

  return (
    <>
      <ambientLight intensity={preset.ambientIntensity} />

      {preset.sunEnabled && (
        <directionalLight
          position={[sunPosition.x, sunPosition.y, sunPosition.z]}
          intensity={sunPosition.intensity * preset.sunIntensity}
          color={sunColor}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-near={0.5}
          shadow-camera-far={30}
          shadow-camera-left={-5}
          shadow-camera-right={5}
          shadow-camera-top={5}
          shadow-camera-bottom={-5}
        />
      )}

      {preset.spotlights?.map((spot, i) => (
        <spotLight
          key={`spot-${i}`}
          position={spot.position}
          intensity={spot.intensity}
          angle={spot.angle}
          penumbra={0.5}
          color={spot.color ?? '#ffffff'}
          castShadow
        />
      ))}

      {preset.pointLights?.map((pl, i) => (
        <pointLight
          key={`point-${i}`}
          position={pl.position}
          intensity={pl.intensity}
          color={pl.color}
          decay={2}
        />
      ))}
    </>
  );
}

// ── Screenshot helper (needs to access gl) ────────────────────────────
function ScreenshotHelper({
  screenshotRef,
}: {
  screenshotRef: React.MutableRefObject<(() => void) | null>;
}) {
  const { gl } = useThree();
  screenshotRef.current = () => {
    const canvas = gl.domElement;
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'material-lighting-preview.png';
        a.click();
        URL.revokeObjectURL(url);
      }
    });
  };
  return null;
}

// ── Loading fallback ──────────────────────────────────────────────────
function SceneLoader() {
  return (
    <mesh>
      <boxGeometry args={[0.5, 0.5, 0.5]} />
      <meshStandardMaterial color="#e0d5c9" wireframe />
    </mesh>
  );
}

// ── Time display helper ───────────────────────────────────────────────
function formatTime(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${displayH}:${m.toString().padStart(2, '0')} ${period}`;
}

// ── Surface type labels ───────────────────────────────────────────────
const SURFACE_OPTIONS: { value: SurfaceType; label: string }[] = [
  { value: 'wall', label: 'Wall' },
  { value: 'floor', label: 'Floor' },
  { value: 'column', label: 'Column' },
  { value: 'curved', label: 'Curved' },
];

const ORIENTATION_OPTIONS = [
  { value: 0, label: 'N' },
  { value: 90, label: 'E' },
  { value: 180, label: 'S' },
  { value: 270, label: 'W' },
];

// ── Main component ───────────────────────────────────────────────────
export default function MaterialLightingViewer({
  albedoUrl,
  normalUrl,
  roughnessUrl,
  metalnessUrl,
  materialCategory,
  productName,
}: MaterialLightingViewerProps) {
  const [preset, setPreset] = useState<PresetKey>('natural_daylight');
  const [hour, setHour] = useState(14);
  const [orientation, setOrientation] = useState(180);
  const [surfaceType, setSurfaceType] = useState<SurfaceType>('wall');
  const [roughnessOverride, setRoughnessOverride] = useState<number | null>(null);
  const [clearcoatOverride, setClearcoatOverride] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [tuningOpen, setTuningOpen] = useState(false);

  const screenshotRef = useRef<(() => void) | null>(null);
  const animationRef = useRef<number | null>(null);

  const currentPreset = LIGHTING_PRESETS[preset];
  const sunPosition = useSunPosition(hour, orientation);

  // Resolve material defaults
  const category = materialCategory?.toLowerCase() ?? 'default';
  const defaults = MATERIAL_DEFAULTS[category] ?? MATERIAL_DEFAULTS.default;
  const roughness = roughnessOverride ?? defaults.roughness;
  const clearcoat = clearcoatOverride ?? defaults.clearcoat;

  // Time animation loop
  useEffect(() => {
    if (!playing) {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    let lastTime = performance.now();
    const tick = (now: number) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      setHour((prev) => {
        const next = prev + delta * 0.5; // 0.5 hours per second
        return next > 21 ? 6 : next;
      });
      animationRef.current = requestAnimationFrame(tick);
    };
    animationRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [playing]);

  const handleScreenshot = useCallback(() => {
    if (screenshotRef.current) {
      screenshotRef.current();
    }
  }, []);

  const handleResetTuning = useCallback(() => {
    setRoughnessOverride(null);
    setClearcoatOverride(null);
  }, []);

  return (
    <div className="flex h-full w-full gap-4">
      {/* 3D Canvas */}
      <div className="relative flex-1 overflow-hidden rounded-xl border border-border/50 bg-black/5">
        {productName && (
          <div className="absolute left-3 top-3 z-10">
            <Badge variant="secondary">{productName}</Badge>
          </div>
        )}
        <div className="absolute right-3 top-3 z-10">
          <Button size="sm" variant="secondary" onClick={handleScreenshot}>
            <Camera className="mr-1 h-3.5 w-3.5" />
            Screenshot
          </Button>
        </div>

        <Canvas
          shadows
          gl={{ preserveDrawingBuffer: true, antialias: true }}
          camera={{ position: [0, 0, 4], fov: 45 }}
          className="h-full w-full"
        >
          <Suspense fallback={<SceneLoader />}>
            <Environment
              preset={currentPreset.hdri as 'apartment' | 'studio' | 'sunset' | 'warehouse' | 'forest' | 'night'}
              background={false}
            />
            <SceneLighting preset={currentPreset} sunPosition={sunPosition} />
            <MaterialSurface
              albedoUrl={albedoUrl}
              normalUrl={normalUrl}
              roughnessUrl={roughnessUrl}
              metalnessUrl={metalnessUrl}
              surfaceType={surfaceType}
              roughness={roughness}
              metalness={defaults.metalness}
              clearcoat={clearcoat}
              sheen={defaults.sheen}
            />
            <ShadowPlane />
            <OrbitControls
              enablePan={false}
              minDistance={2}
              maxDistance={8}
              minPolarAngle={Math.PI / 6}
              maxPolarAngle={Math.PI / 1.5}
            />
            <ScreenshotHelper screenshotRef={screenshotRef} />
          </Suspense>
        </Canvas>
      </div>

      {/* Controls Panel */}
      <div className="dashboard-card flex w-72 flex-col gap-4 overflow-y-auto p-4">
        <h3 className="text-sm font-semibold text-foreground/80">Lighting Controls</h3>

        {/* Preset selector */}
        <div>
          <label className="mb-2 block text-xs font-medium text-muted-foreground">
            Preset
          </label>
          <div className="flex flex-wrap gap-1.5">
            {(Object.entries(LIGHTING_PRESETS) as [PresetKey, LightingPreset][]).map(
              ([key, p]) => {
                const Icon = ICON_MAP[p.icon] ?? Sun;
                const isActive = preset === key;
                return (
                  <Button
                    key={key}
                    size="sm"
                    variant={isActive ? 'default' : 'outline'}
                    className="h-8 px-2.5 text-xs"
                    onClick={() => setPreset(key)}
                    title={p.description}
                  >
                    <Icon className="mr-1 h-3 w-3" />
                    {p.name.split(' ')[0]}
                  </Button>
                );
              },
            )}
          </div>
        </div>

        {/* Time of day */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">Time of Day</label>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold tabular-nums text-foreground">
                {formatTime(hour)}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => setPlaying((p) => !p)}
              >
                {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              </Button>
            </div>
          </div>
          <Slider
            min={6}
            max={21}
            step={0.25}
            value={[hour]}
            onValueChange={([v]) => {
              setHour(v);
              if (playing) setPlaying(false);
            }}
          />
        </div>

        {/* Room orientation */}
        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <Compass className="h-3.5 w-3.5 text-muted-foreground" />
            <label className="text-xs font-medium text-muted-foreground">Room Orientation</label>
          </div>
          <div className="flex gap-1.5">
            {ORIENTATION_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                size="sm"
                variant={orientation === opt.value ? 'default' : 'outline'}
                className="h-8 flex-1 px-0 text-xs"
                onClick={() => setOrientation(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Surface type */}
        <div>
          <label className="mb-2 block text-xs font-medium text-muted-foreground">
            Surface Type
          </label>
          <div className="flex gap-1.5">
            {SURFACE_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                size="sm"
                variant={surfaceType === opt.value ? 'default' : 'outline'}
                className="h-8 flex-1 px-0 text-xs"
                onClick={() => setSurfaceType(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Material tuning */}
        <Collapsible open={tuningOpen} onOpenChange={setTuningOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="h-8 w-full justify-between px-2 text-xs">
              Material Tuning
              {tuningOpen ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-3">
            {materialCategory && (
              <Badge variant="outline" className="text-xs">
                {materialCategory}
              </Badge>
            )}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs text-muted-foreground">Roughness</label>
                <span className="text-xs tabular-nums text-foreground">
                  {roughness.toFixed(2)}
                </span>
              </div>
              <Slider
                min={0}
                max={1}
                step={0.01}
                value={[roughness]}
                onValueChange={([v]) => setRoughnessOverride(v)}
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs text-muted-foreground">Clearcoat</label>
                <span className="text-xs tabular-nums text-foreground">
                  {clearcoat.toFixed(2)}
                </span>
              </div>
              <Slider
                min={0}
                max={1}
                step={0.01}
                value={[clearcoat]}
                onValueChange={([v]) => setClearcoatOverride(v)}
              />
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-full text-xs"
              onClick={handleResetTuning}
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              Reset to Defaults
            </Button>
          </CollapsibleContent>
        </Collapsible>

        {/* Current lighting info */}
        <div className="mt-auto rounded-lg bg-foreground/5 p-3">
          <p className="text-xs font-medium text-foreground/70">{currentPreset.name}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{currentPreset.description}</p>
          {currentPreset.sunEnabled && (
            <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
              Sun intensity: {(sunPosition.intensity * currentPreset.sunIntensity).toFixed(1)} |{' '}
              {Math.round(sunPosition.colorTemp)}K
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
