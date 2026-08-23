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
  /** Included with the Channels add-on — the two Zernio gives us free. */
  included: number;
  /** Extra seats the workspace pays for. */
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
 * Can a seat actually be BOUGHT right now?
 *
 * A cap is only legitimate when there is a way past it. Channels is priced ($29 + $9/seat) but the
 * Stripe product is not bound yet, so `activate-module` refuses the paid path outright — a
 * workspace at the limit would be told to buy something that cannot be bought.
 *
 * Derived from the module row rather than a flag someone has to remember to flip: the day an
 * operator binds the Stripe product, the cap starts enforcing by itself.
 */
async function seatsArePurchasable(supabase: SupabaseLike): Promise<boolean> {
  const { data } = await supabase
    .from('modules').select('addon_stripe_product_id').eq('slug', 'messaging').maybeSingle();
  return Boolean(data?.addon_stripe_product_id);
}

/**
 * May this workspace connect ONE more channel?
 *
 * Fails OPEN when the usage read itself fails. This gate protects a margin, not a boundary: a DB
 * hiccup that silently stopped every customer connecting an account would cost far more than the
 * $6 it saved, and the count is reconcilable after the fact. That is the opposite of the
 * entitlement and tenancy checks beside it, which fail closed — those protect other people's
 * data, this protects a cost line.
 *
 * It also declines to block while there is nothing to buy. Over-allowance still comes back in
 * `usage`, so the admin cost view keeps showing exactly who is over and by how much — the
 * measurement stays, only the wall goes away until the wall has a door.
 */
export async function checkChannelSeat(supabase: SupabaseLike, workspaceId: string): Promise<SeatVerdict> {
  const usage = await getChannelUsage(supabase, workspaceId);
  if (!usage) return { ok: true, usage: null };
  if (usage.total < usage.allowance) return { ok: true, usage };

  if (!(await seatsArePurchasable(supabase))) {
    console.warn(
      `[channel-seats] workspace ${workspaceId} is over its channel allowance `
      + `(${usage.total}/${usage.allowance}) and seats cannot be bought yet — allowing the connect. `
      + 'Bind the Channels Stripe product to start enforcing.',
    );
    return { ok: true, usage };
  }

  return {
    ok: false,
    usage,
    message:
      `This workspace is using all ${usage.allowance} of its connected channels `
      + `(${usage.socialAccounts} social, ${usage.whatsappChannels} WhatsApp). `
      + `The Channels add-on includes ${usage.included}; add a channel seat to connect more.`,
  };
}
