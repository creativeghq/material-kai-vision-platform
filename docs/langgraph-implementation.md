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

The state schema defines what data flows through the graph:

```typescript
const AgentStateAnnotation = Annotation.Root({
  // Messages with append reducer (accumulates all messages)
  messages: Annotation<BaseMessage[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),

  // System prompt (replace reducer)
  systemPrompt: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  // Tool results collected during execution
  toolResults: Annotation<any[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),

  // Products found during search/recommendations
  collectedProducts: Annotation<any[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),

  // Current iteration count
  iteration: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),

  // Token usage tracking (sum reducers)
  inputTokens: Annotation<number>({
    reducer: (prev, next) => prev + next,
    default: () => 0,
  }),
  outputTokens: Annotation<number>({
    reducer: (prev, next) => prev + next,
    default: () => 0,
  }),

  // Turn count for billing
  turnCount: Annotation<number>({
    reducer: (prev, next) => prev + next,
    default: () => 0,
  }),

  // Final response when agent completes
  finalResponse: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // 3D generation job if triggered
  generationJob: Annotation<any | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
});
```

### Reducer Types

| Reducer | Behavior | Use Case |
|---------|----------|----------|
| Append | `[...prev, ...next]` | Accumulating messages, results |
| Replace | `(_, next) => next` | Single values like systemPrompt |
| Sum | `prev + next` | Token counts, turn counts |

---

## Graph Construction

```typescript
function createAgentGraph(
  model: any,
  tools: any[],
  onChunk?: (chunk: any) => void
) {
  const maxIterations = 10;

  // Build the graph
  const graph = new StateGraph(AgentStateAnnotation)
    .addNode('agent', agentNode)
    .addNode('tools', toolsNode)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', shouldContinue)
    .addEdge('tools', 'agent')
    .compile();

  return graph;
}
```

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

```typescript
function shouldContinue(state: AgentState): string {
  const lastMessage = state.messages[state.messages.length - 1];

  // Check iteration limit
  if (state.iteration >= maxIterations) {
    return END;
  }

  // Check for tool calls
  if (lastMessage.tool_calls?.length > 0) {
    return 'tools';
  }

  // No tool calls = done
  return END;
}
```

---

## Checkpointing (SupabaseCheckpointer)

Enables resumable conversations by persisting state to Supabase.

### Database Schema

```sql
CREATE TABLE public.agent_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id TEXT NOT NULL UNIQUE,
  checkpoint_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_checkpoints_thread ON agent_checkpoints(thread_id);
```

### Checkpointer Class

```typescript
class SupabaseCheckpointer {
  private tableName = 'agent_checkpoints';

  async get(threadId: string): Promise<any | null> {
    const { data } = await supabase
      .from(this.tableName)
      .select('checkpoint_data')
      .eq('thread_id', threadId)
      .single();
    return data?.checkpoint_data || null;
  }

  async put(threadId: string, checkpoint: any): Promise<void> {
    await supabase
      .from(this.tableName)
      .upsert({
        thread_id: threadId,
        checkpoint_data: checkpoint,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'thread_id' });
  }

  async delete(threadId: string): Promise<void> {
    await supabase
      .from(this.tableName)
      .delete()
      .eq('thread_id', threadId);
  }
}
```

### Thread ID Generation

```typescript
// Generate unique thread ID for conversation tracking
const threadId = conversationId
  ? `${agentId}-${conversationId}`
  : `${agentId}-${crypto.randomUUID()}`;
```

---

## Long-Term Memory

Stores user preferences, facts, and context across conversations.

### Database Schema

```sql
CREATE TABLE public.agent_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  memory_type TEXT NOT NULL
    CHECK (memory_type IN ('preference', 'fact', 'context', 'relationship')),
  content TEXT NOT NULL,
  conversation_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_memories_user ON agent_memories(user_id, workspace_id);
CREATE INDEX idx_memories_type ON agent_memories(memory_type);
CREATE INDEX idx_memories_agent ON agent_memories(agent_id);
```

### Memory Types

| Type | Description | Example |
|------|-------------|---------|
| `preference` | User preferences | "Prefers modern minimalist style" |
| `fact` | Factual information | "Working on hotel lobby project" |
| `context` | Conversational context | "Previously discussed marble flooring" |
| `relationship` | Entity relationships | "Client is ABC Corp" |

### LongTermMemory Class

```typescript
class LongTermMemory {
  async store(
    userId: string,
    workspaceId: string,
    memory: {
      agentId: string;
      type: 'preference' | 'fact' | 'context' | 'relationship';
      content: string;
      conversationId?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    await supabase.from('agent_memories').insert({
      user_id: userId,
      workspace_id: workspaceId,
      agent_id: memory.agentId,
      memory_type: memory.type,
      content: memory.content,
      conversation_id: memory.conversationId,
      metadata: memory.metadata || {},
    });
  }

  async retrieve(
    userId: string,
    workspaceId: string,
    options?: {
      agentId?: string;
      types?: string[];
      limit?: number;
    }
  ): Promise<any[]> {
    let query = supabase
      .from('agent_memories')
      .select('*')
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(options?.limit || 20);

    if (options?.agentId) {
      query = query.eq('agent_id', options.agentId);
    }
    if (options?.types?.length) {
      query = query.in('memory_type', options.types);
    }

    const { data } = await query;
    return data || [];
  }

  formatForContext(memories: any[]): string {
    if (!memories.length) return '';

    const grouped = memories.reduce((acc, m) => {
      if (!acc[m.memory_type]) acc[m.memory_type] = [];
      acc[m.memory_type].push(m.content);
      return acc;
    }, {} as Record<string, string[]>);

    let context = '\n\n## User Context from Previous Conversations:\n';

    if (grouped.preference?.length) {
      context += '\n### Preferences:\n';
      grouped.preference.forEach(p => { context += `- ${p}\n`; });
    }
    if (grouped.fact?.length) {
      context += '\n### Known Facts:\n';
      grouped.fact.forEach(f => { context += `- ${f}\n`; });
    }
    if (grouped.context?.length) {
      context += '\n### Previous Context:\n';
      grouped.context.forEach(c => { context += `- ${c}\n`; });
    }

    return context;
  }
}
```

### Automatic Memory Extraction

```typescript
async function extractAndStoreMemories(
  userId: string,
  workspaceId: string,
  agentId: string,
  userInput: string,
  assistantResponse: string,
  toolResults: any[]
): Promise<void> {
  // Use LLM to extract memories from conversation
  const extractionPrompt = `
    Analyze this conversation and extract any memorable information.
    Return JSON array of objects with 'type' and 'content' fields.
    Types: preference, fact, context, relationship

    User: ${userInput}
    Assistant: ${assistantResponse}

    Only extract truly notable information. Return empty array if nothing notable.
  `;

  // Extract and store memories asynchronously
  // (implementation details in index.ts)
}
```

---

## Execution Flow

```typescript
async function executeAgent(
  agentId: string,
  userInput: string,
  conversationId?: string,
  previousMessages?: any[],
  user?: any,
  workspaceId?: string,
  onChunk?: (chunk: any) => void
) {
  // 1. Load agent configuration
  const config = AGENT_CONFIGS[agentId];
  const systemPrompt = await getAgentSystemPrompt(agentId);

  // 2. Load long-term memory
  const memories = await longTermMemory.retrieve(user.id, workspaceId, {
    agentId,
    limit: 20,
  });
  const memoryContext = longTermMemory.formatForContext(memories);
  const enrichedPrompt = systemPrompt + memoryContext;

  // 3. Generate thread ID
  const threadId = conversationId
    ? `${agentId}-${conversationId}`
    : `${agentId}-${crypto.randomUUID()}`;

  // 4. Create agent graph
  const agentGraph = createAgentGraph(selectedModel, tools, onChunk);

  // 5. Build initial state
  const initialState = {
    messages: [new HumanMessage(userInput)],
    systemPrompt: enrichedPrompt,
    toolResults: [],
    collectedProducts: [],
    iteration: 0,
    inputTokens: 0,
    outputTokens: 0,
    turnCount: 0,
    finalResponse: null,
    generationJob: null,
  };

  // 6. Execute graph
  const finalState = await agentGraph.invoke(initialState);

  // 7. Save checkpoint
  await checkpointer.put(threadId, finalState);

  // 8. Extract and store memories (async, non-blocking)
  extractAndStoreMemories(
    user.id,
    workspaceId,
    agentId,
    userInput,
    finalState.finalResponse,
    finalState.toolResults
  ).catch(console.error);

  // 9. Return result
  return {
    text: finalState.finalResponse,
    toolResults: finalState.toolResults,
    products: finalState.collectedProducts,
    generationJob: finalState.generationJob,
    tokenUsage: {
      input: finalState.inputTokens,
      output: finalState.outputTokens,
    },
    turnCount: finalState.turnCount,
    threadId,
  };
}
```

---

## Streaming Updates

The `onChunk` callback sends real-time updates during execution:

```typescript
// Iteration status
onChunk?.({
  type: 'iteration',
  iteration: 3,
  maxIterations: 10,
  message: 'Processing step 3/10...'
});

// Assistant thinking
onChunk?.({
  type: 'assistant_thinking',
  content: response.content,
  hasToolCalls: true
});

// Tool call
onChunk?.({
  type: 'tool_call',
  tool: 'searchProducts',
  args: { query: 'marble tiles' },
  message: 'Calling searchProducts...'
});

// Tool result
onChunk?.({
  type: 'tool_result',
  tool: 'searchProducts',
  result: { products: [...] },
  message: 'searchProducts completed'
});

// Final text (streaming)
onChunk?.({
  type: 'text',
  content: 'Based on your requirements...'
});
```

---

## Human-in-the-Loop (Planned)

For critical actions like 3D generation or large purchases:

```typescript
// Future implementation
function shouldRequireApproval(state: AgentState): string {
  const lastMessage = state.messages[state.messages.length - 1];

  // Check if about to execute critical action
  const criticalTools = ['generate3D', 'createQuote', 'submitOrder'];
  const hasCriticalCall = lastMessage.tool_calls?.some(
    tc => criticalTools.includes(tc.name)
  );

  if (hasCriticalCall) {
    return 'human_approval';  // Route to approval node
  }

  return 'tools';  // Continue normally
}
```

---

## Dependencies

```json
// deno.json
{
  "imports": {
    "@langchain/anthropic": "npm:@langchain/anthropic",
    "@langchain/core/tools": "npm:@langchain/core/tools",
    "@langchain/core/messages": "npm:@langchain/core/messages",
    "@langchain/langgraph": "npm:@langchain/langgraph",
    "zod": "npm:zod",
    "@supabase/supabase-js": "npm:@supabase/supabase-js@2"
  }
}
```

---

## Token Usage Tracking

Token usage is accumulated across all iterations:

```typescript
// In agentNode
const usage = response.response_metadata?.usage;
const inputTokens = usage?.input_tokens || 0;
const outputTokens = usage?.output_tokens || 0;

return {
  // ... other state
  inputTokens,   // Will be summed by reducer
  outputTokens,  // Will be summed by reducer
};
```

Total usage available in final state:
```typescript
const totalTokens = {
  input: finalState.inputTokens,
  output: finalState.outputTokens,
  total: finalState.inputTokens + finalState.outputTokens,
};
```

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
