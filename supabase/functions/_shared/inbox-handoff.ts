/** The assistant handing an Inbox conversation to a person: pause it, say why, and tell someone. */

// Non-generic `tool` for the same edge-typecheck memory reason as customer-account-tools.ts.
const { tool } = await import('npm:@langchain/core@1.2.9/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  ) => any;
};
const { z } = await import('npm:zod@3.25.76');

import type { DbClient } from './supabase-client.ts';
import { emitFlowEvent, emitFlowEventToWorkspaceRoles } from './flow-events.ts';
import { HANDOFF_REASON_MAX, INBOX_HANDOFF_TOOL_NAME, type InboxHandoff } from './inbox-conversation.ts';

export interface InboxHandoffScope {
  workspaceId: string;
  /** From the request's thread, never from anything the other party wrote. */
  threadId: string;
}

/** Pauses the thread so the next message is not answered with another "a colleague will follow up". */
export async function recordInboxHandoff(
  db: DbClient,
  scope: InboxHandoffScope,
  handoff: InboxHandoff,
): Promise<{ recorded: boolean; note: string }> {
  const reason = handoff.reason.replace(/\s+/g, ' ').trim().slice(0, HANDOFF_REASON_MAX) || 'Needs a person.';

  const { data: claimed, error: claimErr } = await db.from('inbox_threads')
    .update({ agent_state: 'paused' })
    .eq('id', scope.threadId).eq('workspace_id', scope.workspaceId).eq('agent_state', 'active')
    .select('id');
  if (claimErr) return { recorded: false, note: `Could not hand over: ${claimErr.message}` };
  if (!(claimed as unknown[] | null)?.length) {
    return { recorded: false, note: 'This conversation is already with the team.' };
  }

  // If this row is lost the thread is still paused, and inbox-api sends nothing from a paused thread.
  const { error: noteErr } = await db.from('inbox_messages').insert({
    thread_id: scope.threadId,
    message_type: 'system',
    body: `The assistant handed this conversation to the team: ${reason}`,
    metadata: { agent_handoff: { reason, send_reply: handoff.send_reply } },
  });
  if (noteErr) console.error('[inbox-handoff] handoff note not recorded:', noteErr.message);

  const { data: members } = await db.from('inbox_participants')
    .select('user_id')
    .eq('thread_id', scope.threadId).eq('participant_type', 'member').eq('status', 'active')
    .not('user_id', 'is', null);
  const userIds = [...new Set(((members || []) as Array<{ user_id: string }>).map((m) => m.user_id))];
  const payload = (uid: string) => ({
    user_id: uid,
    type: 'inbox_assigned',
    workspace_id: scope.workspaceId,
    thread_id: scope.threadId,
    title: 'The assistant handed you a conversation',
    body: reason,
    action_url: `/inbox?thread=${scope.threadId}`,
  });
  if (userIds.length) {
    await Promise.all(userIds.map((uid) => emitFlowEvent('inbox.thread_assigned', payload(uid)).catch(() => {})));
  } else {
    await emitFlowEventToWorkspaceRoles(scope.workspaceId, ['owner', 'admin'], 'inbox.thread_assigned', payload)
      .catch(() => {});
  }
  return { recorded: true, note: handoff.send_reply ? 'Handed to the team. Your reply will still be sent.' : 'Handed to the team. Nothing will be sent; write no reply.' };
}

export function createInboxHandoffTool(db: DbClient, scope: InboxHandoffScope): unknown {
  return tool(
    async (input: { reason: string; send_reply: boolean }) =>
      JSON.stringify(await recordInboxHandoff(db, scope, input)),
    {
      name: INBOX_HANDOFF_TOOL_NAME,
      description:
        'Hand this conversation to a person on the team: stops you answering it, and notifies them. '
        + 'Call it whenever you would otherwise say a colleague will follow up — saying it without '
        + 'calling this tool is a promise nobody is told about. Set send_reply=false when no reply '
        + 'from you is right at all (a personal or sensitive message, a dispute, a conversation our '
        + 'team started, a supplier offer that needs a decision, a sales pitch or wrong number).',
      schema: z.object({
        reason: z.string().max(HANDOFF_REASON_MAX)
          .describe('For the team, never shown to the other party: what they need and why a person must answer.'),
        send_reply: z.boolean()
          .describe('true = your reply text is still sent to them; false = send nothing.'),
      }),
    },
  );
}
