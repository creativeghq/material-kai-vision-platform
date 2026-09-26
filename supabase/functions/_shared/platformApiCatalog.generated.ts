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
    "description": "Universal executor for all background agent types. Accepts service-role or user JWT auth. GET ?catalog=1 returns the registered agent type catalog; POST runs or resumes an agent run.",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "run_agent",
          "get_catalog"
        ],
        "required": true,
        "description": "Which operation to run"
      },
      "agent_id": {
        "type": "string",
        "description": "ID from background_agents table"
      },
      "run_id": {
        "type": "string",
        "description": "Resume or update an existing pending run"
      },
      "input_data": {
        "type": "object",
        "description": "Override or augment agent config input"
      },
      "triggered_by": {
        "type": "string",
        "description": "cron | event | manual | chain | api"
      }
    }
  },
  {
    "name": "bank-statement-import",
    "tag": "Finance",
    "methods": [
      "POST"
    ],
    "summary": "Feed a bank that has no API. Revolut Business syncs itself; every other account had no route into the reconciler at all. The operator maps the statement columns once per account (`bank_statement_mappi",
    "fields": {
      "action": {
        "type": "string",
        "required": true,
        "description": "columns = the file's headers plus five sample rows, so the mapping is built against real names; preview = what WOULD imp"
      },
      "bank_account_id": {
        "type": "string",
        "required": true,
        "description": "A finance_bank_accounts row in a workspace the caller belongs to (string (uuid))"
      },
      "csv": {
        "type": "string",
        "required": true,
        "description": "The statement export as text. 8MB / 20,000 rows max. Delimiter is sniffed (comma, semicolon, tab, pipe); quoted fields, "
      },
      "mapping_id": {
        "type": "string",
        "description": "A saved bank_statement_mappings row for this account (string (uuid))"
      },
      "mapping": {
        "type": "object",
        "description": "An inline mapping while the operator is still building one: date_column, date_format, decimal_mark, and EITHER amount_co"
      }
    }
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
    "description": "Resolves recipients from CRM categories, optionally writes catalog_email_grants for each, then dispatches emails via email-api using the catalog_send.recipient template. Preview mode returns recipient list without sending.",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "preview",
          "send"
        ],
        "required": true,
        "description": "Which operation to run"
      },
      "catalog_id": {
        "type": "string",
        "required": true,
        "description": "Published catalog ID"
      },
      "category_ids": {
        "type": "array",
        "required": true,
        "description": "CRM category IDs to resolve recipients from"
      },
      "subject": {
        "type": "string",
        "description": "Override email subject line"
      },
      "message_body": {
        "type": "string",
        "description": "Optional personal message included in template"
      },
      "ensure_grants": {
        "type": "boolean",
        "description": "Write catalog_email_grants for every recipient before sending"
      }
    }
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
    "description": "Contracts & e-signature. One entity, three contexts (hr | finance | project). verify_jwt is disabled so the PUBLIC token sign path works; management actions call authenticate() plus the module/entitlement gates and then write through a USER-context client, so the context-branched RLS (hr->admin, finance->finance-manager, project->member) is the real enforcement - no service-role body-trust (#250 i",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "resolve_token",
          "sign",
          "create",
          "list",
          "get",
          "update",
          "send",
          "void"
        ],
        "required": true,
        "description": "Which operation to run"
      },
      "token": {
        "type": "string",
        "description": "Signer token from the emailed link"
      },
      "signer_name": {
        "type": "string",
        "description": "Full name typed by the signer"
      },
      "signer_email": {
        "type": "string"
      },
      "signature_image": {
        "type": "string",
        "description": "Data URL of the drawn signature"
      }
    }
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
    "description": "Auth boundary + thin dispatcher over the run_data_integrity_checks / heal_data_integrity_check Postgres RPCs. Cron path (x-cron-secret / service-role via isCronAuthorized) runs the full battery with auto-heal, no body. Admin path (session JWT; admin/super_admin/owner) runs on demand and manages checks/findings.",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "run",
          "heal_check",
          "ignore_finding",
          "reopen_finding",
          "set_autoheal",
          "toggle_check"
        ],
        "required": true,
        "description": "Which operation to run"
      },
      "autoheal": {
        "type": "boolean",
        "description": "Also run heal fns"
      },
      "domains": {
        "type": "array",
        "description": "Limit to these domains"
      },
      "key": {
        "type": "string",
        "description": "Check key"
      },
      "findingId": {
        "type": "string",
        "description": "Finding id"
      },
      "enabled": {
        "type": "boolean",
        "description": "New value"
      }
    }
  },
  {
    "name": "email-api",
    "tag": "Email",
    "methods": [
      "POST",
      "GET"
    ],
    "summary": "Action-discriminated email sending, domain management, logs, and analytics via Resend.",
    "description": "Accepts a JSON body with an `action` field (or path suffix) to select the operation. Requires `RESEND_API_KEY`; returns 503 with `provider_not_configured` when absent. Supports optional React Email templates resolved by slug from `email_templates`.",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "send",
          "sync-campaign-stats",
          "resend-contacts",
          "sync-resend-contacts",
          "set-resend-contact-sync",
          "domains",
          "add-domain",
          "verify-domain",
          "analytics",
          "sync-domains",
          "layout",
          "domain-tracking"
        ],
        "required": true,
        "description": "Which operation to run"
      },
      "to": {
        "type": "array",
        "description": "Recipient address(es)"
      },
      "subject": {
        "type": "string",
        "description": "Email subject (may be overridden by template)"
      },
      "html": {
        "type": "string",
        "description": "HTML body (required if no templateSlug and no text)"
      },
      "text": {
        "type": "string",
        "description": "Plain-text body"
      },
      "templateSlug": {
        "type": "string",
        "description": "Slug of an active email_templates row"
      },
      "variables": {
        "type": "object",
        "description": "Template variable substitutions"
      },
      "from": {
        "type": "string",
        "description": "Sender address (defaults to email_settings.default_from_email)"
      },
      "fromName": {
        "type": "string",
        "description": "Sender display name"
      },
      "cc": {
        "type": "array",
        "description": "CC addresses"
      },
      "bcc": {
        "type": "array",
        "description": "BCC addresses"
      },
      "replyTo": {
        "type": "string",
        "description": "Reply-To address"
      },
      "emailType": {
        "type": "string",
        "description": "Email category tag (one of: 'transactional'|'marketing'|'notification')"
      },
      "attachments": {
        "type": "string",
        "description": "Base64-encoded attachments (no data: prefix) (Array<{filename:string,content:string}>)"
      },
      "campaign_id": {
        "type": "string",
        "description": "Campaign to refresh (string (uuid))"
      },
      "workspace_id": {
        "type": "string",
        "description": "Workspace (string (uuid))"
      },
      "auto_sync": {
        "type": "boolean",
        "description": "Enable automatic syncing"
      },
      "domain": {
        "type": "string",
        "description": "Domain name to add"
      },
      "dateRange": {
        "type": "string",
        "description": "ISO date range (POST body) or fromDate/toDate query params (GET) ({start:string,end:string})"
      },
      "layoutHtml": {
        "type": "string",
        "description": "Layout to preview instead of the stored one. Must contain {{content}}; empty previews the built-in default."
      },
      "sampleHtml": {
        "type": "string",
        "description": "Body to render inside the shell. Defaults to the built-in specimen."
      },
      "set": {
        "type": "object",
        "description": "{open_tracking?:boolean, click_tracking?:boolean} — applied before the values are read back."
      }
    }
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
    "name": "finance-categorize-expenses",
    "tag": "Finance",
    "methods": [
      "POST"
    ],
    "summary": "Proposes an expense category per supplier, and applies the ones you confirm",
    "description": "Received myDATA documents arrive under one category named after the inlet they came through, which tells you nothing about what the money bought. This proposes a category from a closed chart for each SUPPLIER — the durable unit, since a decision about a supplier also files everything that arrives from them afterwards. `suggest` writes nothing and returns proposals with a confidence and a reason; `",
    "fields": {
      "action": {
        "type": "string",
        "description": "'suggest' or 'apply'"
      },
      "workspace_id": {
        "type": "string",
        "description": "Workspace whose documents to categorise"
      },
      "limit": {
        "type": "integer",
        "description": "Suppliers to examine in one suggest call (max 250)"
      },
      "rules": {
        "type": "array",
        "description": "apply only — {issuer_key, scope_doc_type, category_key, decided_by, confidence, rationale}"
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
    "name": "finance-mydata-send",
    "tag": "Finance",
    "methods": [
      "POST"
    ],
    "summary": "Transmits an expense document you recorded here straight to myDATA",
    "description": "Rent, foreign purchases, contracts and your own payroll/depreciation entries are myDATA types 13.x-17.x, which an e-invoicing provider may not carry — AADE limits providers to 1.1-11.5. This files them directly under the workspace ΑΑΔΕ credentials and stores the MARK. `check-rights` probes whether the subscription can file at all without creating anything.",
    "fields": {
      "action": {
        "type": "string",
        "description": "'send' or 'check-rights'"
      },
      "workspace_id": {
        "type": "string",
        "description": "Workspace that owns the document"
      },
      "document_id": {
        "type": "string",
        "description": "The inbound_documents row to transmit (send only)"
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
    "description": "Requires Supabase JWT. Routes on body.action to execute-flow (run a saved flow with trigger data), test-flow (dry-run, no side effects), or trigger-event (auto-dispatch from DB triggers or server-to-server).",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "execute-flow",
          "test-flow",
          "trigger-event"
        ],
        "required": true,
        "description": "Which operation to run"
      },
      "flow_id": {
        "type": "string",
        "description": "UUID of the flow to execute."
      },
      "trigger_data": {
        "type": "object",
        "description": "Arbitrary payload passed as trigger context into the graph."
      },
      "event_type": {
        "type": "string",
        "description": "TriggerType enum value (e.g. 'new_product', 'price_alert')."
      },
      "event_data": {
        "type": "object",
        "description": "Event payload merged into trigger context."
      }
    }
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
    "description": "Action-based HR backbone (#252). Session JWT; authenticate() yields a service-role client, so every action re-derives the workspace from body.workspace_id and calls userCanAccessWorkspace, plus isModuleEnabled('hr') and per-workspace assertEntitled('hr') (402 upsell). RBAC: reads need hr.view, writes/approvals need hr.manage (owner/admin/global-admin only); self-* actions are open to a linked empl",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "list-accounting-docs",
          "upload-accounting-doc",
          "sign-accounting-doc",
          "delete-accounting-doc",
          "analyze-accounting-doc",
          "prepare-accounting-period",
          "ergani-submission-types",
          "ergani-document-schema",
          "ergani-employer-info",
          "ergani-submit-leave",
          "ergani-submit-hire",
          "ergani-submit-separation",
          "ergani-submit-overtime",
          "ergani-submit-schedule",
          "ergani-submit",
          "ergani-download-pdf",
          "ergani-retry",
          "ergani-submissions-log",
          "list-departments",
          "create-department",
          "update-department",
          "delete-department",
          "list-job-postings",
          "create-job-posting",
          "update-job-posting",
          "delete-job-posting",
          "generate-job-description",
          "list-applications",
          "create-application",
          "update-application",
          "upload-application-cv",
          "application-cv-url",
          "screen-application",
          "hire-application",
          "list-onboarding",
          "add-onboarding-task",
          "toggle-onboarding-task",
          "delete-onboarding-task",
          "list-documents",
          "upload-document",
          "sign-document",
          "delete-document",
          "list-payroll-runs",
          "create-payroll-run",
          "get-payroll-run",
          "update-payroll-item",
          "generate-payslips",
          "get-payroll-settings",
          "update-payroll-settings",
          "set-payroll-status",
          "post-payroll-to-finance",
          "invite-employee",
          "clock-employee",
          "set-employee-pin",
          "attendance-today",
          "list-notify-candidates",
          "get-hr-settings",
          "save-hr-settings",
          "list-punches",
          "add-manual-punch",
          "update-punch",
          "delete-punch",
          "timesheet",
          "self-profile",
          "self-onboarding",
          "self-toggle-onboarding",
          "self-timeoff",
          "self-request-timeoff",
          "self-documents",
          "self-clock",
          "self-punches",
          "self-sign-document",
          "list-employees",
          "create-employee",
          "update-employee",
          "list-absences",
          "record-absence",
          "approve-absence",
          "reject-absence",
          "list-separations",
          "create-separation",
          "update-separation",
          "delete-separation",
          "list-overtime",
          "create-overtime",
          "update-overtime",
          "delete-overtime",
          "list-schedules",
          "create-schedule",
          "update-schedule",
          "delete-schedule",
          "ergani-cancel"
        ],
        "required": true,
        "description": "Which operation to run"
      },
      "period": {
        "type": "string",
        "description": "YYYY-MM"
      },
      "name": {
        "type": "string",
        "description": "Document name"
      },
      "content_base64": {
        "type": "string",
        "description": "Base64 bytes (max 20MB)"
      },
      "payroll_run_id": {
        "type": "string",
        "description": "Linked run"
      },
      "content_type": {
        "type": "string",
        "description": "MIME type"
      },
      "document_id": {
        "type": "string",
        "description": "Document"
      },
      "code": {
        "type": "string",
        "description": "Ergani submission code"
      },
      "absence_id": {
        "type": "string",
        "description": "Absence to declare"
      },
      "ergani_leave_code": {
        "type": "string",
        "description": "Ergani leave type code"
      },
      "document": {
        "type": "object",
        "description": "Fully-built override payload"
      },
      "employee_id": {
        "type": "string",
        "description": "Employee to declare"
      },
      "comments": {
        "type": "string",
        "description": "Free-text comments on the declaration"
      },
      "preview": {
        "type": "boolean",
        "description": "Return the built document + unfilled keys without submitting"
      },
      "separation_id": {
        "type": "string",
        "description": "hr_separations row to file"
      },
      "overtime_ids": {
        "type": "array",
        "description": "hr_overtime ids to file (max 100); or pass overtime_id for one"
      },
      "schedule_id": {
        "type": "string",
        "description": "hr_work_schedules row to file"
      },
      "kind": {
        "type": "string",
        "description": "schedule_weekly | schedule_daily | change (defaults from schedule_type)"
      },
      "protocol": {
        "type": "string",
        "description": "Protocol number"
      },
      "submitted_date": {
        "type": "string",
        "description": "yyyymmdd"
      },
      "submission_id": {
        "type": "string",
        "description": "Failed hr_ergani_submissions row"
      },
      "submission_type": {
        "type": "string",
        "description": "Filter by code"
      },
      "limit": {
        "type": "number",
        "description": "Max rows (<=500)"
      },
      "description": {
        "type": "string",
        "description": "Description"
      },
      "head_contact_id": {
        "type": "string",
        "description": "Department head contact"
      },
      "department_id": {
        "type": "string",
        "description": "Department to update"
      },
      "title": {
        "type": "string",
        "description": "Job title"
      },
      "employment_type": {
        "type": "string",
        "description": "full_time | part_time | contractor"
      },
      "status": {
        "type": "string",
        "description": "draft | open | closed"
      },
      "job_posting_id": {
        "type": "string",
        "description": "Posting to update"
      },
      "seniority": {
        "type": "string",
        "description": "Seniority hint"
      },
      "department": {
        "type": "string",
        "description": "Department hint"
      },
      "keywords": {
        "type": "string",
        "description": "Must-haves"
      },
      "stage": {
        "type": "string",
        "description": "Filter by stage"
      },
      "candidate_id": {
        "type": "string",
        "description": "Existing candidate"
      },
      "candidate": {
        "type": "object",
        "description": "New candidate (name required)"
      },
      "notes": {
        "type": "string",
        "description": "Notes"
      },
      "application_id": {
        "type": "string",
        "description": "Application to update"
      },
      "rating": {
        "type": "number",
        "description": "Rating"
      },
      "filename": {
        "type": "string",
        "description": "File name"
      },
      "start_date": {
        "type": "string",
        "description": "Start date"
      },
      "pending_only": {
        "type": "boolean",
        "description": "Only pending tasks"
      },
      "task_id": {
        "type": "string",
        "description": "Task"
      },
      "doc_type": {
        "type": "string",
        "description": "contract|id|certificate|payslip|review|other"
      },
      "currency": {
        "type": "string",
        "description": "Run currency (default EUR)"
      },
      "run_id": {
        "type": "string",
        "description": "Run"
      },
      "item_id": {
        "type": "string",
        "description": "Payroll item"
      },
      "gross": {
        "type": "number",
        "description": "New gross"
      },
      "note": {
        "type": "string",
        "description": "Note"
      },
      "country_code": {
        "type": "string",
        "description": "e.g. GR"
      },
      "income_tax_brackets": {
        "type": "object",
        "description": "Bracket array"
      },
      "email": {
        "type": "string",
        "description": "Invite email"
      },
      "punch_type": {
        "type": "string",
        "description": "arrival | departure"
      },
      "pin": {
        "type": "string",
        "description": "4-8 digit PIN; empty clears"
      },
      "timezone": {
        "type": "string",
        "description": "IANA tz"
      },
      "kiosk_enabled": {
        "type": "boolean",
        "description": "Enable clock-in kiosk"
      },
      "late_grace_minutes": {
        "type": "number",
        "description": "Late grace window"
      },
      "from": {
        "type": "string",
        "description": "reference_date >="
      },
      "to": {
        "type": "string",
        "description": "reference_date <="
      },
      "at": {
        "type": "string",
        "description": "Timestamp (defaults now)"
      },
      "punch_id": {
        "type": "string",
        "description": "Punch"
      },
      "punched_at": {
        "type": "string",
        "description": "New timestamp"
      },
      "is_late": {
        "type": "boolean",
        "description": "Late flag"
      },
      "end_date": {
        "type": "string",
        "description": "YYYY-MM-DD"
      },
      "absence_type": {
        "type": "string",
        "description": "vacation|sick|unpaid|other"
      },
      "days": {
        "type": "number",
        "description": "Lookback days (1-90, default 14)"
      },
      "crm_contact_id": {
        "type": "string",
        "description": "Existing in-workspace contact to attach"
      },
      "contact": {
        "type": "object",
        "description": "New contact fields (name required) when no crm_contact_id"
      },
      "manager_contact_id": {
        "type": "string",
        "description": "Manager (must be in workspace)"
      },
      "ergani_e3": {
        "type": "object",
        "description": "Exact Ergani template-key to value map for codes we cannot derive (specialty, contract type); prefills later filings"
      },
      "working_days": {
        "type": "number",
        "description": "Override computed working days"
      },
      "separation_type": {
        "type": "string",
        "description": "voluntary | termination | expiry"
      },
      "effective_date": {
        "type": "string",
        "description": "YYYY-MM-DD"
      },
      "notice_date": {
        "type": "string",
        "description": "YYYY-MM-DD"
      },
      "reason": {
        "type": "string",
        "description": "Reason shown on the declaration"
      },
      "severance_amount": {
        "type": "number",
        "description": "Severance / compensation"
      },
      "id": {
        "type": "string",
        "description": "Separation id"
      },
      "work_date": {
        "type": "string",
        "description": "YYYY-MM-DD"
      },
      "start_time": {
        "type": "string",
        "description": "HH:MM"
      },
      "end_time": {
        "type": "string",
        "description": "HH:MM"
      },
      "schedule_type": {
        "type": "string",
        "description": "weekly | daily"
      },
      "effective_from": {
        "type": "string",
        "description": "YYYY-MM-DD"
      },
      "details": {
        "type": "array",
        "description": "Shift rows (max 62)"
      },
      "effective_to": {
        "type": "string",
        "description": "YYYY-MM-DD"
      }
    }
  },
  {
    "name": "inbox-api",
    "tag": "Messaging",
    "methods": [
      "POST"
    ],
    "summary": "Multi-tenant unified inbox: threads, participants, messages, agent takeover",
    "description": "Action-based handler for the multi-tenant Inbox (#209). Three auth surfaces: JWT actions (authenticated member/operator/customer-account flows), token actions (token_*, service-role + scoped customer share token), and internal_agent_reply (service-role, called by the agent runtime). Threads are workspace-scoped with directional ACLs (internal/customer/upstream); the AI agent can auto-respond and b",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "create_thread",
          "add_participant",
          "remove_participant",
          "react_message",
          "send_message",
          "mark_read",
          "comment_private_reply",
          "set_comment_hidden",
          "create_contact_from_thread",
          "link_company_to_thread",
          "promote_thread",
          "set_status",
          "set_agent",
          "get_agent_settings",
          "set_agent_settings",
          "list_threads",
          "get_thread",
          "create_marketplace_inquiry",
          "accept_marketplace_inquiry",
          "analyze_sentiment",
          "get_thread_context",
          "list_labels",
          "create_label",
          "update_label",
          "delete_label",
          "set_thread_labels",
          "create_customer_thread",
          "create_share_link",
          "suggest_reply",
          "get_my_email_address",
          "set_email_address_settings",
          "get_thread_intake",
          "update_intake",
          "update_intake_items",
          "search_intake_products",
          "search_catalog",
          "approve_intake",
          "reject_intake",
          "archive_thread",
          "restore_thread",
          "token_get_thread",
          "token_request_code",
          "token_verify_code",
          "token_send_message",
          "token_claim",
          "internal_agent_reply",
          "profile_contact",
          "link_preview",
          "enrich_attachments",
          "ask_spreadsheet",
          "pin_message",
          "star_message",
          "forward_message",
          "delete_message",
          "set_follow_up",
          "clear_follow_up",
          "internal_send_follow_up",
          "internal_draft_reply"
        ],
        "required": true,
        "description": "Which operation to run"
      },
      "workspace_id": {
        "type": "string",
        "description": "Owning workspace (string (uuid))"
      },
      "thread_type": {
        "type": "string",
        "description": "Defaults to 'internal' (one of: string ('internal'|'customer'|'upstream'))"
      },
      "channel": {
        "type": "string",
        "description": "Defaults to 'internal'"
      },
      "subject": {
        "type": "string",
        "description": "Thread subject"
      },
      "participants": {
        "type": "array",
        "description": "Initial participants to add"
      },
      "metadata": {
        "type": "object"
      },
      "thread_id": {
        "type": "string",
        "description": "string (uuid)"
      },
      "user_id": {
        "type": "string",
        "description": "string (uuid)"
      },
      "contact_id": {
        "type": "string",
        "description": "string (uuid)"
      },
      "thread_role": {
        "type": "string"
      },
      "participant_id": {
        "type": "string",
        "description": "string (uuid)"
      },
      "message_id": {
        "type": "string",
        "description": "Message to react to (string (uuid))"
      },
      "emoji": {
        "type": "string",
        "description": "Reaction emoji"
      },
      "body": {
        "type": "string",
        "description": "Message text"
      },
      "message_type": {
        "type": "string"
      },
      "attachments": {
        "type": "array"
      },
      "cards": {
        "type": "array",
        "description": "Catalog cards to send: [{kind: product|service, product_id}]. Members only, customer-facing only, ids only — name, image"
      },
      "client_token": {
        "type": "string",
        "description": "Minted by the composer once per send and kept across a failure. A retry carrying the token of a message that was stored "
      },
      "hidden": {
        "type": "boolean",
        "description": "Hide when true"
      },
      "name": {
        "type": "string",
        "description": "Override the derived name"
      },
      "email": {
        "type": "string",
        "description": "Override the derived email"
      },
      "company": {
        "type": "string",
        "description": "Company name"
      },
      "company_id": {
        "type": "string",
        "description": "An existing crm_companies row in the thread's workspace (string (uuid))"
      },
      "deal_type": {
        "type": "string",
        "description": "A `crm_deal_types.key` (default `general`). Stages are per type; the starting stage is chosen server-side."
      },
      "title": {
        "type": "string",
        "description": "Deal title. Defaults to “Enquiry from <thread subject>”."
      },
      "value": {
        "type": "number",
        "description": "Deal value. Omit when it is not known yet — null, never 0."
      },
      "currency": {
        "type": "string",
        "description": "ISO code, default EUR"
      },
      "contact_name": {
        "type": "string",
        "description": "Name for a contact that has to be created. Ignored when one is already linked."
      },
      "status": {
        "type": "string"
      },
      "agent_id": {
        "type": "string"
      },
      "auto_respond": {
        "type": "boolean"
      },
      "allow_account_data": {
        "type": "boolean"
      },
      "peek": {
        "type": "boolean",
        "description": "Members only. A pure read for the assistant: no last_read_at stamp, no read receipt to the customer, the newest 40 messa"
      },
      "listing_id": {
        "type": "string",
        "description": "string (uuid)"
      },
      "buyer_workspace_id": {
        "type": "string",
        "description": "string (uuid)"
      },
      "qty_wanted": {
        "type": "number"
      },
      "message": {
        "type": "string"
      },
      "demand_type": {
        "type": "string",
        "description": "Carries the sourcing demand so an accepted inquiry can materialize an allocation (one of: string ('order_item'|'quote_it"
      },
      "demand_id": {
        "type": "string",
        "description": "FK of the order_item / quote_item that needs sourcing (string (uuid))"
      },
      "inquiry_id": {
        "type": "string",
        "description": "string (uuid)"
      },
      "accepted_qty": {
        "type": "number"
      },
      "unit_price": {
        "type": "number"
      },
      "force": {
        "type": "boolean",
        "description": "Re-analyse even when a recent verdict exists"
      },
      "color": {
        "type": "string",
        "description": "Label colour token"
      },
      "label_id": {
        "type": "string",
        "description": "Label to update (string (uuid))"
      },
      "label_ids": {
        "type": "array",
        "description": "Complete replacement set"
      },
      "instruction": {
        "type": "string",
        "description": "What the reply should do (e.g. offer a product, state a delivery date). Max 1000 chars; passed to the assistant outside "
      },
      "local_part": {
        "type": "string",
        "description": "Requested local part"
      },
      "auto_reply_enabled": {
        "type": "boolean",
        "description": "Agent answers inbound mail"
      },
      "is_active": {
        "type": "boolean",
        "description": "Address accepts mail"
      },
      "agent_ref": {
        "type": "string",
        "description": "Agent id that answers"
      },
      "customer_contact_id": {
        "type": "string",
        "description": "CRM contact (string (uuid))"
      },
      "customer_company_id": {
        "type": "string",
        "description": "CRM company (string (uuid))"
      },
      "notes": {
        "type": "string",
        "description": "Free-text notes"
      },
      "requested_delivery_date": {
        "type": "string",
        "description": "YYYY-MM-DD"
      },
      "items": {
        "type": "array",
        "description": "Complete replacement set of intake lines"
      },
      "query": {
        "type": "string",
        "description": "Search text"
      },
      "kind": {
        "type": "string",
        "description": "product (default) or service"
      },
      "reason": {
        "type": "string",
        "description": "Why it was rejected"
      },
      "token": {
        "type": "string"
      },
      "code": {
        "type": "string"
      },
      "sender_proof": {
        "type": "string"
      },
      "agent_state": {
        "type": "object"
      },
      "to_user_id": {
        "type": "string",
        "description": "Profile owner being contacted (string (uuid))"
      },
      "from_name": {
        "type": "string",
        "description": "Sender name"
      },
      "from_email": {
        "type": "string",
        "description": "Sender email — the reply address"
      },
      "services_requested": {
        "type": "array",
        "description": "Services ticked on the form"
      },
      "turnstile_token": {
        "type": "string",
        "description": "Cloudflare Turnstile token"
      },
      "url": {
        "type": "string",
        "description": "Max 2048 characters. https only; redirects are followed but every hop is re-validated (string (https url))"
      },
      "question": {
        "type": "string"
      },
      "attachment_index": {
        "type": "integer",
        "description": "Which attachment on that message (0-based). Default: the first spreadsheet"
      },
      "pinned": {
        "type": "boolean",
        "description": "Defaults to true. Members only"
      },
      "starred": {
        "type": "boolean",
        "description": "Defaults to true"
      },
      "to_thread_id": {
        "type": "string",
        "description": "Where it goes. Subject to the WhatsApp 24h service window like any send (string (uuid))"
      },
      "at": {
        "type": "string",
        "description": "When it fires. Prefer this over `days` from a browser — the client knows the operator’s timezone and can offset a calend"
      },
      "days": {
        "type": "string",
        "description": "Alternative to `at`, resolved server-side as now + N × 24h (integer (1–365))"
      },
      "note": {
        "type": "string",
        "description": "What to chase, shown on the reminder (string (≤500))"
      },
      "sender_user_id": {
        "type": "string",
        "description": "Must still be a member of the thread’s workspace, or 403 (string (uuid))"
      }
    }
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
    "description": "Action-discriminated API for WhatsApp via Zernio (Meta Cloud API). Requires `ZERNIO_API_KEY`; returns 503 with `provider_not_configured` when absent. Channels are `messaging_channels` rows linked to Zernio WhatsApp accounts. Cold/marketing sends require a Meta-approved template; freeform content is only valid inside the 24h customer-care window.",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "open-whatsapp-thread",
          "send",
          "send-bulk",
          "connect-whatsapp",
          "connect-whatsapp-oauth",
          "connect-whatsapp-callback",
          "reconcile-phone-numbers",
          "set-channel-read-receipts",
          "retry-failed-charges",
          "bill-channels-monthly",
          "set-channel-seats",
          "set-whatsapp-rate",
          "reconcile-whatsapp-costs",
          "search-phone-numbers",
          "list-phone-numbers",
          "purchase-phone-number",
          "release-phone-number",
          "plan-status",
          "repair-attachments",
          "zernio-probe",
          "generate-avatar-cast",
          "sync-avatars",
          "backfill-inbox",
          "channel-health",
          "inbox-analytics",
          "webhook-status",
          "register-webhook",
          "create-whatsapp-template",
          "sync-channels",
          "whatsapp-templates",
          "channels",
          "templates",
          "logs",
          "analytics",
          "account-info",
          "get-settings",
          "update-settings"
        ],
        "required": true,
        "description": "Which operation to run"
      },
      "phone": {
        "type": "string",
        "description": "Phone number in international format"
      },
      "workspaceId": {
        "type": "string",
        "description": "Required when you belong to more than one workspace"
      },
      "name": {
        "type": "string",
        "description": "Display name for a newly created thread"
      },
      "to": {
        "type": "array",
        "description": "Recipient phone number(s) in E.164 or local format"
      },
      "content": {
        "type": "string",
        "description": "Freeform message body (24h window only)"
      },
      "templateId": {
        "type": "string",
        "description": "messaging_templates.id for an approved template"
      },
      "templateVariables": {
        "type": "object",
        "description": "Variable substitutions for the template"
      },
      "from": {
        "type": "string",
        "description": "Channel sender_id; defaults to default active WhatsApp channel"
      },
      "messageType": {
        "type": "string",
        "description": "transactional | marketing | otp | notification"
      },
      "recipients": {
        "type": "string",
        "description": "List of recipients with optional per-recipient template variables (Array<{to:string,variables?:object}>)"
      },
      "accessToken": {
        "type": "string",
        "description": "Meta Business Suite access token"
      },
      "wabaId": {
        "type": "string",
        "description": "WhatsApp Business Account ID"
      },
      "phoneNumberId": {
        "type": "string",
        "description": "Meta phone number ID"
      },
      "displayName": {
        "type": "string",
        "description": "Display name for the channel"
      },
      "redirectUrl": {
        "type": "string",
        "description": "Where Meta returns the browser"
      },
      "onboarding": {
        "type": "boolean",
        "description": "Signup-flow variant"
      },
      "zernioAccountId": {
        "type": "string",
        "description": "Account id from the ?accountId= callback param"
      },
      "channelId": {
        "type": "string",
        "description": "messaging_channels.id — verified against the caller's workspace"
      },
      "enabled": {
        "type": "boolean",
        "description": "Defaults to true"
      },
      "seats": {
        "type": "integer",
        "description": "0–500"
      },
      "country": {
        "type": "string",
        "description": "ISO country code"
      },
      "category": {
        "type": "string",
        "description": "Meta template category"
      },
      "cost_per_message_usd": {
        "type": "number",
        "description": "Rate from the invoice"
      },
      "source_note": {
        "type": "string",
        "description": "Where the figure came from"
      },
      "days": {
        "type": "integer",
        "description": "Look-back window"
      },
      "numberType": {
        "type": "string",
        "description": "local | mobile | toll_free"
      },
      "prefix": {
        "type": "string",
        "description": "Dialling prefix"
      },
      "locality": {
        "type": "string",
        "description": "City / region"
      },
      "contains": {
        "type": "string",
        "description": "Digits the number must contain"
      },
      "sms": {
        "type": "boolean",
        "description": "Require SMS capability"
      },
      "limit": {
        "type": "integer",
        "description": "Max results"
      },
      "status": {
        "type": "string",
        "description": "Filter by lifecycle status"
      },
      "areaCode": {
        "type": "string",
        "description": "Area code"
      },
      "wantsSms": {
        "type": "boolean",
        "description": "Require SMS capability"
      },
      "purchaseIntentId": {
        "type": "string",
        "description": "Idempotency key"
      },
      "threadId": {
        "type": "string",
        "description": "Limit to one thread"
      },
      "messageId": {
        "type": "string",
        "description": "Limit to one message"
      },
      "path": {
        "type": "string",
        "description": "Zernio API path to probe"
      },
      "keys_only": {
        "type": "boolean",
        "description": "Return key names only, no values"
      },
      "count": {
        "type": "integer",
        "description": "How many to render"
      },
      "startIndex": {
        "type": "integer",
        "description": "Offset into the cast"
      },
      "prompt": {
        "type": "string",
        "description": "Override the render prompt"
      },
      "variations": {
        "type": "integer",
        "description": "Variations per slot"
      },
      "force": {
        "type": "boolean",
        "description": "Re-assign even where one exists"
      },
      "debug": {
        "type": "boolean",
        "description": "Verbose per-thread reporting"
      },
      "conversationId": {
        "type": "string",
        "description": "Only this Zernio conversation"
      },
      "fromDate": {
        "type": "string",
        "description": "YYYY-MM-DD"
      },
      "toDate": {
        "type": "string",
        "description": "YYYY-MM-DD"
      },
      "language": {
        "type": "string",
        "description": "BCP-47 language tag"
      },
      "components": {
        "type": "array",
        "description": "Meta template components"
      },
      "libraryTemplateName": {
        "type": "string",
        "description": "Pre-approved library template to instantiate"
      },
      "offset": {
        "type": "number",
        "description": "Pagination offset"
      },
      "startDate": {
        "type": "string",
        "description": "ISO start date (default 30 days ago)"
      },
      "endDate": {
        "type": "string",
        "description": "ISO end date (default now)"
      },
      "settings": {
        "type": "object",
        "description": "Settings fields to upsert"
      }
    }
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
    "description": "Action-discriminated handler for two notification channels. `send-push`: sends Web Push notifications to browser subscriptions using VAPID keys (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`). `send-webhook`: delivers a JSON payload to configured webhook endpoints with optional HMAC-SHA256 signing, up to 3 retries with configurable delay, and updates `webhook_endpoints` success/failure timestamps. `get-v",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "send-push",
          "send-webhook",
          "get-vapid-key"
        ],
        "required": true,
        "description": "Which operation to run"
      },
      "subscriptions": {
        "type": "string",
        "description": "Web Push subscription objects (Array<{endpoint:string,p256dh_key:string,auth_key:string}>)"
      },
      "notification": {
        "type": "string",
        "description": "Notification payload ({title:string,body:string,data?,icon?,badge?})"
      },
      "webhooks": {
        "type": "string",
        "description": "Webhook endpoint definitions from webhook_endpoints table (Array<{id,url,secret?,headers,retry_config}>)"
      },
      "payload": {
        "type": "object",
        "description": "JSON payload to POST to each webhook"
      }
    }
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
    "description": "Pinterest pin IMPORT only. The OAuth half (get_auth_url / callback / get_boards / get_board_pins / disconnect) was removed — board browsing needed a connected account and nothing used it. Extract a pin's image + metadata by URL, then import one or many into the catalogue.",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "extract_pin",
          "import_pin",
          "import_pins_bulk"
        ],
        "required": true,
        "description": "Which operation to run"
      },
      "pin_url": {
        "type": "string",
        "description": "Full Pinterest pin URL"
      },
      "moodboard_id": {
        "type": "string",
        "description": "Target moodboard ID"
      },
      "find_matching_products": {
        "type": "boolean",
        "description": "Run MIVAA visual search to suggest matching products"
      },
      "pin_urls": {
        "type": "array",
        "description": "List of Pinterest pin URLs"
      }
    }
  },
  {
    "name": "platform-secrets-admin",
    "tag": "Admin",
    "methods": [
      "POST"
    ],
    "summary": "CRUD for the platform_secrets key store (admin/super_admin only)",
    "description": "Action-discriminated endpoint for listing, saving, and deleting platform secret values. Sensitive values are masked in list responses. Saves invalidate the in-worker secret cache. ENV values always take precedence over DB values; editing here only affects the DB fallback.",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "list",
          "list_platform",
          "list_for_module",
          "save",
          "save_many",
          "delete_value"
        ],
        "required": true,
        "description": "Which operation to run"
      },
      "module_slug": {
        "type": "string",
        "description": "Module slug to filter by"
      },
      "key": {
        "type": "string",
        "description": "Secret key name"
      },
      "value": {
        "type": "string",
        "description": "New value; null or '' clears it (one of: string|null)"
      },
      "entries": {
        "type": "string",
        "description": "Key-value pairs to upsert (one of: Array<{ key: string, value: string|null }>)"
      }
    }
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
    "summary": "Revolut Business — live accounts & balances, connection, reconciliation, payments, cards",
    "description": "One POST surface; the body's `action` picks the operation. Every call needs `workspace_id`; the caller must be a finance manager of that workspace (404 otherwise, never 403) and the workspace must be entitled to the banking-revolut module (402). Actions that reach Revolut need a completed connection (init → authorize-url → oauth-complete); without one they answer 400 \"Revolut is not set up\". Every",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "accounts",
          "map-account",
          "fx-rate",
          "exchange",
          "init",
          "authorize-url",
          "oauth-complete",
          "register-webhook",
          "sync-now",
          "disconnect",
          "reconcile",
          "confirm-match",
          "confirm-bill-match",
          "plan-candidates",
          "confirm-plan-match",
          "ignore-transaction",
          "validate-account-name",
          "create-counterparty",
          "send-payment",
          "pay-due-bills",
          "create-payout-link",
          "team-members",
          "cards",
          "create-card",
          "freeze-card",
          "unfreeze-card",
          "set-card-limit",
          "create-card-invitation",
          "expenses",
          "expense-receipt",
          "import-expenses",
          "sync-labels"
        ],
        "required": true,
        "description": "Which operation to run"
      },
      "workspace_id": {
        "type": "string",
        "required": true,
        "description": "Target workspace; the caller must be its finance manager (uuid)"
      },
      "revolut_account_id": {
        "type": "string",
        "description": "Revolut account (pocket) id from `accounts`"
      },
      "bank_account_id": {
        "type": "string",
        "description": "Row to link; null or omitted unlinks the pocket (one of: uuid | null)"
      },
      "from": {
        "type": "string",
        "description": "ISO currency, e.g. EUR"
      },
      "to": {
        "type": "string",
        "description": "ISO currency"
      },
      "amount": {
        "type": "number",
        "description": "Default 1"
      },
      "from_account_id": {
        "type": "string",
        "description": "Revolut pocket the money leaves"
      },
      "to_account_id": {
        "type": "string",
        "description": "Revolut pocket it arrives in"
      },
      "from_currency": {
        "type": "string"
      },
      "to_currency": {
        "type": "string"
      },
      "redirect_uri": {
        "type": "string",
        "description": "https OAuth redirect URI registered in Revolut; its domain becomes the JWT-assertion issuer"
      },
      "force": {
        "type": "boolean",
        "description": "Regenerate over an existing keypair — invalidates the current connection"
      },
      "code": {
        "type": "string",
        "description": "Authorisation code from the consent redirect"
      },
      "transaction_row_id": {
        "type": "string",
        "description": "revolut_bank_transactions.id (uuid)"
      },
      "invoice_id": {
        "type": "string",
        "description": "uuid"
      },
      "bill_id": {
        "type": "string",
        "description": "supplier_bills.id (uuid)"
      },
      "plan_id": {
        "type": "string",
        "description": "planned_payments.id (uuid)"
      },
      "ignore": {
        "type": "boolean",
        "description": "Default true"
      },
      "name": {
        "type": "string",
        "description": "Holder name"
      },
      "iban": {
        "type": "string",
        "description": "IBAN (or account_no + sort_code)"
      },
      "account_no": {
        "type": "string"
      },
      "sort_code": {
        "type": "string"
      },
      "company": {
        "type": "boolean",
        "description": "Default true; false checks a person (name split into first/last)"
      },
      "crm_bank_account_id": {
        "type": "string",
        "description": "crm_bank_accounts row to stamp vop_result on (uuid)"
      },
      "source_revolut_account_id": {
        "type": "string",
        "description": "Pocket the money leaves"
      },
      "currency": {
        "type": "string",
        "description": "Default EUR"
      },
      "reference": {
        "type": "string",
        "description": "On the statement; max 140 chars"
      },
      "mode": {
        "type": "string",
        "description": "Default draft (one of: 'draft' | 'payment')"
      },
      "supplier_bill_id": {
        "type": "string",
        "description": "The bill this pays (uuid)"
      },
      "request_id": {
        "type": "string",
        "description": "Idempotency key — a retry with the same key returns the first result (duplicate: true) (uuid)"
      },
      "bill_ids": {
        "type": "array",
        "description": "Specific bills; default = every bill due today or earlier"
      },
      "counterparty_name": {
        "type": "string"
      },
      "holder_id": {
        "type": "string",
        "description": "Revolut team-member id"
      },
      "label": {
        "type": "string",
        "description": "Max 30 chars"
      },
      "card_id": {
        "type": "string"
      },
      "period": {
        "type": "string",
        "description": "Default month (one of: 'week' | 'month')"
      },
      "email": {
        "type": "string"
      },
      "expense_id": {
        "type": "string"
      },
      "receipt_id": {
        "type": "string"
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
    "description": "Three actions gated by the `action` field. `submit` (any authenticated business user): validates entity_type='business', re-validates VAT via VIES, inserts `role_upgrade_requests`, fans out bell notifications and emails to all admins. `approve` and `reject` (admin only): flip request status, promote or leave user role, and email the applicant. Emits Flows events for each transition.",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "submit",
          "approve",
          "reject"
        ],
        "required": true,
        "description": "Which operation to run"
      },
      "requested_role": {
        "type": "string",
        "description": "Target role being applied for (one of: 'dealer'|'factory')"
      },
      "justification": {
        "type": "string",
        "description": "Optional freeform justification text"
      },
      "request_id": {
        "type": "string",
        "description": "role_upgrade_requests.id"
      },
      "admin_note": {
        "type": "string",
        "description": "Optional admin note sent to the applicant"
      }
    }
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
    "description": "Weekly sweep over seo_article_freshness (the derived content-decay view). Emits a seo.article_refresh_due flow event per overdue article and stamps refresh_notified_at so one nudge lands per refresh cycle rather than per cron tick. Due-ness is derived in SQL by seo_article_refresh_due_at(); this function never re-adds an interval to a date. verify_jwt is disabled at the gateway and the only action",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "cron-sweep"
        ],
        "required": true,
        "description": "Which operation to run"
      }
    }
  },
  {
    "name": "seo-domain-tracker",
    "tag": "SEO",
    "methods": [
      "POST"
    ],
    "summary": "Weekly Rankings + Backlinks snapshots for a connected website",
    "description": "Snapshots DataForSEO domain rank overview (ranking keywords, organic traffic, position buckets, up/down/new/lost) + backlinks summary (backlinks, referring domains, spam score) + top ranked keywords for the site's MARKET (resolved from its GSC top country, else TLD, else US) into seo_domain_snapshots + seo_domain_keywords. verify_jwt disabled so the weekly cron-run (x-cron-secret) works; the run a",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "run",
          "cron-run"
        ],
        "required": true,
        "description": "Which operation to run"
      },
      "website_id": {
        "type": "string"
      }
    }
  },
  {
    "name": "seo-rank-tracker",
    "tag": "SEO",
    "methods": [
      "POST"
    ],
    "summary": "Daily positions for the keywords a workspace chose to track",
    "description": "Checks each active row in seo_tracked_keywords against the live Google SERP and writes one seo_keyword_positions row per keyword per day. Distinct from seo-domain-tracker, which DISCOVERS what a domain happens to rank for and replaces that set weekly; this follows a fixed, user-picked set as a time series. Outside the top 100 stores position NULL with found=false — never a sentinel rank, which wou",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "run",
          "cron-run"
        ],
        "required": true,
        "description": "Which operation to run"
      },
      "website_id": {
        "type": "string"
      }
    }
  },
  {
    "name": "seo-reports",
    "tag": "SEO",
    "methods": [
      "POST"
    ],
    "summary": "Build a scheduled SEO report and hand it to Flows to deliver",
    "description": "Composes the report from build_website_seo_report, which calls the same derivations the dashboard reads — it computes no figure itself, so a number in the report and the same number on screen cannot drift. Each run is stored as a FROZEN snapshot in seo_report_runs and read back verbatim; re-deriving on open would show today's numbers under an old date. A run that fails to build is still stored, be",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "run",
          "cron-run"
        ],
        "required": true,
        "description": "Which operation to run"
      },
      "report_id": {
        "type": "string"
      }
    }
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
    "name": "store-document-writeback",
    "tag": "Commerce",
    "methods": [
      "POST"
    ],
    "summary": "Hands the issued fiscal document back to the store the order came from.",
    "description": "Writes a stable document link and the document number onto the upstream order: a Shopify metafield under the materialkai namespace, or WooCommerce order meta plus a customer-visible order note. The link points at finance-document-link rather than at storage, so it keeps working after any signature would have expired. The store URL is operator-supplied, so the call goes through the shared SSRF guar",
    "fields": {
      "invoice_id": {
        "type": "string",
        "required": true,
        "description": "The issued invoice to hand back. Its order must have come from a channel."
      }
    }
  },
  {
    "name": "store-orders-sync",
    "tag": "Commerce",
    "methods": [
      "POST"
    ],
    "summary": "Pulls recent orders from a connected store to close the gap a missed webhook leaves.",
    "description": "A webhook that never arrived leaves no trace, and 'no orders today' reads exactly like a quiet market, so this is the only thing that makes a lapsed subscription visible. Pulls the last N days from Shopify (Admin REST) or WooCommerce (wc/v3) and ingests everything through the SAME upsert_inbound_order the webhook uses, so the two cannot disagree about what an order is; anything already held return",
    "fields": {
      "connection_id": {
        "type": "string",
        "required": true,
        "description": "The store_connections id to pull for. Membership is checked against the verified JWT."
      },
      "days": {
        "type": "number",
        "description": "How far back to pull, 1-90. Default 7."
      },
      "discover_only": {
        "type": "boolean",
        "description": "Return the observed attribute keys without ingesting anything."
      }
    }
  },
  {
    "name": "store-skroutz-orders",
    "tag": "Commerce",
    "methods": [
      "POST"
    ],
    "summary": "Works the Skroutz order queue: fetch, accept, reject, set as ready, upload the document.",
    "description": "Skroutz is not a passive feed like a webshop — it pushes an order and starts a clock. An order must be accepted or rejected, and since 30/03/2026 dispatch needs an explicit set_as_ready; an order left open expires, and an expired order is a lost sale. `pull` fetches the open queue and ingests through the same upsert_inbound_order every other channel uses. `upload_document` re-uploads the RENDERED "
  },
  {
    "name": "stripe-api",
    "tag": "Payments",
    "methods": [
      "POST"
    ],
    "summary": "Stripe Checkout and Customer Portal session creator",
    "description": "Action-discriminated endpoint for platform billing. 'checkout' creates a Stripe Checkout session for credit purchases or subscriptions; 'customer_portal' creates a billing portal session for subscription management. Uses the dedicated platform-billing Stripe account when configured.",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "activate-module",
          "deactivate-module",
          "request-module",
          "request-self-hosting",
          "list-stripe-products",
          "verify-catalogue-prices",
          "create-addon-product",
          "checkout",
          "customer_portal"
        ],
        "required": true,
        "description": "Which operation to run"
      },
      "workspace_id": {
        "type": "string",
        "description": "Workspace (string (uuid))"
      },
      "module_slug": {
        "type": "string",
        "description": "Module to activate"
      },
      "successUrl": {
        "type": "string",
        "description": "Defaults to /profile?tab=modules&activated=<slug>"
      },
      "cancelUrl": {
        "type": "string",
        "description": "Defaults to /profile?tab=modules"
      },
      "contact_email": {
        "type": "string",
        "description": "Defaults to the caller’s account email"
      },
      "contact_name": {
        "type": "string",
        "description": "Contact name"
      },
      "company": {
        "type": "string",
        "description": "Company"
      },
      "team_size": {
        "type": "string",
        "description": "Rough team size"
      },
      "message": {
        "type": "string",
        "description": "Free text (max 4000 chars)"
      },
      "amount_cents": {
        "type": "integer",
        "description": "Price in minor units"
      },
      "currency": {
        "type": "string",
        "description": "Defaults to 'eur'"
      },
      "interval": {
        "type": "string",
        "description": "'month' (default) | 'year'"
      },
      "type": {
        "type": "string",
        "description": "Checkout type. (one of: string ('credit_purchase'|'subscription'))"
      },
      "price": {
        "type": "number",
        "description": "EUR amount for credit_purchase; server derives credit quantity (1 EUR = 100 credits)."
      },
      "priceId": {
        "type": "string",
        "description": "Stripe price ID for subscription type."
      },
      "returnUrl": {
        "type": "string",
        "description": "URL to return to after portal session."
      }
    }
  },
  {
    "name": "stripe-connect",
    "tag": "Payments",
    "methods": [
      "POST"
    ],
    "summary": "Stripe Connect onboarding and status for per-workspace payouts",
    "description": "Manages Stripe Express accounts for per-workspace destination charges. 'onboard' gets or creates an Express account and returns an onboarding link; 'status' refreshes charges_enabled and details_submitted flags. Caller must be workspace owner or admin.",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "onboard",
          "status"
        ],
        "required": true,
        "description": "Which operation to run"
      },
      "workspace_id": {
        "type": "string",
        "required": true,
        "description": "Workspace to onboard. (string (uuid))"
      },
      "return_url": {
        "type": "string",
        "description": "URL to redirect after onboarding; defaults to /admin/finance."
      }
    }
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
    "description": "Loads a CSV/TSV export of the TARIC goods nomenclature into public.taric_codes, which backs the commodity-code picker, code validation and the classifier shortlist. Column headers are matched against an alias table so the EU export, the Greek national export and an admin re-export all load unconfigured. Admin JWT for the import; the monthly refresh cron authenticates with x-cron-secret and fetches",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "import",
          "stats"
        ],
        "required": true,
        "description": "Which operation to run"
      }
    }
  },
  {
    "name": "tender-bid-portal",
    "tag": "Projects",
    "methods": [
      "POST"
    ],
    "summary": "Issue a trade package to a subcontractor and take their priced return",
    "description": "Makes a tender sendable. `send` (authenticated) mints a private link for one bid, emails it to the subcontractor's CRM address and returns the link either way, since a company with no email on file is ordinary. `resolve_token` and `submit` are PUBLIC and token-authenticated: the subcontractor never needs an account. THE TOKEN IS PER BID, which is the security model — it resolves to one subcontract",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "resolve_token",
          "submit",
          "send"
        ],
        "required": true,
        "description": "Which operation to run"
      },
      "token": {
        "type": "string",
        "description": "The per-bid access token from the emailed link"
      },
      "rates": {
        "type": "array",
        "description": "[{bid_item_id, rate}] — a null or omitted rate means NOT priced, never zero"
      },
      "notes": {
        "type": "string",
        "description": "Exclusions and qualifications, read alongside the figures"
      },
      "bid_id": {
        "type": "string",
        "description": "Checked against the caller's workspace membership via the bid's row (string (uuid))"
      }
    }
  },
  {
    "name": "trade-portal",
    "tag": "CRM",
    "methods": [
      "POST"
    ],
    "summary": "A trade customer seeing their own account: statement, stock bands, reorder and a delegated admin",
    "description": "THE TOKEN IS THE IDENTITY. Every read and write is scoped by what the link resolves to, and a company id in the request body is never trusted. The access pattern is a link unique to the recipient with no account for them to create and forget — which is what pastes into a WhatsApp thread.\n\nThe piece bespoke portals miss is DELEGATED ADMINISTRATION: `admin` on a portal account is the customer's own ",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "resolve",
          "statement",
          "stock",
          "history",
          "approvals",
          "place_order",
          "decide",
          "mint_link"
        ],
        "required": true,
        "description": "Which operation to run"
      },
      "token": {
        "type": "string",
        "description": "The per-recipient access token"
      },
      "product_id": {
        "type": "string",
        "description": "The product to report on (string (uuid))"
      },
      "lines": {
        "type": "array",
        "description": "[{product_id, description, quantity, unit_price}] — a zero quantity is dropped"
      },
      "notes": {
        "type": "string",
        "description": "Anything they want us to know"
      },
      "approval_id": {
        "type": "string",
        "description": "The pending request (string (uuid))"
      },
      "decision": {
        "type": "string",
        "description": "approved | declined"
      },
      "reason": {
        "type": "string",
        "description": "Why, in their words"
      },
      "portal_user_id": {
        "type": "string",
        "description": "Checked against the caller's workspace through the account; a mismatch 404s (string (uuid))"
      }
    }
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
    "description": "Action-discriminated API routing POST requests to three handlers: analytics (get_best_time, get_post_analytics, get_account_insights), OAuth (connect, callback, disconnect; GET returns account list), and publish (publish_now, schedule). All actions require supabase JWT auth.",
    "fields": {
      "action": {
        "type": "string",
        "enum": [
          "connect",
          "callback",
          "disconnect",
          "publish_now",
          "schedule",
          "get_post_analytics",
          "get_best_time",
          "get_account_insights",
          "config_status",
          "import_external_posts",
          "get_daily_metrics",
          "get_content_decay",
          "get_posting_frequency",
          "get_follower_stats",
          "get_post_timeline",
          "get_linkedin_aggregate",
          "get_linkedin_organizations",
          "get_account_metrics",
          "sync_reviews",
          "reply_review"
        ],
        "required": true,
        "description": "Which operation to run"
      },
      "platform": {
        "type": "string",
        "description": "Social platform slug (instagram, facebook, linkedin, tiktok, pinterest, youtube, twitter, threads)"
      },
      "workspace_id": {
        "type": "string",
        "description": "Workspace to attach the account"
      },
      "redirect_url": {
        "type": "string",
        "description": "Post-OAuth redirect URL"
      },
      "zernio_account_id": {
        "type": "string",
        "description": "Zernio account ID returned after OAuth"
      },
      "social_account_id": {
        "type": "string",
        "description": "social_accounts.id to disconnect"
      },
      "post_id": {
        "type": "string",
        "description": "social_posts.id"
      },
      "scheduled_at": {
        "type": "string",
        "description": "ISO datetime to publish"
      },
      "account_id": {
        "type": "string",
        "description": "social_accounts.id"
      },
      "post_urls": {
        "type": "array",
        "description": "Up to 25 public post URLs"
      },
      "from_date": {
        "type": "string",
        "description": "YYYY-MM-DD"
      },
      "to_date": {
        "type": "string",
        "description": "YYYY-MM-DD"
      },
      "granularity": {
        "type": "string",
        "description": "Series granularity"
      },
      "aggregation": {
        "type": "string",
        "description": "TOTAL (default) | DAILY"
      },
      "review_id": {
        "type": "string",
        "description": "social_reviews.id (string (uuid))"
      },
      "reply": {
        "type": "string",
        "description": "Reply text"
      }
    }
  }
] as const;
