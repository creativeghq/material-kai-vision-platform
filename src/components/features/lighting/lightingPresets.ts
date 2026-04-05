export interface LightingPreset {
  name: string;
  icon: string;
  hdri: string;
  sunEnabled: boolean;
  sunIntensity: number;
  sunColor: string;
  sunAltitude: number;
  ambientIntensity: number;
  description: string;
  spotlights?: Array<{
    position: [number, number, number];
    intensity: number;
    angle: number;
    color?: string;
  }>;
  pointLights?: Array<{
    position: [number, number, number];
    intensity: number;
    color: string;
  }>;
}

export const LIGHTING_PRESETS = {
  natural_daylight: {
    name: 'Natural Daylight',
    icon: 'Sun',
    hdri: 'apartment',
    sunEnabled: true,
    sunIntensity: 1.8,
    sunColor: '#fff5e6',
    sunAltitude: 60,
    ambientIntensity: 0.4,
    description: 'Bright midday sun through a window',
  },
  golden_hour: {
    name: 'Golden Hour',
    icon: 'Sunrise',
    hdri: 'sunset',
    sunEnabled: true,
    sunIntensity: 1.4,
    sunColor: '#ffb347',
    sunAltitude: 15,
    ambientIntensity: 0.3,
    description: 'Warm low-angle light at sunrise or sunset',
  },
  overcast: {
    name: 'Overcast',
    icon: 'Cloud',
    hdri: 'forest',
    sunEnabled: false,
    sunIntensity: 0,
    sunColor: '#c8d6e5',
    sunAltitude: 45,
    ambientIntensity: 0.8,
    description: 'Soft diffused light with no harsh shadows',
  },
  showroom_spots: {
    name: 'Showroom Spots',
    icon: 'Lightbulb',
    hdri: 'studio',
    sunEnabled: false,
    sunIntensity: 0,
    sunColor: '#ffffff',
    sunAltitude: 0,
    ambientIntensity: 0.2,
    description: 'Focused spotlights typical of retail showrooms',
    spotlights: [
      { position: [0, 3, 2], intensity: 2.5, angle: 0.4, color: '#ffffff' },
      { position: [-2, 3, 0], intensity: 1.8, angle: 0.35, color: '#fff8f0' },
      { position: [2, 3, 0], intensity: 1.8, angle: 0.35, color: '#fff8f0' },
    ],
  },
  warm_evening: {
    name: 'Warm Evening',
    icon: 'Lamp',
    hdri: 'warehouse',
    sunEnabled: false,
    sunIntensity: 0,
    sunColor: '#ff9f43',
    sunAltitude: 0,
    ambientIntensity: 0.15,
    description: 'Interior evening lighting with warm lamps',
    pointLights: [
      { position: [-2, 2, 1], intensity: 1.5, color: '#ffb347' },
      { position: [2, 1.5, -1], intensity: 1.0, color: '#ffa07a' },
      { position: [0, 2.5, 2], intensity: 0.8, color: '#ffd700' },
    ],
  },
  night: {
    name: 'Night',
    icon: 'Moon',
    hdri: 'night',
    sunEnabled: false,
    sunIntensity: 0,
    sunColor: '#4a6fa5',
    sunAltitude: 0,
    ambientIntensity: 0.08,
    description: 'Moonlit ambiance with cool tones',
    pointLights: [
      { position: [0, 3, 2], intensity: 0.6, color: '#b0c4de' },
      { position: [-1, 2, -1], intensity: 0.3, color: '#6495ed' },
    ],
  },
} as const satisfies Record<string, LightingPreset>;

export type PresetKey = keyof typeof LIGHTING_PRESETS;
export type SurfaceType = 'wall' | 'floor' | 'column' | 'curved';

export const MATERIAL_DEFAULTS: Record<
  string,
  { roughness: number; metalness: number; clearcoat: number; sheen: number }
> = {
  ceramic: { roughness: 0.4, metalness: 0, clearcoat: 0.3, sheen: 0 },
  wood: { roughness: 0.7, metalness: 0, clearcoat: 0, sheen: 0.1 },
  metal: { roughness: 0.2, metalness: 0.9, clearcoat: 0, sheen: 0 },
  fabric: { roughness: 0.9, metalness: 0, clearcoat: 0, sheen: 0.5 },
  stone: { roughness: 0.3, metalness: 0, clearcoat: 0.5, sheen: 0 },
  glass: { roughness: 0.1, metalness: 0, clearcoat: 0.8, sheen: 0 },
  default: { roughness: 0.5, metalness: 0, clearcoat: 0, sheen: 0 },
};
