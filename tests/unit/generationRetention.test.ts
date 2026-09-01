/**
 * Saving a generated design to a moodboard KEEPS it (#378 N7).
 *
 * THE DEFECT
 * ----------
 * `job-cleanup-cron` deletes a `generation_3d` row 15 days after it was made unless
 * `saved_to_moodboard_at` is set. The only writer of that column — `moodboardAPI.markGenerationSaved`
 * — HAD NO CALLER, and the actual save path (`MoodboardSavePopover`) takes a media URL with no
 * generation id, so it could not have called it.
 *
 * Measured on the live database while fixing this: 17 generations, **0** ever marked, and the
 * oldest sitting exactly on the 15-day boundary. Saving a design to a moodboard put the image on
 * the board and let the generation behind it be reaped on schedule — the segments, the crops and
 * the model results with it.
 *
 * Nothing could have reported this. The cron deletes successfully, so no error surfaces; the
 * moodboard still shows the picture, so no user notices until they open something that needs the
 * generation. `ops.silent_zero` cannot see it either: a flag that has never once been written is
 * not a metric that dropped, it is a feature that never started.
 *
 * WHAT IS PINNED
 * --------------
 * The wiring, end to end — the popover must ACCEPT a generation id, the surface that has one must
 * PASS it, and the writer must set the retention flag AND the moodboard id together. Any one of
 * the three missing puts it back exactly where it was.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { blankComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const read = (p: string) => blankComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

const API = 'src/services/moodboardAPI.ts';
const POPOVER = 'src/components/business/moodboard/MoodboardSavePopover.tsx';
const GRID = 'src/components/features/ai/ProgressiveImageGrid.tsx';
const CRON = 'supabase/functions/job-cleanup-cron/index.ts';

describe('the retention flag has a writer that is actually reached', () => {
  it('the writer stamps BOTH the retention flag and which moodboard', () => {
    const api = read(API);
    expect(api, 'markGenerationSaved must take the moodboard').toMatch(
      /markGenerationSaved\(\s*generationId: string,\s*moodboardId: string\s*\)/,
    );
    expect(api, 'the retention flag is what the cron reads').toMatch(/saved_to_moodboard_at:/);
    expect(api, 'the issue asked WHICH moodboard, not merely when').toMatch(/saved_to_moodboard_id:/);
  });

  it('the save popover accepts a generation id', () => {
    expect(read(POPOVER), 'without this the popover cannot mark anything').toMatch(/generationId\?: string \| null/);
  });

  it('BOTH save branches mark it — creating a new board is still saving', () => {
    // `handleSave` (existing board) and `handleCreate` (new board) are two paths to the same act.
    // Marking on one of them only is the half-wiring this whole issue is about.
    const popover = read(POPOVER);
    const calls = [...popover.matchAll(/markSavedGeneration\(/g)].length;
    expect(calls, 'expected the mark on both the save and the create branch').toBeGreaterThanOrEqual(2);
  });

  it('the surface that HAS a generation id passes it', () => {
    // A prop nothing passes is a prop that does nothing — the shape #378 keeps finding.
    const grid = read(GRID);
    expect(grid, 'ProgressiveImageGrid must mount the save popover').toMatch(/<MoodboardSavePopover/);
    // `jobId` IS the generation_3d id — this component polls that row by it — so passing anything
    // else here would mark the wrong generation as kept.
    expect(grid, 'ProgressiveImageGrid must pass its jobId as the generation id').toMatch(
      /generationId=\{jobId/,
    );
  });

  it('the cron still reads the flag it always read', () => {
    // If this stops being the retention predicate, the wiring above protects nothing and the
    // reason for all of it is gone.
    expect(read(CRON)).toMatch(/\.is\('saved_to_moodboard_at', null\)/);
  });
});
