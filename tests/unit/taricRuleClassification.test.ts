/**
 * Rule-driven customs classification — the properties that must not regress.
 *
 * The classifier originally searched the nomenclature with the product's NAME. That was the
 * wrong axis: a tariff position follows the MATERIAL and the FORM of an article, both of which
 * the category carries and "AMALFI GRIS 80X80" does not. Worse, the size in a product name made
 * the query look like a code lookup, so the shortlist came back empty for most of the catalog —
 * reported forever as "no confident match" rather than as an error.
 *
 * The replacement resolves category (+ material) → heading, then a measured attribute → the
 * declarable code. This file pins the parts of that which are easy to undo by accident.
 *
 * The SQL resolver itself (`resolve_taric_for_product`) is exercised against the live database;
 * what is checked here is the CONTRACT the edge function and the UI must keep.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const CLASSIFIER = join(ROOT, 'supabase/functions/taric-classify/index.ts');
const RULES_PANEL = join(ROOT, 'src/components/Admin/TaricRulesPanel.tsx');

const classifier = readFileSync(CLASSIFIER, 'utf8');

describe('the classifier asks the rules before it spends anything', () => {
  it('calls resolve_taric_for_product', () => {
    expect(classifier).toContain('resolve_taric_for_product');
  });

  it('resolves rules BEFORE the credit reservation', () => {
    // If the paid stage ran first, the whole point — deterministic classification at no cost —
    // would be lost while still appearing to work.
    const ruleAt = classifier.indexOf('resolve_taric_for_product');
    const creditAt = classifier.indexOf('reserveCredits(');
    expect(ruleAt).toBeGreaterThan(-1);
    expect(creditAt).toBeGreaterThan(-1);
    expect(ruleAt).toBeLessThan(creditAt);
  });

  it('resolves rules BEFORE the llm-disabled early return, so the free sweep applies them', () => {
    // The hourly backfill runs with llm:false. It must still get the benefit of confirmed rules;
    // otherwise the cheap path stays as dumb as it was before this existed.
    const ruleAt = classifier.indexOf('resolve_taric_for_product');
    const sweepReturn = classifier.indexOf('if (!allowLlm)');
    expect(sweepReturn).toBeGreaterThan(-1);
    expect(ruleAt).toBeLessThan(sweepReturn);
  });
});

describe('only a CONFIRMED rule may write products.taric_code', () => {
  /**
   * The safety property of the whole design. An unconfirmed rule is the platform's proposal;
   * a confirmed one is a person's decision. Only the second may be applied.
   */
  it('the auto-apply branch is guarded by rule.confirmed', () => {
    const applyIdx = classifier.indexOf("taric_source: 'category_rule'");
    expect(applyIdx).toBeGreaterThan(-1);
    // The guard sits above the first apply; find the enclosing condition.
    const before = classifier.slice(0, applyIdx);
    const lastIf = before.lastIndexOf('if (rule.resolved');
    expect(lastIf, 'no `if (rule.resolved …)` guards the apply').toBeGreaterThan(-1);
    expect(before.slice(lastIf)).toContain('rule.confirmed');
  });

  it('the unconfirmed branch writes taric_code_suggested, never taric_code', () => {
    const idx = classifier.indexOf('!rule.confirmed');
    expect(idx).toBeGreaterThan(-1);
    // Take the update payload that follows the unconfirmed guard.
    const block = classifier.slice(idx, idx + 700);
    expect(block).toContain('taric_code_suggested');
    expect(block).toMatch(/taric_status: 'suggested'/);
    // `taric_code:` must not appear as its own key here (taric_code_suggested is a different key).
    expect(block).not.toMatch(/(^|[^_])taric_code:\s/);
  });
});

describe('the shortlist is narrowed by the resolved heading', () => {
  it('a resolved heading supersedes the caller-supplied chapters', () => {
    // Combining them can only ever exclude the codes we are trying to reach.
    expect(classifier).toMatch(/p_chapters:\s*prefix\s*\?\s*null\s*:\s*chapters/);
  });

  it('the product name is used only when no heading was resolved', () => {
    const idx = classifier.indexOf('const query = prefix');
    expect(idx, 'query no longer prefers the resolved prefix').toBeGreaterThan(-1);
    expect(classifier.slice(idx, idx + 260)).toContain('product.name');
  });
});

describe('the confirmation surface exists and says what it means', () => {
  const panel = readFileSync(RULES_PANEL, 'utf8');

  it('offers a confirm action', () => {
    expect(panel).toContain('setRuleConfirmed');
  });

  it('renders status as plain coloured words, not a Badge', () => {
    // House style: status columns are coloured text, never a pill with a background.
    expect(panel).toContain('Confirmed');
    expect(panel).not.toMatch(/<Badge[^>]*>\s*\{?\s*(r\.is_confirmed|Confirmed)/);
  });
});
