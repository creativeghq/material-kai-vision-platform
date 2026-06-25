/**
 * Per-workspace Resend BYOK resolution + send-cap enforcement.
 *
 * A workspace may bring its OWN Resend API key + verified sender (workspace_email_config)
 * so its mail goes out from its own account/domain. When it hasn't, sends fall back to the
 * platform RESEND_API_KEY + global email_settings sender (unchanged behaviour).
 *
 * The daily send cap is OURS (platform-controlled): per-workspace override (admin-set) or the
 * global `email_workspace_daily_limit` system setting. Counted off email_logs.workspace_id.
 */

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

export interface ResolvedEmailSender {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  source: 'workspace' | 'platform';
}

const DEFAULT_DAILY_LIMIT = 300;

/** Read the platform default sender from global email_settings. */
async function platformSender(supabase: SupabaseLike): Promise<{ fromEmail: string; fromName: string }> {
  let fromEmail = '';
  let fromName = 'Material Kai';
  try {
    const { data } = await supabase
      .from('email_settings')
      .select('setting_key, setting_value')
      .in('setting_key', ['default_from_email', 'default_from_name']);
    for (const s of data ?? []) {
      if (s.setting_key === 'default_from_email') fromEmail = s.setting_value || '';
      else if (s.setting_key === 'default_from_name') fromName = s.setting_value || fromName;
    }
  } catch (_) { /* fall through to empty — caller fails loudly if no sender */ }
  return { fromEmail, fromName };
}

/**
 * Resolve which Resend key + sender to use for a send.
 * Workspace BYOK wins (when enabled + key + from_email present); otherwise the platform default.
 */
export async function resolveWorkspaceEmailSender(
  supabase: SupabaseLike,
  workspaceId?: string | null,
): Promise<ResolvedEmailSender> {
  const platformKey = Deno.env.get('RESEND_API_KEY') || '';

  if (workspaceId) {
    const { data: cfg } = await supabase
      .from('workspace_email_config')
      .select('resend_api_key, from_email, from_name, enabled')
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    const key = (cfg?.resend_api_key ?? '').trim();
    const fromEmail = (cfg?.from_email ?? '').trim();
    if (cfg && cfg.enabled !== false && key && fromEmail) {
      return {
        apiKey: key,
        fromEmail,
        fromName: (cfg.from_name ?? '').trim() || fromEmail,
        source: 'workspace',
      };
    }
  }

  const { fromEmail, fromName } = await platformSender(supabase);
  return { apiKey: platformKey, fromEmail, fromName, source: 'platform' };
}

export interface SendQuota {
  allowed: boolean;
  limit: number;
  used: number;
}

/**
 * Enforce the platform-controlled per-workspace daily send cap. Counts today's email_logs
 * for the workspace. No-op (always allowed) when no workspace context is supplied — system
 * sends (alerts, flows) carry no workspace and are not metered here.
 */
export async function checkWorkspaceSendQuota(
  supabase: SupabaseLike,
  workspaceId?: string | null,
): Promise<SendQuota> {
  if (!workspaceId) return { allowed: true, limit: Infinity, used: 0 };

  const [{ data: cfg }, { data: setting }, { count }] = await Promise.all([
    supabase.from('workspace_email_config').select('daily_send_limit').eq('workspace_id', workspaceId).maybeSingle(),
    supabase.from('system_settings').select('setting_value').eq('setting_key', 'email_workspace_daily_limit').maybeSingle(),
    supabase.from('email_logs').select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
  ]);

  const globalDefault = Number(setting?.setting_value) || DEFAULT_DAILY_LIMIT;
  const limit = cfg?.daily_send_limit != null ? Number(cfg.daily_send_limit) : globalDefault;
  const used = count ?? 0;
  return { allowed: used < limit, limit, used };
}
