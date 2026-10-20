/** Print (→ PDF) and Excel renderings of the income/expense book. Every figure comes from the RPC; nothing is re-summed here. */
import { escapeHtml } from '@/utils/escapeHtml';
import type { BookDirection, BookFigures, BookSide, IncomeExpenseBook } from '@/modules/finance/services/incomeExpenseBookService';

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

const figureCells = (side: BookSide, f: BookFigures, withheld: boolean) =>
  [
    bookAmount(f.total),
    bookAmount(f.net),
    ...side.columns.map((c) => bookAmount(f.cols?.[c.key], true)),
    bookAmount(f.vat),
    ...(withheld ? [bookAmount(f.withheld)] : []),
  ];

/** One direction of the book as an HTML table, in the accountant's layout. */
function sideTable(book: IncomeExpenseBook, dir: BookDirection): string {
  const side = book[dir];
  const withheld = dir === 'income';
  const cell = (v: string, cls = '') => `<td class="${cls}">${escapeHtml(v)}</td>`;
  const nums = (vals: string[]) => vals.map((v) => cell(v, 'r')).join('');
  const span = 3;

  const head = '<tr><th>Ημερομηνία<br><span>Date</span></th><th>Παραστατικό<br><span>Document</span></th>'
    + '<th>Αιτιολογία<br><span>Counterparty</span></th><th class="r">Συνολική Αξία<br><span>Total</span></th>'
    + '<th class="r">Καθαρή Αξία<br><span>Net</span></th>'
    + side.columns.map((c) => `<th class="r">${escapeHtml(c.label_el)}<br><span>${escapeHtml(c.label)}</span></th>`).join('')
    + '<th class="r">Φ.Π.Α.<br><span>VAT</span></th>'
    + (withheld ? '<th class="r">Παρακρατ.<br><span>Withheld</span></th>' : '')
    + '</tr>';

  const body = side.months.map((m, i) => {
    const carriedIn = i > 0 ? side.months[i - 1].carried : null;
    const rows = m.rows.map((r) => `<tr>${cell(bookDate(r.issue_date))}${cell(r.number ?? '')}${cell(r.party)}`
      + `${nums(figureCells(side, r, withheld))}</tr>`).join('');
    return (carriedIn ? `<tr class="carry"><td colspan="${span}">Εκ μεταφοράς · Brought forward</td>${nums(figureCells(side, carriedIn, withheld))}</tr>` : '')
      + rows
      + `<tr class="sub"><td colspan="${span}">Σύνολο Μηνός ${escapeHtml(bookMonthName(m.month, 'el'))} · ${escapeHtml(bookMonthName(m.month, 'en'))}</td>${nums(figureCells(side, m.totals, withheld))}</tr>`;
  }).join('');

  const grand = `<tr class="grand"><td colspan="${span}">Σύνολο Περιόδου · Period total</td>${nums(figureCells(side, side.totals, withheld))}</tr>`;

  return `<h2>${escapeHtml(BOOK_TITLE[dir].el.toUpperCase())} ΑΠΟ ${escapeHtml(bookDate(book.from))} ΕΩΣ ${escapeHtml(bookDate(book.to))}`
    + ` <span>· ${escapeHtml(BOOK_TITLE[dir].en)}</span></h2>`
    + `<table><thead>${head}</thead><tbody>${body}${grand}</tbody></table>`;
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

/** XML text/attribute content. Excel's SpreadsheetML is XML, not HTML: a separate contract. */
function xmlText(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** Excel 2003 XML workbook: one sheet per direction, real numbers (not text), subtotal rows styled. */
export function buildBookSpreadsheetXml(book: IncomeExpenseBook, dirs: BookDirection[]): string {
  const str = (v: string, style = '') => `<Cell${style ? ` ss:StyleID="${style}"` : ''}><Data ss:Type="String">${xmlText(v)}</Data></Cell>`;
  const numCell = (v: number | null | undefined, style = 'n', blankZero = false) =>
    v == null || (blankZero && Math.abs(Number(v)) < 0.005)
      ? `<Cell ss:StyleID="${style}"/>`
      : `<Cell ss:StyleID="${style}"><Data ss:Type="Number">${Number(v)}</Data></Cell>`;

  const sheet = (dir: BookDirection) => {
    const side = book[dir];
    const withheld = dir === 'income';
    const figs = (f: BookFigures, style: string) =>
      numCell(f.total, style) + numCell(f.net, style)
      + side.columns.map((c) => numCell(f.cols?.[c.key], style, true)).join('')
      + numCell(f.vat, style) + (withheld ? numCell(f.withheld, style) : '');
    const header = `<Row>${['Ημερομηνία', 'Παραστατικό', 'Αιτιολογία', 'ΑΦΜ', 'Συνολική Αξία', 'Καθαρή Αξία',
      ...side.columns.map((c) => c.label_el), 'Φ.Π.Α.', ...(withheld ? ['Παρακρατ.'] : []), 'ΜΑΡΚ']
      .map((h) => str(h, 'h')).join('')}</Row>`;
    const rows = side.months.map((m) =>
      m.rows.map((r) => `<Row>${str(bookDate(r.issue_date))}${str(r.number ?? '')}${str(r.party)}${str(r.party_vat ?? '')}${figs(r, 'n')}${str(r.mark)}</Row>`).join('')
      + `<Row>${str(`Σύνολο Μηνός ${bookMonthName(m.month, 'el')}`, 's')}${str('', 's')}${str('', 's')}${str('', 's')}${figs(m.totals, 'sn')}</Row>`
      + `<Row>${str('Σε μεταφορά', 'c')}${str('', 'c')}${str('', 'c')}${str('', 'c')}${figs(m.carried, 'cn')}</Row>`).join('');
    const grand = `<Row>${str('Σύνολο Περιόδου', 's')}${str('', 's')}${str('', 's')}${str('', 's')}${figs(side.totals, 'sn')}</Row>`;
    return `<Worksheet ss:Name="${xmlText(BOOK_TITLE[dir].el)}"><Table>${header}${rows}${grand}</Table></Worksheet>`;
  };

  return '<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>'
    + '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">'
    + '<Styles><Style ss:ID="h"><Font ss:Bold="1"/></Style>'
    + '<Style ss:ID="n"><NumberFormat ss:Format="#,##0.00"/></Style>'
    + '<Style ss:ID="s"><Font ss:Bold="1"/></Style><Style ss:ID="sn"><Font ss:Bold="1"/><NumberFormat ss:Format="#,##0.00"/></Style>'
    + '<Style ss:ID="c"><Font ss:Italic="1"/></Style><Style ss:ID="cn"><Font ss:Italic="1"/><NumberFormat ss:Format="#,##0.00"/></Style>'
    + `</Styles>${dirs.map(sheet).join('')}</Workbook>`;
}

export function downloadBlob(content: string, type: string, filename: string): void {
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
