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
  /** An unattended Inbox auto-reply, which may hand the thread to a person. */
  autoReply?: boolean;
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
      ...(turn.autoReply ? { inbox_auto_reply: true } : {}),
      conversation_id: null,
    }),
  });
  if (!resp.ok) return { ok: false, status: resp.status, error: (await resp.text()).slice(0, 300) };
  const final = readFinalResult(await resp.text());
  if (final.failed) return { ok: false, status: 503, error: final.text.slice(0, 300) || 'agent-chat returned no final result' };
  return { ok: true, text: final.text };
}

/**
 * The final answer in agent-chat's NDJSON stream. A failed turn still streams 200 with its
 * operator-facing error as `text` ("the provider account is out of credit"), so `failed` must be
 * checked before the text is ever used as a reply to anyone.
 */
export function readFinalResult(raw: string): { text: string; failed: boolean } {
  let text = '';
  let failed = true;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const chunk = JSON.parse(trimmed) as { type?: string; text?: string; failed?: boolean; error?: boolean };
      if (chunk.type === 'final_result') {
        text = String(chunk.text || '');
        failed = chunk.failed === true || chunk.error === true;
      }
    } catch {
      continue;
    }
  }
  // No final_result at all is a cut stream, not a considered silence.
  return { text: text.trim(), failed };
}
