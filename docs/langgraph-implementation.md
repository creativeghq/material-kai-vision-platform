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

```
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
```

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

Stores user preferences, facts, and context across conversations.

### Database Schema

The `agent_memories` table has a UUID primary key, foreign key references to `auth.users(id)` for `user_id`, a `workspace_id` UUID, an `agent_id` text field, a `memory_type` text field constrained to `('preference', 'fact', 'context', 'relationship')`, a `content` text field, an optional `conversation_id` UUID, a `metadata` JSONB field, and a `created_at` timestamp. Indexes cover `(user_id, workspace_id)`, `memory_type`, and `agent_id`.

### Memory Types

| Type | Description | Example |
|------|-------------|---------|
| `preference` | User preferences | "Prefers modern minimalist style" |
| `fact` | Factual information | "Working on hotel lobby project" |
| `context` | Conversational context | "Previously discussed marble flooring" |
| `relationship` | Entity relationships | "Client is ABC Corp" |

### LongTermMemory Class

The `LongTermMemory` class provides three methods:

- **store(userId, workspaceId, memory)** — Inserts a record into `agent_memories` with the provided `agentId`, `type`, `content`, optional `conversationId`, and optional `metadata`.
- **retrieve(userId, workspaceId, options?)** — Queries `agent_memories` for the user and workspace, filtered by optional `agentId` and `types` array, ordered by `created_at` descending, limited to `options.limit` (default 20).
- **formatForContext(memories)** — Groups memories by type and formats them as a markdown context block with sections for Preferences, Known Facts, and Previous Context.

### Automatic Memory Extraction

After each agent turn, an `extractAndStoreMemories` function runs asynchronously (non-blocking). It constructs an extraction prompt with the user's input and the assistant's response, asks the LLM to identify notable information (preferences, facts, context, relationships), and stores any extracted memories. Only truly notable information is stored; the function returns an empty array if nothing is notable.

---

## Execution Flow

The `executeAgent` function orchestrates the full agent lifecycle:

1. Load agent configuration from `AGENT_CONFIGS[agentId]` and fetch the system prompt.
2. Retrieve long-term memories (limit 20) and append a formatted context block to the system prompt.
3. Generate a thread ID from `agentId` and `conversationId` (or a new UUID).
4. Create the agent graph with `createAgentGraph(selectedModel, tools, onChunk)`.
5. Build the initial state with the user's input as a `HumanMessage`, the enriched system prompt, and zeroed counters.
6. Invoke the graph and obtain the final state.
7. Persist the final state to the checkpointer using the thread ID.
8. Kick off `extractAndStoreMemories` asynchronously (errors are silently caught).
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
- Store only notable information
- Use specific memory types for categorization
- Clean up old memories periodically

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
1. Verify `agent_memories` table exists
2. Check user_id and workspace_id match
3. Review memory type filters

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
