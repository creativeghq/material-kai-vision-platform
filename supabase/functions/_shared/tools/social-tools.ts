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
    async ({ action, account_id, platform, caption, hashtags, image_urls, scheduled_at, topic, tone, prompt, post_id, source_image_url, video_model, duration_seconds, aspect_ratio, job_id, confirm }: any) => {
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

        // SECURITY INVARIANT 9 (#352 A3). Publishing had NO gate of any kind — no `confirm` in
        // the schema, no `action_confirmation` chunk. The only "confirm" in this file was the
        // word in the tool description, which is a request to the model rather than a gate.
        //
        // The caption is frequently model-written from material this agent scraped
        // (`generate_content`, tech-radar results, SERP snippets), so a poisoned page could
        // supply the copy AND trigger the call, and the post was live on the workspace's real
        // account before any human saw it. A published post cannot be recalled — the platform
        // has already fanned it out — which is why this is gated like a WhatsApp send rather
        // than like a draft.
        //
        // Placed AFTER account resolution so the card can name the real handle: "post to
        // @materialshub" is a decision someone can make, "post to platform instagram" is not.
        // It is still before the draft row and before any call to Zernio.
        if (confirm !== true) {
          const preview = String(caption).trim().slice(0, 180);
          const tags = Array.isArray(hashtags) && hashtags.length ? ` ${hashtags.map(String).join(' ')}` : '';
          const imgs = Array.isArray(image_urls) && image_urls.length ? ` with ${image_urls.length} image(s)` : '';
          onChunk?.({
            type: 'action_confirmation',
            tool: 'manage_social',
            input: { action, account_id: acct.id, caption, hashtags, image_urls, scheduled_at },
            title: action === 'publish' ? 'Publish this post now?' : 'Schedule this post?',
            summary: `"${preview}${tags}"${imgs} → ${acct.platform}${acct.handle ? ` (${acct.handle})` : ''}`
              + (action === 'publish'
                ? '. It goes out immediately and cannot be recalled.'
                : ` at ${scheduled_at}. It will go out automatically.`),
            danger: true,
            toolkit_id: 'social',
            timestamp: Date.now(),
          });
          return JSON.stringify({
            success: true,
            awaiting_confirmation: true,
            message: "Awaiting the user's approval to post. Do not retry.",
          });
        }

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
        const res = await callEdge(jwt!, 'generate-social-content', { topic, platform, tone, workspace_id: ws, post_id });
        if (!res.ok || res.data?.success === false) return JSON.stringify({ success: false, error: res.data?.error || res.error });
        // `post_id` is on the chunk so the card can hand off to the draft it just wrote, and it is
        // named in the message so the NEXT call in the flow attaches to that draft instead of
        // starting a new one.
        onChunk?.({ type: 'social_content_generated', platform, post_id: res.data?.post_id ?? null, data: res.data, timestamp: Date.now() });
        return JSON.stringify({
          success: true,
          ...res.data,
          message: res.data?.post_id
            ? `Draft caption + hashtags saved to post ${res.data.post_id}. Pass that post_id to generate_image so the picture lands on THIS draft, then publish/schedule.`
            : 'Draft caption + hashtags generated. Review, then use publish/schedule.',
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
        '  publish          → post NOW. Needs caption + (account_id OR platform); optional hashtags[], image_urls[].',
        '  schedule         → post at a future time. Same as publish + scheduled_at (ISO datetime).',
        '  best_time        → recommended posting window for an account (account_id or platform).',
        '  account_insights → follower/engagement insights for an account (or the whole workspace if none given).',
        '  post_analytics   → sync + return analytics for the workspace\'s published posts.',
        '  generate_content → AI-draft a caption + hashtags for a topic on a platform (topic + platform).',
        '                     Saves a DRAFT post and returns its post_id.',
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
        action: z.enum(['list_accounts', 'publish', 'schedule', 'best_time', 'account_insights', 'post_analytics', 'generate_content', 'generate_image', 'generate_video', 'video_status']),
        confirm: z.boolean().optional().describe('Do NOT set — the Approve/Decline card sets confirm:true on approval.'),
        account_id: z.string().uuid().optional().describe('Target connected account id.'),
        platform: z.string().optional().describe("Platform name (e.g. 'instagram', 'facebook', 'linkedin') to resolve the account, or the target platform for generate_content/generate_image."),
        caption: z.string().optional().describe('Post text/caption (publish/schedule).'),
        hashtags: z.array(z.string()).optional().describe('Optional hashtags, appended to the caption.'),
        image_urls: z.array(z.string()).optional().describe('Optional image URLs to attach.'),
        scheduled_at: z.string().optional().describe('ISO datetime for schedule.'),
        topic: z.string().optional().describe('generate_content: what the post is about.'),
        tone: z.string().optional().describe('generate_content: optional tone (e.g. playful, professional).'),
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
          'h3-max-768p', 'h3-max-480p', 'veo-2', 'kling-3.0',
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
