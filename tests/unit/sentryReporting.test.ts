import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const main = readFileSync(join(process.cwd(), 'src/main.tsx'), 'utf8');
const init = main.slice(main.indexOf('Sentry.init({'), main.indexOf('ignoreErrors'));

describe('Sentry reports from real builds only', () => {
  it('is disabled on the dev server', () => {
    expect(
      init,
      'Sentry.init needs `enabled: !import.meta.env.DEV`. Nobody develops against this DSN, so a '
      + 'dev event is an agent or a script driving localhost — and it files REAL issues beside '
      + 'production. One headless run filed six of the thirteen unresolved issues, which is how a '
      + 'triage list stops being worth reading.',
    ).toMatch(/enabled:\s*!import\.meta\.env\.DEV/);
  });

  it('still reports from a built preview', () => {
    expect(
      init,
      'The gate is DEV (the dev server), not MODE !== production. A built preview or staging '
      + 'bundle is a real build and its errors are real.',
    ).not.toMatch(/enabled:[^,]*MODE/);
  });
});
