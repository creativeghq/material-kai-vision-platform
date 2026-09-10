/** Does the AI assistant answer a NEW inbound conversation on its own? */

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

/** Should THIS inbound message auto-engage the assistant on a brand-new thread? */
export async function shouldAutoEngageAgent(
  db: SettingsReader,
  workspaceId: string,
  ctx: { historical?: boolean } = {},
): Promise<boolean> {
  if (ctx.historical) return false;
  const { autoRespond } = await inboxAutopilotSettings(db, workspaceId);
  return autoRespond;
}
