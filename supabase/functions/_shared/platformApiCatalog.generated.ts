// GENERATED — do not edit here. Regenerate: npm run api:catalog (part of gen:all).
//
// The platform edge endpoints a signed-in user's own token can call, derived from
// scripts/edge-endpoints.json. Cron-secret, admin-secret and
// webhook-signed endpoints are absent by construction: they carry a different security
// scheme, so no edit here is what keeps them out of the agent's reach.

export interface PlatformApiField {
  type?: string;
  enum?: readonly string[];
  required?: boolean;
  description?: string;
}

export interface PlatformApiEndpoint {
  name: string;
  tag: string;
  methods: readonly string[];
  summary: string;
  description?: string;
  /** Sub-paths this endpoint routes on. Present means a path is REQUIRED. */
  routes?: readonly string[];
  fields?: Record<string, PlatformApiField>;
}

export const PLATFORM_API_CATALOG: readonly PlatformApiEndpoint[] = [
  {
    "name": "agent-chat",
    "tag": "AI Agents",
    "methods": [
      "POST"
    ],
    "summary": "Multi-agent LangGraph chat with tool execution and SSE streaming",
    "description": "Stateful LLM chat endpoint supporting three agents (kai, interior-designer, demo). Uses LangGraph StateGraph for multi-step tool execution. Supports multimodal input (data-URL images), long-term memory, toolkit-based tool selection, and optional partner API key access. Returns SSE stream of JSON chunks; content-type text/event-stream.",
    "fields": {
      "messages": {
        "type": "array",
        "description": "Conversation history array"
      },
      "agentId": {
        "type": "string",
        "enum": [
          "kai",
          "interior-designer",
          "demo"
        ],
        "description": "Agent to invoke; legacy aliases search/insights/seo resolve to kai"
      },
      "images": {
        "type": "array",
        "description": "User-attached images as data URLs (data:image/jpeg;base64,...) or HTTP URLs"
      },
      "conversation_id": {
        "type": "string",
        "description": "Supabase conversation ID; used to post background task results back"
      },
      "pinned_material_images": {
        "type": "array",
        "description": "Catalog product image URLs pinned for Gemini multi-reference generation"
      },
      "generation_mode": {
        "type": "string",
        "description": "Optional generation mode hint passed through to generation tools"
      },
      "selected_toolkits": {
        "type": "array",
        "description": "Active toolkit cluster IDs; null means Core tools only plus load_toolkit meta-tool"
      },
      "user_id": {
        "type": "string",
        "description": "Only honored when the caller authenticates with service-role/admin key (server-to-server act-on-behalf). Ignored for use"
      }
    }
  },
  {
    "name": "agent-eval",
    "tag": "AI Agents",
    "methods": [
      "POST"
    ],
    "summary": "Run ONE golden question through agent-chat and score the reply (operator-only)",
    "description": "The agent evaluation harness (docs/agent-evaluation.md). Loads a case from `agent_eval_cases`, runs it as a normal agent-chat turn — same router, tools and model — with `eval_run: true` (no memory promotion, no next-step chips), then scores deterministically: the expected tools were called and returned something, the reply matches / does not match the case regexes, a factual question carries no MO"
  },
  {
    "name": "ai-rerank",
    "tag": "Search",
    "methods": [
      "POST"
    ],
    "summary": "Reorder search results by relevance to a query",
    "description": "Cross-encoder style reranking over candidates the caller already holds. Fuses the platform's six per-aspect embedding scores (visual/colour/texture/style/material/understanding) into one ordering using claude-haiku-4-5. Degrades to the SOURCE ORDER on every failure path - fewer than 2 candidates, no API key, model error, or a model reply naming ids that were not sent - and reports which happened i",
    "fields": {
      "query": {
        "type": "string",
        "required": true,
        "description": "The user's original search query"
      },
      "results": {
        "type": "array",
        "required": true,
        "description": "Candidates to reorder (max 200; only the first 40 are ranked). Each: {id, name, description?, category?, relevanceScore?"
      },
      "maxResults": {
        "type": "number",
        "description": "Truncate AFTER reranking, so the model still sees the full set"
      },
      "includeExplanations": {
        "type": "boolean",
        "description": "Return a one-line rationale per result (default false)"
      },
      "model": {
        "type": "string",
        "description": "Override the model (default claude-haiku-4-5)"
      }
    }
  },
  {
    "name": "background-agent-runner",
    "tag": "Background Agents",
    "methods": [
      "GET",
      "POST"
    ],
    "summary": "Execute a registered background agent by agent_id",
    "description": "Universal executor for all background agent types. Accepts service-role or user JWT auth. GET ?catalog=1 returns the registered agent type catalog; POST runs or resumes an agent run."
  },
  {
    "name": "catalog-export",
    "tag": "Products",
    "methods": [
      "POST"
    ],
    "summary": "Export the workspace catalogue as CSV, JSON or XML for a distributor or channel",
    "description": "Any authenticated member of the workspace. Returns the active catalogue as a downloadable file. A saved xml_mapping_template can be applied in REVERSE, renaming our columns to the partner's vocabulary the importer already learned, so the same pairs are not taught twice. Cost, margin and supplier links are absent by construction: a partner price list is a separate decision with its own audience, no",
    "fields": {
      "workspace_id": {
        "type": "string",
        "required": true,
        "description": "Workspace whose catalogue to export"
      },
      "format": {
        "type": "string",
        "enum": [
          "csv",
          "json",
          "xml"
        ],
        "description": "Output format; defaults to csv"
      },
      "mapping_template_id": {
        "type": "string",
        "description": "xml_mapping_templates row, applied in reverse to rename columns"
      },
      "category_id": {
        "type": "string",
        "description": "Restrict to one category"
      },
      "limit": {
        "type": "number",
        "description": "Rows per call, max 5000"
      },
      "offset": {
        "type": "number",
        "description": "Row offset for paging"
      }
    }
  },
  {
    "name": "catalog-extract-from-pdfs",
    "tag": "Catalogs",
    "methods": [
      "POST"
    ],
    "summary": "Claude Sonnet vision pass over source PDFs to find materials matching a query",
    "description": "Sends one or more admin-uploaded source PDFs to Claude Sonnet 4.6 with tool-use to extract candidate materials matching a free-form query. Returns candidates with name, description, price, specs, bbox, and a rasterized image URL.",
    "fields": {
      "catalog_id": {
        "type": "string",
        "required": true,
        "description": "Target catalog ID (for cost logging)"
      },
      "source_pdf_ids": {
        "type": "array",
        "required": true,
        "description": "IDs of catalog_source_pdfs rows to search"
      },
      "query": {
        "type": "string",
        "required": true,
        "description": "Free-form search query describing desired materials"
      },
      "max_results": {
        "type": "number",
        "description": "Max candidates to return (default 12, max 40)"
      },
      "caller_user_id": {
        "type": "string",
        "description": "User ID for ai_usage_logs cost attribution"
      }
    }
  },
  {
    "name": "catalog-image-search",
    "tag": "Catalogs",
    "methods": [
      "POST"
    ],
    "summary": "Find candidate images for a catalog material via platform DB then web fallback",
    "description": "Searches the platform product DB (via MIVAA multi-vector search) first, then falls back to DataForSEO Google Images SERP. Returns up to N image candidates tagged with source ('db' or 'web') for admin approval.",
    "fields": {
      "query": {
        "type": "string",
        "required": true,
        "description": "Material name / search query"
      },
      "max_candidates": {
        "type": "number",
        "description": "Max results (default 6, max 12)"
      },
      "search_db_first": {
        "type": "boolean",
        "description": "Whether to query platform DB before web (default true)"
      },
      "caller_user_id": {
        "type": "string",
        "description": "User ID for logging"
      }
    }
  },
  {
    "name": "catalog-send-to-customers",
    "tag": "Catalogs",
    "methods": [
      "POST"
    ],
    "summary": "Admin sends a published catalog to CRM-category recipients via email",
    "description": "Resolves recipients from CRM categories, optionally writes catalog_email_grants for each, then dispatches emails via email-api using the catalog_send.recipient template. Preview mode returns recipient list without sending."
  },
  {
    "name": "catalog-translate-pdf",
    "tag": "Catalogs",
    "methods": [
      "POST"
    ],
    "summary": "Whole-PDF vision pass to populate a catalog's body_data from a source PDF",
    "description": "Sends an entire source PDF to Claude Sonnet 4.6 via tool-use to produce sections and materials, then merges the result into the target catalog's body_data. Supports layout-preserving (page-per-section) and restructured (category-grouped) modes.",
    "fields": {
      "source_pdf_id": {
        "type": "string",
        "required": true,
        "description": "catalog_source_pdfs row ID to translate"
      },
      "target_catalog_id": {
        "type": "string",
        "required": true,
        "description": "presentation_catalogs row to write body_data into"
      },
      "preserve_original_layout": {
        "type": "boolean",
        "description": "One section per PDF page when true; category-grouped when false (default)"
      },
      "caller_user_id": {
        "type": "string",
        "description": "User ID for ai_usage_logs cost attribution"
      }
    }
  },
  {
    "name": "check-material-alerts",
    "tag": "Alerts",
    "methods": [
      "POST"
    ],
    "summary": "Daily cron (08:00 UTC) that matches new products against active saved searches and sends bell notifications.",
    "description": "Can also be triggered manually via POST (no secret required — uses service-role JWT from pg_cron Authorization header). For each active saved_search not yet due to re-alert, queries products created since last_recommendation_sent_at whose name or description matches the saved query, inserts deduped material_alerts rows, and writes user_notifications."
  },
  {
    "name": "company-enrich",
    "tag": "Business Profile",
    "methods": [
      "POST"
    ],
    "summary": "Auto-fill soft business identity (website, socials, phone, email, description, industry, employee band, city/state) via web search + Apollo, after a VAT lookup.",
    "description": "JWT-authenticated POST. Runs Anthropic web_search (always) merged with Apollo.io (only when APOLLO_API_KEY is set) to fill fields a VAT registry never carries. Credit-metered per invariant #10 (reserve ceiling then per-provider debit). If company_id is supplied and the caller owns the row (or is admin), only currently-empty columns are cached back onto crm_companies.",
    "fields": {
      "name": {
        "type": "string",
        "required": true,
        "description": "Business/company name to research"
      },
      "country_name": {
        "type": "string",
        "description": "Country display name (e.g. Greece) to improve match quality"
      },
      "vat_number": {
        "type": "string",
        "description": "VAT/registration number, used as a research hint"
      },
      "workspace_id": {
        "type": "string",
        "description": "Routes credit debit to the workspace pool when provided"
      },
      "company_id": {
        "type": "string",
        "description": "crm_companies.id - if provided and authorized, caches empty-only columns onto the row"
      },
      "provider": {
        "type": "string",
        "description": "find-competitors only: force ONE discovery provider ('apollo' | 'gemini' | 'web_search') instead of the first-wins chain"
      }
    }
  },
  {
    "name": "contracts-api",
    "tag": "Finance",
    "methods": [
      "POST"
    ],
    "summary": "Contracts & e-signature - manage contracts and the public signer page",
    "description": "Contracts & e-signature. One entity, three contexts (hr | finance | project). verify_jwt is disabled so the PUBLIC token sign path works; management actions call authenticate() plus the module/entitlement gates and then write through a USER-context client, so the context-branched RLS (hr->admin, finance->finance-manager, project->member) is the real enforcement - no service-role body-trust (#250 i"
  },
  {
    "name": "crawl-user-website",
    "tag": "Scraping",
    "methods": [
      "POST"
    ],
    "summary": "Sitemap-driven indexer for SEO inter-linking; preview or full crawl mode",
    "description": "Discovers the sitemap via robots.txt or well-known paths, then either samples 5 URLs (mode=preview) or fully crawls up to max_pages URLs (mode=full), scraping each with Firecrawl and embedding the content via Voyage for SEO inter-linking. Accepts JWT or cron secret.",
    "fields": {
      "website_id": {
        "type": "string",
        "required": true,
        "description": "user_websites row ID to crawl"
      },
      "mode": {
        "type": "string",
        "description": "preview (5-URL sample, no full index) or full (default)"
      }
    }
  },
  {
    "name": "crm-api",
    "tag": "CRM",
    "methods": [
      "GET",
      "POST",
      "PATCH",
      "DELETE"
    ],
    "summary": "REST CRM resource router for companies, contacts, users, and Stripe.",
    "description": "Path-routed REST API dispatching to four resource handlers: /companies (GET/POST/PATCH/DELETE for company CRUD, requires admin or factory role), /contacts (contact CRUD), /users (user profile CRUD), /stripe (Stripe customer/subscription operations). Each handler performs its own auth and RLS enforcement.",
    "routes": [
      "companies",
      "contacts",
      "users",
      "stripe",
      "address-units",
      "google-business"
    ]
  },
  {
    "name": "crm-company-embedding-backfill",
    "tag": "CRM",
    "methods": [
      "POST"
    ],
    "summary": "Embed CRM companies so lookalike search has something to rank",
    "description": "Drains the derived embedding backlog for crm_companies: every row whose stored embedding_source_hash differs from the hash of crm_company_embedding_text(id) right now. Sequential, small batches, idempotent. Auth: service-role bearer (cron / internal), shared cron secret, or an admin JWT.",
    "fields": {
      "limit": {
        "type": "integer",
        "description": "Max companies to process this run (clamped to an internal MAX_LIMIT of 200)"
      }
    }
  },
  {
    "name": "crm-lead-score",
    "tag": "CRM",
    "methods": [
      "POST"
    ],
    "summary": "AI lead + health scoring for any CRM contact (canonical platform scorer)",
    "description": "Scores **any** `crm_contacts` lead from generic CRM signals (activity recency, engagement, company fit, pipeline position), enriched with property signals when the Real Estate module is enabled. Writes the shared `crm_contacts.lead_score` (0-100, likelihood to transact soon) and `health_score` (0-100, engagement/fit) so CRM, Sales and Real Estate all render the SAME number rather than three privat",
    "fields": {
      "workspace_id": {
        "type": "string",
        "required": true,
        "description": "Workspace owning the contact. Reconciled against the caller — a mismatch 404s. (string (uuid))"
      },
      "crm_contact_id": {
        "type": "string",
        "required": true,
        "description": "Contact to score. 404 when it is not in the workspace. (string (uuid))"
      }
    }
  },
  {
    "name": "customer-assets-api",
    "tag": "CRM",
    "methods": [
      "POST"
    ],
    "summary": "Installed base: a customer's equipment, its warranties and its recurring service schedules (#343).",
    "description": "Action-discriminated JWT endpoint over customer_assets, customer_asset_warranties, customer_asset_service_plans and customer_asset_service_events, plus the per-product defaults in product_service_defaults. Reads and writes run through the caller's own RLS context; registration and service completion go through SECURITY DEFINER RPCs that call assert_workspace_member. There is no next_due_on field a",
    "fields": {
      "action": {
        "type": "string",
        "description": "Which operation to run (see actions)."
      },
      "workspace_id": {
        "type": "string",
        "description": "Target workspace; verified against the caller's memberships."
      },
      "asset_id": {
        "type": "string",
        "description": "Equipment id, for the asset-scoped actions."
      },
      "event_id": {
        "type": "string",
        "description": "Service occurrence id, for service.complete / service.skip."
      }
    }
  },
  {
    "name": "dashboard-insights",
    "tag": "AI Generation",
    "methods": [
      "POST"
    ],
    "summary": "Generate cached AI insights for the home dashboard",
    "description": "User JWT; caller must be an active member of workspace_id. Gathers a live workspace snapshot (projects, AR/finance, tasks, inbox, quotes) and asks Claude Haiku for 2-5 friendly insights, cached 15 days per (user, workspace) in dashboard_insights_cache. Never errors: on LLM failure it returns a deterministic numbers-driven fallback cached with a short TTL.",
    "fields": {
      "workspace_id": {
        "type": "string",
        "required": true,
        "description": "Workspace to summarise (caller must be an active member)"
      },
      "force": {
        "type": "boolean",
        "description": "Bypass the warm cache and regenerate"
      }
    }
  },
  {
    "name": "data-integrity-runner",
    "tag": "Admin",
    "methods": [
      "POST"
    ],
    "summary": "Run the platform data-integrity check battery + manage checks/findings",
    "description": "Auth boundary + thin dispatcher over the run_data_integrity_checks / heal_data_integrity_check Postgres RPCs. Cron path (x-cron-secret / service-role via isCronAuthorized) runs the full battery with auto-heal, no body. Admin path (session JWT; admin/super_admin/owner) runs on demand and manages checks/findings."
  },
  {
    "name": "email-api",
    "tag": "Email",
    "methods": [
      "POST",
      "GET"
    ],
    "summary": "Action-discriminated email sending, domain management, logs, and analytics via Resend.",
    "description": "Accepts a JSON body with an `action` field (or path suffix) to select the operation. Requires `RESEND_API_KEY`; returns 503 with `provider_not_configured` when absent. Supports optional React Email templates resolved by slug from `email_templates`."
  },
  {
    "name": "finance-assessment",
    "tag": "Finance",
    "methods": [
      "POST"
    ],
    "summary": "Derive the workspace's finance health signals, and optionally write the AI assessment of them",
    "description": "Same two modes as project-assessment, over the BOOKS. The subject is the caller's own workspace — there is no finance record, so no id is taken from the body. Signals cover configuration, the quote-to-invoice pipeline, margin and cash, obligations, fiscal filing and bank reconciliation, and debtors; each figure comes from the derivation that already owns it (vw_ar_aging, vw_ap_aging, get_monthly_p",
    "fields": {
      "subject_id": {
        "type": "string",
        "description": "Optional workspace id, for a caller who belongs to several. Must be one of theirs; defaults to the first."
      },
      "mode": {
        "type": "string",
        "enum": [
          "preview",
          "run"
        ],
        "description": "`preview` is the free derivation; `run` costs credits."
      },
      "today": {
        "type": "string",
        "description": "The operator's local calendar day as YYYY-MM-DD. Decides what counts as overdue; bounded to +/-2 days of the server date"
      }
    }
  },
  {
    "name": "finance-customer-documents",
    "tag": "Finance",
    "methods": [
      "GET",
      "POST"
    ],
    "summary": "Customer self-service view of their own invoices, receipts and orders",
    "description": "Any authenticated user (customer-facing, not admin-gated). Resolves the caller's linked crm_contacts (and their businesses via crm_company_contacts), then returns strictly the documents whose counterparty is one of those — issued invoices/retail receipts, payment receipts, and sales orders — with fresh 7-day signed PDF URLs. Runs under service role because customers are not workspace members.",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "order_detail",
          "reorder"
        ],
        "required": true,
        "description": "Which operation to run."
      }
    }
  },
  {
    "name": "finance-digest-aggregate",
    "tag": "Finance",
    "methods": [
      "POST"
    ],
    "summary": "Send finance digest emails and dispatch quote follow-up bell notifications",
    "description": "Cron mode (invoked by the Finance digest flow): sends scheduled digest emails with AR/AP aging, cash-flow forecast, P&L, and top-party tables to configured recipients, and dispatches bell notifications for idle or due-scheduled quotes. Now mode (admin JWT): sends an on-demand digest for a specific workspace.",
    "fields": {
      "mode": {
        "type": "string",
        "required": true,
        "description": "'cron' for scheduled invocation from flow-engine; 'now' for admin-triggered send. (one of: string ('cron'|'now'))"
      },
      "job": {
        "type": "string",
        "description": "Narrow cron run to one job; omit to run both. (one of: string ('digest'|'followups'))"
      },
      "workspace_id": {
        "type": "string",
        "description": "now mode: target workspace; inferred from caller's membership if omitted. (string (uuid))"
      },
      "recipients_override": {
        "type": "array",
        "description": "now mode: override recipient list (skips last_sent stamp)."
      }
    }
  },
  {
    "name": "finance-inbound-sync",
    "tag": "Finance",
    "methods": [
      "POST"
    ],
    "summary": "Pull inbound documents from myDATA (RequestDocs) for configured workspaces",
    "description": "Polls the AADE myDATA RequestDocs endpoint for each workspace that has configured inbound credentials, upserts received documents into inbound_documents, and advances the per-workspace MARK watermark. The manual 'Sync from myDATA' path may bound the pull to an issue-date window (date_from/date_to) so a sync doesn't drag in years of history. Cron path charges 2 credits per workspace; manual 'Sync n",
    "fields": {
      "date_from": {
        "type": "string",
        "description": "Manual path only. Start of the issue-date window to pull. Must be sent together with date_to and be <= it; sent to AADE "
      },
      "date_to": {
        "type": "string",
        "description": "Manual path only. End of the issue-date window to pull. Must be sent together with date_from. (string (yyyy-mm-dd))"
      }
    }
  },
  {
    "name": "finance-invoice-pdf",
    "tag": "Finance",
    "methods": [
      "POST"
    ],
    "summary": "Render a legal invoice, credit note, or delivery note as a PDF",
    "description": "Generates an A4 PDF for an invoice, credit note, or delivery note using pdf-lib with embedded Noto Sans for Greek/Latin rendering. Caches the PDF in pdf-documents storage and returns a 7-day signed URL. Supports GR/EN language selection per-document.",
    "fields": {
      "invoice_id": {
        "type": "string",
        "description": "Invoice to render. Provide one of: invoice_id, credit_note_id, delivery_note_id. (string (uuid))"
      },
      "credit_note_id": {
        "type": "string",
        "description": "Credit note to render. (string (uuid))"
      },
      "delivery_note_id": {
        "type": "string",
        "description": "Delivery note to render. (string (uuid))"
      },
      "regenerate": {
        "type": "boolean",
        "description": "Force re-render even if a cached PDF exists."
      }
    }
  },
  {
    "name": "finance-issue-invoice",
    "tag": "Finance",
    "methods": [
      "POST"
    ],
    "summary": "Issue, transmit, or POS-complete a fiscal invoice/credit note/delivery note",
    "description": "Creates a draft invoice from a quote (idempotent), optionally issues it, and optionally transmits it to the workspace's legal_invoice connector (Novus → myDATA). Also handles credit-note submission (myDATA 5.1), delivery-note submission (9.3), and POS/IRIS receipt hold + completion (Law 5155). Costs 2 credits per myDATA transmission; root workspace transmits free.",
    "fields": {
      "quote_id": {
        "type": "string",
        "description": "Create/find invoice from this quote. Provide this OR invoice_id. (string (uuid))"
      },
      "invoice_id": {
        "type": "string",
        "description": "Operate on an existing invoice directly. (string (uuid))"
      },
      "credit_note_id": {
        "type": "string",
        "description": "Submit a credit note (myDATA 5.1) to the fiscal connector. (string (uuid))"
      },
      "delivery_note_id": {
        "type": "string",
        "description": "Submit a delivery note (myDATA 9.3) to the fiscal connector. (string (uuid))"
      },
      "issue_now": {
        "type": "boolean",
        "description": "Flip invoice from draft → issued status."
      },
      "submit_fiscal": {
        "type": "boolean",
        "description": "Transmit to the workspace's legal_invoice connector."
      },
      "skip_signature": {
        "type": "boolean",
        "description": "Skip provider digital-signature step (Novus ?skipSignature=true)."
      },
      "fiscal_overrides": {
        "type": "string",
        "description": "Per-call myDATA overrides: invoice type, series/aa, income classification. (object (FiscalOverrides))"
      },
      "pos_payment": {
        "type": "string",
        "description": "Issue as card/IRIS receipt on a registered EFT-POS terminal (Law 5155). (object {terminal_id, pos_nsp_id, payment_type?}"
      },
      "pos_complete": {
        "type": "string",
        "description": "Finalize a held POS/IRIS receipt after terminal charge succeeded. (object {pos_signature_id?, invoice_id?, transaction_i"
      }
    }
  },
  {
    "name": "finance-mydata-book",
    "tag": "Finance",
    "methods": [
      "POST"
    ],
    "summary": "Mirror the AADE myDATA aggregate book (Συνοπτικό Βιβλίο) for configured workspaces",
    "description": "Reads the taxpayer's own myDATA book from AADE and stores it in mydata_book_months as a READ-ONLY MIRROR — never merged with, and never written back into, invoices / supplier_bills / inbound_documents. It exists to CONFIRM the platform's own figures against the tax authority's. Combines RequestMyIncome + RequestMyExpenses (the book feed, which omits the counterparty-less 11.x/13.x families) with t",
    "fields": {
      "date_from": {
        "type": "string",
        "description": "Start of the issue-date window to mirror. Defaults to 1 January of the current year; sent to AADE as dateFrom in dd/MM/y"
      },
      "date_to": {
        "type": "string",
        "description": "End of the issue-date window. Defaults to today. Must not be earlier than date_from. (string (yyyy-mm-dd))"
      }
    }
  },
  {
    "name": "finance-pay-invoice",
    "tag": "Finance",
    "methods": [
      "POST"
    ],
    "summary": "Create a Stripe Checkout session or pay-link for an invoice",
    "description": "Two modes: authenticated admin/finance mints a pay_token and/or creates a Stripe Checkout session for an invoice; public/unauthenticated path resolves a pay_token and creates a Checkout session for the buyer. Routes funds to the workspace's connected Stripe account when configured.",
    "fields": {
      "invoice_id": {
        "type": "string",
        "description": "Admin mode: invoice to pay. Requires JWT with finance role. (string (uuid))"
      },
      "link_only": {
        "type": "boolean",
        "description": "Admin mode: mint/refresh pay_token + return public link without creating a Checkout session."
      },
      "pay_token": {
        "type": "string",
        "description": "Public mode: token from the pay link (e.g. from /pay/:token URL)."
      },
      "success_url": {
        "type": "string",
        "description": "Redirect URL on payment success."
      },
      "cancel_url": {
        "type": "string",
        "description": "Redirect URL on payment cancellation."
      }
    }
  },
  {
    "name": "finance-send-invoice-email",
    "tag": "Finance",
    "methods": [
      "POST"
    ],
    "summary": "Email an invoice to its customer with optional PDF attachment",
    "description": "Resolves the recipient from the invoice's CRM company/contact, generates or reuses the invoice PDF, and dispatches via the email-api edge function. The 'to' field overrides automatic recipient resolution.",
    "fields": {
      "invoice_id": {
        "type": "string",
        "required": true,
        "description": "Invoice to email. (string (uuid))"
      },
      "to": {
        "type": "string",
        "description": "Override recipient email; defaults to CRM customer email on file. (string (email))"
      }
    }
  },
  {
    "name": "finance-send-payment",
    "tag": "Finance",
    "methods": [
      "POST"
    ],
    "summary": "Instruct a real bank transfer from a workspace account to a counterparty",
    "description": "Money OUT, on whichever rail the chosen account sits on. The source is one of the workspace's own `finance_bank_accounts` rows; its mapping decides the provider (Revolut pocket or Viva wallet), and an account mapped to neither is refused rather than silently recorded. Writes an instruction to `payout_instructions` BEFORE calling the provider and never writes a `payments` row — the bank feed record",
    "fields": {
      "workspace_id": {
        "type": "string",
        "required": true
      },
      "source_bank_account_id": {
        "type": "string",
        "required": true,
        "description": "finance_bank_accounts.id — the account of ours the money leaves."
      },
      "crm_bank_account_id": {
        "type": "string",
        "required": true,
        "description": "crm_bank_accounts.id — the counterparty account being paid."
      },
      "amount": {
        "type": "number",
        "required": true
      },
      "currency": {
        "type": "string"
      },
      "reference": {
        "type": "string",
        "description": "Shown on the bank statement; max 140 chars."
      },
      "mode": {
        "type": "string",
        "enum": [
          "draft",
          "payment"
        ],
        "description": "'draft' prepares it for approval in the provider's app (Revolut only — Viva has no approval step and refuses it)."
      },
      "request_id": {
        "type": "string",
        "required": true,
        "description": "UUID idempotency key, minted once per attempt and resent on retry."
      },
      "supplier_bill_id": {
        "type": "string",
        "description": "The bill this settles. Tenancy-checked before it is stored."
      }
    }
  },
  {
    "name": "finance-send-statement",
    "tag": "Finance",
    "methods": [
      "POST"
    ],
    "summary": "Render and email a party account-statement PDF (ledger / Καρτέλα)",
    "description": "Single mode: renders a chronological debit/credit ledger PDF for a CRM company or contact and emails it. Cron-batch mode: iterates all workspaces with auto_statement_enabled and sends each eligible party their statement according to the configured schedule. Customer-side statements include pay-by-card links for open invoices.",
    "fields": {
      "mode": {
        "type": "string",
        "description": "Pass 'cron_batch' with x-cron-secret header to run the automated batch. (string ('cron_batch'))"
      },
      "party_type": {
        "type": "string",
        "description": "Single mode: party type. Required unless mode='cron_batch'. (one of: string ('company'|'contact'))"
      },
      "party_id": {
        "type": "string",
        "description": "Single mode: CRM company or contact ID. (string (uuid))"
      },
      "side": {
        "type": "string",
        "description": "Ledger direction; inferred from party flags if omitted. (one of: string ('customer'|'supplier'))"
      },
      "from": {
        "type": "string",
        "description": "Period start; defaults to current year start. (string (date YYYY-MM-DD))"
      },
      "to": {
        "type": "string",
        "description": "Period end; defaults to current year end. (string (date YYYY-MM-DD))"
      },
      "lang": {
        "type": "string",
        "description": "PDF/email language; inferred from workspace country if omitted. (one of: string ('el'|'en'))"
      },
      "email": {
        "type": "string",
        "description": "Override recipient email. (string (email))"
      },
      "dry_run": {
        "type": "boolean",
        "description": "Generate PDF but do not send email."
      }
    }
  },
  {
    "name": "flow-engine",
    "tag": "Flows",
    "methods": [
      "POST"
    ],
    "summary": "Execute, test, or event-trigger workflow automations by walking the xyflow graph.",
    "description": "Requires Supabase JWT. Routes on body.action to execute-flow (run a saved flow with trigger data), test-flow (dry-run, no side effects), or trigger-event (auto-dispatch from DB triggers or server-to-server)."
  },
  {
    "name": "generate-catalog-pdf",
    "tag": "Catalogs",
    "methods": [
      "POST"
    ],
    "summary": "Render a presentation catalog to a PDF and store it in pdf-documents",
    "description": "Builds a multi-page A3 PDF from the catalog's cover/body/back-cover data and selected template, uploads it to pdf-documents/catalog-output/{id}/, and updates presentation_catalogs with the storage path and a fresh signed URL.",
    "fields": {
      "catalog_id": {
        "type": "string",
        "required": true,
        "description": "presentation_catalogs row ID to render"
      }
    }
  },
  {
    "name": "generate-contract-pdf",
    "tag": "Finance",
    "methods": [
      "POST"
    ],
    "summary": "Render a signed/draft contract to PDF",
    "description": "Renders the contract (with any collected signatures) to a PDF, overwrites it at pdf-documents/contract-output/{contract_id}.pdf (private bucket), and returns a 7-day signed URL. Requires a signed-in user; the caller is reconciled against the contract's workspace before rendering (#250 invariant 1).",
    "fields": {
      "contract_id": {
        "type": "string",
        "required": true,
        "description": "contracts row ID to render"
      }
    }
  },
  {
    "name": "generate-interior-gemini",
    "tag": "AI Generation",
    "methods": [
      "POST"
    ],
    "summary": "Multi-mode interior design image generation (Gemini, FLUX, Grok)",
    "description": "Generates interior design images across seven modes: text-to-image, image-edit, redesign, copy-style, floor-plan-render, floor-plan-text, and materials-selection-board. Routes to Gemini (flash 6cr / pro 15cr), FLUX Depth Pro (redesign/copy-style 20cr), or Grok Aurora (15cr) based on mode and model_tier. Accepts service-role key for server-to-server calls from agent-chat; otherwise requires user JW",
    "fields": {
      "mode": {
        "type": "string",
        "enum": [
          "text-to-image",
          "image-edit",
          "redesign",
          "copy-style",
          "floor-plan-render",
          "floor-plan-text",
          "materials-selection-board"
        ],
        "description": "Generation mode; defaults to text-to-image"
      },
      "prompt": {
        "type": "string",
        "description": "Descriptive prompt for the generation"
      },
      "room_type": {
        "type": "string",
        "description": "Room type e.g. 'kitchen', 'bathroom'"
      },
      "style": {
        "type": "string",
        "description": "Design style e.g. 'minimalist', 'scandinavian'"
      },
      "sqm": {
        "type": "number",
        "description": "Room area in square metres"
      },
      "aspect_ratio": {
        "type": "string",
        "description": "Output image aspect ratio e.g. '16:9', '1:1'"
      },
      "model_tier": {
        "type": "string",
        "enum": [
          "fast",
          "pro",
          "grok"
        ],
        "description": "Model quality tier: fast=Gemini flash (6cr), pro=Gemini pro (15cr), grok=Grok Aurora (15cr)"
      },
      "material_images": {
        "type": "array",
        "description": "Up to 14 catalog product image URLs for multi-reference Gemini generation"
      },
      "reference_image_url": {
        "type": "string",
        "description": "Source image URL for image-edit and floor-plan-render modes"
      },
      "edit_instruction": {
        "type": "string",
        "description": "Instruction describing what to change in image-edit mode"
      },
      "style_reference_url": {
        "type": "string",
        "description": "Second uploaded image: style/mood reference for copy-style and redesign modes"
      },
      "board_mode": {
        "type": "string",
        "enum": [
          "presentation-board",
          "selection-board",
          "photorealistic-render"
        ],
        "description": "Sub-mode for materials-selection-board"
      },
      "user_id": {
        "type": "string",
        "description": "Required when called with service-role key (server-to-server)"
      },
      "workspace_id": {
        "type": "string"
      },
      "conversation_id": {
        "type": "string"
      }
    }
  },
  {
    "name": "generate-interior-video-v2",
    "tag": "AI Generation",
    "methods": [
      "POST"
    ],
    "summary": "Multi-model interior design video generation with async polling fallback",
    "description": "Generates interior design videos via veo-2 (50cr, 8s), kling-v3.0 (20cr, 10s), runway-gen4-turbo (40cr, 10s), wan-3.0-480p/720p/1080p (30/55/110cr, 30s with audio), seedance-2.5-480p/720p (60/125cr, 30s one-pass) h3-max-768p/480p (25/15cr, 15s with stereo audio, rendered in seconds) or ray-3.2-720p/1080p (20/70cr, 5-10s, first-to-last frame interpolation). Model is auto-selected from video_type wh",
    "fields": {
      "source_image_url": {
        "type": "string",
        "description": "Required. Public URL of the source interior image"
      },
      "video_type": {
        "type": "string",
        "enum": [
          "walkthrough",
          "product_spotlight",
          "before_after",
          "floorplan_flythrough",
          "social_reel"
        ],
        "description": "Video type; drives auto model selection. Default: walkthrough"
      },
      "model": {
        "type": "string",
        "enum": [
          "veo-2",
          "kling-v3.0",
          "runway-gen4-turbo",
          "wan-3.0-480p",
          "wan-3.0-720p",
          "wan-3.0-1080p",
          "seedance-2.5-480p",
          "seedance-2.5-720p",
          "h3-max-768p",
          "h3-max-480p",
          "ray-3.2-720p",
          "ray-3.2-1080p"
        ],
        "description": "Explicit model override; if omitted, auto-selected from video_type"
      },
      "prompt": {
        "type": "string",
        "description": "Optional generation prompt; model defaults apply if omitted"
      },
      "aspect_ratio": {
        "type": "string",
        "enum": [
          "16:9",
          "9:16",
          "1:1"
        ]
      },
      "duration_seconds": {
        "type": "integer",
        "description": "Requested duration. veo-2 capped at 8s."
      },
      "workspace_id": {
        "type": "string"
      },
      "before_image_url": {
        "type": "string",
        "description": "Before image for before_after video type (Replicate models)"
      },
      "user_id": {
        "type": "string",
        "description": "Required when called with service-role key (server-to-server)"
      },
      "conversation_id": {
        "type": "string"
      }
    }
  },
  {
    "name": "generate-moodboard-sheet-pdf",
    "tag": "Moodboard & Sheets",
    "methods": [
      "POST"
    ],
    "summary": "Render a moodboard presentation sheet or project client-view to PDF",
    "description": "Accepts either a sheet_id (renders one of the 9 sheet types: material_board, color_palette, concept_board, lighting_plan, annotated_render, elevation_render_pair, ffe_schedule, area_breakdown, full_deck) or a client_view_id (renders a cross-moodboard project deck). Uploads to pdf-documents and returns a 7-day signed URL.",
    "fields": {
      "sheet_id": {
        "type": "string",
        "description": "moodboard_presentation_sheets row ID; required when client_view_id is absent"
      },
      "client_view_id": {
        "type": "string",
        "description": "project_client_views row ID; required when sheet_id is absent"
      },
      "regenerate": {
        "type": "boolean",
        "description": "Force re-render even if a completed PDF already exists (client view path only)"
      }
    }
  },
  {
    "name": "generate-purchase-sheet-pdf",
    "tag": "Finance",
    "methods": [
      "POST"
    ],
    "summary": "Render a project purchase sheet (doors/windows + other purchase items) to PDF",
    "description": "Builds the purchase schedule and/or per-item spec sheets for a project (item types include door/window) using pdf-lib, uploads to pdf-documents storage, and returns a signed URL. Reads items under the caller RLS by project_id (+ optional item_ids); inline items require service-role auth.",
    "fields": {
      "project_id": {
        "type": "string",
        "description": "Project whose purchase items to render (required unless inline items given) (string (uuid))"
      },
      "item_ids": {
        "type": "array",
        "description": "Subset of purchase items to include"
      },
      "items": {
        "type": "array",
        "description": "Inline purchase items (service-role only)"
      },
      "mode": {
        "type": "string",
        "description": "Defaults to 'both' (one of: string ('schedule'|'per_item'|'both'))"
      },
      "project_name": {
        "type": "string",
        "description": "Override the rendered project name"
      }
    }
  },
  {
    "name": "generate-quote-pdf",
    "tag": "Quotes",
    "methods": [
      "POST"
    ],
    "summary": "Generate or return cached PDF for a quote",
    "description": "Builds an A4 branded PDF for a quote using pdf-lib, uploads to pdf-documents storage, and returns a 7-day signed URL. Returns the cached PDF on subsequent calls unless regenerate is requested. Emits a flow event on successful generation.",
    "fields": {
      "quote_id": {
        "type": "string",
        "required": true,
        "description": "Quote to render as PDF. (string (uuid))"
      },
      "regenerate": {
        "type": "boolean",
        "description": "Force re-render even if a cached completed PDF exists."
      }
    }
  },
  {
    "name": "generate-region-edit",
    "tag": "AI Generation",
    "methods": [
      "POST"
    ],
    "summary": "Masked inpainting: regenerate a user-painted area of a room image via Grok Aurora",
    "description": "Accepts a room image URL, a binary PNG mask data URL (white=regenerate, black=keep), and a prompt. Calls Grok Aurora's /v1/images/edits endpoint with an explicit binary mask. Costs 20 credits. Accepts service-role key for agent-chat internal calls.",
    "fields": {
      "image_url": {
        "type": "string",
        "description": "Required. Public URL of the room image to edit"
      },
      "mask_data_url": {
        "type": "string",
        "description": "Required. PNG data URL of the binary mask (white=regenerate, black=keep)"
      },
      "prompt": {
        "type": "string",
        "description": "Required. Description of what to generate in the masked area"
      },
      "user_id": {
        "type": "string",
        "description": "Required when called with service-role key (server-to-server)"
      },
      "workspace_id": {
        "type": "string"
      },
      "conversation_id": {
        "type": "string"
      }
    }
  },
  {
    "name": "generate-social-content",
    "tag": "Social",
    "methods": [
      "POST"
    ],
    "summary": "Generate platform-optimised social media captions and hashtags via Claude",
    "description": "Uses Claude Haiku to generate 3 caption variants and hashtags tailored to the target platform's character limits and tone conventions. Costs 2 credits (non-refundable). Platforms: instagram, facebook, linkedin, tiktok, pinterest, youtube, twitter, threads.",
    "fields": {
      "topic": {
        "type": "string",
        "description": "Required. Content topic or product/scene description"
      },
      "platform": {
        "type": "string",
        "enum": [
          "instagram",
          "facebook",
          "linkedin",
          "tiktok",
          "pinterest",
          "youtube",
          "twitter",
          "threads"
        ],
        "description": "Required. Target social platform"
      },
      "tone": {
        "type": "string",
        "description": "Writing tone; defaults to 'professional'"
      },
      "product_info": {
        "type": "string",
        "description": "Optional product details to incorporate"
      },
      "include_hashtags": {
        "type": "boolean"
      },
      "hashtag_count": {
        "type": "integer"
      },
      "workspace_id": {
        "type": "string"
      },
      "post_id": {
        "type": "string",
        "description": "Optional social_posts row ID to associate with"
      }
    }
  },
  {
    "name": "generate-social-image",
    "tag": "Social",
    "methods": [
      "POST"
    ],
    "summary": "Generate a social media image via Aurora, Gemini, or FLUX based on content type",
    "description": "Routes to the best image model: lifestyle/people → xAI Aurora (10cr), product/interior → Gemini Imagen (5cr), artistic/textured → FLUX 2 Pro via Replicate (6cr). Model can be overridden explicitly or set to 'auto'. Credits are debited upfront and non-refundable.",
    "fields": {
      "prompt": {
        "type": "string",
        "description": "Required. Image generation prompt"
      },
      "image_type": {
        "type": "string",
        "enum": [
          "lifestyle",
          "product",
          "interior",
          "artistic"
        ],
        "description": "Content type; used for auto model selection. Default: lifestyle"
      },
      "model": {
        "type": "string",
        "enum": [
          "aurora",
          "gemini",
          "flux",
          "auto"
        ],
        "description": "Model override; 'auto' selects based on image_type"
      },
      "aspect_ratio": {
        "type": "string",
        "enum": [
          "1:1",
          "4:5",
          "9:16",
          "16:9"
        ]
      },
      "workspace_id": {
        "type": "string"
      },
      "post_id": {
        "type": "string",
        "description": "Optional social_posts row ID to associate with"
      }
    }
  },
  {
    "name": "generate-social-video",
    "tag": "Social",
    "methods": [
      "POST"
    ],
    "summary": "Generate a short-form social video (MiniMax H3 by default; Kling, Veo 2, Wan3.0, Seedance 2.5 and Ray3.2 selectable)",
    "description": "Generates a short-form social video. DEFAULT h3-max-768p (25cr): 5-15s with stereo audio, rendered in seconds, delegated to generate-interior-video-v2. veo-2 (50cr), wan-3.0-480p/720p/1080p (30/55/110cr) and seedance-2.5-480p/720p (60/125cr) ray-3.2-720p/1080p (20/70cr) are delegated the same way. kling-3.0 (20cr) is the one model run here, through Replicate. Credits debited upfront, non-refundabl",
    "fields": {
      "source_image_url": {
        "type": "string",
        "description": "Required. Source image for the video"
      },
      "prompt": {
        "type": "string",
        "description": "Optional generation prompt; model default applies if omitted"
      },
      "model": {
        "type": "string",
        "enum": [
          "h3-max-768p",
          "h3-max-480p",
          "kling-3.0",
          "veo-2",
          "wan-3.0-480p",
          "wan-3.0-720p",
          "wan-3.0-1080p",
          "seedance-2.5-480p",
          "seedance-2.5-720p",
          "ray-3.2-720p",
          "ray-3.2-1080p"
        ]
      },
      "aspect_ratio": {
        "type": "string",
        "enum": [
          "16:9",
          "9:16",
          "1:1"
        ]
      },
      "duration_seconds": {
        "type": "integer"
      },
      "workspace_id": {
        "type": "string"
      },
      "post_id": {
        "type": "string",
        "description": "Optional social_posts row ID to associate with"
      }
    }
  },
  {
    "name": "generate-virtual-staging",
    "tag": "AI Generation",
    "methods": [
      "POST"
    ],
    "summary": "AI virtual staging of an empty room via Replicate proplabs/virtual-staging",
    "description": "Takes an empty room image, room type, and optional furniture style/items. Calls proplabs/virtual-staging on Replicate with Prefer: wait polling (~56s, 20 credits). Emits virtual_staging_completed flow event on success. Accepts service-role key for agent-chat internal calls.",
    "fields": {
      "source_image_url": {
        "type": "string",
        "description": "Required. Public URL of the empty room image"
      },
      "room": {
        "type": "string",
        "description": "Required. Room type e.g. 'living room', 'bedroom'"
      },
      "furniture_style": {
        "type": "string",
        "description": "Optional furniture style; defaults to 'Default (AI decides)'"
      },
      "furniture_items": {
        "type": "string",
        "description": "Optional comma-separated list of specific furniture items"
      },
      "workspace_id": {
        "type": "string"
      },
      "user_id": {
        "type": "string",
        "description": "Required when called with service-role key (server-to-server)"
      },
      "conversation_id": {
        "type": "string"
      }
    }
  },
  {
    "name": "generate-vr-world",
    "tag": "AI Generation",
    "methods": [
      "POST"
    ],
    "summary": "Generate explorable 3D Gaussian Splat VR world from an interior image via WorldLabs Marble",
    "description": "Uploads source image to WorldLabs, triggers Marble world generation, polls for completion, stores splat URLs in the vr_worlds table. Model: marble-1.1 (190cr, ~7min); the marble-1.0-draft tier was retired. Set is_pano=true for 360° panoramic source images. Accepts service-role key for agent-chat internal calls.",
    "fields": {
      "source_image_url": {
        "type": "string",
        "description": "Required. Public URL of the interior image"
      },
      "prompt": {
        "type": "string",
        "description": "Required. Scene description prompt"
      },
      "room_type": {
        "type": "string"
      },
      "style": {
        "type": "string"
      },
      "model": {
        "type": "string",
        "enum": [
          "marble-1.1"
        ],
        "description": "WorldLabs model; marble-1.1 is the only tier"
      },
      "is_pano": {
        "type": "boolean",
        "description": "Set true for panoramic (360°) source images"
      },
      "user_id": {
        "type": "string",
        "description": "Required when called with service-role key (server-to-server)"
      }
    }
  },
  {
    "name": "gsc-api",
    "tag": "SEO",
    "methods": [
      "POST",
      "GET"
    ],
    "summary": "Google Search Console for connected websites (OAuth + performance sync)",
    "description": "Connects a user_website to a Google Search Console property and pulls first-party search-analytics (query/page/clicks/impressions/ctr/position) into gsc_performance. OAuth is SERVER-SIDE: Google's redirect_uri points at THIS function (GET ?code&state); it exchanges the code and 302s back to /profile?tab=websites&gsc=<connected|pick_property|error>. This avoids the SPA's supabase-js (detectSessionI",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "authorize",
          "list_properties",
          "set_property",
          "ga_list_properties",
          "ga_set_property",
          "ga_sync",
          "inspect_urls",
          "sync",
          "disconnect"
        ],
        "required": true,
        "description": "Which operation to run."
      }
    }
  },
  {
    "name": "health-check",
    "tag": "Admin",
    "methods": [
      "GET",
      "POST"
    ],
    "summary": "Check liveness and key validity of all AI providers and external services",
    "description": "Requires any valid Supabase JWT (not just admin). Runs parallel checks: Claude (GET /v1/models), OpenAI (GET /v1/models), HuggingFace (whoami), Voyage AI (POST /v1/embeddings), MIVAA embeddings + AI-services health endpoints, and HEAD reachability probes for Zernio, Apollo, Hunter.io, ZeroBounce, Firecrawl, WorldLabs, Stripe, and module-gated services (e.g. Greek marketplace URLs when greek-market"
  },
  {
    "name": "hr-api",
    "tag": "HR",
    "methods": [
      "POST"
    ],
    "summary": "HR module API — employees, absences, recruitment, onboarding, payroll, attendance, Ergani, accounting",
    "description": "Action-based HR backbone (#252). Session JWT; authenticate() yields a service-role client, so every action re-derives the workspace from body.workspace_id and calls userCanAccessWorkspace, plus isModuleEnabled('hr') and per-workspace assertEntitled('hr') (402 upsell). RBAC: reads need hr.view, writes/approvals need hr.manage (owner/admin/global-admin only); self-* actions are open to a linked empl"
  },
  {
    "name": "inbox-api",
    "tag": "Messaging",
    "methods": [
      "POST"
    ],
    "summary": "Multi-tenant unified inbox: threads, participants, messages, agent takeover",
    "description": "Action-based handler for the multi-tenant Inbox (#209). Three auth surfaces: JWT actions (authenticated member/operator/customer-account flows), token actions (token_*, service-role + scoped customer share token), and internal_agent_reply (service-role, called by the agent runtime). Threads are workspace-scoped with directional ACLs (internal/customer/upstream); the AI agent can auto-respond and b"
  },
  {
    "name": "intake-enrich-products",
    "tag": "Warehouse",
    "methods": [
      "POST"
    ],
    "summary": "Drain the products intake marked for enrichment, from a URL we already hold",
    "description": "Approving a queued supplier line never crawls: it stamps `metadata.enrichment = {status:'pending'}` and returns, so a slow or failed crawl cannot hold up a receipt. This is the drain, and it CLAIMS its batch — the stamp is the claim, so two runs cannot enrich one product twice.\n\nIt reads only a URL WE ALREADY HOLD: the product's own link, or its brand's site. Searching the open web for a spec shee",
    "fields": {
      "workspace_id": {
        "type": "string",
        "required": true,
        "description": "Reconciled against the caller — a mismatch 404s (string (uuid))"
      },
      "limit": {
        "type": "number",
        "description": "Batch size, capped at 10"
      }
    }
  },
  {
    "name": "kb-embedding-backfill",
    "tag": "Knowledge Base",
    "methods": [
      "POST"
    ],
    "summary": "Backfill Voyage embeddings for knowledge-base documents missing them",
    "description": "Re-embeds kb_docs that have no/stale embedding via the embeddings service, bounded by a limit. Auth: service-role bearer (cron / internal), shared cron secret, or an admin JWT.",
    "fields": {
      "limit": {
        "type": "integer",
        "description": "Max docs to process this run (clamped to an internal MAX_LIMIT)"
      },
      "workspace_id": {
        "type": "string",
        "description": "Restrict backfill to one workspace (string (uuid))"
      }
    }
  },
  {
    "name": "kb-generate-embedding",
    "tag": "Knowledge Base",
    "methods": [
      "POST"
    ],
    "summary": "Generate or regenerate a Voyage AI 1024D embedding for a kb_docs row",
    "description": "Triggered on kb_docs changes (via pg_net) or called directly by the admin UI. Builds text from title + content_markdown, calls MIVAA /api/embeddings/clip-text (voyage-4, 1024D), and writes the vector plus embedding metadata back to kb_docs.",
    "fields": {
      "doc_id": {
        "type": "string",
        "required": true,
        "description": "UUID of the kb_docs row to embed"
      }
    }
  },
  {
    "name": "marketplace-price-check",
    "tag": "Marketplace",
    "methods": [
      "POST"
    ],
    "summary": "Check a surplus-listing price against the Operator's market cap",
    "description": "Resolves the market price for a product (via MIVAA's market-check engine — Perplexity/DataForSEO/Firecrawl) and returns whether a proposed surplus listing price is within the Operator cap (market_median × (1 + cap%), default 20%). Same guard create_marketplace_listing enforces server-side so the client can't forge it. authenticate() + userCanAccessWorkspace(); workspace must be an approved marketp",
    "fields": {
      "workspace_id": {
        "type": "string",
        "required": true
      },
      "product_id": {
        "type": "string",
        "description": "product_id OR product_name is required"
      },
      "product_name": {
        "type": "string"
      },
      "price": {
        "type": "number",
        "description": "Proposed listing price to test against the cap"
      }
    }
  },
  {
    "name": "messaging-api",
    "tag": "Messaging",
    "methods": [
      "POST"
    ],
    "summary": "WhatsApp messaging via Zernio — send, bulk send, channel management, and analytics.",
    "description": "Action-discriminated API for WhatsApp via Zernio (Meta Cloud API). Requires `ZERNIO_API_KEY`; returns 503 with `provider_not_configured` when absent. Channels are `messaging_channels` rows linked to Zernio WhatsApp accounts. Cold/marketing sends require a Meta-approved template; freeform content is only valid inside the 24h customer-care window."
  },
  {
    "name": "mivaa-gateway",
    "tag": "MIVAA Gateway",
    "methods": [
      "POST",
      "GET"
    ],
    "summary": "Authenticated proxy to MIVAA Python backend with per-action credit billing",
    "description": "Action-discriminated reverse proxy to the MIVAA FastAPI backend. Authenticates the caller, checks admin access where required, debits credits per action, then forwards the payload to the corresponding MIVAA endpoint. Also handles multipart/form-data uploads (forwarded to rag_upload) and GET /job-status/{jobId} path requests. Any action whose resolved path is under /api/admin — plus admin_system_he",
    "fields": {
      "action": {
        "type": "string",
        "description": "One of 116 named ACTION_MAP keys selecting the backend route. Each action's description carries its MIVAA method + path "
      },
      "payload": {
        "type": "object",
        "description": "Arbitrary body forwarded verbatim to the selected MIVAA endpoint"
      }
    }
  },
  {
    "name": "myaade-rgwspublic2",
    "tag": "Business Profile",
    "methods": [
      "POST"
    ],
    "summary": "Greek business lookup by ΑΦΜ via ΑΑΔΕ RgWsPublic2 SOAP service.",
    "description": "Calls the ΑΑΔΕ RgWsPublic2 SOAP 1.2 endpoint with WS-Security UsernameToken (`AADE_USERNAME`/`AADE_PASSWORD` from env or platform_secrets). Returns basic company record and KAD activity codes. Uses a 90-day cache on `crm_companies.aade_data` to minimize TAXISnet quota consumption. Note: every live SOAP call writes an audit entry to the looked-up ΑΦΜ's TAXISnet inbox.",
    "fields": {
      "afm": {
        "type": "string",
        "required": true,
        "description": "Greek ΑΦΜ — exactly 9 digits (non-digit characters stripped)"
      },
      "company_id": {
        "type": "string",
        "description": "crm_companies.id — enables cache check and result write-back for authorized callers"
      }
    }
  },
  {
    "name": "mygemi-opendata",
    "tag": "Business Profile",
    "methods": [
      "POST"
    ],
    "summary": "Greek company lookup by ΑΦΜ via the ΓΕΜΗ (GEMI) OpenData REST API.",
    "description": "Queries the public ΓΕΜΗ OpenData API (GET /companies?afm=…) for the Greek Commercial Registry record — GEMI number, legal form, status, incorporation date, activities. Unlike the ΑΑΔΕ RgWsPublic2 service, ΓΕΜΗ OpenData is public open data behind a single operator-issued application key (env GEMI_API_KEY → platform_secrets), so ONE platform key serves every workspace with no per-tenant quota or aud",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "creds-status"
        ],
        "description": "Omit to run a lookup; creds-status reports whether credentials are set."
      },
      "afm": {
        "type": "string",
        "description": "Greek VAT number (ΑΦΜ) to look up, digits only."
      },
      "company_id": {
        "type": "string",
        "description": "Existing CRM company to enrich instead of passing an afm."
      },
      "workspace_id": {
        "type": "string",
        "description": "Workspace the company belongs to."
      }
    }
  },
  {
    "name": "notification-dispatcher",
    "tag": "Notifications",
    "methods": [
      "POST"
    ],
    "summary": "Dispatches browser push notifications (VAPID) and signed webhook deliveries with retry.",
    "description": "Action-discriminated handler for two notification channels. `send-push`: sends Web Push notifications to browser subscriptions using VAPID keys (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`). `send-webhook`: delivers a JSON payload to configured webhook endpoints with optional HMAC-SHA256 signing, up to 3 retries with configurable delay, and updates `webhook_endpoints` success/failure timestamps. `get-v"
  },
  {
    "name": "novus-onboarding",
    "tag": "Finance",
    "methods": [
      "POST"
    ],
    "summary": "Register a workspace's VAT with Novus so it can transmit to myDATA",
    "description": "Novus Onboarding API v1.0 under the platform's software-house key. Creates the onboarding application, downloads the generated contract PDF, uploads the signed copy, records acknowledgements for the manual steps, and syncs the provider's own status back. Approval triggers Novus provisioning and the Δήλωση Παρόχου filing with ΑΑΔΕ. Operator-only webhook_* actions register the signed callback endpoi",
    "fields": {
      "action": {
        "type": "string",
        "description": "status | save_application | create | contract | upload_signed | acknowledge | cancel | webhook_status | webhook_register"
      },
      "workspace_id": {
        "type": "string",
        "description": "Workspace whose VAT is being registered. Verified against the caller's membership."
      },
      "step": {
        "type": "string",
        "description": "acknowledge only: contract_delivered | contract_signed | statement_accepted"
      },
      "contractFile": {
        "type": "file",
        "description": "upload_signed only: the signed PDF, 15 MB max, multipart field."
      }
    }
  },
  {
    "name": "ontology-propose-targets",
    "tag": "Warehouse",
    "methods": [
      "POST"
    ],
    "summary": "Propose a target for the invoice terms the ontology cannot resolve",
    "description": "Every unresolved binding carried `proposed_by = NULL`, so the work list was every unmatched invoice term waiting to be paired by hand. This reads a batch, asks a model and writes back CANDIDATES — a human still confirms, because confirming changes what products get classified as and therefore what they cost.\n\nThe rubric is a DB row (`prompt_type='tool'`, `category='ontology_propose'`), so what cou",
    "fields": {
      "workspace_id": {
        "type": "string",
        "required": true,
        "description": "Reconciled against the caller — a mismatch 404s (string (uuid))"
      },
      "concept_type": {
        "type": "string",
        "description": "manufacturer (default) | supplier"
      },
      "limit": {
        "type": "number",
        "description": "Batch size, capped at 25: a hundred answers in one turn is one nobody reviews"
      }
    }
  },
  {
    "name": "page-watches",
    "tag": "Monitoring Crons",
    "methods": [
      "POST"
    ],
    "summary": "CRUD for watched pages, mirrored to Firecrawl monitors.",
    "description": "Action-dispatched endpoint backing the Page Monitoring UI. Creates, updates and deletes a Firecrawl monitor alongside each `page_watches` row so the two never drift — a row deleted without its monitor would keep billing on its schedule. Requires a user JWT; the supplied workspace_id is verified against the caller's membership before any read or write. `run` debits a Firecrawl credit before startin",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "list",
          "changes",
          "create",
          "update",
          "remove",
          "run",
          "acknowledge"
        ],
        "description": "Operation to perform"
      },
      "workspace_id": {
        "type": "string",
        "description": "Verified against the caller's memberships"
      },
      "id": {
        "type": "string",
        "description": "page_watches id; required by changes/update/remove/run"
      },
      "change_id": {
        "type": "string",
        "description": "page_watch_changes id; required by acknowledge"
      },
      "name": {
        "type": "string"
      },
      "url": {
        "type": "string",
        "description": "https only; validated through the shared SSRF guard"
      },
      "category": {
        "type": "string",
        "enum": [
          "supplier_terms",
          "regulatory",
          "partner_docs",
          "competitor",
          "other"
        ]
      },
      "goal": {
        "type": "string",
        "description": "Natural-language definition of a meaningful change; enables Firecrawl's judge"
      },
      "schedule_text": {
        "type": "string",
        "description": "Plain-English schedule, e.g. 'every day at 09:00'"
      },
      "timezone": {
        "type": "string"
      },
      "is_active": {
        "type": "boolean",
        "description": "update only; pauses the upstream monitor too"
      },
      "limit": {
        "type": "integer",
        "description": "changes only; capped at 200"
      }
    }
  },
  {
    "name": "parse-supplier-cost-list",
    "tag": "Finance",
    "methods": [
      "POST"
    ],
    "summary": "Parse a KB doc supplier cost list and apply costs to matching products",
    "description": "Reads a kb_docs row with price_doc_type='supplier_cost_list', parses its Markdown table for SKU/cost rows, bulk-matches against products by sku or external_sku within the workspace, and updates products.cost. Supports dry_run mode to preview matches without writing.",
    "fields": {
      "kb_doc_id": {
        "type": "string",
        "required": true,
        "description": "KB doc with price_doc_type='supplier_cost_list'. (string (uuid))"
      },
      "dry_run": {
        "type": "boolean",
        "description": "Preview matches without writing costs to products."
      }
    }
  },
  {
    "name": "pinterest-api",
    "tag": "Pinterest",
    "methods": [
      "POST"
    ],
    "summary": "Import Pinterest pins into the catalogue by URL",
    "description": "Pinterest pin IMPORT only. The OAuth half (get_auth_url / callback / get_boards / get_board_pins / disconnect) was removed — board browsing needed a connected account and nothing used it. Extract a pin's image + metadata by URL, then import one or many into the catalogue."
  },
  {
    "name": "platform-secrets-admin",
    "tag": "Admin",
    "methods": [
      "POST"
    ],
    "summary": "CRUD for the platform_secrets key store (admin/super_admin only)",
    "description": "Action-discriminated endpoint for listing, saving, and deleting platform secret values. Sensitive values are masked in list responses. Saves invalidate the in-worker secret cache. ENV values always take precedence over DB values; editing here only affects the DB fallback."
  },
  {
    "name": "product-datasheet-pdf",
    "tag": "Products",
    "methods": [
      "POST"
    ],
    "summary": "Branded technical datasheet for one product, as a PDF",
    "description": "Any authenticated member of the product's workspace. Renders through the shared branded-document renderer, so the datasheet carries the same cover, background and company identity as that workspace's quotes and catalogues rather than a second idea of the brand. Specifications, attributes and properties are printed once each, in that order, with certificates as their own block. Internal fields are ",
    "fields": {
      "product_id": {
        "type": "string",
        "required": true,
        "description": "The product to render"
      }
    }
  },
  {
    "name": "product-document-url",
    "tag": "Products",
    "methods": [
      "POST"
    ],
    "summary": "Signed, short-lived link to the original file behind a product's knowledge doc or certificate",
    "description": "Any authenticated member of the product's workspace. Resolves the source document of a kb_doc attached to the product, or a document named by one of the product's certificates, and returns a 5-minute signed download URL. pdf-documents is a private bucket, so the URL is minted per read and never stored. Authorization is decided by get_product_document_path, which runs AS THE CALLER. A catalogue rea",
    "fields": {
      "product_id": {
        "type": "string",
        "required": true,
        "description": "The product the document must be reachable from"
      },
      "kb_doc_id": {
        "type": "string",
        "description": "A knowledge doc attached to that product; its source file is returned"
      },
      "document_id": {
        "type": "string",
        "description": "A document named by one of the product's certificates"
      }
    }
  },
  {
    "name": "product-market-price",
    "tag": "Products",
    "methods": [
      "POST"
    ],
    "summary": "What a catalogue product is worth on the open market",
    "description": "Returns the derived market price for a product: the min/max band, the median, and the chosen price (lowest verified in-stock retailer hit) with the basis and confidence stated. Reads resolve_product_market_price, the platform's one price derivation, so a tile and a report cannot disagree. Never triggers a paid scan: the request is recorded as demand, which shortens the refresh cadence for products",
    "fields": {
      "product_id": {
        "type": "string",
        "required": true
      },
      "workspace_id": {
        "type": "string",
        "required": true
      }
    }
  },
  {
    "name": "profile-review-summary",
    "tag": "Profiles",
    "methods": [
      "POST"
    ],
    "summary": "Regenerates the AI summary printed above a professional's public reviews.",
    "description": "Reads the non-hidden reviews written about user_id, and when at least three carry written comments and the stored summary is stale, asks Claude for a 2-3 sentence summary and stores it in review_summaries.summary_text. Every gate runs before the model call, so a fresh summary costs nothing. Review text is fenced as data, not instructions. Not credit-metered: the summary is a marketplace surface th",
    "fields": {
      "user_id": {
        "type": "string",
        "required": true,
        "description": "The reviewed professional's user id."
      }
    }
  },
  {
    "name": "project-assessment",
    "tag": "Projects",
    "methods": [
      "POST"
    ],
    "summary": "Derive a project's health signals, and optionally write the AI assessment of them",
    "description": "Two modes over one project. `preview` returns the SQL derivation only — the signals across six dimensions, the dimension scores and the verdict — and is free. `run` reserves credits, adds one Claude turn over those same signals to produce a headline, a narrative and a ranked action list, then settles against real token usage. The model never counts, scores or decides the verdict: every number come",
    "fields": {
      "project_id": {
        "type": "string",
        "description": "The project to assess (uuid). Required."
      },
      "mode": {
        "type": "string",
        "enum": [
          "preview",
          "run"
        ],
        "description": "`preview` is the free derivation; `run` costs credits."
      },
      "today": {
        "type": "string",
        "description": "The operator's local calendar day as YYYY-MM-DD. Decides what counts as overdue; bounded to +/-2 days of the server date"
      }
    }
  },
  {
    "name": "project-plan-engine",
    "tag": "Quotes",
    "methods": [
      "POST"
    ],
    "summary": "Authoritative compute for the Blueprint estimating engine (plans, pricing, versions, quotes)",
    "description": "The only writer of persisted plan-line prices, plan versions, and plan->quote items (#242). User JWT or service-role secret; every write re-binds to the plan/project workspace via userCanAccessWorkspace. Resolves quantities from formulas + rates from product_prices, expands sub-blueprints, and syncs to quotes / purchase items.",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "create-from-blueprint",
          "create-plan-from-kitchen-estimate",
          "rescale",
          "reprice",
          "save-version",
          "restore-version",
          "create-quote-from-plan",
          "add-section-from-blueprint",
          "generate-material-list",
          "create-change-order"
        ],
        "required": true,
        "description": "Which operation to run."
      }
    }
  },
  {
    "name": "quotes-api",
    "tag": "Quotes",
    "methods": [
      "POST",
      "GET",
      "PATCH"
    ],
    "summary": "REST API for quote requests (customer-facing)",
    "description": "Path-routed REST handler for customer quote requests: create one from a quote, list/get the caller’s own, and update its status. All operations scoped to the authenticated user. The /proposals routes were removed with the `proposals` table on 2026-08-30 (#378 N9) — it was an abandoned second quoting system that never held a row. Live quotes are `quotes` / `quote_items`.",
    "routes": [
      "quote-requests"
    ],
    "fields": {
      "quote_id": {
        "type": "string",
        "description": "Quote request id, for GET/PATCH on quote-requests/{id}."
      },
      "notes": {
        "type": "string",
        "description": "Free-text notes when raising a quote request."
      },
      "status": {
        "type": "string",
        "description": "New status, on PATCH quote-requests/{id}."
      }
    }
  },
  {
    "name": "real-estate-api",
    "tag": "Real Estate",
    "methods": [
      "POST"
    ],
    "summary": "Real Estate module — listings, leads, viewings, offers, sales, lettings, investments and deals",
    "description": "Single action router for the Real Estate module (#249/#281). Gate order per request: `authenticate` → `userCanAccessWorkspace` (404 on mismatch) → `isModuleEnabled('real-estate')` (404) → `assertEntitled(ws, 'real-estate')` (402) → Real-Estate RBAC (`canView` / `canManage`).\n\n**Agent scoping.** A broker sees every listing in the workspace. A `realestate_agent` sees a listing only when they are its",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "ping",
          "dashboard",
          "list-properties",
          "get-property",
          "create-property",
          "update-property",
          "delete-property",
          "publish-property",
          "draft-description",
          "unpublish-property",
          "photo-upload-url",
          "add-photo",
          "list-bookings",
          "upsert-booking",
          "delete-booking",
          "upsert-booking-task",
          "upsert-channel-link",
          "rotate-ical-token",
          "update-tenancy-lifecycle",
          "rotate-tenant-portal-token",
          "list-inspections",
          "upsert-inspection",
          "kyc-status",
          "upsert-kyc-check",
          "update-kyc-policy",
          "list-commission-splits",
          "upsert-commission-split",
          "delete-commission-split",
          "agent-commission-statement",
          "list-routing-rules",
          "upsert-routing-rule",
          "delete-routing-rule",
          "import-listings",
          "listing-performance",
          "document-upload-url",
          "add-document",
          "list-documents",
          "delete-document",
          "upsert-open-house",
          "delete-open-house",
          "analyze-photos",
          "delete-photo",
          "set-cover",
          "reorder-photos",
          "list-inquiries",
          "convert-inquiry",
          "update-inquiry",
          "create-inquiry",
          "delete-inquiry",
          "delete-offer",
          "delete-viewing",
          "delete-tenancy",
          "delete-maintenance",
          "delete-sale",
          "delete-investment",
          "delete-contact-ext",
          "list-viewings",
          "create-viewing",
          "update-viewing",
          "add-interest",
          "list-offers",
          "create-offer",
          "update-offer",
          "accept-offer",
          "complete-sale",
          "list-sales",
          "link-sale-invoice",
          "contact-properties",
          "list-sellers",
          "list-buyer-requirements",
          "upsert-buyer-requirement",
          "match-buyer-requirement",
          "buyers-for-property",
          "delete-buyer-requirement",
          "get-contact-ext",
          "upsert-contact-ext",
          "get-feed-settings",
          "update-feed-settings",
          "rotate-feed-token",
          "rotate-inbound-token",
          "list-tenancies",
          "upsert-tenancy",
          "list-rent-charges",
          "generate-rent-schedule",
          "mark-rent-paid",
          "list-maintenance",
          "upsert-maintenance",
          "landlord-statement",
          "get-investment",
          "upsert-investment",
          "list-investments",
          "invoice-rent-charge",
          "renew-tenancy",
          "cma-report",
          "vendor-report",
          "send-vendor-report"
        ],
        "required": true,
        "description": "Which operation to run."
      }
    }
  },
  {
    "name": "real-estate-assessment",
    "tag": "Real Estate",
    "methods": [
      "POST"
    ],
    "summary": "Derive one property listing's health signals, and optionally write the AI assessment of them",
    "description": "Same two modes as project-assessment, over ONE property. Signals cover listing completeness (photos, description, price, energy class, area), pricing against the listing's own history, returns (yield, rent arrears, deposit protection), tenancy and listing expiries, open maintenance, and whether enquiries and viewings are being answered. Market activity comes from get_property_performance and is ne",
    "fields": {
      "property_id": {
        "type": "string",
        "description": "The property to assess (uuid). Required."
      },
      "mode": {
        "type": "string",
        "enum": [
          "preview",
          "run"
        ],
        "description": "`preview` is the free derivation; `run` costs credits."
      },
      "today": {
        "type": "string",
        "description": "The operator's local calendar day as YYYY-MM-DD. Decides what counts as overdue; bounded to +/-2 days of the server date"
      }
    }
  },
  {
    "name": "real-estate-owner",
    "tag": "Real Estate",
    "methods": [
      "POST"
    ],
    "summary": "A property owner reading their own property",
    "description": "What a vendor or landlord sees of a property they own: the listing, viewing and enquiry activity, offers in AGGREGATE, the viewing feedback an agent has not hidden, price history, and - where the Property Management add-on is entitled - the tenancy, rent received and outstanding, work done and inspections.\n\nThe caller is NOT a workspace member. Access is a `record_guests` row with `role='owner'` f",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "list",
          "get"
        ],
        "required": true,
        "description": "list = every property this owner was granted; get = one of them in full."
      },
      "property_id": {
        "type": "string",
        "description": "Required for get. Must be a property the signed-in user holds an owner grant on."
      }
    }
  },
  {
    "name": "recommendations-api",
    "tag": "Recommendations",
    "methods": [
      "POST",
      "GET",
      "DELETE"
    ],
    "summary": "Collaborative filtering interaction tracking, recommendations, and analytics.",
    "description": "Path-routed REST API. POST /track-interaction records user-material interactions and invalidates the user's recommendation cache. GET /for-user returns cached recommendation scores or indicates Python service is needed for fresh computation. GET /similar-materials/{id} computes item-item similarity from interaction co-occurrence. GET /analytics/{workspace_id} returns interaction counts by type and",
    "routes": [
      "track-interaction"
    ],
    "fields": {
      "workspace_id": {
        "type": "string",
        "required": true,
        "description": "Workspace the interaction belongs to."
      },
      "material_id": {
        "type": "string",
        "required": true,
        "description": "Material the user interacted with."
      },
      "interaction_type": {
        "type": "string",
        "required": true,
        "description": "Kind of interaction; the endpoint validates against its own list."
      },
      "interaction_value": {
        "type": "number",
        "description": "Weight of the interaction. Defaults to 1.0."
      }
    }
  },
  {
    "name": "reset-platform",
    "tag": "Admin",
    "methods": [
      "POST"
    ],
    "summary": "Destructively clear all user-generated data while preserving system config",
    "description": "Admin-only (admin role or service-role secret). Truncates ~80 tables of user/AI-generated data, clears pdf-tiles and generation-images storage buckets, wipes all VECS embedding collections, trims prompt_history to 5 rows per prompt, and clears the MIVAA server /tmp folder. Preserves KB, CRM, users, credits, prompts, flows, price-monitoring, and admin config tables.",
    "fields": {
      "confirm": {
        "type": "boolean",
        "required": true,
        "description": "Must be true; acts as an explicit confirmation gate"
      }
    }
  },
  {
    "name": "revolut-api",
    "tag": "Finance",
    "methods": [
      "POST"
    ],
    "summary": "Revolut Business connection management (per-workspace BYOK) — keys, OAuth, accounts, mapping, sync",
    "description": "#315. Actions on one POST surface: init (mint RSA keypair server-side; private key never leaves the server), authorize-url (Revolut consent URL), oauth-complete (exchange the auth code via JWT client assertion), register-webhook (webhooks v2 subscription + signing secret), accounts (live Revolut accounts + finance_bank_accounts mapping), map-account (link a Revolut currency pocket to a bank accoun",
    "fields": {
      "action": {
        "type": "string",
        "required": true,
        "description": "init | authorize-url | oauth-complete | register-webhook | accounts | map-account | validate-account-name | reconcile | "
      },
      "workspace_id": {
        "type": "string",
        "required": true,
        "description": "Target workspace; caller must be its finance manager. (uuid)"
      },
      "redirect_uri": {
        "type": "string",
        "description": "init only. The OAuth redirect URI registered in the Revolut dashboard; its domain becomes the JWT assertion issuer. (str"
      },
      "force": {
        "type": "boolean",
        "description": "init only. Regenerate over an existing keypair (invalidates the current connection)."
      },
      "code": {
        "type": "string",
        "description": "oauth-complete only. Authorisation code from the consent redirect."
      },
      "revolut_account_id": {
        "type": "string",
        "description": "map-account only. Revolut account (currency pocket) id."
      },
      "bank_account_id": {
        "type": "string",
        "description": "map-account only. finance_bank_accounts row to link, or null to unlink. (one of: uuid | null)"
      },
      "name": {
        "type": "string",
        "description": "validate-account-name only. The holder name to check (company by default; company=false splits into first/last)."
      },
      "iban": {
        "type": "string",
        "description": "validate-account-name only. IBAN to check (or account_no + sort_code)."
      }
    }
  },
  {
    "name": "revolut-merchant-webhooks",
    "tag": "Payments",
    "methods": [
      "POST"
    ],
    "summary": "Revolut Merchant (checkout) webhook receiver + per-workspace webhook setup",
    "description": "#315 payments-revolut. Two surfaces: POST ?setup=1 (user JWT, finance manager, module entitlement) registers the merchant webhook with the tenant's own secret key and stores the signing secret; POST ?ws=<workspace_id> receives signed deliveries (HMAC v1.<timestamp>.<body>, 5-min window, fail-closed 503 without a stored secret). On ORDER_COMPLETED the order is re-read from the Merchant API with the",
    "fields": {
      "setup": {
        "type": "string",
        "description": "Setup surface: register the webhook for body.workspace_id. (1 (query))"
      },
      "ws": {
        "type": "string",
        "description": "Delivery surface: workspace whose signing secret verifies this delivery. (uuid (query))"
      }
    }
  },
  {
    "name": "revolut-sync",
    "tag": "Finance",
    "methods": [
      "POST"
    ],
    "summary": "Revolut transaction sync sweep — cron backstop over every connected workspace",
    "description": "#315. Pulls transactions since each workspace's watermark (first run: 365 days) and upserts statement lines into revolut_bank_transactions, deduped on workspace + '<txid>:<legid>'. Dual auth like finance-inbound-sync: x-cron-secret/service-role for the cron path; a JWT user path restricted to the caller's own workspaces. Skips workspaces whose banking-revolut entitlement lapsed. Failures land in w"
  },
  {
    "name": "role-upgrade-requests",
    "tag": "Business Profile",
    "methods": [
      "POST"
    ],
    "summary": "Dealer/factory role promotion workflow — submit, approve, and reject requests.",
    "description": "Three actions gated by the `action` field. `submit` (any authenticated business user): validates entity_type='business', re-validates VAT via VIES, inserts `role_upgrade_requests`, fans out bell notifications and emails to all admins. `approve` and `reject` (admin only): flip request status, promote or leave user role, and email the applicant. Emits Flows events for each transition."
  },
  {
    "name": "scan-drawing-title-block",
    "tag": "Projects",
    "methods": [
      "POST"
    ],
    "summary": "Read a drawing's title block into project drawing-register fields",
    "description": "Turns a PDF or image of a drawing sheet into the fields a register entry needs: drawing number, title, revision, discipline, scale, sheet size, issue date and the purpose it was issued for. The reader is a forced Anthropic tool call over the sheet; credits are debited BEFORE the model runs, and the prompt is loaded from the database with no code fallback. The workspace is derived from the PROJECT ",
    "fields": {
      "project_id": {
        "type": "string",
        "required": true,
        "description": "The register's project. Its workspace is what the caller is checked against; a project in another workspace reports as n"
      },
      "content_type": {
        "type": "string",
        "required": true,
        "description": "application/pdf or image/jpeg|png|webp|gif|heic|heif"
      },
      "data_base64": {
        "type": "string",
        "required": true,
        "description": "The sheet, base64 or a data URL. Capped at about 4 MB so a credit is never spent on a call the provider would reject."
      }
    }
  },
  {
    "name": "scan-receipt",
    "tag": "Finance",
    "methods": [
      "POST"
    ],
    "summary": "Read a photographed receipt into expense fields, and keep the image on the bill",
    "description": "Turns a photo or PDF of a receipt into the fields an expense needs (#379). The reader is a forced Anthropic tool call over the image; credits are debited BEFORE the model runs, and the prompt is loaded from the database with no code fallback. It deliberately writes nothing: the caller creates the trip line or the supplier bill and confirms the figures, because a confident wrong reading is the fail",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "scan",
          "attach_bill",
          "sign_bill"
        ],
        "required": true,
        "description": "Which operation to run."
      },
      "workspace_id": {
        "type": "string",
        "description": "Workspace the receipt belongs to."
      },
      "data_base64": {
        "type": "string",
        "description": "The receipt image or PDF, base64 encoded."
      },
      "content_type": {
        "type": "string",
        "description": "MIME type of data_base64, e.g. image/jpeg."
      }
    }
  },
  {
    "name": "send-quote-email",
    "tag": "Quotes",
    "methods": [
      "POST"
    ],
    "summary": "Email a quote to a recipient with a public share link",
    "description": "Sends a quote summary email to the customer (or an explicit address). Ensures a public share token exists (mints one if needed), composes inline HTML with a view-quote link and optional free-text message, and dispatches via email-api. Authorized for the quote owner or an admin.",
    "fields": {
      "quote_id": {
        "type": "string",
        "required": true,
        "description": "Quote to email. (string (uuid))"
      },
      "to": {
        "type": "string",
        "description": "Override recipient; defaults to CRM customer email then quote owner. (string (email))"
      },
      "message": {
        "type": "string",
        "description": "Optional free-text note included above the quote summary in the email."
      }
    }
  },
  {
    "name": "seo-api",
    "tag": "SEO",
    "methods": [
      "POST"
    ],
    "summary": "Unified SEO API — action-discriminated keyword research, planning, writing, analysis, and toolkit.",
    "description": "Single POST endpoint routing on body.action to one of eight handlers: research, plan, write, analyze, pipeline, toolkit_audit, toolkit_research, page_ideas. All handlers require Supabase JWT auth and debit user credits. toolkit_audit also accepts x-cron-secret for cron-mode batch auditing.",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "research",
          "plan",
          "write",
          "analyze",
          "pipeline",
          "toolkit_audit",
          "toolkit_research",
          "page_ideas",
          "apply_fix",
          "revert_fix",
          "reanalyze",
          "add_faq",
          "score_url"
        ],
        "required": true,
        "description": "Which operation to run."
      }
    }
  },
  {
    "name": "seo-content-freshness",
    "tag": "SEO",
    "methods": [
      "POST"
    ],
    "summary": "Content decay — raise generated articles that are past their own refresh cadence",
    "description": "Weekly sweep over seo_article_freshness (the derived content-decay view). Emits a seo.article_refresh_due flow event per overdue article and stamps refresh_notified_at so one nudge lands per refresh cycle rather than per cron tick. Due-ness is derived in SQL by seo_article_refresh_due_at(); this function never re-adds an interval to a date. verify_jwt is disabled at the gateway and the only action"
  },
  {
    "name": "seo-domain-tracker",
    "tag": "SEO",
    "methods": [
      "POST"
    ],
    "summary": "Weekly Rankings + Backlinks snapshots for a connected website",
    "description": "Snapshots DataForSEO domain rank overview (ranking keywords, organic traffic, position buckets, up/down/new/lost) + backlinks summary (backlinks, referring domains, spam score) + top ranked keywords for the site's MARKET (resolved from its GSC top country, else TLD, else US) into seo_domain_snapshots + seo_domain_keywords. verify_jwt disabled so the weekly cron-run (x-cron-secret) works; the run a"
  },
  {
    "name": "seo-rank-tracker",
    "tag": "SEO",
    "methods": [
      "POST"
    ],
    "summary": "Daily positions for the keywords a workspace chose to track",
    "description": "Checks each active row in seo_tracked_keywords against the live Google SERP and writes one seo_keyword_positions row per keyword per day. Distinct from seo-domain-tracker, which DISCOVERS what a domain happens to rank for and replaces that set weekly; this follows a fixed, user-picked set as a time series. Outside the top 100 stores position NULL with found=false — never a sentinel rank, which wou"
  },
  {
    "name": "seo-reports",
    "tag": "SEO",
    "methods": [
      "POST"
    ],
    "summary": "Build a scheduled SEO report and hand it to Flows to deliver",
    "description": "Composes the report from build_website_seo_report, which calls the same derivations the dashboard reads — it computes no figure itself, so a number in the report and the same number on screen cannot drift. Each run is stored as a FROZEN snapshot in seo_report_runs and read back verbatim; re-deriving on open would show today's numbers under an old date. A run that fails to build is still stored, be"
  },
  {
    "name": "seo-site-audit",
    "tag": "SEO",
    "methods": [
      "POST"
    ],
    "summary": "Site Health — homepage Lighthouse + on-page audit for a connected website",
    "description": "Runs a synchronous homepage audit (DataForSEO instant-page + Google Lighthouse) via MIVAA's quick-page route and stores Core Web Vitals / SEO / accessibility / best-practices scores + failing-audit issues in website_health_audits. verify_jwt disabled so the weekly cron-run (x-cron-secret) works; the run action calls authenticate()+userCanAccessWorkspace(). The full multi-page OnPage crawl stays on",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "crawl-start",
          "crawl-sync"
        ],
        "required": true,
        "description": "Which operation to run."
      }
    }
  },
  {
    "name": "stock-api",
    "tag": "Stock",
    "methods": [
      "POST"
    ],
    "summary": "Stock / warehouse module - inventory, movements, counts, shipments and forecasting",
    "description": "Stock Management API. Promotes the warehouse/inventory feature (previously a Finance tab) into a first-class PAID ADD-ON, mirroring hr-api (#252). Gate order: authenticate -> userCanAccessWorkspace -> isModuleEnabled('stock') -> assertEntitled(ws,'stock'), then finance-manager RBAC on writes.",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "overview",
          "valuation",
          "list-warehouses",
          "ensure-default-warehouse",
          "create-warehouse",
          "list-items",
          "list-low-stock",
          "create-item",
          "update-item",
          "delete-item",
          "adjust-stock",
          "transfer",
          "forecast",
          "ai-forecast",
          "reorder",
          "import-opening-stock",
          "list-movements",
          "list-counts",
          "get-count",
          "create-count",
          "update-count-line",
          "post-count",
          "cancel-count",
          "shipment-list",
          "shipment-add",
          "shipment-refresh",
          "shipping-quotes-list",
          "shipping-quote",
          "shipment-remove",
          "shipment-receive",
          "list-pending",
          "approve-pending",
          "dismiss-pending"
        ],
        "required": true,
        "description": "Which operation to run."
      }
    }
  },
  {
    "name": "stripe-api",
    "tag": "Payments",
    "methods": [
      "POST"
    ],
    "summary": "Stripe Checkout and Customer Portal session creator",
    "description": "Action-discriminated endpoint for platform billing. 'checkout' creates a Stripe Checkout session for credit purchases or subscriptions; 'customer_portal' creates a billing portal session for subscription management. Uses the dedicated platform-billing Stripe account when configured."
  },
  {
    "name": "stripe-connect",
    "tag": "Payments",
    "methods": [
      "POST"
    ],
    "summary": "Stripe Connect onboarding and status for per-workspace payouts",
    "description": "Manages Stripe Express accounts for per-workspace destination charges. 'onboard' gets or creates an Express account and returns an onboarding link; 'status' refreshes charges_enabled and details_submitted flags. Caller must be workspace owner or admin."
  },
  {
    "name": "structure-site-note",
    "tag": "Projects",
    "methods": [
      "POST"
    ],
    "summary": "Turn a dictated site walk into a diary entry and the defects it described",
    "description": "One site walk normally produces two kinds of record at once — a diary entry about the day and several distinct defects — so this returns both, with each defect as its own record because they get assigned and closed separately. The reader is a forced Anthropic tool call over the transcript; credits are debited BEFORE the model runs and the prompt is loaded from the database with no code fallback. T",
    "fields": {
      "project_id": {
        "type": "string",
        "required": true,
        "description": "The project the records belong to. Its workspace is what the caller is checked against; a project in another workspace r"
      },
      "transcript": {
        "type": "string",
        "required": true,
        "description": "What was dictated. Capped at 20,000 characters — a long walk is a few hundred words."
      }
    }
  },
  {
    "name": "takeoff-from-drawing",
    "tag": "Projects",
    "methods": [
      "POST"
    ],
    "summary": "Transcribe the schedules printed on a drawing into proposed bill-of-quantities lines",
    "description": "Reads the tabular schedules a design team PRINTED on a drawing sheet — door, window, room, finishes — and returns them as proposed schedule-of-works lines. It transcribes; it never measures. A quantity worked out from the geometry of a plan is a guess indistinguishable from a fact, and somebody orders materials against it, so the tool schema offers no area or length field and every returned row mu",
    "fields": {
      "revision_id": {
        "type": "string",
        "required": true,
        "description": "The drawing revision to read. Its file location and its workspace are both taken from this row; nothing about which byte"
      }
    }
  },
  {
    "name": "taric-classify",
    "tag": "Customs",
    "methods": [
      "POST"
    ],
    "summary": "Propose a TARIC commodity code for catalog products",
    "description": "Three stages, cheapest first: a supplier-declared HS/CN/TARIC code found in the product attributes is validated and applied directly; otherwise search_taric_codes shortlists candidates and Claude picks one through a forced tool call. The model result is NEVER written to products.taric_code — it lands in taric_code_suggested with a confidence for a human to confirm, because a tariff misclassificati",
    "fields": {
      "product_ids": {
        "type": "array",
        "required": true,
        "description": "Products to classify. The backfill sweep is cron-only."
      },
      "chapters": {
        "type": "array",
        "description": "Narrow the shortlist to these 2-digit HS chapters."
      },
      "force": {
        "type": "boolean",
        "description": "Re-classify products that already carry a code or suggestion."
      },
      "llm": {
        "type": "boolean",
        "description": "Allow the paid stage C. Defaults true for an operator call."
      }
    }
  },
  {
    "name": "taric-reference-sync",
    "tag": "Customs",
    "methods": [
      "POST"
    ],
    "summary": "Import the EU TARIC goods nomenclature (Greek extract) into the reference table",
    "description": "Loads a CSV/TSV export of the TARIC goods nomenclature into public.taric_codes, which backs the commodity-code picker, code validation and the classifier shortlist. Column headers are matched against an alias table so the EU export, the Greek national export and an admin re-export all load unconfigured. Admin JWT for the import; the monthly refresh cron authenticates with x-cron-secret and fetches"
  },
  {
    "name": "tender-bid-portal",
    "tag": "Projects",
    "methods": [
      "POST"
    ],
    "summary": "Issue a trade package to a subcontractor and take their priced return",
    "description": "Makes a tender sendable. `send` (authenticated) mints a private link for one bid, emails it to the subcontractor's CRM address and returns the link either way, since a company with no email on file is ordinary. `resolve_token` and `submit` are PUBLIC and token-authenticated: the subcontractor never needs an account. THE TOKEN IS PER BID, which is the security model — it resolves to one subcontract"
  },
  {
    "name": "trade-portal",
    "tag": "CRM",
    "methods": [
      "POST"
    ],
    "summary": "A trade customer seeing their own account: statement, stock bands, reorder and a delegated admin",
    "description": "THE TOKEN IS THE IDENTITY. Every read and write is scoped by what the link resolves to, and a company id in the request body is never trusted. The access pattern is a link unique to the recipient with no account for them to create and forget — which is what pastes into a WhatsApp thread.\n\nThe piece bespoke portals miss is DELEGATED ADMINISTRATION: `admin` on a portal account is the customer's own "
  },
  {
    "name": "trigger-factory-enrichment",
    "tag": "Admin",
    "methods": [
      "POST"
    ],
    "summary": "Propagate factory fields within a scope and queue a factory-enrichment agent if needed",
    "description": "Called by PDF, XML, and scraping import pipelines after products are inserted. Runs propagateFactoryFieldsInScope to share the best factory object across all products in the same document/session scope, then queues a background agent_run (agent_type='factory-enrichment') when average completeness score is below 0.9.",
    "fields": {
      "workspace_id": {
        "type": "string",
        "required": true,
        "description": "Workspace to operate within"
      },
      "product_ids": {
        "type": "array",
        "description": "Specific product IDs to check; falls back to scope query"
      },
      "scope_column": {
        "type": "string",
        "description": "source_document_id or scrape_session_id"
      },
      "scope_value": {
        "type": "string",
        "description": "Value for scope_column"
      },
      "force_enrichment": {
        "type": "boolean",
        "description": "Skip completeness score check; always queue"
      }
    }
  },
  {
    "name": "trip-expense-ops",
    "tag": "Finance",
    "methods": [
      "POST"
    ],
    "summary": "Sales trip-expense receipts: upload, sign, and render the expense PDF",
    "description": "Service-role-backed receipt operations for sales trip-expense cards (receipts live in the private pdf-documents bucket and feed per-line finance approval / reimbursement to planned_payment). The caller is the authenticated trip owner; the function writes via service role.",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "upload_receipt",
          "sign_receipt",
          "generate_pdf"
        ],
        "required": true,
        "description": "Which operation to run."
      }
    }
  },
  {
    "name": "vies-validate",
    "tag": "Business Profile",
    "methods": [
      "POST"
    ],
    "summary": "Server-side EU VAT validation via the VIES REST API with optional crm_companies cache write.",
    "description": "Accepts a JWT-authenticated POST with `country_code` and `vat_number`. Non-EU codes are skipped with `skipped_reason='non_eu'`; VIES outages return 503 with `skipped_reason='vies_unreachable'`. If `company_id` is supplied and the caller owns the company (or is admin), the validated result is cached on `crm_companies` VIES columns.",
    "fields": {
      "country_code": {
        "type": "string",
        "required": true,
        "description": "ISO 3166-1 alpha-2 EU country code (e.g. EL, DE, FR); EL is used for Greece"
      },
      "vat_number": {
        "type": "string",
        "required": true,
        "description": "VAT number (with or without country prefix; prefix wins if present)"
      },
      "company_id": {
        "type": "string",
        "description": "crm_companies.id — if provided and authorized, caches the result on the company row"
      }
    }
  },
  {
    "name": "viva-config-test",
    "tag": "Payments",
    "methods": [
      "POST"
    ],
    "summary": "Viva.com connection test — proves stored BYOK credentials against Viva without charging anyone",
    "description": "Runs a workspace's saved Viva credentials against Viva for real and returns a per-step verdict: the Smart Checkout OAuth pair, the Merchant pair (the same call the webhook verification handshake makes), creating a payment order on the configured source, and reading that order back.\n\nWHY IT EXISTS: every field on the Viva setup card is silently wrong until a customer pays. A mistyped payment source",
    "fields": {
      "workspace_id": {
        "type": "string",
        "required": true,
        "description": "Workspace whose stored Viva credentials to test. Gated on is_workspace_finance_manager — a mismatch 404s. (string (uuid)"
      }
    }
  },
  {
    "name": "workspace-webhooks-api",
    "tag": "Webhooks",
    "methods": [
      "POST"
    ],
    "summary": "Manage a workspace's outbound webhook endpoints",
    "description": "Tenant-facing CRUD for outbound webhook subscriptions (#330). Actions: list, create, update, rotate_secret, delete, deliveries. The HMAC signing secret is generated server-side and returned exactly once (on create and rotate_secret) - the column is revoked from the authenticated role and cannot be read back. Endpoint URLs are https-only and pass the shared SSRF guard before they are stored. Event ",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "list",
          "create",
          "update",
          "rotate_secret",
          "delete",
          "deliveries"
        ]
      },
      "workspace_id": {
        "type": "string"
      },
      "id": {
        "type": "string"
      },
      "url": {
        "type": "string"
      },
      "event_types": {
        "type": "array"
      },
      "description": {
        "type": "string"
      },
      "is_active": {
        "type": "boolean"
      },
      "limit": {
        "type": "number"
      }
    }
  },
  {
    "name": "xml-import-orchestrator",
    "tag": "Data Import",
    "methods": [
      "POST"
    ],
    "summary": "Parse and import supplier XML feeds; supports field detection, preview, and full import modes.",
    "description": "Requires Supabase JWT. Accepts base64-encoded XML and routes behavior via preview_only and generate_preview flags: analyze mode returns detected fields with coverage stats (dictionary-first, AI-residual), preview mode applies mappings to a sample product, import mode creates a data_import_job and batch-inserts products for MIVAA processing.",
    "fields": {
      "workspace_id": {
        "type": "string",
        "required": true,
        "description": "Target workspace UUID."
      },
      "xml_content": {
        "type": "string",
        "required": true,
        "description": "Base64-encoded XML."
      },
      "preview_only": {
        "type": "boolean",
        "description": "Set true to run field analysis only."
      },
      "generate_preview": {
        "type": "boolean",
        "description": "Set true to preview mappings on one sample product."
      }
    }
  },
  {
    "name": "zernio-api",
    "tag": "Social",
    "methods": [
      "POST",
      "GET"
    ],
    "summary": "Social media publishing, OAuth account management, and analytics via Zernio.",
    "description": "Action-discriminated API routing POST requests to three handlers: analytics (get_best_time, get_post_analytics, get_account_insights), OAuth (connect, callback, disconnect; GET returns account list), and publish (publish_now, schedule). All actions require supabase JWT auth."
  }
] as const;
