import type { Capability } from '@/auth/capabilities';
import type { TemplateChildSpec, TemplateEditableField, TemplateEntityType } from './types';

/**
 * The DECLARATIVE half of the template registry (issue #322) — deliberately dependency-free.
 *
 * Everything a guard test needs to reason about (which types exist, which columns each one
 * captures) lives here, importing nothing but types. The executable half (`adapters.ts`) pulls in
 * the Supabase client and `projectsService`, which cannot be imported into a hermetic unit test.
 * Splitting them is what lets tests/unit/templateRegistry.test.ts check the allowlists directly
 * rather than regexing source text.
 */

/**
 * Every type the DB accepts — must stay identical to the CHECK constraint
 * `entity_templates_entity_type_check`. Pinned by tests/unit/templateRegistry.test.ts.
 */
export const TEMPLATE_ENTITY_TYPES = [
  'invoice', 'quote', 'project', 'moodboard', 'order',
  'contract', 'expense', 'hr_onboarding', 'crm_company', 'property_listing',
] as const satisfies readonly TemplateEntityType[];

/** Types with a shipped adapter. */
export const LIVE_TEMPLATE_TYPES = ['invoice', 'quote', 'project', 'moodboard'] as const;
export type LiveTemplateEntityType = (typeof LIVE_TEMPLATE_TYPES)[number];

/**
 * Accepted by the DB, not yet offered in the UI: phase 2 of #322 is order / contract / expense,
 * phase 3 is hr_onboarding / crm_company / property_listing. Declaring the gap keeps the guard
 * test able to tell "not built yet" apart from "forgotten".
 */
export const PLANNED_TEMPLATE_TYPES = [
  'order', 'contract', 'expense', 'hr_onboarding', 'crm_company', 'property_listing',
] as const satisfies readonly TemplateEntityType[];

export interface TemplateSchema {
  label: string;
  plural: string;
  description: string;
  sourceTable: string;
  capability?: Capability;
  moduleSlug?: string;
  captureFields: readonly string[];
  captureChildren?: readonly TemplateChildSpec[];
  editableFields?: readonly TemplateEditableField[];
}

export const TEMPLATE_SCHEMAS: Record<LiveTemplateEntityType, TemplateSchema> = {
  invoice: {
    label: 'Invoice',
    plural: 'Invoices',
    description: 'A recurring billing shape — lines, VAT treatment, payment terms and myDATA classification.',
    sourceTable: 'invoices',
    capability: 'finance.manage',
    moduleSlug: 'sales-finance',
    // Deliberately absent: unit_cost_snapshot. `duplicateInvoice` carries it because a same-day
    // copy of one document should show the same margin. A template is reused months later, where
    // a frozen cost is worse than none — the dialog re-snapshots cost from the product.
    captureFields: [
      'document_type', 'currency', 'vat_rate', 'payment_terms_days', 'notes', 'doc_language',
      'prices_include_vat', 'branch_code', 'payment_method_code', 'payment_method_info', 'info_box',
    ],
    captureChildren: [{
      table: 'invoice_items',
      fk: 'invoice_id',
      fields: [
        'description', 'sku', 'quantity', 'unit_price', 'unit', 'measurement_unit_code',
        'discounted_price', 'vat_category', 'vat_exemption_category',
        'income_classification_type', 'income_classification_category', 'line_comments', 'product_id',
      ],
      orderBy: 'added_at',
      label: 'Line items',
    }],
    editableFields: [
      { key: 'notes', label: 'Notes', kind: 'textarea' },
      { key: 'payment_terms_days', label: 'Payment terms (days)', kind: 'number' },
      { key: 'vat_rate', label: 'Default VAT rate (%)', kind: 'number' },
      { key: 'document_type', label: 'myDATA document type', kind: 'text', hint: 'e.g. 1.1 sales invoice, 2.1 service invoice' },
    ],
  },

  quote: {
    label: 'Quote',
    plural: 'Quotes',
    description: 'A ready-made proposal — sections, line items, margin and deposit terms.',
    sourceTable: 'quotes',
    capability: 'quotes.use',
    moduleSlug: 'quotes',
    captureFields: [
      'name', 'notes', 'custom_request_text', 'currency', 'vat_rate', 'margin_pct',
      'deposit_pct', 'cash_discount_pct',
    ],
    captureChildren: [{
      table: 'quote_items',
      fk: 'quote_id',
      fields: [
        'custom_product_name', 'custom_product_description', 'custom_sku', 'custom_unit',
        'quantity', 'unit_price', 'discounted_price', 'room', 'dimensions',
        'installation_requirements', 'notes', 'product_id', 'selected_color', 'selected_size',
      ],
      orderBy: 'added_at',
      label: 'Line items',
    }],
    editableFields: [
      { key: 'name', label: 'Default quote name', kind: 'text' },
      { key: 'notes', label: 'Notes', kind: 'textarea' },
      { key: 'vat_rate', label: 'VAT rate (%)', kind: 'number' },
      { key: 'margin_pct', label: 'Margin (%)', kind: 'number' },
      { key: 'deposit_pct', label: 'Deposit (%)', kind: 'number' },
    ],
  },

  project: {
    label: 'Project',
    plural: 'Projects',
    description: 'A repeatable delivery shape — rooms and the task tree you run every time.',
    sourceTable: 'projects',
    moduleSlug: 'projects',
    // `deadline` is captured by nobody on purpose: an absolute date is meaningless when the
    // template is reused next quarter, and a silently stale deadline reads as a real commitment.
    captureFields: ['name', 'description', 'budget_amount', 'budget_currency'],
    captureChildren: [
      {
        table: 'project_rooms',
        fk: 'project_id',
        fields: ['name', 'room_type', 'sort_order', 'notes'],
        orderBy: 'sort_order',
        label: 'Rooms',
      },
      {
        table: 'project_tasks',
        fk: 'project_id',
        fields: ['title', 'description', 'visibility', 'sort_order', 'is_milestone'],
        orderBy: 'sort_order',
        label: 'Tasks',
        hierarchy: { idField: 'id', parentField: 'parent_task_id' },
      },
    ],
    editableFields: [
      { key: 'name', label: 'Default project name', kind: 'text' },
      { key: 'description', label: 'Description', kind: 'textarea' },
      { key: 'budget_amount', label: 'Budget', kind: 'number' },
      { key: 'budget_currency', label: 'Budget currency', kind: 'text' },
    ],
  },

  moodboard: {
    label: 'Moodboard',
    plural: 'Moodboards',
    description: 'A board shell with the slots you always fill — flooring, walls, joinery, lighting.',
    sourceTable: 'moodboards',
    captureFields: ['title', 'description', 'is_public', 'view_preference'],
    captureChildren: [{
      table: 'moodboard_items',
      fk: 'moodboard_id',
      fields: ['notes', 'position', 'media_url', 'media_type', 'media_title', 'material_id'],
      orderBy: 'position',
      label: 'Slots',
    }],
    editableFields: [
      { key: 'title', label: 'Default board title', kind: 'text' },
      { key: 'description', label: 'Description', kind: 'textarea' },
      { key: 'is_public', label: 'Public board', kind: 'boolean' },
    ],
  },
};
