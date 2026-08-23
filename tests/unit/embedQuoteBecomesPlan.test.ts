/**
 * A configurator lead arrives as a PLAN, not a chip list (#382 Phase 4).
 *
 * The point of the whole SDK is that the operator does not re-type the kitchen. A lead carrying
 * only `spec` jsonb — a flat bag of adjectives — leaves them reading a facet list and rebuilding a
 * layout that already existed and was thrown away. These pin the three things that make the
 * handoff safe, each of which fails silently if it drifts.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { blankComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const API = read('supabase/functions/products-3d-api/index.ts');
const ENGINE = read('supabase/functions/project-plan-engine/index.ts');

describe('the plan is delegated, never rebuilt', () => {
  it('calls the engine rather than inserting a plan itself', () => {
    const code = blankComments(API);
    expect(code).toContain("action: 'create-from-blueprint'");
    // A second copy of plan creation would be a second derivation of plan money, free to disagree
    // with the one the operator then edits. The engine owns the tree walk, the option defaults,
    // the rate freeze and the absorbed-group strip.
    expect(code).not.toMatch(/from\('project_plans'\)\s*\.insert/);
    expect(code).not.toContain('snapshotRateTables');
  });

  it('the engine still freezes the rate tables it hands back', () => {
    // `project_plans.composition.rate_tables` is what makes a plan self-contained: reopening a
    // quote next month reprices at the rates it was quoted on, not at whatever the price list has
    // become. If this ever stops happening, an embed lead silently becomes repriceable.
    expect(blankComments(ENGINE)).toContain('rate_tables: snapshotRateTables(');
  });
});

describe('the lead survives a plan failure', () => {
  it('inserts the request BEFORE attempting the plan', () => {
    const code = blankComments(API);
    const block = code.slice(code.indexOf("if (action === 'request_quote')"));
    const insertAt = block.indexOf("from('quote_requests').insert");
    const planAt = block.indexOf("action: 'create-from-blueprint'");
    expect(insertAt).toBeGreaterThan(-1);
    expect(planAt).toBeGreaterThan(-1);
    // Losing a customer because a plan write failed is the worse failure by a distance.
    expect(insertAt).toBeLessThan(planAt);
  });

  it('never fails the request when the plan cannot be made', () => {
    const code = blankComments(API);
    const block = code.slice(code.indexOf("action: 'create-from-blueprint'"));
    const tail = block.slice(0, 1600);
    // The plan attempt is wrapped and its failure logged, not returned.
    expect(tail).toContain('catch');
    expect(tail).not.toMatch(/return embedJson\(\{ error/);
  });
});

describe('an anonymous composition cannot name its own tenant or blueprint', () => {
  it('checks scope and publication before building anything', () => {
    const code = blankComments(API);
    const block = code.slice(code.indexOf("if (action === 'request_quote')"));
    // Same gate the `blueprint` read action uses — a composition may only configure a blueprint
    // this key is actually entitled to serve.
    expect(block).toContain('isBlueprintInScope');
  });

  it('takes the owner from the workspace, never from the request', () => {
    const code = blankComments(API);
    const block = code.slice(code.indexOf("if (action === 'request_quote')"));
    expect(block).toContain("eq('role', 'owner')");
    expect(block).not.toMatch(/params\.user_id/);
  });

  it('caps the composition, which is anonymous input becoming a jsonb column', () => {
    expect(blankComments(API)).toMatch(/JSON\.stringify\(composition\)\.length <= 20_000/);
  });

  it('the engine honours a body user_id ONLY for a service caller', () => {
    // Accepting it from a JWT would let any signed-in user create a plan owned by somebody else —
    // the body-supplied-identity mistake invariant 1 exists to prevent.
    expect(blankComments(ENGINE)).toMatch(/isService && typeof body\?\.user_id === 'string'/);
  });
});

describe('the widget sends the layout, not just a total', () => {
  const widget = read('src/embed/materialkai-configurator.ts');

  it('posts the blueprint id and the composition', () => {
    const code = blankComments(widget);
    expect(code).toContain('blueprint_id: this.bp?.id');
    expect(code).toContain('composition: this.config');
  });

  it('still emits the event, so a merchant who wired their own form keeps working', () => {
    expect(blankComments(widget)).toContain("materialkai:quote-request");
  });

  it('shares ONE Turnstile loader with the builder', () => {
    // Cloudflare's script defines a global; two private loaders would each think they owned it,
    // and a visitor who solved one challenge would send a token nothing is watching.
    for (const f of ['src/embed/materialkai-configurator.ts', 'src/embed/materialkai-builder.ts']) {
      expect(read(f)).toContain("from './turnstileLoader'");
      expect(blankComments(read(f))).not.toContain('challenges.cloudflare.com');
    }
  });
});
