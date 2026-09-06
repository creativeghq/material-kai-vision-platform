# Social Media System

## Overview

The Social Media system is built as **JARVIS agent tools** (same pattern as B2B/SEO tools) using [Zernio](https://docs.zernio.com/) as the publishing backbone. Each user connects their own social accounts from their profile — accounts are per-user, not per-workspace-admin.

---

## Architecture

```
User Profile → SocialAccountsTab → zernio-api (action=connect) → Zernio authUrl
            ← Zernio redirects back to the app with ?connected&accountId
            → zernio-api (action=callback) → upsert social_accounts
JARVIS agent   → Social Tools       → zernio-api (publish/schedule/analytics) → Zernio API
Zernio      → zernio-webhook-handler → reconcile social_posts / social_accounts
Admin Panel → /admin/social-media/* → Direct DB queries (social_posts, social_accounts)
```

`zernio-api` is one edge function; the `action` field selects the handler (oauth / publish / analytics). Full request/response contract: [social-media-system.md](social-media-system.md).

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `social_accounts` | Connected accounts per workspace. Stores `zernio_account_id` (Zernio holds the OAuth tokens, not us). Unique on `(workspace_id, platform, zernio_account_id)`. |
| `social_zernio_profiles` | `workspace_id → zernio_profile_id` map. One Zernio profile per workspace, lazily find-or-created on first connect (`ws:{workspace_id}`). Service-role only. |
| `social_posts` | Draft / scheduled / published posts. `zernio_post_id` stamped on publish. |
| `social_post_analytics` | Per-post engagement metrics |
| `social_account_insights` | Account-level follower / posts snapshots |

**RLS policies on `social_accounts`:**
- Workspace members can read all workspace accounts (admin view)
- Users can only manage their own accounts (`user_id = auth.uid()`)

---

## Edge Functions

| Function | Purpose | Secrets needed |
|----------|---------|---------------|
| `zernio-api` | Unified router (`action` selects handler): **oauth** (connect/callback/disconnect/list), **publish** (publish_now/schedule), **analytics** (get_post_analytics/get_account_insights/get_best_time) | `ZERNIO_API_KEY` |
| `zernio-webhook-handler` | Receive Zernio webhooks (`post.published`, `post.failed`, `post.partial`, `post.cancelled`, `post.scheduled`, `account.disconnected`) | `ZERNIO_WEBHOOK_SECRET` |
| `generate-social-content` | Claude Haiku generates 3 caption variants + hashtags | *(uses shared ANTHROPIC_API_KEY)* |
| `generate-social-image` | Image generation — routes by type (lifestyle/product/artistic) | `XAI_API_KEY`, `GOOGLE_AI_API_KEY`, `REPLICATE_API_TOKEN` |
| `generate-social-video` | Short-form reel. Delegates every model but `kling-3.0` to `generate-interior-video-v2`; attaches the result to the post. `{ action: 'status', job_id }` collects a render that outran the inline poll | `REPLICATE_API_TOKEN`, `GOOGLE_AI_API_KEY` |
| `generate-interior-video-v2` | Multi-model interior video (Veo 2 / Kling / Wan / Runway) | `REPLICATE_API_TOKEN`, `GOOGLE_AI_API_KEY` |

---

## Required Secrets

Resolution is **env-first, then `platform_secrets` (DB)** — set via edge-function env **or** at `/admin/modules/social-media → Settings`. The Zernio keys additionally **fall back to the legacy `LATE_*` names** so an old deployment keeps working until the new key is pasted.

| Secret Name | Where to get it |
|-------------|----------------|
| `ZERNIO_API_KEY` *(fallback: `LATE_API_KEY`)* | [Zernio Dashboard](https://zernio.com) → API Keys. The old Late key will **not** authenticate against Zernio — a real Zernio key is required. |
| `ZERNIO_WEBHOOK_SECRET` *(fallback: `LATE_WEBHOOK_SECRET`)* | **You invent this one** — there is nothing to copy from Zernio. Generate a random string (`openssl rand -hex 32`), save it here, then register the webhook (below): `ensureZernioWebhook` **sends** this secret to Zernio as the signing key. |
| `XAI_API_KEY` | [x.ai console](https://console.x.ai) |
| `GOOGLE_AI_API_KEY` | Google AI Studio or Google Cloud → Gemini API |
| `REPLICATE_API_TOKEN` | [replicate.com/account/api-tokens](https://replicate.com/account/api-tokens) |

> **Note**: `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are already set if JARVIS agent is working.

---

## Zernio Setup

1. **Plan**: a Zernio plan with API access + multi-account + the analytics add-on (analytics endpoints — follower-stats, post analytics — require it; see [zernio.com](https://zernio.com) for current pricing/tiers).
2. **OAuth redirect**: `redirect_url` is passed **per connect call** (the frontend sends its own profile-page URL, e.g. `https://app.example.com/profile`). Zernio returns the browser there with `?connected&accountId`. Whitelist your **app origin** as an allowed redirect domain in the Zernio dashboard if it asks — there is no static edge-function callback URL to register.
3. **Webhook**: do NOT hand-create it in the Zernio dashboard — register it from the app, at
   **/messaging → Register webhook** (`messaging-api` `action: register-webhook`). It pushes the URL,
   the full `ZERNIO_WEBHOOK_EVENTS` list and `ZERNIO_WEBHOOK_SECRET` to Zernio in one call, and repairs a
   hook Zernio auto-disabled after 10 failed deliveries. It refuses if the secret is unset, because the
   handler verifies signatures and fails closed — registering first would just get the hook switched off.
   The URL it registers:
   ```
   https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/zernio-webhook-handler
   ```
4. **Supported platforms**: Instagram, Facebook, LinkedIn, TikTok, Pinterest, YouTube, Twitter/X, Threads

---

## Image Generation Routing

| `image_type` param | Model | Credits |
|--------------------|-------|---------|
| `lifestyle` | xAI Aurora (`grok-2-aurora`) | 10 cr |
| `product` or `interior` | Imagen 3.0 (`imagen-3.0-generate-002`) | 5 cr |
| `artistic` | FLUX Dev (Replicate) | 6 cr |

---

## Video Generation

`generate-social-video` is **image-to-video**: it animates a still, so the draft needs an image
first (`generate_image` puts one there, and `generate_video` reads it off the post).

| Model | Credits | Notes |
|---|---|---|
| `h3-max-768p` **(default)** | 25 | 5–15s with stereo audio. The reel format itself. |
| `h3-max-480p` | 15 | Same, cheaper. |
| `veo-2` | 50 | |
| `wan-3.0-480p/720p/1080p` | 30 / 55 / 110 | Up to 30s, scored. |
| `seedance-2.5-480p/720p` | 60 / 125 | Up to 30s in one pass. |
| `ray-3.2-720p/1080p` | 20 / 70 | Interpolates to a LAST frame. |
| `kling-3.0` | 20 | **Do not pick it.** The one model still run here through Replicate, which is answering `auth_failed` to every call. It is why the default moved off it. |

Every model except `kling-3.0` is delegated to `generate-interior-video-v2`, which debits its own
credits. `generate-social-video` adds what the generator cannot know: it writes `video_url` onto
the post and stamps `generation_videos.social_post_id` so a job that finishes later can find its
way back.

**A render that outruns the 50s inline poll must be collected.** The call returns
`status: 'processing'` and a `job_id`; `{ action: 'status', job_id }` polls the provider once and,
on success, downloads the file into our bucket, attaches it to the post and writes the billing
row. Nothing else does this: `reconcile_stuck_generation_videos` only marks a 30-minute-old job
**failed** and refunds it, so before the collector existed a video Replicate finished at 90
seconds was thrown away and reported as a failure. The agent reaches it through
`manage_social`'s `video_status`.

---

## Agent surface — ONE tool, `manage_social`

There are not eleven social tools. There is **one**, `manage_social`
(`_shared/tools/social-tools.ts`), action-routed. The eleven names this table used to list —
`generate_social_post`, `publish_social_post`, `connect_social_account` and the rest — were
consolidated and **none of them exists**; an agent instructed to call one gets nothing back.

| Action | What it does |
|---|---|
| `list_accounts` | Connected accounts (id, platform, handle). Start here when the target is unclear. |
| `generate_content` | Claude drafts a caption + hashtags, **saves a draft post** and returns its `post_id`. |
| `generate_image` | Image via Aurora / Gemini / FLUX. Pass `post_id` and it attaches to that draft. |
| `generate_video` | Vertical reel FROM the draft's image (H3 Max default, 25 cr). Pass `post_id`. |
| `video_status` | Collect a render that was still processing. **This is the call that stores the video and attaches it** — an uncollected job is abandoned and refunded after 30 minutes. |
| `publish` / `schedule` | Send now / queue, via `zernio-api`. Both go through the Approve/Decline gate. |
| `best_time` | Zernio's recommended posting window. |
| `account_insights` / `post_analytics` | Follower + engagement reads. |

**Connecting an account is NOT a tool** — it is an OAuth handshake with Meta/LinkedIn that
exists only in the app UI (Profile → Social Accounts). The tool description says so, and
`RESULT_SETUP_DESTINATION` links the card there rather than asking the model to do it.

**`post_id` is the thread through the whole flow.** One post is one `social_posts` row: the
caption, the image and the reel all land on the same draft. Drop it between calls and each
action files its own half-finished draft instead.

## Page surface

Profile → Social Accounts → **Analytics** lists every post, drafts included, and a row opens
`SocialPostEditorDialog`: edit the caption and hashtags, see the attached media, then publish,
schedule or delete. Publishing goes through `zernio-api`, never a local write of
`status: 'published'` — the status records a send that happened, so setting it here would invent
one. A published post is read-only; editing its caption after the fact would leave our copy
disagreeing with the live post.

---

## Background Agents

Two agents sync data automatically:

| Agent type | Schedule | Action |
|-----------|----------|--------|
| `social-analytics-sync` | Every 2 hours | Syncs published posts missing analytics from Zernio |
| `social-insights-sync` | Daily at 6am | Snapshots account-level insights |

Both registered in `supabase/functions/_shared/agents/registry.ts`.

---

## Admin Panel Routes

| Route | Component |
|-------|-----------|
| `/admin/social-media/accounts` | `SocialMediaAccountsPage` — read-only workspace overview of all connected accounts |

> **Note:** The Dashboard, Create, Calendar, and Analytics pages were removed. Social content creation is handled via the JARVIS agent (`/kai`). Account connection is per-user via **My Profile → Social Accounts**.

## Per-User Account Connection

Users connect their own accounts from **My Profile → Social Accounts** (`/profile?tab=social-accounts`).

The `SocialAccountsTab` component (`src/modules/social-media/components/SocialAccountsTab.tsx`):
- Shows connected platforms with handle, follower count, last synced
- Connect button → `zernio-api action=connect` (passes the current page as `redirect_url`) → opens the Zernio `authUrl` in a new tab
- On return, the new tab lands back here with `?connected&accountId`; the component fires `zernio-api action=callback` (same Supabase session) to persist the account, then strips the params
- Disconnect button → `zernio-api action=disconnect` → marks account inactive in DB + revokes on Zernio

---

## Credit Costs Summary

| Action | Credits |
|--------|---------|
| Caption generation (3 variants) | 2 cr |
| Social image — lifestyle (xAI Aurora) | 10 cr |
| Social image — product/interior (Gemini) | 5 cr |
| Social image — artistic (FLUX Dev) | 6 cr |
| Social video — Kling 1.6 Pro | 15 cr |
| Social video — Veo 2 | 30 cr |
| Interior video — Veo 2 | 30 cr |
| Interior video — Kling 1.6 Pro | 15 cr |
| Publishing via Zernio | 0 cr (API cost covered by Zernio plan) |

---

## Deployment Checklist

- [ ] Add secrets: `ZERNIO_API_KEY`, `ZERNIO_WEBHOOK_SECRET`, `XAI_API_KEY`, `GOOGLE_AI_API_KEY`, `REPLICATE_API_TOKEN`
- [ ] Register the webhook from /messaging → Register webhook (AFTER setting `ZERNIO_WEBHOOK_SECRET`)
- [ ] Register OAuth redirect URL in Zernio dashboard
- [ ] Deploy edge functions (all 8 new functions are in `config.toml`)
- [ ] Verify `social_accounts`, `social_posts`, `social_post_analytics`, `social_account_insights` tables exist
- [ ] Verify background agents are registered in DB (`background_agents` table)
