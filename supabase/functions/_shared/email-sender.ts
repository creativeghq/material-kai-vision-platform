/** Per-workspace Resend BYOK resolution + send-cap enforcement. */

import type { LayoutBrand } from './email-layout.ts';

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

export interface ResolvedEmailSender {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  /** Reply-To to apply as the default when the caller didn't set one. '' = none (reply to From). */
  replyTo: string;
  /**
   * `workspace` — the tenant's own BYOK key and domain.
   * `platform`   — the operator's key. Legitimate ONLY with no workspace (a system send) or for
   *                the operator's own ROOT workspace.
   * `unconfigured` — a TENANT workspace with incomplete BYOK. There is no sender; the caller
   *                must refuse rather than send (#357 AE-1).
   */
  source: 'workspace' | 'platform' | 'unconfigured';
  /** Why there is no sender. Present only when `source === 'unconfigured'`. */
  reason?: string;
  /**
   * A brand belongs to the sender, so it resolves here, not at the 22 call sites — and a
   * tenant gets its own or the default, never the operator's (same rule as the Resend key).
   */
  layoutHtml: string | null;
  brand: LayoutBrand;
}

const DEFAULT_DAILY_LIMIT = 300;

export const OPERATOR_BRAND_KEYS = [
  'default_from_email',
  'default_from_name',
  'default_reply_to',
  'default_layout_html',
  'brand_name',
  'brand_url',
  'brand_logo_url',
  'brand_footer_note',
] as const;

interface PlatformIdentity {
  fromEmail: string;
  fromName: string;
  replyTo: string;
  layoutHtml: string | null;
  brandName: string;
  brandUrl: string;
  logoUrl: string;
  footerNote: string;
}

/** The platform default sender + reply-to + brand, from global email_settings. */
async function platformSender(supabase: SupabaseLike): Promise<PlatformIdentity> {
  const v: Record<string, string> = {};
  try {
    const { data } = await supabase
      .from('email_settings')
      .select('setting_key, setting_value')
      .in('setting_key', [...OPERATOR_BRAND_KEYS]);
    for (const s of data ?? []) v[s.setting_key] = s.setting_value || '';
  } catch (_) { /* fall through to empty — caller fails loudly if no sender */ }

  const fromName = v.default_from_name || 'Material Kai';
  return {
    fromEmail: v.default_from_email || '',
    fromName,
    replyTo: v.default_reply_to || '',
    layoutHtml: v.default_layout_html || null,
    brandName: v.brand_name || fromName,
    brandUrl: v.brand_url || (Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr'),
    logoUrl: v.brand_logo_url || '',
    footerNote: v.brand_footer_note || '',
  };
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
      .select('resend_api_key, from_email, from_name, reply_to, enabled, layout_html, brand_url, brand_logo_url, brand_footer_note')
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    const key = (cfg?.resend_api_key ?? '').trim();
    const fromEmail = (cfg?.from_email ?? '').trim();
    if (cfg && cfg.enabled !== false && key && fromEmail) {
      const fromName = (cfg.from_name ?? '').trim() || fromEmail;
      return {
        apiKey: key,
        fromEmail,
        fromName,
        replyTo: (cfg.reply_to ?? '').trim(),
        source: 'workspace',
        layoutHtml: (cfg.layout_html ?? '').trim() || null,
        brand: {
          brandName: fromName,
          brandUrl: (cfg.brand_url ?? '').trim(),
          logoUrl: (cfg.brand_logo_url ?? '').trim(),
          senderName: fromName,
          senderEmail: fromEmail,
          footerNote: (cfg.brand_footer_note ?? '').trim(),
        },
      };
    }
  }

  /** A TENANT NEVER FALLS BACK TO THE OPERATOR'S CREDENTIALS (#357 AE-1). */
  if (workspaceId) {
    const { data: ws } = await supabase
      .from('workspaces').select('is_root').eq('id', workspaceId).maybeSingle();
    if (ws?.is_root !== true) {
      return {
        apiKey: '',
        fromEmail: '',
        fromName: '',
        replyTo: '',
        source: 'unconfigured',
        layoutHtml: null,
        brand: { brandName: '', brandUrl: '', logoUrl: '', senderName: '', senderEmail: '', footerNote: '' },
        reason: 'This workspace has no verified email sender of its own. Add a Resend API key and '
          + 'a verified From address in Profile → Keys. Mail is never sent from the platform '
          + "domain on a workspace's behalf.",
      };
    }
  }

  const p = await platformSender(supabase);
  return {
    apiKey: platformKey,
    fromEmail: p.fromEmail,
    fromName: p.fromName,
    replyTo: p.replyTo,
    source: 'platform',
    layoutHtml: p.layoutHtml,
    brand: {
      brandName: p.brandName,
      brandUrl: p.brandUrl,
      logoUrl: p.logoUrl,
      senderName: p.fromName,
      senderEmail: p.fromEmail,
      footerNote: p.footerNote,
    },
  };
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

  const [{ data: cfg }, { data: setting }, { count, error: countErr }] = await Promise.all([
    supabase.from('workspace_email_config').select('daily_send_limit').eq('workspace_id', workspaceId).maybeSingle(),
    supabase.from('system_settings').select('setting_value').eq('setting_key', 'email_workspace_daily_limit').maybeSingle(),
    supabase.from('email_logs').select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
  ]);

  const globalDefault = Number(setting?.setting_value) || DEFAULT_DAILY_LIMIT;
  const limit = cfg?.daily_send_limit != null ? Number(cfg.daily_send_limit) : globalDefault;

  // FAIL CLOSED. Never write `const used = count ?? 0` and drop `error`: if the email_logs
  // count fails for ANY reason, used=0, `0 < limit` holds, and the cap silently ceases to
  // exist. A quota that fails open is not a quota, and this is the PLATFORM-controlled cap a
  // tenant deliberately cannot raise (guard_workspace_email_limit). If we cannot count today's
  // sends, we cannot prove the tenant is under the cap, so we must not allow.
  if (countErr || count == null) {
    console.error('[email-sender] quota count failed — denying send (fail-closed):', countErr?.message);
    return { allowed: false, limit, used: limit };
  }

  return { allowed: count < limit, limit, used: count };
}
