# Zernio Social Media API

**Functions:** `zernio-api` (router) + `zernio-webhook-handler`
**Base URL:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/`
**Auth:** Authenticated users (Supabase JWT in `Authorization: Bearer <token>`)
**Upstream:** [Zernio](https://zernio.com) — `https://zernio.com/api/v1`, Bearer-auth with `ZERNIO_API_KEY` (falls back to the legacy `LATE_API_KEY`).

Full documentation: [social-media-system.md](../social-media-system.md)

> `zernio-api` is a single edge function; the `action` field in the POST body selects the handler. A bare `GET` maps to the account-listing path.

---

## Concepts

- **Profile** — Zernio groups connected accounts under a *profile* (a brand/project container that holds many accounts). We lazily **find-or-create exactly one Zernio profile per workspace** (named `ws:{workspace_id}`) and cache its id in `social_zernio_profiles`. Connecting still supports unlimited accounts per workspace.
- **Account** — a connected social account. Stored in `social_accounts` with `zernio_account_id` (the Zernio-side id).
- **Post** — a `social_posts` row. Publishing sends its caption/hashtags/media to Zernio and stamps `zernio_post_id`.

---

## OAuth — Connect / Disconnect Accounts

### 1. Start a connection

```
POST /functions/v1/zernio-api
{
  "action": "connect",
  "platform": "instagram",
  "workspace_id": "uuid",
  "redirect_url": "https://app.example.com/profile"   // optional; where Zernio returns the browser
}
```

**Response:**
```json
{
  "success": true,
  "oauth_url": "https://...zernio authUrl...",
  "platform": "instagram",
  "profile_id": "zernio-profile-id"
}
```

Open `oauth_url` in a new tab. Internally this resolves the workspace's Zernio profile, then calls Zernio `GET /v1/connect/{platform}?profileId=&redirect_url=` and returns its `authUrl`.

### 2. Zernio redirects back, then call the callback

After the user authorises, Zernio redirects the browser to your `redirect_url` with query params:

```
{redirect_url}?connected=instagram&accountId=<zernio_account_id>&username=<handle>&profileId=<id>
```

The frontend (same Supabase session) reads `connected` + `accountId` and persists the account:

```
POST /functions/v1/zernio-api
{
  "action": "callback",
  "zernio_account_id": "<accountId from the redirect>",
  "platform": "instagram",
  "workspace_id": "uuid"
}
```

This fetches `GET /v1/accounts/{accountId}` from Zernio (`username` → `handle`, `displayName` → `display_name`, `profilePicture` → `avatar_url`, `followersCount` → `followers_count`) and upserts `social_accounts`.

**Response:** `{ "success": true, "account": { ...social_accounts row } }`

### Disconnect an account

```
POST /functions/v1/zernio-api
{
  "action": "disconnect",
  "social_account_id": "uuid"   // social_accounts.id (NOT the zernio id)
}
```

Calls Zernio `DELETE /v1/accounts/{zernio_account_id}` (best-effort) and sets `is_active = false`.
**Response:** `{ "success": true, "disconnected": true }`

### List connected accounts

```
GET /functions/v1/zernio-api?action=list&workspace_id=<uuid>&include_inactive=false
```

Reads `social_accounts` directly (no Zernio call). **Response:** `{ "success": true, "accounts": [...] }`

**Supported platforms:** `instagram` · `facebook` · `linkedin` · `tiktok` · `pinterest` · `youtube` · `twitter` · `threads`

---

## Publishing

Publishing operates on an existing `social_posts` **draft** — the caption, hashtags, `image_urls[]`, and `video_url` are read from that row (you pass `post_id`, **not** the content inline).

### Publish immediately

```
POST /functions/v1/zernio-api
{
  "action": "publish_now",
  "post_id": "uuid",            // social_posts.id of the draft
  "social_account_id": "uuid",  // social_accounts.id to publish to
  "workspace_id": "uuid"
}
```

### Schedule a post

```
POST /functions/v1/zernio-api
{
  "action": "schedule",
  "post_id": "uuid",
  "social_account_id": "uuid",
  "scheduled_at": "2026-04-01T14:00:00Z",  // ISO 8601, required for schedule
  "workspace_id": "uuid"
}
```

Both build a Zernio `POST /v1/posts` call: `{ content, platforms: [{ platform, accountId }], mediaItems: [{ type:"image"|"video", url }], publishNow:true | scheduledFor }`.

**No credit cost** — uses the workspace's Zernio subscription.

**Response:**
```json
{
  "success": true,
  "action": "publish_now",
  "post_id": "uuid",
  "zernio_post_id": "zernio-post-id",
  "platform": "instagram",
  "handle": "acme",
  "published_url": "https://www.instagram.com/p/...",   // when Zernio returns one
  "published_at": "2026-04-01T14:00:00Z",               // publish_now
  "scheduled_at": "2026-04-01T14:00:00Z"                // schedule
}
```

Final status is reconciled by `zernio-webhook-handler` (`post.published` / `post.failed` / `post.partial` / `post.cancelled`).

---

## Analytics

### Sync post analytics

```
POST /functions/v1/zernio-api
{ "action": "get_post_analytics", "post_ids": ["uuid-1", "uuid-2"], "workspace_id": "uuid" }
```

For each published post with a `zernio_post_id`, calls Zernio `GET /v1/analytics?postId=` and upserts `social_post_analytics` (`engagementRate` → `engagement_rate`, plus `impressions/reach/likes/comments/shares/saves/clicks`). **Response:** `{ "success": true, "synced": 2 }`

### Sync account insights

```
POST /functions/v1/zernio-api
{ "action": "get_account_insights", "social_account_id": "uuid" }   // or "workspace_id"
```

Calls Zernio `GET /v1/accounts/follower-stats?accountIds=` and writes a daily `social_account_insights` snapshot: `followers_count` (← `currentFollowers`), `following_count`, `posts_count` (← `accountStats.mediaCount`/`videoCount`/`postsCount`/…). **Note:** `avg_engagement`, `reach_7d`, `impressions_7d` are **stored as `0`** — Zernio's follower-stats endpoint does not expose them. **Response:** `{ "success": true, "synced": N }`

### Get best posting times

```
POST /functions/v1/zernio-api
{ "action": "get_best_time", "social_account_id": "uuid", "platform": "instagram" }
```

Calls Zernio `GET /v1/analytics/best-time?accountId=`. **Response** (Zernio `slots`, passed through):
```json
{
  "success": true,
  "platform": "instagram",
  "best_times": [
    { "day_of_week": 0, "hour": 18, "avg_engagement": 510.3, "post_count": 15 }
  ]
}
```
`day_of_week`: `0 = Monday … 6 = Sunday`. `hour` is UTC.

---

## Webhooks (`zernio-webhook-handler`)

Register `…/functions/v1/zernio-webhook-handler` in the Zernio dashboard. Payloads are HMAC-SHA256 signed via the `X-Zernio-Signature` header, verified with `ZERNIO_WEBHOOK_SECRET` (falls back to `LATE_WEBHOOK_SECRET`). Payload shape is `{ event, post | account, timestamp }`.

| Event | Effect |
|---|---|
| `post.published` | `social_posts.status = 'published'`, `published_at` set (matched on `post.id = zernio_post_id`) |
| `post.partial` | `status = 'published'` + `metadata.partial = true` |
| `post.failed` | `status = 'failed'` + first per-platform error stored |
| `post.cancelled` | `status = 'cancelled'` |
| `post.scheduled` | `status = 'scheduled'`, `scheduled_at` ← `post.scheduledFor` |
| `account.disconnected` | `social_accounts.is_active = false` (matched on `account.accountId`) |

Always returns `200` to prevent Zernio retry loops.

---

## Social Content Generation

**Function:** `generate-social-content` · **Credits:** 2 per generation

```
POST /functions/v1/generate-social-content
{
  "topic": "Marble bathroom renovation",
  "platform": "instagram",
  "tone": "professional",
  "product_info": { "name": "Calacatta Gold Marble", "category": "stone" },
  "include_hashtags": true,
  "hashtag_count": 10,
  "workspace_id": "uuid"
}
```

Returns 3 caption variants tailored to platform character limits, tone, and hashtag conventions.

---

## Social Image Generation

**Function:** `generate-social-image`

| Model | Image Type | Credits |
|---|---|---|
| xAI Aurora | `lifestyle` / `people` | 10 |
| Gemini Imagen | `product` / `interior` | 5 |
| FLUX Dev | `artistic` / `textured` | 6 |

```
POST /functions/v1/generate-social-image
{ "prompt": "Luxury marble bathroom, natural light, editorial photography", "image_type": "interior", "aspect_ratio": "4:5", "workspace_id": "uuid" }
```

Pass `model` to override auto-selection. Aspect ratios: `1:1` · `4:5` · `9:16` · `16:9`.

---

## Database Tables

| Table | Description |
|---|---|
| `social_accounts` | Connected accounts per workspace. Key column: `zernio_account_id` (Zernio-side id). Unique on `(workspace_id, platform, zernio_account_id)`. |
| `social_zernio_profiles` | `workspace_id → zernio_profile_id` map (one Zernio profile per workspace; service-role only). |
| `social_posts` | Draft / scheduled / published posts. `zernio_post_id` stamped on publish. `status ∈ draft·scheduled·published·failed·partial·cancelled`. |
| `social_post_analytics` | Per-post engagement metrics. |
| `social_account_insights` | Daily account-level follower/posts snapshots. |

## Secrets (module `social-media`)

| Key | Use |
|---|---|
| `ZERNIO_API_KEY` | Bearer token for all Zernio REST calls. Resolved env-first, then `platform_secrets`. Falls back to legacy `LATE_API_KEY`. |
| `ZERNIO_WEBHOOK_SECRET` | HMAC-SHA256 verification of inbound `X-Zernio-Signature`. Falls back to `LATE_WEBHOOK_SECRET`. |

Set at `/admin/modules/social-media → Settings`. The old Late key will **not** authenticate against Zernio — a real Zernio key is required.
