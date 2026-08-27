import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { stripComments } from '../helpers/stripComments';
import {
  ASSET_CATEGORIES, ACQUISITION_TYPES, isAssetCategory, isAcquisitionType,
} from '@/services/assets/assetVocabulary';
import {
  AGENT_RUN_STATUSES, ACTIVE_AGENT_RUN_STATUSES, AGENT_LOG_LEVELS,
  isAgentRunStatus, isAgentLogLevel,
} from '@/services/agents/agentVocabulary';

/**
 * Asset and background-agent vocabularies exist once, and equal their constraints (#391).
 *
 * As in the other files of this set, the expected values are CONSTRAINT TEXT quoted
 * verbatim from `pg_constraint` / `pg_enum` rather than a tidy array. #391 names the
 * failure that makes this necessary: a previous guard for this shape "carried its own
 * fourth copy of the list, hand-edited in the same commit as the other three". A pin you
 * edit alongside the thing it pins catches inconsistency, never incorrectness.
 */

const ROOT = join(__dirname, '..', '..');

/** `pg_get_constraintdef` / `pg_enum` output, 2026-08-27. Verbatim on purpose. */
const DB = {
  category:
    "CHECK ((category = ANY (ARRAY['vehicle'::text, 'phone'::text, 'laptop'::text, 'payment_card'::text, 'equipment'::text, 'other'::text])))",
  acquisition:
    "CHECK ((acquisition_type = ANY (ARRAY['owned'::text, 'leased'::text, 'financed'::text])))",
  runStatus:
    "CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))",
  logLevel:
    "CHECK ((level = ANY (ARRAY['debug'::text, 'info'::text, 'warn'::text, 'error'::text])))",
  /** The `processing_status` ENUM — the same fact as `agent_runs_status_check`. */
  processingStatusEnum: "'pending', 'processing', 'completed', 'failed', 'cancelled'",
};

const literals = (s: string) => [...s.matchAll(/'([^':]+)'/g)].map((m) => m[1]);

describe('#391 — asset vocabularies match their constraints', () => {
  it('category', () => {
    expect([...ASSET_CATEGORIES].sort()).toEqual(literals(DB.category).sort());
  });
  it('acquisition type', () => {
    expect([...ACQUISITION_TYPES].sort()).toEqual(literals(DB.acquisition).sort());
  });
  it('the guards narrow', () => {
    for (const c of ASSET_CATEGORIES) expect(isAssetCategory(c)).toBe(true);
    for (const a of ACQUISITION_TYPES) expect(isAcquisitionType(a)).toBe(true);
    expect(isAssetCategory('van')).toBe(false);
    expect(isAcquisitionType('rented')).toBe(false);
  });
});

describe('#391 — agent vocabularies match their constraints', () => {
  it('run status', () => {
    expect([...AGENT_RUN_STATUSES].sort()).toEqual(literals(DB.runStatus).sort());
  });

  it('run status is ALSO exactly the processing_status enum', () => {
    // The sweep grouped these because they are one fact enforced in two places. If they
    // ever diverge, the source cannot equal both and this says so rather than letting
    // one of them silently win.
    expect([...AGENT_RUN_STATUSES].sort()).toEqual(literals(DB.processingStatusEnum).sort());
  });

  it('log level', () => {
    expect([...AGENT_LOG_LEVELS].sort()).toEqual(literals(DB.logLevel).sort());
  });

  it('the active subset is a real subset', () => {
    // `ACTIVE_AGENT_RUN_STATUSES` is derived, not a second vocabulary. It only means
    // anything while every member is a real status — an inline `['pending','processing']`
    // in a query could outlive a rename and quietly match nothing.
    for (const s of ACTIVE_AGENT_RUN_STATUSES) {
      expect(AGENT_RUN_STATUSES as readonly string[]).toContain(s);
    }
    expect(ACTIVE_AGENT_RUN_STATUSES.length).toBeLessThan(AGENT_RUN_STATUSES.length);
  });

  it('the guards narrow', () => {
    for (const s of AGENT_RUN_STATUSES) expect(isAgentRunStatus(s)).toBe(true);
    for (const l of AGENT_LOG_LEVELS) expect(isAgentLogLevel(l)).toBe(true);
    expect(isAgentRunStatus('queued')).toBe(false);
    expect(isAgentLogLevel('trace')).toBe(false);
  });

  it('the literal extractor reads something', () => {
    // A parser returning [] would make every case above compare nothing to nothing.
    expect(literals(DB.runStatus)).toHaveLength(5);
    expect(literals('CHECK ((x = ANY (ARRAY[])))')).toEqual([]);
  });
});

describe('#391 — the config logLevel is deliberately NOT unified', () => {
  it('configSchemas keeps its own logLevel', () => {
    // Same four values, different order, DIFFERENT FACT: that one is the platform's
    // logging configuration, this one is the level on an `agent_run_logs` row. #391 is
    // explicit — unify by meaning, never by signature — because two vocabularies that
    // match today must stay free to diverge. This case exists so nobody "finishes the
    // job" by folding them together.
    const src = stripComments(
      readFileSync(join(ROOT, 'src/config/schemas/configSchemas.ts'), 'utf8'),
    );
    expect(src).toContain('logLevel: z.enum(');
    expect(
      src.includes('agentVocabulary'),
      'configSchemas now imports the AGENT log level. Those are different facts that ' +
        'happen to share values today; folding them together makes a change to one ' +
        'silently change the other.',
    ).toBe(false);
  });
});
