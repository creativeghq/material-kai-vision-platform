// The XSD is gitignored, so a guard that only read it would be inert in CI. Same shape as
// gen-mydata-exemption-grounds.mjs. Run: npm run mydata:invoice-types
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SPEC = join(
  process.cwd(), 'src', 'modules', 'myaade', 'AadeSpec', 'xsd', 'SimpleTypes-v2.0.1.xsd',
);
const OUT = join(process.cwd(), 'src', 'lib', 'mydataInvoiceTypes.generated.json');

if (!existsSync(SPEC)) {
  console.error(`No spec at ${SPEC}. This file is gitignored — fetch it from AADE before regenerating.`);
  process.exit(1);
}

export function readInvoiceTypes(xsd) {
  const at = xsd.indexOf('InvoiceType');
  if (at < 0) throw new Error('InvoiceType not found in the XSD');
  const block = xsd.slice(at, at + 12_000);
  const end = block.indexOf('</xs:restriction>');
  if (end < 0) throw new Error('InvoiceType restriction is not closed within the window');
  return [...block.slice(0, end).matchAll(/<xs:enumeration value="([0-9.]+)"/g)].map((m) => m[1]);
}

const codes = readInvoiceTypes(readFileSync(SPEC, 'utf8'));
if (codes.length < 40) throw new Error(`only ${codes.length} codes parsed — the XSD shape changed`);

const families = [...new Set(codes.map((c) => c.split('.')[0]))]
  .sort((a, b) => Number(a) - Number(b));

writeFileSync(OUT, `${JSON.stringify({
  source: 'src/modules/myaade/AadeSpec/xsd/SimpleTypes-v2.0.1.xsd',
  codes,
  families,
}, null, 2)}\n`);

console.log(`✎ wrote ${OUT} — ${codes.length} codes across ${families.length} families`);
