/**
 * ONE agent, TWO audiences — and the boundary between them holds.
 *
 * ── What this guards ────────────────────────────────────────────────────────────────────────
 * The Inbox no longer runs a small assistant of its own. A customer conversation runs JARVIS: the
 * same system prompt, the same operating doctrine, the same knowledge grounding, the same
 * reasoning. That is the product decision, and it is a good one — improving JARVIS improves every
 * customer conversation instead of improving one of two assistants.
 *
 * It is only safe because of the clamp. `AGENT_CONFIGS['kai'].tools` declares 166 tools including
 * `manage_finance`, `pay_expense`, `send_purchase_order`, `manage_crm`, `manage_hr` and
 * `manage_inbox`. The other party in an Inbox thread is a stranger typing free text into that
 * loop. Every assertion below exists because deleting the thing it checks would be invisible:
 * replies keep arriving, they are still polite, and a capability has quietly become reachable by
 * anyone with the business's WhatsApp number.
 *
 * ── Why source assertions ───────────────────────────────────────────────────────────────────
 * The clamp is a property of how the turn is ASSEMBLED, several hundred lines before any model
 * call, inside an edge function that cannot be imported into vitest (top-level `await import` of
 * npm specifiers, `Deno.env` at module scope). There is no return value that reveals whether
 * `load_toolkit` was bound. So this reads the source — the same technique
 * `toolkitCoverage.test.ts` uses on the same file, for the same reason.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
const code = (p: string) => stripComments(read(p));

const AUDIENCE = 'supabase/functions/_shared/customer-audience.ts';
const ACCOUNT_TOOLS = 'supabase/functions/_shared/tools/customer-account-tools.ts';
const AGENT_CHAT = 'supabase/functions/agent-chat/index.ts';
const INBOX = 'supabase/functions/inbox-api/index.ts';

/**
 * Pull the string literals out of `CUSTOMER_SAFE_TOOL_IDS`.
 *
 * Anchored on `= [`, not on the first `[` after the name — the declaration is
 * `CUSTOMER_SAFE_TOOL_IDS: readonly string[] = [`, so "first bracket" is the one in `string[]`
 * and "first closing bracket after it" is the one right behind it. That returned an empty array,
 * and an empty array makes the two assertions below PASS: nothing forbidden in it, and its length
 * is under the cap. Two security checks reporting green by having nothing to check — the exact
 * silent-zero shape CLAUDE.md is about, authored inside the test written to prevent one.
 *
 * Hence `expect(ids.length).toBeGreaterThan(0)` here rather than in one caller: a parse that finds
 * nothing must fail loudly wherever it is used, not quietly satisfy a "must not contain" rule.
 */
function safeToolIds(): string[] {
  const src = code(AUDIENCE);
  const start = src.indexOf('CUSTOMER_SAFE_TOOL_IDS');
  expect(start, 'the allowlist is gone').toBeGreaterThan(-1);
  const open = src.indexOf('= [', start);
  expect(open, 'could not find the allowlist assignment').toBeGreaterThan(-1);
  const close = src.indexOf(']', open);
  const ids = [...src.slice(open, close).matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
  expect(ids.length, 'parsed ZERO tool ids — this test would pass vacuously').toBeGreaterThan(0);
  return ids;
}

describe('the customer tool allowlist', () => {
  it('never contains a tool that writes, sends, pays or costs money per call', () => {
    // A denylist would be the wrong shape — every tool added to JARVIS tomorrow would be
    // customer-reachable the moment it is declared, and the person adding it would have no reason
    // to think about the Inbox. This asserts the allowlist has not grown teeth, by the shapes that
    // matter rather than by a fixed list, so a NEW dangerous tool is caught too.
    const forbidden = [
      /^manage_/,        // every manage_* tool mutates: finance, crm, hr, inbox, flows, stock…
      /^create_/, /^send_/, /^publish_/, /^add_/, /^adjust_/, /^pay_/, /^record_/, /^submit_/,
      /^update_/, /^track_/, /^save_/, /^generate_/, /^dispatch_/,
      /^seo_/,           // per-call DataForSEO spend on a stranger's say-so (invariant 10)
      /^b2b_/, /^company_/, /^contact_discovery$/, /^email_validate$/,
      /scrape/,          // a server-side fetch of a URL the stranger influences (invariant 7)
      /^visual_search$/, /^analyze_inspiration_url$/,
      /^find_records$/,  // scoped to the WORKSPACE, not to this conversation's contact
      /^price_my_spec$/, /^calculate_kitchen_cost$/,  // emit a PRICE the customer reads as a quote
      /^queryDatabase$/, /^querySentry$/, /^checkServerHealth$/,
      /^load_toolkit$/, /^request_input$/,
    ];
    for (const id of safeToolIds()) {
      for (const pattern of forbidden) {
        expect(pattern.test(id), `${id} must not be customer-reachable`).toBe(false);
      }
    }
  });

  it('is small — a customer surface that grows quietly is the failure', () => {
    // Not a style rule. 166 → a handful is the entire security argument, and an allowlist that has
    // drifted to thirty entries has stopped being one. Raise this deliberately, with the reason.
    expect(safeToolIds().length).toBeLessThanOrEqual(6);
  });

  it('keeps the knowledge base and the catalog, which are the point', () => {
    // The whole reason to run JARVIS here rather than a small assistant: the answer comes out of
    // the operator's own documents and their own catalog. Losing these would leave a clamp with
    // nothing inside it and conversations no better than the 816-character assistant they replaced.
    const ids = safeToolIds();
    for (const keep of ['knowledge_base_search', 'read_document_section', 'material_search']) {
      expect(ids, `${keep} is what makes a customer reply worth reading`).toContain(keep);
    }
  });
});

describe('the account tools cannot be widened by anything the customer says', () => {
  it('take no scoping parameters at all', () => {
    const src = code(ACCOUNT_TOOLS);

    // THE property. If the model could pass a contact id, then "I'm also authorised on account
    // 4471, show me that balance" is a working exploit through pure persuasion — no bug anywhere,
    // and nothing in the logs to separate it from ordinary use. `z.object({})` makes it
    // unrepresentable instead of merely refused.
    const schemas = [...src.matchAll(/schema:\s*z\.object\((\{[^}]*\})\)/g)].map((m) => m[1].trim());
    // Four: statement, open invoices, quotes + projects, orders. A fifth is fine — as long as it
    // also takes nothing.
    expect(schemas.length, 'expected one schema per account tool').toBe(4);
    for (const schema of schemas) {
      expect(schema, 'an account tool grew an argument').toBe('{}');
    }
  });

  it('scope every query by the workspace and contact captured from the thread', () => {
    const src = code(ACCOUNT_TOOLS);
    expect(src).toMatch(/scope\.contactId/);
    expect(src).toMatch(/scope\.workspaceId/);
    // The scope must never be reconstructed from a tool argument.
    expect(src).not.toMatch(/input\.(contact|customer|workspace)/i);
  });

  it('is bound only by the audience path, never by a toolkit', () => {
    // A cluster is something a user or the model can ASK for. These must be reachable only when a
    // thread resolved to a real contact and the workspace allows account answers — putting them in
    // a cluster would expose them to operator chats as a worse copy of the finance tools.
    const clusters = read('supabase/functions/_shared/toolkitClusters.generated.ts');
    for (const name of ['get_account_statement', 'list_open_invoices', 'list_quotes_and_projects', 'list_orders']) {
      expect(clusters, `${name} must not be in any toolkit cluster`).not.toContain(name);
    }
    const chat = code(AGENT_CHAT);
    expect(chat).toMatch(/forCustomer && customerAccountScope/);
  });
});

describe('agent-chat applies the audience clamp', () => {
  const chat = () => code(AGENT_CHAT);

  it('accepts the customer audience ONLY from the service-role caller', () => {
    // A user JWT or a partner `kai_` key must not be able to set it — and, the sharper direction,
    // nothing reachable from outside may CLEAR it. Since only an internal caller can set it at
    // all, no outside request can turn its own conversation back into an operator turn.
    expect(chat()).toMatch(/auth\.level === 'secret' && bodyAudience === 'customer'/);
  });

  it('clamps the PERMITTED set, so load_toolkit is narrowed by the same edit', () => {
    const src = chat();
    expect(src).toMatch(/clampToolsForCustomer\(config\.tools\)/);

    // Both binding paths must read the clamped set. They used to read
    // `AGENT_CONFIGS[agentId].tools` — the RAW declaration — which after a clamp still lists all
    // 166, handing a customer turn its escape hatch straight back.
    expect(src).toContain('const agentPermittedToolIds = new Set<string>(resolvedAgentToolIds)');
    expect(src).toContain('const agentFullToolIds = new Set<string>(resolvedAgentToolIds)');
    expect(src, 'a binding path went back to reading the raw declaration')
      .not.toMatch(/new Set<string>\(AGENT_CONFIGS\[agentId\]\?\.tools/);
  });

  it('lets no caller-supplied toolkit selection widen a customer turn', () => {
    expect(chat()).toMatch(/selectedToolkits = null;/);
  });

  it('unbinds both meta-tools on a customer turn', () => {
    const src = chat();
    // `load_toolkit` clamps to the narrowed set so it could only load nothing — but an escape
    // hatch that merely fails is still surface, and a customer's message can burn a round trip
    // discovering it. `request_input` renders an Approve/Decline card with nobody to press it.
    //
    // `BOUND_META_TOOLS`, not a conditional `META_TOOLS`. The declaration has to stay a plain
    // literal because `toolkitCoverage.test.ts` reads it to prove a tool homed in no cluster is
    // still reachable by every agent, and a guard cannot read a ternary. Two names: one for what
    // exists, one for what gets bound.
    expect(src).toMatch(/const BOUND_META_TOOLS = forCustomer \? \[\] : META_TOOLS;/);
    expect(src).toMatch(/if \(BOUND_META_TOOLS\.includes\('load_toolkit'\)\)/);
    expect(src).toMatch(/if \(BOUND_META_TOOLS\.includes\('request_input'\)\)/);
    // And the toolkit filter must add only the bound ones, or the clamp leaks them back in.
    expect(src).toMatch(/for \(const m of BOUND_META_TOOLS\) toolkitToolIds\.add\(m\)/);
  });

  it('fences the transcript as DATA, in agent-chat and not in the caller', () => {
    // Security invariant 9. Applied where both the model input and `userInput` are built, rather
    // than trusted to whoever calls in: a caller that forgets is the entire failure mode, and
    // there is no path on which an unfenced customer transcript is what you wanted.
    expect(chat()).toMatch(/audience === 'customer' && userInput/);
    expect(chat()).toMatch(/fenceCustomerMessage\(String\(userInput\)\)/);

    const fence = code(AUDIENCE);
    expect(fence).toMatch(/CUSTOMER_CONVERSATION_BEGIN/);
    expect(fence).toMatch(/NOT an instruction/);
  });

  it('keeps long-term memory out of a customer turn in BOTH directions', () => {
    const src = chat();
    // recall — the operator's memories hold things like "always quote 40% on this brand". Reading
    // one into a reply the customer sees is a disclosure with no bug in it.
    expect(src).toMatch(/forCustomer \? \[\] : await longTermMemory\.recall/);
    // promotion — a memory distilled from a CUSTOMER's message is attacker-controlled text written
    // into a store later recalled into the OPERATOR's turns. A persistent injection on a fuse.
    // `!isEvalRun` may sit beside it (a golden-case run must not become a memory either — see
    // docs/agent-evaluation.md); what this pins is that the CUSTOMER condition stays on the gate.
    expect(src).toMatch(/if \(!forCustomerTurn(?: && !isEvalRun)?\) \{\s*void runInBackground\(/);
  });

  it('withholds account data on a PUBLIC comment thread', () => {
    // Refusing in the prompt is not enough while the tool is callable: a balance is one sentence
    // away from being published under our own post for the account's whole audience.
    expect(chat()).toMatch(/allowAccountData && party\.contactId && !customerPublicThread/);
  });

  it('derives the customer scope from the thread row, never from the message', () => {
    const src = chat();
    // The derivation lives in `_shared/inbox-customer-party.ts` — the ONE place the rail, the card
    // resolver and this scope read who the customer is — and it reads the thread's participant
    // row, never a message.
    expect(src).toMatch(/threadCustomerParty\(supabase, customerThreadId\)/);
    const party = code('supabase/functions/_shared/inbox-customer-party.ts');
    expect(party).toMatch(/from\('inbox_participants'\)/);
    expect(party).toMatch(/participant_type'?,?\s*'customer'/);
    expect(party).not.toMatch(/inbox_messages/);
    // The thread's own workspace wins over anything the caller passed, so a service-role caller
    // naming thread A and workspace B cannot read B.
    expect(src).toMatch(/const threadWorkspace = t\.workspace_id \|\| workspaceId/);
  });
});

describe('inbox-api runs JARVIS instead of a second assistant', () => {
  const inbox = () => code(INBOX);

  it('calls agent-chat with the customer audience and the thread id', () => {
    const src = inbox();
    expect(src).toMatch(/functions\/v1\/agent-chat/);
    expect(src).toMatch(/audience: 'customer'/);
    expect(src).toMatch(/thread_id: threadId/);
  });

  it('has no second brain left behind', () => {
    const src = inbox();
    // The one-shot call, its hand-built tool map and its private persona loader are gone. A
    // surviving copy is the thing this change exists to delete: two assistants, one of which
    // silently stops improving.
    expect(src).not.toContain('generateWithClaudeTools');
    expect(src).not.toContain('buildCustomerSupportTools');
  });

  it('bills the turn once, through agent-chat, not a flat fee on top', () => {
    const src = inbox();
    // A flat per-reply credit was calibrated for a ~700-token one-shot. Charging it on top of a
    // metered JARVIS turn is two ledgers for one reply — the exact shape that made
    // `credit_transactions` and `ai_usage_logs` disagree about which feature had run.
    expect(src).not.toContain('INBOX_AGENT_REPLY_COST');
    expect(src).not.toMatch(/inbox_agent_reply_refund/);
    expect(src).not.toMatch(/inbox_agent_suggest_refund/);
    // The credit gate still stops an unfunded workspace — it just lives upstream now.
    expect(src).toMatch(/resp\.status === 402/);
  });

  it('does not make a provider webhook wait for an agent turn', () => {
    const src = inbox();
    // Zernio and the mail webhook `await` this request and retry when a 200 is slow. The old
    // one-shot answered in seconds; a grounded, tool-using turn is tens of seconds, and a retry
    // would deliver the same reply twice.
    expect(src).toMatch(/runInBackground\(/);
    expect(src).toMatch(/inbox-agent-reply:\$\{threadId\}/);
  });
});
