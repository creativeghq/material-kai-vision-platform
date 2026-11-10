
export type AgentTurnStatus =
  | 'ok' | 'error' | 'refused' | 'max_tokens' | 'empty' | 'invalid_tool_call' | 'cancelled';

export interface AgentTurnStart {
  id: string;
  conversationId: string | null;
  userId: string | null;
  workspaceId: string | null;
  requestedAgent: string;
  audience: string;
  isEval: boolean;
  directTool: string | null;
  toolkits: string[] | null;
}

export interface AgentTurnFinish {
  status: AgentTurnStatus;
  agent?: string | null;
  model?: string | null;
  failureCode?: string | null;
  error?: string | null;
  toolCalls?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cacheReadTokens?: number | null;
  cacheWriteTokens?: number | null;
}

export class AgentTurnObserver {
  private readonly startedAt = Date.now();
  private firstOutputAt: number | null = null;
  iterations = 0;
  stopReason: string | null = null;
  invalidToolCalls = 0;
  lastReplyEmpty = false;

  observe(chunk: any): void {
    if (!chunk?.type) return;
    if (this.firstOutputAt === null && (chunk.type === 'text_delta' || chunk.type === 'tool_call')) {
      this.firstOutputAt = Date.now();
    }
    if (chunk.type === 'assistant_thinking') {
      this.iterations = Math.max(this.iterations, Number(chunk.iteration) || this.iterations + 1);
      if (typeof chunk.stopReason === 'string') this.stopReason = chunk.stopReason;
      if (typeof chunk.invalidToolCalls === 'number') this.invalidToolCalls += chunk.invalidToolCalls;
      this.lastReplyEmpty = !chunk.hasToolCalls && !String(chunk.content ?? '').trim();
    }
  }

  get ttftMs(): number | null {
    return this.firstOutputAt === null ? null : this.firstOutputAt - this.startedAt;
  }

  get elapsedMs(): number {
    return Date.now() - this.startedAt;
  }

  statusForCompletedTurn(failed: boolean): AgentTurnStatus {
    if (failed) return 'error';
    if (this.stopReason === 'refusal') return 'refused';
    if (this.lastReplyEmpty && this.invalidToolCalls > 0) return 'invalid_tool_call';
    if (this.stopReason === 'max_tokens') return 'max_tokens';
    if (this.lastReplyEmpty) return 'empty';
    return 'ok';
  }
}

export async function openAgentTurn(supabase: any, t: AgentTurnStart): Promise<void> {
  try {
    const { error } = await supabase.from('agent_turns').insert({
      id: t.id,
      conversation_id: t.conversationId,
      user_id: t.userId,
      workspace_id: t.workspaceId,
      requested_agent: t.requestedAgent,
      audience: t.audience,
      is_eval: t.isEval,
      direct_tool: t.directTool,
      toolkits: t.toolkits,
      status: 'running',
    });
    if (error) console.warn('[agent-turns] open failed:', error.message);
  } catch (e) {
    console.warn('[agent-turns] open threw:', (e as Error)?.message);
  }
}

export async function closeAgentTurn(
  supabase: any,
  opened: Promise<void>,
  id: string,
  observer: AgentTurnObserver,
  f: AgentTurnFinish,
): Promise<void> {
  await opened;
  try {
    const { error } = await supabase.from('agent_turns').update({
      status: f.status,
      agent: f.agent ?? null,
      model: f.model ?? null,
      stop_reason: observer.stopReason,
      failure_code: f.failureCode ?? null,
      error: f.error ? f.error.slice(0, 2000) : null,
      iterations: observer.iterations || null,
      tool_calls: f.toolCalls ?? null,
      invalid_tool_calls: observer.invalidToolCalls || null,
      ttft_ms: observer.ttftMs,
      total_ms: observer.elapsedMs,
      input_tokens: f.inputTokens ?? null,
      output_tokens: f.outputTokens ?? null,
      cache_read_tokens: f.cacheReadTokens ?? null,
      cache_write_tokens: f.cacheWriteTokens ?? null,
      completed_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) console.warn('[agent-turns] close failed:', error.message);
  } catch (e) {
    console.warn('[agent-turns] close threw:', (e as Error)?.message);
  }
}
