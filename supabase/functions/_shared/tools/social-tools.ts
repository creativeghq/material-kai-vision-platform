// Social Media agent toolkit (Hermes). Lets the user list connected social accounts,
// publish or schedule a post, and read analytics from chat — over the workspace's
// already-connected accounts (via the zernio-api edge function).

// deno-lint-ignore-file no-explicit-any

// `tool` is typed non-generically ON PURPOSE. Inferring it pulls @langchain/core's generic
// graph into every module that defines a tool, and that instantiation — not file size — is what
// makes agent-chat exceed 12 GB and drop out of the edge typecheck gate entirely (inbox-api is a
// comparable 2.8k lines and checks fine). Erasing it here costs the `tool()` config shape, which
// `npm run tools:manifest` + tests/unit/toolkitCoverage.test.ts already enforce from the AST, and
// buys a compiler over the tool bodies, which nothing had before.
const { tool } = await import('npm:@langchain/core@1.2.9/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  // Return stays `any`: consumers pass these to bindTools()/registerTools(), and narrowing it
  // to `unknown` would break them. The INPUT is what we want typed, and S gives us that.
  ) => any;
};
const { z } = await import('npm:zod@3.25.76');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const MODULE_SLUG = 'social-media';

import { serviceClient as svcClient } from '../supabase-client.ts';
import { brandDraftCheck, loadBrandContext } from '../brand-context.ts';
import { checkCopy, composePublishedText, loadCopyRules } from '../copy-check.ts';
import { SOCIAL_POST_FORMATS } from '../social-post-formats.ts';
import { callerDbClient } from '../caller-client.ts';
/** Call any edge function AS the user (so its authenticate() + workspace checks apply). */
async function callEdge(jwt: string, path: string, payload: Record<string, unknown>): Promise<any> {
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await resp.text();
    let parsed: any = {};
    try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { error: text }; }
    if (!resp.ok) return { ok: false, status: resp.status, error: parsed?.error || `${path} failed (${resp.status})` };
    return { ok: true, data: parsed };
  } catch (e) {
    return { ok: false, error: `${path} call failed: ${(e as Error).message}` };
  }
}

/** Call a zernio-api action AS the user (so its auth + workspace checks apply). */
async function callZernio(jwt: string, payload: Record<string, unknown>): Promise<any> {
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/zernio-api`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await resp.text();
    let parsed: any = {};
    try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { error: text }; }
    if (!resp.ok) return { ok: false, status: resp.status, error: parsed?.error || `zernio-api failed (${resp.status})` };
    return { ok: true, data: parsed };
  } catch (e) {
    return { ok: false, error: `zernio-api call failed: ${(e as Error).message}` };
  }
}

export const createManageSocialTool = (
  userId: string,
  workspaceId: string | undefined,
  jwt: string | undefined,
  onChunk?: (chunk: any) => void,
) => {
  async function moduleReady(): Promise<{ ok: boolean; error?: string }> {
    try {
      if (!workspaceId) return { ok: false, error: 'No active workspace for the current user.' };
      if (!jwt) return { ok: false, error: 'Social tools require an authenticated user session.' };
      const svc = svcClient();
      const { data: mod } = await svc.from('modules').select('enabled').eq('slug', MODULE_SLUG).maybeSingle();
      if (!mod?.enabled) return { ok: false, error: 'The Social Media module is not enabled on this platform.' };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `Social availability check failed: ${(e as Error).message}` };
    }
  }

  /** Resolve a connected account by id or platform → row, or a clarification error. */
  async function resolveAccount(ws: string, account_id?: string, platform?: string): Promise<
    { ok: true; account: any } | { ok: false; error: string; candidates?: any[] }
  > {
    const svc = svcClient();
    const { data: accounts } = await svc
      .from('social_accounts')
      .select('id, platform, handle, is_active, zernio_account_id, website_id')
      .eq('workspace_id', ws)
      .eq('is_active', true);
    const list = accounts ?? [];
    if (list.length === 0) return { ok: false, error: 'No social accounts are connected. Connect one in Profile → Social Accounts first.' };
    if (account_id) {
      const hit = list.find((a) => a.id === account_id);
      if (!hit) return { ok: false, error: 'No connected account with that id.' };
      return { ok: true, account: hit };
    }
    if (platform) {
      const matches = list.filter((a) => String(a.platform).toLowerCase() === platform.toLowerCase());
      if (matches.length === 0) return { ok: false, error: `No connected ${platform} account. Connect it in Profile → Social Accounts.` };
      if (matches.length > 1) {
        return { ok: false, error: `Multiple ${platform} accounts connected. Ask the user which one.`, candidates: matches.map((a) => ({ id: a.id, platform: a.platform, handle: a.handle })) };
      }
      return { ok: true, account: matches[0] };
    }
    return { ok: false, error: 'Provide account_id or platform.' };
  }

  return tool(
    async ({ action, account_id, account_ids, article_id, slots, platform, caption, hashtags, image_urls, scheduled_at, topic, tone, format, source_text, prompt, post_id, source_image_url, video_model, duration_seconds, aspect_ratio, job_id, confirm }: any) => {
      const gate = await moduleReady();
      if (!gate.ok) return JSON.stringify({ success: false, error: gate.error });
      const ws = workspaceId!;
      const svc = svcClient();

      if (action === 'list_accounts') {
        const { data: accounts } = await svc
          .from('social_accounts')
          .select('id, platform, handle, is_active')
          .eq('workspace_id', ws);
        const list = (accounts ?? []).map((a: any) => ({ id: a.id, platform: a.platform, handle: a.handle, active: a.is_active }));
        onChunk?.({ type: 'social_accounts', accounts: list, timestamp: Date.now() });
        return JSON.stringify({ success: true, count: list.length, accounts: list });
      }

      if (action === 'publish' || action === 'schedule') {
        if (action === 'schedule' && !scheduled_at) {
          return JSON.stringify({ success: false, error: 'scheduled_at (ISO datetime) is required to schedule.' });
        }
        // A draft carries what was generated onto it (image, video, caption); publishing it means sending THAT row.
        let draft: any = null;
        if (post_id) {
          const loaded = await readDraftPost(svc, ws, String(post_id));
          if ('error' in loaded) return JSON.stringify({ success: false, error: loaded.error });
          draft = loaded.draft;
        }
        const finalCaption = String(caption ?? draft?.caption ?? '').trim();
        if (!finalCaption) return JSON.stringify({ success: false, error: 'caption is required to publish or schedule a post.' });
        const finalTags: string[] | null = Array.isArray(hashtags) ? hashtags.map(String) : draft?.hashtags ?? null;
        const finalImages: string[] | null = Array.isArray(image_urls) ? image_urls.map(String) : draft?.image_urls ?? null;

        const resolved = await resolveAccount(ws, account_id ?? (platform ? undefined : draft?.social_account_id ?? undefined), platform);
        if (!resolved.ok) return JSON.stringify({ success: false, error: resolved.error, candidates: (resolved as any).candidates });
        const acct = resolved.account;
        const brand = await loadBrandContext(svc, ws, acct.website_id ?? null);
        const rules = await loadCopyRules(svc, String(acct.platform).toLowerCase());
        const copy = checkCopy({ text: finalCaption, hashtags: finalTags, rules, avoidList: brand.status === 'ok' ? brand.profile?.avoid_list : [] });
        const brandCheck = brandDraftCheck(brand, composePublishedText(finalCaption, finalTags));
        const blocking = copy.warnings.filter((w) => w.code === 'over_limit' || w.code === 'too_many_hashtags');

        // Invariant 9: the human gate sits before any write and before Zernio.
        if (confirm !== true) {
          const preview = finalCaption.slice(0, 180);
          const tags = finalTags?.length ? ` ${finalTags.join(' ')}` : '';
          const media = [finalImages?.length ? `${finalImages.length} image(s)` : '', draft?.video_url ? 'a video' : ''].filter(Boolean).join(' and ');
          onChunk?.({
            type: 'action_confirmation',
            tool: 'manage_social',
            input: { action, account_id: acct.id, post_id: draft?.id, caption: finalCaption, hashtags: finalTags, image_urls: finalImages, scheduled_at },
            title: action === 'publish' ? 'Publish this post now?' : 'Schedule this post?',
            summary: `"${preview}${tags}"${media ? ` with ${media}` : ''} → ${acct.platform}${acct.handle ? ` (${acct.handle})` : ''}`
              + (action === 'publish'
                ? '. It goes out immediately and cannot be recalled.'
                : ` at ${scheduled_at}. It will go out automatically.`)
              + (copy.warnings.length ? ` Check: ${copy.warnings.map((w) => w.message).join(' ')}` : '')
              + (copy.checked ? '' : ' The writing rules could not be checked.')
              + (brandCheck.checked ? '' : ' The avoid list could not be checked.'),
            avoid_hits: brandCheck.avoid_hits,
            copy_warnings: copy.warnings,
            danger: true,
            toolkit_id: 'social',
            timestamp: Date.now(),
          });
          return JSON.stringify({
            success: true,
            awaiting_confirmation: true,
            avoid_hits: brandCheck.avoid_hits,
            copy_warnings: copy.warnings,
            message: "Awaiting the user's approval to post. Do not retry.",
          });
        }
        if (blocking.length) {
          return JSON.stringify({ success: false, error: `${acct.platform} would refuse this post: ${blocking.map((w) => w.message).join(' ')}`, copy_warnings: copy.warnings });
        }

        let post: { id: string } | null = null;
        if (draft) {
          const variants: any[] = Array.isArray(draft.metadata?.all_captions) ? draft.metadata.all_captions : [];
          const sent = variants.find((v) => String(v?.caption ?? '').trim() === finalCaption);
          const { error: upErr } = await svc.from('social_posts').update({
            social_account_id: acct.id,
            platform: acct.platform,
            caption: finalCaption,
            hashtags: finalTags,
            image_urls: finalImages,
            metadata: { ...(draft.metadata ?? {}), hook_type: sent?.hook_type ?? (variants.length ? 'edited' : null) },
            updated_at: new Date().toISOString(),
          }).eq('id', draft.id).eq('workspace_id', ws);
          if (upErr) return JSON.stringify({ success: false, error: `Could not update the draft: ${upErr.message}` });
          post = { id: draft.id };
        } else {
          const { data, error: postErr } = await svc
            .from('social_posts')
            .insert({
              workspace_id: ws,
              user_id: userId,
              social_account_id: acct.id,
              platform: acct.platform,
              post_type: finalImages?.length ? 'image' : 'text',
              caption: finalCaption,
              hashtags: finalTags,
              image_urls: finalImages,
              status: 'draft',
            })
            .select('id')
            .single();
          if (postErr || !data) return JSON.stringify({ success: false, error: `Could not draft the post: ${postErr?.message || 'unknown'}` });
          post = data;
        }

        const res = await callZernio(jwt!, {
          action: action === 'publish' ? 'publish_now' : 'schedule',
          post_id: (post as any).id,
          social_account_id: acct.id,
          workspace_id: ws,
          ...(action === 'schedule' ? { scheduled_at } : {}),
        });
        if (!res.ok) {
          // Leave the draft in place so the user can retry/publish from the UI.
          return JSON.stringify({ success: false, error: res.error, post_id: (post as any).id });
        }
        onChunk?.({ type: 'social_post', action, post_id: (post as any).id, platform: acct.platform, handle: acct.handle, scheduled_at: scheduled_at ?? null, timestamp: Date.now() });
        return JSON.stringify({
          success: true,
          post_id: (post as any).id,
          platform: acct.platform,
          handle: acct.handle,
          status: action === 'publish' ? 'published' : 'scheduled',
          scheduled_at: scheduled_at ?? null,
          message: action === 'publish'
            ? `Published to ${acct.platform}${acct.handle ? ` (${acct.handle})` : ''}.`
            : `Scheduled for ${scheduled_at} on ${acct.platform}${acct.handle ? ` (${acct.handle})` : ''}.`,
        });
      }

      if (action === 'best_time') {
        const resolved = await resolveAccount(ws, account_id, platform);
        if (!resolved.ok) return JSON.stringify({ success: false, error: resolved.error, candidates: (resolved as any).candidates });
        const res = await callZernio(jwt!, { action: 'get_best_time', social_account_id: resolved.account.id, workspace_id: ws });
        if (!res.ok) return JSON.stringify({ success: false, error: res.error });
        onChunk?.({ type: 'social_best_time', platform: resolved.account.platform, best_times: res.data?.best_times ?? [], timestamp: Date.now() });
        return JSON.stringify({ success: true, platform: resolved.account.platform, best_times: res.data?.best_times ?? [] });
      }

      if (action === 'account_insights') {
        let accountIds: string[] | null = null;
        if (account_id || platform) {
          const resolved = await resolveAccount(ws, account_id, platform);
          if (!resolved.ok) return JSON.stringify({ success: false, error: resolved.error, candidates: (resolved as any).candidates });
          accountIds = [resolved.account.id];
        }
        const res = await callZernio(jwt!, {
          action: 'get_account_insights',
          ...(accountIds ? { social_account_id: accountIds[0] } : { workspace_id: ws }),
        });
        if (!res.ok) return JSON.stringify({ success: false, error: res.error });
        let acctQ = svc.from('social_accounts').select('id, platform, handle, followers_count, following_count, last_synced_at')
          .eq('workspace_id', ws).eq('is_active', true);
        if (accountIds) acctQ = acctQ.in('id', accountIds);
        const { data: accts, error: acctErr } = await acctQ.limit(20);
        if (acctErr) return JSON.stringify({ success: false, error: `Could not read the account figures: ${acctErr.message}` });
        const ids = (accts ?? []).map((a: any) => a.id);
        const { data: snaps } = ids.length
          ? await svc.from('social_account_insights').select('social_account_id, snapshot_date, followers_count, posts_count')
            .in('social_account_id', ids).order('snapshot_date', { ascending: false }).limit(ids.length * 30)
          : { data: [] as any[] };
        const accounts = (accts ?? []).map((a: any) => {
          // A 0 snapshot is what a failed follower fetch writes, so it is unknown, not a loss.
          const own = (snaps ?? []).filter((s: any) => s.social_account_id === a.id && Number(s.followers_count) > 0);
          const oldest = own[own.length - 1];
          return {
            platform: a.platform, handle: a.handle,
            followers: a.followers_count ?? own[0]?.followers_count ?? null,
            following: a.following_count ?? null,
            posts: own[0]?.posts_count ?? null,
            follower_change: own.length > 1 ? own[0].followers_count - oldest.followers_count : null,
            change_since: own.length > 1 ? oldest.snapshot_date : null,
            last_synced_at: a.last_synced_at,
          };
        });
        const insights = { synced: res.data?.synced ?? 0, accounts };
        onChunk?.({ type: 'social_insights', insights, timestamp: Date.now() });
        return JSON.stringify({ success: true, insights });
      }

      if (action === 'post_analytics') {
        let postIds: string[] | null = post_id ? [String(post_id)] : null;
        if (!postIds && (account_id || platform)) {
          const resolved = await resolveAccount(ws, account_id, platform);
          if (!resolved.ok) return JSON.stringify({ success: false, error: resolved.error, candidates: (resolved as any).candidates });
          const { data: own } = await svc.from('social_posts').select('id')
            .eq('workspace_id', ws).eq('social_account_id', resolved.account.id).eq('status', 'published')
            .order('published_at', { ascending: false, nullsFirst: false }).limit(50);
          postIds = (own ?? []).map((p: any) => p.id);
          if (postIds.length === 0) {
            const result = { synced: 0, posts: [] };
            onChunk?.({ type: 'social_post_analytics', result, timestamp: Date.now() });
            return JSON.stringify({ success: true, result, message: `Nothing has been published on ${resolved.account.platform} yet.` });
          }
        }
        if (!postIds) {
          const { data: latest } = await svc.from('social_posts').select('id')
            .eq('workspace_id', ws).eq('status', 'published')
            .order('published_at', { ascending: false, nullsFirst: false }).limit(15);
          postIds = (latest ?? []).map((p: any) => p.id);
        }
        const res = postIds.length
          ? await callZernio(jwt!, { action: 'get_post_analytics', post_ids: postIds })
          : { ok: true, data: { synced: 0 } } as any;
        if (!res.ok) return JSON.stringify({ success: false, error: res.error });
        let postQ = svc.from('social_posts').select('id, platform, caption, published_at')
          .eq('workspace_id', ws).eq('status', 'published');
        if (postIds) postQ = postQ.in('id', postIds);
        const { data: posts, error: postsErr } = await postQ.order('published_at', { ascending: false, nullsFirst: false }).limit(15);
        if (postsErr) return JSON.stringify({ success: false, error: `Could not read the post figures: ${postsErr.message}` });
        const ids = (posts ?? []).map((p: any) => p.id);
        const { data: metrics } = ids.length
          ? await svc.from('social_post_analytics')
            .select('post_id, snapshot_date, impressions, reach, likes, comments, shares, saves, clicks, engagement_rate')
            .in('post_id', ids).order('snapshot_date', { ascending: false })
          : { data: [] as any[] };
        const rows = (posts ?? []).map((p: any) => {
          const m = (metrics ?? []).find((x: any) => x.post_id === p.id);
          return {
            platform: p.platform,
            caption: typeof p.caption === 'string' ? p.caption.slice(0, 120) : null,
            published_at: p.published_at,
            ...(m
              ? { impressions: m.impressions, reach: m.reach, likes: m.likes, comments: m.comments, shares: m.shares, saves: m.saves, clicks: m.clicks, engagement_rate: m.engagement_rate, as_of: m.snapshot_date }
              : { metrics: 'not synced yet' }),
          };
        });
        const result = { synced: res.data?.synced ?? 0, sync_errors: Array.isArray(res.data?.errors) ? res.data.errors.length : 0, posts: rows };
        onChunk?.({ type: 'social_post_analytics', result, timestamp: Date.now() });
        return JSON.stringify({ success: true, result });
      }

      if (action === 'generate_content') {
        let accountRef = account_id ?? null;
        let topicText = topic ?? null;
        let postFormat = format ?? null;
        if (post_id && !platform && !accountRef) {
          const loaded = await readDraftPost(svc, ws, String(post_id));
          if ('error' in loaded) return JSON.stringify({ success: false, error: loaded.error });
          accountRef = loaded.draft.social_account_id ?? null;
          topicText ??= loaded.draft.metadata?.plan?.angle ?? null;
          postFormat ??= loaded.draft.metadata?.format ?? null;
        }
        if ((!topicText && !source_text) || (!platform && !accountRef)) {
          return JSON.stringify({ success: false, error: 'generate_content needs a topic (or source_text) and a platform or account_id.' });
        }
        let target = platform ? String(platform).toLowerCase() : null;
        if (accountRef) {
          const resolved = await resolveAccount(ws, accountRef, undefined);
          if (!resolved.ok) return JSON.stringify({ success: false, error: resolved.error });
          target = String(resolved.account.platform).toLowerCase();
        }
        const res = await callEdge(jwt!, 'generate-social-content', {
          topic: topicText, platform: target, tone, format: postFormat, source_text, workspace_id: ws, post_id, social_account_id: accountRef,
        });
        if (!res.ok || res.data?.success === false) return JSON.stringify({ success: false, error: res.data?.error || res.error });
        onChunk?.({ type: 'social_content_generated', platform: target, post_id: res.data?.post_id ?? null, data: res.data, timestamp: Date.now() });
        return JSON.stringify({
          success: true,
          ...res.data,
          message: res.data?.post_id
            ? `Draft caption + hashtags saved to post ${res.data.post_id}. Pass that post_id to generate_image so the picture lands on THIS draft, then publish/schedule.`
            : 'Draft caption + hashtags generated. Review, then use publish/schedule.',
        });
      }

      if (action === 'plan_week') {
        const { data: kindRows, error: kindErr } = await svc.from('social_post_kinds')
          .select('workspace_id, key, label, purpose, per_week, formats, sort_order, is_active')
          .or(`workspace_id.is.null,workspace_id.eq.${ws}`);
        if (kindErr) return JSON.stringify({ success: false, error: `Could not read the post mix: ${kindErr.message}` });
        const byKey = new Map<string, any>();
        for (const k of (kindRows ?? []).filter((r: any) => r.workspace_id === null)) byKey.set(k.key, k);
        for (const k of (kindRows ?? []).filter((r: any) => r.workspace_id === ws)) byKey.set(k.key, k);
        const mix = [...byKey.values()].filter((k) => k.is_active && Number(k.per_week) > 0)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((k) => ({ key: k.key, label: k.label, purpose: k.purpose, per_week: Number(k.per_week), formats: k.formats }));
        const { data: accts, error: acctErr } = await svc.from('social_accounts')
          .select('id, platform, handle').eq('workspace_id', ws).eq('is_active', true);
        if (acctErr) return JSON.stringify({ success: false, error: `Could not read the connected accounts: ${acctErr.message}` });

        if (!Array.isArray(slots) || slots.length === 0) {
          const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
          const [articles, recent, brand] = await Promise.all([
            svc.from('seo_articles').select('id, title, published_url, completed_at').eq('workspace_id', ws).eq('status', 'completed')
              .gte('completed_at', since).order('completed_at', { ascending: false }).limit(10),
            svc.from('social_posts').select('id, platform, status, caption, metadata, published_at, created_at').eq('workspace_id', ws)
              .gte('created_at', since).order('created_at', { ascending: false }).limit(40),
            loadBrandContext(svc, ws),
          ]);
          const inputs = {
            mix,
            accounts: accts ?? [],
            recent_articles: articles.data ?? [],
            recent_posts: (recent.data ?? []).map((p: any) => ({
              id: p.id, platform: p.platform, status: p.status, caption: typeof p.caption === 'string' ? p.caption.slice(0, 100) : null,
              kind: p.metadata?.plan?.kind ?? null, planned_for: p.metadata?.plan?.planned_for ?? null,
            })),
            proof: brand.status === 'ok' ? { proof: brand.profile?.proprietary_data ?? [], work: brand.profile?.owned_examples ?? [] } : null,
          };
          onChunk?.({ type: 'social_week_inputs', inputs, timestamp: Date.now() });
          return JSON.stringify({
            success: true,
            inputs,
            message: 'Plan the week from the mix (per_week is the target count per kind, spread across days, never two of one kind in a row), '
              + 'the accounts, recent articles and proof. Avoid angles already in recent_posts. Every slot needs a concrete ANGLE, not a topic. '
              + 'Show the plan to the user; when they agree, call plan_week again with slots to save them as drafts. Nothing is scheduled.',
          });
        }

        const accountById = new Map((accts ?? []).map((a: any) => [a.id, a]));
        const problems: string[] = [];
        const rows = slots.map((s: any, i: number) => {
          const acct = accountById.get(s.account_id);
          if (!acct) problems.push(`slot ${i + 1}: account is not connected in this workspace`);
          if (!byKey.has(s.kind)) problems.push(`slot ${i + 1}: "${s.kind}" is not a post kind in the mix`);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s.planned_for ?? ''))) problems.push(`slot ${i + 1}: planned_for must be YYYY-MM-DD`);
          if (!String(s.angle ?? '').trim()) problems.push(`slot ${i + 1}: angle is required`);
          return {
            workspace_id: ws,
            user_id: userId,
            social_account_id: acct?.id ?? null,
            platform: acct?.platform ?? 'unknown',
            post_type: s.format === 'reel' || s.format === 'video' ? 'video' : s.format === 'text' ? 'text' : 'image',
            caption: null,
            status: 'draft',
            metadata: {
              format: s.format,
              plan: { planned_for: s.planned_for, kind: s.kind, angle: String(s.angle).trim(), source: s.source ? String(s.source) : null, planned_at: new Date().toISOString() },
            },
          };
        });
        if (problems.length) return JSON.stringify({ success: false, error: `Nothing was saved: ${problems.join('; ')}` });
        const { data: saved, error: saveErr } = await svc.from('social_posts').insert(rows).select('id, platform, metadata');
        if (saveErr) return JSON.stringify({ success: false, error: `Could not save the plan: ${saveErr.message}` });
        const planned = (saved ?? []).map((p: any) => ({ post_id: p.id, platform: p.platform, ...p.metadata?.plan, format: p.metadata?.format }));
        onChunk?.({ type: 'social_week_planned', planned, timestamp: Date.now() });
        return JSON.stringify({
          success: true,
          planned,
          message: `${planned.length} slot(s) saved as drafts with no caption yet. To write one, call generate_content with its post_id, `
            + 'the angle as topic and its format. Nothing is scheduled until the user approves each post.',
        });
      }

      if (action === 'audit') {
        if (account_id) {
          const resolved = await resolveAccount(ws, account_id, undefined);
          if (!resolved.ok) return JSON.stringify({ success: false, error: resolved.error });
        }
        const { data, error } = await callerDbClient(jwt!, userId, ws).rpc('get_social_audit', {
          p_workspace_id: ws, p_account_id: account_id ?? null,
        });
        if (error) return JSON.stringify({ success: false, error: `Could not run the audit: ${error.message}` });
        onChunk?.({ type: 'social_audit', audit: data, timestamp: Date.now() });
        return JSON.stringify({
          success: true,
          audit: data,
          message: 'The numbers and their status are derived in SQL. Report the status and note first; state a pattern only when status is "ok", '
            + 'name the posts behind it, and never call an unsynced post zero.',
        });
      }

      if (action === 'repurpose') {
        if (!article_id && !source_text) {
          const { data: recent, error } = await svc.from('seo_articles')
            .select('id, title, target_keyword, published_url, completed_at')
            .eq('workspace_id', ws).eq('status', 'completed')
            .order('completed_at', { ascending: false, nullsFirst: false }).limit(10);
          if (error) return JSON.stringify({ success: false, error: `Could not list articles: ${error.message}` });
          onChunk?.({ type: 'social_repurpose_sources', articles: recent ?? [], timestamp: Date.now() });
          return JSON.stringify({ success: true, articles: recent ?? [], message: 'Ask the user which article to turn into posts, then call repurpose with its article_id.' });
        }
        let material = source_text ? String(source_text) : '';
        let title = topic ? String(topic) : '';
        let link: string | null = null;
        if (article_id) {
          const { data: art, error } = await svc.from('seo_articles')
            .select('id, title, target_keyword, markdown_content, published_url, status')
            .eq('id', article_id).eq('workspace_id', ws).maybeSingle();
          if (error) return JSON.stringify({ success: false, error: `Could not read the article: ${error.message}` });
          if (!art) return JSON.stringify({ success: false, error: 'No article with that id in this workspace.' });
          if (!art.markdown_content) return JSON.stringify({ success: false, error: 'That article has no content yet.' });
          material = art.markdown_content;
          title = title || art.title || art.target_keyword || '';
          link = art.published_url ?? null;
        }
        const { data: accts, error: acctErr } = await svc.from('social_accounts')
          .select('id, platform, handle').eq('workspace_id', ws).eq('is_active', true);
        if (acctErr) return JSON.stringify({ success: false, error: `Could not read the connected accounts: ${acctErr.message}` });
        const wanted = Array.isArray(account_ids) && account_ids.length ? new Set(account_ids.map(String)) : null;
        const targets = (accts ?? []).filter((a: any) => !wanted || wanted.has(a.id));
        if (!targets.length) {
          return JSON.stringify({ success: false, error: wanted ? 'None of those accounts is connected in this workspace.' : 'No social accounts are connected. Connect one in Profile → Social Accounts first.' });
        }
        const drafts: any[] = [];
        for (const a of targets) {
          const res = await callEdge(jwt!, 'generate-social-content', {
            topic: `${title}${link ? ` (article: ${link})` : ''}`,
            platform: String(a.platform).toLowerCase(), format, tone, source_text: material,
            workspace_id: ws, social_account_id: a.id,
          });
          drafts.push(res.ok && res.data?.success !== false
            ? { account_id: a.id, platform: a.platform, handle: a.handle, post_id: res.data?.post_id ?? null, captions: res.data?.captions ?? [], saved: res.data?.saved !== false }
            : { account_id: a.id, platform: a.platform, handle: a.handle, error: res.data?.error || res.error });
        }
        onChunk?.({ type: 'social_repurposed', title, article_id: article_id ?? null, drafts, timestamp: Date.now() });
        const failed = drafts.filter((d) => d.error).length;
        return JSON.stringify({
          success: failed < drafts.length,
          drafts,
          message: `${drafts.length - failed} draft(s) written${failed ? `, ${failed} failed` : ''}. Nothing is published: show each draft and its warnings, then publish or schedule the ones the user approves by post_id.`,
        });
      }

      if (action === 'generate_image') {
        if (!prompt) return JSON.stringify({ success: false, error: 'generate_image needs a prompt.' });
        // `post_id` and `platform` both forwarded. Without post_id the image function has no draft
        // to attach to and files a SECOND draft of its own, so "write me an Instagram post with a
        // picture" produced two half-posts — one caption with no image, one image with no caption
        // — and the planner showed both. Without platform that orphan draft was hardcoded
        // `instagram`, so a LinkedIn image was filed under the wrong channel.
        const res = await callEdge(jwt!, 'generate-social-image', { prompt, platform, workspace_id: ws, post_id });
        if (!res.ok || res.data?.success === false) return JSON.stringify({ success: false, error: res.data?.error || res.error });
        const url = res.data?.image_url ?? res.data?.url ?? null;
        const attachedTo = res.data?.post_id ?? post_id ?? null;
        onChunk?.({ type: 'social_image_generated', platform: platform ?? null, post_id: attachedTo, image_url: url, timestamp: Date.now() });
        return JSON.stringify({
          success: true,
          image_url: url,
          post_id: attachedTo,
          message: attachedTo
            ? `Image generated and attached to post ${attachedTo}. Publish/schedule that post — you do not need to pass image_urls again.`
            : 'Image generated. Pass it in image_urls[] on publish/schedule.',
        });
      }

      if (action === 'generate_video') {
        // `generate-social-video` is image-to-video: it REQUIRES a source frame. The draft
        // almost always already has one — generate_image put it there — so read it off the post
        // rather than making the model invent a URL it cannot know.
        let sourceUrl: string | null = source_image_url ?? null;
        if (!sourceUrl && post_id) {
          const { data: draft } = await svc
            .from('social_posts').select('image_urls').eq('id', post_id).eq('workspace_id', ws).maybeSingle();
          sourceUrl = (draft?.image_urls ?? [])[0] ?? null;
        }
        if (!sourceUrl) {
          return JSON.stringify({
            success: false,
            error: 'generate_video needs a still to animate. Run generate_image on this post first, or pass source_image_url.',
          });
        }
        const res = await callEdge(jwt!, 'generate-social-video', {
          source_image_url: sourceUrl, prompt, model: video_model, duration_seconds,
          aspect_ratio, workspace_id: ws, post_id,
        });
        if (!res.ok || res.data?.success === false) return JSON.stringify({ success: false, error: res.data?.error || res.error });
        const d = res.data ?? {};
        onChunk?.({
          type: 'social_video_generated', platform: platform ?? null, post_id: d.post_id ?? post_id ?? null,
          video_url: d.video_url ?? null, job_id: d.job_id ?? null, status: d.status ?? 'completed',
          model: d.model_used ?? null, timestamp: Date.now(),
        });
        return JSON.stringify({
          success: true, video_url: d.video_url ?? null, job_id: d.job_id ?? null,
          post_id: d.post_id ?? null, status: d.status ?? 'completed',
          // A reel takes longer than one turn. Say so plainly and name the action that finishes
          // it, instead of reporting a half-done render as done. And when the attach itself
          // failed, say THAT rather than telling the user to publish a post with no video on it.
          message: d.attach_error
            ? `${d.attach_error} The video is at ${d.video_url} — tell the user, and do not claim the post has it.`
            : d.status === 'processing'
              ? `The video is still rendering. Tell the user it will take a minute, then call video_status with job_id ${d.job_id} — that attaches it to the post.`
              : `Video generated and attached to post ${d.post_id}. Publish/schedule that post.`,
        });
      }

      if (action === 'video_status') {
        if (!job_id) return JSON.stringify({ success: false, error: 'video_status needs the job_id returned by generate_video.' });
        const res = await callEdge(jwt!, 'generate-social-video', { action: 'status', job_id });
        if (!res.ok) return JSON.stringify({ success: false, error: res.error });
        const d = res.data ?? {};
        onChunk?.({
          type: 'social_video_generated', platform: platform ?? null, post_id: d.post_id ?? null,
          video_url: d.video_url ?? null, job_id, status: d.status ?? 'processing', timestamp: Date.now(),
        });
        if (d.status === 'failed') return JSON.stringify({ success: false, status: 'failed', error: d.error || 'The video generation failed.' });
        return JSON.stringify({
          success: true, status: d.status ?? 'processing', video_url: d.video_url ?? null, post_id: d.post_id ?? null,
          message: d.attach_error
            ? `${d.attach_error} The video is at ${d.video_url} — tell the user, and do not claim the post has it.`
            : d.status === 'completed'
              ? `Video ready and attached to post ${d.post_id}.`
              : 'Still rendering — check again shortly.',
        });
      }

      return JSON.stringify({ success: false, error: `unknown action: ${action}` });
    },
    {
      name: 'manage_social',
      description: [
        "Publish/schedule social posts and read analytics over the workspace's ALREADY-CONNECTED social accounts.",
        'Requires the Social Media module enabled. You cannot connect new accounts — that is done in the app UI',
        '(Profile → Social Accounts).',
        '',
        'Actions:',
        '  list_accounts    → list connected accounts (id, platform, handle). Start here if unsure which account.',
        '  publish          → post NOW. Pass post_id to send a draft as it is (its caption, hashtags, image and',
        '                     video); caption/hashtags/image_urls override the draft. Without post_id needs caption',
        '                     + (account_id OR platform).',
        '  schedule         → post at a future time. Same as publish + scheduled_at (ISO datetime).',
        '  best_time        → recommended posting window for an account (account_id or platform).',
        '  account_insights → follower/engagement insights for an account (or the whole workspace if none given).',
        '  post_analytics   → sync + return analytics for the 15 latest published posts. Narrow with post_id,',
        '                     account_id or platform.',
        '  plan_week        → without slots: the post mix, connected accounts, recent articles, recent posts and',
        '                     proof to plan from. With slots (after the user agrees): saves each as a draft with',
        '                     no caption yet. Never schedules.',
        '  audit            → what is working: each published post against its account\'s own median, shares',
        '                     and saves per reach, and a breakdown by hook type, with a status (no_data,',
        '                     not_collected, too_few, ok). Optional account_id.',
        '  generate_content → AI-draft 3 caption variants + hashtags (topic or source_text, and account_id or',
        '                     platform). Follows that channel\'s writing rules and returns warnings per variant;',
        '                     show the warnings with the draft. Saves a DRAFT post and returns its post_id.',
        '  repurpose        → turn one SEO article (article_id) or source_text into ONE draft per connected',
        '                     account (or per account_ids), each in its channel\'s rules and voice. Without',
        '                     article_id/source_text it lists recent finished articles to choose from. Drafts only.',
        '  generate_image   → AI-generate an image from a prompt. Pass the post_id from generate_content',
        '                     and the image is attached to that draft; omit it and you get a second,',
        '                     separate draft holding only the picture.',
        '  generate_video   → AI-generate a short vertical reel FROM the post\'s image (25cr default).',
        '                     Needs post_id. Often finishes inside the call; when it does not it returns',
        '                     status "processing" + a job_id.',
        '  video_status     → collect a render that was still processing (job_id). This is the call that',
        '                     stores the finished video and attaches it to the post — a job nobody polls',
        '                     is abandoned after 30 minutes and refunded, so DO come back for it.',
        '',
        'Typical flow: generate_content → generate_image WITH the returned post_id → optionally',
        'generate_video with that same post_id → review with the user → publish/schedule.',
        'One post is one draft: carry the post_id through the whole flow.',
        'publish/schedule ALWAYS show the user an Approve/Decline card first — never set confirm:true',
        'yourself; the UI sets it on approval.',
      ].join('\n'),
      schema: z.object({
        slots: z.array(z.object({
          planned_for: z.string().describe('YYYY-MM-DD'),
          account_id: z.string().uuid(),
          kind: z.string().describe('A key from the mix plan_week returned.'),
          format: z.enum(SOCIAL_POST_FORMATS),
          angle: z.string().describe('The specific angle, not a topic: "the Kifisia bathroom laid in two days", not "bathrooms".'),
          source: z.string().optional().describe('What it is drawn from: an article id, a project, a proof line.'),
        })).optional().describe('plan_week: the agreed slots to save as drafts. Omit to get the planning inputs.'),
        action: z.enum(['list_accounts', 'publish', 'schedule', 'best_time', 'account_insights', 'post_analytics', 'plan_week', 'audit', 'generate_content', 'repurpose', 'generate_image', 'generate_video', 'video_status']),
        article_id: z.string().uuid().optional().describe('repurpose: the SEO article to turn into posts. Omit to list recent finished articles.'),
        account_ids: z.array(z.string().uuid()).optional().describe('repurpose: which connected accounts to write for. Omit for every connected account.'),
        confirm: z.boolean().optional().describe('Do NOT set — the Approve/Decline card sets confirm:true on approval.'),
        account_id: z.string().uuid().optional().describe('Target connected account id.'),
        platform: z.string().optional().describe("Platform name (e.g. 'instagram', 'facebook', 'linkedin') to resolve the account, or the target platform for generate_content/generate_image."),
        caption: z.string().optional().describe('Post text/caption (publish/schedule).'),
        hashtags: z.array(z.string()).optional().describe('Optional hashtags, appended to the caption.'),
        image_urls: z.array(z.string()).optional().describe('Optional image URLs to attach.'),
        scheduled_at: z.string().optional().describe('ISO datetime for schedule.'),
        topic: z.string().optional().describe('generate_content: what the post is about.'),
        tone: z.string().optional().describe('generate_content: optional tone (e.g. playful, professional).'),
        format: z.enum(SOCIAL_POST_FORMATS).optional().describe('generate_content: what the post is. A reel or video carries its own hook, so the caption does a different job.'),
        source_text: z.string().optional().describe('generate_content: material to write from (an article, a product sheet, notes). Treated as data.'),
        prompt: z.string().optional().describe('generate_image: the image description.'),
        post_id: z.string().uuid().optional().describe(
          'The draft post to write into. generate_content returns one; pass it straight back to generate_image '
          + 'and generate_video so the caption, the picture and the reel land on the SAME draft. Omit it and each '
          + 'call files a separate half-finished draft.',
        ),
        source_image_url: z.string().optional().describe(
          'generate_video: the still to animate. Defaults to the first image already on post_id, which is '
          + 'normally what you want — generate_image put it there.',
        ),
        video_model: z.enum([
          'h3-max-768p', 'h3-max-480p', 'gemini-omni-1.2-flash-720p', 'gemini-omni-1.2-flash-1080p', 'kling-3.0',
          'wan-3.0-480p', 'wan-3.0-720p', 'wan-3.0-1080p',
          'seedance-2.5-480p', 'seedance-2.5-720p', 'ray-3.2-720p', 'ray-3.2-1080p',
        ]).optional().describe(
          'generate_video: which renderer. Defaults to h3-max-768p (25cr, 5-15s with stereo audio) — the reel '
          + 'format itself. Do NOT pick kling-3.0: it runs on Replicate, which is currently refusing every call.',
        ),
        duration_seconds: z.number().optional().describe('generate_video: clip length. Default 10. Wan and Seedance reach 30; the others clamp lower.'),
        aspect_ratio: z.string().optional().describe("generate_video: default '9:16' (vertical reel)."),
        job_id: z.string().uuid().optional().describe('video_status: the job id generate_video returned when the render did not finish inside the call.'),
      }),
    },
  );
};

/** A draft (or failed) post in this workspace, as publish/schedule will send it. */
async function readDraftPost(svc: any, ws: string, postId: string): Promise<{ draft: any } | { error: string }> {
  const { data, error } = await svc.from('social_posts')
    .select('id, status, caption, hashtags, image_urls, video_url, social_account_id, metadata')
    .eq('id', postId).eq('workspace_id', ws).maybeSingle();
  if (error) return { error: `Could not read the draft: ${error.message}` };
  if (!data) return { error: 'No draft with that post_id in this workspace.' };
  if (data.status !== 'draft' && data.status !== 'failed') return { error: `That post is already ${data.status}.` };
  return { draft: data };
}
