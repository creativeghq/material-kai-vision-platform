import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { affectedFunctions, bundleOf, listFunctions } from '../../scripts/affected-edge-functions.mjs';
import { selectSuites } from '../../scripts/select-integration-suites.mjs';

const SHARED = 'supabase/functions/_shared/ai-client.ts';

describe('edge functions deploy by import graph, not "all on any _shared change"', () => {
  it('selects functions that import a shared module only transitively', () => {
    const { functions } = affectedFunctions([SHARED]) as { functions: string[] };
    expect(functions.length).toBeGreaterThan(0);
    for (const fn of functions) expect((bundleOf(fn) as Set<string>).has(SHARED)).toBe(true);
    const transitive = functions.filter(
      (fn) => !readFileSync(`supabase/functions/${fn}/index.ts`, 'utf8').includes('_shared/ai-client.ts'),
    );
    expect(transitive.length, 'no function reached ai-client.ts through another module').toBeGreaterThan(0);
  });

  it('leaves out functions that do not bundle the changed file', () => {
    const all = listFunctions() as string[];
    const { functions } = affectedFunctions([SHARED]) as { functions: string[] };
    const untouched = all.filter((fn) => !functions.includes(fn));
    for (const fn of untouched) expect((bundleOf(fn) as Set<string>).has(SHARED)).toBe(false);
  });

  it('deploys a function whose own files changed, and everything on a root deno.json change', () => {
    expect(affectedFunctions(['supabase/functions/flow-engine/index.ts']).functions).toContain('flow-engine');
    expect(affectedFunctions(['supabase/functions/deno.json']).functions).toEqual(listFunctions());
    expect(affectedFunctions(['src/App.tsx']).functions).toEqual([]);
  });

  it('falls back to ALL in the workflow when the walk fails', () => {
    const wf = readFileSync('.github/workflows/deploy.yml', 'utf8').replace(/\r\n/g, '\n');
    expect(wf).toMatch(/if ! FUNCS=\$\(printf '%s\\n' "\$DIFF" \| node scripts\/affected-edge-functions\.mjs\); then\n\s+echo "[^"]*deploying ALL functions"\n\s+FUNCS="\$ALL"/);
  });
});

describe('integration suites run only when what they exercise moved', () => {
  it('ties a suite to the edge function it calls', () => {
    const { byTests, byFunctions } = selectSuites([], ['crm-api']);
    expect(byTests).toEqual([]);
    expect(byFunctions).toContain('tests/integration/crm-company-contacts.test.ts');
    expect(byFunctions).not.toContain('tests/integration/money-paths.test.ts');
  });

  it('runs a changed suite, and all of them when shared harness or capabilities change', () => {
    expect(selectSuites(['tests/integration/money-paths.test.ts'], []).byTests).toEqual(['tests/integration/money-paths.test.ts']);
    expect(selectSuites(['tests/integration/_harness.ts'], []).byTests).toEqual(['tests/integration']);
    expect(selectSuites(['vitest.config.ts'], []).byTests).toEqual(['tests/integration']);
    expect(selectSuites([], [], true).byTests).toEqual(['tests/integration']);
  });

  it('keeps a nightly run of every suite, since SQL-only suites have no push trigger', () => {
    const nightly = readFileSync('.github/workflows/integration-nightly.yml', 'utf8');
    expect(nightly).toMatch(/schedule:/);
    expect(nightly).toContain('npm run test:integration');
  });
});
