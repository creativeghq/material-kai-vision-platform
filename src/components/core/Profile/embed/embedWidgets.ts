import { escapeHtml } from '@/utils/escapeHtml';
import type { EmbedKey, EmbedReadiness } from '@/services/embedKeysService';

export type EmbedWidgetId = 'builder' | 'product' | 'place' | 'visualizer' | 'configurator' | 'assistant';

export interface EmbedWidgetDef {
  id: EmbedWidgetId;
  tag: string;
  title: string;
  summary: string;
}

export const EMBED_WIDGETS: EmbedWidgetDef[] = [
  {
    id: 'builder',
    tag: 'materialkai-builder',
    title: 'Product finder',
    summary: 'Visitors describe what they need and see your matching products with prices. When you do not stock it, they send you a quote request.',
  },
  {
    id: 'product',
    tag: 'materialkai-product',
    title: 'Single product',
    summary: 'One product with its price, photos or 3D model and AR, for a page that is already about it.',
  },
  {
    id: 'place',
    tag: 'materialkai-place',
    title: 'Product in place',
    summary: 'Visitors take a photo of their space, or upload one, and place your products on it — move, resize, rotate — then add to cart or ask for a quote. The photo never leaves their device.',
  },
  {
    id: 'visualizer',
    tag: 'materialkai-visualizer',
    title: 'Tile visualizer',
    summary: 'Visitors lay your tile or surface on a room photo at real size and pattern, and get the m², pieces and boxes to order.',
  },
  {
    id: 'configurator',
    tag: 'materialkai-configurator',
    title: 'Configurator',
    summary: 'Visitors build a kitchen or project from one of your blueprints and see the price as they go.',
  },
  {
    id: 'assistant',
    tag: 'materialkai-assistant',
    title: 'Calculators',
    summary: 'Heat-pump sizing, heating-cost and kitchen-cost calculators. Shows none of your catalogue; every enquiry lands in this workspace.',
  },
];

export function widgetDef(id: EmbedWidgetId): EmbedWidgetDef {
  return EMBED_WIDGETS.find((w) => w.id === id) ?? EMBED_WIDGETS[0];
}

/** Which widgets a key can actually serve — a snippet for any other one renders nothing. */
export function widgetsForKey(key: Pick<EmbedKey, 'key_kind' | 'scope_type' | 'tools_enabled'>): EmbedWidgetId[] {
  if (key.key_kind === 'tools') return ['assistant'];
  const out: EmbedWidgetId[] = [];
  if (key.scope_type !== 'blueprints') out.push('builder', 'product', 'place', 'visualizer');
  if (key.scope_type === 'all' || key.scope_type === 'blueprints') out.push('configurator');
  if (key.tools_enabled) out.push('assistant');
  return out;
}

export interface WidgetOptions {
  productId?: string | null;
  blueprintId?: string | null;
  sceneId?: string | null;
  /** Product in place: the merchant's pre-picked set. Empty means every published product. */
  productIds?: string[];
}

/** The attributes the element reads; a required id nobody picked yet stays a visible placeholder. */
export function widgetAttributes(apiKey: string, widget: EmbedWidgetId, opts: WidgetOptions = {}): Array<[string, string]> {
  const attrs: Array<[string, string]> = [['api-key', apiKey]];
  if (widget === 'product') attrs.push(['product-id', opts.productId || 'PRODUCT_ID']);
  if ((widget === 'builder' || widget === 'visualizer') && opts.productId) attrs.push(['product-id', opts.productId]);
  if (widget === 'visualizer' && opts.sceneId) attrs.push(['scene-id', opts.sceneId]);
  if (widget === 'configurator') attrs.push(['blueprint', opts.blueprintId || 'BLUEPRINT_ID']);
  if (widget === 'place' && opts.productIds?.length) attrs.push(['product-ids', opts.productIds.join(',')]);
  return attrs;
}

/** True when the widget can render as configured — the preview waits for this. */
export function widgetIsComplete(widget: EmbedWidgetId, opts: WidgetOptions): boolean {
  if (widget === 'product') return !!opts.productId;
  if (widget === 'configurator') return !!opts.blueprintId;
  return true;
}

export function widgetSnippet(appOrigin: string, apiKey: string, widget: EmbedWidgetId, opts: WidgetOptions = {}): string {
  const tag = widgetDef(widget).tag;
  const attrs = widgetAttributes(apiKey, widget, opts)
    .map(([k, v]) => ` ${k}="${escapeHtml(v)}"`)
    .join('');
  return `<script src="${appOrigin}/embed/materialkai-product.js" defer></script>\n\n<${tag}${attrs}></${tag}>`;
}

export type ReadinessState = 'ready' | 'needs_setup' | 'missing';

export interface ReadinessVerdict {
  state: ReadinessState;
  note: string | null;
}

/** Whether a widget has anything to show yet. Never a blocker: the flow is where it gets set up. */
export function widgetReadiness(widget: EmbedWidgetId, r: EmbedReadiness | null): ReadinessVerdict {
  if (!r) return { state: 'ready', note: null };
  switch (widget) {
    case 'builder':
    case 'product':
    case 'place':
      return r.publishedProducts > 0
        ? { state: 'ready', note: `${r.publishedProducts} published ${r.publishedProducts === 1 ? 'product' : 'products'}` }
        : { state: 'needs_setup', note: 'No products published yet. You can publish them in the next step.' };
    case 'visualizer':
      if (r.publishedProducts === 0) {
        return { state: 'needs_setup', note: 'No products published yet. You can publish them in the next step.' };
      }
      if (r.scenes === 0) return { state: 'needs_setup', note: 'No room photos to lay a surface on yet.' };
      if (r.wastagePatterns === 0) {
        return { state: 'needs_setup', note: 'Order quantities stay hidden until you set a cutting allowance. You can set it in the next step.' };
      }
      return { state: 'ready', note: `${r.scenes} room ${r.scenes === 1 ? 'photo' : 'photos'}, ${r.publishedProducts} published products` };
    case 'configurator':
      if (r.blueprints === 0) return { state: 'missing', note: 'Build a blueprint first.' };
      return r.publishedBlueprints > 0
        ? { state: 'ready', note: `${r.publishedBlueprints} published ${r.publishedBlueprints === 1 ? 'blueprint' : 'blueprints'}` }
        : { state: 'needs_setup', note: 'None of your blueprints is published yet. You can publish one in the next step.' };
    case 'assistant':
      return { state: 'ready', note: null };
  }
}

/** The key settings a new widget implies. A calculators key serves no catalogue. */
export function keyKindForWidget(widget: EmbedWidgetId): 'catalog' | 'tools' {
  return widget === 'assistant' ? 'tools' : 'catalog';
}
