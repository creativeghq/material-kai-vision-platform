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
import { stripComments as sharedStripComments, blankComments as sharedBlankComments } from '../helpers/stripComments';

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
    // `deno check` vendors an npm cache into supabase/functions/<fn>/node_modules (gitignored).
    // Recursing in scans tens of thousands of dependency files — including other packages' own
    // *.test.ts fixtures — and readFileSync races the cache, so the walk ENOENTs on a file that
    // existed a moment earlier. Nothing under here is ours.
    if (entry === 'node_modules' || entry === '.deno') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** Strip comments so prose and error copy never trip the scan. */
function code(src: string): string {
  return sharedStripComments(src);
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
    // Every entry point into the Zernio client, not just the three low-level ones. The
    // WRAPPERS matter more, not less: inbox-api relays every operator reply through
    // sendWhatsAppReply() and names zernioKey() nowhere, so checking only the low level
    // declared the one function that relays customer messages compliant while it ran on an
    // unresolved key.
    const ENTRY_POINTS = [
      'zernioApi', 'zernioKey', 'zernioWebhookSecret',
      'sendWhatsAppMessage', 'sendWhatsAppReply',
      'sendSocialCommentReply', 'sendSocialDirectMessage',
      'fetchZernioAccount', 'resolveWorkspaceProfile',
      'ensureZernioWebhook', 'getZernioWebhookStatus',
    ];
    const callsClient = new RegExp(`\\b(${ENTRY_POINTS.join('|')})\\s*\\(`);
    const consumers = SOURCES.filter((f) => !f.isCanonical && callsClient.test(f.code));
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
  // The BARE path is the one with no GET. Sub-resources under it are a different matter: the
  // spec exposes 20+ `GET /v1/accounts/{accountId}/<sub>` operations (health, bluesky-settings,
  // slack-settings, linkedin-organizations, linkedin-post-analytics, linkedin-aggregate-
  // analytics…), and they are real. An earlier version of this pattern stopped at
  // `/accounts/${` and so forbade the whole family, which would have blocked the only analytics
  // endpoint a LinkedIn personal profile has. Anchored on what follows the interpolation: a `/`
  // means sub-resource and is fine, anything else is the bare read.
  const BARE_ACCOUNT_GET = /zernioApi\(\s*['"]GET['"]\s*,\s*[`'"]\/accounts\/\$\{[^}]*\}(?!\/)/;

  it('the bare-account-read pattern still catches the shape it was written for', () => {
    // Guards the guard. Loosening the regex above must not quietly turn it into a no-op, and
    // the only way to know is to hand it the offending code and the permitted code directly.
    expect(BARE_ACCOUNT_GET.test('zernioApi(\'GET\', `/accounts/${accountId}`)')).toBe(true);
    expect(BARE_ACCOUNT_GET.test('zernioApi(\'GET\', `/accounts/${encodeURIComponent(id)}?x=1`)')).toBe(true);
    expect(BARE_ACCOUNT_GET.test('zernioApi(\'GET\', `/accounts/${id}/linkedin-aggregate-analytics`)')).toBe(false);
    expect(BARE_ACCOUNT_GET.test('zernioApi(\'GET\', `/accounts/${id}/health`)')).toBe(false);
  });

  it('never reads a single account by id — that path has no GET', () => {
    // `/v1/accounts/{accountId}` exposes PUT, PATCH and DELETE only. Both OAuth callbacks
    // called GET on it, so the LAST step of every connect — social and WhatsApp — would have
    // 404'd. Nothing caught it because ZERNIO_API_KEY has never had a value, so every request
    // failed earlier at the 503. Use fetchZernioAccount(), which reads the list endpoint.
    const offenders = SOURCES.filter((f) => BARE_ACCOUNT_GET.test(f.code)).map((f) => f.rel);

    expect(
      offenders,
      'Use fetchZernioAccount(accountId, { profileId, platform }) — GET /v1/accounts/{id} does not exist.',
    ).toEqual([]);
  });

  /**
   * Every operation in Zernio's published spec, as a committed fixture.
   *
   * Regenerate with:
   *   curl -s https://docs.zernio.com/llms-full.txt \
   *     | grep -oE '^## (GET|POST|PUT|PATCH|DELETE) /v1/[^ ]*' \
   *     | sed 's/^## //' | sort -u > tests/fixtures/zernio-operations.txt
   *
   * Committed rather than fetched at test time: a guard that needs the network is a guard that
   * goes yellow on a bad DNS day and gets skipped. (`docs.zernio.com/openapi.json` serves the
   * docs SPA's HTML, not a spec — do not try to parse it.)
   */
  const SPEC_OPS = new Set(
    readFileSync(join(__dirname, '..', 'fixtures', 'zernio-operations.txt'), 'utf-8')
      .split('\n').map(l => l.trim()).filter(Boolean)
      // Path params are positional, so their NAMES do not matter for this comparison.
      .map(l => l.replace(/\{[^}]*\}/g, '{}')),
  );

  /**
   * A called path matches a spec operation when they agree segment by segment, treating a spec
   * placeholder as a wildcard. Plain string equality is not enough in BOTH directions: we call
   * `/connect/whatsapp` against the spec's `/connect/{platform}` (a literal filling a
   * placeholder), and we call `/accounts/${id}/linkedin-organizations` where the placeholder is
   * ours. Comparing the two as strings reported the first as a missing endpoint, which is the
   * kind of false alarm that gets a guard deleted.
   */
  const matchesSpec = (method: string, path: string) => {
    const want = path.split('/');
    for (const op of SPEC_OPS) {
      const [m, p] = op.split(' ');
      if (m !== method) continue;
      const got = p.split('/');
      if (got.length !== want.length) continue;
      if (got.every((seg, i) => seg === '{}' || want[i] === '{}' || seg === want[i])) return true;
    }
    return false;
  };

  it('every Zernio path we call exists in the published spec', () => {
    // The defect this catches is silent: a wrong path 404s inside a try/catch, the handler
    // reports a clean zero, and nothing anywhere says the endpoint was never real. That is
    // exactly how `GET /v1/accounts/{id}` — a path with no GET at all — survived in two OAuth
    // callbacks until it was found by hand.
    const offenders: string[] = [];

    for (const file of SOURCES) {
      const calls = file.code.matchAll(/zernioApi\(\s*['"]([A-Z]+)['"]\s*,\s*([`'"])(.*?)\2/gs);
      for (const [, method, , rawPath] of calls) {
        // A path assembled from a variable cannot be resolved statically. Those are covered by
        // the literal-fragment sweep below instead.
        if (!rawPath.startsWith('/')) continue;
        const path = '/v1' + rawPath.split('?')[0].replace(/\$\{[^}]*\}/g, '{}');
        if (!matchesSpec(method, path)) offenders.push(`${method} ${path} (${file.rel})`);
      }
    }

    // Paths built into a variable first — `const path = cond ? '/analytics/x' : '/analytics/y'`.
    // Every /analytics/… or /accounts/… literal in a Zernio handler must be a real operation
    // under SOME method, which is weaker than the check above but catches a typo'd path.
    const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
    for (const file of SOURCES.filter(f => f.rel.includes('zernio-api'))) {
      for (const [, lit] of file.code.matchAll(/['"`](\/(?:analytics|accounts|posts)\/[a-z0-9\-/]*[a-z0-9\-])['"`?]/gi)) {
        const path = '/v1' + lit.replace(/\$\{[^}]*\}/g, '{}');
        if (!METHODS.some(m => matchesSpec(m, path))) offenders.push(`${path} (${file.rel}, literal)`);
      }
    }

    expect(offenders, 'Path is not in tests/fixtures/zernio-operations.txt').toEqual([]);
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

describe('social lands in the inbox, and public stays public', () => {
  const handler = SOURCES.find((f) => f.rel === 'zernio-webhook-handler/index.ts')!;
  const inboxApi = SOURCES.find((f) => f.rel === 'inbox-api/index.ts')!;
  const client = SOURCES.find((f) => f.rel === '_shared/zernio.ts')!;

  it('no longer discards every non-WhatsApp DM', () => {
    // handleInboundMessage opened with `if (msg.platform !== 'whatsapp') return`, so Instagram,
    // Facebook, X, Bluesky, Reddit and Telegram DMs were dropped — indistinguishably from
    // nobody having written to us.
    expect(handler.code).toContain('handleSocialDirectMessage');
    expect(handler.code).toContain('handleSocialComment');
    expect(handler.code).not.toMatch(/if \(msg\.platform && msg\.platform !== 'whatsapp'\) return;/);
  });

  it('routes a comment reply to the comment, not the post', () => {
    // Replying at top level posts a new comment on the post, which does NOT notify the person
    // who asked. Both calls succeed, so the difference is invisible at the API layer and shows
    // up only as a customer who was answered and never knew.
    expect(client.code).toContain('sendSocialCommentReply');
    // Anchor on the relay itself — `thread.channel === 'social'` also appears earlier, in the
    // agent-prompt gate, and slicing from there never reaches this code.
    const block = inboxApi.code.slice(inboxApi.code.indexOf('sendSocialCommentReply({'));
    expect(block.slice(0, 400)).toContain('commentId');
    const routing = inboxApi.code.slice(inboxApi.code.indexOf("if (kind === 'comments') {"));
    expect(routing.slice(0, 1500)).toMatch(/'metadata->>direction', 'incoming'/);
  });

  it('never auto-answers in public, and withholds account tools there', () => {
    // A comment reply goes out under our own post to the whole audience. An agent replying
    // unprompted is broadcasting on its own initiative, and a tool that returns a real balance
    // is one sentence from publishing it.
    // Anchored on the CODE, not on the comment beside it. This used to match
    // `allowAgent: false,\s*// never auto-answer in public` — which passed only because the
    // stripper of the day removed full-line comments and left trailing ones, so the assertion
    // was really checking that somebody had written a particular sentence. Rewording the
    // comment would have broken it; deleting `allowAgent: false` and keeping the comment
    // would not have. The rule is that the PUBLIC comment thread is created with the agent
    // off, so that is what is pinned: the flag, in the call that builds the comments thread.
    expect(handler.code).toMatch(/allowAgent: false,[\s\S]{0,400}?externalKey: `comments:/);
    expect(inboxApi.code).toContain('publicThread');
    expect(inboxApi.code).toMatch(/&& !publicThread\)/);
    expect(inboxApi.code).toMatch(/posted PUBLICLY as a comment/);
  });

  it('withholds an order confirmation from a public thread', () => {
    // An order confirmation names what someone bought and what they paid.
    const block = inboxApi.code.slice(inboxApi.code.indexOf('async function sendOrderConfirmation'));
    expect(block.slice(0, 3000)).toMatch(/social_kind === 'comments'/);
    expect(block.slice(0, 3000)).toMatch(/confirmation withheld/);
  });

  it('lets the agent recognise an author with no participant row', () => {
    // The loop guard proved "is a customer" by looking up a participant. Social counterparties
    // have none, so it rejected every social message and the agent could never answer one.
    const guard = inboxApi.code.slice(inboxApi.code.indexOf('async function maybeRunAgentReply'));
    expect(guard.slice(0, 3000)).toMatch(/direction'?\]? !== 'incoming'/);
  });
});

describe('history can be recovered, without a second door', () => {
  const api = SOURCES.find((f) => f.rel === 'messaging-api/index.ts')!;
  const client = SOURCES.find((f) => f.rel === '_shared/zernio.ts')!;

  it('can back-fill, because webhooks carry no history', () => {
    // Zernio does not resend after a 200 and the webhook was unregistered until now, so every
    // conversation before that point exists on the platform and nowhere here. No local signal
    // exists for it: an empty inbox and one that missed a month are the same picture.
    expect(api.code).toContain("case 'backfill-inbox'");
    expect(api.code).toMatch(/\/inbox\/conversations\?accountId=/);
  });

  /**
   * The backfill case, to its real end rather than a fixed character count.
   *
   * These assertions used to read the first 6000 characters after `case 'backfill-inbox'`. That
   * is a guard whose reach depends on how much COMMENT the code above happens to carry: adding
   * six lines of explanation pushed `truncated` past the window and failed a test about
   * truncation, which is a self-parody. Slice the real block instead — the assertion gets
   * stronger and stops depending on prose length.
   */
  const backfillCase = (): string => {
    const start = api.code.indexOf("case 'backfill-inbox'");
    const rest = api.code.slice(start + 1);
    const next = /\n {6}case '/.exec(rest);
    return next ? api.code.slice(start, start + 1 + next.index) : api.code.slice(start);
  };

  it('replays through the real signature check, not a service-role bypass', () => {
    // Invariant 6 is verify-before-process, fail closed. A second door added "only for replay"
    // is the one that ends up reachable.
    expect(client.code).toContain('export async function signZernioBody');
    const block = backfillCase();
    expect(block).toContain('X-Zernio-Signature');
    expect(block).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('scopes the pull to the caller workspace and never truncates silently', () => {
    // Zernio's key is platform-wide: an unfiltered pull imports other tenants' conversations.
    const block = backfillCase();
    expect(block).toMatch(/\.eq\('workspace_id', wsId\)/);
    expect(block).toContain('truncated');
  });
});

describe('Zernio events land in OUR flow engine, not a second one', () => {
  const handler = SOURCES.find((f) => f.rel === 'zernio-webhook-handler/index.ts')!;
  const inboxApi = SOURCES.find((f) => f.rel === 'inbox-api/index.ts')!;
  const client = SOURCES.find((f) => f.rel === '_shared/zernio.ts')!;

  it('emits a flow event for every operational Zernio state change', () => {
    // Adopting Zernio Workflows would have been a second automation engine that can only see
    // Zernio's world. These events feed the one that already knows what a deal is (109 flows,
    // 5,051 runs) — the inversion is the whole point.
    for (const evt of [
      'social_comment_received',
      'social_account_connected',
      'social_account_disconnected',
      'whatsapp_number_status_changed',
      'whatsapp_template_status_changed',
    ]) {
      expect(handler.code, `${evt} is never emitted`).toContain(`'${evt}'`);
    }
  });

  it('never notifies a workspace about another tenant"s template', () => {
    // messaging_templates is platform-global (no workspace_id). Picking "the first workspace
    // with a WhatsApp channel" would tell one tenant about another's template — a tenancy leak
    // wearing a notification. Resolve via the account, or notify nobody.
    const block = handler.code.slice(handler.code.indexOf('whatsapp.template.status_updated'));
    expect(block.slice(0, 3000)).toContain('tplAccountId');
    expect(block.slice(0, 3000)).toMatch(/no resolvable workspace, not notifying/);
  });

  it('reports the profile ceiling instead of collapsing tenants in silence', () => {
    // resolveWorkspaceProfile falls back to the SHARED default profile at the plan ceiling, so
    // every workspace past it lands together and the connect still returns success.
    expect(client.code).toContain('export async function getZernioPlan');
    expect(client.code).toContain('profileCeilingReached');
    expect(client.code).toMatch(/PROFILE CEILING/);
    const api = SOURCES.find((f) => f.rel === 'messaging-api/index.ts')!;
    expect(api.code).toContain("case 'plan-status'");
  });

  it('offers the private answer and the moderation escape from a public comment', () => {
    expect(client.code).toContain('export async function sendCommentPrivateReply');
    expect(client.code).toContain('export async function setCommentHidden');
    expect(inboxApi.code).toContain("case 'comment_private_reply'");
    expect(inboxApi.code).toContain("case 'set_comment_hidden'");
    // Both must refuse on a DM thread — the endpoints are comment-only.
    const priv = inboxApi.code.slice(inboxApi.code.indexOf("case 'comment_private_reply'"));
    expect(priv.slice(0, 2000)).toMatch(/social_kind !== 'comments'/);
  });

  it('records a private reply as a note, not as a public bubble', () => {
    // Rendering it as an ordinary reply would read as though it had been posted under the post,
    // which is the exact confusion the feature exists to remove.
    const priv = inboxApi.code.slice(inboxApi.code.indexOf("case 'comment_private_reply'"));
    expect(priv.slice(0, 3000)).toMatch(/message_type: 'note'/);
  });

  it('tells the platform when a conversation is read', () => {
    // Read state was local-only, so the customer's "seen" never moved and Zernio's unread
    // counts drifted permanently from ours.
    expect(client.code).toContain('export async function markConversationRead');
    const mr = inboxApi.code.slice(inboxApi.code.indexOf("case 'mark_read'"));
    expect(mr.slice(0, 1500)).toContain('markConversationRead');
  });
});
