# Inbound Email Worker

Cloudflare Email Routing → Supabase Storage → `email-webhooks`. Issue **#342 §1** (design carried
over from the closed #229).

**Outbound is unaffected.** Every message still leaves through Resend and `email-api`, including the
per-workspace BYOK sender. The two directions share a domain and never share a provider: receiving
is an MX record, sending authentication is TXT, and they are independent.

## What this Worker is allowed to know

Its recipient domain. That is the entire list.

It resolves no workspace, no user, no address row and no thread, and it holds no database
credential. A Cloudflare Worker lives outside this repo's enforcement — no semgrep ruleset, no
`check_security_invariants()`, no typecheck, no review path — so every tenancy decision belongs in
`email-webhooks`, where invariant 1 is actually enforced.
[`tests/security/inbound-email-isolation.test.ts`](../../tests/security/inbound-email-isolation.test.ts)
greps this source and fails the build if that ever stops being true.

Two consequences worth spelling out, because both look like exceptions and are not:

- **Unknown recipients are still `setReject()`ed at SMTP time.** The Worker does not decide that.
  It calls `inbound_begin` and relays a boolean. Knowing which addresses exist is a tenancy fact;
  relaying a yes/no is not.
- **The Worker never sees the service-role key.** `inbound_begin` returns a short-lived signed
  upload URL scoped to one object path, so a leaked shared secret buys "upload one email and ask
  whether an address exists", not database access.

## Flow

```
customer's mail ──► MX: mail.materialshub.gr ──► Email Routing ──► this Worker
                                                                      │ 1. domain + size check
                                                                      │ 2. inbound_begin  ──► email-webhooks
                                                                      │    ◄── { accept, upload_url }
                                                                      │ 3. PUT raw .eml ──► Storage (private)
                                                                      │ 4. inbound_stored ──► email-webhooks
                                                                      ▼
                                          parse · auth/loop/dupe gates · correlate · Inbox thread
```

The raw `.eml` is a **bronze** artifact: immutable, re-derivable, never mutated. It is also why a
20 MiB attachment never travels in an edge-function request body.

## Setup (Phase 0 — operator, ~30 min)

1. **DNS.** Add `mail.materialshub.gr` in Cloudflare, point its **MX** at Email Routing, and create
   a single **catch-all** rule bound to this Worker. The apex `materialshub.gr` MX is **not**
   touched.
2. **Sending.** Verify the *same* domain in Resend for sending — TXT records only (SPF/DKIM).
   Resend never asks you to change MX, which is why one domain can do both.
3. **Plan.** Workers **Free** is enough. Cloudflare warns that complex handlers can exceed the free
   tier's 10 ms ceiling, but that ceiling is **CPU** time, not wall-clock, and this handler awaits
   I/O and parses two headers — streaming a 20 MiB body costs almost no CPU. The free tier's other
   limit, 100,000 requests/day, is 100,000 inbound emails a day.
   If this ever *does* breach 10 ms, the fix is to find the parsing that crept into the Worker
   against the rule above and move it back to `email-webhooks` — not to upgrade the plan.
4. **Secrets.**
   ```bash
   wrangler secret put INBOUND_WEBHOOK_SECRET          # in this directory
   ```
   Set the **same value** as `INBOUND_WEBHOOK_SECRET` on the Supabase edge functions. The inbound
   branch fails closed (503) when it is unset on either side — no mail is accepted rather than mail
   being accepted unauthenticated.
5. **Deploy.** `wrangler deploy`
6. **Verify before trusting the spoofing gate.** Send one real message and confirm
   `Authentication-Results` is actually present in the stored `.eml`:
   ```sql
   select to_addr, outcome, spf, dkim, dmarc, storage_path
   from agent_email_inbound_log order by created_at desc limit 5;
   ```
   `spf`/`dkim`/`dmarc` all NULL means the header was absent and the anti-spoofing gate is inert.
   It is a ten-minute check and the whole story rests on it.

## Allocating an address

Addresses are rows in `user_email_addresses`, behind a single catch-all rule — Cloudflare never
learns how many users exist, and the count is unbounded. The local part must be **globally** unique
because every tenant shares one domain:

```
basilis.kanonidis@mail.materialshub.gr        Basilis Kanonidis
konstantinos.tsatsos@mail.materialshub.gr     Konstantinos Tsatsos
```

`firstname.lastname`, derived from `user_profiles.full_name` with accents folded and non-Latin
scripts transliterated.

**No suffixes of any kind.** When the derived handle is taken the allocator writes *nothing* and
returns `taken`, and the person chooses their own local part. Two identical full names on one
platform is rare enough to be worth one question, and `basilis.kanonidis2@` is an address its owner
has to spell out every time they say it, handed to whichever of the two signed up second.

A random suffix was rejected for the same reason — this is an address you print on a business card.
What protects it is `setReject()` on unknown recipients, the DKIM gate and per-sender rate limits,
not obscurity.

A chosen local part is validated before it reaches the column: `+` is refused outright (it is the
thread delimiter, `basilis.kanonidis+t.<uuid>@…`, so a plus in the mailbox name would truncate every
reply onto a different base address), the shape mirrors the column CHECK, and RFC 2142 role names
(`postmaster`, `abuse`, `support`, `sales`, …) are reserved — every tenant shares this domain, so
none of them may hold an address that appears to speak for the platform.

## "Use my own address"

`orders@their-company.com` would mean pointing their **apex MX** at us, i.e. migrating their entire
company email. No SMB will do that. They create the address wherever their mail already lives and
**forward** it here.

Forwarding rewrites the envelope sender, so forwarded mail fails SPF every time. This is why the
gate in `email-webhooks` is **DKIM-based** — DKIM survives forwarding as long as the body is not
rewritten. A DMARC-fail rule alone would quarantine every legitimate forward.

## Limits

| Limit | Value | Binds us |
|---|---|---|
| Routing rules per domain | 200 | No — exactly one catch-all |
| Destination addresses per account | 200 | No — we process in a Worker, never forward to mailboxes |
| Domains per zone | 30 | No — one subdomain. Would bind if tenant domains were onboarded here, which is the second reason to prefer forwarding |
| Inbound message size | 25 MiB | Yes — capped at 20 MiB in `src/index.ts`, rejected at SMTP |
| Header size | 16 KB | No |
