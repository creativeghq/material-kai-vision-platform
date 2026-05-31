# Social Media System

## Overview

The Social Media system is built as **KAI agent tools** (same pattern as B2B/SEO tools) using [Zernio](https://docs.zernio.com/) as the publishing backbone. Each user connects their own social accounts from their profile — accounts are per-user, not per-workspace-admin.

---

## Architecture

```
User Profile → SocialAccountsTab → zernio-api (action=connect) → Zernio authUrl
            ← Zernio redirects back to the app with ?connected&accountId
            → zernio-api (action=callback) → upsert social_accounts
KAI Agent   → Social Tools       → zernio-api (publish/schedule/analytics) → Zernio API
Zernio      → zernio-webhook-handler → reconcile social_posts / social_accounts
Admin Panel → /admin/social-media/* → Direct DB queries (social_posts, social_accounts)
```

`zernio-api` is one edge function; the `action` field selects the handler (oauth / publish / analytics). Full request/response contract: [api/zernio-social-api.md](api/zernio-social-api.md).

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
| `generate-social-video` | Video generation via Kling 1.6 Pro or Veo | `REPLICATE_API_TOKEN`, `GOOGLE_AI_API_KEY` |
| `generate-interior-video-v2` | Multi-model interior video (Veo 2 / Kling / Wan / Runway) | `REPLICATE_API_TOKEN`, `GOOGLE_AI_API_KEY` |

---

## Required Secrets

Resolution is **env-first, then `platform_secrets` (DB)** — set via edge-function env **or** at `/admin/modules/social-media → Settings`. The Zernio keys additionally **fall back to the legacy `LATE_*` names** so an old deployment keeps working until the new key is pasted.

| Secret Name | Where to get it |
|-------------|----------------|
| `ZERNIO_API_KEY` *(fallback: `LATE_API_KEY`)* | [Zernio Dashboard](https://zernio.com) → API Keys. The old Late key will **not** authenticate against Zernio — a real Zernio key is required. |
| `ZERNIO_WEBHOOK_SECRET` *(fallback: `LATE_WEBHOOK_SECRET`)* | Zernio Dashboard → Webhooks → copy the signing secret |
| `XAI_API_KEY` | [x.ai console](https://console.x.ai) |
| `GOOGLE_AI_API_KEY` | Google AI Studio or Google Cloud → Gemini API |
| `REPLICATE_API_TOKEN` | [replicate.com/account/api-tokens](https://replicate.com/account/api-tokens) |

> **Note**: `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are already set if KAI agent is working.

---

## Zernio Setup

1. **Plan**: a Zernio plan with API access + multi-account + the analytics add-on (analytics endpoints — follower-stats, post analytics — require it; see [zernio.com](https://zernio.com) for current pricing/tiers).
2. **OAuth redirect**: `redirect_url` is passed **per connect call** (the frontend sends its own profile-page URL, e.g. `https://app.example.com/profile`). Zernio returns the browser there with `?connected&accountId`. Whitelist your **app origin** as an allowed redirect domain in the Zernio dashboard if it asks — there is no static edge-function callback URL to register.
3. **Webhook URL** to register in Zernio:
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

## Video Generation (Interior Designer)

| Trigger | Model auto-selected |
|---------|-------------------|
| `walkthrough` / `floorplan` | Google Veo 2 (30 cr) |
| `product` / `before_after` / `social_reel` | Kling 1.6 Pro via Replicate (15 cr) |

Replicate calls are async — if they exceed 50s the function stores the `replicate_prediction_id` and returns a `job_id` for frontend polling.

---

## KAI Agent Tools (11 social tools)

All injected in `agent-chat/index.ts` under the `if (isAdmin)` RBAC gate:

| Tool name | Action |
|-----------|--------|
| `connect_social_account` | Returns Zernio OAuth URL for a platform |
| `list_social_accounts` | Lists connected accounts for the user |
| `disconnect_social_account` | Disconnects a social account |
| `generate_social_post` | Claude generates 3 captions + hashtags (2 cr) |
| `generate_social_image` | Routes to xAI / Gemini / FLUX |
| `generate_social_video` | Kling 1.6 Pro or Veo video |
| `publish_social_post` | Publishes immediately via Zernio |
| `schedule_social_post` | Schedules for a future time via Zernio |
| `get_best_posting_time` | Zernio ML-based best time suggestion |
| `get_post_analytics` | Fetches engagement metrics for a post |
| `get_account_insights` | Fetches account-level follower/reach data |

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

> **Note:** The Dashboard, Create, Calendar, and Analytics pages were removed. Social content creation is handled via the KAI agent (`/kai`). Account connection is per-user via **My Profile → Social Accounts**.

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
- [ ] Register webhook URL in Zernio dashboard
- [ ] Register OAuth redirect URL in Zernio dashboard
- [ ] Deploy edge functions (all 8 new functions are in `config.toml`)
- [ ] Verify `social_accounts`, `social_posts`, `social_post_analytics`, `social_account_insights` tables exist
- [ ] Verify background agents are registered in DB (`background_agents` table)
