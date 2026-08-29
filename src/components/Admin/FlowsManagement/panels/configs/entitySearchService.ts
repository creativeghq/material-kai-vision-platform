import { usersAPI, contactsAPI, companiesAPI } from '@/services/crm.service';
import { quotesService } from '@/modules/quotes/services/QuotesService';
import { moodboardAPI } from '@/services/moodboardAPI';
import { agentChatHistoryService } from '@/services/agents/agentChatHistoryService';
import { supabase } from '@/integrations/supabase/client';

// ─── Types ───────────────────────────────────────────────
export type EntityType =
  | 'user'
  | 'product'
  | 'contact'
  | 'company'
  | 'edge_function'
  | 'moodboard'
  | 'quote'
  | 'conversation';

export interface EntityResult {
  id: string;
  label: string;
  sublabel?: string;
}

// ─── Edge functions ──────────────────────────────────────
// GENERATED from scripts/edge-endpoints.json — the same catalogue that builds the public
// OpenAPI spec. Do not hand-edit: tests/unit/edgeFunctionPickerCoverage.test.ts fails when
// this drifts from that file.
// Previously 16 hand-maintained entries against 107 real functions, stale in BOTH
// directions — it omitted every finance, HR, stock, CRM, real-estate and catalog endpoint,
// so a flow author could not pick any of them. The catalogue is read by the TEST only, never
// at runtime: it is 311 KB where this projection is 16 KB, and shipping the former to every
// browser to populate a picker is not a trade worth making.
const EDGE_FUNCTIONS: EntityResult[] = [
  { id: 'agent-chat', label: 'agent-chat', sublabel: 'Multi-agent LangGraph chat with tool execution and SSE streaming' },
  { id: 'agent-scheduler-cron', label: 'agent-scheduler-cron', sublabel: 'Every-minute cron: dispatch background agents whose cron schedule is due' },
  { id: 'ai-pricing-updater', label: 'ai-pricing-updater', sublabel: 'Weekly cron (Sunday 00:00 UTC): sync AI model prices from hardcoded reference tables' },
  { id: 'ai-rerank', label: 'ai-rerank', sublabel: 'Reorder search results by relevance to a query' },
  { id: 'asset-service-reminders-cron', label: 'asset-service-reminders-cron', sublabel: 'Cron: emit equipment service-due, service-overdue and warranty-expiring flow events (#343).' },
  { id: 'auto-recovery-cron', label: 'auto-recovery-cron', sublabel: 'Every-5-minute cron: detect and recover stuck PDF, XML, scraping, and agent runs' },
  { id: 'background-agent-runner', label: 'background-agent-runner', sublabel: 'Execute a registered background agent by agent_id' },
  { id: 'campaign-processor', label: 'campaign-processor', sublabel: 'Every-minute cron: start scheduled campaigns and drip-send emails to recipients' },
  { id: 'canonicalize-attributes', label: 'canonicalize-attributes', sublabel: 'Proxy product attribute canonicalization to MIVAA facet service' },
  { id: 'catalog-access', label: 'catalog-access', sublabel: 'Public email-gate for shared catalog pages (/c/:slug)' },
  { id: 'catalog-extract-from-pdfs', label: 'catalog-extract-from-pdfs', sublabel: 'Claude Sonnet vision pass over source PDFs to find materials matching a query' },
  { id: 'catalog-image-search', label: 'catalog-image-search', sublabel: 'Find candidate images for a catalog material via platform DB then web fallback' },
  { id: 'catalog-render-pdf-page', label: 'catalog-render-pdf-page', sublabel: 'Proxy to MIVAA rasterize-pdf-page; returns signed URL to a PNG crop of a PDF page' },
  { id: 'catalog-send-to-customers', label: 'catalog-send-to-customers', sublabel: 'Admin sends a published catalog to CRM-category recipients via email' },
  { id: 'catalog-translate-pdf', label: 'catalog-translate-pdf', sublabel: 'Whole-PDF vision pass to populate a catalog\'s body_data from a source PDF' },
  { id: 'check-material-alerts', label: 'check-material-alerts', sublabel: 'Daily cron (08:00 UTC) that matches new products against active saved searches and sends bell notifications.' },
  { id: 'company-enrich', label: 'company-enrich', sublabel: 'Auto-fill soft business identity (website, socials, phone, email, description, industry, employee band, city/state) via web search + Apollo, after a VAT lookup.' },
  { id: 'contracts-api', label: 'contracts-api', sublabel: 'Contracts & e-signature - manage contracts and the public signer page' },
  { id: 'crawl-user-website', label: 'crawl-user-website', sublabel: 'Sitemap-driven indexer for SEO inter-linking; preview or full crawl mode' },
  { id: 'crm-api', label: 'crm-api', sublabel: 'REST CRM resource router for companies, contacts, users, and Stripe.' },
  { id: 'crm-company-embedding-backfill', label: 'crm-company-embedding-backfill', sublabel: 'Embed CRM companies so lookalike search has something to rank' },
  { id: 'crm-lead-score', label: 'crm-lead-score', sublabel: 'AI lead + health scoring for any CRM contact (canonical platform scorer)' },
  { id: 'crm-meeting-reminders', label: 'crm-meeting-reminders', sublabel: 'Cron: send reminders for upcoming CRM meetings whose reminder time has arrived.' },
  { id: 'customer-assets-api', label: 'customer-assets-api', sublabel: "Installed base: a customer's equipment, its warranties and its recurring service schedules (#343)." },
  { id: 'dashboard-insights', label: 'dashboard-insights', sublabel: 'Generate cached AI insights for the home dashboard' },
  { id: 'data-integrity-runner', label: 'data-integrity-runner', sublabel: 'Run the platform data-integrity check battery + manage checks/findings' },
  { id: 'embed-agent', label: 'embed-agent', sublabel: 'Public agent surface for the website embed — allowlisted tools, no model turn (embed-key authenticated)' },
  { id: 'email-api', label: 'email-api', sublabel: 'Action-discriminated email sending, domain management, logs, and analytics via Resend.' },
  { id: 'email-contacts-sync-cron', label: 'email-contacts-sync-cron', sublabel: 'Daily cron: push CRM contacts to each workspace\'s Resend audience' },
  { id: 'email-unsubscribe', label: 'email-unsubscribe', sublabel: 'Public one-click marketing email opt-out (RFC 8058 List-Unsubscribe).' },
  { id: 'email-webhooks', label: 'email-webhooks', sublabel: 'Receives Resend delivery event webhooks and updates email_logs.' },
  { id: 'facets-recanonicalize', label: 'facets-recanonicalize', sublabel: 'Bulk facet re-canonicalization sweep — replays attributes_raw to repair degraded products (#316).' },
  { id: 'finance-customer-documents', label: 'finance-customer-documents', sublabel: 'Customer self-service view of their own invoices, receipts and orders' },
  { id: 'finance-digest-aggregate', label: 'finance-digest-aggregate', sublabel: 'Send finance digest emails and dispatch quote follow-up bell notifications' },
  { id: 'finance-fiscal-offline-recovery', label: 'finance-fiscal-offline-recovery', sublabel: 'Re-query connector for pending MARK on offline-accepted fiscal documents' },
  { id: 'finance-inbound-sync', label: 'finance-inbound-sync', sublabel: 'Pull inbound documents from myDATA (RequestDocs) for configured workspaces' },
  { id: 'finance-invoice-pdf', label: 'finance-invoice-pdf', sublabel: 'Render a legal invoice, credit note, or delivery note as a PDF' },
  { id: 'finance-issue-invoice', label: 'finance-issue-invoice', sublabel: 'Issue, transmit, or POS-complete a fiscal invoice/credit note/delivery note' },
  { id: 'finance-pay-invoice', label: 'finance-pay-invoice', sublabel: 'Create a Stripe Checkout session or pay-link for an invoice' },
  { id: 'finance-send-invoice-email', label: 'finance-send-invoice-email', sublabel: 'Email an invoice to its customer with optional PDF attachment' },
  { id: 'finance-send-statement', label: 'finance-send-statement', sublabel: 'Render and email a party account-statement PDF (ledger / Καρτέλα)' },
  { id: 'finance-storefront', label: 'finance-storefront', sublabel: 'Public online storefront: browse products and submit cart checkout' },
  { id: 'flow-engine', label: 'flow-engine', sublabel: 'Execute, test, or event-trigger workflow automations by walking the xyflow graph.' },
  { id: 'flow-scheduler-cron', label: 'flow-scheduler-cron', sublabel: 'Per-minute cron that fires scheduled flows whose cron expression matches current UTC time.' },
  { id: 'flow-webhook', label: 'flow-webhook', sublabel: 'Receives external HTTP requests and routes them to the matching webhook-triggered flow.' },
  { id: 'generate-catalog-pdf', label: 'generate-catalog-pdf', sublabel: 'Render a presentation catalog to a PDF and store it in pdf-documents' },
  { id: 'generate-contract-pdf', label: 'generate-contract-pdf', sublabel: 'Render a signed/draft contract to PDF' },
  { id: 'generate-interior-gemini', label: 'generate-interior-gemini', sublabel: 'Multi-mode interior design image generation (Gemini, FLUX, Grok)' },
  { id: 'generate-interior-video-v2', label: 'generate-interior-video-v2', sublabel: 'Multi-model interior design video generation with async polling fallback' },
  { id: 'generate-moodboard-sheet-pdf', label: 'generate-moodboard-sheet-pdf', sublabel: 'Render a moodboard presentation sheet or project client-view to PDF' },
  { id: 'generate-purchase-sheet-pdf', label: 'generate-purchase-sheet-pdf', sublabel: 'Render a project purchase sheet (doors/windows + other purchase items) to PDF' },
  { id: 'generate-quote-pdf', label: 'generate-quote-pdf', sublabel: 'Generate or return cached PDF for a quote' },
  { id: 'generate-region-edit', label: 'generate-region-edit', sublabel: 'Masked inpainting: regenerate a user-painted area of a room image via Grok Aurora' },
  { id: 'generate-social-content', label: 'generate-social-content', sublabel: 'Generate platform-optimised social media captions and hashtags via Claude' },
  { id: 'generate-social-image', label: 'generate-social-image', sublabel: 'Generate a social media image via Aurora, Gemini, or FLUX based on content type' },
  { id: 'generate-social-video', label: 'generate-social-video', sublabel: 'Generate a short-form social video via Kling or Veo-2' },
  { id: 'generate-virtual-staging', label: 'generate-virtual-staging', sublabel: 'AI virtual staging of an empty room via Replicate proplabs/virtual-staging' },
  { id: 'generate-vr-world', label: 'generate-vr-world', sublabel: 'Generate explorable 3D Gaussian Splat VR world from an interior image via WorldLabs Marble' },
  { id: 'gsc-api', label: 'gsc-api', sublabel: 'Google Search Console for connected websites (OAuth + performance sync)' },
  { id: 'health-check', label: 'health-check', sublabel: 'Check liveness and key validity of all AI providers and external services' },
  { id: 'hr-api', label: 'hr-api', sublabel: 'HR module API — employees, absences, recruitment, onboarding, payroll, attendance, Ergani, accounting' },
  { id: 'hr-careers', label: 'hr-careers', sublabel: 'Public careers page + job-board API - list a workspace\'s open postings, read one, accept applications' },
  { id: 'hr-checkin-cron', label: 'hr-checkin-cron', sublabel: 'Cron: fire late check-in alerts for employees who haven\'t clocked in' },
  { id: 'hr-kiosk', label: 'hr-kiosk', sublabel: 'Public attendance kiosk — VAT (+ optional PIN) clock in/out' },
  { id: 'inbox-api', label: 'inbox-api', sublabel: 'Multi-tenant unified inbox: threads, participants, messages, agent takeover' },
  { id: 'job-cleanup-cron', label: 'job-cleanup-cron', sublabel: 'Weekly cron (Sunday 03:00 UTC): purge old completed/failed jobs and logs' },
  { id: 'kb-embedding-backfill', label: 'kb-embedding-backfill', sublabel: 'Backfill Voyage embeddings for knowledge-base documents missing them' },
  { id: 'kb-generate-embedding', label: 'kb-generate-embedding', sublabel: 'Generate or regenerate a Voyage AI 1024D embedding for a kb_docs row' },
  { id: 'marketplace-price-check', label: 'marketplace-price-check', sublabel: 'Check a surplus-listing price against the Operator\'s market cap' },
  { id: 'messaging-api', label: 'messaging-api', sublabel: 'WhatsApp messaging via Zernio — send, bulk send, channel management, and analytics.' },
  { id: 'messaging-processor', label: 'messaging-processor', sublabel: 'Cron-invoked processor that advances scheduled WhatsApp campaigns per-recipient.' },
  { id: 'mivaa-gateway', label: 'mivaa-gateway', sublabel: 'Authenticated proxy to MIVAA Python backend with per-action credit billing' },
  { id: 'monitoring-cron', label: 'monitoring-cron', sublabel: 'Unified monitoring dispatcher — one function behind all five price / mention / job cron tasks' },
  { id: 'moodboard-dormancy-cron', label: 'moodboard-dormancy-cron', sublabel: 'Daily cron — notify-then-delete lifecycle for idle moodboards' },
  { id: 'moodboard-keep-active', label: 'moodboard-keep-active', sublabel: 'Public one-click "keep this moodboard" target for the dormancy warning email' },
  { id: 'moodboard-sheet-share', label: 'moodboard-sheet-share', sublabel: 'Public token resolver for shared presentation sheets and project client views' },
  { id: 'myaade-rgwspublic2', label: 'myaade-rgwspublic2', sublabel: 'Greek business lookup by ΑΦΜ via ΑΑΔΕ RgWsPublic2 SOAP service.' },
  { id: 'mygemi-opendata', label: 'mygemi-opendata', sublabel: 'Greek company lookup by ΑΦΜ via the ΓΕΜΗ (GEMI) OpenData REST API.' },
  { id: 'notification-dispatcher', label: 'notification-dispatcher', sublabel: 'Dispatches browser push notifications (VAPID) and signed webhook deliveries with retry.' },
  { id: 'page-watch-webhook', label: 'page-watch-webhook', sublabel: 'Receives Firecrawl Monitoring callbacks for watched non-price pages and records the diff.' },
  { id: 'page-watches', label: 'page-watches', sublabel: 'CRUD for watched pages, mirrored to Firecrawl monitors.' },
  { id: 'parse-supplier-cost-list', label: 'parse-supplier-cost-list', sublabel: 'Parse a KB doc supplier cost list and apply costs to matching products' },
  { id: 'pinterest-api', label: 'pinterest-api', sublabel: 'Pinterest pin import and OAuth board browsing for moodboard population.' },
  { id: 'platform-secrets-admin', label: 'platform-secrets-admin', sublabel: 'CRUD for the platform_secrets key store (admin/super_admin only)' },
  { id: 'products-3d-api', label: 'products-3d-api', sublabel: 'Public product + 3D model read for the website embed SDK (embed-key authenticated)' },
  { id: 'project-plan-engine', label: 'project-plan-engine', sublabel: 'Authoritative compute for the Blueprint estimating engine (plans, pricing, versions, quotes)' },
  { id: 'public-project-plan', label: 'public-project-plan', sublabel: 'Public lead-gen Blueprint estimator (/tools/project-plan)' },
  { id: 'quote-public-share', label: 'quote-public-share', sublabel: 'Public token-based quote share lookup (anonymous-friendly)' },
  { id: 'quotes-api', label: 'quotes-api', sublabel: 'REST API for quote requests and proposals (customer-facing)' },
  { id: 'real-estate-api', label: 'real-estate-api', sublabel: 'Real Estate module — listings, leads, viewings, offers, sales, lettings, investments and deals' },
  { id: 'real-estate-buyer-digests', label: 'real-estate-buyer-digests', sublabel: 'Daily cron — emails saved-search digests to buyers with a matching new listing' },
  { id: 'real-estate-vendor-reports', label: 'real-estate-vendor-reports', sublabel: 'Weekly cron — emails the instructing vendor a performance report on their own listing' },
  { id: 'real-estate-listing-social', label: 'real-estate-listing-social', sublabel: 'Flow action — drafts a social post for a newly published listing, one per connected account' },
  { id: 'real-estate-inbound-lead', label: 'real-estate-inbound-lead', sublabel: 'Public tokenised endpoint — turns a forwarded portal enquiry email into a CRM lead' },
  { id: 'real-estate-ical', label: 'real-estate-ical', sublabel: 'Short-let channel sync — availability feed out (GET, token) and channel calendars in (POST, cron)' },
  { id: 'real-estate-calendar', label: 'real-estate-calendar', sublabel: "Pushes viewings into the agent's own Google Calendar (per-user OAuth)" },
  { id: 'real-estate-feed', label: 'real-estate-feed', sublabel: 'Tokenized XML syndication feed (Kyero / OpenImmo / generic) for property portals' },
  { id: 'real-estate-public', label: 'real-estate-public', sublabel: 'Anonymous, token-gated public listing pages, buyer portal, discovery and lead capture' },
  { id: 'real-estate-rent-invoicing', label: 'real-estate-rent-invoicing', sublabel: 'Daily cron — drafts Finance invoices for rent charges coming due' },
  { id: 'recommendations-api', label: 'recommendations-api', sublabel: 'Collaborative filtering interaction tracking, recommendations, and analytics.' },
  { id: 'reset-platform', label: 'reset-platform', sublabel: 'Destructively clear all user-generated data while preserving system config' },
  { id: 'revolut-api', label: 'revolut-api', sublabel: 'Revolut Business connection management (per-workspace BYOK) — keys, OAuth, accounts, mapping, sync' },
  { id: 'revolut-merchant-webhooks', label: 'revolut-merchant-webhooks', sublabel: 'Revolut Merchant (checkout) webhook receiver + per-workspace webhook setup' },
  { id: 'revolut-sync', label: 'revolut-sync', sublabel: 'Revolut transaction sync sweep — cron backstop over every connected workspace' },
  { id: 'revolut-webhooks', label: 'revolut-webhooks', sublabel: 'Revolut Business webhooks v2 receiver — signed transaction events, per-workspace secret' },
  { id: 'role-upgrade-requests', label: 'role-upgrade-requests', sublabel: 'Dealer/factory role promotion workflow — submit, approve, and reject requests.' },
  { id: 'scheduled-import-runner', label: 'scheduled-import-runner', sublabel: 'Cron runner that fetches due scheduled XML imports and re-invokes xml-import-orchestrator.' },
  { id: 'scan-receipt', label: 'scan-receipt', sublabel: 'Read a photographed receipt into expense fields; attach and sign the image on a supplier bill' },
  { id: 'send-quote-email', label: 'send-quote-email', sublabel: 'Email a quote to a recipient with a public share link' },
  { id: 'seo-api', label: 'seo-api', sublabel: 'Unified SEO API — action-discriminated keyword research, planning, writing, analysis, and toolkit.' },
  { id: 'seo-domain-tracker', label: 'seo-domain-tracker', sublabel: 'Weekly Rankings + Backlinks snapshots for a connected website' },
  { id: 'seo-rank-tracker', label: 'seo-rank-tracker', sublabel: 'Daily positions for the keywords a workspace chose to track' },
  { id: 'seo-content-freshness', label: 'seo-content-freshness', sublabel: 'Content decay — raise generated articles that are past their own refresh cadence' },
  { id: 'seo-site-audit', label: 'seo-site-audit', sublabel: 'Site Health — homepage Lighthouse + on-page audit for a connected website' },
  { id: 'stock-api', label: 'stock-api', sublabel: 'Stock / warehouse module - inventory, movements, counts, shipments and forecasting' },
  { id: 'storage-orphan-cleanup-cron', label: 'storage-orphan-cleanup-cron', sublabel: 'Nightly cron (04:00 UTC): delete storage objects with no live DB reference' },
  { id: 'stripe-api', label: 'stripe-api', sublabel: 'Stripe Checkout and Customer Portal session creator' },
  { id: 'stripe-connect', label: 'stripe-connect', sublabel: 'Stripe Connect onboarding and status for per-workspace payouts' },
  { id: 'stripe-webhooks', label: 'stripe-webhooks', sublabel: 'Stripe webhook receiver for subscription, payment, and invoice events' },
  { id: 'supplier-orders-api', label: 'supplier-orders-api', sublabel: 'Partner/ERP API for a claimed supplier to read inbound POs across all buyers and post status back' },
  { id: 'taric-classify', label: 'taric-classify', sublabel: 'Propose a TARIC commodity code for catalog products' },
  { id: 'taric-reference-sync', label: 'taric-reference-sync', sublabel: 'Import the EU TARIC goods nomenclature (Greek extract) into the reference table' },
  { id: 'trigger-factory-enrichment', label: 'trigger-factory-enrichment', sublabel: 'Propagate factory fields within a scope and queue a factory-enrichment agent if needed' },
  { id: 'trip-expense-ops', label: 'trip-expense-ops', sublabel: 'Sales trip-expense receipts: upload, sign, and render the expense PDF' },
  { id: 'vies-validate', label: 'vies-validate', sublabel: 'Server-side EU VAT validation via the VIES REST API with optional crm_companies cache write.' },
  { id: 'viva-config-test', label: 'viva-config-test', sublabel: 'Viva.com connection test — proves stored BYOK credentials against Viva without charging anyone' },
  { id: 'viva-webhooks', label: 'viva-webhooks', sublabel: 'Viva.com payment webhook receiver + verification-key handshake (multi-tenant BYOK)' },
  { id: 'workspace-webhook-dispatcher', label: 'workspace-webhook-dispatcher', sublabel: 'Deliver queued outbound webhook events to tenant endpoints' },
  { id: 'workspace-webhooks-api', label: 'workspace-webhooks-api', sublabel: 'Manage a workspace\'s outbound webhook endpoints' },
  { id: 'xml-import-orchestrator', label: 'xml-import-orchestrator', sublabel: 'Parse and import supplier XML feeds; supports field detection, preview, and full import modes.' },
  { id: 'zernio-api', label: 'zernio-api', sublabel: 'Social media publishing, OAuth account management, and analytics via Zernio.' },
  { id: 'zernio-webhook-handler', label: 'zernio-webhook-handler', sublabel: 'Receives Zernio webhooks for social post events and WhatsApp messaging events.' },
];

// ─── Search dispatcher ───────────────────────────────────
export async function searchEntities(
  entityType: EntityType,
  query: string,
): Promise<EntityResult[]> {
  const q = query.trim().toLowerCase();

  switch (entityType) {
    case 'user': {
      const res = await usersAPI.listUsers(20, 0, q);
      return (res.data || []).map((u: any) => ({
        id: u.id,
        label: u.email || u.id,
        sublabel: u.user_profiles?.full_name || undefined,
      }));
    }

    case 'product': {
      const products = await quotesService.searchProductsWithImages(q, 15);
      return products.map((p) => ({
        id: p.id,
        label: p.name || p.id,
        sublabel: p.sku || undefined,
      }));
    }

    case 'contact': {
      const res = await contactsAPI.listContacts(20, 0);
      // Client-side filter since listContacts doesn't accept search param
      return (res.data || [])
        .filter((c: any) => {
          const name = (c.first_name || '') + ' ' + (c.last_name || '');
          return name.toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q);
        })
        .slice(0, 20)
        .map((c: any) => ({
          id: c.id,
          label: [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || c.id,
          sublabel: c.email || undefined,
        }));
    }

    case 'company': {
      const res = await companiesAPI.listCompanies(20, 0, q);
      return (res.data || []).map((c: any) => ({
        id: c.id,
        label: c.name || c.id,
        sublabel: c.industry || undefined,
      }));
    }

    case 'edge_function': {
      return EDGE_FUNCTIONS.filter(
        (ef) => ef.id.includes(q) || (ef.sublabel || '').toLowerCase().includes(q),
      );
    }

    case 'moodboard': {
      const boards = await moodboardAPI.getUserMoodBoards();
      return boards
        .filter((b) => b.title.toLowerCase().includes(q))
        .slice(0, 20)
        .map((b) => ({
          id: b.id,
          label: b.title,
          sublabel: b.description || undefined,
        }));
    }

    case 'quote': {
      const { data } = await supabase
        .from('quotes')
        .select('id, name, status, created_at')
        .or(`name.ilike.%${q}%,status.ilike.%${q}%`)
        .order('created_at', { ascending: false })
        .limit(20);
      return (data || []).map((r: any) => ({
        id: r.id,
        label: r.name || `Quote ${r.id.slice(0, 8)}`,
        sublabel: r.status || undefined,
      }));
    }

    case 'conversation': {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const convos = await agentChatHistoryService.getUserConversations(user.id);
      return convos
        .filter((c) => (c.title || '').toLowerCase().includes(q))
        .slice(0, 20)
        .map((c) => ({
          id: c.id,
          label: c.title || `Chat ${c.id.slice(0, 8)}`,
          sublabel: c.agentId ? `Agent: ${c.agentId}` : undefined,
        }));
    }

    default:
      return [];
  }
}

// ─── Resolve label for a known entity ID ─────────────────
export async function resolveEntityLabel(
  entityType: EntityType,
  id: string,
): Promise<string | null> {
  if (!id) return null;

  try {
    switch (entityType) {
      case 'user': {
        const res = await usersAPI.getUser(id);
        return res.data?.email || id;
      }
      case 'product': {
        const { data } = await supabase
          .from('products')
          .select('name, sku')
          .eq('id', id)
          .single();
        return data?.name || data?.sku || id;
      }
      case 'contact': {
        const res = await contactsAPI.getContact(id);
        const c = res.data;
        return [c?.first_name, c?.last_name].filter(Boolean).join(' ') || id;
      }
      case 'company': {
        const res = await companiesAPI.getCompany(id);
        return res.data?.name || id;
      }
      case 'edge_function': {
        return EDGE_FUNCTIONS.find((ef) => ef.id === id)?.label || id;
      }
      case 'moodboard': {
        const { data } = await supabase
          .from('moodboards')
          .select('title')
          .eq('id', id)
          .single();
        return data?.title || id;
      }
      case 'quote': {
        const { data } = await supabase
          .from('quotes')
          .select('name')
          .eq('id', id)
          .single();
        return data?.name || id;
      }
      case 'conversation': {
        const { data } = await supabase
          .from('agent_chat_conversations')
          .select('title')
          .eq('id', id)
          .single();
        return data?.title || id;
      }
      default:
        return id;
    }
  } catch {
    return id;
  }
}
