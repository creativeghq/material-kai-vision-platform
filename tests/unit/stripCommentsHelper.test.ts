/**
 * Guard: one comment stripper for the guard tests, and it is correct on the two cases the
 * hand-rolled copies were not.
 *
 * This one guards the guards, which is why it is worth having. Thirty test files stripped BLOCK
 * comments before LINE comments; a `//` comment containing `/*` (this repo writes `/api/rag/*`
 * and `image/*` in prose constantly) therefore opened a block that closed hundreds of lines
 * later, and the assertions then ran against source with the middle removed. Nothing failed —
 * the tests passed by having nothing left to object to.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments, blankComments } from '../helpers/stripComments';

describe('the shared comment stripper', () => {
  it('does not treat /* inside a line comment as opening a block', () => {
    const src = [
      '// legacy /api/documents/* endpoints removed — use /api/rag/* instead',
      "const KEEP_ME = 'load-bearing';",
      '/** a real block */',
      'const ALSO_ME = 2;',
    ].join('\n');

    const out = stripComments(src);
    expect(out, 'the line comment swallowed the code beneath it').toContain('KEEP_ME');
    expect(out, 'the code after the real block comment was eaten too').toContain('ALSO_ME');
    expect(out).not.toContain('legacy');
    expect(out).not.toContain('a real block');
  });

  it('does not treat /* inside a string literal as opening a block', () => {
    const src = [
      "const prefix = 'image/*';",
      'const KEEP_ME = 1;',
    ].join('\n');
    const out = stripComments(src);
    expect(out, "a `/*` inside a string opened a comment — no ordering of replaces fixes this")
      .toContain('KEEP_ME');
    expect(out).toContain("'image/*'");
  });

  it('removes both comment kinds', () => {
    const out = stripComments('const a = 1; // trailing\n/* block */ const b = 2;');
    expect(out).not.toContain('trailing');
    expect(out).not.toContain('block');
    expect(out).toContain('const a = 1;');
    expect(out).toContain('const b = 2;');
  });

  it('leaves a URL in code alone', () => {
    const out = stripComments("const u = 'https://example.com/a';");
    expect(out, 'the // in https:// was read as a comment').toContain('https://example.com/a');
  });

  it('blankComments preserves every offset, line and column', () => {
    const src = [
      'const a = 1; // trailing comment',
      '/* a',
      '   multiline',
      '   block */',
      'const b = 2;',
    ].join('\n');

    const out = blankComments(src);
    expect(out, 'blankComments changed the length — offsets no longer line up').toHaveLength(src.length);
    expect(out.split('\n'), 'blankComments changed the line count').toHaveLength(src.split('\n').length);
    expect(out.indexOf('const b')).toBe(src.indexOf('const b'));
    expect(out).not.toContain('trailing');
    expect(out).not.toContain('multiline');
  });
});

describe('no test file hand-rolls its own stripper', () => {
  const DIR = join(__dirname);
  const SELF = 'stripCommentsHelper.test.ts';

  it('every guard test imports the shared one', () => {
    const offenders: string[] = [];

    for (const f of readdirSync(DIR).filter((x) => x.endsWith('.ts'))) {
      if (f === SELF) continue;
      const src = readFileSync(join(DIR, f), 'utf8');
      // The distinctive shape of a hand-rolled block-comment strip.
      if (!src.includes('[\\s\\S]*?\\*\\/')) continue;
      if (src.includes("from '../helpers/stripComments'")) continue;
      offenders.push(f);
    }

    expect(
      offenders,
      'a test file is stripping comments itself again. There were ten copies at several ' +
        'strengths and thirty of them ate real code — import stripComments / blankComments ' +
        'from tests/helpers/stripComments instead:\n  ' + offenders.join('\n  '),
    ).toEqual([]);
  });
});
