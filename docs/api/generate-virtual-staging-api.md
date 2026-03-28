# Virtual Staging API

**Function:** `generate-virtual-staging`
**Base URL:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/generate-virtual-staging`
**Auth:** Authenticated users (JWT required)
**Credits:** 20 per generation

Full documentation: [virtual-staging.md](../virtual-staging.md)

---

## Stage a room

```
POST /functions/v1/generate-virtual-staging
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "source_image_url": "https://...",
  "room": "living_room",
  "furniture_style": "scandinavian",
  "furniture_items": "optional free-text override",
  "workspace_id": "uuid"
}
```

### Room options
`living_room` · `bedroom` · `dining_room` · `kitchen` · `bathroom` · `home_office` · `kids_room` · `outdoor`

### Style options
`modern` · `scandinavian` · `industrial` · `traditional` · `bohemian` · `minimalist` · `luxury` · `rustic`

---

## Response

```json
{
  "success": true,
  "image_url": "https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/generation-images/virtual-staging/uuid.jpg",
  "credits_used": 20
}
```

## Errors

| Status | Meaning |
|---|---|
| `400` | Missing required fields |
| `401` | Unauthorized |
| `402` | Insufficient credits |
| `500` | Replicate model error |
