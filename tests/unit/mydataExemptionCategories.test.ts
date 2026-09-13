/**
 * The VAT-exemption ground is a legal citation printed on the παραστατικό and transmitted to
 * AADE. ν.2859/2000 was replaced by ν.5144/2024 and 26 of the 31 articles were renumbered, so
 * this pins every entry against §8.3 of the committed spec PDF rather than against review.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MYDATA_EXEMPTION_CATEGORIES } from '@/lib/mydataExemptionCategories';

const SPEC = join(
  __dirname, '..', '..', 'src', 'modules', 'myaade', 'AadeSpec', 'v2.0.2', 'ERP_v2.0.2.pdf',
);

/** Whitespace and the space AADE leaves before a full stop ("άρθρο 32 .1.γ."). */
const norm = (s: string) => s.replace(/\s+/g, ' ').replace(/\s+(?=[.,])/g, '').trim();

/**
 * §8.3 is a three-column table: code, the struck-through ν.2859/2000 ground, and the
 * ν.5144/2024 ground we cite. The columns are read by x band because both cells share a
 * baseline, and the code digit is vertically CENTRED in its row — so it cannot delimit rows.
 * Rows are delimited instead by the opening phrase of the ν.5144/2024 cell, and codes are
 * assigned by position, which is what makes a rotated table (#453 part 2) visible.
 */
// Left edge of the ν.5144/2024 cells. The HEADER of that column starts further right
// (x 347) than its cells do (x 301), so the boundary is taken from the cells.
const NEW_COLUMN_X = 297;
const OPENERS = ['Χωρίς ΦΠΑ', 'ΦΠΑ εμπεριεχόμενος', 'Λοιπές Εξαιρέσεις'];

/**
 * Join one cell's fragments. A space goes in only where there is a horizontal GAP: ΑΑΔΕ's
 * PDF splits mid-word too ("Φ" + "ΠΑ εμπεριεχόμενος" on code 21), so joining on ' ' invents a
 * word break and joining on '' deletes a real one.
 */
function joinRun(run: { x: number; w: number; s: string }[]): string {
  let out = '';
  let end = -Infinity;
  for (const it of run.sort((a, b) => a.x - b.x)) {
    if (out && it.x - end > 1) out += ' ';
    out += it.s;
    end = it.x + it.w;
  }
  return out;
}

async function section83Cells(): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(SPEC)), useSystemFonts: false,
  }).promise;
  const cells: string[] = [];
  let inTable = false;
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    const items = (content.items as { str: string; width?: number; transform: number[] }[])
      .filter((i) => i.str.trim());
    // Anchor on the table's own header cell, not on the §8.3 heading — the heading also
    // appears in the table of contents, and entering there yields an empty parse.
    if (!inTable && !items.some((i) => i.str.includes('5144/2024'))) continue;
    const byY = new Map<number, { x: number; w: number; s: string }[]>();
    for (const it of items) {
      const y = Math.round(it.transform[5]);
      if (!byY.has(y)) byY.set(y, []);
      byY.get(y)!.push({ x: it.transform[4], w: it.width ?? 0, s: it.str });
    }
    const ys = [...byY.keys()].sort((a, b) => b - a);
    for (const y of ys) {
      const row = byY.get(y)!.sort((a, b) => a.x - b.x);
      if (!inTable) {
        if (row.some((w) => w.s.includes('5144/2024'))) inTable = true;
        continue;
      }
      const text = norm(joinRun(row.filter((w) => w.x >= NEW_COLUMN_X)));
      // The running header, the column header and the page number all sit in this band.
      if (!text || text.startsWith('Αιτία Εξαίρεσης') || /^\d{1,3}$/.test(text)) continue;
      if (OPENERS.some((o) => text.startsWith(o))) cells.push(text);
      else if (cells.length) cells[cells.length - 1] = norm(`${cells[cells.length - 1]} ${text}`);
      if (cells.length === 31 && /\(IOSS\)$/.test(cells[30])) return cells;
    }
  }
  return cells;
}

describe('myDATA §8.3 — the exemption ground cites ν.5144/2024 (#453)', () => {
  let spec: string[];
  beforeAll(async () => { spec = await section83Cells(); }, 60_000);

  it('the spec table parsed as 31 rows', () => {
    expect(
      spec.length,
      'The §8.3 parse did not yield 31 grounds. Check the table shape in ' +
        'src/modules/myaade/AadeSpec/v2.0.2/ERP_v2.0.2.pdf before touching the citations.',
    ).toBe(31);
  });

  it('we declare exactly codes 1-31, once each, in order', () => {
    expect(MYDATA_EXEMPTION_CATEGORIES.map((c) => c.code)).toEqual(
      Array.from({ length: 31 }, (_, i) => i + 1),
    );
  });

  it.each(Array.from({ length: 31 }, (_, i) => i + 1))(
    'code %i prints the ν.5144/2024 ground ΑΑΔΕ publishes, verbatim',
    (code) => {
      const ours = MYDATA_EXEMPTION_CATEGORIES.find((c) => c.code === code)!;
      expect(
        norm(ours.labelEl),
        `Code ${code} is printed on a legal document and transmitted to ΑΑΔΕ. The citation must ` +
          'be §8.3 column "Αιτία Εξαίρεσης (ν. 5144/2024)" of ' +
          'src/modules/myaade/AadeSpec/v2.0.2/ERP_v2.0.2.pdf. ν.2859/2000 is repealed.',
      ).toBe(spec[code - 1]);
    },
  );

  it.each(Array.from({ length: 31 }, (_, i) => i + 1))(
    'code %i English label cites the same article as the Greek',
    (code) => {
      const ours = MYDATA_EXEMPTION_CATEGORIES.find((c) => c.code === code)!;
      // Code 1 is "άρθρο 2 και 3" / "arts. 2 & 3" — one citation either side, different shapes.
      if (code === 1) { expect(ours.label).toContain('2 & 3'); return; }
      const strip = (v: string) => v.replace(/[^\d.γ]/g, '').replace(/\.$/, '');
      const el = [...ours.labelEl.matchAll(/άρθρ[οα]\s*([\d][^\s]*)/g)].map((m) => strip(m[1]));
      const en = [...ours.label.matchAll(/arts?\.\s*([\d][^\s]*)/g)].map((m) => strip(m[1]));
      expect(en, `Code ${code}: the English and Greek grounds cite different articles.`).toEqual(el);
    },
  );

  it('the three OSS regimes are not rotated', () => {
    // CLAUDE.md §1c records this shape for the myDATA payment codes: two self-consistent
    // rotations of one table at once, every value valid, nothing raising.
    const by = (c: number) => MYDATA_EXEMPTION_CATEGORIES.find((x) => x.code === c)!;
    expect(by(29).labelEl).toContain('OSS_μη ενωσιακό');
    expect(by(29).label).toContain('non-union');
    expect(by(30).labelEl).toContain('(OSS_ενωσιακό');
    expect(by(30).label).toContain('union scheme');
    expect(by(30).label).not.toContain('non-union');
    expect(by(31).labelEl).toContain('IOSS');
    expect(by(31).label).toContain('IOSS');
  });

  it('the Deno mirror carries every ground', () => {
    const mirror = readFileSync(
      join(__dirname, '..', '..', 'supabase', 'functions', '_shared', 'finance', 'vat-exemptions.ts'),
      'utf8',
    );
    for (const c of MYDATA_EXEMPTION_CATEGORIES) {
      expect(
        mirror.includes(c.labelEl),
        `_shared/finance/vat-exemptions.ts is missing the ground for code ${c.code}. ` +
          'Run `npm run finance:mirror`; never hand-edit the mirror.',
      ).toBe(true);
    }
  });
});
