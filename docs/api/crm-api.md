# CRM API

**Edge Function:** `crm-api`
**Base URL:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/crm-api`

Routes by the first path segment to the matching resource handler:

| Resource | Description |
|---|---|
| `companies` | Company records (create, list, get, update, delete, link contacts) |
| `contacts` | Contact records (create, list, get, update, delete, link/unlink users, potential-matches, bulk-link, by-user) |
| `users` | Platform user admin (list, get, update, create, AI usage report) |
| `stripe` | Stripe customer state, subscriptions, credits, checkout sessions |

## Authentication

```typescript
Authorization: Bearer <supabase_access_token>
```

Or with the platform API secret key (admin access):

```typescript
apikey: sb_secret_...
```

Roles required: `admin` / `factory` (depends on resource).

## Examples

### Companies

```http
POST /functions/v1/crm-api/companies
Content-Type: application/json

{ "name": "ACME Co", "industry": "construction", ... }
```

```http
GET    /functions/v1/crm-api/companies?limit=50&offset=0
GET    /functions/v1/crm-api/companies/{id}
PUT    /functions/v1/crm-api/companies/{id}
DELETE /functions/v1/crm-api/companies/{id}
GET    /functions/v1/crm-api/companies/{id}/contacts
```

### Contacts

```http
POST   /functions/v1/crm-api/contacts
GET    /functions/v1/crm-api/contacts?limit=50
GET    /functions/v1/crm-api/contacts/{id}
PUT    /functions/v1/crm-api/contacts/{id}
DELETE /functions/v1/crm-api/contacts/{id}

POST /functions/v1/crm-api/contacts/{id}/link-user
POST /functions/v1/crm-api/contacts/{id}/unlink-user
GET  /functions/v1/crm-api/contacts/potential-matches
POST /functions/v1/crm-api/contacts/bulk-link
GET  /functions/v1/crm-api/contacts/by-user/{userId}
```

### Users

```http
GET  /functions/v1/crm-api/users?role=admin
GET  /functions/v1/crm-api/users/{id}
PUT  /functions/v1/crm-api/users/{id}
POST /functions/v1/crm-api/users
GET  /functions/v1/crm-api/users/{id}/ai-usage
```

### Stripe

```http
POST /functions/v1/crm-api/stripe/subscriptions
POST /functions/v1/crm-api/stripe/subscriptions/create-checkout
POST /functions/v1/crm-api/stripe/credits
POST /functions/v1/crm-api/stripe/credits/purchase
GET  /functions/v1/crm-api/stripe/subscriptions
GET  /functions/v1/crm-api/stripe/credits
```

## Schemas

Request/response schemas mirror the handler implementations in:

- `supabase/functions/crm-api/handlers/companies-api-handler.ts`
- `supabase/functions/crm-api/handlers/contacts-api-handler.ts`
- `supabase/functions/crm-api/handlers/users-api-handler.ts`
- `supabase/functions/crm-api/handlers/stripe-api-handler.ts`

## Errors

| Code | Meaning |
|---|---|
| 400 | Invalid resource segment, malformed body |
| 401 | Unauthorized |
| 403 | Forbidden (role mismatch) |
| 404 | Resource not found |
| 500 | Server error |

```json
{ "error": "human-readable message" }
```
