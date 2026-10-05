import { rgb, type RGB } from 'pdf-lib';
import {
  getTemplateSpec, resolveColors, type InvoiceColors, type InvoiceTemplateSpec,
} from '../_shared/finance/invoiceTemplates.generated.ts';

export type TemplateSpec = InvoiceTemplateSpec;
export type InvoiceColorsHex = InvoiceColors;
export const getSpec = getTemplateSpec;
export const resolveColorsHex = resolveColors;

/** #rrggbb / #rgb → pdf-lib RGB (0..1). Falls back to black on parse failure. */
export function hexToRgb(hex: string): RGB {
  let h = (hex ?? '').trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return rgb(0, 0, 0);
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
}

/** Resolved pdf-lib colors for a template + overrides. */
export interface InvoicePdfColors {
  accent: RGB; headerBg: RGB; headerText: RGB; tableHeaderBg: RGB; text: RGB; muted: RGB; line: RGB;
}
export function toPdfColors(c: InvoiceColorsHex): InvoicePdfColors {
  return {
    accent: hexToRgb(c.accent), headerBg: hexToRgb(c.headerBg), headerText: hexToRgb(c.headerText),
    tableHeaderBg: hexToRgb(c.tableHeaderBg), text: hexToRgb(c.text), muted: hexToRgb(c.muted), line: hexToRgb(c.line),
  };
}
