import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const GENERATOR = 'supabase/functions/generate-interior-video-v2/index.ts';
const TOOL = 'supabase/functions/_shared/tools/background-tools.ts';
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

function block(src: string, decl: string): string {
  const start = src.indexOf(decl);
  if (start < 0) throw new Error(`missing declaration: ${decl}`);
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error(`unterminated block: ${decl}`);
}

const keysOf = (b: string) => [...b.matchAll(/'([a-z0-9.\-/]+)':/gi)].map((m) => m[1]);

describe('a video type never defaults to a model the platform cannot run', () => {
  const gen = read(GENERATOR);
  const creditCosts = keysOf(block(gen, 'const CREDIT_COSTS'));
  const modelProvider = block(gen, 'const MODEL_PROVIDER');
  const preference = block(gen, 'const TYPE_MODEL_PREFERENCE');

  it('prices every model it can route to', () => {
    expect(creditCosts.length).toBeGreaterThan(5);
  });

  it('names a provider for every priced model', () => {
    const mapped = keysOf(modelProvider);
    expect([...creditCosts].sort()).toEqual([...mapped].sort());
  });

  it('only ever prefers models it can price', () => {
    const referenced = [...preference.matchAll(/'([a-z0-9.\-]+)'/gi)]
      .map((m) => m[1])
      .filter((v) => !/^(walkthrough|product_spotlight|before_after|floorplan_flythrough|social_reel)$/.test(v));
    for (const model of new Set(referenced)) expect(creditCosts).toContain(model);
  });

  it('gives every video type a fallback on a DIFFERENT provider, so one dead key cannot kill it', () => {
    const providers = new Map(
      [...modelProvider.matchAll(/'([a-z0-9.\-]+)':\s*'([a-z]+)'/gi)].map((m) => [m[1], m[2]]),
    );
    const lists = [...preference.matchAll(/(\w+):\s*\[([^\]]+)\]/g)];
    expect(lists.length).toBe(5);
    for (const [, type, body] of lists) {
      const models = [...body.matchAll(/'([a-z0-9.\-]+)'/gi)].map((m) => m[1]);
      const distinct = new Set(models.map((m) => providers.get(m)));
      expect(distinct.size, `${type} can only run on ${[...distinct].join(', ')}`).toBeGreaterThan(2);
    }
  });

  it('decides availability BEFORE debiting credits', () => {
    const gate = gen.indexOf('usableVideoProviders(supabase)');
    const debit = gen.indexOf("rpc('debit_credits'");
    expect(gate).toBeGreaterThan(-1);
    expect(debit).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(debit);
  });

  it('refuses an explicitly requested model rather than swapping it', () => {
    expect(gen).toMatch(/if \(requestedModel\) \{[\s\S]{0,400}?model_not_configured/);
  });

  it('refuses with no charge when no provider is configured', () => {
    const refusal = gen.indexOf('no_video_provider_configured');
    const debit = gen.indexOf("rpc('debit_credits'");
    expect(refusal).toBeGreaterThan(-1);
    expect(refusal).toBeLessThan(debit);
  });

  it('advertises exactly the video types the schema accepts', () => {
    const tool = read(TOOL);
    const declared = tool.match(/video_type: z\.enum\(\[([^\]]+)\]/);
    if (!declared) throw new Error('video_type enum not found');
    const enumValues = new Set([...declared[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
    const described = new Set(
      [...tool.matchAll(/^- ([a-z_]+): /gm)].map((m) => m[1]),
    );
    expect(enumValues.size).toBe(5);
    for (const type of described) expect(enumValues).toContain(type);
  });
});
