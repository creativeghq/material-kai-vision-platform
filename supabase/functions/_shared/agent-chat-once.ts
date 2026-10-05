/** One JARVIS turn over untrusted conversation text, for a server-side caller (Inbox, Gmail). */

export interface AgentTurn {
  workspaceId: string;
  /** Billed and attributed in agent_usage_logs; agent-chat refuses with 402 up front when they cannot pay. */
  userId: string | null;
  /** The conversation as DATA. agent-chat fences it because the audience is `customer`. */
  transcript: string;
  /** The operator's side of the turn, appended after the fence. */
  operatorInstruction?: string;
  threadId?: string | null;
  agentId?: string;
}

export type AgentTurnResult = { ok: true; text: string } | { ok: false; status: number; error: string };

export async function runAgentTurn(turn: AgentTurn): Promise<AgentTurnResult> {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const resp = await fetch(`${url}/functions/v1/agent-chat`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentId: turn.agentId ?? 'kai',
      audience: 'customer',
      thread_id: turn.threadId ?? null,
      workspace_id: turn.workspaceId,
      user_id: turn.userId,
      messages: [{ role: 'user', content: turn.transcript }],
      ...(turn.operatorInstruction ? { operator_instruction: turn.operatorInstruction } : {}),
      conversation_id: null,
    }),
  });
  if (!resp.ok) return { ok: false, status: resp.status, error: (await resp.text()).slice(0, 300) };
  return { ok: true, text: readFinalText(await resp.text()) };
}

/** The final answer in agent-chat's NDJSON stream; empty when the turn produced none. */
export function readFinalText(raw: string): string {
  let text = '';
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const chunk = JSON.parse(trimmed) as { type?: string; text?: string };
      if (chunk.type === 'final_result') text = String(chunk.text || '');
    } catch {
      continue;
    }
  }
  return text.trim();
}
