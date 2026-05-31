# Pinterest API

**Edge Function:** `pinterest-api`
**Base URL:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/pinterest-api`

## Actions

### Import (no OAuth required — uses Pinterest oEmbed)

| Action | Body | Result |
|---|---|---|
| `extract_pin` | `{ pin_url }` | Returns pin metadata (title, image, author, source_url). |
| `import_pin` | `{ pin_url, moodboard_id, notes? }` | Imports a single pin into a moodboard. Auto-runs visual search to suggest matching catalog products. |
| `import_pins_bulk` | `{ pin_urls: string[], moodboard_id }` | Imports many pins in parallel. Returns `{ imported, failed, results[] }`. |

### OAuth (browse user's boards + pins)

| Action | Body | Result |
|---|---|---|
| `get_auth_url` | `{ workspace_id }` | Returns the Pinterest OAuth authorization URL. |
| `callback` | `{ code, state }` | Exchanges the OAuth code for tokens, stores in `social_accounts`. |
| `get_boards` | `{}` | Lists the connected user's Pinterest boards. |
| `get_board_pins` | `{ board_id, bookmark? }` | Lists pins in a specific board. |
| `disconnect` | `{}` | Removes the Pinterest OAuth tokens. |

## Authentication

```http
Authorization: Bearer <supabase_access_token>
```

## Request

```http
POST /functions/v1/pinterest-api
Content-Type: application/json

{ "action": "extract_pin", "pin_url": "https://www.pinterest.com/pin/123/" }
```

## Environment

Required when using OAuth actions:
- `PINTEREST_APP_ID`
- `PINTEREST_APP_SECRET`
- `PINTEREST_REDIRECT_URI` (must match the URL registered in the Pinterest app — point at `/functions/v1/pinterest-api`)
