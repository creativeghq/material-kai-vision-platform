/**
 * tender-bid-portal — issue a trade package to a subcontractor, and take their price back.
 *
 * Until this existed a package could be assembled and compared but never SENT: somebody had to
 * type the subcontractor's rates in themselves, so the tender lived entirely inside our office.
 *
 * THE SUBCONTRACTOR IS NOT A PLATFORM USER and must never need to be. This follows the rail the
 * platform already uses for a quote, a contract and a buyer: a long random token, a public page
 * that resolves it, and an edge function where THE TOKEN IS THE BOUNDARY.
 *
 * THE TOKEN IS PER BID, and that is the security model. It resolves to exactly one
 * subcontractor's own lines, so a forwarded link cannot show anybody what a competitor quoted. A
 * package-level token would hand every bidder the competition's prices, which is the one thing a
 * tender must never do.
 *
 * INVARIANTS:
 *   1  `send` is authenticated and the workspace is derived from the PACKAGE, never the body.
 *      The public actions trust nothing except the token: no id from the request is ever used to
 *      look a row up, and the reply carries only this bid's own package and lines.
 *   8  `submit` never spreads the request body into a write. Rates are matched to bid lines this
 *      token owns, and anything else in the payload is discarded.
 *   11 Every value interpolated into the invitation email goes through `escapeHtml`.
 */
import { createClient } from '@supabase/supabase-js';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { userCanAccessWorkspace } from '../_shared/auth.ts';
import { escapeHtml } from '../_shared/html.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Long enough that guessing is not a strategy, matching how contracts mint a signing token. */
const mintToken = () => crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
const TOKEN_TTL_DAYS = 30;

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface Body {
  action?: 'resolve_token' | 'submit' | 'send';
  token?: string;
  bid_id?: string;
  rates?: Array<{ bid_item_id?: string; rate?: number | null }>;
  notes?: string;
}

Deno.serve(withApiLogging('tender-bid-portal', async (req: Request) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');

  const body = (await req.json().catch(() => ({}))) as Body;
  const action = body.action;
  const service = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ───────────────────────────── PUBLIC (token only) ─────────────────────────────
  if (action === 'resolve_token' || action === 'submit') {
    const token = String(body.token ?? '');
    if (token.length < 32) throw new HttpError(400, 'invalid token');

    const { data: bid } = await service
      .from('tender_bids')
      .select('id, workspace_id, package_id, company_id, status, token_expires_at, notes')
      .eq('access_token', token)
      .maybeSingle();

    // Deliberately indistinguishable from a wrong token: a link that says "this one is expired"
    // confirms the token was real.
    if (!bid) return json({ not_found: true });
    const expired = bid.token_expires_at && new Date(bid.token_expires_at).getTime() < Date.now();
    if (expired || bid.status === 'withdrawn') return json({ not_found: true });

    const { data: pkg } = await service
      .from('tender_packages')
      .select('id, reference, name, scope, currency, due_at, status, project_id')
      .eq('id', bid.package_id)
      .maybeSingle();
    if (!pkg) return json({ not_found: true });

    // An awarded or cancelled package is closed to further pricing. Said plainly, because the
    // subcontractor is entitled to know the enquiry is over rather than type a price into nothing.
    if (pkg.status === 'awarded' || pkg.status === 'cancelled') {
      return json({ closed: true, package: { name: pkg.name, reference: pkg.reference } });
    }

    if (action === 'resolve_token') {
      const [{ data: items }, { data: lines }, { data: project }] = await Promise.all([
        service.from('tender_package_items')
          .select('id, item_ref, description, unit, quantity, sort')
          .eq('package_id', pkg.id).order('sort'),
        // Only THIS bid's lines. Never a join across bids — that is the leak the per-bid token
        // exists to prevent.
        service.from('tender_bid_items')
          .select('id, package_item_id, quantity, rate')
          .eq('bid_id', bid.id),
        service.from('projects').select('name').eq('id', pkg.project_id).maybeSingle(),
      ]);

      return json({
        ok: true,
        submitted: bid.status === 'received',
        package: {
          reference: pkg.reference,
          name: pkg.name,
          scope: pkg.scope,
          currency: pkg.currency,
          due_at: pkg.due_at,
          project_name: (project as { name?: string } | null)?.name ?? null,
        },
        items: items ?? [],
        lines: lines ?? [],
        notes: bid.notes,
      });
    }

    // ── submit ────────────────────────────────────────────────────────────────────
    const rates = Array.isArray(body.rates) ? body.rates : [];
    if (rates.length === 0 && typeof body.notes !== 'string') {
      throw new HttpError(400, 'Nothing to submit.');
    }

    // Invariant 8: the payload is not spread into a write. Every rate is matched against a line
    // THIS token owns, and anything naming a line it does not own is discarded rather than
    // rejected — a bidder cannot probe for other bids' line ids either way.
    const { data: own } = await service
      .from('tender_bid_items').select('id').eq('bid_id', bid.id);
    const ownIds = new Set((own ?? []).map((r: { id: string }) => r.id));

    let written = 0;
    for (const r of rates) {
      const id = typeof r.bid_item_id === 'string' ? r.bid_item_id : null;
      if (!id || !ownIds.has(id)) continue;
      // A blank stays NULL — not priced is a real answer and must never become a zero, which
      // would make an omission look like the cheapest bid.
      const rate = typeof r.rate === 'number' && Number.isFinite(r.rate) && r.rate >= 0 ? r.rate : null;
      const { error } = await service.from('tender_bid_items').update({ rate }).eq('id', id);
      if (!error) written++;
    }

    // Status and date move together — `tender_bids_received_has_date` refuses one without the other.
    const { error: bidErr } = await service
      .from('tender_bids')
      .update({
        status: 'received',
        submitted_at: new Date().toISOString(),
        ...(typeof body.notes === 'string' ? { notes: body.notes.slice(0, 4000) } : {}),
      })
      .eq('id', bid.id);
    if (bidErr) throw new HttpError(500, bidErr.message);

    return json({ ok: true, lines_priced: written });
  }

  // ───────────────────────────── AUTHENTICATED (send) ─────────────────────────────
  if (action !== 'send') throw new HttpError(400, 'Unknown action');

  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader) throw new HttpError(401, 'Missing Authorization bearer');
  const reader = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: who } = await reader.auth.getUser();
  const uid = who?.user?.id;
  if (!uid) throw new HttpError(401, 'Invalid session');

  const bidId = String(body.bid_id ?? '');
  if (!bidId) throw new HttpError(400, 'bid_id required');

  const { data: bid } = await service
    .from('tender_bids')
    .select('id, workspace_id, package_id, company_id, access_token, status')
    .eq('id', bidId)
    .maybeSingle();
  if (!bid) throw new HttpError(404, 'Bid not found');

  // Invariant 1: the workspace comes from the row, and the caller is checked against it.
  if (!(await userCanAccessWorkspace(service, uid, bid.workspace_id))) {
    throw new HttpError(404, 'Bid not found');
  }

  const [{ data: pkg }, { data: company }] = await Promise.all([
    service.from('tender_packages').select('reference, name, scope, due_at, currency').eq('id', bid.package_id).maybeSingle(),
    service.from('crm_companies').select('name, email').eq('id', bid.company_id).maybeSingle(),
  ]);

  // Re-issuing keeps the SAME token: a subcontractor who already has the link and starts pricing
  // must not have it invalidated because somebody pressed send twice.
  const token = bid.access_token ?? mintToken();
  const expires = new Date(Date.now() + TOKEN_TTL_DAYS * 86400_000).toISOString();

  const { error: updErr } = await service
    .from('tender_bids')
    .update({ access_token: token, token_expires_at: expires, sent_at: new Date().toISOString() })
    .eq('id', bid.id);
  if (updErr) throw new HttpError(500, updErr.message);

  const appUrl = Deno.env.get('PUBLIC_APP_URL') ?? 'https://app.materialshub.gr';
  const link = `${appUrl}/bid/${token}`;

  let emailed = false;
  const to = String((company as { email?: string } | null)?.email ?? '').trim();
  if (to) {
    try {
      const name = (company as { name?: string } | null)?.name ?? '';
      const pkgName = (pkg as { name?: string } | null)?.name ?? 'a package';
      const due = (pkg as { due_at?: string } | null)?.due_at;
      // Invariant 11: every interpolated value is escaped.
      const html =
        `<p>${name ? `Hello ${escapeHtml(name)},` : 'Hello,'}</p>`
        + `<p>You are invited to price <strong>${escapeHtml(pkgName)}</strong>.</p>`
        + (due ? `<p>Prices are due back by <strong>${escapeHtml(due)}</strong>.</p>` : '')
        + `<p><a href="${escapeHtml(link)}">Open the enquiry and enter your rates</a></p>`
        + `<p>The link is private to you — it shows only your own pricing, never anybody else's. `
        + `It expires in ${TOKEN_TTL_DAYS} days.</p>`;
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/email-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({
          action: 'send', to, subject: `Enquiry: ${pkgName}`,
          html, emailType: 'transactional', workspace_id: bid.workspace_id,
          tags: { feature: 'tender', bid_id: bid.id },
        }),
      });
      emailed = resp.ok;
    } catch (_) { /* best-effort: the link is still returned so it can be sent by hand */ }
  }

  // The link comes back whether or not the email went, because a company with no email address on
  // file is normal and the buyer can still paste it into their own message.
  return json({ ok: true, link, emailed, has_email: !!to });
}));
