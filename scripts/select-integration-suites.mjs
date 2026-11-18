#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';

const DIR = 'tests/integration';
const ALL = DIR;
const suites = readdirSync(DIR).filter((f) => f.endsWith('.test.ts')).map((f) => `${DIR}/${f}`).sort();

export function selectSuites(changed, deployed, capabilities = false) {
  const paths = changed.map((p) => p.trim()).filter(Boolean);
  const harness = paths.some(
    (p) => p === 'vitest.config.ts' || p.startsWith('tests/helpers/') || (p.startsWith(`${DIR}/`) && !p.endsWith('.test.ts')),
  );
  const byTests = capabilities || harness ? [ALL] : suites.filter((s) => paths.includes(s));

  const fns = deployed.filter(Boolean);
  const byFunctions = fns.length
    ? suites.filter((s) => {
        const src = readFileSync(s, 'utf8');
        return fns.some((fn) => new RegExp(`['"\`/]${fn.replace(/[-]/g, '\\-')}['"\`/?]`).test(src));
      })
    : [];
  return { byTests, byFunctions };
}

if (process.argv[1]?.endsWith('select-integration-suites.mjs')) {
  const changed = readFileSync(0, 'utf8').split('\n');
  const deployed = (process.argv[2] ?? '').split(/\s+/);
  const { byTests, byFunctions } = selectSuites(changed, deployed, process.env.CAPABILITIES === 'true');
  process.stdout.write(`${byTests.join(' ')}\n${byFunctions.join(' ')}\n`);
}
