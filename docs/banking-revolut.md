# Revolut Business — bank feed, reconciliation & money-out

Tracker: **[#315](https://github.com/creativeghq/material-kai-vision-platform/issues/315)** (supersedes #218).
This is the reference for the `banking-revolut` module. The checkout provider that shares the
brand — `payments-revolut`, Revolut Merchant — is a **different product with different keys** and
is documented in [payments.md](payments.md).

## Which API, and why

| | |
|---|---|
| ❌ **Open Banking API** | TPP-facing. Production needs an AISP/PISP licence + eIDAS QWAC/QSeal certificates. Not available to us, and the cert tax (~€600–1500/yr per issuer, per-country NCA registration) is why SMB tools rent an aggregator instead. |
| ✅ **Business API** | First-party, for the account holder. JWT client-assertion OAuth, ~40-minute access tokens, long-lived refresh token, scopes `READ` / `WRITE` / `PAY`. |

Because it is first-party, the **PSD2 90-day consent re-authorisation does not apply**. If a
non-Revolut bank feed is ever added, that constraint comes back and the connection store needs a
`consent_expires_at` surfaced *before* the sync goes dark.

## Connection model — per-workspace BYOK

Each workspace connects its **own** Revolut Business account; a tenant never falls back to
operator credentials. Surfaced at **Profile → Keys → Banking** and in the module settings panel.

1. `revolut-api?action=init` mints an RSA-2048 keypair **server-side**. The private key lands in
   `workspace_revolut_config.private_key` and never reaches the browser.
2. The public side is a **self-signed X.509 certificate**, not a bare SPKI key — Revolut's
   dashboard rejects the latter. The operator pastes it into Revolut → Settings → API and gets a
   `client_id` back.
3. OAuth consent → the auth code is exchanged using a JWT client assertion (RS256, `iss` = the
   **domain** of the redirect URI, `aud` = the literal `https://revolut.com`).

**Scopes must be requested explicitly as `READ,WRITE,PAY`.** An unscoped consent grants
`READ_SENSITIVE_CARD_DATA`, whose mere presence IP-locks the entire token — that was the whole of
the "error 9002" saga, and it is not an IP-whitelist problem.

Credentials are stored as plain columns on a service-role-only row (no browser SELECT; status
comes from the self-guarding `get_workspace_revolut_config_status`). That matches how
`workspace_viva_config` holds its client secret. The private key is the strongest credential in
the set — it signs the client assertion — and its certificate is minted with a 5-year lifetime
that nothing currently tracks or rotates.

## Data layering

| Layer | What |
|---|---|
| **Silver** | `revolut_bank_transactions` — raw statement lines, one row **per leg**, unique on `workspace_id + provider + "<txid>:<legid>"`. Never written by the matcher's money logic. |
| **Gold** | `payments` + `payment_allocations`, reached only through `recordInvoicePayment` / the allocation write. Paid-ness is *derived* from there; nothing here writes a status or a balance by hand. |

## The feed is per-leg — the two filters that matter

A Revolut transaction explodes into N rows. Matching a row in isolation matches a *fragment*, and
the feed carries every kind of money movement, not just customer payments. So before the ladder
runs:

- **`type = 'transfer'` only.** A `topup`, `exchange` credit, `refund`, `card_refund` or `fee` leg
  is not somebody paying an invoice. Without this filter every one of them queued up for review
  and raised its own "unmatched bank payment" alert.
- **Transactions with legs on both sides are internal.** A pocket→pocket move produces an `in` leg
  indistinguishable from an incoming customer payment unless you look at its siblings
  (`loadLegShapes`). Those are stamped `ignored` so they leave the review surface instead of being
  re-suggested forever.
- **More than one `in` leg ⇒ never auto-settled.** Ambiguous which leg is the payment; a human can
  still match it by hand.

## Matching ladder

**Incoming** (`reconcileWorkspaceRevolut`), most→least certain:

1. `reference` contains exactly one open invoice's `internal_number` → auto-match.
2. Exactly one open invoice with cent-equal `amount_due` **and** a counterparty-name match
   (transliterated, so a Greek statement matches a Latin CRM name) → auto-match.
3. Weaker signals → `suggested`, with candidate invoice ids, waiting in the review queue.
4. Nothing → `unmatched` + one `bank_payment_unmatched` flow event, ever.

**Outgoing** (`reconcileOutgoingRevolut`) is auto-only and conservative: reference quotes exactly
one open bill and the amount fits, or a unique cent-equal `amount_due` plus a supplier-name match.
Anything left over lands in the same review queue, so money that left the account by hand in the
Revolut app cannot sit unnoticed. It escalates to the one-per-line alert only when the workspace
has open supplier bills — with no payables to match against, "outgoing money with no bill behind
it" describes rent, payroll and tax too, and an alert each would train people to ignore it.

Settlement is **always** `recordInvoicePayment` (incoming) or a `payment_allocations` row against
`supplier_bill_id` (outgoing). Never a local `total − paid`: that would be another copy of the
derivation CLAUDE.md's anti-regression rule #1 exists to prevent.

## Sync, and the two silent-zero traps

`revolut-sync` runs every 6h (pg_cron) and is also the "Sync now" path — one implementation.

- **The watermark is a creation-time filter.** `/transactions?from=` returns transactions by when
  they were *created*, so a line that was pending at the last pull and completed afterwards is
  never listed again. The `TransactionStateChanged` webhook normally catches it; when that
  delivery fails, the row would sit `pending` forever and reconciliation — which requires
  `completed` — would never see the money, with the feed looking perfectly healthy the whole time.
  `recoverStaleTransactions` re-reads non-terminal lines **by id** to close that.
- **The page walk is capped** at 20 × 500. Hitting the cap with a full page means older lines were
  left behind; it logs and returns `truncated` rather than reading as a complete sweep.

Failure is always explicit: `last_sync_error` on the config row, never an empty return.

## Monitoring

- `ops.revolut_feed_stalled` — quiet 24h / persistent error / connected-but-empty for 7d.
- Failed webhook deliveries are pulled from `/webhooks/{id}/failed-events` on every sync; the sync
  itself *is* the heal (it re-pulls what the webhook missed), the count exists so chronic failure
  can be alerted on.
- Notifications go to owner → admin → accountant → any active member (`financeNotifyRecipient`).
  Addressing them to the `owner` role alone meant an admin-run workspace got no alert **and** no
  trace, because the flow-send probe watches sends, not non-sends.

## Money-out

`revolut_payouts` is the audit ledger, and the idempotent `request_id` is written **before** any
call. Payment **drafts** are the default — the ERP prepares, a human approves in the Revolut app.
Direct payments, payout links (refund without knowing an IBAN) and FX exist behind explicit
confirmation. Every IBAN entering the system is VoP/CoP-validated (`validate-account-name`), and a
`not_matched` verdict blocks counterparty creation unless forced.

## Cards & expenses

Virtual cards per Revolut team member with spend limits, freeze/unfreeze, and invitations.
Card→person attribution walks `card_id → holder → member email → HR roster → user` and lands the
spend, with its **receipt**, in that employee's monthly expense report. An unresolvable email is
recorded as `unmatched_person` — never invented. Offboarding freezes cards; unfreezing stays human.

## Guards

- [tests/unit/revolutReconcile.test.ts](../tests/unit/revolutReconcile.test.ts) — pins the type
  filter, leg grouping, the internal-transfer and multi-leg guards, the one-money-path rule, the
  stale re-read, and the deliberate buyer-facing provider order (`stripe`, `viva`, `revolut` —
  alphabetical sorting once silently demoted Stripe and flipped existing sellers' default).
- `ops.revolut_feed_stalled`, plus `ops.payment_intents_stale` on the checkout side.

## Sandbox validation — what has and hasn't been exercised

Verified live: connection + OAuth, sync (transactions fetched and upserted, watermark advancing),
webhook registration, pocket auto-provisioning with real IBANs auto-filled onto invoices.

**Not yet exercised against the API:** invoice → simulated transfer → auto-match; VoP →
counterparty → bill run → approval → outgoing settlement; Merchant checkout; card + expense with
receipt. The VoP request shape, the draft/payout-link/expense paths and the Merchant webhook
shapes are all **docs-derived** and may need first-contact corrections, exactly as the OAuth leg
did.
