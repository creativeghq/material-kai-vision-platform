/** "Never probed" and "we have no key for them" are different sentences, and only one is useful. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';
import { sourceIndex, posix } from '../helpers/sourceIndex';

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

describe('the audit asks for the SAME key name the callers read', () => {
  /**
   * A probe that asks for a key nobody sets reports a WORKING provider as unreachable, and
   * that is worse than no probe: it sends the reader to configure something already
   * configured. `google` asked for `GEMINI_API_KEY` while every Google caller — ai-client
   * (so Veo and Gemini Omni), generate-interior-gemini, company-enrich, kai-task-agent —
   * reads `GOOGLE_GENERATIVE_AI_API_KEY`, so every Google model read `not_configured`
   * while image generation was working.
   */
  const CALLER_KEY_BY_PROVIDER: Record<string, string> = {
    google: 'GOOGLE_GENERATIVE_AI_API_KEY',
    alibaba: 'DASHSCOPE_API_KEY',
    bytedance: 'ARK_API_KEY',
    luma: 'LUMA_API_KEY',
    fal: 'FAL_KEY',
    xai: 'XAI_API_KEY',
  };

  const aiClient = stripComments(
    readFileSync(join(ROOT, 'supabase/functions/_shared/ai-client.ts'), 'utf8'),
  );

  it('every audited key is one ai-client actually reads', () => {
    const map = src.slice(src.indexOf('const PROVIDER_KEYS'));
    const block = map.slice(0, map.indexOf('};') + 2);

    for (const [provider, expected] of Object.entries(CALLER_KEY_BY_PROVIDER)) {
      const row = block.split('\n').find((l) => l.trim().startsWith(`${provider}:`));
      expect(row, `PROVIDER_KEYS has no row for ${provider}`).toBeTruthy();
      expect(row, `the audit asks ${provider} for a key ai-client never reads`).toContain(expected);
      expect(aiClient, `ai-client does not read ${expected}, so the audit is asking for a name nobody sets`)
        .toContain(expected);
    }
  });

  it('no Google caller is left on the short key name', () => {
    // `GEMINI_API_KEY` is set nowhere in this deployment. A file reading it can only run
    // unauthenticated, and will say "no key" about a provider that has one.
    //
    // Through the shared sourceIndex, which caches its walk and skips vendored trees. A
    // hand-rolled walk of `supabase/functions` reads 27k files, not the ~200 that are ours.
    const PATTERN = /Deno\.env\.get\('GEMINI_API_KEY'\)|resolveSecret\([^)]*'GEMINI_API_KEY'/;
    const offenders = sourceIndex({ roots: ['supabase/functions'] })
      .stripped()
      .filter(([, body]) => PATTERN.test(body))
      .map(([file]) => posix(file));

    expect(offenders, 'these read GEMINI_API_KEY; the deployed name is GOOGLE_GENERATIVE_AI_API_KEY')
      .toEqual([]);
  });
});
