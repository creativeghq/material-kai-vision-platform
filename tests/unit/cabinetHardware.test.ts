/** One hardware system per design: the picker, the tool and the prompt read one vocabulary. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CABINET_HARDWARE, CABINET_HARDWARE_OPTIONS } from '@/config/cabinetHardware';
import { TOOL_MANIFEST_BY_NAME } from '@/components/features/ai/toolManifest.generated';
import { stripComments } from '../helpers/stripComments';

const read = (p: string) => stripComments(readFileSync(p, 'utf8'));

describe('cabinet hardware', () => {
  it('generate_3d offers exactly the vocabulary, as an enum', () => {
    const param = TOOL_MANIFEST_BY_NAME['generate_3d']?.params.find((p) => p.name === 'cabinetHardware');
    expect(param?.type).toBe('enum');
    expect(param?.enum).toEqual([...CABINET_HARDWARE]);
  });

  it('every option has a Title Case label and a render description', () => {
    for (const v of CABINET_HARDWARE) {
      expect(CABINET_HARDWARE_OPTIONS[v].label).toMatch(/^[A-Z][\w-]*( [A-Z][\w-]*)*$/);
      expect(CABINET_HARDWARE_OPTIONS[v].render.length).toBeGreaterThan(30);
    }
  });

  it('the design modal lists the vocabulary, never its own copy', () => {
    const modal = read('src/components/features/ai/VirtualStagingModal.tsx');
    expect(modal).toMatch(/\[null, \.\.\.CABINET_HARDWARE\]\.map/);
  });

  it('the tool appends the DB clause rather than restating hardware in code', () => {
    const tools = read('supabase/functions/_shared/tools/generation-tools.ts');
    expect(tools).toContain("loadPrompt(supabase, 'tool', 'interior_hardware_clause')");
    expect(tools).toMatch(/const prompt = await withCabinetHardware\(rawPrompt, cabinetHardware\)/);
  });
});
