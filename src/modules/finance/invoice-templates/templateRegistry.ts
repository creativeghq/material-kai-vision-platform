// The invoice design registry, read by the React preview AND the pdf-lib generator, so the two
// cannot disagree about a template's layout or colors. Mirrored to Deno by `npm run vocab:mirror`;
// keep it import-free.

export type InvoiceColorRole = 'accent' | 'headerBg' | 'headerText' | 'tableHeaderBg' | 'text' | 'muted' | 'line';

export type InvoiceColors = Record<InvoiceColorRole, string>;

export type HeaderStyle = 'split' | 'band' | 'stacked' | 'minimal' | 'sidebar' | 'commercial';
export type TitleStyle = 'right' | 'left-xl' | 'on-band' | 'center';
export type TotalsBoxStyle = 'plain' | 'boxed' | 'accent' | 'accent-text';

export interface InvoiceTemplateSpec {
  id: string;
  label: string;
  description: string;
  defaultColors: InvoiceColors;
  headerStyle: HeaderStyle;
  titleStyle: TitleStyle;
  /** Whether the line-items header row gets a filled background (tableHeaderBg). */
  tableHeaderFill: boolean;
  totalsBoxStyle: TotalsBoxStyle;
}

export const DEFAULT_TEMPLATE_ID = 'classic';

/** Order here = order in the settings dropdown. */
export const INVOICE_TEMPLATES: Record<string, InvoiceTemplateSpec> = {
  classic: {
    id: 'classic',
    label: 'Classic',
    description: 'Centered wordmark, thin hairline rules, monochrome.',
    headerStyle: 'split',
    titleStyle: 'right',
    tableHeaderFill: true,
    totalsBoxStyle: 'plain',
    defaultColors: {
      accent: '#1f1f1f', headerBg: '#111111', headerText: '#ffffff',
      tableHeaderBg: '#efeae6', text: '#1c1c1c', muted: '#6b6b6b', line: '#dcdcdc',
    },
  },
  modern: {
    id: 'modern',
    label: 'Modern',
    description: 'Indigo side wordmark, right-aligned title, accent totals and bank block.',
    headerStyle: 'sidebar',
    titleStyle: 'right',
    tableHeaderFill: false,
    totalsBoxStyle: 'accent-text',
    defaultColors: {
      accent: '#4f46e5', headerBg: '#ffffff', headerText: '#111827',
      tableHeaderBg: '#f3f4f6', text: '#1f2433', muted: '#6b7280', line: '#e5e7eb',
    },
  },
  minimal: {
    id: 'minimal',
    label: 'Minimal',
    description: 'Oversized title, generous whitespace, muted labels.',
    headerStyle: 'minimal',
    titleStyle: 'left-xl',
    tableHeaderFill: false,
    totalsBoxStyle: 'plain',
    defaultColors: {
      accent: '#111111', headerBg: '#ffffff', headerText: '#111111',
      tableHeaderBg: '#f7f6f4', text: '#1a1a1a', muted: '#8a8a8a', line: '#e5e5e5',
    },
  },
  commercial: {
    id: 'commercial',
    label: 'Commercial',
    description: 'Logo left / QR right, three icon columns (order · bill-to · ship-to), code+comment line items, and a large amount-due. Modeled on a Greek delivery-style receipt.',
    headerStyle: 'commercial',
    titleStyle: 'right',
    tableHeaderFill: false,
    totalsBoxStyle: 'plain',
    defaultColors: {
      accent: '#0e7490', headerBg: '#ffffff', headerText: '#111111',
      tableHeaderBg: '#f4f7f8', text: '#1c1c1c', muted: '#6b6b6b', line: '#e2e2e2',
    },
  },
};

export function getTemplateSpec(templateId: string | null | undefined): InvoiceTemplateSpec {
  return INVOICE_TEMPLATES[templateId ?? ''] ?? INVOICE_TEMPLATES[DEFAULT_TEMPLATE_ID];
}

/** Merge saved per-role overrides over the template's defaults; unknown keys ignored. */
export function resolveColors(
  templateId: string | null | undefined,
  overrides: Partial<InvoiceColors> | Record<string, unknown> | null | undefined,
): InvoiceColors {
  const spec = getTemplateSpec(templateId);
  const out: InvoiceColors = { ...spec.defaultColors };
  if (overrides && typeof overrides === 'object') {
    for (const role of Object.keys(spec.defaultColors) as InvoiceColorRole[]) {
      const v = (overrides as Record<string, unknown>)[role];
      if (typeof v === 'string' && v.trim()) out[role] = v.trim();
    }
  }
  return out;
}
