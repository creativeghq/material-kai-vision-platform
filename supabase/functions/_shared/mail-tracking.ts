/** Open-tracking pixel for outgoing mail — one shape for Gmail and platform sends. */
import { escapeHtml } from './html.ts';

const PIXEL_PATH = '/functions/v1/mail-track';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isTrackId(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v);
}

export function trackingPixel(trackId: string): string {
  const base = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');
  return `<img src="${base}${PIXEL_PATH}?t=${trackId}" width="1" height="1" alt="" style="border:0;width:1px;height:1px">`;
}

/** The HTML body with the pixel appended; a plain-text send gets an escaped HTML twin to carry it. */
export function withTrackingPixel(html: string | null, text: string, trackId: string): string {
  const body = html ?? `<div style="white-space:pre-wrap">${escapeHtml(text)}</div>`;
  return /<\/body>/i.test(body) ? body.replace(/<\/body>/i, `${trackingPixel(trackId)}</body>`) : body + trackingPixel(trackId);
}

/** Our own views must never fire our own pixel — that would count the sender reading their copy. */
export function stripTrackingPixels(html: string): string {
  return html.replace(/<img\b[^>]*\/functions\/v1\/mail-track\?[^>]*>/gi, '');
}
