/**
 * catalog-access
 *
 * Public-facing email gate for /c/:slug. Three actions, one endpoint:
 *
 *   POST { action: 'request', slug, email }
 *     → Looks up the catalog by slug. Matches email against:
 *       1. auth.users (platform user)
 *       2. crm_contacts (private CRM contact)
 *       3. crm_companies (B2B contact)
 *       4. catalog_email_grants (admin-managed allowlist for this catalog)
 *       Logs the attempt to catalog_access_log. If matched, mints a 30-day
 *       cookie token and returns it in the response (frontend sets the
 *       cookie itself since this is cross-origin from the API). On mismatch,
 *       returns granted_access:false (no leak about whether catalog exists).
 *
 *   POST { action: 'verify', slug, token }
 *     → Looks up the cookie token in catalog_access_log. Returns the catalog
 *       payload (cover/body/back) if the token is fresh and matches the slug.
 *
 *   POST { action: 'public_meta', slug }
 *     → Returns minimal info (title, subtitle, owner branding) for the
 *       email-gate landing page itself. Does NOT include body materials.
 *
 * No auth header required — this is the only endpoint reachable by anonymous
 * visitors. Edge function uses the service role internally.
 */
import { createClient } from '@supabase/supabase-js';
import { jsonResponse } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { recordPageEvent } from '../_shared/document-events.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const TOKEN_TTL_DAYS = 30;
const TOKEN_TTL_MS = TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

interface RequestBody {
  action: 'request' | 'verify' | 'public_meta' | 'track_view' | 'track_download';
  slug?: string;
  email?: string;
  token?: string;
  metadata?: Record<string, any>;
}

// Workspace identity is canonical in finance_settings, and the workspace is the CATALOG's own —
// `presentation_catalogs.workspace_id`, never a guess at the owner's primary membership. A
// multi-workspace owner sharing a catalog otherwise gets another company's branding on it.
async function resolveOwnerBranding(supabase: any, workspaceId: string | null): Promise<{ logo_url: string | null; company_name: string | null; contact_line: string | null }> {
  const empty = { logo_url: null, company_name: null, contact_line: null };
  if (!workspaceId) return empty;
  const { data: fs } = await supabase.from('finance_settings').select('business_name, business_logo_path, branding_contact_line').eq('workspace_id', workspaceId).maybeSingle();
  const logo_url = fs?.business_logo_path ? supabase.storage.from('generation-images').getPublicUrl(fs.business_logo_path).data.publicUrl : null;
  return { logo_url, company_name: fs?.business_name ?? null, contact_line: fs?.branding_contact_line ?? null };
}

/**
 * What an email-gated VIEWER may see of a catalog (#364 EX-4).
 *
 * The grant is row-level — "this email may read this catalog" — but the row is not what the
 * page renders. `verify` used to return `cover_data`, `body_data` and `back_cover_data` as the
 * raw jsonb the builder wrote, so every material also carried `provenance` (the source PDF id
 * and page it was lifted from), `price_source` / `price_source_ref`, `image_source_ref` (a
 * product id or the supplier URL an image was scraped from) and `specs_raw`. None of that is on
 * the page; all of it is internal, and jsonb accepts whatever a future writer adds.
 *
 * So this is an ALLOWLIST, keyed to what PublicCatalogPage actually renders, not a denylist of
 * the internal keys we happen to know about today.
 */
function projectCatalogForViewer(catalog: Record<string, any>, pdfUrl: string | null) {
  const sections = Array.isArray(catalog.body_data?.sections) ? catalog.body_data.sections : [];
  return {
    id: catalog.id,
    slug: catalog.slug,
    title: catalog.title,
    subtitle: catalog.subtitle,
    description: catalog.description,
    cover_data: {
      cover_image_url: catalog.cover_data?.cover_image_url ?? null,
      date: catalog.cover_data?.date ?? null,
    },
    body_data: {
      sections: sections.map((section: any) => ({
        id: section?.id ?? null,
        title: section?.title ?? null,
        intro: section?.intro ?? null,
        materials: (Array.isArray(section?.materials) ? section.materials : []).map((m: any) => ({
          id: m?.id ?? null,
          name: m?.name ?? null,
          description: m?.description ?? null,
          image_url: m?.image_url ?? null,
          price: m?.price ?? null,
          currency: m?.currency ?? null,
          // `specs` IS the spec block the card prints. `specs_raw` — the unparsed extraction
          // output it was derived from — is not.
          specs: m?.specs ?? {},
        })),
      })),
    },
    back_cover_data: {
      closing_message: catalog.back_cover_data?.closing_message ?? null,
      contact_line: catalog.back_cover_data?.contact_line ?? null,
    },
    pdf_url: pdfUrl,
  };
}

Deno.serve(withApiLogging('catalog-access', async (req) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body: RequestBody = await req.json();
    if (!body.action || !body.slug) return jsonResponse({ error: 'action and slug are required' }, 400);

    const slug = body.slug.toLowerCase().trim();

    if (body.action === 'public_meta') {
      const { data: catalog } = await supabase
        .from('presentation_catalogs')
        .select('id, owner_user_id, workspace_id, title, subtitle, description, cover_data, status')
        .eq('slug', slug)
        .eq('status', 'published')
        .maybeSingle();
      if (!catalog) return jsonResponse({ error: 'Not found' }, 404);

      const branding = await resolveOwnerBranding(supabase, catalog.workspace_id ?? null);

      return jsonResponse({
        title: catalog.title,
        subtitle: catalog.subtitle,
        cover_image_url: catalog.cover_data?.cover_image_url || null,
        branding: {
          logo_url: branding.logo_url,
          company_name: branding.company_name,
        },
      });
    }

    if (body.action === 'request') {
      if (!body.email || !isLikelyEmail(body.email)) {
        return jsonResponse({ error: 'Valid email is required' }, 400);
      }
      const email = body.email.toLowerCase().trim();

      const { data: catalog } = await supabase
        .from('presentation_catalogs')
        .select('id, status, owner_user_id, workspace_id')
        .eq('slug', slug)
        .maybeSingle();
      if (!catalog || catalog.status !== 'published') {
        return jsonResponse({ granted_access: false });
      }

      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
      const ua = req.headers.get('user-agent') || null;

      // Scope every membership / CRM lookup to the CATALOG's workspace (#364 EX-3). This used
      // to be the owner's EARLIEST active membership: for a multi-workspace owner it decided
      // who may read a catalog using a different tenant's contact list entirely — the same
      // first-workspace mistake as `CM-22` in #359, except here it is the access decision.
      const match = await resolveEmailMatch(supabase, catalog.id, email, catalog.workspace_id ?? null);

      const tokenStr = match.granted ? generateToken() : null;
      const expiresAt = match.granted ? new Date(Date.now() + TOKEN_TTL_MS).toISOString() : null;

      const { data: gateRow, error: gateErr } = await supabase.from('catalog_access_log').insert({
        catalog_id: catalog.id,
        email,
        matched_kind: match.kind,
        matched_user_id: match.userId,
        matched_crm_contact_id: match.crmContactId,
        matched_crm_company_id: match.crmCompanyId,
        matched_grant_id: match.grantId,
        granted_access: match.granted,
        ip_address: ip,
        user_agent: ua,
        cookie_token: tokenStr,
        cookie_expires_at: expiresAt,
      }).select('id').single();

      // The access log row is the server-side record of the issued token. If it failed
      // to persist, the token we'd hand back can't be validated later — fail closed.
      if (gateErr || (match.granted && !gateRow?.id)) {
        console.error('[catalog-access] Failed to persist access log row:', gateErr);
        return jsonResponse({ error: 'Failed to record access; please retry.' }, 500);
      }

      if (match.granted) {
        // Bump unique-email counter only when this is the first grant for
        // this email/catalog pair (RPC handles the conditional logic).
        await supabase.rpc('catalog_bump_unique_email_count', {
          p_catalog_id: catalog.id,
          p_email: email,
        }).then(({ error }) => {
          if (error) console.warn('[catalog-access] unique_email_count bump failed:', error.message);
        });
      }

      return jsonResponse({
        granted_access: match.granted,
        token: tokenStr,
        expires_at: expiresAt,
        match_kind: match.kind,
        access_log_id: gateRow?.id ?? null,
      });
    }

    if (body.action === 'track_view' || body.action === 'track_download') {
      if (!body.token) return jsonResponse({ tracked: false, error: 'token required' }, 400);

      const { data: log } = await supabase
        .from('catalog_access_log')
        .select('id, catalog_id, email, granted_access, cookie_expires_at, matched_user_id, matched_kind')
        .eq('cookie_token', body.token)
        .maybeSingle();
      if (!log || !log.granted_access) return jsonResponse({ tracked: false }, 200);
      if (log.cookie_expires_at && new Date(log.cookie_expires_at) < new Date()) {
        return jsonResponse({ tracked: false, reason: 'token_expired' });
      }

      const { data: catalog } = await supabase
        .from('presentation_catalogs')
        // workspace_id / owner_user_id are needed for the delivery trail's tenancy —
        // record_document_event rejects an event with neither, and a catalog row
        // predating the workspace backfill still has an owner.
        .select('id, slug, status, workspace_id, owner_user_id')
        .eq('id', log.catalog_id)
        .maybeSingle();
      if (!catalog || catalog.status !== 'published' || catalog.slug !== slug) {
        return jsonResponse({ tracked: false }, 200);
      }

      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
      const ua = req.headers.get('user-agent') || null;
      const eventType = body.action === 'track_view' ? 'page_view' : 'pdf_download';

      await supabase.from('catalog_view_events').insert({
        catalog_id: catalog.id,
        access_log_id: log.id,
        event_type: eventType,
        email: log.email,
        matched_user_id: log.matched_user_id,
        matched_kind: log.matched_kind,
        cookie_token: body.token,
        ip_address: ip,
        user_agent: ua,
        metadata: body.metadata || {},
      });

      // Delivery trail — the source the catalog list reads. `catalog_view_events`
      // stays as the catalog module's own funnel detail (access-log correlation,
      // cookie stitching, matched_kind); this answers the narrower question the
      // list column asks, in the same shape as every other document.
      recordPageEvent(supabase, req, eventType === 'page_view' ? 'viewed' : 'downloaded', {
        entityType: 'catalog',
        entityId: catalog.id,
        workspaceId: catalog.workspace_id,
        ownerUserId: catalog.workspace_id ? null : catalog.owner_user_id,
        actorEmail: log.email,
        actorUserId: log.matched_user_id,
        metadata: { surface: 'public_catalog', matched_kind: log.matched_kind },
      }).catch(() => {});

      // Atomic view counter — only bumped on page_view events; pdf_download
      // is a separate dimension shown alongside on the operations screen.
      if (eventType === 'page_view') {
        await supabase.rpc('catalog_increment_view_count', {
          p_catalog_id: catalog.id,
        }).then(({ error }) => {
          if (error) console.warn('[catalog-access] view_count bump failed:', error.message);
        });
      }

      return jsonResponse({ tracked: true, event_type: eventType });
    }

    if (body.action === 'verify') {
      if (!body.token) return jsonResponse({ granted_access: false }, 200);

      const { data: log } = await supabase
        .from('catalog_access_log')
        .select('catalog_id, email, granted_access, cookie_expires_at')
        .eq('cookie_token', body.token)
        .maybeSingle();

      if (!log || !log.granted_access) return jsonResponse({ granted_access: false });
      if (log.cookie_expires_at && new Date(log.cookie_expires_at) < new Date()) {
        return jsonResponse({ granted_access: false, reason: 'token_expired' });
      }

      const { data: catalog } = await supabase
        .from('presentation_catalogs')
        .select('id, owner_user_id, workspace_id, slug, title, subtitle, description, cover_data, body_data, back_cover_data, status, pdf_url, pdf_storage_path')
        .eq('id', log.catalog_id)
        .maybeSingle();
      if (!catalog || catalog.status !== 'published' || catalog.slug !== slug) {
        return jsonResponse({ granted_access: false });
      }

      // Immediate revocation: a 30-day cookie token must not outlive the access that
      // produced it. Re-validate that the email STILL matches (grant revoked, CRM contact
      // removed, or workspace membership lost since the token was minted) using the SAME
      // resolution — and the same workspace — as the original `request` grant.
      const recheck = await resolveEmailMatch(supabase, catalog.id, log.email, catalog.workspace_id ?? null);
      if (!recheck.granted) {
        return jsonResponse({ granted_access: false, reason: 'access_revoked' });
      }

      // Rebuild the catalog PDF if the storage-retention sweep purged it. The page
      // renders from body_data regardless, but the download link needs a live file.
      // The renderer accepts the service-role key (cross-tenant 'secret' level);
      // credit-free. Best-effort — self-heals on the first view after a purge.
      let catalogPdfPath: string | null = catalog.pdf_storage_path;
      if (!catalogPdfPath) {
        try {
          await fetch(`${supabaseUrl}/functions/v1/generate-catalog-pdf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseServiceKey}` },
            body: JSON.stringify({ catalog_id: catalog.id, regenerate: true }),
          });
          const { data: fresh } = await supabase
            .from('presentation_catalogs').select('pdf_storage_path').eq('id', catalog.id).maybeSingle();
          catalogPdfPath = fresh?.pdf_storage_path ?? null;
        } catch (_) {
          /* best-effort */
        }
      }
      const catalogPdfUrl = catalogPdfPath
        ? (await supabase.storage.from('pdf-documents').createSignedUrl(catalogPdfPath, 604800))?.data?.signedUrl ?? catalog.pdf_url
        : catalog.pdf_url;

      const branding = await resolveOwnerBranding(supabase, catalog.workspace_id ?? null);

      return jsonResponse({
        granted_access: true,
        email: log.email,
        catalog: projectCatalogForViewer(catalog, catalogPdfUrl),
        branding: {
          logo_url: branding.logo_url,
          company_name: branding.company_name,
          contact_line: branding.contact_line,
        },
      });
    }

    return jsonResponse({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error('[catalog-access] error:', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'Access failed' }, 500);
  }
}));

interface MatchResult {
  granted: boolean;
  kind: 'platform_user' | 'crm_contact' | 'crm_company' | 'email_grant' | 'denied';
  userId: string | null;
  crmContactId: string | null;
  crmCompanyId: string | null;
  grantId: string | null;
}

/**
 * `workspaceId` is the CATALOG's workspace and is REQUIRED for the membership and CRM checks.
 *
 * The old signature made it optional, and the unscoped branches were not a degraded mode — they
 * were a different, much wider rule: any platform user's email anywhere on the instance matched,
 * and the CRM lookups searched every tenant's contacts and companies. Absent a workspace we now
 * fall through to the per-catalog `catalog_email_grants` allowlist, which is scoped by
 * construction. Fail closed: an unresolved tenant withholds access, it does not widen it.
 */
async function resolveEmailMatch(supabase: any, catalogId: string, email: string, workspaceId: string | null): Promise<MatchResult> {
  if (workspaceId) {
    // Check 1: platform user who is a member of the catalog's workspace
    const { data: members } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId)
      .eq('status', 'active');
    const memberIds = (members || []).map((m: any) => m.user_id);
    if (memberIds.length > 0) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('user_id')
        .ilike('email', email)
        .in('user_id', memberIds)
        .limit(1)
        .maybeSingle();
      if (profile?.user_id) {
        return { granted: true, kind: 'platform_user', userId: profile.user_id, crmContactId: null, crmCompanyId: null, grantId: null };
      }
    }

    // Check 2: CRM contact in the catalog's workspace
    const { data: contact } = await supabase.from('crm_contacts').select('id')
      .ilike('email', email).eq('workspace_id', workspaceId).limit(1).maybeSingle();
    if (contact?.id) {
      return { granted: true, kind: 'crm_contact', userId: null, crmContactId: contact.id, crmCompanyId: null, grantId: null };
    }

    // Check 3: CRM company in the catalog's workspace
    const { data: company } = await supabase.from('crm_companies').select('id')
      .ilike('email', email).eq('workspace_id', workspaceId).limit(1).maybeSingle();
    if (company?.id) {
      return { granted: true, kind: 'crm_company', userId: null, crmContactId: null, crmCompanyId: company.id, grantId: null };
    }
  }

  const { data: grant } = await supabase
    .from('catalog_email_grants')
    .select('id, expires_at, revoked_at')
    .eq('catalog_id', catalogId)
    .ilike('email', email)
    .maybeSingle();
  if (grant?.id && !grant.revoked_at && (!grant.expires_at || new Date(grant.expires_at) > new Date())) {
    return { granted: true, kind: 'email_grant', userId: null, crmContactId: null, crmCompanyId: null, grantId: grant.id };
  }

  return { granted: false, kind: 'denied', userId: null, crmContactId: null, crmCompanyId: null, grantId: null };
}

function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function isLikelyEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

