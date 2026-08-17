/**
 * role-upgrade-requests
 *
 * Single edge function for the supplier/architect promotion workflow:
 *
 *   POST /submit   (any authed user)
 *     body: { requested_role: 'supplier' | 'architect', justification?: string }
 *     - Validates the caller is a Business entity (entity_type='business' + business_id set).
 *     - Resolves requested_role → role_id.
 *     - Inserts a role_upgrade_requests row (partial unique index prevents duplicates).
 *     - Fans out: bell notification + email (template role_upgrade_request.submitted) to every admin.
 *
 *   POST /approve  (admin only)
 *     body: { request_id: string, admin_note?: string }
 *     - Flips the request to approved + sets reviewed_by/reviewed_at.
 *     - Updates user_profiles.role_id to the requested role.
 *     - Emails the user (template role_upgrade_request.approved).
 *
 *   POST /reject   (admin only)
 *     body: { request_id: string, admin_note?: string }
 *     - Flips the request to rejected.
 *     - Emails the user (template role_upgrade_request.rejected).
 */
import type { DbClient } from '../_shared/supabase-client.ts';
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { emitFlowEvent } from '../_shared/flow-events.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
const PUBLIC_APP_URL = (Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr').replace(/\/$/, '');

const VIES_URL = 'https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number';
const VIES_EU_COUNTRY_CODES = new Set([
  'AT','BE','BG','CY','CZ','DE','DK','EE','EL','ES','FI','FR','HR','HU',
  'IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK','XI',
]);

interface ViesSnapshot {
  vat_validated: boolean | null;
  vat_validated_at: string;
  vat_validated_name: string | null;
  vat_validation_source: 'vies';
  status_text: string;
  status_html: string;
}

function normalizeVat(countryCode: string | null, vatNumber: string | null): { country: string; number: string } {
  const rawNumber = (vatNumber || '').replace(/\s+/g, '').toUpperCase();
  const rawCountry = (countryCode || '').trim().toUpperCase();
  const m = rawNumber.match(/^([A-Z]{2})(.+)$/);
  if (m && VIES_EU_COUNTRY_CODES.has(m[1])) return { country: m[1], number: m[2] };
  return { country: rawCountry, number: rawNumber };
}

async function validateVatLive(countryCode: string | null, vatNumber: string | null): Promise<ViesSnapshot> {
  const checkedAt = new Date().toISOString();
  if (!vatNumber || !countryCode) {
    return {
      vat_validated: null,
      vat_validated_at: checkedAt,
      vat_validated_name: null,
      vat_validation_source: 'vies',
      status_text: 'no VAT on file',
      status_html: '<span style="color:#b91c1c">[no VAT on file]</span>',
    };
  }
  const { country, number } = normalizeVat(countryCode, vatNumber);
  if (!VIES_EU_COUNTRY_CODES.has(country)) {
    return {
      vat_validated: null,
      vat_validated_at: checkedAt,
      vat_validated_name: null,
      vat_validation_source: 'vies',
      status_text: 'non-EU, not validated',
      status_html: '<span style="color:#b45309">[non-EU, not validated]</span>',
    };
  }
  try {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 15_000);
    const response = await fetch(VIES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ countryCode: country, vatNumber: number }),
      signal: abort.signal,
    });
    clearTimeout(timer);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json() as { valid: boolean; name?: string };
    // Split VIES "legal_name||trade_name" convention — store legal name only.
    let name: string | null = null;
    if (data.name && data.name !== '---') {
      const cleaned = data.name.replace(/\s+/g, ' ').trim();
      name = cleaned.includes('||') ? (cleaned.split('||')[0].trim() || null) : cleaned;
    }
    return {
      vat_validated: data.valid === true,
      vat_validated_at: checkedAt,
      vat_validated_name: name,
      vat_validation_source: 'vies',
      status_text: data.valid ? `verified via VIES${name ? ` as ${name}` : ''}` : 'VIES says invalid',
      status_html: data.valid
        ? `<span style="color:#15803d">[✓ verified via VIES${name ? ` as <strong>${name}</strong>` : ''}]</span>`
        : '<span style="color:#b91c1c">[✗ VIES says invalid]</span>',
    };
  } catch (err) {
    console.warn('[role-upgrade-requests] VIES validation failed:', err);
    return {
      vat_validated: null,
      vat_validated_at: checkedAt,
      vat_validated_name: null,
      vat_validation_source: 'vies',
      status_text: 'VIES unreachable at submission time',
      status_html: '<span style="color:#b45309">[VIES unreachable at submission time]</span>',
    };
  }
}

type AllowedRole = 'supplier' | 'architect';

interface SubmitBody {
  requested_role: AllowedRole;
  justification?: string;
}

interface ReviewBody {
  request_id: string;
  admin_note?: string;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function authedUser(req: Request) {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  return user;
}

async function isAdmin(supabase: DbClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('user_profiles')
    .select('roles!user_profiles_role_id_fkey(name)')
    .eq('user_id', userId)
    .maybeSingle();
  // deno-lint-ignore no-explicit-any
  const roleName = (data as any)?.roles?.name as string | undefined;
  return roleName === 'admin' || roleName === 'super_admin' || roleName === 'owner';
}

async function sendEmail(
  supabase: DbClient,
  to: string,
  subject: string,
  templateSlug: string,
  variables: Record<string, string>,
) {
  try {
    await supabase.functions.invoke('email-api', {
      body: {
        action: 'send',
        to,
        subject,
        templateSlug,
        variables,
        emailType: 'transactional',
        tags: { feature: 'role_upgrade_requests' },
      },
    });
  } catch (err) {
    console.error(`[role-upgrade-requests] email send failed for ${to}:`, err);
  }
}

Deno.serve(withApiLogging('role-upgrade-requests', async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const user = await authedUser(req);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const rawBody = await req.json().catch(() => ({}));
    const action = (rawBody as { action?: string }).action;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (action === 'submit') {
      const body = rawBody as SubmitBody & { action: string };
      if (!body.requested_role || !['supplier', 'architect'].includes(body.requested_role)) {
        return jsonResponse({ error: 'requested_role must be "supplier" or "architect"' }, 400);
      }

      // Business-entity gate
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('entity_type, business_id, full_name, email')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!profile || profile.entity_type !== 'business' || !profile.business_id) {
        return jsonResponse(
          { error: 'business_required', message: 'Complete your Business profile before applying for a Dealer or Factory role.' },
          400,
        );
      }

      // Resolve role
      const { data: targetRole } = await supabase
        .from('roles')
        .select('id, name')
        .eq('name', body.requested_role)
        .maybeSingle();
      if (!targetRole) return jsonResponse({ error: 'role_not_found' }, 500);

      // Resolve business details for the notification payload + VIES re-validation
      const { data: business } = await supabase
        .from('crm_companies')
        .select('name, vat_number, country, country_code, vat_validated, vat_validated_at, vat_validated_name')
        .eq('id', profile.business_id)
        .maybeSingle();

      // Re-validate VAT via VIES at submission time (snapshot baked into the request row).
      // Skip the live call if the cached validation is recent (≤ 30 days) and TRUE — saves a round trip.
      let viesSnapshot: ViesSnapshot;
      const cachedAge = business?.vat_validated_at
        ? Date.now() - new Date(business.vat_validated_at).getTime()
        : Infinity;
      const cacheFreshEnough = business?.vat_validated === true && cachedAge < 30 * 24 * 3600 * 1000;
      if (cacheFreshEnough) {
        viesSnapshot = {
          vat_validated: true,
          vat_validated_at: business!.vat_validated_at!,
          vat_validated_name: business!.vat_validated_name ?? null,
          vat_validation_source: 'vies',
          status_text: `verified via VIES${business!.vat_validated_name ? ` as ${business!.vat_validated_name}` : ''} (cached)`,
          status_html: `<span style="color:#15803d">[✓ verified via VIES${business!.vat_validated_name ? ` as <strong>${business!.vat_validated_name}</strong>` : ''}]</span>`,
        };
      } else {
        viesSnapshot = await validateVatLive(
          business?.country_code ?? null,
          business?.vat_number ?? null,
        );
        // Best-effort cache update on crm_companies
        if (business && viesSnapshot.vat_validated !== null) {
          await supabase.from('crm_companies').update({
            vat_validated: viesSnapshot.vat_validated,
            vat_validated_at: viesSnapshot.vat_validated_at,
            vat_validated_name: viesSnapshot.vat_validated_name,
            vat_validation_source: 'vies',
            updated_at: new Date().toISOString(),
          }).eq('id', profile.business_id);
        }
      }

      // Insert request (partial unique index will reject a duplicate pending)
      const { data: inserted, error: insertErr } = await supabase
        .from('role_upgrade_requests')
        .insert({
          user_id: user.id,
          requested_role_id: targetRole.id,
          justification: body.justification?.trim() || null,
          vat_validated: viesSnapshot.vat_validated,
          vat_validated_at: viesSnapshot.vat_validated_at,
          vat_validated_name: viesSnapshot.vat_validated_name,
          vat_validation_source: viesSnapshot.vat_validation_source,
        })
        .select('id')
        .single();

      if (insertErr) {
        if (insertErr.code === '23505') {
          return jsonResponse(
            { error: 'pending_request_exists', message: 'You already have a pending application for this role.' },
            409,
          );
        }
        return jsonResponse({ error: insertErr.message }, 500);
      }

      // Fan out to admins: bell notification + email
      const { data: admins } = await supabase
        .from('user_profiles')
        .select('user_id, email, full_name, roles!user_profiles_role_id_fkey(name)')
        .in('status', ['active']);

      const adminRows = (admins ?? []).filter((row) => {
        // deno-lint-ignore no-explicit-any
        const rn = (row as any).roles?.name as string | undefined;
        return rn === 'admin' || rn === 'super_admin' || rn === 'owner';
      });

      const actionUrl = `${PUBLIC_APP_URL}/admin/crm/users/${user.id}`;
      const requestedRoleLabel = body.requested_role.charAt(0).toUpperCase() + body.requested_role.slice(1);

      for (const admin of adminRows) {
        // deno-lint-ignore no-explicit-any
        const a = admin as any;
        // Per-admin emit (fan-out happens in this loop). Delivered by the
        // "Role Upgrade Requested" flow (Flows dashboard).
        emitFlowEvent('role_upgrade_request_submitted', {
          user_id: a.user_id,
          type: 'role_upgrade_request',
          title: `New ${requestedRoleLabel} application`,
          body: `${profile.full_name || profile.email || 'A user'} applied to become a ${requestedRoleLabel}. VAT: ${viesSnapshot.status_text}.`,
          action_url: actionUrl,
        }).catch(() => {});

        if (a.email) {
          await sendEmail(supabase, a.email, `New ${requestedRoleLabel} application from ${profile.full_name || profile.email || 'a user'}`, 'role_upgrade_request.submitted', {
            admin_name: a.full_name || 'Admin',
            user_name: profile.full_name || profile.email || 'User',
            user_email: profile.email || '',
            requested_role: requestedRoleLabel,
            business_name: business?.name || '',
            business_vat: business?.vat_number || '',
            business_country: business?.country || '',
            justification: body.justification?.trim() || '(no justification provided)',
            action_url: actionUrl,
            request_id: inserted.id,
            vat_status_html: viesSnapshot.status_html,
            vat_status_text: viesSnapshot.status_text,
          });
        }
      }

      return jsonResponse({ success: true, request_id: inserted.id });
    }

    if (action === 'approve' || action === 'reject') {
      const admin = await isAdmin(supabase, user.id);
      if (!admin) return jsonResponse({ error: 'Forbidden' }, 403);

      const body = rawBody as ReviewBody & { action: string };
      if (!body.request_id) return jsonResponse({ error: 'request_id required' }, 400);

      // ONE call, ONE transaction, and the latch lives in the RPC's UPDATE ... WHERE
      // status = 'pending' (#364 EX-15). The old shape read the status, then wrote the request
      // row, then wrote user_profiles as a separate statement: a failure between the two left a
      // request marked approved whose applicant was never promoted — and the status guard then
      // 409'd every retry, so it could not be repaired. Two concurrent approvals also both got
      // through, sending the applicant two of everything.
      const { data: reviewRows, error: reviewErr } = await supabase.rpc('review_role_upgrade_request', {
        p_request_id: body.request_id,
        p_reviewer_id: user.id,
        p_approve: action === 'approve',
        p_admin_note: body.admin_note?.trim() || null,
      });
      if (reviewErr) {
        // 42501 is the RPC's own "not an operator" — the isAdmin() check above already covers
        // the normal path, so this only fires if the two ever disagree.
        return jsonResponse({ error: reviewErr.code === '42501' ? 'Forbidden' : reviewErr.message },
          reviewErr.code === '42501' ? 403 : 500);
      }
      const review = (Array.isArray(reviewRows) ? reviewRows[0] : reviewRows) as {
        claimed: boolean;
        applicant_id: string | null;
        requested_role_id: string | null;
        requested_role_name: string | null;
        current_status: string | null;
      } | null;

      if (!review?.claimed) {
        if (!review?.current_status) return jsonResponse({ error: 'request_not_found' }, 404);
        return jsonResponse(
          { error: 'already_reviewed', message: `Request is already ${review.current_status}.` },
          409,
        );
      }

      // Everything below is notification only — the decision and the promotion are already
      // committed together, so a failure here cannot leave the two out of step.
      const { data: applicant } = await supabase
        .from('user_profiles')
        .select('email, full_name')
        .eq('user_id', review.applicant_id!)
        .maybeSingle();

      const requestedRoleName = review.requested_role_name ?? 'member';
      const requestedRoleLabel = requestedRoleName.charAt(0).toUpperCase() + requestedRoleName.slice(1);
      const actionUrl = `${PUBLIC_APP_URL}/`;

      if (action === 'approve') {
        if (applicant?.email) {
          await sendEmail(supabase, applicant.email, `Your ${requestedRoleLabel} application was approved`, 'role_upgrade_request.approved', {
            user_name: applicant.full_name || applicant.email,
            requested_role: requestedRoleLabel,
            admin_note: body.admin_note?.trim() || '',
            action_url: actionUrl,
            request_id: body.request_id,
          });
        }

        // Delivered by the "Role Upgrade Approved" flow (Flows dashboard).
        emitFlowEvent('role_upgrade_approved', {
          user_id: review.applicant_id!,
          type: 'role_upgrade_approved',
          title: `You are now a ${requestedRoleLabel}`,
          body: 'Your application has been approved.',
          action_url: actionUrl,
          request_id: body.request_id,
          requested_role: requestedRoleName,
        }).catch(() => {});

        return jsonResponse({ success: true, status: 'approved' });
      }

      // reject — already committed by the RPC above; only the notifications remain.
      if (applicant?.email) {
        await sendEmail(supabase, applicant.email, `Update on your ${requestedRoleLabel} application`, 'role_upgrade_request.rejected', {
          user_name: applicant.full_name || applicant.email,
          requested_role: requestedRoleLabel,
          admin_note: body.admin_note?.trim() || '',
          action_url: actionUrl,
          request_id: body.request_id,
        });
      }

      // Delivered by the "Role Upgrade Rejected" flow (Flows dashboard).
      emitFlowEvent('role_upgrade_rejected', {
        user_id: review.applicant_id!,
        type: 'role_upgrade_rejected',
        title: `Your ${requestedRoleLabel} application`,
        body: body.admin_note?.trim() || 'Your application was not approved at this time.',
        action_url: actionUrl,
        request_id: body.request_id,
        requested_role: requestedRoleName,
      }).catch(() => {});

      return jsonResponse({ success: true, status: 'rejected' });
    }

    return jsonResponse({ error: 'unknown_action', message: 'Use /submit, /approve, or /reject.' }, 404);
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown error';
    console.error('[role-upgrade-requests] error:', err);
    return jsonResponse({ error: 'internal_error', detail }, 500);
  }
}));
