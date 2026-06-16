import type { InvoiceColorRole, InvoiceColors, InvoiceTemplateSpec } from './types';

export const DEFAULT_TEMPLATE_ID = 'classic';

// Order here = order in the settings dropdown. Keep ids/flags/colors identical to the
// Deno copy in supabase/functions/finance-invoice-pdf/templates.ts.
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
    description: 'Bold left title, light header band, colored accent on totals.',
    headerStyle: 'split',
    titleStyle: 'left-xl',
    tableHeaderFill: true,
    totalsBoxStyle: 'accent',
    defaultColors: {
      accent: '#2563eb', headerBg: '#f3f4f6', headerText: '#111827',
      tableHeaderBg: '#f3f4f6', text: '#111827', muted: '#6b7280', line: '#e5e7eb',
    },
  },
  'accent-header': {
    id: 'accent-header',
    label: 'Accent header',
    description: 'Solid colored header band with tinted table header.',
    headerStyle: 'band',
    titleStyle: 'on-band',
    tableHeaderFill: true,
    totalsBoxStyle: 'boxed',
    defaultColors: {
      accent: '#b08d57', headerBg: '#2f3a4a', headerText: '#ffffff',
      tableHeaderBg: '#ece7df', text: '#222222', muted: '#6b6b6b', line: '#d8d2c8',
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
};

export const TEMPLATE_OPTIONS: { value: string; label: string; description: string }[] =
  Object.values(INVOICE_TEMPLATES).map((t) => ({ value: t.id, label: t.label, description: t.description }));

export const COLOR_ROLE_LABELS: Record<InvoiceColorRole, string> = {
  accent: 'Accent',
  headerBg: 'Header background',
  headerText: 'Header text',
  tableHeaderBg: 'Table header',
  text: 'Text',
  muted: 'Secondary text',
  line: 'Lines / borders',
};

export function getTemplateSpec(templateId: string | null | undefined): InvoiceTemplateSpec {
  return INVOICE_TEMPLATES[templateId ?? ''] ?? INVOICE_TEMPLATES[DEFAULT_TEMPLATE_ID];
}

/** Merge saved per-role overrides over the template's defaults; unknown keys ignored. */
export function resolveColors(
  templateId: string | null | undefined,
  overrides: Partial<InvoiceColors> | null | undefined,
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
