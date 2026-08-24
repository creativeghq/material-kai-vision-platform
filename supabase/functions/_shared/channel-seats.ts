/**
 * How many channels a workspace may connect, and what to say when it may not.
 *
 * Zernio bills the operator per connected account per month — free for the first two, then $6,
 * then $3 past ten. Nothing in this platform charged for or even counted them: every user could
 * connect Instagram, Facebook, LinkedIn, TikTok and WhatsApp from their own profile, uncharged
 * and unlimited. It is the only cost line that grows with the feature's success, and it arrives
 * as one Zernio invoice rather than as a per-tenant number, so it is invisible per workspace.
 *
 * The allowance is derived in SQL (`workspace_channel_usage`) rather than recomputed here, so the
 * number that blocks a connect and the number the operator sees in the admin cost view cannot
 * disagree. Social accounts and WhatsApp channels are counted TOGETHER because Zernio charges for
 * both — counting them separately is how the second one ends up free forever.
 */
// supabase-js returns a thenable builder from .rpc(), not a Promise, so this stays loose —
// the same shape the other _shared helpers take.
// deno-lint-ignore no-explicit-any
type SupabaseLike = { rpc: (fn: string, args: Record<string, unknown>) => any; from: (t: string) => any };

export interface ChannelUsage {
  socialAccounts: number;
  whatsappChannels: number;
  total: number;
  /** The two Zernio gives us free. Reporting only — nothing is capped at it. */
  included: number;
  /** Legacy seat count. Nothing sells seats; retained so the SQL shape stays stable. */
  purchased: number;
  allowance: number;
}

export async function getChannelUsage(supabase: SupabaseLike, workspaceId: string): Promise<ChannelUsage | null> {
  const { data, error } = await supabase.rpc('workspace_channel_usage', { p_workspace_id: workspaceId });
  if (error || !data) {
    console.error('[channel-seats] workspace_channel_usage failed:', error);
    return null;
  }
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, number> | undefined;
  if (!row) return null;
  return {
    socialAccounts: Number(row.social_accounts) || 0,
    whatsappChannels: Number(row.whatsapp_channels) || 0,
    total: Number(row.total) || 0,
    included: Number(row.included) || 0,
    purchased: Number(row.purchased) || 0,
    allowance: Number(row.allowance) || 0,
  };
}

export interface SeatVerdict {
  ok: boolean;
  usage: ChannelUsage | null;
  /** Operator-readable reason, safe to show the tenant. */
  message?: string;
}

/**
 * May this workspace connect ONE more channel?
 *
 * Always yes. Channels are UNMETERED by decision (2026-08-24): a workspace onboards as many
 * accounts and numbers as it wants, and the platform absorbs Zernio's per-account fee rather than
 * putting a wall between a customer and the thing they are trying to set up.
 *
 * Kept as a function rather than deleted at the call sites, because the COUNT is still worth
 * having: `usage` feeds the operator cost view, which is the only place the account fee is
 * visible per tenant. Removing the call would remove the measurement along with the cap, and the
 * measurement is the half that was always the point.
 */
export async function checkChannelSeat(supabase: SupabaseLike, workspaceId: string): Promise<SeatVerdict> {
  return { ok: true, usage: await getChannelUsage(supabase, workspaceId) };
}
