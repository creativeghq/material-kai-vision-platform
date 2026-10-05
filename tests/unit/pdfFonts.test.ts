import { describe, it, expect } from 'vitest';
import { sourceIndex, strippedSource, posix } from '../helpers/sourceIndex';

const FONT_HELPER = 'supabase/functions/_shared/fonts/open-sans.ts';
const EDGE = sourceIndex({ roots: ['supabase/functions'] });

// pdf-lib's standard-14 fonts are WinAnsi: Greek throws `WinAnsi cannot encode "Σ"`.
describe('generated PDFs embed the shared Unicode font', () => {
  it('no edge function embeds a standard-14 font', () => {
    const offenders = EDGE.stripped()
      .filter(([, src]) => /\bStandardFonts\b/.test(src))
      .map(([f]) => posix(f));
    expect(offenders, 'use embedOpenSans() from _shared/fonts/open-sans.ts').toEqual([]);
  });

  it('only the font helper embeds a font or loads a TTF', () => {
    const offenders = EDGE.stripped()
      .filter(([f, src]) => posix(f) !== FONT_HELPER
        && (/\.embedFont\(|\.registerFontkit\(|\.ttf\b/.test(src)))
      .map(([f]) => posix(f));
    expect(offenders, 'a private font loader is a second copy the next fix will miss').toEqual([]);
  });

  it('the font is pinned to a commit and verified by hash, with no fallback', () => {
    const src = strippedSource(FONT_HELPER);
    expect(src).toMatch(/const OPEN_SANS_COMMIT = '[0-9a-f]{40}'/);
    expect(src).not.toMatch(/@main\b|\/main\//);
    expect(src.match(/sha256: '[0-9a-f]{64}'/g) ?? []).toHaveLength(2);
    expect(src).toContain('throw new PdfFontUnavailable(');
  });
});
