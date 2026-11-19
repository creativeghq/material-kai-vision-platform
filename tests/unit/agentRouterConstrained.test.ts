import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { blankComments } from '../helpers/stripComments';

const src = blankComments(readFileSync(join(process.cwd(), 'supabase/functions/agent-chat/index.ts'), 'utf8'));
const start = src.indexOf('async function routeToSpecialist(');
const body = src.slice(start, src.indexOf('\ninterface AgentConfig', start));

describe('#463 — routeToSpecialist is constrained by the server and logged (invariant 9)', () => {
  it('exists where this test looks', () => {
    expect(start).toBeGreaterThan(-1);
    expect(body.length).toBeGreaterThan(200);
  });

  it('asks for a schema-valid answer through the shared client, which logs it', () => {
    expect(body).toMatch(/generateStructuredWithClaude\(/);
    expect(body).toMatch(/z\.enum\(\['none', \.\.\.slugs\]\)/);
    expect(body).toMatch(/task: 'agent_router'/);
  });

  it('never salvages a slug out of free text', () => {
    expect(body, 'a free-text reply matched with includes() is the repair parser invariant 9 forbids')
      .not.toMatch(/\.includes\(s\.slug\)/);
    expect(body).not.toMatch(/modelHaiku\.invoke/);
  });

  it('gates on a confidence threshold read from system_settings, with no default', () => {
    expect(body).toMatch(/setting_key', 'agent_router'/);
    expect(body).toMatch(/confidence < minConfidence/);
    expect(body).toMatch(/Number\.isFinite\(minConfidence\)/);
  });
});
