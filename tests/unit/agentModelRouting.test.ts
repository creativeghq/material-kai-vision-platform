import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

/** Which model an agent turn runs on, and how that is decided. */

const ROOT = join(__dirname, '..', '..');
/**
 * Comments here quote the OLD rule and the measurements that killed it, so every assertion
 * runs against comment-free source — otherwise this test fails on its own explanation.
 */
const SRC = stripComments(
  readFileSync(join(ROOT, 'supabase/functions/agent-chat/index.ts'), 'utf8'),
);

/** Body of shouldRouteToHaiku — the routing decision, isolated from the rest of the file. */
function routerBody(): string {
  const start = SRC.indexOf('function shouldRouteToHaiku');
  expect(start, 'shouldRouteToHaiku no longer exists — routing moved, update this test').toBeGreaterThan(-1);
  const end = SRC.indexOf('\n}', start);
  return SRC.slice(start, end);
}

describe('agent model routing', () => {
  it('routes on the agent, never on the shape of the message', () => {
    const code = routerBody();

    for (const banned of ['.length >', 'text.length', "includes('@')", 'turnCount']) {
      expect(
        code.includes(banned),
        `routing branches on \`${banned}\` again. Message length and punctuation are not ` +
        'complexity — that rule sent half the real questions to the cheap model, and it ' +
        'answered with a form instead of an answer on half of those.',
      ).toBe(false);
    }
  });

  it('sends everything except the sandbox agent to the main model', () => {
    const code = routerBody();
    expect(code, 'the demo sandbox should still be the cheap path').toMatch(/agentId === 'demo'/);
    expect(
      code,
      'shouldRouteToHaiku must return false for every non-demo agent',
    ).toMatch(/return false;\s*$/);
  });

  it('the main model is a single constant, used for both the client and the logged name', () => {
    expect(SRC, 'MAIN_MODEL is gone — the model would be hardcoded in two places again')
      .toMatch(/const MAIN_MODEL = 'claude-[a-z0-9-]+';/);

    // getModelForAgent picks the client, getModelNameForAgent picks the string that gets
    // PRICED. They drifting apart means a turn is billed against a model it did not run on.
    expect(SRC).toMatch(/return shouldRouteToHaiku\(agentId\) \? modelHaiku : modelOpus;/);
    expect(SRC).toMatch(/return shouldRouteToHaiku\(agentId\) \? 'claude-haiku-4-5' : MAIN_MODEL;/);
    expect(SRC, 'modelOpus must be constructed from MAIN_MODEL, not a literal')
      .toMatch(/modelOpus = new ChatAnthropic\(\{\s*model: MAIN_MODEL,/);
  });

  it('the eval pin still covers the main model, or the A/B cannot be repeated', () => {
    const main = SRC.match(/const MAIN_MODEL = '([a-z0-9-]+)';/)?.[1];
    expect(main, 'could not read MAIN_MODEL').toBeTruthy();
    const allowed = SRC.slice(SRC.indexOf('MODEL_OVERRIDE_ALLOWED'), SRC.indexOf('const _modelByName'));
    expect(
      allowed.includes(`'${main}'`),
      `${main} is the model every turn runs on but is not in MODEL_OVERRIDE_ALLOWED, so the ` +
      'routing decision can no longer be re-measured against it.',
    ).toBe(true);
  });
});
