// Capability Registry — the single source of truth for the Agent⇄Page Capability Fabric.
// A "capability" is one business action that should work identically on its PAGE and via the
// AGENT (chat + canvas), staying in sync. Today the same feature is described in up to three
// scattered, drifting places — SIDEBAR_NAV_ITEMS (nav/launcher), agentToolsCatalog.TOOLKITS
// (toolkit picker), and agent-chat AGENT_CONFIGS (tool→agent binding). This registry declares
// each capability ONCE so every surface reads the same definition and can hand off between them.
// Rail #2 of the fabric. It is deliberately additive: it does not replace the three lists yet —
// it links them by id so we can migrate capabilities onto shared rails one at a time. The first
// consumer is the `?capability=<id>` deep-link in the Agent Hub page (rail #3) which resolves the
// owning agent + a toolkit quick-start from here instead of every call site hand-rolling params.
import type { HubId } from './nav-items';
import { HUBS } from './nav-items';

export interface CapabilityDef {
  /** Stable slug — the handoff id used in `?capability=<id>` deep-links. */
  id: string;
  /** Human label (cards, "Open in {Hub}", etc.). */
  label: string;
  /** Which Hub this capability lives under (for launcher grouping + reverse handoff). */
  hub?: HubId;
  /** Overrides the "Open in {…}" button label when the capability has its own dedicated page
   *  distinct from the Hub landing (e.g. Contracts is grouped under Finance but opens /contracts,
   *  so the button should read "Contracts Hub", not "Finance Hub"). Defaults to the Hub label. */
  openInLabel?: string;
  /** Canonical page route (the "open the page" target). Omit for agent-only capabilities. */
  pageRoute?: string;
  /** Owning agent id (agent-chat AGENT_CONFIGS / roster), e.g. 'interior-designer', 'social-media'. */
  agentId?: string;
  /** Primary agent tool name (supabase/functions/_shared/tools/*), e.g. 'material_search'. */
  agentTool?: string;
  /** Toolkit id in agentToolsCatalog.TOOLKITS, e.g. 'core', 'social'. */
  toolkitId?: string;
  /** Optional default quick-start label to fire when handing off to the agent. */
  quickStartLabel?: string;
  /** DB table backing a draft/record both surfaces can open by id (if any). */
  recordTable?: string;
  /** Canvas artifact kind it renders as on the agent canvas (if any). */
  canvasKind?: string;
  /** Paid-module slug gating this capability (mirrors nav moduleSlug), if any. */
  moduleSlug?: string;
}

/**
 * The registry. Seeded with the well-understood capabilities from the inventory; it grows as
 * we migrate more onto the rails. `pageRoute`/`agentTool`/`toolkitId`/`recordTable`/`canvasKind`
 * are left undefined where that surface genuinely doesn't exist yet (those are the fabric gaps).
 */
export const CAPABILITIES: readonly CapabilityDef[] = [
  // ── Search (core, cross-cutting) ──
  { id: 'material-search', label: 'Material Search', pageRoute: '/discover?tab=products&mode=smart', agentId: 'kai', agentTool: 'material_search', toolkitId: 'core', quickStartLabel: 'Find materials', canvasKind: 'products' },
  { id: 'visual-search', label: 'Visual Search', pageRoute: '/discover?tab=products&mode=smart', agentId: 'kai', agentTool: 'visual_search', toolkitId: 'core', canvasKind: 'products' },

  // ── Studio ──
  { id: 'interior', label: 'Interior Design', hub: 'studio', agentId: 'interior-designer', agentTool: 'generate_3d', toolkitId: 'generation', canvasKind: 'render' },
  { id: 'presentation-sheet', label: 'Presentation Sheet', hub: 'studio', agentId: 'interior-designer', agentTool: 'generate_presentation_sheet', toolkitId: 'presentation-sheets', recordTable: 'moodboard_presentation_sheets', canvasKind: 'sheet' },
  { id: 'moodboard', label: 'MoodBoards', hub: 'studio', pageRoute: '/moodboard', recordTable: 'moodboards' },
  { id: 'project', label: 'Projects', hub: 'studio', pageRoute: '/projects', agentId: 'kai', agentTool: 'create_project', toolkitId: 'projects', recordTable: 'projects' },
  { id: 'catalog', label: 'Catalogs', hub: 'studio', pageRoute: '/catalogs', agentId: 'product-business', agentTool: 'create_catalog', toolkitId: 'catalogs', recordTable: 'presentation_catalogs', canvasKind: 'catalog', moduleSlug: 'presentation-catalogs' },
  // Image Studio — agent-only (no page). Shares the `generation` engine with Interior Design; the
  // nav path adds &generation_mode=image-edit to prime the image pipeline. No distinct agentTool
  // exists yet (the toolkit's quick-starts are the surface) — that's a real fabric gap, not a stub.
  { id: 'image-studio', label: 'Image Studio', hub: 'studio', agentId: 'interior-designer', toolkitId: 'generation', canvasKind: 'image' },

  // ── Marketing ──
  { id: 'social-post', label: 'Social Post', hub: 'marketing', agentId: 'social-media', agentTool: 'manage_social', toolkitId: 'social', recordTable: 'social_posts', moduleSlug: 'social-media' },
  { id: 'email-campaign', label: 'Email Campaign', hub: 'marketing', pageRoute: '/marketing/email', agentId: 'kai', agentTool: 'manage_email_campaign', toolkitId: 'email-marketing', recordTable: 'campaigns', moduleSlug: 'email-marketing' },
  { id: 'flow', label: 'Automations', hub: 'marketing', pageRoute: '/automations', agentId: 'kai', agentTool: 'manage_flows', toolkitId: 'flows-toolkit', recordTable: 'flows', moduleSlug: 'flows-toolkit' },
  { id: 'seo-article', label: 'SEO Article', hub: 'marketing', agentId: 'marketing', agentTool: 'create_seo_article', toolkitId: 'seo-article', canvasKind: 'seo' },
  { id: 'seo-research', label: 'SEO Research', hub: 'marketing', agentId: 'marketing', agentTool: 'seo_research_keyword', toolkitId: 'seo-research', canvasKind: 'seo' },
  { id: 'mention-monitoring', label: 'Mention Monitoring', hub: 'marketing', pageRoute: '/mention-monitoring', agentId: 'kai', agentTool: 'track_product_mentions', toolkitId: 'mentions', recordTable: 'tracked_mentions', canvasKind: 'mentions', moduleSlug: 'mention-monitoring' },
  { id: 'price-monitoring', label: 'Price Monitoring', hub: 'sales', pageRoute: '/admin/monitoring', agentId: 'kai', agentTool: 'track_product_prices', toolkitId: 'price-monitoring', recordTable: 'tracked_queries', canvasKind: 'result', moduleSlug: 'price-monitoring' },
  { id: 'messaging', label: 'WhatsApp', hub: 'service', pageRoute: '/messaging', agentId: 'social-media', agentTool: 'manage_messaging', toolkitId: 'messaging', recordTable: 'messaging_channels', moduleSlug: 'messaging' },
  { id: 'inbox', label: 'Inbox', hub: 'service', pageRoute: '/inbox', agentId: 'social-media', agentTool: 'manage_inbox', toolkitId: 'inbox', quickStartLabel: 'Open conversations', recordTable: 'inbox_threads', moduleSlug: 'inbox' },
  { id: 'reviews', label: 'Reviews', hub: 'service', agentId: 'social-media', agentTool: 'manage_reviews', toolkitId: 'reviews', quickStartLabel: 'Unanswered reviews', recordTable: 'profile_reviews', moduleSlug: 'reviews' },

  // ── Sales ──
  { id: 'quote', label: 'Quote', hub: 'sales', pageRoute: '/quotes', agentId: 'erp', agentTool: 'create_quote', toolkitId: 'quotes', recordTable: 'quotes', canvasKind: 'quote', moduleSlug: 'quotes' },
  { id: 'crm-company', label: 'CRM Company', hub: 'sales', pageRoute: '/crm', agentId: 'kai', agentTool: 'create_company_from_vat', toolkitId: 'crm', recordTable: 'crm_companies', moduleSlug: 'crm' },
  { id: 'appointments', label: 'Appointments', hub: 'sales', pageRoute: '/profile?tab=calendar', agentId: 'kai', agentTool: 'manage_appointments', toolkitId: 'appointments', quickStartLabel: 'This week', recordTable: 'crm_meetings', moduleSlug: 'crm' },
  // Sales rep portal — the page is literally "the rep portal for quotes", and the `quotes` toolkit
  // (create_quote / generate_quote_pdf / list_my_quotes) is not admin-gated, so a rep can drive it
  // from chat. Wired to that toolkit; no quickStartLabel so opening it primes the toolkit and shows
  // its quick-starts rather than auto-firing one.
  { id: 'sales', label: 'Sales', hub: 'sales', pageRoute: '/sales', agentId: 'erp', agentTool: 'list_my_quotes', toolkitId: 'quotes' },

  // ── Finance ──
  { id: 'invoice', label: 'Invoice', hub: 'finance', pageRoute: '/finance', agentId: 'kai', agentTool: 'manage_finance', toolkitId: 'finance', recordTable: 'invoices', moduleSlug: 'sales-finance' },
  // App-level Finance (the `invoice` entry above is the record-level capability on the same page).
  { id: 'finance', label: 'Finance', hub: 'finance', pageRoute: '/finance', agentId: 'kai', agentTool: 'manage_finance', toolkitId: 'finance', moduleSlug: 'sales-finance' },
  { id: 'contract', label: 'Contracts', hub: 'finance', openInLabel: 'Contracts Hub', pageRoute: '/contracts', agentId: 'erp', agentTool: 'manage_contracts', toolkitId: 'contracts', recordTable: 'contracts', moduleSlug: 'contracts' },
  { id: 'warehouse', label: 'Warehouse', hub: 'finance', openInLabel: 'Warehouse', pageRoute: '/warehouse', agentId: 'kai', agentTool: 'manage_stock', toolkitId: 'stock', moduleSlug: 'stock' },

  // ── People ──
  { id: 'hr', label: 'HR', hub: 'people', pageRoute: '/hr', agentId: 'kai', agentTool: 'manage_hr', toolkitId: 'hr', moduleSlug: 'hr' },
  // Employee self-service. Deliberately NOT wired to `manage_hr` — that one is manager-facing and
  // RBAC-gated on hr.view, which the hr.self persona doesn't have (it would 403 for exactly this
  // page's user). Instead it uses `manage_my_hr`, whose every action hr-api hard-scopes to the
  // caller's own hr_employees row, so an employee can reach their own record and never a colleague's.
  { id: 'my-hr', label: 'My HR', hub: 'people', pageRoute: '/my-hr', agentId: 'kai', agentTool: 'manage_my_hr', toolkitId: 'my-hr', moduleSlug: 'hr' },
];

const BY_ID = new Map(CAPABILITIES.map((c) => [c.id, c]));

export function getCapability(id: string): CapabilityDef | undefined {
  return BY_ID.get(id);
}

/**
 * Agent result-chunk `type` → capability id. Lets the generic AgentResultCard render a reverse
 * "Open in {Hub}" handoff (rail #3) for the rail-4 capability tools without a bespoke card each.
 * Only types whose capability has a real `pageRoute` will actually show a button (buildPageUrl null-
 * checks). A result may carry a record id in its payload (see RESULT_RECORD_KEY) to deep-link.
 */
export const RESULT_TYPE_CAPABILITY: Record<string, string> = {
  price_tracking_started: 'price-monitoring', price_summary: 'price-monitoring',
  email_campaigns_list: 'email-campaign', email_templates_list: 'email-campaign',
  email_campaign_created: 'email-campaign', email_campaign_sent: 'email-campaign',
  crm_company_created: 'crm-company',
  messaging_channels_list: 'messaging', messaging_sent: 'messaging',
  contracts_list: 'contract', contract_sent: 'contract',
  finance_invoices_list: 'invoice', finance_orders_list: 'invoice', finance_payments_list: 'invoice',
  customer_balance_result: 'invoice', finance_invoice_issued: 'invoice',
  inbox_threads_list: 'inbox', inbox_reply_sent: 'inbox',
};

/** Per-result-type payload key that holds the record id to deep-link (when the page has a detail route). */
export const RESULT_RECORD_KEY: Record<string, string> = {
  crm_company_created: 'company_id',
  finance_invoice_issued: 'invoice_id',
  contract_sent: 'contract_id',
};

/** The "Open in {…}" button label for a capability: the capability's own `openInLabel`
 *  override when set (a dedicated page distinct from its Hub landing), else the Hub label. */
export function capabilityHubLabel(id: string): string | undefined {
  const cap = getCapability(id);
  if (cap?.openInLabel) return cap.openInLabel;
  if (!cap?.hub) return undefined;
  return HUBS.find((h) => h.id === cap.hub)?.label;
}

/**
 * Build the Agent Hub handoff URL for a capability ("send this to the agent"). Prefers a toolkit
 * quick-start (agent + toolkit primed in one hop), else selects the owning agent; carries an
 * optional prompt and record id. Used by page surfaces + the reverse of `?capability=` resolution.
 */
export function buildAgentHandoffUrl(id: string, opts: { prompt?: string; recordId?: string } = {}): string {
  const cap = getCapability(id);
  const params = new URLSearchParams();
  if (cap?.toolkitId && cap.quickStartLabel) {
    params.set('quickstart', `${cap.toolkitId}:${cap.quickStartLabel}`);
  } else if (cap?.agentId) {
    params.set('agent', cap.agentId);
  }
  params.set('capability', id);
  if (opts.recordId) params.set('record', opts.recordId);
  if (opts.prompt) params.set('q', opts.prompt);
  return `/agent-hub?${params.toString()}`;
}

/**
 * Build the "open this in its page/Hub" URL for a capability (reverse handoff from a canvas
 * artifact back to the module page). Appends the record id when the capability's page supports a
 * detail route (`/quotes/:id`, `/finance/invoices/:id`, `/projects/:id`); otherwise returns the
 * list/landing route. Returns null for agent-only capabilities (no page).
 */
export function buildPageUrl(id: string, recordId?: string): string | null {
  const cap = getCapability(id);
  if (!cap?.pageRoute) return null;
  if (recordId && DETAIL_ROUTE_CAPABILITIES.has(id)) {
    return `${cap.pageRoute.replace(/\/$/, '')}/${recordId}`;
  }
  return cap.pageRoute;
}

/** Capabilities whose page is exactly `/{route}/{id}` for a record (so appending the id works).
 *  Invoice is intentionally excluded — its detail route is nested (`/finance/invoices/:id`),
 *  so buildPageUrl('invoice', id) returns the `/finance` list rather than a wrong path. */
const DETAIL_ROUTE_CAPABILITIES = new Set(['quote', 'project']);

/** Resolve the agent + toolkit + quick-start a `?capability=<id>` deep-link should open on the
 *  Agent Hub. `toolkitId` lets the Hub auto-open that toolkit's onboarding (quick-starts) so the
 *  user lands on "here's what you can do" instead of a blank chat. */
export function resolveCapabilityHandoff(id: string): {
  agentId?: string;
  toolkitId?: string;
  quickStart?: { toolkitId: string; label: string };
} {
  const cap = getCapability(id);
  if (!cap) return {};
  return {
    agentId: cap.agentId,
    toolkitId: cap.toolkitId,
    quickStart: cap.toolkitId && cap.quickStartLabel ? { toolkitId: cap.toolkitId, label: cap.quickStartLabel } : undefined,
  };
}
