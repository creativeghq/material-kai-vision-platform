# Agent System Architecture

Complete guide to the AI Agent system with database-driven prompts and configurations.

---

## Overview

The Material Kai Vision Platform uses an AI Agent system powered by LangChain.js, LangGraph, and Anthropic Claude models. Agents are specialized AI assistants that help users with specific tasks like material search, B2B research, interior design, and product discovery.

**Key Features**:
- LangGraph StateGraph-based execution with checkpointing
- Database-driven system prompts (no code deployment needed)
- Admin UI for prompt management
- Real-time prompt updates
- Role-based access control
- Tool orchestration with LangChain.js
- Long-term memory for cross-conversation context
- Skills system for domain-specific knowledge injection

---

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                        │
│  - Agent Hub (/agent-hub)                                   │
│  - Agent Configs Admin (/admin/agent-configs)              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Supabase Edge Functions (Deno)                 │
│  - agent-chat/index.ts                                      │
│  - _skills/ (domain knowledge)                              │
│  - Loads prompts from database                              │
│  - LangGraph StateGraph orchestration                       │
│  - Claude Sonnet 4.5 / Haiku 4.5 models                    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Database (PostgreSQL/Supabase)                 │
│  - prompts table (unified for all AI prompts)              │
│  - agent_checkpoints (conversation state)                   │
│  - agent_memories (long-term memory)                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Agent Types

### 1. Search Agent

**Agent ID**: `search`
**Access**: All users (viewer, member, admin, owner)
**Model**: Claude Haiku 4.5 (fast responses)

**Purpose**: Help users find materials using multi-modal search capabilities.

**Available Tools**:
- `material_search` - RAG-powered semantic search via MIVAA API
- `image_analysis` - Material recognition, visual search, product identification

**Key Capabilities**:
- Semantic search with multi-vector strategy
- Image-based material identification
- Product recommendations

### 2. Insights Agent

**Agent ID**: `insights`
**Access**: Admin, Owner only
**Model**: Claude Sonnet 4.5 (complex reasoning)

**Purpose**: Unified intelligence for research, analytics, business analysis, and B2B manufacturer discovery.

**Available Tools**:

**Sub-agent Orchestration:**
- `research_analysis` - Market research and trends
- `analytics_analysis` - Data analysis and insights
- `business_analysis` - Business intelligence
- `product_analysis` - Product comparison and analysis
- `material_search` - Material discovery

**B2B Research Tools:**
- `b2b_manufacturer_search` - Find manufacturers via Claude web search
- `company_website_scrape` - Scrape company websites via Firecrawl
- `company_enrichment` - Enrich company data via Apollo.io
- `contact_discovery` - Find contacts via Hunter.io domain search or find a specific person's email (Hunter Email Finder + Apollo.io People Match fallback). All discovered emails are validated with ZeroBounce.
- `email_validate` - Validate email addresses on demand via ZeroBounce (single or batch up to 10). Returns status: valid, invalid, catch-all, spamtrap, abuse, do_not_mail, unknown.
- `save_to_crm` - Save companies/contacts to CRM

### 3. Interior Designer Agent

**Agent ID**: `interior-designer`
**Access**: All users (viewer, member, admin, owner)
**Model**: Claude Sonnet 4.5

**Purpose**: AI-powered interior design with spatial analysis and material matching.

**Available Tools**:
- `material_search` - Material discovery (only when user explicitly asks)
- `image_analysis` - Room and material analysis
- `generate_3d` - Trigger async 3D interior design generation

**Special Behavior**: Material search is only injected when user message contains keywords like "find materials", "search for materials", etc.

### 4. Demo Agent

**Agent ID**: `demo`
**Access**: Admin, Owner only
**Model**: N/A (returns hardcoded demo data)

**Purpose**: Platform showcase with pre-defined demo responses.

---

## B2B Research System

### Supported Countries (30 Markets)

The B2B manufacturer search supports 30 markets across 5 regions with native-language search optimization:

| Region | Countries |
|--------|-----------|
| **Central & Eastern Europe** | Poland (PL), Czech Republic (CZ), Slovakia (SK), Hungary (HU), Romania (RO), Bulgaria (BG), Ukraine (UA) |
| **Balkans & Turkey** | Turkey (TR), Serbia (RS), Croatia (HR), Slovenia (SI), Bosnia and Herzegovina (BA), North Macedonia (MK), Albania (AL), Greece (GR) |
| **Baltic & Nordic** | Lithuania (LT), Latvia (LV), Estonia (EE), Finland (FI), Denmark (DK) |
| **Western & Southern Europe** | Germany (DE), Netherlands (NL), France (FR), Spain (ES), Italy (IT), Portugal (PT), United Kingdom (GB) |
| **Global Manufacturing Hubs** | China (CN), India (IN), Morocco (AR) |

### Global Multi-Region Search

The B2B manufacturer search uses Claude's built-in web search. Specify a country for focused results, a region for regional scope, or omit both for a broad global search — all powered by the existing `ANTHROPIC_API_KEY`.

**Search modes:**
- **Global** (default) — broad search across Europe and major manufacturing hubs
- **By region** — focused on a specific region (cee/balkans/baltic_nordic/western_southern/global)
- **By country** — single-country focused results

**How it works:**
1. A natural language query is constructed with country/region scope and product category
2. Claude performs web search using the `web_search_20250305` built-in tool
3. Results are returned as a structured manufacturer list
4. No separate API key required — uses `ANTHROPIC_API_KEY`

### Dual-Language Search

Each regional query includes native language search terms automatically. For example, a search for "ceramic tiles" in the CEE region includes:

- English: `"ceramic tiles manufacturer Poland, Czech Republic, Slovakia..."`
- Native hints: `"płytki ceramiczne" (Polish), "keramické dlaždice" (Czech), etc.`

This ensures discovery of:
- International-facing manufacturers (English websites)
- Local-only manufacturers (native language websites only)

### Required API Keys

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

```markdown
---
name: Skill Name
slug: skill-slug
description: Brief description for agent selection
agents: [search, insights]    # Which agents can use this skill
tags: [tag1, tag2]
---

## Context
Domain expertise content...

## Instructions
How to apply this knowledge...
```

### When to Use Skills

Skills are for **proprietary knowledge** that:
1. Claude doesn't know (your pricing rules, supplier tiers, business logic)
2. Isn't needed for every query (otherwise → system prompt)

### Adding New Skills

1. Create `_skills/[slug]/SKILL.md`
2. Add import in `_skills/index.ts`:
```typescript
import newSkill from './new-skill/SKILL.md' with { type: 'text' };

const SKILL_FILES = {
  'new-skill': newSkill,
};
```

---

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude API key |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `MIVAA_GATEWAY_URL` | `https://v1api.materialshub.gr` | MIVAA API endpoint |
| `FIRECRAWL_API_KEY` | - | Website scraping |
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
- Edit system prompts (stored in database)
- Real-time character count
- Status management (active/inactive)
- Changes take effect immediately

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

### Request
```json
{
  "messages": [
    { "role": "user", "content": "Find marble tiles" }
  ],
  "agentId": "search"
}
```

### Response (Server-Sent Events)
```json
{ "type": "iteration", "iteration": 1, "maxIterations": 10 }
{ "type": "tool_call", "tool": "material_search", "args": {...} }
{ "type": "tool_result", "tool": "material_search", "result": {...} }
{ "type": "final_response", "text": "...", "materialResults": {...} }
```

---

## Security & Access Control

### Role-Based Access

| Agent | Roles |
|-------|-------|
| Search | viewer, member, admin, owner |
| Insights | admin, owner |
| Interior Designer | viewer, member, admin, owner |
| Demo | admin, owner |

### Authentication

All requests require:
1. Valid Supabase session
2. Workspace membership
3. Appropriate role for restricted agents

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
2. Check `agents` array includes the agent ID
3. Verify import in `_skills/index.ts`

---

**Last Updated**: February 3, 2026
**Version**: 2.0.0
**Status**: Production
**Maintainer**: Development Team
