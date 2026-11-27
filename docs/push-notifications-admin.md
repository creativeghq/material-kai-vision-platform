# Phone (Web Push) Notifications

Phone notifications are one more delivery of the **same** in-app notification. There is no
separate push pipeline, no per-type preference matrix and no workspace-admin push tab: a user
opts a device in, and every bell a flow raises for them is also pushed to that device.

## How a push reaches a device

```
Profile → Phone Notifications → Turn On Notifications
   usePushSubscription(): notification-dispatcher {action:'get-vapid-key'}
   → pushManager.subscribe() → upsert push_subscriptions (user_id, endpoint, p256dh_key, auth_key, is_active)

flow-engine  create_notification action
   1. insert user_notifications (the bell)            ← always
   2. read the user's active push_subscriptions
   3. notification-dispatcher {action:'send-push', subscriptions, notification:{title, body, data:{url}}}
      ← best effort: a push failure is logged and never fails the bell
```

- **Every in-app notification flow pushes.** The mirror lives inside the `create_notification`
  handler, so every seeded default and every tenant flow that rings a bell also pushes to an
  opted-in user. `send_push` remains a separate engine action for flows that want push only.
- `data.url` is the notification's `action_url` only when it is a same-origin path (`/…`, not
  `//…`); anything else opens `/`. A body still holding an unresolved `{{…}}` template is sent empty.
- `public/sw.js` handles `push` (shows the notification) and `notificationclick` (focuses an open
  app window and navigates it to `data.url`, else opens a new one).
- Endpoints the push service reports as gone (HTTP 404/410) are set `is_active = false` by the
  dispatcher, so a dead device stops being tried.

## User opt-in (Profile)

**Profile → Phone Notifications** (`src/components/core/Profile/PushNotificationsCard.tsx`) is the
only opt-in. It is per **device/browser**, not per account. States it can show:

| State | Shown |
|---|---|
| off | **Turn On Notifications** (asks the browser for permission, then subscribes) |
| on | **Turn Off** (sets this endpoint `is_active = false`) |
| unsupported | "This browser cannot receive notifications." |
| needs-install | iPhone: add the app to the Home Screen first, then enable from there |
| denied | Permission blocked; re-enable in browser / phone settings |

## Operator broadcast

`/push-notifications` (`src/pages/Operator/PushNotificationsPage.tsx`, `AdminGuard`) — **Send a
Phone Notification**: Title (≤ 80 chars), Message (≤ 240), optional "Opens" path, audience
**Everyone subscribed** or **Selected Users**, a confirm dialog, and a **Recent Notifications** list.

| Dispatcher action | Who | Does |
|---|---|---|
| `get-vapid-key` | any signed-in user | returns the public VAPID key for subscribing |
| `send-push` | internal (flow-engine) | sends to the given subscriptions |
| `list-push-audience` | platform operator | users holding an active subscription (cap 5,000) |
| `broadcast-push` | platform operator | resolves recipients **server-side** from `push_subscriptions` (never from the body), sends, records a `push_broadcasts` row |

## Configuration

VAPID keys are resolved through `resolveSecret` (env first, then `platform_secrets`):
`VAPID_PUBLIC_KEY` (base64url of the 65-byte uncompressed P-256 point), `VAPID_PRIVATE_KEY`,
`VAPID_SUBJECT` (`mailto:` or URL). Without them the dispatcher logs a warning and skips the push;
the bell is unaffected. Encryption and signing are Deno-native (RFC 8291 payload encryption,
RFC 8292 VAPID) — no web-push library.

## Troubleshooting

- **Nothing arrives on iPhone** — Web Push on iOS works only for the app installed to the Home
  Screen (iOS 16.4+); the card says so.
- **A device stopped receiving** — check `push_subscriptions.is_active` for its endpoint; a 404/410
  from the push service deactivated it. Turning notifications on again re-subscribes.
- **Bell arrives, push does not** — look for `[flow-engine] push mirror failed` in the flow-engine
  logs, and confirm the VAPID secrets resolve.
