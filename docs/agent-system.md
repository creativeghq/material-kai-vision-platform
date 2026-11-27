# Agent System Architecture

Complete guide to the AI Agent system with database-driven prompts and configurations.

---

## Overview

The Material Kai Vision Platform uses an AI Agent system powered by LangChain.js, LangGraph, and Anthropic Claude models. Agents are specialized AI assistants that help users with specific tasks like material search, B2B research, interior design, and platform demonstrations.

**Key Features**:
- LangGraph StateGraph-based execution (no checkpointer — the client sends the history each turn)
- Database-driven system prompts (no code deployment needed)
- Admin UI for prompt management
- Real-time prompt updates
- Role-based access control (RBAC) tool gating
- Tool orchestration with LangChain.js
- Long-term memory for cross-conversation context — LLM promotion gate + semantic recall (#233)
- Skills system for domain-specific knowledge injection
- Multimodal support (images sent as vision content blocks)

---

## Architecture

### Components

┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                        │
│  - Agent Hub (/agent-hub)                                   │
│  - AI Configurations (/admin/ai-configs), Harness (/admin/agents) │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Supabase Edge Functions (Deno)                 │
│  - agent-chat/index.ts                                      │
│  - _shared/skills/ (domain playbooks)                       │
│  - Loads prompts from database                              │
│  - LangGraph StateGraph orchestration                       │
│  - Claude Opus 5.5 (agents) / Claude Haiku 5.5 (Demo, router) │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Database (PostgreSQL/Supabase)                 │
│  - prompts table (unified for all AI prompts)               │
│  - agent_chat_messages (conversation history)               │
│  - agent_memories (long-term memory, halfvec-searchable)    │
└─────────────────────────────────────────────────────────────┘

---

## Agent Types

`AGENT_CONFIGS` in `agent-chat/index.ts` is the one source for what an agent can do; the Agent Hub
picker (`AGENTS` in `AgentHub.tsx`) lists them. Every chat agent runs on `claude-opus-5-5` except Demo
(`claude-haiku-5-5`).

| Picker id | Server config | Name | Focus |
|---|---|---|---|
| `orchestrator` | routes, falls back to `kai` | **JARVIS** | Default. Routes each turn to a specialist, or keeps it on the generalist `kai`, which binds every toolkit. |
| `interior-designer` | `interior-designer` | **Vision** | Interior design, image/3D generation, staging, moodboards, sheets. |
| `product-business` | `product-business` | **Pepper** | Catalogs, B2B research, product knowledge graph, tech radar, job research, signals. |
| `marketing` | `marketing` | **Edith** | SEO research and audits, content, brand-mention and LLM visibility. |
| `property-advisor` | `property-advisor` | **Baxter** | Real estate: listings, valuations, viewings, offers, matching, lettings. |
| `erp` | `erp` | **Trinity** | Finance and quotes: quotes + branded PDFs, account overviews, price history. |
| `social-media` | `social-media` | **Hermes** | Publish/schedule social posts, social analytics. |
| `demo` | `demo` | **Demo** | Showcase; `requiredRole: 'admin'`. |

Stark (`developer`) and Veritas (`qa-reviewer`) are listed in the picker as disabled "Coming soon"
entries. They are not chat agents: they run as Agent Ops sub-agents (`ask_stark` / `ask_veritas`),
see [admin-headquarters.md](admin-headquarters.md#agent-ops-adminagent-ops).

### Orchestrator routing

`orchestrator`, `jarvis` and `auto` are orchestrator ids (`ORCHESTRATOR_IDS`). Before the config
lookup, `routeToSpecialist` asks Haiku for a **server-constrained verdict** through
`generateStructuredWithClaude` — `{ specialist: enum('none', …slugs), confidence }`, task
`agent_router`, logged to `ai_usage_logs` against the user and workspace. Below
`system_settings.agent_router.min_confidence` (no code default) the generalist keeps the turn. An
image-first turn with under 20 characters of text goes to Vision. A **direct run** (a quick-start or
an approval that names its tool) skips the router entirely and runs on `kai`. If the `agent_router`
prompt or the confidence setting cannot be loaded, routing is disabled and every turn runs on the
generalist (logged as an error).

### Legacy aliases

`search`, `insights` and `seo` resolve to `kai`; existing flows using them keep working.

### Multimodal input and generation chaining

Images arrive as data URLs and are attached as `image_url` blocks on the last HumanMessage. Every
generated result in a conversation can feed the next generator: `_shared/conversation-media.ts`
(`collectConversationMedia`) reads every result kind — Gemini / scene renders, virtual staging,
materials boards, tool images, image-grid tiles, video — live or restored from message metadata, and
the turn's `[CONTEXT]` block lists the last six by kind and source so the agent can pass the one the
user means. `resolveMediaSource` (explicit URL > `my_upload` > newest still > attachment) is shared by
lighting, staging, video and the photo walk. agent-chat carries `virtualStagingData`,
`materialsBoardData` and `videoData` through its history map, and AgentHub keeps older turns that carry
media inside the bounded history it sends (40 messages plus any older media-bearing turn).

---

## Approvals (action confirmation)

A state-changing tool called without `confirm: true` returns an `action_confirmation` chunk instead of
acting (invariant 9). AgentHub collects **every action a turn proposes into ONE card**
(`ActionConfirmationCard`): **Approve all N** runs them in order as direct tool runs (no model turn, no
chat rows), marks each item's outcome, then resumes the model ONCE in a hidden turn; **Decline all**
takes no action. An action already pending on a card is not proposed again. Card status and per-item
outcome are persisted on the message, so a reload shows the answered card as its outcome
("Approved: …", "Declined", "N of M done, K failed"). An approval run's result is read from the final
chunk's `tool_results`.

**Auto-approve** is a switch in the composer (off by default, stored in `localStorage` as
`agentHub.autoApprove`, sent as `client_context.auto_approve`). When on, the turn's card is approved as
if clicked, capped at 3 rounds per typed message (`MAX_AUTO_APPROVE_ROUNDS`). The reply wording for
staged actions comes from the DB prompts `tool/approval_card/{manual,auto}`, picked by
`client_context.auto_approve`. A turn rings the bell once, and not at all under Auto-approve.

---

## B2B Research System

### How It Works

The `b2b_manufacturer_search` tool uses Anthropic's built-in `web_search_20250305` tool (beta header `web-search-2025-03-05`). No separate Perplexity or search API key is needed — it uses `ANTHROPIC_API_KEY`.

**The model is `claude-opus-5-5` at `effort:low`, and it is PINNED** (`SEARCH_MODEL` / `ANALYSIS_MODEL` in `_shared/tools/b2b-tools.ts`). Measured against Sonnet 5.5 on an identical 6-company Polish sweep:

| Model | Time | Searches | Input tokens | Domains found | Sources/record | Cost |
|---|---|---|---|---|---|---|
| `opus-5` | 52s | 8 | 35k | 100% | 1.2 | $0.21 |
| `sonnet-5` | 65s | 19 | 89k | 100% | 0.0 | $0.31 |

Opus wins on **every axis including price** — Sonnet burned 19 searches and 89k tokens getting less, and returned the household names you would find without a tool at all where Opus surfaced small specialist factories. The cheaper-tier intuition is backwards for this task, so the choice is pinned rather than left to a "use the cheap model for tool calls" reflex.

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

Skills provide domain-specific knowledge and procedural playbooks that agents can load on-demand using progressive disclosure. The agent sees each skill's name + description in its system prompt; when a task matches, it calls the `load_skill` tool with the slug to pull the full markdown into context. This keeps the base system prompt lean and avoids paying token cost for unused playbooks on every turn.

### Structure

```
supabase/functions/_shared/
├── skills-types.ts              # Type definitions (SkillMetadata, Skill)
├── skills-loader.ts             # Loader (parseSkillFile, getSkillsForAgent, getSkillContent, formatSkillsForSystemPrompt)
├── skills/
│   └── [skill-slug]/
│       ├── SKILL.md             # Source of truth — human/PR review copy
│       └── skill.ts             # Re-exports SKILL.md content as a template literal (what the loader imports)
└── tools/skills-tools.ts        # `load_skill` tool definition
```

**Why two files per skill:** Supabase Edge Runtime's Deno does not enable `--unstable-raw-imports`, so the loader can't `import` a `.md` file directly. Each skill therefore has a sibling `skill.ts` whose default export is the same markdown as a `String.raw\`...\`` template literal. The `.md` file stays in the repo as the reviewable canonical copy.

### SKILL.md format

YAML frontmatter followed by markdown body:

```markdown
---
name: Human-Readable Skill Name
slug: skill-slug
description: One-sentence guide to when the agent should load this skill.
agents: [kai, interior-designer]
tags: [optional, classification, tags]
---

# Skill name

Body is freeform markdown. Typical structure:
- A "Recipe" section with numbered steps
- A "Guardrails" section listing what not to do
- An output schema if the skill is expected to return structured data
```

### When to use skills

Use a skill when all of these are true:
1. The knowledge or procedure is **proprietary** (pricing rules, supplier tiers, internal taxonomies) OR a **domain-specific playbook** Claude would otherwise improvise
2. It's only relevant for a subset of queries — loading it on every turn would waste tokens
3. You want the procedure to be **auditable in git** — so SMEs can PR-review the playbook without touching agent code

If the knowledge is needed on every turn, put it in the DB-stored system prompt via `/admin/ai-configs` instead.

### Currently registered skills

| Slug | Name | Available to | Purpose |
|------|------|--------------|---------|
| `b2b-manufacturer-research` | B2B Manufacturer Research | `kai` | Multi-step playbook for finding, scraping, enriching, and CRM-saving manufacturers (web search → Firecrawl → Apollo/Hunter → ZeroBounce → CRM) |
| `interior-staging-workflow` | Interior Staging Workflow | `kai`, `interior-designer` | End-to-end procedure for staging an empty room: image analysis → material matching → 3D generation → optional VR |
| `material-spec-extraction` | Material Spec Extraction | `kai`, `interior-designer` | Extracts structured specs (dimensions, finishes, performance ratings, certifications) from prose product descriptions |

Source: [`supabase/functions/_shared/skills/`](../supabase/functions/_shared/skills/) — registered in [`skills-loader.ts`](../supabase/functions/_shared/skills-loader.ts).

### How loading works at runtime

1. `agent-chat/index.ts` calls `formatSkillsForSystemPrompt(agentId)` and appends the resulting `## Skills available` section to the agent's system prompt (name + slug + description per skill, filtered by `agents` frontmatter)
2. The same file pushes the `load_skill` tool onto the agent's tool list if the agent has ≥1 skill
3. The model, seeing the skill list, calls `load_skill({ slug })` when a task matches
4. The tool returns the full markdown body; the model follows the recipe

### Adding a new skill

1. Create `supabase/functions/_shared/skills/<slug>/SKILL.md` with the frontmatter above
2. Create `supabase/functions/_shared/skills/<slug>/skill.ts` with:
   ```ts
   export default String.raw`---
   name: ...
   slug: my-slug
   description: ...
   agents: [kai]
   ---

   # ... markdown body identical to SKILL.md ...
   `;
   ```
3. Register in `supabase/functions/_shared/skills-loader.ts`:
   ```ts
   import mySkill from './skills/my-slug/skill.ts';

   const SKILL_FILES: Record<string, string> = {
     'my-slug': mySkill,
     // ...
   };
   ```
4. Deploy `agent-chat` — the skill is live. No DB migration, no UI change.

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
| `FIRECRAWL_API_KEY` | - | Website scraping (B2B, admin/owner only) |
| `APOLLO_API_KEY` | - | Company enrichment + email finder fallback |
| `HUNTER_API_KEY` | - | Domain search + person email finder |
| `ZEROBOUNCE_API_KEY` | - | Email validation (all discovered emails) |
| `SENTRY_AUTH_TOKEN` | - | Error tracking |

---

## Admin UI - Prompts and the harness

- **`/admin/ai-configs`** (AI Configurations): Prompts, Chat Starters, Writing Rules, Model Pricing.
  Agent system prompts are `prompts` rows; edits go through `update_prompt_with_history` and take
  effect on the next turn, no deploy.
- **`/admin/agents`** (Agent Harness): turns, models, tools, evals, failures, conversations and the
  per-conversation trace.
- **`/admin/agent-ops`** (Agent Ops): cases, Stark/Veritas, background agents, servers, processes.

Full reference: [admin-headquarters.md](admin-headquarters.md).

---

## API Reference

### Endpoint
`POST /functions/v1/agent-chat`

The request body accepts `messages` (array of role/content objects), `agentId` (string), and optionally `images` (array of base64 data URLs). The response is a stream of Server-Sent Events delivering iteration status, tool call notifications, tool results, and the final response text with any material results.

---

## Security & Access Control

### Tool gating

A toolkit is bound only when the caller may have it, on three axes (see CLAUDE.md "Agent tools"):
role (`adminOnly`, matching the `if (isAdmin)` push site in agent-chat), workspace capability
(`capability` on the toolkit, e.g. `marketing.seo`, `workspace.manage`) and module entitlement
(`moduleSlug`, enforced in the tool by `moduleGate`). `ops-desk` (Agent Ops) and `field-registry` (Field Roles) bind their tools only for a
platform operator; `catalog-ingestion` binds for admins, and MIVAA accepts the import only from the operator.

### Authentication

Every request carries a Supabase session JWT or a `kai_` API key. A `kai_` key acts as its owner in
the ONE workspace it is bound to (fenced in the database and on the edge) and never passes a
platform-operator gate. A client disconnect is treated as a cancellation; media a cancelled turn had
already finished is saved.

---

## Monitoring & Logging

- **`agent_turns`** — one row per turn, opened `running` and closed with `ok` / `error` / `refused` /
  `max_tokens` / `empty` / `invalid_tool_call` / `cancelled`; still `running` after 5 minutes means
  the isolate died.
- **`agent_tool_call_logs`** — every tool call, with `turn_id`.
- **`agent_usage_logs`** via `log_agent_usage()` — tokens and cost per turn, priced from
  `ai_model_pricing` (Haiku 5.5's long-context card applied above a 100K-token prompt).
- Router calls log to `ai_usage_logs` under task `agent_router`.

Read all of it at `/admin/agents`.

---

## Related Documentation

- **[langgraph-implementation.md](langgraph-implementation.md)** - LangGraph StateGraph, conversation state, memory, situational context, daily brief
- **[admin-headquarters.md](admin-headquarters.md)** - Agent Harness, Agent Ops, Stark/Veritas
- **[agent-and-tools-reference.md](agent-and-tools-reference.md)** - Toolkits and tools
- **[ai-models-guide.md](ai-models-guide.md)** - Model configurations

---

## Troubleshooting

### Agent Not Responding
1. Open the turn in `/admin/agents` → Conversations (trace): the `agent_turns` row names how it ended
2. Check the agent's prompt row is active in `/admin/ai-configs` → Prompts
3. Check API keys are configured
4. Review rate limits

### Agent Never Remembers Anything
The memory system fails silently by design of the failure, not the code — see
[langgraph-implementation.md → Long-Term Memory](langgraph-implementation.md#long-term-memory)
and run `select * from dic_detect__ops_silent_zero()`; the `agent_memory_*` probes name
which half (promote / embed / recall) is dead.

### B2B Search Failing
1. Verify `ANTHROPIC_API_KEY` is set and has sufficient quota
2. Check that the web search beta (`web-search-2025-03-05`) is available on your Anthropic plan

### Skills Not Loading
1. Verify SKILL.md has correct frontmatter (and that `skill.ts` mirrors it — both files must stay in sync)
2. Check `agents` array includes the agent ID (use `kai`, not `search`/`insights`)
3. Verify the slug is registered in `SKILL_FILES` inside `_shared/skills-loader.ts`
4. Confirm `agent-chat` was redeployed after adding the skill (static imports require a deploy)

### Legacy agentId Not Working
- Ensure the edge function `AGENT_CONFIGS` map contains fallthrough from `search`/`insights`/`seo` → `kai`
- Check frontend is not hardcoded to a removed agent ID

---

**Last Updated**: November 27, 2026
**Version**: 3.1.0
**Status**: Production
**Maintainer**: Development Team
