# Late.dev Social Media API

**Functions:** `late-oauth`, `late-publish`, `late-analytics`, `late-webhook-handler`
**Base URL:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/`
**Auth:** Authenticated users (JWT required)

Full documentation: [social-media-system.md](../social-media-system.md)

---

## OAuth — Connect / Disconnect Accounts

**Function:** `late-oauth`

### Connect a social account

```
POST /functions/v1/late-oauth
{
  "action": "connect",
  "platform": "instagram",
  "workspace_id": "uuid"
}
```

**Response:** `{ "oauth_url": "https://app.late.dev/oauth/..." }`

Redirect the user to `oauth_url`. Late.dev handles the platform OAuth and returns control to your `callback` endpoint.

### OAuth callback (called after user completes Late.dev OAuth)

```
POST /functions/v1/late-oauth
{
  "action": "callback",
  "late_account_id": "late-acc-...",
  "platform": "instagram",
  "workspace_id": "uuid"
}
```

Fetches account details from Late.dev and upserts into `social_accounts`.

### Disconnect an account

```
POST /functions/v1/late-oauth
{
  "action": "disconnect",
  "social_account_id": "uuid"
}
```

### List connected accounts

```
GET /functions/v1/late-oauth?action=list&workspace_id=<uuid>
```

**Supported platforms:** `instagram` · `facebook` · `linkedin` · `tiktok` · `pinterest` · `youtube` · `twitter` · `threads`

---

## Publishing

**Function:** `late-publish`

### Publish immediately

```
POST /functions/v1/late-publish
{
  "action": "publish_now",
  "social_account_id": "uuid",
  "content": "Caption text with #hashtags",
  "media_url": "https://...",
  "workspace_id": "uuid"
}
```

### Schedule a post

```
POST /functions/v1/late-publish
{
  "action": "schedule",
  "social_account_id": "uuid",
  "content": "Caption text",
  "media_url": "https://...",
  "scheduled_at": "2026-04-01T14:00:00Z",
  "workspace_id": "uuid"
}
```

**No credit cost** — uses the workspace's Late.dev subscription.

**Response:**
```json
{
  "success": true,
  "late_post_id": "late-post-...",
  "status": "published" | "scheduled"
}
```

---

## Analytics

**Function:** `late-analytics`

### Sync post analytics

```
POST /functions/v1/late-analytics
{
  "action": "get_post_analytics",
  "post_ids": ["uuid-1", "uuid-2"],
  "workspace_id": "uuid"
}
```

Fetches engagement metrics (likes, comments, shares, reach) from Late.dev and writes to `social_post_analytics`.

### Sync account insights

```
POST /functions/v1/late-analytics
{
  "action": "get_account_insights",
  "social_account_id": "uuid"
}
```

Syncs follower count, reach, impressions to `social_account_insights`.

### Get best posting times

```
POST /functions/v1/late-analytics
{
  "action": "get_best_time",
  "social_account_id": "uuid",
  "platform": "instagram"
}
```

**Response:** `{ "best_times": [{ "day": "Monday", "hour": 18 }, ...] }`

---

## Social Content Generation

**Function:** `generate-social-content`
**Credits:** 2 per generation

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

**Supported platforms:** `instagram` · `facebook` · `linkedin` · `tiktok` · `pinterest` · `youtube` · `twitter` · `threads`

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
{
  "prompt": "Luxury marble bathroom, natural light, editorial photography",
  "image_type": "interior",
  "aspect_ratio": "4:5",
  "workspace_id": "uuid"
}
```

Pass `model` to override auto-selection. Aspect ratios: `1:1` · `4:5` · `9:16` · `16:9`.

---

## Database Tables

| Table | Description |
|---|---|
| `social_accounts` | Connected accounts per user (OAuth tokens) |
| `social_posts` | Draft / scheduled / published posts |
| `social_post_analytics` | Per-post engagement metrics |
| `social_account_insights` | Account-level follower/reach snapshots |
