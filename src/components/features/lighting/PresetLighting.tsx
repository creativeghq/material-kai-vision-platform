/**
 * One lighting rig, driven by the shared preset catalogue (#335).
 *
 * `LIGHTING_PRESETS` has existed and been usable in the material lighting viewer for a while —
 * natural daylight, golden hour, overcast, showroom spots, warm evening, night — each carrying its
 * HDRI, sun, ambient and any spot/point lights. Every OTHER 3D surface ignored it and hardcoded
 * three lights and the `apartment` environment, so a tenant could light a material sample the way
 * they wanted and had no say over the product viewer or the room they were planning.
 *
 * This is that catalogue rendered as a component, so the product viewer and the room planner light
 * their scenes from the same source instead of from literals. Nothing new is invented here; the
 * numbers are the ones already written down.
 */
import React, { useEffect } from 'react';
import { Environment } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { LIGHTING_PRESETS, type PresetKey, type LightingPreset } from './lightingPresets';

/** The sun's direction from its altitude, so a low golden-hour sun actually rakes across a room. */
function sunPosition(altitudeDeg: number, distance = 12): [number, number, number] {
  const rad = (altitudeDeg * Math.PI) / 180;
  return [distance * Math.cos(rad), distance * Math.sin(rad), distance * 0.4];
}

export const DEFAULT_PRESET: PresetKey = 'natural_daylight';

interface Props {
  preset?: PresetKey;
  /** Scenes with a floor want shadows; a floating product on a plinth does not need them. */
  castShadow?: boolean;
  /**
   * Tone-mapping exposure (#335). 1 is the renderer's own default, so an unset value changes
   * nothing — a workspace that never opens the settings sees exactly what it saw before.
   */
  exposure?: number;
  /**
   * Show the environment BEHIND the product, not just as light.
   *
   * Off by default: a product shot on a merchant's page usually wants that page's background, and
   * a sudden photographic backdrop is the kind of change a tenant should ask for.
   */
  showBackground?: boolean;
}

/**
 * Exposure lives on the renderer, not on a light, so it has to be set imperatively.
 *
 * Written every time it changes rather than once on mount: the settings UI shows the result live,
 * and a value applied only at mount would need a remount to be seen — which is exactly the sort of
 * "it didn't work" that makes someone stop adjusting.
 */
const Exposure: React.FC<{ value: number }> = ({ value }) => {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.toneMappingExposure = value;
  }, [gl, value]);
  return null;
};

export const PresetLighting: React.FC<Props> = ({
  preset = DEFAULT_PRESET,
  castShadow = false,
  exposure = 1,
  showBackground = false,
}) => {
  // Typed as the interface, not inferred: the catalogue is a plain const, so TS narrows each entry
  // to its own literal shape and `spotlights` then "does not exist" on the presets that omit it.
  const p: LightingPreset =
    (LIGHTING_PRESETS[preset] ?? LIGHTING_PRESETS[DEFAULT_PRESET]) as LightingPreset;

  return (
    <>
      <Exposure value={exposure} />
      <Environment preset={p.hdri as never} background={showBackground} />
      <ambientLight intensity={p.ambientIntensity} />
      {p.sunEnabled && (
        <directionalLight
          position={sunPosition(p.sunAltitude)}
          intensity={p.sunIntensity}
          color={p.sunColor}
          castShadow={castShadow}
        />
      )}
      {/* A fill from the opposite side. Without it an unlit side of a sofa goes to pure black under
          the low-sun presets, which reads as a hole rather than a shadow. */}
      <directionalLight position={[-5, 6, -4]} intensity={p.ambientIntensity * 0.6} />
      {(p.spotlights ?? []).map((s, i) => (
        <spotLight
          key={`spot-${i}`}
          position={s.position}
          intensity={s.intensity}
          angle={s.angle}
          color={s.color}
          penumbra={0.5}
        />
      ))}
      {(p.pointLights ?? []).map((l, i) => (
        <pointLight key={`point-${i}`} position={l.position} intensity={l.intensity} color={l.color} />
      ))}
    </>
  );
};

/** The presets offered in a picker, in catalogue order. */
export const PRESET_OPTIONS = (Object.keys(LIGHTING_PRESETS) as PresetKey[]).map((key) => ({
  key,
  name: LIGHTING_PRESETS[key].name,
  description: LIGHTING_PRESETS[key].description,
}));
