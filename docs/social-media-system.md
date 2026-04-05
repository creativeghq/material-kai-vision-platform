# Social Media System

## Overview

The Social Media system is built as **KAI agent tools** (same pattern as B2B/SEO tools) using [Late.dev](https://docs.getlate.dev/) as the publishing backbone. Each user connects their own social accounts from their profile — accounts are per-user, not per-workspace-admin.

---

## Architecture

```
User Profile → SocialAccountsTab → late-oauth (edge fn) → Late.dev OAuth
KAI Agent   → Social Tools       → late-publish / late-analytics (edge fns) → Late.dev API
Admin Panel → /admin/social-media/* → Direct DB queries (social_posts, social_accounts)
```

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `social_accounts` | OAuth tokens per user per platform |
| `social_posts` | Draft / scheduled / published posts |
| `social_post_analytics` | Per-post engagement metrics |
| `social_account_insights` | Account-level follower/reach snapshots |

**RLS policies on `social_accounts`:**
- Workspace members can read all workspace accounts (admin view)
- Users can only manage their own accounts (`user_id = auth.uid()`)

---

## Edge Functions

| Function | Purpose | Secrets needed |
|----------|---------|---------------|
| `late-oauth` | Connect / disconnect / list social accounts via Late.dev OAuth | `LATE_API_KEY` |
| `late-publish` | Publish or schedule posts via Late.dev | `LATE_API_KEY` |
| `late-analytics` | Fetch post analytics + account insights from Late.dev | `LATE_API_KEY` |
| `late-webhook-handler` | Receive Late.dev webhooks (post.published, post.failed, etc.) | `LATE_WEBHOOK_SECRET` |
| `generate-social-content` | Claude Haiku generates 3 caption variants + hashtags | *(uses shared ANTHROPIC_API_KEY)* |
| `generate-social-image` | Image generation — routes by type (lifestyle/product/artistic) | `XAI_API_KEY`, `GOOGLE_AI_API_KEY`, `REPLICATE_API_TOKEN` |
| `generate-social-video` | Video generation via Kling 1.6 Pro or Veo | `REPLICATE_API_TOKEN`, `GOOGLE_AI_API_KEY` |
| `generate-interior-video-v2` | Multi-model interior video (Veo 2 / Kling / Wan / Runway) | `REPLICATE_API_TOKEN`, `GOOGLE_AI_API_KEY` |

---

## Required Secrets

Add these in **Supabase Dashboard → Project Settings → Edge Functions → Secrets**:

| Secret Name | Where to get it |
|-------------|----------------|
| `LATE_API_KEY` | [Late.dev Dashboard](https://app.getlate.dev) → API Keys |
| `LATE_WEBHOOK_SECRET` | Late.dev Dashboard → Webhooks → copy the signing secret |
| `XAI_API_KEY` | [x.ai console](https://console.x.ai) |
| `GOOGLE_AI_API_KEY` | Google AI Studio or Google Cloud → Gemini API |
| `REPLICATE_API_TOKEN` | [replicate.com/account/api-tokens](https://replicate.com/account/api-tokens) |

> **Note**: `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are already set if KAI agent is working.

---

## Late.dev Setup

1. **Plan**: Accelerate ($49/mo) — required for API access + multi-account + analytics
2. **OAuth redirect URL** to register in Late.dev:
   ```
   https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/late-oauth?action=callback
   ```
3. **Webhook URL** to register in Late.dev:
   ```
   https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/late-webhook-handler
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
| `connect_social_account` | Returns Late.dev OAuth URL for a platform |
| `list_social_accounts` | Lists connected accounts for the user |
| `disconnect_social_account` | Disconnects a social account |
| `generate_social_post` | Claude generates 3 captions + hashtags (2 cr) |
| `generate_social_image` | Routes to xAI / Gemini / FLUX |
| `generate_social_video` | Kling 1.6 Pro or Veo video |
| `publish_social_post` | Publishes immediately via Late.dev |
| `schedule_social_post` | Schedules for a future time via Late.dev |
| `get_best_posting_time` | Late.dev ML-based best time suggestion |
| `get_post_analytics` | Fetches engagement metrics for a post |
| `get_account_insights` | Fetches account-level follower/reach data |

---

## Background Agents

Two agents sync data automatically:

| Agent type | Schedule | Action |
|-----------|----------|--------|
| `social-analytics-sync` | Every 2 hours | Syncs published posts missing analytics from Late.dev |
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

The `SocialAccountsTab` component (`src/components/core/Profile/SocialAccountsTab.tsx`):
- Shows connected platforms with handle, follower count, last synced
- Connect button → calls `late-oauth` → opens Late.dev OAuth in new tab
- Disconnect button → marks account inactive in DB + notifies Late.dev

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
| Publishing via Late.dev | 0 cr (API cost covered by Late.dev plan) |

---

## Deployment Checklist

- [ ] Add secrets: `LATE_API_KEY`, `LATE_WEBHOOK_SECRET`, `XAI_API_KEY`, `GOOGLE_AI_API_KEY`, `REPLICATE_API_TOKEN`
- [ ] Register webhook URL in Late.dev dashboard
- [ ] Register OAuth redirect URL in Late.dev dashboard
- [ ] Deploy edge functions (all 8 new functions are in `config.toml`)
- [ ] Verify `social_accounts`, `social_posts`, `social_post_analytics`, `social_account_insights` tables exist
- [ ] Verify background agents are registered in DB (`background_agents` table)
