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
