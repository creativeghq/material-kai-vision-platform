/**
 * moodboard-dormancy-cron
 *
 * Daily lifecycle sweep for abandoned moodboards. Timeline (active boards only):
 *   idle > 30 days  → warn the owner, schedule deletion for +15 days, mint a
 *                     one-click "keep active" token.
 *   5 days before   → reminder notification.
 *   day 0           → hard-delete the board (FK cascade drops items + sheets;
 *                     storage-orphan-cleanup reclaims the files).
 *   any activity / keep-active click → clock resets, schedule cleared.
 *
 * The heavy lifting (reactivation + deletion + candidate selection with the
 * GREATEST(updated_at, last item) activity math) is in the SQL RPC
 * moodboard_dormancy_scan(). This function emits the two notifications through
 * the Flows engine (bell + email via seeded system-default flows) and stamps
 * the rows only AFTER a successful emit, so a failed notification retries next
 * day rather than silently deleting an un-warned board.
 *
 * Scheduled via pg_cron (moodboard-dormancy-daily). Cron-authorized only.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { authenticate, isAdminAccess, isCronAuthorized } from '../_shared/auth.ts';
import { emitFlowEvent } from '../_shared/flow-events.ts';

const IDLE_DAYS = 30;          // inactivity before the first warning
const GRACE_DAYS = 15;         // warning → deletion
const REMIND_DAYS_BEFORE = 5;  // second notification, N days before deletion

function keepActiveUrl(token: string): string {
  const base = Deno.env.get('SUPABASE_URL')!;
  return `${base}/functions/v1/moodboard-keep-active?token=${token}`;
}

function warningEmailHtml(title: string, keepUrl: string, daysLeft: number): string {
  // No untrusted interpolation beyond the board title (owner's own text); still
  // keep it plain to avoid markup issues.
  const safeTitle = String(title ?? 'your moodboard').replace(/[<>&]/g, '');
  return `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#222">
      <h2 style="font-weight:600">Is "${safeTitle}" still needed?</h2>
      <p>Your moodboard <strong>${safeTitle}</strong> hasn't been touched in ${IDLE_DAYS} days.
      To keep it, just click the button below. Otherwise it will be automatically
      removed in <strong>${daysLeft} days</strong>.</p>
      <p style="margin:28px 0">
        <a href="${keepUrl}" style="background:#c2408f;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600">Keep this moodboard</a>
      </p>
      <p style="font-size:13px;color:#888">If you no longer need it, no action is required — it will be removed automatically.</p>
    </div>`;
}

Deno.serve(withApiLogging('moodboard-dormancy-cron', async (req: Request) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Cron-only privileged fan-out across ALL tenants (mirrors check-material-alerts).
  if (!isCronAuthorized(req)) {
    const auth = await authenticate(req, { allowedRoles: ['admin', 'super_admin'] });
    if (!auth.success && !isAdminAccess(auth)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const { data: scan, error } = await supabase.rpc('moodboard_dormancy_scan', {
      p_idle_days: IDLE_DAYS,
      p_remind_days_before: REMIND_DAYS_BEFORE,
    });
    if (error) throw new Error(`moodboard_dormancy_scan failed: ${error.message}`);

    const warnings = (scan?.warnings ?? []) as Array<{
      id: string; user_id: string | null; title: string | null; owner_email: string | null;
    }>;
    const reminders = (scan?.reminders ?? []) as Array<{
      id: string; user_id: string | null; title: string | null; owner_email: string | null;
      deletion_scheduled_at: string; keep_active_token: string | null;
    }>;

    let warned = 0;
    let reminded = 0;

    // ── Warnings ──────────────────────────────────────────────────────────
    for (const b of warnings) {
      if (!b.user_id) continue; // no owner to notify → skip (never auto-delete un-warned)
      const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
      const url = keepActiveUrl(token);
      const deletionAt = new Date(Date.now() + GRACE_DAYS * 86400_000).toISOString();
      const title = b.title || 'Untitled moodboard';

      try {
        await emitFlowEvent('moodboard_dormancy_warning', {
          type: 'moodboard_dormancy_warning',
          user_id: b.user_id,
          owner_email: b.owner_email,
          moodboard_id: b.id,
          moodboard_title: title,
          deletion_scheduled_at: deletionAt,
          keep_active_url: url,
          title: `Keep "${title}" — auto-removal in ${GRACE_DAYS} days`,
          body: `Your moodboard "${title}" has been inactive for ${IDLE_DAYS} days. Keep it active, or it will be removed in ${GRACE_DAYS} days.`,
          email_html: warningEmailHtml(title, url, GRACE_DAYS),
          action_url: url,
        });
      } catch (e) {
        console.error(`[dormancy] warning emit failed for ${b.id}:`, (e as Error)?.message);
        continue; // don't stamp — retry next run
      }

      // Stamp only after the notification went out. Guard on dormancy_warned_at IS
      // NULL so a concurrent run can't double-schedule.
      await supabase
        .from('moodboards')
        .update({ dormancy_warned_at: new Date().toISOString(), deletion_scheduled_at: deletionAt, keep_active_token: token })
        .eq('id', b.id)
        .is('dormancy_warned_at', null);
      warned++;
    }

    // ── Reminders ─────────────────────────────────────────────────────────
    for (const b of reminders) {
      if (!b.user_id) continue;
      const url = b.keep_active_token ? keepActiveUrl(b.keep_active_token) : '/moodboard';
      const title = b.title || 'Untitled moodboard';
      const daysLeft = Math.max(1, Math.ceil((new Date(b.deletion_scheduled_at).getTime() - Date.now()) / 86400_000));

      try {
        await emitFlowEvent('moodboard_dormancy_reminder', {
          type: 'moodboard_dormancy_reminder',
          user_id: b.user_id,
          owner_email: b.owner_email,
          moodboard_id: b.id,
          moodboard_title: title,
          deletion_scheduled_at: b.deletion_scheduled_at,
          keep_active_url: url,
          title: `Final reminder: "${title}" is removed in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
          body: `Your moodboard "${title}" will be automatically removed in ${daysLeft} day${daysLeft === 1 ? '' : 's'} unless you keep it active.`,
          email_html: warningEmailHtml(title, url, daysLeft),
          action_url: url,
        });
      } catch (e) {
        console.error(`[dormancy] reminder emit failed for ${b.id}:`, (e as Error)?.message);
        continue;
      }

      await supabase
        .from('moodboards')
        .update({ dormancy_reminder_at: new Date().toISOString() })
        .eq('id', b.id)
        .is('dormancy_reminder_at', null);
      reminded++;
    }

    const result = {
      reactivated: scan?.reactivated ?? 0,
      deleted: scan?.deleted ?? 0,
      warned,
      reminded,
    };
    console.log('[dormancy] done:', JSON.stringify(result));
    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[dormancy] fatal:', err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
}));
