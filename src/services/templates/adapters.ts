import {
  ArrowUpCircle, Building2, ClipboardCheck, FileSignature, FileText, FolderKanban, Handshake, Palette, Receipt,
  ShoppingCart,
} from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { hrService } from '@/modules/hr/services/hrService';
import { realEstateService } from '@/modules/real-estate/services/realEstateService';
import { projectsService } from '@/modules/projects/services/projectsService';

import { captureRecord, filterVisibleIds } from './capture';
import { childRows, depositPct, num, oneOf, positiveQty, str } from './coerce';
import { TEMPLATE_SCHEMAS } from './schema';
import type { TemplateAdapter, TemplateApplyResult } from './types';

/**
 * Native template adapters (issue #322) — the executable half of the registry; the allowlists and
 * labels live in `schema.ts`. Three rules, all enforced by tests/unit/templateRegistry.test.ts:
 *
 *  1. `captureFields` is an allowlist — no ids, no tokens, no fiscal marks, no derived totals.
 *  2. `apply()` builds an EXPLICIT object literal. The payload is stored jsonb, i.e. untrusted
 *     input; spreading it into `.insert()` is the mass-assignment bug of security invariant 8.
 *  3. Money documents return `{ kind: 'prefill' }` rather than inserting. Same argument
 *     `ordersService.reorderPrefill` already makes for re-orders: a row inserted behind the
 *     operator's back skips numbering, buyer-risk checks, myDATA classification and the
 *     notifications the real form fires.
 */

// ---------------------------------------------------------------------------
// Invoice — prefill only. An invoice is a legal document; a template must never
// conjure one without the operator confirming the customer in the real dialog.
// ---------------------------------------------------------------------------

export interface InvoiceTemplatePayload {
  document_type?: string | null;
  currency?: string | null;
  vat_rate?: number | null;
  payment_terms_days?: number | null;
  notes?: string | null;
  doc_language?: string | null;
  prices_include_vat?: boolean | null;
  branch_code?: number | null;
  payment_method_code?: number | null;
  payment_method_info?: string | null;
  info_box?: string | null;
  invoice_items?: Record<string, unknown>[];
}

/** The line shape `NewInvoiceDialog` accepts as `initialItems` (all-strings form state). */
export interface InvoicePrefillLine {
  description: string;
  sku: string;
  quantity: string;
  unit_price: string;
  unit: string;
  measurement_unit_code: string;
  discount: string;
  vat_category: string;
  vat_exemption: string;
  income_classification_type: string;
  income_classification_category: string;
  line_comments: string;
  product_id?: string | null;
}

export interface InvoicePrefill {
  documentType?: string;
  notes?: string;
  items: InvoicePrefillLine[];
}

export const invoiceAdapter: TemplateAdapter<InvoiceTemplatePayload> = {
  type: 'invoice',
  icon: FileText,
  ...TEMPLATE_SCHEMAS.invoice,
  capture: (sourceId) => captureRecord<InvoiceTemplatePayload>(invoiceAdapter, sourceId),
  async apply(_payload, ctx): Promise<TemplateApplyResult> {
    return {
      kind: 'prefill',
      route: `/finance?tab=doc_invoices&new=invoice&template=${ctx.templateId}`,
      message: 'Opening a new invoice pre-filled from this template — pick the customer to continue.',
    };
  },
  summary(payload) {
    const lines = childRows(payload as never, 'invoice_items').length;
    const out = [`${lines} line${lines === 1 ? '' : 's'}`];
    if (payload.currency) out.push(String(payload.currency));
    if (payload.vat_rate != null) out.push(`${payload.vat_rate}% VAT`);
    if (payload.payment_terms_days != null) out.push(`${payload.payment_terms_days}d terms`);
    return out;
  },
};

/** Turn an invoice template payload into the props `NewInvoiceDialog` already accepts. */
export async function buildInvoicePrefill(payload: InvoiceTemplatePayload): Promise<InvoicePrefill> {
  const rows = childRows(payload as never, 'invoice_items');
  const visible = await filterVisibleIds('products', rows.map((r) => r.product_id as string | null));
  const items: InvoicePrefillLine[] = rows.map((r) => ({
    description: str(r.description) ?? '',
    sku: str(r.sku) ?? '',
    quantity: String(num(r.quantity, 1)),
    unit_price: String(num(r.unit_price, 0)),
    unit: str(r.unit) ?? '',
    measurement_unit_code: r.measurement_unit_code != null ? String(r.measurement_unit_code) : '',
    discount: r.discounted_price != null ? String(num(r.discounted_price, 0)) : '',
    vat_category: r.vat_category != null ? String(r.vat_category) : '',
    vat_exemption: r.vat_exemption_category != null ? String(r.vat_exemption_category) : '',
    income_classification_type: str(r.income_classification_type) ?? '',
    income_classification_category: str(r.income_classification_category) ?? '',
    line_comments: str(r.line_comments) ?? '',
    product_id: typeof r.product_id === 'string' && visible.has(r.product_id) ? r.product_id : null,
  })).filter((l) => l.description.length > 0);

  return {
    documentType: str(payload.document_type) ?? undefined,
    notes: str(payload.notes) ?? undefined,
    items,
  };
}

// ---------------------------------------------------------------------------
// Quote — a draft, not a legal document, so it materializes directly.
// ---------------------------------------------------------------------------

export interface QuoteTemplatePayload {
  name?: string | null;
  notes?: string | null;
  custom_request_text?: string | null;
  currency?: string | null;
  vat_rate?: number | null;
  margin_pct?: number | null;
  deposit_pct?: number | null;
  cash_discount_pct?: number | null;
  quote_items?: Record<string, unknown>[];
}

export const quoteAdapter: TemplateAdapter<QuoteTemplatePayload> = {
  type: 'quote',
  icon: Receipt,
  ...TEMPLATE_SCHEMAS.quote,
  capture: (sourceId) => captureRecord<QuoteTemplatePayload>(quoteAdapter, sourceId),
  async apply(payload, ctx): Promise<TemplateApplyResult> {
    const { data: quote, error } = await supabase
      .from('quotes')
      .insert({
        user_id: ctx.userId,
        workspace_id: ctx.workspaceId,
        name: ctx.title ?? str(payload.name) ?? 'Untitled quote',
        notes: str(payload.notes),
        custom_request_text: str(payload.custom_request_text),
        currency: str(payload.currency) ?? 'EUR',
        vat_rate: payload.vat_rate != null ? num(payload.vat_rate) : null,
        margin_pct: payload.margin_pct != null ? num(payload.margin_pct) : null,
        deposit_pct: depositPct(payload.deposit_pct),
        cash_discount_pct: payload.cash_discount_pct != null ? num(payload.cash_discount_pct) : null,
        project_id: ctx.projectId ?? null,
        // quotes_customer_xor allows AT MOST one — a company wins if a caller supplies both.
        customer_company_id: ctx.customer?.companyId ?? null,
        customer_contact_id: ctx.customer?.companyId ? null : (ctx.customer?.contactId ?? null),
        status: 'draft',
      } as never)
      .select('id')
      .single();
    if (error) throw error;
    const id = (quote as { id: string }).id;

    const rows = childRows(payload as never, 'quote_items');
    if (rows.length) {
      const visible = await filterVisibleIds('products', rows.map((r) => r.product_id as string | null));
      const items = rows.map((r) => ({
        quote_id: id,
        product_id: typeof r.product_id === 'string' && visible.has(r.product_id) ? r.product_id : null,
        custom_product_name: str(r.custom_product_name),
        custom_product_description: str(r.custom_product_description),
        custom_sku: str(r.custom_sku),
        custom_unit: str(r.custom_unit),
        quantity: positiveQty(r.quantity),
        unit_price: num(r.unit_price, 0),
        discounted_price: r.discounted_price != null ? num(r.discounted_price) : null,
        room: str(r.room),
        dimensions: str(r.dimensions),
        installation_requirements: str(r.installation_requirements),
        notes: str(r.notes),
        selected_color: str(r.selected_color),
        selected_size: str(r.selected_size),
        added_from: 'template',
      }));
      const { error: itemsErr } = await supabase.from('quote_items').insert(items as never);
      if (itemsErr) throw itemsErr;
    }

    return { kind: 'created', id, route: `/quotes/${id}`, message: 'Quote created from template.' };
  },
  summary(payload) {
    const rows = childRows(payload as never, 'quote_items');
    const rooms = new Set(rows.map((r) => str(r.room)).filter(Boolean));
    const out = [`${rows.length} line${rows.length === 1 ? '' : 's'}`];
    if (rooms.size) out.push(`${rooms.size} section${rooms.size === 1 ? '' : 's'}`);
    if (payload.currency) out.push(String(payload.currency));
    return out;
  },
};

// ---------------------------------------------------------------------------
// Project — rooms + a (possibly nested) task tree.
// ---------------------------------------------------------------------------

/**
 * `project_tasks_visibility_check` accepts only these two. A payload is stored jsonb, so an
 * unrecognised value must be coerced rather than trusted — otherwise one bad row aborts the whole
 * task tree partway through, leaving a half-built project. (The seeded starters said 'client',
 * which is not a value the column accepts; fixed in migration
 * `fix_starter_project_task_visibility`.)
 */
const taskVisibility = oneOf(['internal', 'client_visible'] as const);
/** `project_rooms_room_type_check`. */
const roomType = oneOf(['bedroom', 'bathroom', 'kitchen', 'living', 'dining', 'office', 'outdoor', 'hallway', 'other'] as const);

export interface ProjectTemplatePayload {
  name?: string | null;
  description?: string | null;
  budget_amount?: number | null;
  budget_currency?: string | null;
  project_rooms?: Record<string, unknown>[];
  project_tasks?: Record<string, unknown>[];
}

export const projectAdapter: TemplateAdapter<ProjectTemplatePayload> = {
  type: 'project',
  icon: FolderKanban,
  ...TEMPLATE_SCHEMAS.project,
  capture: (sourceId) => captureRecord<ProjectTemplatePayload>(projectAdapter, sourceId),
  async apply(payload, ctx): Promise<TemplateApplyResult> {
    const rooms = childRows(payload as never, 'project_rooms');
    const project = await projectsService.createProject({
      name: ctx.title ?? str(payload.name) ?? 'Untitled project',
      description: str(payload.description) ?? undefined,
      budget_amount: payload.budget_amount != null ? num(payload.budget_amount) : null,
      budget_currency: str(payload.budget_currency) ?? 'EUR',
      workspace_id: ctx.workspaceId,
      rooms: rooms.map((r) => ({ name: str(r.name) ?? 'Room', room_type: roomType(r.room_type) as never })),
    });

    // Tasks go in parent-first so a child can reference the id its parent just got. The payload
    // stores `parent_index` — a position in the captured array — never a uuid.
    const tasks = childRows(payload as never, 'project_tasks');
    const idByIndex = new Map<number, string>();
    const parentIndexOf = (t: Record<string, unknown>): number | null => {
      const p = t.parent_index;
      return p === null || p === undefined ? null : num(p, -1);
    };
    const pending = tasks.map((t, i) => ({ t, i }));
    while (pending.length) {
      const ready = pending.filter(({ t }) => {
        const p = parentIndexOf(t);
        return p === null || idByIndex.has(p);
      });
      // A cyclic or dangling parent_index would loop forever; the survivors become roots below.
      if (!ready.length) break;
      for (const { t, i } of ready) {
        const p = parentIndexOf(t);
        const created = await projectsService.createTask({
          project_id: project.id,
          parent_task_id: p === null ? null : idByIndex.get(p) ?? null,
          title: str(t.title) ?? 'Task',
          description: str(t.description),
          visibility: taskVisibility(t.visibility) ?? undefined,
          sort_order: num(t.sort_order, i),
          is_milestone: t.is_milestone === true,
        });
        idByIndex.set(i, created.id);
        pending.splice(pending.findIndex((x) => x.i === i), 1);
      }
    }
    for (const { t, i } of pending) {
      await projectsService.createTask({
        project_id: project.id,
        title: str(t.title) ?? 'Task',
        description: str(t.description),
        sort_order: num(t.sort_order, i),
      });
    }

    return { kind: 'created', id: project.id, route: `/projects/${project.id}`, message: 'Project created from template.' };
  },
  summary(payload) {
    const rooms = childRows(payload as never, 'project_rooms').length;
    const tasks = childRows(payload as never, 'project_tasks').length;
    const out: string[] = [];
    if (rooms) out.push(`${rooms} room${rooms === 1 ? '' : 's'}`);
    out.push(`${tasks} task${tasks === 1 ? '' : 's'}`);
    if (payload.budget_amount != null) out.push(`${payload.budget_amount} ${payload.budget_currency ?? ''}`.trim());
    return out;
  },
};

// ---------------------------------------------------------------------------
// Moodboard — a board shell plus placeholder / product slots.
// ---------------------------------------------------------------------------

export interface MoodboardTemplatePayload {
  title?: string | null;
  description?: string | null;
  is_public?: boolean | null;
  view_preference?: string | null;
  moodboard_items?: Record<string, unknown>[];
}

/** `moodboards_view_preference_check` / `moodboard_items_media_type_check`. */
const viewPreference = oneOf(['grid', 'list'] as const);
const mediaType = oneOf(['image', 'video', 'vr_world'] as const);

export const moodboardAdapter: TemplateAdapter<MoodboardTemplatePayload> = {
  type: 'moodboard',
  icon: Palette,
  ...TEMPLATE_SCHEMAS.moodboard,
  capture: (sourceId) => captureRecord<MoodboardTemplatePayload>(moodboardAdapter, sourceId),
  async apply(payload, ctx): Promise<TemplateApplyResult> {
    const { data: board, error } = await supabase
      .from('moodboards')
      .insert({
        user_id: ctx.userId,
        title: ctx.title ?? str(payload.title) ?? 'Untitled board',
        description: str(payload.description),
        is_public: payload.is_public === true,
        view_preference: viewPreference(payload.view_preference) ?? 'grid',
        project_id: ctx.projectId ?? null,
      } as never)
      .select('id')
      .single();
    if (error) throw error;
    const id = (board as { id: string }).id;

    const rows = childRows(payload as never, 'moodboard_items');
    if (rows.length) {
      const visible = await filterVisibleIds('products', rows.map((r) => r.material_id as string | null));
      const items = rows.map((r, i) => ({
        moodboard_id: id,
        material_id: typeof r.material_id === 'string' && visible.has(r.material_id) ? r.material_id : null,
        notes: str(r.notes),
        position: num(r.position, i),
        media_url: str(r.media_url),
        media_type: mediaType(r.media_type),
        media_title: str(r.media_title),
      }));
      const { error: itemsErr } = await supabase.from('moodboard_items').insert(items as never);
      if (itemsErr) throw itemsErr;
    }

    return { kind: 'created', id, route: `/moodboard/${id}`, message: 'Moodboard created from template.' };
  },
  summary(payload) {
    const slots = childRows(payload as never, 'moodboard_items').length;
    const out = [`${slots} slot${slots === 1 ? '' : 's'}`];
    if (payload.is_public) out.push('Public');
    return out;
  },
};

// ---------------------------------------------------------------------------
// Order — prefill. `ordersService.reorderPrefill` already makes the argument for
// this exact shape: an order inserted behind the operator skips numbering, stock
// reservation, three-way match and the order-created notification, and re-books a
// stale price as if it were current. A template is staler still.
// ---------------------------------------------------------------------------

export interface OrderTemplatePayload {
  order_type?: string | null;
  currency?: string | null;
  notes?: string | null;
  discount_type?: string | null;
  discount_value?: number | null;
  order_items?: Record<string, unknown>[];
}

/**
 * A prefill line for `NewOrderModal`.
 *
 * `vat_percent` rather than the form's `vat_code`: the percent→code table (`VAT_CATEGORIES` /
 * `vatCodeOf`) lives in OrdersPanel with the form that uses it. Duplicating it here would be a
 * second copy of the VAT vocabulary, so the caller maps it and drops this field.
 */
export interface OrderPrefillLine {
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  unit_cost: number | null;
  unit_code?: string;
  vat_percent: number | null;
}

export interface OrderPrefill {
  orderType: 'sales' | 'purchase';
  currency: string;
  notes: string;
  lines: OrderPrefillLine[];
}

const orderKind = oneOf(['sales', 'purchase'] as const);

export const orderAdapter: TemplateAdapter<OrderTemplatePayload> = {
  type: 'order',
  icon: ShoppingCart,
  ...TEMPLATE_SCHEMAS.order,
  capture: (sourceId) => captureRecord<OrderTemplatePayload>(orderAdapter, sourceId),
  async apply(_payload, ctx): Promise<TemplateApplyResult> {
    return {
      kind: 'prefill',
      route: `/finance?tab=doc_orders&new=order&template=${ctx.templateId}`,
      message: 'Opening a new order pre-filled from this template — pick the party to continue.',
    };
  },
  summary(payload) {
    const lines = childRows(payload as never, 'order_items').length;
    const out = [`${lines} line${lines === 1 ? '' : 's'}`];
    const k = orderKind(payload.order_type);
    if (k) out.push(k === 'sales' ? 'Sales' : 'Purchase');
    if (payload.currency) out.push(String(payload.currency));
    return out;
  },
};

/** Turn an order template payload into the props `NewOrderModal` already accepts. */
export async function buildOrderPrefill(payload: OrderTemplatePayload): Promise<OrderPrefill> {
  const rows = childRows(payload as never, 'order_items');
  const visible = await filterVisibleIds('products', rows.map((r) => r.product_id as string | null));
  const lines: OrderPrefillLine[] = rows.map((r) => ({
    product_id: typeof r.product_id === 'string' && visible.has(r.product_id) ? r.product_id : null,
    description: str(r.description) ?? '',
    quantity: positiveQty(r.quantity),
    unit_price: num(r.unit_price, 0),
    // Cost is deliberately not carried (see the schema note); the form resolves today's.
    unit_cost: null,
    unit_code: str(r.measurement_unit_code) ?? undefined,
    vat_percent: r.vat_percent != null ? num(r.vat_percent) : null,
  })).filter((l) => l.description.length > 0);

  return {
    orderType: orderKind(payload.order_type) ?? 'purchase',
    currency: str(payload.currency) ?? 'EUR',
    notes: str(payload.notes) ?? '',
    lines,
  };
}

// ---------------------------------------------------------------------------
// Contract — prefill. A template supplies the WORDS, never the party, and
// `contracts_subject_ck` requires a subject on every row: an hr contract needs an
// employee, a project contract a project, a finance contract at least a
// counterparty name. So there is no honest "create it from the template alone" —
// the terms fill the real form, which already knows what it is mounted under.
// ---------------------------------------------------------------------------

export interface ContractTemplatePayload {
  context?: string | null;
  contract_type?: string | null;
  title?: string | null;
  body_markdown?: string | null;
  currency?: string | null;
}

/** `contracts_context_check`. */
const contractContext = oneOf(['hr', 'finance', 'project', 'realestate'] as const);
const CONTEXT_LABEL: Record<string, string> = {
  hr: 'HR', finance: 'Finance', project: 'Project', realestate: 'Real estate',
};

export const contractAdapter: TemplateAdapter<ContractTemplatePayload> = {
  type: 'contract',
  icon: FileSignature,
  ...TEMPLATE_SCHEMAS.contract,
  capture: (sourceId) => captureRecord<ContractTemplatePayload>(contractAdapter, sourceId),
  async apply(_payload, ctx): Promise<TemplateApplyResult> {
    return {
      kind: 'prefill',
      route: `/contracts?new=contract&template=${ctx.templateId}`,
      message: 'Opening a new contract with these terms — add the counterparty to continue.',
    };
  },
  summary(payload) {
    const out: string[] = [];
    const c = contractContext(payload.context);
    if (c) out.push(CONTEXT_LABEL[c]);
    if (payload.contract_type) out.push(String(payload.contract_type).replace(/_/g, ' '));
    const words = str(payload.body_markdown)?.split(/\s+/).length ?? 0;
    if (words) out.push(`${words} words`);
    return out;
  },
};

// ---------------------------------------------------------------------------
// Expense — prefill into the real payable form, which owns the payee pick, the
// VAT split and the pay-now-or-book-as-payable decision.
// ---------------------------------------------------------------------------

export interface ExpenseTemplatePayload {
  currency?: string | null;
  notes?: string | null;
  category_id?: string | null;
  /**
   * Synthetic keys — see SYNTHETIC_PAYLOAD_FIELDS. On a bill these are typed inputs rather than
   * derivations, but a payload key literally called `subtotal_net` would be indistinguishable
   * from the stored-total mistake tests/unit/templateRegistry.test.ts exists to catch.
   */
  default_amount?: number | null;
  default_vat_amount?: number | null;
}

export interface ExpensePrefill {
  amount?: number;
  vatAmount?: number;
  description?: string;
  categoryId?: string;
}

export const expenseAdapter: TemplateAdapter<ExpenseTemplatePayload> = {
  type: 'expense',
  icon: ArrowUpCircle,
  ...TEMPLATE_SCHEMAS.expense,
  async capture(sourceId) {
    const base = await captureRecord<ExpenseTemplatePayload>(expenseAdapter, sourceId);
    const { data, error } = await supabase
      .from('supplier_bills')
      .select('subtotal_net, vat_amount')
      .eq('id', sourceId)
      .maybeSingle();
    if (error) throw error;
    const row = (data ?? {}) as { subtotal_net?: number | null; vat_amount?: number | null };
    return {
      ...base,
      default_amount: row.subtotal_net != null ? num(row.subtotal_net) : null,
      default_vat_amount: row.vat_amount != null ? num(row.vat_amount) : null,
    };
  },
  async apply(_payload, ctx): Promise<TemplateApplyResult> {
    return {
      kind: 'prefill',
      route: `/finance?tab=doc_expenses&new=expense&template=${ctx.templateId}`,
      message: 'Opening a new expense pre-filled from this template — pick the payee to continue.',
    };
  },
  summary(payload) {
    const out: string[] = [];
    if (payload.default_amount != null) out.push(`${payload.default_amount} net`);
    if (payload.default_vat_amount != null) out.push(`${payload.default_vat_amount} VAT`);
    if (payload.currency) out.push(String(payload.currency));
    return out.length ? out : ['No default amount'];
  },
};

/** Turn an expense template payload into the props `NewExpenseDialog` already accepts. */
export async function buildExpensePrefill(payload: ExpenseTemplatePayload): Promise<ExpensePrefill> {
  // A category is a workspace-scoped row: a template copied between workspaces (or outliving the
  // category) must not carry a dangling id into the form's Select.
  const visible = await filterVisibleIds('finance_categories', [payload.category_id ?? null]);
  const categoryId = typeof payload.category_id === 'string' && visible.has(payload.category_id)
    ? payload.category_id
    : undefined;
  return {
    amount: payload.default_amount != null ? num(payload.default_amount) : undefined,
    vatAmount: payload.default_vat_amount != null ? num(payload.default_vat_amount) : undefined,
    description: str(payload.notes) ?? undefined,
    categoryId,
  };
}

// ---------------------------------------------------------------------------
// Onboarding checklist — the tasks, applied to ONE employee.
//
// The parent allowlist is empty on purpose (see the schema note): an employee
// record is personal data and none of it belongs in a template that gets copied
// between workspaces.
// ---------------------------------------------------------------------------

export interface HrOnboardingTemplatePayload {
  hr_onboarding_tasks?: Record<string, unknown>[];
}

export const hrOnboardingAdapter: TemplateAdapter<HrOnboardingTemplatePayload> = {
  type: 'hr_onboarding',
  icon: ClipboardCheck,
  ...TEMPLATE_SCHEMAS.hr_onboarding,
  capture: (sourceId) => captureRecord<HrOnboardingTemplatePayload>(hrOnboardingAdapter, sourceId),
  async apply(payload, ctx): Promise<TemplateApplyResult> {
    // A checklist belongs to somebody. Without an employee there is nothing to attach it to, so
    // send the user to the place where they can pick one rather than inventing a subject.
    if (!ctx.hrEmployeeId) {
      return {
        kind: 'prefill',
        route: '/hr?tab=onboarding',
        message: 'Pick an employee on the Onboarding board, then apply this checklist to them.',
      };
    }

    const rows = childRows(payload as never, 'hr_onboarding_tasks');
    let added = 0;
    for (const t of rows) {
      const title = str(t.title);
      if (!title) continue;
      await hrService.addOnboardingTask(ctx.workspaceId, {
        employee_id: ctx.hrEmployeeId,
        title,
        description: str(t.description) ?? undefined,
      });
      added += 1;
    }
    return {
      kind: 'created',
      id: ctx.hrEmployeeId,
      route: '/hr?tab=onboarding',
      message: `${added} onboarding task${added === 1 ? '' : 's'} added.`,
    };
  },
  summary(payload) {
    const n = childRows(payload as never, 'hr_onboarding_tasks').length;
    return [`${n} task${n === 1 ? '' : 's'}`];
  },
};

// ---------------------------------------------------------------------------
// Property listing — created as a DRAFT, like the ordinary "New listing" button
// (`RealEstatePage.createDraft`), just with the template's defaults instead of a
// bare placeholder. A draft listing is private (`listing_status: 'draft'`,
// `is_public: false`) and publishing stays a separate, gated decision, so there
// is nothing here that needs the operator's sign-off first.
//
// The template is the KIND of listing and the copy you always start from; the
// address, the price and the vendor belong to one property and are never captured.
// ---------------------------------------------------------------------------

export interface PropertyListingTemplatePayload {
  property_type?: string | null;
  subtype?: string | null;
  transaction_type?: string | null;
  currency?: string | null;
  country_code?: string | null;
  condition?: string | null;
  energy_class?: string | null;
  heating_type?: string | null;
  /** TEXT on `properties`, not a boolean — the form's own placeholder is "yes / no / partial". */
  furnished?: string | null;
  description_i18n?: Record<string, unknown> | null;
  features?: string[] | null;
  amenities?: string[] | null;
}

/** `properties_property_type_check` / `properties_transaction_type_check`. */
const propertyType = oneOf(['residential', 'commercial', 'land', 'other'] as const);
const transactionType = oneOf(['sale', 'rent', 'short_let', 'business_transfer', 'auction'] as const);

export const propertyListingAdapter: TemplateAdapter<PropertyListingTemplatePayload> = {
  type: 'property_listing',
  icon: Building2,
  ...TEMPLATE_SCHEMAS.property_listing,
  capture: (sourceId) => captureRecord<PropertyListingTemplatePayload>(propertyListingAdapter, sourceId),
  async apply(payload, ctx): Promise<TemplateApplyResult> {
    // Field by field — `real-estate-api` allowlists on its side too, but the payload is stored
    // jsonb and must not be handed over wholesale from this one either.
    const property = await realEstateService.createProperty(ctx.workspaceId, {
      title: ctx.title ?? 'Untitled listing',
      property_type: propertyType(payload.property_type) ?? 'residential',
      subtype: str(payload.subtype),
      transaction_type: transactionType(payload.transaction_type) ?? 'sale',
      listing_status: 'draft',
      currency: str(payload.currency) ?? 'EUR',
      country_code: str(payload.country_code) ?? 'GR',
      condition: str(payload.condition),
      energy_class: str(payload.energy_class),
      heating_type: str(payload.heating_type),
      furnished: str(payload.furnished),
      description_i18n: payload.description_i18n && typeof payload.description_i18n === 'object'
        ? payload.description_i18n : {},
      features: Array.isArray(payload.features) ? payload.features.filter((f) => typeof f === 'string') : [],
      amenities: Array.isArray(payload.amenities) ? payload.amenities.filter((a) => typeof a === 'string') : [],
    });
    return {
      kind: 'created',
      id: property.id,
      route: `/properties/${property.id}`,
      message: 'Draft listing created — add the address and price.',
    };
  },
  summary(payload) {
    const out: string[] = [];
    if (payload.property_type) out.push(String(payload.property_type));
    const tx = transactionType(payload.transaction_type);
    if (tx) out.push(tx === 'sale' ? 'For sale' : tx === 'rent' ? 'To let' : tx.replace(/_/g, ' '));
    const feats = (payload.features?.length ?? 0) + (payload.amenities?.length ?? 0);
    if (feats) out.push(`${feats} feature${feats === 1 ? '' : 's'}`);
    return out;
  },
};

// ---------------------------------------------------------------------------
// Customer terms — the one type that UPDATES rather than creates.
//
// A CRM party is found or created through the duplicate search (Greek script and
// Latin stems both), never conjured by a template: a silently-created company is
// precisely the failure that search exists to prevent. So what a company template
// usefully carries is the COMMERCIAL TERMS — pricing level, discount, credit,
// payment days — applied to a company you already have.
// ---------------------------------------------------------------------------

export interface CrmCompanyTemplatePayload {
  is_customer?: boolean | null;
  is_supplier?: boolean | null;
  user_level_key?: string | null;
  discount_percent?: number | null;
  discount_notes?: string | null;
  credit_limit?: number | null;
  payment_terms_days?: number | null;
  min_order_value?: number | null;
  prices_vat_inclusive?: boolean | null;
  include_in_myf?: boolean | null;
  contact_group?: string | null;
  vat_exemption_reason?: string | null;
}

/** `undefined` for an absent key, so a preset that says nothing about a field leaves it alone. */
const numOrKeep = (v: unknown): number | null | undefined =>
  (v === undefined ? undefined : v === null ? null : num(v));
const boolOrKeep = (v: unknown): boolean | undefined =>
  (v === undefined || v === null ? undefined : v === true);
const strOrKeep = (v: unknown): string | null | undefined =>
  (v === undefined ? undefined : str(v));

export const crmCompanyAdapter: TemplateAdapter<CrmCompanyTemplatePayload> = {
  type: 'crm_company',
  icon: Handshake,
  ...TEMPLATE_SCHEMAS.crm_company,
  capture: (sourceId) => captureRecord<CrmCompanyTemplatePayload>(crmCompanyAdapter, sourceId),
  async apply(payload, ctx): Promise<TemplateApplyResult> {
    const companyId = ctx.customer?.companyId ?? null;
    if (!companyId) {
      return {
        kind: 'prefill',
        route: '/crm?tab=companies',
        message: 'Open a company and apply these terms from its Commercial tab.',
      };
    }

    // Explicit field by field, and only the keys the preset actually carries — a preset about
    // discount must not blank someone's credit limit just by being silent on it.
    const patch: Record<string, unknown> = {};
    const set = (k: string, v: unknown) => { if (v !== undefined) patch[k] = v; };
    set('is_customer', boolOrKeep(payload.is_customer));
    set('is_supplier', boolOrKeep(payload.is_supplier));
    set('user_level_key', strOrKeep(payload.user_level_key));
    set('discount_percent', numOrKeep(payload.discount_percent));
    set('discount_notes', strOrKeep(payload.discount_notes));
    set('credit_limit', numOrKeep(payload.credit_limit));
    set('payment_terms_days', numOrKeep(payload.payment_terms_days));
    set('min_order_value', numOrKeep(payload.min_order_value));
    set('prices_vat_inclusive', boolOrKeep(payload.prices_vat_inclusive));
    set('include_in_myf', boolOrKeep(payload.include_in_myf));
    set('contact_group', strOrKeep(payload.contact_group));
    set('vat_exemption_reason', strOrKeep(payload.vat_exemption_reason));

    if (Object.keys(patch).length) {
      const { error } = await supabase.from('crm_companies').update(patch as never).eq('id', companyId);
      if (error) throw error;
    }

    return {
      kind: 'applied',
      id: companyId,
      route: `/crm/companies/${companyId}`,
      message: 'Terms applied to this company.',
    };
  },
  summary(payload) {
    const out: string[] = [];
    if (payload.discount_percent != null) out.push(`${payload.discount_percent}% discount`);
    if (payload.payment_terms_days != null) out.push(`${payload.payment_terms_days}d terms`);
    if (payload.credit_limit != null) out.push(`credit ${payload.credit_limit}`);
    if (payload.is_supplier && !payload.is_customer) out.push('Supplier');
    else if (payload.is_customer && !payload.is_supplier) out.push('Customer');
    return out.length ? out : ['No terms set'];
  },
};
