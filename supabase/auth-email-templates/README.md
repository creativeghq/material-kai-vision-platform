# Supabase Auth email templates

These are the transactional emails **GoTrue** sends — confirm signup, password reset, magic
link, email change, invite. They are *not* sent through `email-api`, so nothing in this repo
renders them and no flow can intercept them. Until 2026-09-18 every one of them was the stock
Supabase template: a bare `<h2>Confirm your signup</h2>` with a naked link, which is the first
thing a new customer ever sees from the platform.

## These files are the source; the dashboard is the deploy

There is no Management API token in this checkout, so applying a change is a manual paste:

**Supabase Dashboard → Authentication → Emails →** pick the template → paste the file body →
Save. The subject lines are set in the same screen and are listed below.

| File | Template | Subject |
|---|---|---|
| `confirm-signup.html` | Confirm signup | Confirm your Materials Hub account |
| `reset-password.html` | Reset password | Reset your Materials Hub password |
| `magic-link.html` | Magic link | Your Materials Hub sign-in link |
| `invite.html` | Invite user | You have been invited to Materials Hub |
| `change-email.html` | Change email address | Confirm your new email address |

Keep the files and the dashboard in step — a change made only in the dashboard is invisible to
everyone reading this repo, and a change made only here reaches nobody.

## Constraints these templates are written to

- **Inline styles only.** No `<style>` block, no external CSS — Gmail strips both.
- **Light ground, dark text.** An email has no theme switcher; the app's four themes do not
  apply here.
- **The button is a table cell, not a styled `<a>`.** Outlook ignores padding on inline
  elements, so a `<a style="padding:…">` renders as bare underlined text.
- **The URL is repeated as copyable text** under the button, because a button that does not
  render leaves the reader with no way through.
- `{{ .ConfirmationURL }}` is substituted by GoTrue and must not be escaped or wrapped.
