/**
 * Record links — turning an id in an agent tool payload into somewhere the reader can GO.
 *
 * Every agent result card renders through `AgentResultCard`, and that card deliberately HID every
 * uuid it was handed (`isPlumbing`) because a raw id is not information. True, and it threw away
 * the only thing that could have made the card interactive: a list of six expenses was a dead
 * table, the supplier each row is about survived only as a fragment of a `notes` string, and the
 * one place in the product that knows where a company lives — the ⌘K palette — was never asked.
 *
 * So this module answers three questions for ANY payload, which is what makes it work for every
 * tool at once rather than for the one that prompted it:
 *
 *   1. `recordKindForIdKey('supplier_company_id')` → `'company'`   — what does this id point AT?
 *   2. `labelKeyForIdKey('supplier_company_id', row)` → `'supplier_name'` — which cell is its NAME?
 *   3. `recordRoute('company', id, ctx)` → `/crm/companies/:id`   — where does it OPEN?
 *
 * **The routes are not written here.** `GLOBAL_SEARCH_KINDS` (globalSearchService) already declares
 * where each kind opens AND the capability/module gates that must match the guard on that route —
 * written by reading the router, and guarded by `globalSearchKinds.test.ts`. A second copy of that
 * table is exactly the drift this codebase keeps paying for, so the shared kinds are DERIVED from
 * it and only the kinds the palette does not search (`EXTRA_RECORD_KINDS`) are declared below.
 *
 * A kind with no page of its own — an expense, a payment, a contract — is not a gap: those live in
 * the peek dialog (`get_record_peek`), and their `listRoute` is the honest secondary destination.
 * Offering "open the record" for a URL that opens a list is the "button whose whole effect is to
 * name a place" failure, so the two are different fields and the UI labels them differently.
 *
 * @see tests/unit/recordLinks.test.ts
 */
import { Receipt, Banknote, FileSignature, Inbox, type LucideIcon } from 'lucide-react';

import { FINANCE_TAB, financeTabUrl } from '@/modules/finance/routes';

import {
  GLOBAL_SEARCH_KINDS,
  type GlobalSearchKind,
  type SearchRouteContext,
  type KindGateContext,
} from '@/config/searchKinds';
import type { Capability } from '@/auth/capabilities';

/** Kinds that exist only as a row in somebody's list — no page, no palette entry. */
export type ExtraRecordKind = 'expense' | 'payment' | 'contract' | 'inbound_document';

export type RecordKind = GlobalSearchKind | ExtraRecordKind;

export interface RecordLinkSpec {
  kind: RecordKind;
  /** Singular noun for one of these ("Company", "Expense") — used in link text and dialog chrome. */
  label: string;
  icon: LucideIcon;
  /**
   * The record's OWN page. Null when the kind has no detail route: those records are described by
   * the peek dialog and reached through `listRoute`.
   */
  route: ((id: string, ctx: SearchRouteContext) => string) | null;
  /** Where records of this kind live, when there is no per-record page. */
  listRoute?: string;
  requireAnyCapability?: readonly Capability[];
  moduleSlug?: string;
  requireWorkspaceManager?: boolean;
  /** `get_record_peek` models this kind, so a click can open the detail dialog in place. */
  peekable: boolean;
}

/**
 * Kinds `get_record_peek` describes. Kept beside the SQL it mirrors — a kind marked peekable that
 * the function does not model shows an empty dialog, which reads as "this record is empty" rather
 * than "nobody wired this up".
 */
const PEEKABLE = new Set<RecordKind>([
  'company', 'contact', 'deal', 'order', 'invoice', 'quote',
  'project', 'product', 'property', 'expense', 'payment', 'contract',
  'inbound_document',
]);

/**
 * The three kinds the palette cannot search — none has a record page, all three are listed by
 * agent tools every day. Gates mirror the surface each one lives on.
 */
const EXTRA_RECORD_KINDS: readonly RecordLinkSpec[] = [
  {
    kind: 'expense',
    label: 'Expense',
    icon: Receipt,
    route: null,
    // Through `financeTabUrl`, not spelled out: the Orders pane is keyed `doc_orders`, and every
    // stored order notification carried `?tab=orders` until that was found — a valid URL that
    // opens Finance with no pane selected and a blank body.
    listRoute: financeTabUrl(FINANCE_TAB.expenses),
    requireAnyCapability: ['finance.manage'],
    moduleSlug: 'sales-finance',
    peekable: true,
  },
  {
    kind: 'payment',
    label: 'Payment',
    icon: Banknote,
    route: null,
    listRoute: financeTabUrl(FINANCE_TAB.payments),
    requireAnyCapability: ['finance.manage'],
    moduleSlug: 'sales-finance',
    peekable: true,
  },
  {
    kind: 'contract',
    label: 'Contract',
    icon: FileSignature,
    route: null,
    listRoute: '/contracts',
    moduleSlug: 'contracts',
    peekable: true,
  },
  {
    // A document a supplier filed against us on myDATA — which may or may not be an expense in our
    // books yet. Distinct from `expense` on purpose: the workspace measured here had 1,866 of these
    // and 2 booked, and collapsing the two is what made the agent answer "2" to "the expenses we
    // get from myAADE".
    kind: 'inbound_document',
    label: 'myDATA document',
    icon: Inbox,
    route: null,
    listRoute: financeTabUrl(FINANCE_TAB.expenseSuppliers),
    requireAnyCapability: ['finance.manage'],
    moduleSlug: 'sales-finance',
    peekable: true,
  },
];

/** Singular labels for the palette kinds, whose own `label` is a plural group heading. */
const SINGULAR_LABEL: Partial<Record<GlobalSearchKind, string>> = {
  person: 'Person',
  company: 'Company',
  contact: 'Contact',
  deal: 'Deal',
  product: 'Product',
  project: 'Project',
  moodboard: 'Moodboard',
  quote: 'Quote',
  order: 'Order',
  invoice: 'Invoice',
  property: 'Property',
  catalog: 'Catalog',
  blueprint: 'Blueprint',
  template: 'Template',
  email_template: 'Email template',
  conversation: 'Agent chat',
  inbox_thread: 'Inbox thread',
};

export const RECORD_LINKS: readonly RecordLinkSpec[] = [
  ...GLOBAL_SEARCH_KINDS.map((spec): RecordLinkSpec => ({
    kind: spec.kind,
    label: SINGULAR_LABEL[spec.kind] ?? spec.label,
    icon: spec.icon,
    route: (id, ctx) =>
      spec.route({ kind: spec.kind, id, title: '', subtitle: null, badge: null, matchRank: 2 }, ctx),
    requireAnyCapability: spec.requireAnyCapability,
    moduleSlug: spec.moduleSlug,
    requireWorkspaceManager: spec.requireWorkspaceManager,
    peekable: PEEKABLE.has(spec.kind),
  })),
  ...EXTRA_RECORD_KINDS,
];

const BY_KIND = new Map<RecordKind, RecordLinkSpec>(RECORD_LINKS.map((s) => [s.kind, s]));

export function recordSpec(kind: string | null | undefined): RecordLinkSpec | undefined {
  return kind ? BY_KIND.get(kind as RecordKind) : undefined;
}

/**
 * The same gates `allowedSearchKinds` applies, for the same reason: a link that opens onto a
 * permission wall is worse than no link. A kind the persona cannot reach renders as plain text.
 */
export function canOpenRecordKind(kind: string, ctx: KindGateContext): boolean {
  const spec = recordSpec(kind);
  if (!spec) return false;
  if (spec.requireAnyCapability?.length && !spec.requireAnyCapability.some(ctx.can)) return false;
  if (spec.moduleSlug && !ctx.isModuleAvailable(spec.moduleSlug)) return false;
  if (spec.requireWorkspaceManager && !ctx.isWorkspaceManager) return false;
  return true;
}

/** The record's own page, or null when the kind only exists as a row in a list. */
export function recordRoute(kind: string, id: string, ctx: SearchRouteContext): string | null {
  const spec = recordSpec(kind);
  if (!spec?.route || !id) return null;
  return spec.route(id, ctx);
}

/** Where this kind lives when it has no page: the list it is a row of. */
export function recordListRoute(kind: string): string | null {
  return recordSpec(kind)?.listRoute ?? null;
}

// ── id key → kind ───────────────────────────────────────────────────────────
//
// Matched by SUFFIX, longest first, so every prefixed variant a tool invents is covered without
// enumerating it: `supplier_company_id`, `customer_company_id`, `counterparty_company_id` and
// `brand_company_id` all resolve through the one `company_id` entry. That generality is the point —
// a tool shipped next month gets linked rows without touching this file.
const ID_SUFFIX_KIND: ReadonlyArray<readonly [string, RecordKind]> = ([
  ['supplier_bill_id', 'expense'],
  ['company_id', 'company'],
  ['contact_id', 'contact'],
  ['expense_id', 'expense'],
  ['payment_id', 'payment'],
  ['contract_id', 'contract'],
  ['invoice_id', 'invoice'],
  ['order_id', 'order'],
  ['quote_id', 'quote'],
  ['deal_id', 'deal'],
  ['project_id', 'project'],
  ['product_id', 'product'],
  ['material_id', 'product'],
  ['property_id', 'property'],
  ['listing_id', 'property'],
  ['moodboard_id', 'moodboard'],
  ['catalog_id', 'catalog'],
  ['blueprint_id', 'blueprint'],
  ['bill_id', 'expense'],
] as Array<[string, RecordKind]>)
  // Longest suffix first, so `supplier_bill_id` never matches the shorter `bill_id` entry.
  .sort((a, b) => b[0].length - a[0].length);

/**
 * What does this id point at? `null` for a key that is plumbing (`workspace_id`, `category_id`,
 * `job_id`) — deliberately conservative, because a wrong guess sends the reader somewhere real and
 * wrong, which is harder to notice than no link at all.
 */
export function recordKindForIdKey(key: string): RecordKind | null {
  const k = key.toLowerCase();
  if (!k.endsWith('_id')) return null;
  for (const [suffix, kind] of ID_SUFFIX_KIND) {
    if (k === suffix || k.endsWith(`_${suffix}`)) return kind;
  }
  return null;
}

/**
 * Which sibling key holds the NAME of the record `idKey` points at, so the link can read
 * "ΑΠΟΣΤΟΛΙΔΗΣ ΑΕΒΕ" instead of a uuid. Tries the id key's own base first
 * (`supplier_company_id` → `supplier_company_name`), then the base with the entity word trimmed
 * (`supplier` → `supplier_name`, `supplier`), which is how tools actually name these columns.
 */
export function labelKeyForIdKey(idKey: string, row: Record<string, unknown>): string | null {
  const base = idKey.replace(/_id$/i, '');
  const short = base.replace(/_(company|contact|bill)$/i, '');
  const bases = short && short !== base ? [base, short] : [base];
  for (const b of bases) {
    for (const suffix of ['_name', '_number', '_title', '_label', '']) {
      const candidate = `${b}${suffix}`;
      const v = row[candidate];
      if (typeof v === 'string' && v.trim() !== '') return candidate;
    }
  }
  return null;
}

// ── the row itself ──────────────────────────────────────────────────────────

/**
 * A payload list key → what its rows ARE. Keyed on the list's own name rather than on the result
 * type, because that is the half a new tool cannot get wrong: a tool that returns `{expenses: […]}`
 * is returning expenses whatever it calls its chunk.
 */
const LIST_KEY_KIND: Record<string, RecordKind> = {
  expenses: 'expense', bills: 'expense', supplier_bills: 'expense',
  payments: 'payment',
  orders: 'order', purchase_orders: 'order',
  invoices: 'invoice',
  quotes: 'quote',
  contracts: 'contract',
  deals: 'deal',
  companies: 'company', suppliers: 'company', customers: 'company', manufacturers: 'company',
  contacts: 'contact', leads: 'contact',
  products: 'product', materials: 'product',
  projects: 'project',
  properties: 'property', listings: 'property',
  moodboards: 'moodboard',
  catalogs: 'catalog',
  threads: 'inbox_thread',
};

/**
 * Result types whose list key does not say what it holds. Deliberately short — every entry here is
 * a name only a human can map, and the list-key rule covers the rest.
 */
const RESULT_TYPE_ROW_KIND: Record<string, RecordKind> = {
  // `documents` is deliberately NOT in LIST_KEY_KIND: it is a word several tools use for
  // completely different things (`my_hr_documents` among them), and a wrong link goes somewhere
  // real and wrong. Keyed on the chunk instead.
  mydata_expense_documents: 'inbound_document',
  mydata_expense_suppliers: 'company',
  price_lookup_matches: 'product',
  find_products_by_spec_result: 'product',
  related_products_result: 'product',
  products_in_project_result: 'product',
  products_by_brand_result: 'product',
  projects_using_product_result: 'project',
  real_estate_properties: 'property',
  real_estate_leads: 'contact',
  crm_kad_results: 'company',
};

/**
 * What kind of record is this row? A row that names its own `kind` wins — `record_search_results`
 * returns a heterogeneous list and says so per row, and honouring that makes the cross-entity
 * search card interactive for free.
 */
export function rowRecordKind(
  row: Record<string, unknown>,
  listKey?: string,
  resultType?: string,
): RecordKind | null {
  const own = typeof row?.kind === 'string' ? row.kind : null;
  if (own && BY_KIND.has(own as RecordKind)) return own as RecordKind;
  // The list's own key beats the chunk type: a result may carry several arrays, and only the key
  // travels with the one being rendered. The type map is the fallback for lists whose key
  // ("matches", "records") does not name what it holds.
  if (listKey && LIST_KEY_KIND[listKey.toLowerCase()]) return LIST_KEY_KIND[listKey.toLowerCase()];
  if (resultType && RESULT_TYPE_ROW_KIND[resultType]) return RESULT_TYPE_ROW_KIND[resultType];
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RecordRef {
  kind: RecordKind;
  id: string;
  /** What to call it on screen — the row's own name where the payload carries one. */
  title?: string | null;
}

/** The record a table row IS, when the payload carries an id for it. */
export function rowRecordRef(
  row: Record<string, unknown>,
  listKey?: string,
  resultType?: string,
): RecordRef | null {
  const kind = rowRecordKind(row, listKey, resultType);
  if (!kind) return null;
  let raw = row.id ?? row[`${kind}_id`];
  if (typeof raw !== 'string' || !UUID_RE.test(raw)) {
    // The row's own id under a PREFIXED key — `inbound_issuers_summary` calls a company's id
    // `crm_company_id`, and requiring `id`/`company_id` left every one of those rows dead. Only a
    // key pointing at this row's OWN kind qualifies, so an expense's `supplier_company_id` (a
    // company, not an expense) can never be mistaken for the row itself.
    const own = Object.entries(row ?? {}).find(
      ([k, v]) => typeof v === 'string' && UUID_RE.test(v) && recordKindForIdKey(k) === kind,
    );
    raw = own?.[1];
  }
  const id = typeof raw === 'string' && UUID_RE.test(raw) ? raw : null;
  if (!id) return null;
  return { kind, id };
}

/** Every OTHER record this row points at — one ref per id key it carries. */
export function relatedRecordRefs(row: Record<string, unknown>): Array<RecordRef & { key: string }> {
  const refs: Array<RecordRef & { key: string }> = [];
  for (const [key, value] of Object.entries(row ?? {})) {
    if (typeof value !== 'string' || !UUID_RE.test(value)) continue;
    const kind = recordKindForIdKey(key);
    if (!kind) continue;
    const labelKey = labelKeyForIdKey(key, row);
    refs.push({ key, kind, id: value, title: labelKey ? String(row[labelKey]) : null });
  }
  return refs;
}
