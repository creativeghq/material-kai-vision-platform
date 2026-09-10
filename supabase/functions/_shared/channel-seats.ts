/** How many channels a workspace may connect, and what to say when it may not. */
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

/** May this workspace connect ONE more channel? */
export async function checkChannelSeat(supabase: SupabaseLike, workspaceId: string): Promise<SeatVerdict> {
  return { ok: true, usage: await getChannelUsage(supabase, workspaceId) };
}
