/**
 * Free tools on the embed, and who gets credit for what they produce (#382 follow-up).
 *
 * Three claims that are cheap to make and expensive to get wrong: a free key stays free, a
 * catalogue-free key is not offered tools that need a catalogue, and the two halves of attribution
 * stay two halves.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { blankComments } from '../helpers/stripComments';
import { PUBLIC_TOOLS, toolsForKey, fieldsFromSchema } from '../../supabase/functions/_shared/embed-agent-tools.ts';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const TOOLS_KEY = { key_kind: 'tools', tools_enabled: true, paid_tools_enabled: false };
const CATALOG_KEY = { key_kind: 'catalog', tools_enabled: true, paid_tools_enabled: false };

describe('a free-tools key stays free', () => {
  it('is offered nothing with an upstream cost', () => {
    for (const t of toolsForKey(TOOLS_KEY)) expect(t.upstreamCostUsd).toBe(0);
  });

  it('is offered nothing that needs a catalogue it does not have', () => {
    // Offering `price_my_spec` to an architect with no products returns "nothing matched" forever,
    // which reads as a broken widget rather than as a key doing what it was configured to do.
    for (const t of toolsForKey(TOOLS_KEY)) expect(t.needsCatalog).toBe(false);
  });

  it('still gets the calculators and the quote request', () => {
    const names = toolsForKey(TOOLS_KEY).map((t) => t.name).sort();
    expect(names).toContain('calculate_heat_pump_sizing');
    expect(names).toContain('calculate_heating_cost_comparison');
    expect(names).toContain('calculate_kitchen_cost');
    // The whole point of the arrangement: the embedder gets the lead.
    expect(names).toContain('raise_quote_request');
  });

  it('the paid tools appear only when the key opts in', () => {
    const free = toolsForKey(CATALOG_KEY).map((t) => t.name);
    const paid = toolsForKey({ ...CATALOG_KEY, paid_tools_enabled: true }).map((t) => t.name);
    expect(free).not.toContain('material_search');
    expect(paid).toContain('material_search');
  });

  it('a catalogue key that never asked for tools gets none', () => {
    expect(toolsForKey({ key_kind: 'catalog', tools_enabled: false })).toEqual([]);
  });

  it('every tool declares both facts, so neither can be forgotten on a new one', () => {
    for (const t of PUBLIC_TOOLS) {
      expect(typeof t.needsCatalog).toBe('boolean');
      expect(typeof t.upstreamCostUsd).toBe('number');
    }
  });
});

describe('the endpoint re-asks rather than trusting its own listing', () => {
  const fn = blankComments(read('supabase/functions/embed-agent/index.ts'));

  it('filters the run by the key, not just the capabilities list', () => {
    // Advertising the list is a convenience; the gate is asking again about the one tool actually
    // being run. A caller can name anything it likes.
    const run = fn.slice(fn.indexOf("if (action === 'run')"));
    expect(run.slice(0, 2000)).toContain('toolsForKey');
  });

  it('checks the money ceiling before a paid tool and records after', () => {
    const run = fn.slice(fn.indexOf("if (action === 'run')"));
    expect(run).toContain('embed_spend_has_headroom');
    expect(run).toContain('embed_spend_record');
    // The zero-cost calculators must not be gated by a budget that has nothing to do with them.
    expect(run).toMatch(/spec\.upstreamCostUsd > 0/);
  });

  it('draws on ONE budget, not one per feature', () => {
    // A merchant should answer "what can this key cost me in a day" once.
    expect(fn).not.toContain('chat_daily_usd_cap');
    expect(fn).not.toContain('embed_chat_has_headroom');
  });
});

describe('attribution is two records, and they stay two', () => {
  const fn = blankComments(read('supabase/functions/embed-agent/index.ts'));

  it('the lead follows the KEY and nothing in the request can move it', () => {
    expect(fn).toContain('authenticateEmbedKey');
    expect(fn).not.toMatch(/params\.workspace_id|params\.referral/);
  });

  it('the referral code is served only when the workspace enabled one', () => {
    // A link that pretends to attribute and does not is worse than a plain one.
    expect(fn).toMatch(/referral_enabled \? \(ws\.referral_code \?\? null\) : null/);
  });

  it('the widget attaches it to its link back, or links plainly', () => {
    const helper = blankComments(read('src/embed/appOrigin.ts'));
    expect(helper).toContain('referralLink');
    expect(helper).toMatch(/referralCode \?/);
    const widget = blankComments(read('src/embed/materialkai-assistant.ts'));
    expect(widget).toContain('referralLink(');
  });

  it('both widgets share one app-origin derivation', () => {
    // Hardcoding it is wrong on staging and in any self-hosted deployment — and wrong quietly: the
    // link renders, it just goes somewhere else.
    for (const f of ['src/embed/materialkai-assistant.ts', 'src/embed/materialkai-product.ts']) {
      expect(read(f)).toContain("from './appOrigin'");
    }
  });
});

describe('the form is built from the schema, never from a list beside it', () => {
  it('reads enum values off the tool, so they cannot be invented', () => {
    // THE BUG THIS EXISTS FOR. The widget's first version hand-wrote
    // `insulation_level: 'average'` and `emitter: 'radiators'` against a schema that says
    // `none|medium|modern|passive` and `underfloor|fan_coil|…`. Every heat-pump call failed at the
    // tool boundary, where a visitor sees only a widget that does not work — the exact outcome
    // CLAUDE.md's "never hand-mirror a tool's enum" rule was written from.
    const schema = {
      shape: {
        floor_area_m2: { _def: { typeName: 'ZodNumber' }, description: 'Heated floor area in m².' },
        insulation_level: { _def: { typeName: 'ZodEnum', values: ['none', 'medium', 'modern', 'passive'] } },
        ceiling_height_m: { _def: { typeName: 'ZodOptional', innerType: { _def: { typeName: 'ZodNumber' } } } },
        include_dhw: { _def: { typeName: 'ZodBoolean' } },
      },
    };
    const fields = fieldsFromSchema(schema);
    const by = (n: string) => fields.find((f) => f.name === n)!;

    expect(by('insulation_level').type).toBe('enum');
    expect(by('insulation_level').options).toEqual(['none', 'medium', 'modern', 'passive']);
    expect(by('insulation_level').options).not.toContain('average');
    expect(by('floor_area_m2').type).toBe('number');
    expect(by('floor_area_m2').required).toBe(true);
    expect(by('include_dhw').type).toBe('boolean');
  });

  it('unwraps optional so a defaulted input is not demanded of a visitor', () => {
    const fields = fieldsFromSchema({
      shape: { ceiling_height_m: { _def: { typeName: 'ZodOptional', innerType: { _def: { typeName: 'ZodNumber' } } } } },
    });
    expect(fields[0].required).toBe(false);
    expect(fields[0].type).toBe('number');
  });

  it('survives a schema shape it does not understand', () => {
    // A tool whose schema cannot be read must render no fields rather than throw into the page.
    expect(fieldsFromSchema(undefined)).toEqual([]);
    expect(fieldsFromSchema({})).toEqual([]);
  });

  it('the widget renders those fields and hand-writes no enum of its own', () => {
    const widget = blankComments(read('src/embed/materialkai-assistant.ts'));
    expect(widget).toContain('tool?.fields');
    // The values that broke it must not reappear anywhere in the widget.
    expect(widget).not.toContain("'average'");
    expect(widget).not.toContain("'radiators'");
  });
});
