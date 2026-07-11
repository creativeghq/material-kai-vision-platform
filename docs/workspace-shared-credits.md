# Workspace Shared Credits (pooled team wallet)

A shared credit pool an owner funds once and the whole team draws from, with optional per-member monthly caps. It sits alongside the personal credit wallet documented in [billing-credits-system.md](./billing-credits-system.md): every AI/generation operation routes through one debit RPC that spends the **workspace pool when it's funded**, and **falls back to the caller's personal balance** otherwise.

---

## 1. The model

- **Owner funds a pool.** A workspace owner/admin tops up one shared balance (`workspace_credits.balance`) via Stripe. That balance is the team's spend budget.
- **Members draw from it.** When a member runs an AI operation and the workspace pool is funded, the cost debits the pool — not the member's personal wallet. If the pool has no row/balance, the member spends their own credits exactly as before.
- **Optional per-member monthly caps.** The owner can set a `monthly_limit` per member (`workspace_member_credit_limits`). A capped member is blocked once their month-to-date net spend would exceed the cap, even if the pool still has funds. Blank cap = unlimited.
- **"Team members" = `workspace_members`.** The pool is shared among rows in `workspace_members` (workspace users/seats), **not** CRM contacts. Membership is checked (`status = 'active'`) on every debit.

---

## 2. Tables

### `workspace_credits` (PK `workspace_id`)
The pool. A row's existence is what "has a pool" means — no row → the team is on personal credits.

| Column | Notes |
|---|---|
| `workspace_id` | Owning workspace |
| `balance` | Current pooled credit balance (numeric) |
| `created_at` / `updated_at` | Audit |

### `workspace_credit_transactions`
Append-only pool ledger — one row per debit / refund / top-up.

| Column | Notes |
|---|---|
| `id` | UUID |
| `workspace_id` | Pool |
| `actor_user_id` | The member who spent (or received the refund); NULL for top-ups |
| `amount` | Signed delta — negative for debits, positive for refunds/top-ups |
| `balance_after` | Pool balance after this row |
| `transaction_type` | `debit` \| `refund` \| (top-up) |
| `operation_type` | e.g. `agent_chat`, generation op type |
| `description` | Human-readable line |
| `metadata` | jsonb (log id, model, tokens, …) |
| `created_at` | Timestamp |

### `workspace_member_credit_limits` (PK `workspace_id, user_id`)
Per-member monthly cap.

| Column | Notes |
|---|---|
| `workspace_id` / `user_id` | Member |
| `monthly_limit` | Credits/month; NULL = unlimited |
| `updated_by` / `updated_at` | Audit (who set the cap) |

**Net monthly spend** (used both for enforcement and display) = `sum(debits) − sum(refunds)` in the current calendar month, floored at 0. The enforcement RPC and the status/usage RPCs compute it identically so the cap and the UI never disagree.

---

## 3. The debit / refund router (pool → personal fallback)

Every caller uses **one pair of RPCs** — `debit_credits` / `refund_credits` — and passes an optional `p_workspace_id`. Both are `SECURITY DEFINER` and return the **same `TABLE(success, new_balance, transaction_id, error_message)` shape** whether they hit the pool or the personal wallet, so call sites don't branch on which wallet paid.

### `debit_credits(p_user_id, p_amount, p_operation_type, p_description, p_metadata, p_workspace_id)`

1. If `p_workspace_id` is set → try `debit_workspace_credits(...)`:
   - **success** → return `(true, pool_new_balance, …)`.
   - error `no_pool` (no `workspace_credits` row) or `not_a_member` → **fall through to the personal wallet** (`debit_user_credits`). These mean "this workspace isn't on shared credits for this user."
   - any other error (`insufficient_pool_balance`, `member_limit_exceeded`) → **hard stop**, returned as-is. The router deliberately does **not** drain the member's personal balance when the pool was the intended payer.
2. No `p_workspace_id` → debit the personal wallet directly.

`debit_workspace_credits(p_workspace_id, p_actor_user_id, p_amount, …)` does the pool work atomically: assert active `workspace_members` row, `SELECT … FOR UPDATE` the balance, reject `insufficient_pool_balance`, enforce the member's `monthly_limit` (net spend + amount > limit → `member_limit_exceeded`), then decrement `workspace_credits.balance` and insert a `debit` ledger row.

### `refund_credits(..., p_workspace_id)`
Mirrors the decision: if `p_workspace_id` has a `workspace_credits` row **and** the user is an active member, the refund goes back to the **pool** (`credit_workspace_credits(..., 'refund', …)`); otherwise it credits the personal wallet (`credit_user_credits`). A refund always returns to the wallet the debit came from.

### Preflight
`preflight_credits(p_user_id, p_amount, p_workspace_id)` mirrors the same pool-if-member-else-personal decision **and** the member cap, so an over-cap or over-balance member is rejected **before** the paid upstream call rather than after. The shared `checkCreditBalance` helper (see below) uses it.

---

## 4. How generation edge functions + agent-chat route through it

- **Generation edge functions** (`generate-interior-gemini`, `generate-virtual-staging`, `generate-region-edit`, `generate-social-*`, `generate-interior-video-v2`, `generate-vr-world`, `generate-pbr-maps`, …) accept an optional `workspace_id` in the request body and thread it into their `checkCredits` → `debit_credits` → `refund_credits` (on failure) calls as `p_workspace_id`. The **frontend passes the active workspace id** so these debit the pool when it's funded. Example: [`generate-interior-gemini/index.ts`](../supabase/functions/generate-interior-gemini/index.ts) (`deductCredits`/`refundCredits` pass `body.workspace_id`).
- **Shared external-service helper** [`_shared/credit-utils.ts`](../supabase/functions/_shared/credit-utils.ts) — `debitExternalServiceCredits(..., workspaceId?)` and `checkCreditBalance(..., workspaceId?)` (Zernio/WhatsApp, Firecrawl, FLUX/Kling/Wan/Runway, Apollo, Hunter, ZeroBounce, etc.) call `debit_credits` / `preflight_credits` with the workspace id, so per-unit external services pool too.
- **Agent chat** — [`agent-chat/index.ts`](../supabase/functions/agent-chat/index.ts) `logAgentUsage()` calls the `log_agent_usage` RPC, which prices the turn from `ai_model_pricing`, writes an `agent_usage_logs` row, and then debits via `debit_credits(..., p_workspace_id)` — pool-aware for free. (The flat per-turn fee for **partner `kai_*`** API keys, `debitAgentChatTurn`, intentionally passes `p_workspace_id: null` — partners pay from their own personal balance.)

Because all of these go through the same router, wiring the pool required no per-call-site branching — only passing the workspace id through.

---

## 5. Funding, caps & usage UI

### Owner surface — Finance → Settings → Team
[`WorkspaceCreditsCard`](../src/modules/finance/components/WorkspaceCreditsCard.tsx) (mounted in [`SettingsTab.tsx`](../src/modules/finance/tabs/SettingsTab.tsx) under the **Team** tab) shows:

- **Pool balance** + a **Fund pool** control. Presets (€25/50/100/250) or a custom amount → `StripeService.createCreditCheckoutSession(credits, amount, workspaceId)` → Stripe Checkout. Passing `workspaceId` is what credits the **pool** rather than a personal wallet on completion.
- **Per-member list** with each member's role, month-to-date spend, remaining allowance, and an inline input to set/clear their `monthly_limit`. Blank = ∞.

### Member surface — Profile → Credits
[`CreditUsageHistory`](../src/components/core/Profile/CreditUsageHistory.tsx) renders a **"You're spending from your workspace pool"** banner (pool balance + the member's own cap/used/left) when the active workspace has a funded pool, so members understand their spend isn't hitting their personal wallet. The personal balance card lives in [`CreditsTab`](../src/components/core/Profile/CreditsTab.tsx).

### Service client
[`workspaceCreditsService`](../src/services/workspaceCreditsService.ts):

| Method | RPC / query | Use |
|---|---|---|
| `getStatus(workspaceId)` | `get_workspace_member_credit_status` | Pool balance + the caller's own cap/spend/remaining |
| `getTransactions(workspaceId)` | `workspace_credit_transactions` select | Recent pool ledger |
| `getMemberUsage(workspaceId)` | members ⋈ limits ⋈ month txns (joined in JS) | Owner's per-member cap + spend table |
| `setMemberLimit(workspaceId, userId, limit)` | `set_workspace_member_credit_limit` | Owner sets/clears a cap |

---

## 6. Access control

- `get_workspace_member_credit_status` returns `{error:'forbidden'}` unless the caller `is_workspace_member`; a member may read only their **own** status unless they `is_workspace_admin`.
- `set_workspace_member_credit_limit` is owner/admin-gated.
- `workspace_credit_transactions` reads are RLS-scoped (admins see all rows; members see their own + top-ups).

---

## 7. Pending / cross-repo

Per project memory, the **MIVAA Python backend** debits (its own `credits_integration_service` / `credit_metering` paths in the separate `creativeghq/mivaa-pdf-extractor` repo) are the remaining piece to make pool-aware — a cross-repo follow-up. The Supabase side (router RPCs, edge functions, agent-chat, funding/caps/usage UI) is complete.

---

**Last updated:** 2026-07-11.
