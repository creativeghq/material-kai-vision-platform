import {
  BookOpen, FileSignature, FileSpreadsheet, LayoutTemplate, Mail, Megaphone, MessageCircle, SlidersHorizontal,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { invoiceAdapter, moodboardAdapter, projectAdapter, quoteAdapter } from './adapters';
import { LIVE_TEMPLATE_TYPES, type LiveTemplateEntityType } from './schema';
import type { TemplateAdapter } from './types';

export * from './types';
export {
  LIVE_TEMPLATE_TYPES, PLANNED_TEMPLATE_TYPES, TEMPLATE_ENTITY_TYPES, TEMPLATE_SCHEMAS,
  type LiveTemplateEntityType, type TemplateSchema,
} from './schema';
export {
  buildInvoicePrefill,
  type InvoicePrefill,
  type InvoicePrefillLine,
  type InvoiceTemplatePayload,
  type MoodboardTemplatePayload,
  type ProjectTemplatePayload,
  type QuoteTemplatePayload,
} from './adapters';

/**
 * The template registry (issue #322).
 *
 * The type list exists TWICE and must not drift: `TEMPLATE_ENTITY_TYPES` in schema.ts, and the DB
 * CHECK constraint `entity_templates_entity_type_check`. A type present in one but not the other
 * fails in a specific way — a row the UI cannot render, or an insert that throws a CHECK violation
 * the moment a user presses Save. tests/unit/templateRegistry.test.ts pins them together, the same
 * way workspaceRoles.test.ts pins the role catalog to its CHECK constraints.
 *
 * The Record type below (not Partial) is what guarantees every LIVE type has an adapter: adding a
 * value to LIVE_TEMPLATE_TYPES without an adapter is a typecheck failure, not a runtime surprise.
 */
export const TEMPLATE_ADAPTERS: Record<LiveTemplateEntityType, TemplateAdapter<never>> = {
  invoice: invoiceAdapter as unknown as TemplateAdapter<never>,
  quote: quoteAdapter as unknown as TemplateAdapter<never>,
  project: projectAdapter as unknown as TemplateAdapter<never>,
  moodboard: moodboardAdapter as unknown as TemplateAdapter<never>,
};

export const isLiveTemplateType = (t: string): t is LiveTemplateEntityType =>
  (LIVE_TEMPLATE_TYPES as readonly string[]).includes(t);

export const getAdapter = (t: string): TemplateAdapter<never> | null =>
  (isLiveTemplateType(t) ? TEMPLATE_ADAPTERS[t] : null);

export const requireAdapter = (t: string): TemplateAdapter<never> => {
  const a = getAdapter(t);
  if (!a) throw new Error(`No template adapter for entity type "${t}"`);
  return a;
};

/**
 * Template systems that already exist and already work, surfaced from the same hub so
 * "where are my templates?" has one answer. These are LINKS, not adapters: rebuilding eight
 * working features into a generic payload would be a regression dressed as consistency.
 */
export interface ExternalTemplateSource {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  route: string;
  moduleSlug?: string;
}

export const EXTERNAL_TEMPLATE_SOURCES: readonly ExternalTemplateSource[] = [
  {
    id: 'blueprints',
    label: 'Blueprints',
    description: 'Parametric scope-of-works that rescale from a few measurements and price from your services catalog.',
    icon: LayoutTemplate,
    route: '/blueprints',
  },
  {
    id: 'email-templates',
    label: 'Transactional emails',
    description: 'The email bodies your workspace sends automatically.',
    icon: Mail,
    route: '/admin/emails?tab=templates',
    moduleSlug: 'email',
  },
  {
    id: 'marketing-templates',
    label: 'Marketing emails',
    description: 'Designed campaign templates for bulk sends.',
    icon: Megaphone,
    route: '/marketing/email?tab=templates',
    moduleSlug: 'email-marketing',
  },
  {
    id: 'messaging-templates',
    label: 'WhatsApp messages',
    description: 'Approved WhatsApp / SMS message templates.',
    icon: MessageCircle,
    route: '/admin/messaging?tab=templates',
    moduleSlug: 'messaging',
  },
  {
    id: 'catalog-templates',
    label: 'Catalog designs',
    description: 'Cover, background and accent styling for product catalogs.',
    icon: BookOpen,
    route: '/admin/catalogs',
    moduleSlug: 'presentation-catalogs',
  },
  {
    id: 'invoice-designs',
    label: 'Invoice & PDF designs',
    description: 'How your invoices, quotes and sheets are laid out and branded.',
    icon: FileSignature,
    route: '/finance?tab=settings',
    moduleSlug: 'sales-finance',
  },
  {
    id: 'xml-mappings',
    label: 'XML import mappings',
    description: 'Saved supplier-feed field mappings.',
    icon: FileSpreadsheet,
    route: '/admin/data-import',
  },
];
