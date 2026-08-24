/**
 * Guard: the AI answers a customer only when a person asked it to, and never on an import.
 *
 * On 2026-08-24 a WhatsApp number was connected in coexistence mode and its existing chats were
 * back-filled. The assistant introduced itself into 8 real conversations and sent 22 replies —
 * to the operator's own suppliers, in threads where the operator was the CUSTOMER. Two defects,
 * each harmless alone:
 *
 *  1. `cfg.auto_respond !== false` — written out by hand in FOUR files. An opt-OUT: the workspace
 *     had `settings.inbox_agent` NULL, had never been asked, and got an AI on its customers.
 *  2. The back-fill replays history through the LIVE webhook path (on purpose — one importer),
 *     so an import is indistinguishable from N customers writing in at once.
 *
 * Nothing failed. Every insert succeeded, every webhook returned 200, the toast was green. The
 * only reason it stayed bounded is that Meta refused delivery on all 22 for being outside the
 * 24-hour service window — i.e. luck, not design.
 *
 * These assertions are cheap and the failure they prevent is not recoverable: a message sent to
 * a customer cannot be unsent.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
// Three of the files below explain the old `auto_respond !== false` shape in prose, and a guard
// that fires on the sentence DESCRIBING the bug is a guard people delete. So these assertions
// read code, not comments — through the one shared stripper, never a local copy of one.
import { stripComments } from '../helpers/stripComments';

const FN_ROOT = join(__dirname, '..', '..', 'supabase', 'functions');
const read = (...p: string[]) => readFileSync(join(FN_ROOT, ...p), 'utf8');

const autopilot = read('_shared', 'inbox-autopilot.ts');
const zernioHook = read('zernio-webhook-handler', 'index.ts');
const messagingApi = read('messaging-api', 'index.ts');
const inboxApi = read('inbox-api', 'index.ts');
const inboundEmail = read('_shared', 'inbound-email.ts');

/** Every .ts under supabase/functions, minus vendored deps. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('inbox autopilot is opt-in', () => {
  it('defaults to OFF, and says so in code rather than in a comment', () => {
    expect(autopilot).toMatch(/auto_respond === true/);
    expect(
      /auto_respond\s*!==\s*false/.test(stripComments(autopilot)),
      'the shared resolver went back to opt-out: an unset setting would again mean "yes, answer my customers"',
    ).toBe(false);
  });

  it('has no second copy of the question anywhere in the edge tree', () => {
    // Four hand-written copies is how it shipped. A fifth would not have to be wrong to be a
    // bug — it only has to disagree with the other four about a workspace that never answered.
    const offenders: string[] = [];
    for (const file of walk(FN_ROOT)) {
      if (file.endsWith(join('_shared', 'inbox-autopilot.ts'))) continue;
      const src = readFileSync(file, 'utf8');
      if (/auto_respond\s*!==\s*false/.test(stripComments(src))) {
        offenders.push(file.slice(FN_ROOT.length + 1).split('\\').join('/'));
      }
    }
    expect(
      offenders,
      `these read the auto-respond setting themselves, with the opt-OUT default: ${offenders.join(', ')}. ` +
        'Call inboxAutopilotSettings / shouldAutoEngageAgent instead.',
    ).toEqual([]);
  });

  it('routes every inbound channel through the shared resolver', () => {
    // WhatsApp and social DM both create threads in the zernio handler; email creates its own.
    // A channel that resolves it locally is a channel where the default can drift back.
    expect(zernioHook).toContain("from '../_shared/inbox-autopilot.ts'");
    expect(inboundEmail).toContain("from './inbox-autopilot.ts'");
    expect(inboxApi).toContain("from '../_shared/inbox-autopilot.ts'");

    // Two thread-creating sites in the zernio handler — WhatsApp, and the social DM path.
    const calls = zernioHook.match(/shouldAutoEngageAgent\(/g) ?? [];
    expect(
      calls.length,
      'a thread-creating path in zernio-webhook-handler stopped asking the shared resolver',
    ).toBeGreaterThanOrEqual(2);
  });
});

describe('an import is not an event', () => {
  it('marks the replayed messages as history', () => {
    // Without this the handler cannot tell a back-fill from a customer, because by design it is
    // the same request shape arriving at the same endpoint.
    expect(
      /backfill:\s*true/.test(messagingApi),
      'the back-fill no longer marks its replay — every imported message becomes a live inbound ' +
        'message again, with the assistant answering each one',
    ).toBe(true);
  });

  it('honours the marker, and never auto-engages on it whatever the workspace wants', () => {
    expect(zernioHook).toMatch(/const historical = payload\.backfill === true/);
    // The override lives in the resolver, so it holds for every caller rather than per call site.
    expect(autopilot).toMatch(/if \(ctx\.historical\) return false/);
  });

  it('returns before the agent reply when the message is history', () => {
    // Order matters and is the whole guarantee: the `historical` early-return has to come BEFORE
    // the internal_agent_reply fetch, or the assistant answers imported history regardless.
    const earlyReturn = zernioHook.indexOf("reason: 'imported (no notification, no agent reply)'");
    const agentCall = zernioHook.indexOf("action: 'internal_agent_reply'");
    expect(earlyReturn, 'the historical early-return is gone from the inbound handler').toBeGreaterThan(-1);
    expect(agentCall, 'the agent-reply call moved or was renamed — re-check this guard').toBeGreaterThan(-1);
    expect(
      earlyReturn < agentCall,
      'the agent-reply call is now reachable on an imported message',
    ).toBe(true);
  });

  it('files an already-known message once, so a re-import is safe to run', () => {
    // Re-running is the NORMAL way to use the back-fill: Meta hands coexistence history over
    // asynchronously (19% complete on the first run, which is why it found 8 conversations), so
    // "run it again later" has to be non-destructive or the feature cannot be used at all.
    expect(zernioHook).toMatch(/already imported/);
    expect(zernioHook).toMatch(/findInboxMessageByProviderId\(supabase, msg\)/);
    // The index is the backstop under a race; the pre-check is the normal path.
    expect(zernioHook).toMatch(/'23505'/);
  });
});
