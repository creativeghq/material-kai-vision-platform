import { FileText, FolderKanban, Palette, Receipt } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
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
