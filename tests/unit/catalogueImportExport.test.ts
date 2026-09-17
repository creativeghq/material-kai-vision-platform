import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { blankComments } from '../helpers/stripComments';
import { parseCsv } from '../../src/utils/csv';
import { toCsv } from '../../supabase/functions/_shared/serialize.ts';

const read = (p: string) => blankComments(
  readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n'),
);

describe('one CSV reader, not one per feature', () => {
  it('the real-estate importer uses the shared util rather than its own copy', () => {
    const dialog = read('src/modules/real-estate/components/ImportListingsDialog.tsx');
    expect(dialog).toMatch(/from '@\/utils\/csv'/);
    expect(dialog, 'a second reader drifts from the first').not.toMatch(/function parseCsv/);
  });

  it('the product importer uses it too', () => {
    expect(read('src/components/Admin/DataImport/CsvImportTab.tsx'))
      .toMatch(/from '@\/utils\/csv'/);
  });

  it('handles the case a naive split gets wrong', () => {
    const rows = parseCsv('name,description\n"Tile, matte","He said ""hi"""\n');
    expect(rows).toEqual([{ name: 'Tile, matte', description: 'He said "hi"' }]);
  });

  it('strips the BOM Excel writes', () => {
    expect(parseCsv('﻿name\nTile\n')).toEqual([{ name: 'Tile' }]);
  });
});

describe('a spreadsheet cannot set what a spreadsheet must not set', () => {
  const tab = read('src/components/Admin/DataImport/CsvImportTab.tsx');

  it('sends an allowlist of columns, never the parsed row', () => {
    expect(tab).toMatch(/for \(const c of COLUMNS\)/);
    expect(tab, 'spreading the parsed row is the mass-assignment shape')
      .not.toMatch(/p_rows:\s*rows\b/);
  });

  it('never offers price or cost as an importable column', () => {
    const cols = tab.match(/const COLUMNS = \[([\s\S]*?)\] as const;/)?.[1] ?? '';
    for (const banned of ['cost', 'price', 'markup', 'workspace_id']) {
      expect(cols.includes(banned), `${banned} must not be importable from a file`).toBe(false);
    }
  });

  it('batches rather than posting an unbounded array', () => {
    expect(tab).toMatch(/BATCH = \d+/);
    expect(tab).toMatch(/i \+= BATCH/);
  });
});

describe('the export says what it withholds', () => {
  const fn = read('supabase/functions/catalog-export/index.ts');

  it('reads through the RPC as the caller, so membership is proved not asserted', () => {
    expect(fn).toMatch(/asUser[\s\S]{0,200}export_catalogue_rows/);
  });

  it('uses the CSV and XML serialisers, never the HTML escaper', () => {
    expect(fn).toMatch(/from '\.\.\/_shared\/serialize\.ts'/);
    expect(fn, 'escapeHtml is a different contract').not.toMatch(/escapeHtml/);
  });

  it('an empty catalogue is reported, not served as an empty file', () => {
    expect(fn).toMatch(/No active products to export/);
  });
});

describe('the reverse mapping actually renames something', () => {
  const fn = read('supabase/functions/catalog-export/index.ts');

  it('keys by OUR column, because the importer stores { partnerField: ourColumn }', () => {
    expect(fn, 'keying by the partner field makes every lookup miss and the feature a no-op')
      .toMatch(/\[partnerField, ourColumn\]\) => \[ourColumn, partnerField\]/);
  });

  it('refuses when the named template cannot be read, rather than shipping our own names', () => {
    expect(fn).toMatch(/Could not read the mapping template/);
    expect(fn).toMatch(/That mapping template does not exist here/);
  });

  it('two columns cannot collapse onto one target', () => {
    expect(fn).toMatch(/taken\.has\(theirs\)/);
  });
});

describe('an import cannot be lost or silently truncated', () => {
  const tab = read('src/components/Admin/DataImport/CsvImportTab.tsx');
  const exp = read('src/components/Admin/DataImport/CatalogExportTab.tsx');

  it('a country that is not a two-letter code is dropped, not sent into a CHECK', () => {
    expect(tab).toMatch(/ISO2\.test\(cc\)/);
    expect(tab, 'a 23514 mid-batch loses the batch while earlier ones are already committed')
      .toMatch(/delete row\.country_of_origin/);
  });

  it('a partial import reports what was already written', () => {
    const catch_ = tab.slice(tab.indexOf('} catch (err) {'));
    expect(catch_, 'discarding the running total hides that 1,500 rows already landed')
      .toMatch(/setResult\(total\)/);
    expect(catch_).toMatch(/stopped partway/i);
  });

  it('the export says when it hit its ceiling instead of shipping a short catalogue', () => {
    expect(exp).toMatch(/count >= MAX/);
    expect(exp).toMatch(/capped at/i);
  });

  it('the export reports the real refusal, not invoke\u2019s generic non-2xx string', () => {
    expect(exp).toMatch(/edgeErrorMessage/);
  });
});

describe('our own export re-imports', () => {
  it('survives a round trip through toCsv and parseCsv', () => {
    const rows = [{
      name: 'Tile 30x30; matte',
      description: 'Says "hello", and a comma',
      sku: 'A,1',
    }];
    const parsed = parseCsv(toCsv(['name', 'description', 'sku'], rows));
    expect(parsed, 'a field containing the delimiter must not split into extra columns')
      .toEqual(rows);
  });

  it('reads a European sheet that uses ; as its separator', () => {
    expect(parseCsv('name;sku\nTile;A1\n')).toEqual([{ name: 'Tile', sku: 'A1' }]);
  });
});
describe('an import tells the truth about what a re-import can match', () => {
  const tab = read('src/components/Admin/DataImport/CsvImportTab.tsx');
  const exp = read('src/components/Admin/DataImport/CatalogExportTab.tsx');

  it('carries the unkeyed count the RPC returns', () => {
    expect(tab, 'a row with no sku is inserted again by every import')
      .toMatch(/total\.unkeyed \+= got\?\.unkeyed \?\? 0;/);
  });

  it('promises a matching re-import only on the branch where every row was keyed', () => {
    const caught = tab.slice(tab.indexOf('} catch (err) {'));
    expect(caught, 'told to a sheet with no sku column, that promise is false')
      .toMatch(/total\.unkeyed > 0[\s\S]{0,400}:\s*'Re-importing the same file updates those/);
  });

  it('the export says how many products it is leaving behind', () => {
    expect(exp, 'an operator who just imported 400 drafts otherwise downloads an empty file')
      .toMatch(/counts\.held/);
    expect(exp).toMatch(/\.neq\('status', 'active'\)/);
  });
});

describe('a certificate reads the same on screen and on paper', () => {
  it('the datasheet button sends the operator calendar day', () => {
    const btn = read('src/components/features/products/ProductDatasheetButton.tsx');
    expect(btn, 'without it the PDF dates certificates by the database UTC day')
      .toMatch(/today: todayLocalISO\(\)/);
  });

  it('the PDF passes it to the RPC, and refuses a string that is not a date', () => {
    const fn = read('supabase/functions/product-datasheet-pdf/index.ts');
    expect(fn).toMatch(/p_today: today/);
    expect(fn, 'a malformed value fails the whole render in the date cast')
      .toMatch(/ISO_DATE\.test\(body\.today/);
  });
});
