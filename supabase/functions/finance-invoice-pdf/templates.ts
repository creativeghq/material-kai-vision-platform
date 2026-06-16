// Deno mirror of src/modules/finance/invoice-templates (templates.ts). MUST stay in sync —
// same ids, layout flags, and default colors — so the PDF matches the HTML preview.
import { rgb, type RGB } from 'pdf-lib';

export type HeaderStyle = 'split' | 'band' | 'stacked' | 'minimal';
export type TitleStyle = 'right' | 'left-xl' | 'on-band' | 'center';
export type TotalsBoxStyle = 'plain' | 'boxed' | 'accent';

export interface InvoiceColorsHex {
  accent: string; headerBg: string; headerText: string; tableHeaderBg: string;
  text: string; muted: string; line: string;
}
export interface TemplateSpec {
  id: string;
  headerStyle: HeaderStyle;
  titleStyle: TitleStyle;
  tableHeaderFill: boolean;
  totalsBoxStyle: TotalsBoxStyle;
  defaultColors: InvoiceColorsHex;
}

export const DEFAULT_TEMPLATE_ID = 'classic';

export const TEMPLATES: Record<string, TemplateSpec> = {
  classic: {
    id: 'classic', headerStyle: 'split', titleStyle: 'right', tableHeaderFill: true, totalsBoxStyle: 'plain',
    defaultColors: { accent: '#1f1f1f', headerBg: '#111111', headerText: '#ffffff', tableHeaderBg: '#efeae6', text: '#1c1c1c', muted: '#6b6b6b', line: '#dcdcdc' },
  },
  modern: {
    id: 'modern', headerStyle: 'split', titleStyle: 'left-xl', tableHeaderFill: true, totalsBoxStyle: 'accent',
    defaultColors: { accent: '#2563eb', headerBg: '#f3f4f6', headerText: '#111827', tableHeaderBg: '#f3f4f6', text: '#111827', muted: '#6b7280', line: '#e5e7eb' },
  },
  'accent-header': {
    id: 'accent-header', headerStyle: 'band', titleStyle: 'on-band', tableHeaderFill: true, totalsBoxStyle: 'boxed',
    defaultColors: { accent: '#b08d57', headerBg: '#2f3a4a', headerText: '#ffffff', tableHeaderBg: '#ece7df', text: '#222222', muted: '#6b6b6b', line: '#d8d2c8' },
  },
  minimal: {
    id: 'minimal', headerStyle: 'minimal', titleStyle: 'left-xl', tableHeaderFill: false, totalsBoxStyle: 'plain',
    defaultColors: { accent: '#111111', headerBg: '#ffffff', headerText: '#111111', tableHeaderBg: '#f7f6f4', text: '#1a1a1a', muted: '#8a8a8a', line: '#e5e5e5' },
  },
};

export function getSpec(id: string | null | undefined): TemplateSpec {
  return TEMPLATES[id ?? ''] ?? TEMPLATES[DEFAULT_TEMPLATE_ID];
}

export function resolveColorsHex(id: string | null | undefined, overrides: Record<string, unknown> | null | undefined): InvoiceColorsHex {
  const spec = getSpec(id);
  const out: InvoiceColorsHex = { ...spec.defaultColors };
  if (overrides && typeof overrides === 'object') {
    for (const role of Object.keys(spec.defaultColors) as (keyof InvoiceColorsHex)[]) {
      const v = (overrides as Record<string, unknown>)[role];
      if (typeof v === 'string' && v.trim()) out[role] = v.trim();
    }
  }
  return out;
}

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
