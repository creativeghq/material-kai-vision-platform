/**
 * Background-result primitive (rail-4 async) — the ONE sanctioned way an async / delegated
 * agent task reports completion back into the originating chat.
 */

export interface BackgroundResultInput {
  conversationId: string;
  /** Markdown body shown in chat. */
  content: string;
  /** Originating run/job id (audit + dedupe). */
  runId?: string;
  /** Short preview of the task prompt (chat subheader). */
  taskPreview?: string;
  /** Optional structured payload → renders as an AgentResultCard (title + data + resultType). */
  resultData?: { title: string; data: Record<string, unknown>; resultType?: string };
  /** Bump the conversation's last_message_at so it floats to the top of the list (default true). */
  touchConversation?: boolean;
}

// deno-lint-ignore no-explicit-any
export async function emitBackgroundResult(supabase: any, input: BackgroundResultInput): Promise<void> {
  const { conversationId, content, runId, taskPreview, resultData, touchConversation = true } = input;
  if (!conversationId) return;
  try {
    await supabase.from('agent_chat_messages').insert({
      conversation_id: conversationId,
      role: 'assistant',
      content,
      metadata: {
        background_task: true,
        ...(runId ? { run_id: runId } : {}),
        ...(taskPreview ? { task_preview: taskPreview } : {}),
        ...(resultData ? { agentResultData: resultData } : {}),
      },
    });
    if (touchConversation) {
      await supabase
        .from('agent_chat_conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId);
    }
  } catch (e) {
    console.error('[emitBackgroundResult] failed (non-fatal):', (e as Error)?.message);
  }
}
