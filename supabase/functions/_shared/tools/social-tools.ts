// Social Media agent toolkit (Hermes). Lets the user list connected social accounts,
// publish or schedule a post, and read analytics from chat — over the workspace's
// already-connected accounts (via the zernio-api edge function).
// DESIGN: read/list uses the service-role client scoped to the caller's workspace;
// publish/schedule/analytics call zernio-api over HTTP with the CALLER'S JWT, so
// zernio-api authenticates AS the user and applies its own workspace-membership
// checks. workspace_id / user_id are server-derived (never model-supplied). It
// CANNOT connect new accounts — that's the app UI's OAuth flow.

// deno-lint-ignore-file no-explicit-any

// `tool` is typed non-generically ON PURPOSE. Inferring it pulls @langchain/core's generic
// graph into every module that defines a tool, and that instantiation — not file size — is what
// makes agent-chat exceed 12 GB and drop out of the edge typecheck gate entirely (inbox-api is a
// comparable 2.8k lines and checks fine). Erasing it here costs the `tool()` config shape, which
// `npm run tools:manifest` + tests/unit/toolkitCoverage.test.ts already enforce from the AST, and
// buys a compiler over the tool bodies, which nothing had before.
const { tool } = await import('npm:@langchain/core@1.1.15/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  // Return stays `any`: consumers pass these to bindTools()/registerTools(), and narrowing it
  // to `unknown` would break them. The INPUT is what we want typed, and S gives us that.
  ) => any;
};
const { z } = await import('npm:zod@3.24.0');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const MODULE_SLUG = 'social-media';

import { serviceClient as svcClient } from '../supabase-client.ts';
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
      .select('id, platform, handle, is_active, zernio_account_id')
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
    async ({ action, account_id, platform, caption, hashtags, image_urls, scheduled_at, topic, tone, prompt }: any) => {
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
        if (!caption || !String(caption).trim()) {
          return JSON.stringify({ success: false, error: 'caption is required to publish or schedule a post.' });
        }
        const resolved = await resolveAccount(ws, account_id, platform);
        if (!resolved.ok) return JSON.stringify({ success: false, error: resolved.error, candidates: (resolved as any).candidates });
        const acct = resolved.account;

        // Draft the post row (server-derived identity). Allowlisted payload — never spread input.
        const { data: post, error: postErr } = await svc
          .from('social_posts')
          .insert({
            workspace_id: ws,
            user_id: userId,
            social_account_id: acct.id,
            platform: acct.platform,
            post_type: (Array.isArray(image_urls) && image_urls.length) ? 'image' : 'text',
            caption: String(caption),
            hashtags: Array.isArray(hashtags) ? hashtags.map(String) : null,
            image_urls: Array.isArray(image_urls) ? image_urls.map(String) : null,
            status: 'draft',
          })
          .select('id')
          .single();
        if (postErr || !post) return JSON.stringify({ success: false, error: `Could not draft the post: ${postErr?.message || 'unknown'}` });

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
        const resolved = account_id || platform ? await resolveAccount(ws, account_id, platform) : null;
        const res = await callZernio(jwt!, {
          action: 'get_account_insights',
          ...(resolved && resolved.ok ? { social_account_id: resolved.account.id } : { workspace_id: ws }),
        });
        if (!res.ok) return JSON.stringify({ success: false, error: res.error });
        onChunk?.({ type: 'social_insights', insights: res.data, timestamp: Date.now() });
        return JSON.stringify({ success: true, insights: res.data });
      }

      if (action === 'post_analytics') {
        const res = await callZernio(jwt!, { action: 'get_post_analytics', workspace_id: ws });
        if (!res.ok) return JSON.stringify({ success: false, error: res.error });
        onChunk?.({ type: 'social_post_analytics', result: res.data, timestamp: Date.now() });
        return JSON.stringify({ success: true, result: res.data });
      }

      if (action === 'generate_content') {
        if (!topic || !platform) return JSON.stringify({ success: false, error: 'generate_content needs a topic and a platform.' });
        const res = await callEdge(jwt!, 'generate-social-content', { topic, platform, tone, workspace_id: ws });
        if (!res.ok || res.data?.success === false) return JSON.stringify({ success: false, error: res.data?.error || res.error });
        onChunk?.({ type: 'social_content_generated', platform, data: res.data, timestamp: Date.now() });
        return JSON.stringify({ success: true, ...res.data, message: 'Draft caption + hashtags generated. Review, then use publish/schedule.' });
      }

      if (action === 'generate_image') {
        if (!prompt) return JSON.stringify({ success: false, error: 'generate_image needs a prompt.' });
        const res = await callEdge(jwt!, 'generate-social-image', { prompt, platform, workspace_id: ws });
        if (!res.ok || res.data?.success === false) return JSON.stringify({ success: false, error: res.data?.error || res.error });
        const url = res.data?.image_url ?? res.data?.url ?? null;
        onChunk?.({ type: 'social_image_generated', platform: platform ?? null, image_url: url, timestamp: Date.now() });
        return JSON.stringify({ success: true, image_url: url, message: 'Image generated. Pass it in image_urls[] on publish/schedule.' });
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
        '  publish          → post NOW. Needs caption + (account_id OR platform); optional hashtags[], image_urls[].',
        '  schedule         → post at a future time. Same as publish + scheduled_at (ISO datetime).',
        '  best_time        → recommended posting window for an account (account_id or platform).',
        '  account_insights → follower/engagement insights for an account (or the whole workspace if none given).',
        '  post_analytics   → sync + return analytics for the workspace\'s published posts.',
        '  generate_content → AI-draft a caption + hashtags for a topic on a platform (topic + platform).',
        '  generate_image   → AI-generate an image from a prompt; returns an image_url to attach on publish.',
        '',
        'Typical flow: generate_content (+ generate_image) → review with the user → publish/schedule.',
        'Always confirm the copy, target account, and (for schedule) the exact time with the user before publishing.',
      ].join('\n'),
      schema: z.object({
        action: z.enum(['list_accounts', 'publish', 'schedule', 'best_time', 'account_insights', 'post_analytics', 'generate_content', 'generate_image']),
        account_id: z.string().uuid().optional().describe('Target connected account id.'),
        platform: z.string().optional().describe("Platform name (e.g. 'instagram', 'facebook', 'linkedin') to resolve the account, or the target platform for generate_content/generate_image."),
        caption: z.string().optional().describe('Post text/caption (publish/schedule).'),
        hashtags: z.array(z.string()).optional().describe('Optional hashtags, appended to the caption.'),
        image_urls: z.array(z.string()).optional().describe('Optional image URLs to attach.'),
        scheduled_at: z.string().optional().describe('ISO datetime for schedule.'),
        topic: z.string().optional().describe('generate_content: what the post is about.'),
        tone: z.string().optional().describe('generate_content: optional tone (e.g. playful, professional).'),
        prompt: z.string().optional().describe('generate_image: the image description.'),
      }),
    },
  );
};
