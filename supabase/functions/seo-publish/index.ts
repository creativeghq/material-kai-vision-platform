/** seo-publish — publish an SEO article to the workspace's own WordPress site, and connect that site. */

import { createClient } from '@supabase/supabase-js';
import { jsonResponse } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, userCanAccessWorkspace } from '../_shared/auth.ts';
import { assertEntitled } from '../_shared/entitlement.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { assertSafeUrl, SSRFError } from '../_shared/ssrf-guard.ts';
import type { DbClient } from '../_shared/supabase-client.ts';
import { faqPairs, jsonLdScript, markdownToHtml } from '../_shared/seo/markdown-html.ts';

const SEO_MODULE = 'seo-toolkit';

const MAX_RESPONSE_BYTES = 2_000_000;
const STALE_CLAIM_MS = 2 * 60_000;

interface WpCreds { site_url: string; username: string; password: string }

class WpError extends Error {
  constructor(message: string, readonly status = 502) { super(message); }
}

function basicAuth(user: string, pass: string): string {
  const bytes = new TextEncoder().encode(`${user}:${pass}`);
  return `Basic ${btoa(String.fromCharCode(...bytes))}`;
}

async function wp(creds: WpCreds, method: 'GET' | 'POST', path: string, body?: unknown): Promise<any> {
  let url: string;
  try {
    url = await assertSafeUrl(`${creds.site_url.replace(/\/+$/, '')}/wp-json${path}`, { allowSchemes: ['https:'] });
  } catch (e) {
    throw new WpError(e instanceof SSRFError ? `That address cannot be reached from here: ${e.message}` : 'Invalid site address', 400);
  }
  const res = await fetch(url, {
    method,
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
    headers: {
      Authorization: basicAuth(creds.username, creds.password),
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status >= 300 && res.status < 400) {
    throw new WpError(`The site redirected to ${res.headers.get('location') ?? 'another address'}. Use the final https address of the site.`, 400);
  }
  const text = (await res.text()).slice(0, MAX_RESPONSE_BYTES);
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!res.ok) {
    const reason = json?.message ? String(json.message).replace(/<[^>]*>/g, '').slice(0, 300) : `HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403) throw new WpError(`WordPress refused the login: ${reason}`, 400);
    if (res.status === 404) throw new WpError(`WordPress REST API not found at /wp-json: ${reason}`, 400);
    throw new WpError(`WordPress answered ${res.status}: ${reason}`);
  }
  if (json === null) throw new WpError('WordPress returned something that is not JSON. Is this a WordPress site?');
  return json;
}

async function memberRole(supabase: DbClient, workspaceId: string, userId: string): Promise<string | null> {
  const { data } = await supabase.from('workspace_members').select('role')
    .eq('workspace_id', workspaceId).eq('user_id', userId).eq('status', 'active').maybeSingle();
  return (data as { role?: string } | null)?.role ?? null;
}

function slugify(s: string): string {
  return s.normalize('NFKD').toLowerCase().replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 180);
}

function articleHtml(a: { title: string; markdown: string; meta: string | null; url: string | null }): string {
  const body = a.markdown.replace(/^\s*#\s+[^\n]*\n/, '');
  const faq = faqPairs(a.markdown);
  const graph: unknown[] = [{
    '@type': 'Article', headline: a.title, ...(a.meta ? { description: a.meta } : {}), ...(a.url ? { mainEntityOfPage: a.url } : {}),
  }];
  if (faq.length) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: faq.map((p) => ({ '@type': 'Question', name: p.question, acceptedAnswer: { '@type': 'Answer', text: p.answer } })),
    });
  }
  return `${markdownToHtml(body)}\n${jsonLdScript({ '@context': 'https://schema.org', '@graph': graph })}`;
}

async function handleWordpressConnect(req: Request, body: any): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const auth = await authenticate(req);
  if (!auth.success || !auth.userId) return jsonResponse({ success: false, error: auth.error || 'Unauthorized' }, 401);
  const workspaceId = String(body.workspace_id ?? '');
  const role = workspaceId ? await memberRole(supabase, workspaceId, auth.userId) : null;
  if (!role) return jsonResponse({ success: false, error: 'Not found' }, 404);
  if (!['owner', 'admin'].includes(role)) return jsonResponse({ success: false, error: 'Only a workspace owner or admin can connect a site.' }, 403);

  if (body.disconnect === true) {
    const { error } = await supabase.from('workspace_wordpress_credentials').delete().eq('workspace_id', workspaceId);
    if (error) return jsonResponse({ success: false, error: error.message }, 500);
    return jsonResponse({ success: true, connected: false });
  }

  let site: URL;
  try { site = new URL(String(body.site_url ?? '').trim()); } catch { return jsonResponse({ success: false, error: 'Enter the site address, e.g. https://example.com' }, 400); }
  if (site.protocol !== 'https:') return jsonResponse({ success: false, error: 'The site must use https.' }, 400);
  const siteUrl = `${site.origin}${site.pathname.replace(/\/+$/, '').replace(/\/wp-admin.*$/, '').replace(/\/wp-json.*$/, '')}`;
  const username = String(body.username ?? '').trim();
  const password = String(body.application_password ?? '').replace(/\s+/g, '');
  if (!username || password.length < 8) return jsonResponse({ success: false, error: 'Enter the WordPress username and an application password.' }, 400);

  const creds = { site_url: siteUrl, username, password };
  try {
    const me = await wp(creds, 'GET', '/wp/v2/users/me?context=edit');
    const caps = (me?.capabilities ?? {}) as Record<string, boolean>;
    if (!caps.publish_posts) {
      return jsonResponse({ success: false, error: `${me?.name ?? username} cannot publish posts on that site. Use an Author, Editor or Administrator account.` }, 400);
    }
    const root = await wp(creds, 'GET', '/').catch(() => null);
    const { error } = await supabase.rpc('wordpress_store_credentials', {
      p_workspace_id: workspaceId, p_site_url: siteUrl, p_username: username, p_password: password,
      p_site_name: typeof root?.name === 'string' ? root.name.slice(0, 200) : null, p_user: auth.userId,
    });
    if (error) return jsonResponse({ success: false, error: `Verified, but not saved: ${error.message}` }, 500);
    return jsonResponse({ success: true, connected: true, site_url: siteUrl, site_name: root?.name ?? null });
  } catch (e) {
    const err = e instanceof WpError ? e : new WpError(e instanceof Error ? e.message : String(e));
    return jsonResponse({ success: false, error: err.message }, err.status);
  }
}

async function handlePublish(req: Request, body: any): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const auth = await authenticate(req);
  if (!auth.success || !auth.userId) return jsonResponse({ success: false, error: auth.error || 'Unauthorized' }, 401);

  const articleId = typeof body.article_id === 'string' ? body.article_id : '';
  const status = body.status === 'publish' ? 'publish' : 'draft';
  const { data: owner } = await supabase.from('seo_articles').select('workspace_id').eq('id', articleId).maybeSingle();
  const workspaceId = (owner as { workspace_id?: string | null } | null)?.workspace_id ?? null;
  if (!workspaceId || !(await userCanAccessWorkspace(supabase, auth.userId, workspaceId))) {
    return jsonResponse({ success: false, error: 'Not found' }, 404);
  }
  const ent = await assertEntitled(supabase, workspaceId, SEO_MODULE);
  if (!ent.ok) return ent.response;
  const role = await memberRole(supabase, workspaceId, auth.userId);
  if (!['owner', 'admin', 'marketing'].includes(String(role))) {
    return jsonResponse({ success: false, error: 'Publishing to the website is for an owner, admin or marketing member.' }, 403);
  }

  const { data: row, error: rowErr } = await supabase.from('seo_articles')
    .select('title, meta_description, slug, markdown_content, publish_external_id, publish_started_at, published_url, published_at, target_keyword')
    .eq('id', articleId).single();
  if (rowErr || !row) return jsonResponse({ success: false, error: 'Could not read the article.' }, 500);
  const markdown = String(row.markdown_content ?? '');
  if (!markdown.trim()) return jsonResponse({ success: false, error: 'This article has no content yet.' }, 409);

  const { data: credRows } = await supabase.rpc('wordpress_credentials', { p_workspace_id: workspaceId });
  const creds = (Array.isArray(credRows) ? credRows[0] : credRows) as WpCreds | undefined;
  if (!creds?.password) {
    return jsonResponse({ success: false, error: 'Connect your WordPress site first: Profile → Keys → Publishing.' }, 409);
  }

  const title = String(row.title || row.target_keyword || 'Untitled');
  const slug = row.slug ? slugify(String(row.slug)) : slugify(title);
  let externalId = row.publish_external_id ? String(row.publish_external_id) : null;

  if (!externalId) {
    const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
    const { data: claimed } = await supabase.from('seo_articles')
      .update({ publish_started_at: new Date().toISOString(), publish_target: 'wordpress' })
      .eq('id', articleId).is('publish_external_id', null)
      .or(`publish_started_at.is.null,publish_started_at.lt.${staleBefore}`)
      .select('id');
    if (!claimed?.length) return jsonResponse({ success: false, error: 'This article is already being published. Try again in a minute.' }, 409);
  }

  try {
    if (!externalId && row.publish_started_at && slug) {
      const found = await wp(creds, 'GET', `/wp/v2/posts?slug=${encodeURIComponent(slug)}&status=any&context=edit`);
      if (Array.isArray(found) && found[0]?.id) externalId = String(found[0].id);
    }
    const payload = {
      title, slug, status,
      content: articleHtml({ title, markdown, meta: row.meta_description, url: row.published_url }),
      ...(row.meta_description ? { excerpt: String(row.meta_description) } : {}),
    };
    let post: any;
    if (externalId) {
      post = await wp(creds, 'POST', `/wp/v2/posts/${encodeURIComponent(externalId)}`, payload);
    } else {
      post = await wp(creds, 'POST', '/wp/v2/posts', payload);
      externalId = String(post?.id ?? '');
      if (!externalId) throw new WpError('WordPress did not return a post id.');
      const { error: idErr } = await supabase.from('seo_articles')
        .update({ publish_external_id: externalId, publish_target: 'wordpress' }).eq('id', articleId);
      if (idErr) console.error('[seo-api] post created on WordPress but its id was NOT recorded', articleId, externalId, idErr.message);
    }

    const live = status === 'publish' && post?.status === 'publish';
    const { error: doneErr } = await supabase.from('seo_articles').update({
      publish_started_at: null,
      ...(live ? { published_url: String(post.link ?? ''), published_at: row.published_at ?? new Date().toISOString() } : {}),
    }).eq('id', articleId);
    if (doneErr) console.error('[seo-api] published but the article row was not updated', articleId, doneErr.message);
    return jsonResponse({ success: true, external_id: externalId, status: post?.status ?? status, url: post?.link ?? null });
  } catch (e) {
    const err = e instanceof WpError ? e : null;
    if (err && !externalId) {
      const { error: releaseErr } = await supabase.from('seo_articles')
        .update({ publish_started_at: null }).eq('id', articleId).is('publish_external_id', null);
      if (releaseErr) console.error('[seo-publish] publish claim not released; a retry waits 2 minutes', articleId, releaseErr.message);
    }
    return jsonResponse({ success: false, error: e instanceof Error ? e.message : String(e) }, err?.status ?? 502);
  }
}

const ROUTES: Record<string, (req: Request, body: any) => Promise<Response>> = {
  wordpress_connect: handleWordpressConnect,
  publish: handlePublish,
};

Deno.serve(withApiLogging('seo-publish', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  let body: any;
  try { body = await req.json(); } catch { return jsonResponse({ success: false, error: 'Invalid JSON' }, 400); }
  const handler = ROUTES[body?.action];
  if (!handler) return jsonResponse({ success: false, error: `Unknown action. Available: ${Object.keys(ROUTES).join(', ')}` }, 400);
  return handler(req, body);
}));
