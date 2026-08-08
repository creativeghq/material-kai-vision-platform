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
export const LIVE_TEMPLATE_TYPES = [
  'invoice', 'quote', 'project', 'moodboard', 'order', 'contract', 'expense',
  'hr_onboarding', 'property_listing', 'crm_company',
] as const;
export type LiveTemplateEntityType = (typeof LIVE_TEMPLATE_TYPES)[number];

/**
 * Accepted by the DB, not yet offered in the UI. Declaring the gap keeps the guard test able to
 * tell "not built yet" apart from "forgotten". Empty today — every type has an adapter.
 */
export const PLANNED_TEMPLATE_TYPES = [] as const satisfies readonly TemplateEntityType[];

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

  order: {
    label: 'Order',
    plural: 'Orders',
    description: 'A standing basket — the lines you buy or sell together every time.',
    sourceTable: 'orders',
    capability: 'finance.manage',
    moduleSlug: 'sales-finance',
    captureFields: ['order_type', 'currency', 'notes', 'discount_type', 'discount_value'],
    captureChildren: [{
      table: 'order_items',
      fk: 'order_id',
      // No `unit_cost`: `ordersService.reorderPrefill` already argues that re-booking an old cost
      // silently mis-states margin on the first line. A template is staler than a past order.
      // No net_value / vat_amount / line_total either — computeOrderLines derives all three.
      fields: [
        'description', 'quantity', 'unit_price', 'measurement_unit_code', 'vat_percent',
        'vat_category', 'discount_pct', 'sort_order', 'product_id', 'update_warehouse',
      ],
      orderBy: 'sort_order',
      label: 'Line items',
    }],
    editableFields: [
      { key: 'notes', label: 'Notes', kind: 'textarea' },
      { key: 'currency', label: 'Currency', kind: 'text' },
    ],
  },

  contract: {
    label: 'Contract',
    plural: 'Contracts',
    description: 'Boilerplate terms you re-issue — NDA, service agreement, supplier framework.',
    moduleSlug: 'contracts',
    sourceTable: 'contracts',
    // No counterparty, no dates, and deliberately no `value`: a contract's agreed sum belongs to
    // one deal. A template that carries last year's number into a new agreement is worse than one
    // that carries none.
    captureFields: ['context', 'contract_type', 'title', 'body_markdown', 'currency'],
    editableFields: [
      { key: 'title', label: 'Default contract title', kind: 'text' },
      { key: 'contract_type', label: 'Contract type', kind: 'text' },
      { key: 'body_markdown', label: 'Terms (markdown)', kind: 'textarea' },
    ],
  },

  expense: {
    label: 'Expense',
    plural: 'Expenses',
    description: 'A payable you enter again and again — rent, retainers, subscriptions.',
    sourceTable: 'supplier_bills',
    capability: 'finance.manage',
    moduleSlug: 'sales-finance',
    // Amounts are captured by the adapter under `default_amount` / `default_vat_amount`, NOT under
    // the column names: on a bill they are typed inputs rather than derivations, but a payload key
    // called `subtotal_net` would be indistinguishable from the stored-total mistake the guard
    // test exists to catch. `notes` is the description shown on the bill.
    captureFields: ['currency', 'notes', 'category_id'],
    editableFields: [
      { key: 'notes', label: 'Description', kind: 'textarea' },
      { key: 'currency', label: 'Currency', kind: 'text' },
    ],
  },

  hr_onboarding: {
    label: 'Onboarding checklist',
    plural: 'Onboarding checklists',
    description: 'The tasks every new starter goes through — applied to an employee in one step.',
    sourceTable: 'hr_employees',
    capability: 'hr.view',
    moduleSlug: 'hr',
    // EMPTY ON PURPOSE. The parent here is an employee, and an employee record is personal data:
    // salary, AMKA, start date, PIN hash. None of it belongs in a reusable checklist, and the
    // safest allowlist is the empty one. The checklist lives entirely in the child rows.
    captureFields: [],
    captureChildren: [{
      table: 'hr_onboarding_tasks',
      fk: 'employee_id',
      // No due_date (an absolute date means nothing next hire), no assignee (a person), no status.
      fields: ['title', 'description', 'sort_order'],
      orderBy: 'sort_order',
      label: 'Tasks',
    }],
  },

  property_listing: {
    label: 'Listing',
    plural: 'Listings',
    description: 'A listing shell — type, condition, boilerplate copy. Address and price stay per property.',
    sourceTable: 'properties',
    capability: 'realestate.view',
    moduleSlug: 'real-estate',
    // No address, no price, no reference_code, no tokens: those identify ONE property. What a
    // template usefully carries is the kind of listing and the copy you always start from.
    captureFields: [
      'property_type', 'subtype', 'transaction_type', 'currency', 'country_code',
      'condition', 'energy_class', 'heating_type', 'furnished', 'description_i18n',
      'features', 'amenities',
    ],
    editableFields: [
      { key: 'subtype', label: 'Subtype', kind: 'text' },
      { key: 'condition', label: 'Condition', kind: 'text' },
      { key: 'furnished', label: 'Furnished', kind: 'text', hint: 'Free text on the listing — yes / no / partial.' },
      { key: 'energy_class', label: 'Energy class', kind: 'text' },
      { key: 'country_code', label: 'Country code', kind: 'text' },
    ],
  },

  crm_company: {
    label: 'Customer terms',
    plural: 'Customer terms',
    description: 'A commercial-terms preset — pricing level, discount, credit and payment terms.',
    sourceTable: 'crm_companies',
    capability: 'crm.view',
    moduleSlug: 'crm',
    // TERMS ONLY. No name, VAT number, address, email, phone or billing block: those identify one
    // company, and a CRM party is found or created through the duplicate search — never conjured
    // from a template. That is why this type UPDATES a company you already have rather than
    // creating one.
    captureFields: [
      'is_customer', 'is_supplier', 'user_level_key', 'discount_percent', 'discount_notes',
      'credit_limit', 'payment_terms_days', 'min_order_value', 'prices_vat_inclusive',
      'include_in_myf', 'contact_group', 'vat_exemption_reason',
    ],
    editableFields: [
      { key: 'discount_percent', label: 'Discount %', kind: 'number' },
      { key: 'payment_terms_days', label: 'Payment terms (days)', kind: 'number' },
      { key: 'credit_limit', label: 'Credit limit', kind: 'number' },
      { key: 'min_order_value', label: 'Minimum order value', kind: 'number' },
      { key: 'discount_notes', label: 'Discount notes', kind: 'textarea' },
      { key: 'prices_vat_inclusive', label: 'Show prices VAT-inclusive', kind: 'boolean' },
    ],
  },
};

/**
 * Payload keys an adapter writes itself rather than copying from a column. They are listed here so
 * the guard test can tell a deliberate synthetic key from a typo, and so the editor knows they are
 * editable even though no column is called that.
 */
export const SYNTHETIC_PAYLOAD_FIELDS: Partial<Record<LiveTemplateEntityType, readonly TemplateEditableField[]>> = {
  expense: [
    { key: 'default_amount', label: 'Amount (net)', kind: 'number' },
    { key: 'default_vat_amount', label: 'VAT amount', kind: 'number', hint: 'The tax on the net above — not folded into it.' },
  ],
};
