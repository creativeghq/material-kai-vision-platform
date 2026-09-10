/** Saving a generated design to a moodboard KEEPS it (#378 N7). */
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
