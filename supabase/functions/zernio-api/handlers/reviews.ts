/**
 * Reviews on connected platform profiles (Google Business).
 *
 * Reviews PUSH: `review.new` and `review.updated` land on zernio-webhook-handler and upsert into
 * `external_reviews`. This handler is the two things a webhook cannot do —
 *
 *   sync_reviews  → back-fill everything that arrived before the webhook was subscribed, and
 *                   reconcile if a delivery was ever missed. Idempotent on (platform, external_id).
 *   reply_review  → answer one, which is the only WRITE this feature has.
 *
 * Reading is a plain RLS-scoped select from the client; there is no action for it here, because a
 * pass-through read would be a second, weaker copy of the policy on the table.
 */

import { createClient } from '@supabase/supabase-js';
import { jsonResponse } from '../../_shared/http.ts';
import { authenticate } from '../../_shared/auth.ts';
import { userCanAccessWorkspace } from '../../_shared/auth.ts';
import { zernioApi, ensureZernioSecrets, ZernioApiError } from '../zernio.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

/** Zernio's review shape → our row. One mapper, so sync and webhook cannot disagree. */
function toRow(review: Record<string, any>, ctx: {
  workspaceId: string;
  socialAccountId: string | null;
  zernioAccountId: string | null;
}): Record<string, unknown> {
  const reviewer = review.reviewer || {};
  const rating = Number(review.rating);
  return {
    workspace_id: ctx.workspaceId,
    platform: String(review.platform ?? 'googlebusiness'),
    external_id: String(review.id),
    social_account_id: ctx.socialAccountId,
    zernio_account_id: ctx.zernioAccountId,
    // 1–5 integer; Zernio has already normalised Google's ONE..FIVE enum. Anything outside that is
    // a shape we do not understand — stored unrated rather than lost to a CHECK violation.
    rating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? Math.round(rating) : null,
    comment: typeof review.text === 'string' ? review.text : null,
    reviewer_name: typeof reviewer.name === 'string' ? reviewer.name : null,
    reviewer_id: typeof reviewer.id === 'string' ? reviewer.id : null,
    reviewer_avatar_url: typeof reviewer.profileImage === 'string' ? reviewer.profileImage : null,
    reply_text: typeof review.reply === 'string' ? review.reply
      : (typeof review.reply?.comment === 'string' ? review.reply.comment : null),
    replied_at: review.hasReply ? (review.reply?.updateTime ?? null) : null,
    posted_at: review.createdAt ?? null,
    updated_at_remote: review.updatedAt ?? null,
    raw: review,
    updated_at: new Date().toISOString(),
  };
}

export async function handleZernioReviews(req: Request, body: any): Promise<Response> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  await ensureZernioSecrets(supabase);

  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) {
    return jsonResponse({ success: false, error: auth.error || 'Unauthorized' }, 401);
  }

  const { action, workspace_id: workspaceId } = body ?? {};
  if (!workspaceId) return jsonResponse({ success: false, error: 'workspace_id is required' }, 400);

  // Invariant 1: the workspace comes from the BODY, so it is bound to the caller before anything
  // touches Zernio or writes a row. 404 rather than 403 — a 403 confirms the id exists.
  if (!(await userCanAccessWorkspace(supabase, auth.userId, workspaceId))) {
    return jsonResponse({ success: false, error: 'Not found' }, 404);
  }

  // ── sync_reviews ───────────────────────────────────────────────────────────
  if (action === 'sync_reviews') {
    const { data: accounts } = await supabase
      .from('social_accounts')
      .select('id, zernio_account_id, platform')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true)
      .not('zernio_account_id', 'is', null);

    const list = (accounts ?? []) as Array<{ id: string; zernio_account_id: string; platform: string }>;
    if (!list.length) {
      return jsonResponse({
        success: true, synced: 0, accounts: 0,
        message: 'No connected accounts. Connect a Google Business location first.',
      });
    }

    let synced = 0;
    const errors: string[] = [];

    for (const acct of list) {
      // Cursor-paginated. Capped so one large location cannot run the function out of time —
      // and the cap is REPORTED, because a silently truncated sync reads as "that is all of them".
      let cursor: string | undefined;
      let pages = 0;
      let truncated = false;
      for (;;) {
        if (pages >= 20) { truncated = true; break; }
        const qs = new URLSearchParams({ accountId: acct.zernio_account_id, limit: '50' });
        if (cursor) qs.set('cursor', cursor);

        let data: any;
        try {
          data = await zernioApi('GET', `/inbox/reviews?${qs.toString()}`);
        } catch (err) {
          // A platform with no reviews surface answers 404/400; that is not a failure of the sync.
          if (err instanceof ZernioApiError && (err.status === 404 || err.status === 400)) break;
          errors.push(`${acct.platform}: ${err instanceof Error ? err.message : String(err)}`);
          break;
        }

        const items = (data.data ?? data.reviews ?? []) as Array<Record<string, any>>;
        if (items.length) {
          const rows = items
            .filter((r) => r && r.id)
            .map((r) => toRow(r, {
              workspaceId,
              socialAccountId: acct.id,
              zernioAccountId: acct.zernio_account_id,
            }));
          if (rows.length) {
            const { error } = await supabase
              .from('external_reviews')
              .upsert(rows, { onConflict: 'platform,external_id' });
            if (error) errors.push(`${acct.platform}: ${error.message}`);
            else synced += rows.length;
          }
        }

        cursor = data.nextCursor ?? data.cursor ?? undefined;
        pages++;
        if (!cursor || !items.length) break;
      }
      if (truncated) errors.push(`${acct.platform}: stopped at 20 pages — run again to continue`);
    }

    return jsonResponse({
      success: true,
      accounts: list.length,
      synced,
      // Upserts, so "synced" counts rows WRITTEN, not rows that are new. Said plainly rather than
      // letting a repeat run read as if it found everything again.
      message: `${synced} review(s) written from ${list.length} account(s). Re-running is safe.`,
      errors: errors.slice(0, 10),
    });
  }

  // ── reply_review ───────────────────────────────────────────────────────────
  if (action === 'reply_review') {
    const { review_id: reviewId, reply } = body;
    const text = typeof reply === 'string' ? reply.trim() : '';
    if (!reviewId || !text) {
      return jsonResponse({ success: false, error: 'review_id and reply are required' }, 400);
    }

    // Read OUR row first: it carries the platform id to address, and reading it under the caller's
    // workspace is what stops a review id from another tenant being replied to through us.
    const { data: row } = await supabase
      .from('external_reviews')
      .select('id, external_id, workspace_id, platform')
      .eq('id', reviewId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (!row) return jsonResponse({ success: false, error: 'Not found' }, 404);

    const r = row as { id: string; external_id: string; platform: string };
    try {
      await zernioApi(
        'POST',
        `/inbox/reviews/${encodeURIComponent(r.external_id)}/reply`,
        { reply: text },
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      // Not stored on failure. A reply shown as posted that the customer never sees is the same
      // failure shape as the WhatsApp sends that reported success and were refused by Meta.
      return jsonResponse({ success: false, error: `Google rejected the reply: ${detail}` }, 502);
    }

    // Local write so the screen is right immediately; `review.updated` follows and reconciles it
    // with the platform's own timestamp. CHECKED: supabase-js RESOLVES on an RLS denial, so an
    // unchecked write here would return success for a reply that posted to Google and never landed
    // in our row — the screen would keep offering to reply to a review already answered.
    const { error: saveErr } = await supabase.from('external_reviews').update({
      reply_text: text,
      replied_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', r.id);

    return jsonResponse({
      success: true,
      review_id: r.id,
      // The reply IS posted either way — saying otherwise would be worse. But a local write that
      // failed is a screen that will disagree with Google until the webhook catches up, and the
      // operator should know which of those they are looking at.
      ...(saveErr ? { warning: `Posted to Google, but not recorded locally: ${saveErr.message}` } : {}),
    });
  }

  return jsonResponse({ success: false, error: `Unknown action: ${action}` }, 400);
}
