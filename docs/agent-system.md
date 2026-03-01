# Agent System Architecture

Complete guide to the AI Agent system with database-driven prompts and configurations.

---

## Overview

The Material Kai Vision Platform uses an AI Agent system powered by LangChain.js, LangGraph, and Anthropic Claude models. Agents are specialized AI assistants that help users with specific tasks like material search, B2B research, interior design, and platform demonstrations.

**Key Features**:
- LangGraph StateGraph-based execution with checkpointing
- Database-driven system prompts (no code deployment needed)
- Admin UI for prompt management
- Real-time prompt updates
- Role-based access control (RBAC) tool gating
- Tool orchestration with LangChain.js
- Long-term memory for cross-conversation context
- Skills system for domain-specific knowledge injection
- Multimodal support (images sent as vision content blocks)

---

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                        │
│  - Agent Hub (/agent-hub)                                   │
│  - Agent Configs Admin (/admin/agent-configs)               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Supabase Edge Functions (Deno)                 │
│  - agent-chat/index.ts                                      │
│  - _skills/ (domain knowledge)                              │
│  - Loads prompts from database                              │
│  - LangGraph StateGraph orchestration                       │
│  - Claude Sonnet 4.5 (Jarvis) / Claude Haiku 4.5 (Demo)     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Database (PostgreSQL/Supabase)                 │
│  - prompts table (unified for all AI prompts)               │
│  - agent_checkpoints (conversation state)                   │
│  - agent_memories (long-term memory)                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Agent Types

There are **3 active agents**. Legacy agent IDs (`search`, `insights`, `seo`) are aliases that resolve to `kai`.

### 1. Jarvis Agent (Unified)

**Agent ID**: `kai`
**Legacy aliases**: `search`, `insights`, `seo` (all resolve to `kai`)
**Access**: All users for core tools; admin/owner only for B2B, SEO, and sub-agent tools
**Model**: Claude Sonnet 4.5
**DB prompt key**: `kai` in `prompts` table (`prompt_type='agent'`, `category='kai'`)

**Purpose**: Primary user-facing agent combining material search, knowledge base queries, visual search, B2B manufacturer discovery, SEO analysis, and general material intelligence.

**Core Tools** (all roles: viewer, member, admin, owner):
- `material_search` — RAG-powered semantic search via MIVAA API
- `knowledge_base_search` — Direct knowledge base retrieval
- `visual_search` — Image-based product search via CLIP/SigLIP (sends `image_base64` to MIVAA `/api/rag/search?strategy=image`)

**Admin/Owner-Only Tools** (gated by RBAC):
- `b2b_manufacturer_search` — Find manufacturers via Claude built-in web search (`web_search_20250305`, no extra key)
- `company_website_scrape` — Scrape company websites via Firecrawl
- `company_enrichment` — Enrich company data via Apollo.io
- `contact_discovery` — Find contacts via Hunter.io + Apollo.io fallback; all emails validated with ZeroBounce
- `email_validate` — Validate email addresses on demand via ZeroBounce (single or batch up to 10)
- `save_to_crm` — Save companies/contacts to CRM
- Sub-agent orchestration: `research_analysis`, `analytics_analysis`, `business_analysis`, `product_analysis`

**Multimodal**: Frontend sends `images: string[]` (data URLs) → edge function attaches as `image_url` content blocks on the last HumanMessage.

---

### 2. Interior Designer Agent

**Agent ID**: `interior-designer`
**Access**: All users (viewer, member, admin, owner)
**Model**: Claude Sonnet 4.5

**Purpose**: AI-powered interior design with spatial analysis, material matching, and 3D/VR visualization.

**Available Tools**:
- `material_search` — Material discovery (injected only when user explicitly asks for materials)
- `image_analysis` — Room and material analysis
- `generate_3d` — Trigger async 3D interior design generation (Replicate models)

**Special Behavior**: Material search is only injected when user message contains keywords like "find materials", "search for materials", etc.

**VR Integration**: After generating a 3D design, users can trigger VR world generation via the "Generate VR" button in DesignCanvas. The `generate-vr-world` edge function handles the WorldLabs Marble API call.

---

### 3. Demo Agent

**Agent ID**: `demo`
**Access**: Admin, Owner only
**Model**: Claude Haiku 4.5 (returns mostly hardcoded demo data)

**Purpose**: Platform showcase with pre-defined demo responses.

---

## Agent Resolution (Legacy Aliases)

The following `agentId` values sent from the frontend are transparently mapped to `kai`:

| Sent agentId | Resolved Agent | Notes |
|-------------|----------------|-------|
| `kai` | Jarvis | Direct |
| `search` | Jarvis | Legacy alias |
| `insights` | Jarvis | Legacy alias |
| `seo` | Jarvis | Legacy alias |
| `interior-designer` | Interior Designer | Direct |
| `demo` | Demo | Direct |

Existing saved flows using `search`, `insights`, or `seo` continue to work without modification.

---

## B2B Research System

### How It Works

The `b2b_manufacturer_search` tool uses Anthropic's built-in `web_search_20250305` tool (beta header `web-search-2025-03-05`). No separate Perplexity or search API key is needed — it uses `ANTHROPIC_API_KEY`. The model is Claude Haiku 4.5 for web searches.

**Flow:**
1. A natural language query is constructed with country/region scope and product category
2. Claude performs web search using the `web_search_20250305` built-in tool
3. Results are returned as a structured manufacturer list
4. Frontend action types `perplexity_search` and `web_search` both trigger this tool (fallthrough keeps saved flows working)

### Supported Countries (30 Markets)

| Region | Countries |
|--------|-----------|
| **Central & Eastern Europe** | Poland (PL), Czech Republic (CZ), Slovakia (SK), Hungary (HU), Romania (RO), Bulgaria (BG), Ukraine (UA) |
| **Balkans & Turkey** | Turkey (TR), Serbia (RS), Croatia (HR), Slovenia (SI), Bosnia and Herzegovina (BA), North Macedonia (MK), Albania (AL), Greece (GR) |
| **Baltic & Nordic** | Lithuania (LT), Latvia (LV), Estonia (EE), Finland (FI), Denmark (DK) |
| **Western & Southern Europe** | Germany (DE), Netherlands (NL), France (FR), Spain (ES), Italy (IT), Portugal (PT), United Kingdom (GB) |
| **Global Manufacturing Hubs** | China (CN), India (IN), Morocco (MA) |

### Dual-Language Search

Each regional query includes native language search terms automatically. For example, a search for "ceramic tiles" in the CEE region includes:
- English: `"ceramic tiles manufacturer Poland, Czech Republic, Slovakia..."`
- Native hints: `"płytki ceramiczne"` (Polish), `"keramické dlaždice"` (Czech), etc.

### Required API Keys (B2B Tools)

| Variable | Service | Purpose |
|----------|---------|---------|
| `FIRECRAWL_API_KEY` | Firecrawl | Website scraping |
| `APOLLO_API_KEY` | Apollo.io | Company enrichment + person email finder fallback |
| `HUNTER_API_KEY` | Hunter.io | Domain search + person email finder |
| `ZEROBOUNCE_API_KEY` | ZeroBounce | Email validation (all discovered emails) |

---

## Skills System

Skills provide domain-specific knowledge that agents can load on-demand using progressive disclosure.

### Structure

```
supabase/functions/
├── _skills/
│   ├── types.ts              # Type definitions
│   ├── index.ts              # Skills loader
│   └── [skill-slug]/
│       └── SKILL.md          # Skill definition
```

### SKILL.md Format

A SKILL.md file includes a frontmatter block with fields: `name`, `slug`, `description`, `agents` (list of agent IDs that can use this skill), and `tags`. The body contains a `## Context` section with domain expertise content and an `## Instructions` section explaining how to apply the knowledge.

### When to Use Skills

Skills are for **proprietary knowledge** that:
1. Claude doesn't know (your pricing rules, supplier tiers, business logic)
2. Isn't needed for every query (otherwise → system prompt)

### Adding New Skills

1. Create `_skills/[slug]/SKILL.md`
2. Add import in `_skills/index.ts` for the new skill file and register it in the `SKILL_FILES` map.

---

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude API key (also used for B2B web search) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `MIVAA_GATEWAY_URL` | `https://v1api.materialshub.gr` | MIVAA API endpoint |
| `WORLDLABS_API_KEY` | - | VR world generation (Interior Designer agent) |
| `FIRECRAWL_API_KEY` | - | Website scraping (B2B, admin/owner only) |
| `APOLLO_API_KEY` | - | Company enrichment + email finder fallback |
| `HUNTER_API_KEY` | - | Domain search + person email finder |
| `ZEROBOUNCE_API_KEY` | - | Email validation (all discovered emails) |
| `SENTRY_AUTH_TOKEN` | - | Error tracking |

---

## Admin UI - Agent Configurations

### Location
`/admin/agent-configs`

### Features

- View all configured agents
- Edit system prompts (stored in `prompts` table)
- Real-time character count
- Status management (active/inactive)
- Changes take effect immediately (no deployment required)

### Usage

1. Navigate to Admin Dashboard → AI & Intelligence → Agent Configurations
2. Click "Edit" on any agent
3. Modify the system prompt
4. Click "Save Changes"
5. Changes apply on next agent execution

---

## API Reference

### Endpoint
`POST /functions/v1/agent-chat`

The request body accepts `messages` (array of role/content objects), `agentId` (string), and optionally `images` (array of base64 data URLs). The response is a stream of Server-Sent Events delivering iteration status, tool call notifications, tool results, and the final response text with any material results.

---

## Security & Access Control

### Role-Based Access (RBAC Tool Gating)

| Agent | Core Tools | Admin/Owner-Only Tools |
|-------|-----------|------------------------|
| Jarvis | material_search, knowledge_base_search, visual_search | b2b_manufacturer_search, company_website_scrape, company_enrichment, contact_discovery, email_validate, save_to_crm, sub-agents |
| Interior Designer | material_search (on demand), image_analysis, generate_3d | — |
| Demo | — (hardcoded responses) | — |

### Authentication

All requests require:
1. Valid Supabase session
2. Workspace membership
3. Appropriate role for restricted tools

---

## Monitoring & Logging

### Token Usage Tracking
- Accumulated across all agent iterations
- Logged via `log_agent_usage()` RPC
- Integrates with pricing table for cost calculation

### Metrics Tracked
- Agent invocations per type
- Average response time
- Token usage (input/output)
- Tool execution counts
- Error rates

---

## Related Documentation

- **[langgraph-implementation.md](langgraph-implementation.md)** - LangGraph StateGraph, checkpointing, memory
- **[api/agent-chat-api.md](api/agent-chat-api.md)** - Full API reference
- **[ai-models-guide.md](ai-models-guide.md)** - Model configurations
- **[vr-world-generation.md](vr-world-generation.md)** - VR World generation

---

## Troubleshooting

### Agent Not Responding
1. Check Edge Function logs in Supabase
2. Verify agent status is 'active' in database
3. Check API keys are configured
4. Review rate limits

### B2B Search Failing
1. Verify `ANTHROPIC_API_KEY` is set and has sufficient quota
2. Check that the web search beta (`web-search-2025-03-05`) is available on your Anthropic plan

### Skills Not Loading
1. Verify SKILL.md has correct frontmatter
2. Check `agents` array includes the agent ID (use `kai`, not `search`/`insights`)
3. Verify import in `_skills/index.ts`

### Legacy agentId Not Working
- Ensure the edge function `AGENT_CONFIGS` map contains fallthrough from `search`/`insights`/`seo` → `kai`
- Check frontend is not hardcoded to a removed agent ID

---

**Last Updated**: March 1, 2026
**Version**: 3.0.0
**Status**: Production
**Maintainer**: Development Team
