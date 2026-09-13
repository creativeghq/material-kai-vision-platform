/**
 * The write half of a read/write pair gets built server-side and never given a control (#419).
 * Ten of eleven findings in that sweep were this exact shape -- the reads are always wired,
 * because somebody had to see the screen work. Unlike most of what this codebase guards, it is
 * machine-checkable: a method on an exported service that nothing anywhere calls is unreachable.
 *
 * RATCHETED, like the empty-state baseline: a new one fails the build, and the recorded count may
 * only go DOWN. The 125 recorded today are a backlog, not an endorsement.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findUnreachableServiceMethods } from '../../scripts/lib/deadServiceMethods.mjs';

const BASELINE = join(__dirname, '..', '..', '.github', 'dead-service-methods-baseline.json');

type Baseline = { total: number; files: Record<string, string[]> };

describe('a service method nothing calls is unreachable', () => {
  const found = findUnreachableServiceMethods();
  const byFile: Record<string, string[]> = {};
  for (const entry of found) {
    const at = entry.lastIndexOf(':');
    (byFile[entry.slice(0, at)] ||= []).push(entry.slice(at + 1));
  }
  for (const k of Object.keys(byFile)) byFile[k].sort();

  if (process.env.WRITE_DEAD_SERVICE_BASELINE) {
    writeFileSync(BASELINE, `${JSON.stringify(
      { total: found.length, files: Object.fromEntries(Object.keys(byFile).sort().map((k) => [k, byFile[k]])) },
      null, 2,
    )}
`);
  }
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline;

  it('no NEW unreachable service method appears', () => {
    const known = new Set(
      Object.entries(baseline.files).flatMap(([f, ns]) => ns.map((n) => `${f}:${n}`)),
    );
    const fresh = found.filter((e) => !known.has(e));
    expect(
      fresh,
      'These service methods are exported and nothing anywhere calls them. Either wire the ' +
        'control that was never built, or delete the method -- do not add it to the baseline. ' +
        'If it IS reached (a dispatch table, a generated caller), say how in a comment beside it ' +
        'and widen the scanner rather than the baseline.',
    ).toEqual([]);
  });

  it('the baseline is only ever ratcheted down', () => {
    expect(
      found.length,
      `The recorded baseline is ${baseline.total} unreachable methods but the tree now has ` +
        `${found.length}. If you FIXED some, lower the numbers (or regenerate with ` +
        'WRITE_DEAD_SERVICE_BASELINE=1).',
    ).toBeLessThanOrEqual(baseline.total);
  });

  it('the seven #419 findings are resolved', () => {
    // Watched to fire: each of these was in the sweep and is now either deleted or wired.
    const gone = [
      'projectCostByCode', 'getByShareToken', 'archiveProject', 'isCollaborator',
      'updateMoodBoard', 'updateMoodBoardItem', 'listFreightQuotes', 'updateDocument',
    ];
    const still = gone.filter((n) => found.some((e) => e.endsWith(`:${n}`)));
    expect(still, 'These were fixed by #419 and have come back unreachable.').toEqual([]);
  });
});
