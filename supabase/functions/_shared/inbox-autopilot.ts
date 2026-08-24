/**
 * Does the AI assistant answer a NEW inbound conversation on its own?
 *
 * ONE answer, in ONE place, and it is **no until somebody turns it on**.
 *
 * ── Why this file exists ────────────────────────────────────────────────────────────────────
 * The question was written four separate times — `inbox-api` (`inboxAgentSettings`),
 * `zernio-webhook-handler` twice (WhatsApp, social DM) and `_shared/inbound-email.ts` — and all
 * four spelled it `cfg.auto_respond !== false`. That is an OPT-OUT: a workspace that has never
 * heard of the setting, whose `settings.inbox_agent` is NULL, gets an AI answering its customers.
 *
 * On 2026-08-24 that is exactly what happened. A WhatsApp number was connected in coexistence
 * mode, the operator back-filled their existing chats, and every conversation was created with
 * `agent_state='active'` because nothing had ever said `false`. The assistant then answered 22
 * times across 8 real conversations — including ones where the account owner was the CUSTOMER,
 * not the business. It introduced itself as "the support line for a building-materials business"
 * to the operator's own suppliers.
 *
 * Nothing failed. Every write succeeded, every webhook returned 200, and the only reason the
 * damage was bounded is that Meta refused delivery on all 22 (outside the 24-hour service window).
 * A default that acts on the customer's behalf must be the one that does nothing.
 *
 * ── The rule ────────────────────────────────────────────────────────────────────────────────
 * Handing a conversation to the AI is a decision a PERSON makes: per workspace by turning
 * `settings.inbox_agent.auto_respond` on, or per thread from the Inbox (`set_agent`). There is no
 * third way in, and absence of an answer is not consent.
 *
 * `allowAccountData` keeps its opt-OUT default on purpose — it only narrows what an assistant
 * that is ALREADY running may read, so its default cannot start a conversation with anybody.
 */

/**
 * The four callers hold four differently-typed Supabase clients (a typed `DbClient`, two bare
 * service-role clients, one `any`), and a structural interface tight enough to describe the
 * builder chain makes tsc give up with TS2589 "type instantiation is excessively deep" against
 * PostgREST's generics. `any` here buys nothing dangerous: the whole surface is one settings read
 * whose result is narrowed by hand below, and it is the same shape the rest of `_shared` uses for
 * exactly this reason.
 */
// deno-lint-ignore no-explicit-any
type SettingsReader = any;

export interface InboxAutopilotSettings {
  /** May the assistant engage a NEW inbound conversation without being asked? Default FALSE. */
  autoRespond: boolean;
  /** Once engaged, may it read orders/quotes/invoices for the thread's customer? Default TRUE. */
  allowAccountData: boolean;
}

export async function inboxAutopilotSettings(
  db: SettingsReader,
  workspaceId: string,
): Promise<InboxAutopilotSettings> {
  const { data } = await db.from('workspaces').select('settings').eq('id', workspaceId).maybeSingle();
  const root = ((data as { settings?: Record<string, unknown> } | null)?.settings || {}) as Record<string, unknown>;
  const cfg = (root.inbox_agent || {}) as Record<string, unknown>;
  return {
    // `=== true`, not `!== false`. Unset means off.
    autoRespond: cfg.auto_respond === true,
    allowAccountData: cfg.allow_account_data !== false,
  };
}

/**
 * Should THIS inbound message auto-engage the assistant on a brand-new thread?
 *
 * `historical` is the second, blunter half of the fix and it overrides the setting entirely.
 * A back-fill replays months of past messages through the SAME code path as a live webhook —
 * deliberately, so the two importers can never diverge — which means an import looks to every
 * downstream consumer like N customers writing in at once. Answering them is never right: the
 * conversations already happened, the people have moved on, and Meta's 24-hour window has long
 * since closed on all of them.
 *
 * So an import cannot wake the assistant even in a workspace that genuinely wants autopilot.
 * Importing history is bookkeeping, not an event.
 */
export async function shouldAutoEngageAgent(
  db: SettingsReader,
  workspaceId: string,
  ctx: { historical?: boolean } = {},
): Promise<boolean> {
  if (ctx.historical) return false;
  const { autoRespond } = await inboxAutopilotSettings(db, workspaceId);
  return autoRespond;
}
