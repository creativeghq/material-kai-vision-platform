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
  it('writes only an absence, never a positive result', () => {
    const audit = src.slice(src.indexOf('for (const [prov, keys] of Object.entries(PROVIDER_KEYS)'));
    const block = audit.slice(0, audit.indexOf('\n    }\n') + 6);

    // The two things the audit may say, and they are both absences: no credential deployed, or
    // no probe written for this provider. Neither claims anything about the provider itself.
    expect(block).toContain("'not_configured'");
    expect(block).toContain("'no_probe_implemented'");
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

  it('a keyed provider nobody probes SAYS SO rather than staying silent', () => {
    // This used to `continue` whenever the keys resolved, on the reasoning that writing anything
    // would invent a result. But saying nothing left last_probe_at NULL forever, which downstream
    // reads as "never probed" — openai and worldlabs sat there for months and the integrity probe
    // answered them with "enable the model-health-check agent", which had run 737 times.
    // Recording the ABSENCE of a probe is not inventing a verdict; it is the only honest sentence.
    const audit = src.slice(src.indexOf('for (const [prov, keys] of Object.entries(PROVIDER_KEYS)'));
    const head = audit.slice(0, 1200);
    expect(head, 'only a provider we actually probe may be skipped silently')
      .toMatch(/continue;/);
    expect(head, 'the skip must be gated on the provider being probeable, not merely keyed')
      .toContain('PROBEABLE_PROVIDERS.includes(prov)');
    expect(head, 'a keyed, unprobeable provider must be stamped no_probe_implemented')
      .toContain("'no_probe_implemented'");
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
