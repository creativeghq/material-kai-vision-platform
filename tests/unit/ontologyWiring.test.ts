/**
 * Guards the ontology layer against the one failure it was itself an instance of.
 *
 * Phase 1 shipped on 2026-08-26: two tables, six functions, a domain-enforcing trigger, two
 * integrity probes, thirteen passing lifecycle assertions. Five days and 237 commits later it was
 * called by **nothing** — not one TypeScript file, not one SQL function. Its only reference in the
 * whole repository was its own documentation.
 *
 * That is the defect class this codebase is organised around, committed by the person who had
 * just spent a week writing the guards for it. A layer that is correct, probe-guarded and
 * unreachable is indistinguishable at runtime from a layer that was never built, and every green
 * check kept saying it was fine.
 *
 * So these tests do not check that the ontology WORKS — SQL probes do that, and they run against
 * the live functions this repo never commits. They check that it is REACHED.
 *
 * SCOPE — read before trusting a green run.
 * These scan repo files. `ontology_concept_types`, `ontology_bindings`, the validation trigger and
 * every `ontology_*` function live only in `pg_proc` / `pg_constraint` (CLAUDE.md: SQL is applied
 * through the MCP and never committed). The runtime half is watched by
 * `ontology.duplicate_alias_home` and `ontology.candidates_unreviewed`.
 */
import { describe, it, expect } from 'vitest';
import { readSource, strippedSource, sourceIndex } from '../helpers/sourceIndex';

const INDEX = sourceIndex({ exclude: ['_generated'], filter: (p) => p !== 'src/integrations/supabase/types.ts' });

const SERVICE = 'src/services/warehouseService.ts';
/** The surface that both feeds the ontology and shows what it found. */
const INTAKE_UI = 'src/modules/finance/components/PendingProductsCard.tsx';

/**
 * Mirrors the seeded `ontology_concept_types.key` values. The table is operator-owned and
 * `ontology_bindings.concept_type` is a foreign key to it, so a value missing there is rejected
 * at write time — this union and that table must move together.
 */
const CONCEPT_TYPES = ['material_category', 'manufacturer', 'supplier'] as const;

/**
 * Every ontology RPC, and whether the client is expected to call it.
 *
 * `note_term`, `propose` and `resolve` are reached from SQL (`ontology_scan_intake_terms` calls
 * `note_term`; the proposer is a server-side job), so requiring a client call for them would be a
 * false demand. The three the operator drives must be callable from the app or the review
 * lifecycle has no human in it — which is the entire governance claim.
 */
const CLIENT_CALLED: Record<string, boolean> = {
  ontology_scan_intake_terms: true,
  ontology_gaps: true,
  ontology_confirm_binding: true,
  ontology_reject_binding: true,
};

describe('the ontology is reached', () => {
  it('finds sources to scan', () => {
    expect(INDEX.files.length).toBeGreaterThan(200);
  });

  /**
   * Asserted as a CALL — `rpc('name'` — never as a mention. A bare `includes()` is satisfied by
   * the name sitting in a comment, a type, or a doc string, which is exactly how a layer can read
   * as wired while being dead. Same declaration-vs-call trap `pageWatchWebhook.test.ts` records
   * for `secretsMatch` and `pricingChain.test.ts` records for its preview RPCs.
   */
  it.each(Object.keys(CLIENT_CALLED))('%s is actually CALLED from the app', (fn) => {
    const all = INDEX.all();
    const CALL = new RegExp(`rpc\\(\\s*['"]${fn}['"]`);
    expect(
      CALL.test(all),
      `nothing calls ${fn}. The ontology was inert for its first five days because every one of `
      + 'these was unreferenced — being correct is not the same as being reached.',
    ).toBe(true);
  });

  /**
   * The scan is what turns 1,700 lines of free text into a ranked work list. If it is never
   * invoked, `ontology_gaps` returns an empty list forever and the screen truthfully reports that
   * there is nothing to resolve — a silent zero that looks exactly like success.
   */
  it('the intake surface both scans and reads the gaps', () => {
    const ui = strippedSource(INTAKE_UI);
    expect(ui.includes('scanIntakeTerms'), `${INTAKE_UI} never scans, so no gap is ever recorded`).toBe(true);
    expect(ui.includes('ontologyGaps'), `${INTAKE_UI} never reads the work list`).toBe(true);
  });

  /**
   * Fetching and then not rendering is the "handler that only logs" defect: the request costs the
   * round trip, the state updates, and the operator sees nothing. This asserts the gaps reach JSX,
   * not just a setter.
   */
  it('the gaps are RENDERED, not just fetched', () => {
    const ui = strippedSource(INTAKE_UI);
    expect(
      /ontologyGaps\s*\.\s*(map|slice)\s*\(/.test(ui),
      `${INTAKE_UI} sets ontology gaps in state and never renders them. A number nobody can act `
      + 'on is how the previous version of this idea sat unused.',
    ).toBe(true);
  });
});

describe('the ontology vocabulary stays single-homed', () => {
  it('the TypeScript concept-type union matches the seeded vocabulary', () => {
    const src = readSource(SERVICE);
    const m = /export type OntologyConceptType\s*=\s*([^;]+);/.exec(src);
    expect(m, `OntologyConceptType is not declared in ${SERVICE}`).toBeTruthy();
    const declared = [...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
    expect(declared, 'OntologyConceptType has drifted from ontology_concept_types').toEqual(
      [...CONCEPT_TYPES].sort(),
    );
  });

  /**
   * The anti-duplication contract, in the half a repo scan can see.
   *
   * Terminology→concept mapping already existed in FOUR places before this layer —
   * `material_categories.vocab_aliases`, `.controlled_vocab`, `material_category_aliases` and
   * `facet_canonical_values` — none of which knew about the others. `facet_canonical_values` owns
   * canonical facet values, with aliases and embeddings and a pipeline behind it; adding
   * `facet_value` as a concept type would make this layer the fifth copy it was built to prevent.
   *
   * The DB half is `ontology.duplicate_alias_home`, which fires when a term is confirmed in two
   * homes at once.
   */
  it('facet_value never becomes a concept type', () => {
    const offenders: string[] = [];
    for (const [file, src] of INDEX.stripped()) {
      if (/OntologyConceptType[\s\S]{0,200}facet_value/.test(src)
          || /concept_type\s*[:=]\s*['"]facet_value['"]/.test(src)) {
        offenders.push(file);
      }
    }
    expect(
      offenders,
      'facet_canonical_values owns canonical facet values — aliases, embeddings and the pipeline '
      + 'that fills them. A facet_value concept type is a second home for the same question.\n'
      + offenders.join('\n'),
    ).toEqual([]);
  });

  /**
   * `candidate` is a model's guess and `confirmed` is a human decision. A UI that renders them
   * identically has discarded the only distinction that makes an AI-assisted mapping safe to act
   * on, and the whole review lifecycle becomes decoration.
   */
  it('the surface distinguishes a candidate from a confirmation', () => {
    const ui = strippedSource(INTAKE_UI);
    expect(
      ui.includes("'candidate'") || ui.includes('"candidate"'),
      `${INTAKE_UI} never mentions the candidate status, so a machine guess and a human decision `
      + 'render the same. AI proposes and a human confirms — that has to be visible.',
    ).toBe(true);
  });
});
