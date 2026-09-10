/** "Never probed" and "we have no key for them" are different sentences, and only one is useful. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const src = stripComments(
  readFileSync(join(ROOT, 'supabase/functions/_shared/agents/model-health-check-agent.ts'), 'utf8'),
);

describe('the provider key audit cannot invent or destroy a verdict', () => {
  it('writes only not_configured, never a positive result', () => {
    const audit = src.slice(src.indexOf('for (const [prov, keys] of Object.entries(PROVIDER_KEYS)'));
    const block = audit.slice(0, audit.indexOf('\n    }\n') + 6);

    expect(block).toContain("last_probe_status: 'not_configured'");
    for (const forbidden of ["'ok'", "'credit_exhausted'", "'auth_failed'", "'not_found'"]) {
      expect(block, `the audit writes ${forbidden} — it never called the provider, so it cannot know that`)
        .not.toContain(`last_probe_status: ${forbidden}`);
    }
  });

  it('only overwrites an absent or identical verdict', () => {
    // Without this guard a missing env var would erase a real `ok` — and the roster would look
    // dead the first time a secret was rotated.
    expect(src).toMatch(/last_probe_status\.is\.null,last_probe_status\.eq\.not_configured/);
  });

  it('a provider with its key present is left honestly unprobed', () => {
    // `continue` on no-missing-keys. Writing anything here would be inventing a result.
    const audit = src.slice(src.indexOf('for (const [prov, keys] of Object.entries(PROVIDER_KEYS)'));
    expect(audit.slice(0, 900)).toMatch(/if \(missing\.length === 0\) continue;/);
  });

  it('a provider needing a key PAIR is unreachable unless both resolve', () => {
    // Kling signs a JWT from an access key and a secret. One of the two is not a credential.
    expect(src).toMatch(/klingai:\s*\['KLINGAI_ACCESS_KEY', 'KLINGAI_SECRET_KEY'\]/);
    const audit = src.slice(src.indexOf('const missing: string[] = [];'));
    expect(audit.slice(0, 400), 'every listed key must be checked, not just the first')
      .toMatch(/for \(const key of keys\)/);
  });

  it('resolves through the shared secret resolver, not raw env', () => {
    // `Deno.env.get` misses anything an admin set in platform_secrets, so a key that IS
    // configured would be reported missing — the exact inversion this audit exists to prevent.
    expect(src).toMatch(/resolveSecret\(supabase, key\)/);
  });
});
