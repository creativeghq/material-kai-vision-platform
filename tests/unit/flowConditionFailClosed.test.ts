import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

/**
 * An unconfigured condition blocks; it never fires on everything (#357 AE-15).
 *
 * Two always-true paths existed, and both point the same wrong way — a node whose job is to
 * NARROW, passing everything when it has not been filled in:
 *
 *   • `[].every(Boolean)` is TRUE, so a `filter` with no conditions and `and` logic (the default)
 *     let every record through. "Only VIP customers" with nothing filled in meant everybody.
 *   • `if_else` with a blank field and blank value compares '' to '' under `equals` and takes the
 *     TRUE branch on every event.
 *
 * On a Send Email branch, "fires on everything" means mailing everybody.
 */

const ROOT = join(__dirname, '..', '..');
const engine = stripComments(
  readFileSync(join(ROOT, 'supabase/functions/flow-engine/index.ts'), 'utf8').replace(/\r\n/g, '\n'),
);

describe('#357 AE-15 — flow conditions fail closed', () => {
  it('an empty filter stops the branch instead of passing it', () => {
    const node = engine.slice(engine.indexOf("case 'filter'"), engine.indexOf("case 'delay'"));
    expect(node).toMatch(/conditions\.length === 0/);
    expect(node).toContain("branch: '__stop__'");
    // And it says WHY, so it is distinguishable from a filter that legitimately matched nothing.
    expect(node).toContain('filter_not_configured');
  });

  it('the empty check runs BEFORE the every/some reduction', () => {
    // `[].every(Boolean)` is the bug. Checking after it has already returned true changes nothing.
    const node = engine.slice(engine.indexOf("case 'filter'"), engine.indexOf("case 'delay'"));
    const guard = node.indexOf('conditions.length === 0');
    const reduce = node.indexOf('results.every(Boolean)');
    expect(guard).toBeGreaterThan(-1);
    expect(reduce).toBeGreaterThan(-1);
    expect(guard < reduce).toBe(true);
  });

  it('an unconfigured if_else takes the FALSE branch', () => {
    const node = engine.slice(engine.indexOf("case 'if_else'"), engine.indexOf("case 'switch'"));
    expect(node).toContain('condition_not_configured');
    expect(node).toMatch(/branch: 'false'/);
    // Guarded on both halves: a valid operator with no field is just as unconfigured as no
    // operator at all, and only the second was already covered by evaluateComparison's default.
    expect(node).toMatch(/!String\(field \?\? ''\)\.trim\(\)/);
    expect(node).toMatch(/!String\(operator \?\? ''\)\.trim\(\)/);
  });

  it('an unknown operator is still false', () => {
    // The half that was already right — kept pinned, because it is the other way this node
    // could start firing on everything.
    const fn = engine.slice(engine.indexOf('function evaluateComparison'), engine.indexOf('async function executeCondition'));
    expect(fn).toMatch(/default: return false;/);
  });
});

describe('#357 AE-17 — double-submit needs a synchronous latch', () => {
  const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

  it('creating a campaign latches on a ref, not on React state', () => {
    // A campaign created twice is two campaigns to the SAME audience, and campaign-processor
    // sends both: they are distinct rows, so the per-recipient claim from AE-4 cannot absorb
    // them — the same distinction #355 WH-3 records about duplicate purchase orders.
    const src = read('src/modules/email/components/CreateCampaignModal.tsx');
    expect(src).toMatch(/const submitting = React\.useRef\(false\)/);
    expect(src).toMatch(/if \(submitting\.current\) return;/);
    expect(src).toContain('submitting.current = true;');
    expect(src).toContain('submitting.current = false;');
  });

  it('the campaign latch is taken after validation and before the first await', () => {
    // Earlier strands the form on a validation bounce; later lets the queued submit past.
    const src = read('src/modules/email/components/CreateCampaignModal.tsx');
    const validation = src.indexOf('estimatedRecipients === 0');
    const latch = src.indexOf('submitting.current = true;');
    const firstAwait = src.indexOf('await supabase.auth.getUser()');
    expect(validation).toBeGreaterThan(-1);
    expect(latch > validation, 'latched before validation — a bounce would strand the form').toBe(true);
    expect(latch < firstAwait, 'latched after the first await — the queued submit is already past').toBe(true);
  });

  it('domain add and verify both latch, and verify is keyed per domain', () => {
    // Two DIFFERENT domains may legitimately be marked at once; the same one twice may not.
    const src = read('src/modules/email/components/EmailDomainsTab.tsx');
    expect(src).toMatch(/const addingDomain = useRef\(false\)/);
    expect(src).toMatch(/const verifyingDomains = useRef<Set<string>>/);
    expect(src).toContain('verifyingDomains.current.has(domain)');
    expect(src).toContain('verifyingDomains.current.delete(domain)');
  });
});
