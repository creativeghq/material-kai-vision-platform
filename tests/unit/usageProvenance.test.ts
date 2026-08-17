/**
 * `ai_usage_logs` provenance columns — the writer must be ABLE to fill them (#365 follow-up).
 *
 * THE SHAPE THIS EXISTS TO STOP, which this repo has now hit three times on the same table:
 *
 *   2026-08-12  `workspace_id` — the column existed, 19 of 31 edge insert sites never set it.
 *   #365 AD-15  `ai_call_logs.user_id/workspace_id` — the LOGGER had no fields for them, so no
 *               caller could have passed them however careful it was.
 *   this one    `ai_usage_logs.job_id` / `module_slug` / `product_id` — `debitExternalServiceCredits`
 *               is the writer behind 5,192 of the table's rows and its signature had nowhere to
 *               put any of the three.
 *
 * Every time, the column was fine, the data was consistent, nothing raised, and the loss was only
 * visible by counting. A missing key in an insert is valid TypeScript and a valid row.
 *
 * WHAT THIS ASSERTS. Only that the plumbing EXISTS — the parameter is accepted and reaches the
 * insert. It deliberately does not assert that every call site passes one: plenty of spend
 * genuinely has no background job (an interactive tool call is not a job), and a rule that forced
 * an id would get satisfied with an invented one, which is worse than a null.
 *
 * A note on what "unwritten" meant here, because the first diagnosis was wrong. MIVAA's
 * `ai_call_logger.py` DOES write `job_id` into its `ai_usage_logs` mirror. The column is empty
 * platform-wide for two other reasons: the edge writers had no parameter (fixed here), and
 * `background_jobs` is currently EMPTY, so the one pipeline that threads a real job id has not
 * produced a row. Absence of data is not absence of plumbing — worth checking in that order next
 * time.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const CREDIT_UTILS = 'supabase/functions/_shared/credit-utils.ts';
const AI_LOGGER = 'supabase/functions/_shared/ai-logger.ts';

describe('ai_usage_logs provenance plumbing', () => {
  it('debitExternalServiceCredits accepts provenance and writes all three columns', () => {
    const src = read(CREDIT_UTILS);

    expect(src, 'the UsageProvenance shape is gone — the parameter was probably removed')
      .toMatch(/export interface UsageProvenance/);
    expect(src, 'debitExternalServiceCredits no longer takes provenance')
      .toMatch(/provenance: UsageProvenance = \{\}/);

    // The columns must reach the INSERT, not merely the signature. A parameter that is accepted
    // and dropped is the same defect wearing a nicer signature.
    const insert = src.slice(src.indexOf("from('ai_usage_logs')"));
    for (const col of ['job_id', 'module_slug', 'product_id']) {
      expect(insert.slice(0, 2000), `${col} is not written by the ai_usage_logs insert`)
        .toContain(`${col}: provenance.`);
    }
  });

  it('debitOrRefuse forwards provenance rather than swallowing it', () => {
    // The agent-tool paths all go through debitOrRefuse. If it drops the argument, the plumbing
    // exists everywhere except where it is actually used.
    const src = read(CREDIT_UTILS);
    const fn = src.slice(src.indexOf('export async function debitOrRefuse'));
    expect(fn.slice(0, 1200)).toMatch(/provenance: UsageProvenance = \{\}/);
    expect(fn.slice(0, 1200), 'debitOrRefuse accepts provenance but does not pass it on')
      .toMatch(/debitExternalServiceCredits\([\s\S]{0,200}provenance,?\s*\)/);
  });

  it('the AI call logger can still attribute a user and a workspace', () => {
    // AD-15's fix, pinned so it cannot regress the way the original did.
    const src = read(AI_LOGGER);
    expect(src).toMatch(/export interface AICallAttribution/);
    expect(src).toMatch(/user_id: data\.user_id \?\? this\.attribution\.userId \?\? null/);
    expect(src).toMatch(/workspace_id: data\.workspace_id \?\? this\.attribution\.workspaceId \?\? null/);
  });

  it('an unknown token price records null and a reason, never a silent zero', () => {
    // AD-17. `0` is a claim the call was free; `null` plus `unbilled_reason` is the truth.
    const src = read(AI_LOGGER);
    expect(src, 'the literal fallback price table is back — it is a second USD source')
      .not.toMatch(/const AI_PRICING\s*=/);
    expect(src).toMatch(/if \(!pricing\) return null;/);
    expect(src).toMatch(/unbilled_reason/);
  });
});
