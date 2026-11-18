/** Flow-builder edge-function picker ↔ what flow-engine will actually invoke. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { FLOW_RUNNABLE_EDGE_FUNCTIONS } from '@/config/flowEdgeFunctions';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('flow edge-function picker ↔ engine allowlist', () => {
  const names = FLOW_RUNNABLE_EDGE_FUNCTIONS.map((f) => f.name);

  it('every runnable function is a catalogued endpoint', () => {
    const catalogue = (JSON.parse(read('scripts/edge-endpoints.json')) as { name: string }[]).map((e) => e.name);
    const unknown = names.filter((n) => !catalogue.includes(n));
    expect(unknown, `not in scripts/edge-endpoints.json: ${unknown.join(', ')}`).toEqual([]);
  });

  it('the picker offers the allowlist and nothing else', () => {
    const src = read('src/components/Admin/FlowsManagement/panels/configs/entitySearchService.ts');
    expect(src).toMatch(/const EDGE_FUNCTIONS: EntityResult\[\] = FLOW_RUNNABLE_EDGE_FUNCTIONS\.map\(/);
    expect(src, 'a hand-listed edge function reappeared in the picker').not.toMatch(/\{\s*id:\s*'[a-z0-9-]+',\s*label:/);
  });

  it('flow-engine enforces the same list and keeps no copy of its own', () => {
    const engine = read('supabase/functions/flow-engine/index.ts');
    expect(engine).toMatch(/FLOW_RUNNABLE_EDGE_FUNCTION_NAMES\.has\(fnName\)/);
    expect(engine).not.toMatch(/RUN_EDGE_FUNCTION_ALLOWED\s*=\s*new Set/);
  });

  it('entries are unique', () => {
    expect(new Set(names).size).toBe(names.length);
  });
});
