/**
 * moodboard-keep-active
 *
 * One-click "keep this moodboard" target for the dormancy warning/reminder email.
 * GET /functions/v1/moodboard-keep-active?token=<keep_active_token>
 *
 * Validates the token, clears the dormancy schedule, and bumps updated_at so the
 * activity clock resets. Public (no login) — the token is a 96-hex-char random
 * secret, so it's the capability. Returns a small self-contained HTML page.
 *
 * verify_jwt = false (see config.toml) so the link works straight from an email.
 */

import { createClient } from '@supabase/supabase-js';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { escapeHtml } from '../_shared/html.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

function page(title: string, message: string, ok: boolean): Response {
  const color = ok ? '#1f9d55' : '#b23b3b';
  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title></head>
<body style="font-family:system-ui,sans-serif;background:#faf8f2;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center">
  <div style="max-width:460px;padding:40px;text-align:center">
    <div style="font-size:44px;line-height:1;margin-bottom:16px">${ok ? '✓' : '⚠️'}</div>
    <h1 style="font-size:22px;font-weight:600;color:${color};margin:0 0 10px">${title}</h1>
    <p style="color:#555;font-size:15px;line-height:1.5">${message}</p>
  </div>
</body></html>`;
  return new Response(html, {
    status: ok ? 200 : 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

Deno.serve(withApiLogging('moodboard-keep-active', async (req: Request) => {
  await bootstrapForFunction();

  const token = new URL(req.url).searchParams.get('token') ?? '';
  if (!token || token.length < 32) {
    return page('Invalid link', 'This keep-active link is missing or malformed.', false);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: board } = await supabase
    .from('moodboards')
    .select('id, title')
    .eq('keep_active_token', token)
    .maybeSingle();

  if (!board) {
    return page(
      'Link no longer valid',
      'This moodboard may have already been kept active, or the link has expired. If you still see the board in your account, it is safe.',
      false,
    );
  }

  // Clear the dormancy schedule + reset the activity clock.
  const { error } = await supabase
    .from('moodboards')
    .update({
      dormancy_warned_at: null,
      dormancy_reminder_at: null,
      deletion_scheduled_at: null,
      keep_active_token: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', board.id);

  if (error) {
    return page('Something went wrong', 'We could not update the moodboard. Please open it in the app to keep it active.', false);
  }

  // Canonical escaper (invariant 11). `page()` builds an HTML string, and the previous local
  // stripper deleted `< > &` instead of escaping them — mangling any board with an ampersand in
  // its name on the one page that exists to reassure the owner it was kept.
  const title = escapeHtml(board.title ?? 'Your moodboard');
  return page('Kept active', `"${title}" will be kept. Thanks — it won't be removed.`, true);
}));
