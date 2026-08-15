/**
 * Zernio secret-resolution guard.
 *
 * The Zernio key powers BOTH surfaces that talk to it — WhatsApp messaging and social
 * publishing — and for its whole life it was read as `Deno.env.get('ZERNIO_API_KEY')`, in
 * FOUR hand-rolled copies (_shared/zernio.ts, zernio-webhook-handler, and the two
 * social-media sync agents).
 *
 * That can never see an admin-saved value. `platform_secrets` reaches `Deno.env` only via
 * _shared/secrets-bootstrap.ts, which is a documented no-op on the Supabase edge runtime —
 * `Deno.env.set` throws "The operation is not supported" there. So the entire surface was a
 * silent dead end: messaging-api answered 503 telling the admin to paste the key at
 * /admin/modules/messaging/settings → Keys, the admin pasted it, the row saved, and nothing
 * ever read it back (Sentry KAI-RD / KAI-RC, 2026-08-15). The webhook handler was worse — it
 * failed its signature check CLOSED, so every inbound WhatsApp reply was rejected 401.
 *
 * The fix is one resolver (`ensureZernioSecrets` → `resolveSecret`, env-first / DB-second) and
 * no second copy. This test makes a fifth copy a red build rather than a convention.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const FUNCTIONS_DIR = join(__dirname, '..', '..', 'supabase', 'functions');

/** The one file allowed to name these env vars — it IS the resolver. */
const CANONICAL = join('_shared', 'zernio.ts');

const SECRET_KEYS = [
  'ZERNIO_API_KEY',
  'LATE_API_KEY',
  'ZERNIO_WEBHOOK_SECRET',
  'LATE_WEBHOOK_SECRET',
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** Strip comments so prose and error copy never trip the scan. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

// Read the tree ONCE — 172 edge functions, and re-reading per assertion made this the
// slowest test in the suite.
const SOURCES = walk(FUNCTIONS_DIR).map((file) => ({
  rel: relative(FUNCTIONS_DIR, file).split(sep).join('/'),
  isCanonical: relative(FUNCTIONS_DIR, file) === CANONICAL,
  code: code(readFileSync(file, 'utf-8')),
}));

describe('Zernio secrets resolve through _shared/zernio.ts, not Deno.env', () => {
  it('no function outside the canonical resolver reads a Zernio env var', () => {
    const offenders: string[] = [];

    for (const { rel, isCanonical, code: src } of SOURCES) {
      if (isCanonical) continue;
      for (const key of SECRET_KEYS) {
        // Only an actual env read is a violation — naming the key in an error string is fine
        // and is how the 503 tells an admin what to set.
        const re = new RegExp(`Deno\\.env\\.get\\(\\s*['"\`]${key}['"\`]`);
        if (re.test(src)) offenders.push(`${rel} reads ${key} from Deno.env`);
      }
    }

    expect(
      offenders,
      'Import { zernioKey, zernioWebhookSecret } from _shared/zernio.ts instead — a local ' +
        'Deno.env read cannot see a platform_secrets value on the edge runtime.',
    ).toEqual([]);
  });

  it('the canonical resolver goes through resolveSecret and keeps env first', () => {
    const src = readFileSync(join(FUNCTIONS_DIR, CANONICAL), 'utf-8');

    expect(src).toMatch(/import \{ resolveSecret \} from '\.\/secrets\.ts'/);
    expect(src).toContain('export async function ensureZernioSecrets');

    // resolveSecret itself is env-first; every key must go through it.
    for (const key of SECRET_KEYS) {
      expect(src, `${key} must be resolved via resolveSecret`).toContain(`resolveSecret(supabase, '${key}')`);
    }
  });

  it('every entry point that reads the key awaits ensureZernioSecrets first', () => {
    // A file that calls zernioKey()/zernioApi()/zernioWebhookSecret() but never awaits the
    // resolver silently falls back to env-only — the exact bug, reintroduced one file at a time.
    const consumers = SOURCES.filter(
      (f) => !f.isCanonical && /\b(zernioApi|zernioKey|zernioWebhookSecret)\s*\(/.test(f.code),
    );

    expect(consumers.length, 'expected the Zernio consumers to still exist').toBeGreaterThan(0);

    const missing = consumers
      .filter((f) => !/await ensureZernioSecrets\(/.test(f.code))
      .map((f) => f.rel);

    expect(
      missing,
      'Add `await ensureZernioSecrets(supabase)` at handler entry, before the first Zernio read.',
    ).toEqual([]);
  });
});

describe('WhatsApp connects the same way social does', () => {
  const messagingApi = readFileSync(join(FUNCTIONS_DIR, 'messaging-api', 'index.ts'), 'utf-8');

  it('offers the Meta Embedded Signup redirect, not only headless credentials', () => {
    // Zernio documents POST /connect/whatsapp/credentials as the server-to-server path for
    // callers that ALREADY hold a Meta token. Making it the only path forces a human to dig a
    // permanent token out of Business Suite for something OAuth does in two clicks.
    expect(messagingApi).toContain("case 'connect-whatsapp-oauth'");
    expect(messagingApi).toContain("case 'connect-whatsapp-callback'");
    expect(messagingApi).toMatch(/\/connect\/whatsapp\?\$\{qs\.toString\(\)\}/);
  });

  it('same-origin-checks the OAuth redirect before handing it to Zernio', () => {
    // An unchecked redirect_url is an open-redirect/phishing vector; the social handler has
    // carried this check since #250 and the WhatsApp twin must not ship without it.
    const block = messagingApi.slice(messagingApi.indexOf("case 'connect-whatsapp-oauth'"));
    expect(block).toContain('must be same-origin as the app');
    expect(block).toMatch(/new URL\(redirectUrl\)\.origin === new URL\(publicAppUrl\(\)\)\.origin/);
  });

  it('gates both new actions as operator-only, like every other connect action', () => {
    const ops = messagingApi.slice(
      messagingApi.indexOf('const OPERATOR_ACTIONS'),
      messagingApi.indexOf('const OPERATOR_ACTIONS') + 400,
    );
    expect(ops).toContain("'connect-whatsapp-oauth'");
    expect(ops).toContain("'connect-whatsapp-callback'");
  });
});

describe('we only call Zernio endpoints that exist', () => {
  // Checked against the published OpenAPI spec (https://docs.zernio.com/api/openapi, v1.0.4,
  // 566 operations). Our ZERNIO_BASE_URL ends in /v1, so a call to `/accounts` is the spec's
  // `/v1/accounts`.
  it('never reads a single account by id — that path has no GET', () => {
    // `/v1/accounts/{accountId}` exposes PUT, PATCH and DELETE only. Both OAuth callbacks
    // called GET on it, so the LAST step of every connect — social and WhatsApp — would have
    // 404'd. Nothing caught it because ZERNIO_API_KEY has never had a value, so every request
    // failed earlier at the 503. Use fetchZernioAccount(), which reads the list endpoint.
    const offenders = SOURCES.filter((f) =>
      /zernioApi\(\s*['"]GET['"]\s*,\s*[`'"]\/accounts\/\$\{/.test(f.code),
    ).map((f) => f.rel);

    expect(
      offenders,
      'Use fetchZernioAccount(accountId, { profileId, platform }) — GET /v1/accounts/{id} does not exist.',
    ).toEqual([]);
  });

  it('sends an idempotency key when creating a post', () => {
    // POST /v1/posts dedups on x-request-id for 5 minutes. Without it a retried invocation
    // double-posts to the customer's real social account — the one Zernio failure mode that
    // is publicly visible and cannot be taken back.
    const publish = SOURCES.find((f) => f.rel === 'zernio-api/handlers/publish.ts');
    expect(publish, 'publish handler moved').toBeTruthy();
    expect(publish!.code).toMatch(/['"]x-request-id['"]/);
  });

  it('backs off on 429 rather than surfacing it as an opaque failure', () => {
    const client = SOURCES.find((f) => f.rel === '_shared/zernio.ts')
      ?? { code: readFileSync(join(FUNCTIONS_DIR, CANONICAL), 'utf-8') };
    expect(client.code).toContain('429');
    expect(client.code).toMatch(/Retry-After/i);
  });
});

describe('inbound delivery is actually wired end to end', () => {
  const client = SOURCES.find((f) => f.rel === '_shared/zernio.ts')!;
  const handler = SOURCES.find((f) => f.rel === 'zernio-webhook-handler/index.ts')!;

  it('registers the webhook — nothing used to, so the handler was unreachable', () => {
    // zernio-webhook-handler verified signatures and wrote the whole WhatsApp inbox, and
    // Zernio had never been told the URL. That is not detectable locally: "no inbound
    // messages" and "nobody was ever asked to send any" produce identical evidence.
    expect(client.code).toContain('export async function ensureZernioWebhook');
    expect(client.code).toMatch(/zernioApi\(\s*'POST'\s*,\s*'\/webhooks\/settings'/);
    const api = SOURCES.find((f) => f.rel === 'messaging-api/index.ts')!;
    expect(api.code).toContain("case 'register-webhook'");
    expect(api.code).toContain("case 'webhook-status'");
  });

  it('subscribes to every event the handler branches on', () => {
    // An event we branch on but never subscribe to is dead code that reads as live: the
    // branch is right there, reviewed and typechecked, and Zernio simply never sends it.
    const subscribed = new Set(
      (client.code.match(/ZERNIO_WEBHOOK_EVENTS = \[([\s\S]*?)\] as const/)?.[1] ?? '')
        .match(/'([a-z][a-z0-9_.]+)'/g)?.map((q) => q.slice(1, -1)) ?? [],
    );
    expect(subscribed.size, 'event list not found').toBeGreaterThan(10);

    // Exact-match branches, plus the prefix branches (whatsapp.number.*) the handler uses.
    // Every Zernio event name is dotted (post.published, whatsapp.number.declined), which is
    // also what keeps `typeof event === 'string'` out of this set.
    const branched = new Set(
      (handler.code.match(/(?<!typeof )event === '([a-z][a-z0-9_]*\.[a-z0-9_.]+)'/g) ?? [])
        .map((m) => m.replace(/^event === '/, '').replace(/'$/, '')),
    );
    const prefixes = (handler.code.match(/event\.startsWith\('([a-z][a-z0-9_]*\.[a-z0-9_.]*)'\)/g) ?? [])
      .map((m) => m.replace(/^event\.startsWith\('/, '').replace(/'\)$/, ''));

    const unsubscribed = [...branched].filter((e) => !subscribed.has(e));
    expect(unsubscribed, 'handled but never delivered — add to ZERNIO_WEBHOOK_EVENTS').toEqual([]);

    for (const prefix of prefixes) {
      expect(
        [...subscribed].some((e) => e.startsWith(prefix)),
        `handler branches on ${prefix}* but nothing under it is subscribed`,
      ).toBe(true);
    }
  });

  it('deactivates the channel when Meta or Zernio says the number cannot send', () => {
    // A number Meta declined/suspended, or an account whose token was invalidated, still
    // LISTS as an account. Left active, every send fails at Meta with a green channel card.
    expect(handler.code).toContain("event.startsWith('whatsapp.number.')");
    expect(handler.code).toMatch(/account\.disconnected[\s\S]{0,900}messaging_channels/);
    const api = SOURCES.find((f) => f.rel === 'messaging-api/index.ts')!;
    expect(api.code).toContain('needsReconnection');
  });

  it('only uses Direct Send where Meta allows it', () => {
    // category:'utility' starts a conversation with no approved template, but marketing
    // content is rejected under it, and sending it alongside templateName is a 400.
    const api = SOURCES.find((f) => f.rel === 'messaging-api/index.ts')!;
    expect(api.code).toContain('function directSendCategory');
    expect(api.code).toMatch(/whatsapp_template_name\)\s*return undefined/);
    expect(api.code).toMatch(/messageType === 'marketing'\)\s*return undefined/);
    expect(client.code).toMatch(/else if \(params\.category\)/);
  });
});

describe('service stability', () => {
  const client = SOURCES.find((f) => f.rel === '_shared/zernio.ts')!;
  const api = SOURCES.find((f) => f.rel === 'messaging-api/index.ts')!;
  const handler = SOURCES.find((f) => f.rel === 'zernio-webhook-handler/index.ts')!;

  it('expires the resolved-key cache, so a pasted key takes effect', () => {
    // An edge worker stays warm for minutes. Caching the resolution for ever means the exact
    // state an admin is fixing — key absent — sticks for the worker's life: they paste it, the
    // row saves, and the warm worker keeps answering 503 from a cached ''. Same
    // "saved and never read" shape as the original bug, with a shorter fuse.
    expect(client.code).toContain('ABSENT_TTL_MS');
    expect(client.code).toContain('RESOLVED_TTL_MS');
    expect(client.code).toMatch(/Date\.now\(\) - resolvedAt < ttl/);
  });

  it('never lets one analytics endpoint blank the whole panel', () => {
    // Analytics is a stricter rate-limit bucket (~6 req/s), so a 429 on one of a pair is
    // routine. Promise.all would turn that into an empty dashboard, which reads as "no
    // activity" rather than "we could not ask".
    expect(api.code).toContain('Promise.allSettled');
    const tab = readFileSync(
      join(__dirname, '..', '..', 'src', 'modules', 'messaging', 'components', 'MessagingAnalyticsTab.tsx'),
      'utf-8',
    );
    // A partial failure must be stated, not silently rendered as a zero.
    expect(tab).toMatch(/inbox\.errors\?\.length/);
  });

  it('retries only the events whose loss is unrecoverable', () => {
    // Zernio does not resend after a 200, so anything carrying customer CONTENT must 5xx on a
    // transient fault. Status/lifecycle syncs must NOT — they reconverge on the next event or
    // sync, and retrying them just loops.
    const block = handler.code.slice(handler.code.indexOf('catch (err)'));
    expect(block).toMatch(/message\.received/);
    expect(block).toMatch(/message\.edited/);
    expect(block).toMatch(/message\.deleted/);
    expect(block).not.toMatch(/'message\.delivered'/);
  });

  it('never walks an outbound status backwards', () => {
    // Webhook ordering is not guaranteed. A late message.sent overwriting a delivered/read row
    // would silently regress the status, and a regressed status is a valid status.
    const sent = handler.code.slice(handler.code.indexOf('async function handleMessageSent'));
    expect(sent.slice(0, 1400)).toMatch(/\.eq\('status', 'queued'\)/);
  });

  it('scopes the health read to channels the caller owns', () => {
    // Zernio's key is platform-wide: returning its whole health list verbatim would hand one
    // tenant every other tenant's numbers (invariant 1).
    const block = api.code.slice(api.code.indexOf("case 'channel-health'"));
    expect(block.slice(0, 2000)).toMatch(/readScopeWorkspaceIds|in\('workspace_id'/);
  });
});
