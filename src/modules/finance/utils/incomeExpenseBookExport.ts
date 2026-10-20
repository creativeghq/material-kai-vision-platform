/** Screen, print (→ PDF) and Excel renderings of the income/expense book. Every figure comes from the RPC; nothing is re-summed here. */
import { escapeHtml } from '@/utils/escapeHtml';
import type {
  BookDirection,
  BookFigures,
  BookMonth,
  BookRow,
  BookSide,
  IncomeExpenseBook,
} from '@/modules/finance/services/incomeExpenseBookService';

export const BOOK_TITLE: Record<BookDirection, { en: string; el: string }> = {
  income: { en: 'Income', el: 'Έσοδα' },
  expense: { en: 'Expenses', el: 'Έξοδα' },
};

const GR_NUMBER = new Intl.NumberFormat('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The accountant's convention: 1.234,56, and a category the row does not touch stays blank. */
export function bookAmount(v: number | null | undefined, blankZero = false): string {
  if (v == null || Number.isNaN(Number(v))) return '';
  if (blankZero && Math.abs(Number(v)) < 0.005) return '';
  return GR_NUMBER.format(Number(v));
}

export function bookDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

const MONTHS_EL = ['Ιανουαρίου', 'Φεβρουαρίου', 'Μαρτίου', 'Απριλίου', 'Μαΐου', 'Ιουνίου', 'Ιουλίου',
  'Αυγούστου', 'Σεπτεμβρίου', 'Οκτωβρίου', 'Νοεμβρίου', 'Δεκεμβρίου'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December'];

export function bookMonthName(iso: string, lang: 'en' | 'el'): string {
  const i = Number(iso.slice(5, 7)) - 1;
  return `${(lang === 'el' ? MONTHS_EL : MONTHS_EN)[i]} ${iso.slice(0, 4)}`;
}

export type BookLine =
  | { kind: 'carry'; figures: BookFigures }
  | { kind: 'doc'; row: BookRow }
  | { kind: 'month'; month: BookMonth }
  | { kind: 'grand'; figures: BookFigures & { docs: number } };

/** The one sequence every rendering walks, so screen, PDF and Excel agree row for row. */
export function bookLines(side: BookSide): BookLine[] {
  const out: BookLine[] = [];
  side.months.forEach((m, i) => {
    if (i > 0 && m.rows.length > 0) out.push({ kind: 'carry', figures: side.months[i - 1].carried });
    for (const row of m.rows) out.push({ kind: 'doc', row });
    out.push({ kind: 'month', month: m });
  });
  out.push({ kind: 'grand', figures: side.totals });
  return out;
}

export interface BookCell {
  key: string;
  value: number | null;
  blankZero: boolean;
}

/** The money cells of one line, in column order. */
export function bookFigureCells(side: BookSide, f: BookFigures, withheld: boolean): BookCell[] {
  return [
    { key: 'total', value: f.total, blankZero: false },
    { key: 'net', value: f.net, blankZero: false },
    ...side.columns.map((c) => ({ key: c.key, value: f.cols?.[c.key] ?? null, blankZero: true })),
    { key: 'vat', value: f.vat, blankZero: false },
    ...(withheld ? [{ key: 'withheld', value: f.withheld, blankZero: false }] : []),
  ];
}

const lineFigures = (l: BookLine): BookFigures =>
  l.kind === 'doc' ? l.row : l.kind === 'month' ? l.month.totals : l.figures;

const lineLabel = (l: BookLine): string[] => {
  if (l.kind === 'doc') return [bookDate(l.row.issue_date), l.row.number ?? '', l.row.party];
  if (l.kind === 'carry') return ['Εκ μεταφοράς · Brought forward', '', ''];
  if (l.kind === 'month') {
    return [`Σύνολο Μηνός ${bookMonthName(l.month.month, 'el')} · ${bookMonthName(l.month.month, 'en')}`, '', ''];
  }
  return ['Σύνολο Περιόδου · Period total', '', ''];
};

const LINE_CLASS: Record<BookLine['kind'], string> = { carry: 'carry', doc: '', month: 'sub', grand: 'grand' };

function sideTable(book: IncomeExpenseBook, dir: BookDirection): string {
  const side = book[dir];
  const withheld = dir === 'income';
  const head = '<tr><th>Ημερομηνία<br><span>Date</span></th><th>Παραστατικό<br><span>Document</span></th>'
    + '<th>Αιτιολογία<br><span>Counterparty</span></th><th class="r">Συνολική Αξία<br><span>Total</span></th>'
    + '<th class="r">Καθαρή Αξία<br><span>Net</span></th>'
    + side.columns.map((c) => `<th class="r">${escapeHtml(c.label_el)}<br><span>${escapeHtml(c.label)}</span></th>`).join('')
    + '<th class="r">Φ.Π.Α.<br><span>VAT</span></th>'
    + (withheld ? '<th class="r">Παρακρατ.<br><span>Withheld</span></th>' : '')
    + '</tr>';

  const body = bookLines(side).map((l) => {
    const label = lineLabel(l);
    const lead = l.kind === 'doc'
      ? label.map((v) => `<td>${escapeHtml(v)}</td>`).join('')
      : `<td colspan="3">${escapeHtml(label[0])}</td>`;
    const nums = bookFigureCells(side, lineFigures(l), withheld)
      .map((c) => `<td class="r">${escapeHtml(bookAmount(c.value, c.blankZero))}</td>`).join('');
    return `<tr class="${LINE_CLASS[l.kind]}">${lead}${nums}</tr>`;
  }).join('');

  return `<h2>${escapeHtml(BOOK_TITLE[dir].el.toUpperCase())} ΑΠΟ ${escapeHtml(bookDate(book.from))} ΕΩΣ ${escapeHtml(bookDate(book.to))}`
    + ` <span>· ${escapeHtml(BOOK_TITLE[dir].en)}</span></h2>`
    + `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

/** A self-contained, print-ready page. The browser's "Save as PDF" renders Greek natively. */
export function buildBookPrintHtml(book: IncomeExpenseBook, dirs: BookDirection[]): string {
  const biz = book.business;
  const who = [biz?.name, biz?.vat ? `ΑΦΜ ${biz.vat}` : null, biz?.tax_office ? `ΔΟΥ ${biz.tax_office}` : null]
    .filter(Boolean).join(' · ');
  return '<!doctype html><html lang="el"><head><meta charset="utf-8">'
    + `<title>${escapeHtml(`Βιβλίο Εσόδων-Εξόδων ${bookDate(book.from)} – ${bookDate(book.to)}`)}</title>`
    + `<style>
      @page{size:A4 landscape;margin:12mm}
      body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;font-size:9px}
      .who{font-size:11px;font-weight:600;margin-bottom:2px}
      .src{color:#555;margin-bottom:10px}
      h2{font-size:11px;margin:14px 0 6px} h2 span{font-weight:400;color:#555}
      section{page-break-after:always} section:last-child{page-break-after:auto}
      table{width:100%;border-collapse:collapse;table-layout:auto}
      thead{display:table-header-group}
      th{font-weight:600;text-align:left;border-bottom:1px solid #111;padding:3px 4px;vertical-align:bottom}
      th span{font-weight:400;color:#666}
      td{padding:2px 4px;border-bottom:1px solid #e5e5e5;white-space:nowrap}
      td:nth-child(3){white-space:normal;max-width:240px}
      .r{text-align:right;font-variant-numeric:tabular-nums}
      tr.sub td{font-weight:600;border-top:1px solid #111;border-bottom:1px solid #111}
      tr.carry td{color:#444;font-style:italic}
      tr.grand td{font-weight:700;border-top:2px solid #111}
      tr{page-break-inside:avoid}
      .bar{margin-bottom:10px} @media print{.bar{display:none}}
    </style></head><body>`
    + '<div class="bar"><button onclick="window.print()">Print / Save as PDF</button></div>'
    + `<div class="who">${escapeHtml(who || 'Βιβλίο Εσόδων-Εξόδων')}</div>`
    + '<div class="src">Βιβλίο Εσόδων-Εξόδων από τα παραστατικά που τηρεί η ΑΑΔΕ (myDATA), με τον χαρακτηρισμό που έχει υποβάλει ο λογιστής.'
    + ' · Income/expense book from the documents AADE holds, split by the accountant\'s myDATA classification.</div>'
    + dirs.map((d) => `<section>${sideTable(book, d)}</section>`).join('')
    + '</body></html>';
}

/** XML text/attribute content. OOXML is XML, not HTML: a separate contract from escapeHtml. */
function xmlText(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

const colName = (i: number): string => {
  let n = i + 1;
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
};

/** Style ids in xl/styles.xml below. */
const XS = { text: 0, bold: 1, num: 2, boldNum: 3, italic: 4, italicNum: 5 } as const;

function sheetXml(book: IncomeExpenseBook, dir: BookDirection): string {
  const side = book[dir];
  const withheld = dir === 'income';
  const rows: string[] = [];
  const put = (cells: { v: string | number | null; s: number }[]) => {
    const r = rows.length + 1;
    rows.push(`<row r="${r}">${cells.map((c, i) => {
      const ref = `${colName(i)}${r}`;
      if (c.v == null || c.v === '') return `<c r="${ref}" s="${c.s}"/>`;
      return typeof c.v === 'number'
        ? `<c r="${ref}" s="${c.s}"><v>${c.v}</v></c>`
        : `<c r="${ref}" s="${c.s}" t="inlineStr"><is><t xml:space="preserve">${xmlText(c.v)}</t></is></c>`;
    }).join('')}</row>`);
  };

  put(['Ημερομηνία', 'Παραστατικό', 'Αιτιολογία', 'ΑΦΜ', 'Συνολική Αξία', 'Καθαρή Αξία',
    ...side.columns.map((c) => c.label_el), 'Φ.Π.Α.', ...(withheld ? ['Παρακρατ.'] : []), 'ΜΑΡΚ']
    .map((v) => ({ v, s: XS.bold })));

  for (const l of bookLines(side)) {
    const textStyle = l.kind === 'doc' ? XS.text : l.kind === 'carry' ? XS.italic : XS.bold;
    const numStyle = l.kind === 'doc' ? XS.num : l.kind === 'carry' ? XS.italicNum : XS.boldNum;
    const label = lineLabel(l);
    const nums = bookFigureCells(side, lineFigures(l), withheld).map((c) => ({
      v: c.value == null || (c.blankZero && Math.abs(c.value) < 0.005) ? null : Number(c.value),
      s: numStyle,
    }));
    put([
      ...label.map((v) => ({ v, s: textStyle })),
      { v: l.kind === 'doc' ? l.row.party_vat ?? '' : '', s: textStyle },
      ...nums,
      { v: l.kind === 'doc' ? l.row.mark : '', s: textStyle },
    ]);
  }
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    + '<cols><col min="1" max="2" width="14" customWidth="1"/><col min="3" max="3" width="44" customWidth="1"/>'
    + '<col min="4" max="4" width="12" customWidth="1"/></cols>'
    + `<sheetData>${rows.join('')}</sheetData></worksheet>`;
}

const STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>'
  + '<fonts count="3"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font>'
  + '<font><i/><sz val="10"/><name val="Arial"/></font></fonts>'
  + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
  + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="6">'
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
  + '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
  + '<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>'
  + '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
  + '<xf numFmtId="164" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>'
  + '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

const DOS_DATE_1980_01_01 = (1 << 5) | 1;

/** A store-only (uncompressed) zip — all an .xlsx container needs. */
export function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034B50, true);
    local.setUint16(4, 20, true);
    local.setUint16(8, 0, true);
    local.setUint16(12, DOS_DATE_1980_01_01, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, f.data.length, true);
    local.setUint32(22, f.data.length, true);
    local.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(local.buffer), name, f.data);

    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014B50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(14, DOS_DATE_1980_01_01, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, f.data.length, true);
    cen.setUint32(24, f.data.length, true);
    cen.setUint16(28, name.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054B50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(new ArrayBuffer(all.reduce((n, c) => n + c.length, 0)));
  let p = 0;
  for (const c of all) { out.set(c, p); p += c.length; }
  return out;
}

/** A real .xlsx workbook: one sheet per side, numbers as numbers, subtotal rows styled. */
export function buildBookXlsx(book: IncomeExpenseBook, dirs: BookDirection[]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const sheets = dirs.map((d, i) => ({ dir: d, path: `xl/worksheets/sheet${i + 1}.xml` }));
  const files: { name: string; xml: string }[] = [
    {
      name: '[Content_Types].xml',
      xml: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + sheets.map((s) => `<Override PartName="/${s.path}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
        + '</Types>',
    },
    {
      name: '_rels/.rels',
      xml: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        + '</Relationships>',
    },
    {
      name: 'xl/workbook.xml',
      xml: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        + `<sheets>${sheets.map((s, i) => `<sheet name="${xmlText(BOOK_TITLE[s.dir].el)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>`
        + '</workbook>',
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      xml: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
        + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
        + '</Relationships>',
    },
    { name: 'xl/styles.xml', xml: STYLES_XML },
    ...sheets.map((s) => ({ name: s.path, xml: sheetXml(book, s.dir) })),
  ];
  return zipStore(files.map((f) => ({ name: f.name, data: enc.encode(f.xml) })));
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function downloadBlob(content: BlobPart, type: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Opens the print page from a Blob URL, so no markup is ever written into a live document. */
export function openPrintable(html: string): void {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
