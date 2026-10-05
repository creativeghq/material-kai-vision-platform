import { INVOICE_TEMPLATES } from './templateRegistry';
import type { InvoiceColorRole } from './templateRegistry';

export { DEFAULT_TEMPLATE_ID, INVOICE_TEMPLATES, getTemplateSpec, resolveColors } from './templateRegistry';

export const TEMPLATE_OPTIONS: { value: string; label: string; description: string }[] =
  Object.values(INVOICE_TEMPLATES).map((t) => ({ value: t.id, label: t.label, description: t.description }));

export const COLOR_ROLE_LABELS: Record<InvoiceColorRole, string> = {
  accent: 'Accent',
  headerBg: 'Header background',
  headerText: 'Header text',
  tableHeaderBg: 'Table header',
  text: 'Text',
  muted: 'Secondary text',
  line: 'Lines / Borders',
};
