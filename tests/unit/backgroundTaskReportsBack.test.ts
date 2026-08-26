/**
 * A dispatched background task reports back to the CHAT it was dispatched from — on every way
 * it can end.
 *
 * THE FAILURE THIS PREVENTS
 * -------------------------
 * `dispatch_background_task` tells the user, in the chat, "I'll post the results back here in
 * this conversation". Three separate things had to be true for that sentence to be honest, and
 * only one of them was:
 *
 *   1. The run has to CARRY a conversation. It was stamped straight from the turn's
 *      `conversation_id`, so a dispatch that arrived without one (a direct API call, a probe)
 *      produced a full report reachable only through the admin monitoring list.
 *   2. The runner has to POST there. Only `result.success` did. A failed or cancelled run wrote
 *      `error_message` to a row and posted nothing.
 *   3. Somebody has to be TOLD. The runner's owner alert is guarded by
 *      `if (agentConfig.workspace_id)`, and the KAI system agent has `workspace_id` NULL **by
 *      design** — it serves every tenant — so that branch is unreachable for precisely the runs
 *      a person is sitting and waiting on. The completion trigger fired only on 'completed'.
 *
 * So a failed chat dispatch went quiet forever. Run `fa735825` died on a 500 in 491 ms and
 * produced zero notifications and zero messages; nothing raised, nothing logged that a human
 * reads, and the row said `failed` in an admin list nobody was looking at. Silent zero, in the
 * one place the user was actually watching.
 *
 * WHY A SOURCE SCAN
 * -----------------
 * Every defect here is a MISSING call on a branch. There is no wrong value to assert on — the
 * thing that regressed is a line that is not there, on a path that is only taken when something
 * else has already gone wrong. A behavioural test would have to provoke a runner failure against
 * a live Supabase to see it.
 *
 * BLIND SPOT: the notification itself is written by `fn_notify_agent_completed`, a plpgsql
 * trigger. A repo scan cannot see pg_proc, so the "notified on failure and cancellation" half is
 * held by the migration `notify_dispatcher_on_every_terminal_state` and was verified by
 * live-firing both branches inside a rolled-back DO block. If that trigger is narrowed back to
 * 'completed', nothing in this file will notice.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const root = process.cwd();
const read = (p: string) => stripComments(readFileSync(join(root, p), 'utf8'));

const RUNNER = 'supabase/functions/background-agent-runner/index.ts';
const DISPATCH = 'supabase/functions/_shared/tools/background-tools.ts';
const AGENT_CHAT = 'supabase/functions/agent-chat/index.ts';

describe('a chat dispatch always has a conversation to report into', () => {
  const src = read(DISPATCH);

  it('opens one when the turn did not supply it, instead of stamping null', () => {
    expect(src).toContain('ensureResultConversation');
    // The run is stamped with the RESOLVED conversation, never the raw parameter — that is the
    // whole point; `conversation_id: conversationId` is the defect.
    expect(src).toMatch(/conversation_id:\s*resultConversationId/);
    expect(src).not.toMatch(/conversation_id:\s*conversationId\b/);
  });

  it('creates it for the agent the user is talking to, not a hardcoded one', () => {
    expect(src).toMatch(/agent_id:\s*agentKey/);
    expect(read(AGENT_CHAT)).toMatch(/createDispatchBackgroundTaskTool\([^)]*agentId\)/);
  });

  it('does not claim the results will appear in a chat that was never opened', () => {
    // If the conversation could not be created, the acknowledgement has to say so — the whole
    // bug class here is a confident sentence about a destination that does not exist.
    const i = src.indexOf('Background task started');
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(Math.max(0, i - 400), i + 600)).toContain('resultConversationId');
  });
});

describe('the runner posts to that conversation on every terminal state', () => {
  const src = read(RUNNER);

  it('posts the report on success', () => {
    expect(src).toContain('postResultToChat(');
  });

  it('posts on failure and on cancellation, not only on success', () => {
    expect(src).toContain('postTerminalStateToChat');
    expect(src).toContain('Background task failed');
    expect(src).toContain('Background task cancelled');
  });

  it('reaches the chat on failure WITHOUT going through the workspace-owner branch', () => {
    // `if (agentConfig.workspace_id)` is false for every chat dispatch — the KAI system agent is
    // workspace-NULL on purpose. A failure notice nested inside it reaches nobody.
    const failIdx = src.indexOf("'Background task failed'");
    expect(failIdx).toBeGreaterThan(-1);
    const ownerIdx = src.indexOf('if (agentConfig.workspace_id)', failIdx - 3000);
    // The chat post must come BEFORE the owner-scoped block, at the top level of the catch.
    expect(ownerIdx === -1 || ownerIdx > failIdx).toBe(true);
  });

  it('reads the conversation off the RUN, not off the request body', () => {
    // The body is caller-supplied; `run.input_data` is what the dispatcher recorded. Trusting the
    // body here would post one tenant's report into another tenant's thread (#363 EE-9).
    // `await …(` so the function's own declaration is not read as a call site.
    const callSites = [...src.matchAll(/await postTerminalStateToChat\(\s*([A-Za-z0-9_]+)/g)];
    expect(callSites.length).toBeGreaterThanOrEqual(2);
    for (const m of callSites) {
      expect(['failedConversationId', 'cancelledConversationId']).toContain(m[1]);
    }
    expect(src).toMatch(/failedConversationId\s*=\s*\(run\.input_data as any\)\?\.conversation_id/);
    expect(src).toMatch(/cancelledConversationId\s*=\s*\(run\.input_data as any\)\?\.conversation_id/);
  });
});
