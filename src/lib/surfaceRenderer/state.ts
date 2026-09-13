/** A render, as the URL carries it: share links, QR codes, compare and kiosk all read this. */
import { PATTERNS, type Pattern } from './patternVocabulary';

export interface RenderState {
  sceneId: string | null;
  surfaceKey: string | null;
  productId: string | null;
  pattern: Pattern;
  groutWidthMm: number;
  groutColorHex: string;
  rotationDeg: number;
}

export const DEFAULT_RENDER_STATE: RenderState = {
  sceneId: null,
  surfaceKey: null,
  productId: null,
  pattern: 'stack',
  groutWidthMm: 3,
  groutColorHex: '#b8b4ad',
  rotationDeg: 0,
};

const HEX = /^#[0-9a-f]{6}$/i;

export function parseRenderState(params: URLSearchParams): RenderState {
  const pattern = params.get('pattern');
  const grout = Number(params.get('grout'));
  const rot = Number(params.get('rot'));
  const color = params.get('groutColor');
  return {
    sceneId: params.get('scene'),
    surfaceKey: params.get('surface'),
    productId: params.get('product'),
    pattern: (PATTERNS as readonly string[]).includes(pattern ?? '') ? (pattern as Pattern) : DEFAULT_RENDER_STATE.pattern,
    groutWidthMm: Number.isFinite(grout) && grout >= 0 && grout <= 20 ? grout : DEFAULT_RENDER_STATE.groutWidthMm,
    groutColorHex: color && HEX.test(color) ? color.toLowerCase() : DEFAULT_RENDER_STATE.groutColorHex,
    rotationDeg: Number.isFinite(rot) ? ((rot % 360) + 360) % 360 : 0,
  };
}

export function serializeRenderState(state: RenderState): URLSearchParams {
  const p = new URLSearchParams();
  if (state.sceneId) p.set('scene', state.sceneId);
  if (state.surfaceKey) p.set('surface', state.surfaceKey);
  if (state.productId) p.set('product', state.productId);
  if (state.pattern !== DEFAULT_RENDER_STATE.pattern) p.set('pattern', state.pattern);
  if (state.groutWidthMm !== DEFAULT_RENDER_STATE.groutWidthMm) p.set('grout', String(state.groutWidthMm));
  if (state.groutColorHex !== DEFAULT_RENDER_STATE.groutColorHex) p.set('groutColor', state.groutColorHex);
  if (state.rotationDeg !== 0) p.set('rot', String(state.rotationDeg));
  return p;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = HEX.test(hex) ? hex : DEFAULT_RENDER_STATE.groutColorHex;
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
