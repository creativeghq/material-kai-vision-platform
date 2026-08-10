# LangGraph Implementation Guide

Technical documentation for the LangGraph-based agent execution system in Material Kai Vision Platform.

---

## Overview

The platform uses **LangGraph** for agent orchestration, providing:
- **StateGraph-based execution** with defined state schema
- **Checkpointing** for resumable conversations
- **Long-term memory** for cross-conversation context
- **Observable execution** with streaming updates
- **Human-in-the-loop** patterns for critical actions

---

## Architecture

                        ┌─────────────────────────────────────┐
                        │         User Request                │
                        └──────────────┬──────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                           StateGraph                                      │
│  ┌────────────────┐                              ┌────────────────────┐  │
│  │   START        │                              │   END              │  │
│  └───────┬────────┘                              └────────────────────┘  │
│          │                                                    ▲          │
│          ▼                                                    │          │
│  ┌───────────────────┐    shouldContinue()      ┌────────────┴───────┐  │
│  │   agentNode       │──────────────────────────│   toolsNode        │  │
│  │   (LLM invoke)    │◄─────────────────────────│   (execute tools)  │  │
│  └───────────────────┘                          └────────────────────┘  │
│          │                                                               │
│          │ (no tool calls)                                              │
│          ▼                                                               │
│  ┌───────────────────┐                                                  │
│  │   END             │                                                  │
│  └───────────────────┘                                                  │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                     AgentStateAnnotation                         │    │
│  │  - messages: BaseMessage[] (reducer: append)                     │    │
│  │  - systemPrompt: string                                          │    │
│  │  - toolResults: any[] (reducer: append)                          │    │
│  │  - collectedProducts: any[] (reducer: append)                    │    │
│  │  - iteration: number                                             │    │
│  │  - inputTokens/outputTokens: number (reducer: sum)              │    │
│  │  - finalResponse: string | null                                  │    │
│  │  - generationJob: any | null                                     │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
              ┌────────────────────────────────────────────┐
              │         SupabaseCheckpointer               │
              │   (agent_checkpoints table)                │
              └────────────────────────────────────────────┘
                                       │
                                       ▼
              ┌────────────────────────────────────────────┐
              │         LongTermMemory                     │
              │   (agent_memories table)                   │
              └────────────────────────────────────────────┘

---

## State Schema (AgentStateAnnotation)

The state schema defines what data flows through the graph. It uses `Annotation.Root` from LangGraph with the following fields:

- **messages** — `BaseMessage[]` with an append reducer (`[...prev, ...next]`). Accumulates all messages. Default: `[]`.
- **systemPrompt** — `string` with a replace reducer (`(_, next) => next`). Holds the current system prompt. Default: `''`.
- **toolResults** — `any[]` with an append reducer. Collects tool results during execution. Default: `[]`.
- **collectedProducts** — `any[]` with an append reducer. Products found during search/recommendations. Default: `[]`.
- **iteration** — `number` with a replace reducer. Current iteration count. Default: `0`.
- **inputTokens** — `number` with a sum reducer (`prev + next`). Accumulated input token count. Default: `0`.
- **outputTokens** — `number` with a sum reducer. Accumulated output token count. Default: `0`.
- **turnCount** — `number` with a sum reducer. Turn count for billing. Default: `0`.
- **finalResponse** — `string | null` with a replace reducer. Set when the agent produces its final answer. Default: `null`.
- **generationJob** — `any | null` with a replace reducer. Set if a 3D generation job is triggered. Default: `null`.

### Reducer Types

| Reducer | Behavior | Use Case |
|---------|----------|----------|
| Append | `[...prev, ...next]` | Accumulating messages, results |
| Replace | `(_, next) => next` | Single values like systemPrompt |
| Sum | `prev + next` | Token counts, turn counts |

---

## Graph Construction

The `createAgentGraph` function accepts a model, a tools array, and an optional `onChunk` streaming callback. It builds a `StateGraph` with `AgentStateAnnotation`, adds an `agent` node and a `tools` node, connects `START` to `agent`, adds a conditional edge from `agent` using `shouldContinue`, adds an edge from `tools` back to `agent`, and compiles the graph. The maximum iteration limit is set to 10.

### Nodes

#### agentNode
- Invokes the LLM with current messages
- Tracks token usage
- Sends streaming updates
- Extracts final response when no tool calls

#### toolsNode
- Executes pending tool calls
- Collects results
- Sends tool execution status
- Extracts products from search results

### Conditional Edge: shouldContinue

The `shouldContinue` function examines the last message in the state. If the iteration count has reached the maximum (10), it returns `END`. If the last message contains tool calls, it returns `'tools'`. Otherwise (no tool calls), it returns `END`.

---

## Checkpointing (SupabaseCheckpointer)

Enables resumable conversations by persisting state to Supabase.

### Database Schema

The `agent_checkpoints` table stores checkpoint data indexed by thread ID. It has a UUID primary key, a `thread_id` text field (unique), a `checkpoint_data` JSONB column, and `created_at`/`updated_at` timestamps. An index on `thread_id` supports fast lookup.

### Checkpointer Class

The `SupabaseCheckpointer` class provides three methods:

- **get(threadId)** — Queries the `agent_checkpoints` table for the given `thread_id` and returns the `checkpoint_data` JSONB, or `null` if not found.
- **put(threadId, checkpoint)** — Upserts the checkpoint into the table, updating `updated_at` on conflict with `thread_id`.
- **delete(threadId)** — Deletes the checkpoint record matching the given `thread_id`.

### Thread ID Generation

Thread IDs are constructed as `${agentId}-${conversationId}` when a `conversationId` is provided, or `${agentId}-${crypto.randomUUID()}` for new conversations.

---

## Long-Term Memory

Stores user preferences, facts, and context across conversations. Implementation:
`supabase/functions/_shared/agent-memory.ts` (`AgentMemory`), rebuilt in **issue #233**.

> The version this replaced promoted memories with three regexes over the user message and
> retrieved them with `order by created_at desc`. Across 801 agent runs it had stored **one**
> memory. Read the header comment in `agent-memory.ts` before changing anything here — the
> failure mode was total and completely silent.

### Database Schema

`agent_memories` is keyed by UUID, references `auth.users(id)` for `user_id`, and carries
`workspace_id`, `agent_id`, `memory_type` (`preference | fact | context | relationship`),
`content`, optional `conversation_id`, `metadata`, and `created_at`. The #233 columns:

| Column | Purpose |
|---|---|
| `embedding halfvec(1024)` / `embedding_model` | voyage-4 text space (same as `products.text_embedding_1024`). **NULL means NO VECTOR** — the row drops to the recency fallback. Never store a vector from another model here. |
| `provenance jsonb` | Why the memory exists: `{source, model, reason, turn_excerpt, promoted_at, restated_count, last_recall}`. |
| `superseded_by` / `superseded_at` | Conflict resolution. A contradicting memory supersedes rather than deletes; live memories are `superseded_by IS NULL`. |
| `expires_at` | Decay. Non-durable (episodic) memories expire after 30 days; stated preferences do not. Expired rows are excluded from recall but kept as history. |
| `recall_count` / `last_recalled_at` | Traces. Answers "has this memory ever actually fired into a prompt?" |
| `content_hash` (generated) | Backs the partial unique index `agent_memories_live_content_uniq` — one live row per identical fact. |

### Memory Types

| Type | Description | Example |
|------|-------------|---------|
| `preference` | Stated taste or working style — **pinned**, always recalled | "Prefers matte over polished finishes" |
| `fact` | Stable truth about the user or their business | "Sells to Greek architects" |
| `context` | Episodic note about work in progress (usually non-durable) | "Working on the Kolonaki hotel lobby" |
| `relationship` | A company/person/supplier they deal with | "Buys through Ceramica SA" |

### The three verbs

Promotion, matching and recall-tracing are SQL RPCs, so each is one atomic round trip:

- **`promote_agent_memory(...)`** — insert-or-refresh *plus* supersede in one statement. Restating an identical fact refreshes the existing row (`restated_count++`) instead of stacking a duplicate. The supersede update is scoped to the caller's user + workspace, so a model-hallucinated id can never reach another tenant.
- **`match_agent_memories(...)`** — three tiers, each labelled in `match_reason`: `pinned_type` (durable types, always in context), `semantic` (cosine over the turn's embedding), `recency_fallback` (**only** when semantic returns nothing — no query vector, or nothing embedded yet).
- **`record_agent_memory_recall(ids, conversation_id)`** — bumps `recall_count` / `last_recalled_at`.

All three are `SECURITY INVOKER` and granted to `service_role` only; agent-chat calls them
having already derived `user_id`/`workspace_id` from the verified JWT.

### The promotion gate

After each turn `AgentMemory.promote()` runs asynchronously. It sends the turn — fenced in
`<conversation>` markers as DATA, never as instructions — plus the user's existing memories
to Claude Haiku with **forced `tool_use`** (`tools: [record_memories]` + `tool_choice`), so
the verdict that drives the DB write can never come from a salvage parser. The model may
return an empty list (the common case), create memories, or supersede an existing one it
contradicts. `normalizeCandidates()` then narrows the output before it reaches SQL: unknown
types collapse to `context`, over/undersized content is dropped, the batch is deduped and
capped at 5, and a `supersedes_id` that was not in the list shown to the model is discarded.

The distiller's tokens are billed through the same `log_agent_usage` path as the turn that
produced them (agent type `<agentId>:memory`) — one billing derivation, not a second one.

### Watching it

Three `ops.silent_zero` probes read this system's **output**, because everything here fails
quietly: `agent_memory_never_promoted` (turns happened, nothing was stored),
`agent_memory_never_embedded` (recall has silently degraded to recency),
`agent_memory_never_recalled` (memories exist but none has ever reached a prompt).
Guard test: [tests/unit/agentMemory.test.ts](../tests/unit/agentMemory.test.ts).

---

## Execution Flow

The `executeAgent` function orchestrates the full agent lifecycle:

1. Load agent configuration from `AGENT_CONFIGS[agentId]` and fetch the system prompt.
2. Recall the memories relevant to **this turn** (`AgentMemory.recall(..., userInput)`) and append them to the system prompt, fenced in `<recalled_memory>` markers as data.
3. Generate a thread ID from `agentId` and `conversationId` (or a new UUID).
4. Create the agent graph with `createAgentGraph(selectedModel, tools, onChunk)`.
5. Build the initial state with the user's input as a `HumanMessage`, the enriched system prompt, and zeroed counters.
6. Invoke the graph and obtain the final state.
7. Persist the final state to the checkpointer using the thread ID.
8. Kick off the promotion gate (`promoteTurnToMemory` → `AgentMemory.promote`) asynchronously.
9. Return the final response text, tool results, collected products, generation job reference, token usage totals, turn count, and thread ID.

---

## Streaming Updates

The `onChunk` callback is invoked at multiple points during execution to provide real-time progress to the client:

- **iteration** — Sent at the start of each agent iteration, with the current iteration number, max iterations, and a status message.
- **assistant_thinking** — Sent after the LLM responds, includes the response content and whether tool calls are present.
- **tool_call** — Sent before each tool is executed, includes the tool name, arguments, and a status message.
- **tool_result** — Sent after each tool completes, includes the tool name, result, and a completion message.
- **text** — Sent for the final text response content.

---

## Human-in-the-Loop (Planned)

For critical actions like 3D generation or large purchases, a future `shouldRequireApproval` conditional edge is planned. It would inspect the last message's tool calls for critical tool names (e.g., `generate3D`, `createQuote`, `submitOrder`) and route to a `human_approval` node instead of continuing directly to `tools`.

---

## Dependencies

The edge function's `deno.json` imports include:
- `@langchain/anthropic` — Anthropic LLM integration
- `@langchain/core/tools` — Tool base classes
- `@langchain/core/messages` — Message types (HumanMessage, etc.)
- `@langchain/langgraph` — StateGraph, START, END, Annotation
- `zod` — Schema validation for tool inputs
- `@supabase/supabase-js@2` — Supabase client

---

## Token Usage Tracking

Token usage is accumulated across all iterations using the sum reducers on `inputTokens` and `outputTokens`. In each `agentNode` invocation, the function reads `response.response_metadata?.usage` to extract `input_tokens` and `output_tokens`, then returns them as part of the state update. Because the reducers sum values across iterations, the final state contains the total tokens used for the entire conversation turn. The total is computed as `finalState.inputTokens + finalState.outputTokens`.

---

## Best Practices

### State Design
- Use append reducers for accumulating data
- Use replace reducers for single values
- Keep state serializable for checkpointing

### Graph Structure
- Keep nodes focused on single responsibilities
- Use conditional edges for branching logic
- Limit iterations to prevent infinite loops

### Memory Management
- Let the promotion gate decide what is notable — do not add a rule-based shortcut beside it
- Never re-read `agent_memories` directly; go through `match_agent_memories`
- Decay is `expires_at`, set by the gate. Expired rows are filtered out of recall, not deleted

### Performance
- Stream updates for responsive UX
- Use async memory extraction (non-blocking)
- Cache frequently accessed data

---

## Troubleshooting

### State Not Persisting
1. Check `agent_checkpoints` table permissions
2. Verify thread ID is consistent
3. Check checkpoint data serialization

### Memory Not Loading
1. Check `user_id` / `workspace_id` / `agent_id` match — memories are scoped to all three
2. `select count(*) from agent_memories where superseded_by is null` — nothing stored means the *gate* is broken, not the read
3. `select count(*) filter (where embedding is null) from agent_memories` — unembedded rows can only be reached by the recency fallback
4. Agent-chat logs `🧠 Recalled N memories … (M via recency fallback)` per turn; the fallback count is the signal that embedding is failing
5. `select * from dic_detect__ops_silent_zero()` — the three `agent_memory_*` probes say which half is dead

### Graph Stuck in Loop
1. Check `maxIterations` limit
2. Verify `shouldContinue` logic
3. Review tool call responses

### Token Counts Wrong
1. Ensure reducers are sum type
2. Check response_metadata parsing
3. Verify all iterations counted

---

## Related Documentation

- [Agent System Architecture](agent-system.md) - High-level agent overview
- [API: Agent Chat](api/agent-chat-api.md) - API reference
- [AI Models Guide](ai-models-guide.md) - Model configurations

---

**Last Updated**: January 31, 2026
**Version**: 1.0.0
**Status**: Production
**Maintainer**: Development Team
