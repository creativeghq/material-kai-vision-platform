import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  MAX_PROSE_LINES, contentOf, findOverBudget, isDirective, isGeneratedFile,
  proseLineCount, collapseContent, renderComment, walkRepo,
} from '../../scripts/lib/commentBudget.mjs';

const ROOT = resolve(__dirname, '../..');

/**
 * A comment says what the code IS. The narrative of how it got that way belongs in the commit
 * message, the issue, or docs/ — not in every context window that ever loads the file.
 *
 * ESLint enforces this for src/ and api/; it is configured to ignore supabase/, scripts/ and
 * tests/, which is where the longest comments in the platform actually lived. This test is the
 * half that covers those, and it reads the same predicate the rule and the codemod read.
 */
describe('comment budget', () => {
  describe('the predicate', () => {
    const prose = (raw: string, kind: 'line' | 'block' = 'block') =>
      proseLineCount(contentOf(raw, kind));

    it('counts prose lines, not the delimiters around them', () => {
      expect(prose('/**\n * one\n * two\n */')).toBe(2);
      expect(prose('/** one */')).toBe(1);
    });

    it('does not count blank lines or @tag lines', () => {
      const raw = '/**\n * Summary.\n *\n * @param a first\n * @param b second\n * @returns x\n */';
      expect(prose(raw)).toBe(1);
    });

    it('does not count a @tag description that wraps onto the next line', () => {
      const raw = '/**\n * Summary.\n * @param a a very long description that\n *   wraps onto another line\n */';
      expect(prose(raw)).toBe(1);
    });

    it('treats a run of // lines as ONE comment', () => {
      const raw = ['// one', '// two', '// three'].join('\n');
      expect(prose(raw, 'line')).toBe(3);
    });

    it('exempts tooling directives, which are not prose', () => {
      expect(isDirective('/* eslint-disable no-console */')).toBe(true);
      expect(isDirective('// @ts-expect-error legacy shape')).toBe(true);
      expect(isDirective('/** Ordinary documentation. */')).toBe(false);
    });

    it('does not mistake a // inside a string or template literal for a comment', () => {
      const src = [
        'const a = "https://example.com/one/two";',
        'const b = `',
        '// not a comment',
        '// nor this',
        '// nor this',
        '// nor this',
        '// nor this',
        '// nor this',
        '// nor this',
        '`;',
      ].join('\n');
      expect(findOverBudget(src)).toHaveLength(0);
    });

    it('does not mistake a / inside a regex literal for a comment', () => {
      const src = 'const re = /https:\\/\\/[a-z]+/g;\nexport { re };';
      expect(findOverBudget(src)).toHaveLength(0);
    });

    it('flags a comment over the budget and reports its size', () => {
      const raw = `/**\n${Array.from({ length: MAX_PROSE_LINES + 2 }, (_, i) => ` * line ${i}`).join('\n')}\n */`;
      const found = findOverBudget(`${raw}\nexport const x = 1;`);
      expect(found).toHaveLength(1);
      expect(found[0].prose).toBe(MAX_PROSE_LINES + 2);
    });
  });

  describe('the codemod keeps what a reader needs', () => {
    it('keeps the opening paragraph and every @tag, and drops the essay', () => {
      const raw = [
        '/**', ' * What this is.', ' *', ' * Why it came to be, at length.',
        ' * And more of the same.', ' * @param a first', ' */',
      ].join('\n');
      const { head, tags } = collapseContent(contentOf(raw, 'block'), MAX_PROSE_LINES);
      expect(head).toEqual(['What this is.']);
      expect(tags).toEqual(['@param a first']);
    });

    it('renders a one-line summary as a one-line comment', () => {
      const out = renderComment({ head: ['What this is.'], tags: [] }, {
        kind: 'block', indent: '', jsdoc: true,
      });
      expect(out).toBe('/** What this is. */');
    });

    it('leaves a comment that is already within budget alone', () => {
      const src = '/** Fine. */\nexport const x = 1;\n';
      expect(findOverBudget(src)).toHaveLength(0);
    });

    it('cuts at a sentence that ENDS, not at a colon or a line break', () => {
      const content = [
        'One. Two ends here.', 'Three runs on and on and on', 'and on and on and on',
        'and on and on and on', 'and on and on and on', 'and on and on and on',
        'and on and on and on', 'and finally stops.',
      ];
      const { head } = collapseContent(content, MAX_PROSE_LINES);
      expect(head.join(' ')).toBe('One. Two ends here.');
    });

    it('keeps the budget rather than inventing one when nothing ends in the window', () => {
      const content = Array.from({ length: 9 }, () => 'no terminator here');
      const { head } = collapseContent(content, MAX_PROSE_LINES);
      expect(head).toHaveLength(MAX_PROSE_LINES);
    });

    it('keeps the `//:` marker, which documents the declaration below it', () => {
      const out = renderComment({ head: ['What this is.'], tags: [] }, {
        kind: 'line', indent: '', marker: '//:',
      });
      expect(out).toBe('//: What this is.');
    });

    it('reads `//:` as a marker, so its separator line still ends the paragraph', () => {
      const raw = ['//: First para.', '//:', '//: Second para.'].join('\n');
      const { head } = collapseContent(contentOf(raw, 'line'), MAX_PROSE_LINES);
      expect(head).toEqual(['First para.']);
    });
  });

  describe('JSX, which a lexer cannot see on its own', () => {
    it('does not read rendered text beginning // as a comment', () => {
      const src = ['export const A = () => (', '  <pre>', ...Array.from(
        { length: 8 }, (_, i) => `// rendered line ${i}`,
      ), '  </pre>', ');'].join('\n');
      expect(findOverBudget(src, 'a.tsx')).toHaveLength(0);
    });

    it('still catches an essay inside {/* … */}, which opens after a brace', () => {
      const src = ['export const C = () => (', '  <div>', '    {/*', ...Array.from(
        { length: 8 }, (_, i) => `      line ${i}`,
      ), '    */}', '  </div>', ');'].join('\n');
      expect(findOverBudget(src, 'c.tsx')).toHaveLength(1);
    });

    it('still catches a comment alone in an empty block', () => {
      const src = `function f() {\n${Array.from({ length: 8 }, (_, i) => `  // line ${i}`).join('\n')}\n}`;
      expect(findOverBudget(src, 'e.ts')).toHaveLength(1);
    });
  });

  describe('the platform', () => {
    it('has no comment over the budget, in any runtime', async () => {
      const files = await walkRepo(ROOT);
      expect(files.length).toBeGreaterThan(1500);

      const offenders: string[] = [];
      for (const file of files) {
        const rel = relative(ROOT, file).split('\\').join('/');
        const src = readFileSync(file, 'utf8');
        if (isGeneratedFile(rel, src)) continue;
        for (const o of findOverBudget(src, rel)) offenders.push(`${rel}:${o.line} (${o.prose} prose lines)`);
      }

      expect(
        offenders,
        `${offenders.length} comment(s) over ${MAX_PROSE_LINES} prose lines. Run \`npm run comments:trim\`.`,
      ).toEqual([]);
    });
  });

  describe('the enforcement itself', () => {
    it('registers the ESLint rule, which is what covers src/ in the editor', () => {
      const config = readFileSync(resolve(ROOT, 'eslint.config.js'), 'utf8');
      expect(config).toContain("from './scripts/eslint-rules/no-essay-comments.mjs'");
      const enabled = config.match(/'local\/no-essay-comments': 'error'/g) ?? [];
      expect(enabled.length, 'the rule must be on for BOTH the TS and the JS config blocks').toBe(2);
    });

    it('keeps the budget in ONE module, so the rule and the codemod cannot disagree', async () => {
      const files = await walkRepo(ROOT);
      const declarers = files.filter((f) => {
        const rel = relative(ROOT, f).split('\\').join('/');
        if (rel === 'scripts/lib/commentBudget.mjs') return false;
        return /MAX_PROSE_LINES\s*=/.test(readFileSync(f, 'utf8'));
      });
      expect(declarers, 'a second copy of the budget has appeared').toEqual([]);
    });
  });
});
