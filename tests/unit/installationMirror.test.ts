import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import { INSTALLATION_MIRRORS, expectedMirror } from '../../scripts/gen-installation-mirror.mjs';

describe('installation engine mirrors are generated, not hand-kept', () => {
  it('has mirrors configured', () => {
    expect(INSTALLATION_MIRRORS.length).toBeGreaterThan(0);
  });

  it.each(INSTALLATION_MIRRORS)('%s is mirrored to %s', (source, target, rewrites) => {
    expect(
      readFileSync(target, 'utf8'),
      `${target} is stale. Run \`npm run installation:mirror\` — never hand-edit the mirror.`,
    ).toBe(expectedMirror(source, rewrites));
  });

  it('each mirror imports only other mirrors, so no rewrite was missed', () => {
    for (const [, target] of INSTALLATION_MIRRORS) {
      const specifiers = [...readFileSync(target, 'utf8').matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
      for (const s of specifiers) expect(s, `${target} imports ${s}`).toMatch(/\.generated\.ts$/);
    }
  });

  it('the agent tool uses the mirror and keeps no copy of the maths', () => {
    const tools = readFileSync('supabase/functions/_shared/tools/calculator-tools.ts', 'utf8');
    expect(tools).toContain("from '../installation/tileFloorTemplate.generated.ts'");
    expect(tools).not.toMatch(/function\s+(adhesiveKgPerM2|groutKgPerM2|suggestedTrowelNotchMm)/);
  });
});
