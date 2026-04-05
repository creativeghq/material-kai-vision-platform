# Pinterest Integration

Import Pinterest pins into moodboards with automatic material matching from the catalog.

---

## Overview

Two-phase integration:

**Phase 1 (No OAuth):** Paste a pin URL → extract metadata via oEmbed → import to moodboard → auto-match with catalog materials.

**Phase 2 (OAuth):** Connect Pinterest account → browse boards → select pins → bulk import.

---

## Edge Functions

| Function | Purpose |
|----------|---------|
| `pinterest-import` | Pin URL extraction + import (oEmbed, no auth needed) |
| `pinterest-oauth` | OAuth flow + board/pin API proxy |

---

## Phase 1: URL Import

No API key required. Uses Pinterest's public oEmbed endpoint.

**Actions:**
- `extract_pin` — extracts title, image URL, author from pin URL
- `import_pin` — downloads image, uploads to storage, creates moodboard item, runs visual search
- `import_pins_bulk` — batch import multiple URLs

**Auto-matching:** Each imported pin image is run through MIVAA visual search (`/api/rag/search` with `multi_vector` strategy) to find similar materials in the catalog. Top matches shown to user.

---

## Phase 2: OAuth Board Browsing

Requires Pinterest developer app registration (~1-2 weeks approval).

**Actions:**
- `get_auth_url` — generates OAuth URL with CSRF state
- `callback` — exchanges code for tokens, stores in `social_accounts` table
- `get_boards` — fetches user's boards via Pinterest API v5
- `get_board_pins` — fetches pins from a board (paginated)
- `disconnect` — removes stored tokens

**Token Management:** Access tokens valid 30 days, refresh tokens 365 days. Auto-refresh on expiry with 5-minute buffer.

---

## Frontend

| Component | Purpose |
|-----------|---------|
| `PinterestImportModal` | Main UI — single URL, bulk URL, board browser |
| `pinterestService.ts` | Frontend service for all Pinterest operations |

**Integration:** "Import from Pinterest" button on MoodBoardDetailPage header (stats row).

---

## Environment Variables

```
PINTEREST_APP_ID       — from developers.pinterest.com
PINTEREST_APP_SECRET   — from developers.pinterest.com
PINTEREST_REDIRECT_URI — https://{supabase-url}/functions/v1/pinterest-oauth
```

---

## Database

OAuth tokens stored in existing `social_accounts` table with `platform = 'pinterest'`.
Import tracking via `moodboard_items` with `media_type = 'image'` and `media_title` prefixed with pin source.
