import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { blankComments } from '../helpers/stripComments';
import {
  CORE_TARGETS,
  COLUMN_TARGET_FIELDS,
  buildProduct,
  collectProductNodes,
  decodeFeedBytes,
  flattenNode,
  sanitizeTargets,
  type XmlNode,
} from '../../supabase/functions/xml-import-orchestrator/feed';
import { InvalidCronError, nextCronRun } from '../../supabase/functions/scheduled-import-runner/cron';
import { parseLocaleNumber } from '../../supabase/functions/parse-supplier-cost-list/number';

const read = (p: string) => blankComments(
  readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n'),
);

const ORCHESTRATOR = 'supabase/functions/xml-import-orchestrator/index.ts';
const RUNNER = 'supabase/functions/scheduled-import-runner/index.ts';
const MODAL = 'src/components/Admin/DataImport/XMLFieldMappingModal.tsx';
const SCHEDULE_MODAL = 'src/components/Admin/DataImport/ScheduleImportModal.tsx';
const XML_UI = [
  'src/components/Admin/DataImport/XMLImportTab.tsx',
  MODAL,
  'src/components/Admin/DataImport/ImportHistoryTab.tsx',
  SCHEDULE_MODAL,
];

function modalTargets(src: string): string[] {
  const m = src.match(/const CORE_TARGET_FIELDS[^=]*=\s*\[([\s\S]*?)\n\];/);
  if (!m) throw new Error('CORE_TARGET_FIELDS not found');
  return [...m[1].matchAll(/value:\s*'([^']+)'/g)].map((x) => x[1]);
}

const PRODUCT_TAGS = new Set(['product', 'item']);
const attrs = new Set(['color', 'thickness_mm', 'finish']);
const ctx = (mappings: Record<string, string>, manual: Record<string, string> = {}, known: Record<string, string | null> = {}) => ({
  mappings: sanitizeTargets(mappings, attrs),
  manualValues: manual,
  uploadCategory: 'tiles',
  categoryKeyFor: (raw: string) => known[raw] ?? null,
  attributeTargets: attrs,
});

describe('what the mapping UI offers is what the importer resolves', () => {
  it('every target the modal offers is one the importer resolves', () => {
    const offered = modalTargets(read(MODAL));
    expect(offered.filter((t) => !CORE_TARGETS.includes(t))).toEqual([]);
    for (const t of ['material_category', 'price', 'supplier_cost', 'currency', 'unit', 'external_sku', 'mpn', 'barcode']) {
      expect(offered, t).toContain(t);
    }
  });

  it('cost has its own target and is never the published price', () => {
    expect(CORE_TARGETS).toContain('supplier_cost');
    expect(COLUMN_TARGET_FIELDS).toContain('price');
    const built = buildProduct({ cost: '7.10', price: '9.90', name: 'A', brand: 'B' },
      ctx({ cost: 'supplier_cost', price: 'price', name: 'name', brand: 'factory_name' }));
    expect(built.product.supplier_cost).toBe('7.10');
    expect(built.product.price).toBe('9.90');
  });

  it('a target the importer does not know keeps its value as metadata', () => {
    expect(sanitizeTargets({ x: 'cost', y: 'status', z: 'color' }, attrs))
      .toEqual({ x: 'metadata', y: 'metadata', z: 'attr:color' });
  });
});

describe('one product builder for preview and import', () => {
  it('the upload category is the fallback, a registry-resolved row category wins', () => {
    const m = { name: 'name', brand: 'factory_name', cat: 'material_category' };
    const a = buildProduct({ name: 'A', brand: 'B', cat: 'Wall tiles' }, ctx(m, {}, { 'Wall tiles': 'tiles' }));
    const b = buildProduct({ name: 'A', brand: 'B', cat: 'Lamps' }, ctx(m, {}, { Lamps: 'lighting' }));
    const c = buildProduct({ name: 'A', brand: 'B', cat: 'Gibberish' }, ctx(m));
    expect(a.product.material_category).toBe('tiles');
    expect(b.product.material_category).toBe('lighting');
    expect(c.product.material_category).toBe('tiles');
    expect(c.value_sources.material_category).toBe('default');
    expect((c.product.metadata as Record<string, string>).category_unresolved).toBe('Gibberish');
    expect(c.missingRequired).toEqual([]);
  });

  it('a supplier feed is gated on catalog.import OR pricing.manage, schedule included', () => {
    const src = read(ORCHESTRATOR);
    const gate = src.indexOf("userHasWorkspaceCapability(supabase, userId, workspace_id, ['catalog.import', 'pricing.manage'])");
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(src.indexOf("body.action === 'schedule'"));
  });

  it('the preview and the import run the same builder', () => {
    const src = read(ORCHESTRATOR);
    expect(src.match(/buildProduct\(/g)?.length).toBe(2);
    expect(src).not.toMatch(/function extractProductData/);
  });

  it('repeated elements stay arrays and registry fields route by attr target', () => {
    const node: XmlNode = { name: 'A', brand: 'B', color: ['Red', 'Blue'], image: ['u1', 'u2'] };
    const built = buildProduct(node, ctx({ name: 'name', brand: 'factory_name', color: 'color', image: 'images' }));
    expect((built.product.attributes as Record<string, unknown>).color).toEqual(['Red', 'Blue']);
    expect(built.product.images).toEqual(['u1', 'u2']);
  });

  it('manual values fill unit and currency', () => {
    const built = buildProduct({ name: 'A', brand: 'B' },
      ctx({ name: 'name', brand: 'factory_name' }, { currency: 'EUR', unit: 'm2' }));
    expect(built.product.currency).toBe('EUR');
    expect(built.product.unit).toBe('m2');
    expect(built.value_sources.currency).toBe('default');
  });
});

describe('field detection reads paths, attributes and nested specs', () => {
  it('flattens attributes, nested elements and name-keyed repeats', () => {
    const node: XmlNode = {
      '@_id': '42',
      specs: { thickness: '10' },
      spec: [{ '@_name': 'Finish', '#text': 'Matt' }, { '@_name': 'Color', '#text': 'Grey' }],
      price: { '@_currency': 'EUR', '#text': '9.90' },
    };
    const flat = flattenNode(node);
    expect(flat.get('@id')).toEqual(['42']);
    expect(flat.get('specs.thickness')).toEqual(['10']);
    expect(flat.get('spec[finish]')).toEqual(['Matt']);
    expect(flat.get('price')).toEqual(['9.90']);
    expect(flat.get('price@currency')).toEqual(['EUR']);
  });

  it('a name-keyed element gets the same path whether it appears once or repeated', () => {
    const once = flattenNode({ spec: { '@_name': 'Thickness', '#text': '10' } });
    const many = flattenNode({ spec: [{ '@_name': 'Thickness', '#text': '9' }, { '@_name': 'Finish', '#text': 'Matt' }] });
    const single = flattenNode({ spec: [{ '@_name': 'Thickness', '#text': '8' }] });
    expect(once.get('spec[thickness]')).toEqual(['10']);
    expect(many.get('spec[thickness]')).toEqual(['9']);
    expect(single.get('spec[thickness]')).toEqual(['8']);
    expect(once.has('spec@name')).toBe(false);
    expect(flattenNode({ category: { '@_id': '12', '#text': 'Tiles' } }).get('category')).toEqual(['Tiles']);
  });

  it('collects every product container, not only the first', () => {
    const doc: XmlNode = {
      feed: { tiles: { product: [{ name: 'A' }] }, lamps: { item: [{ name: 'B' }, { name: 'C' }] } },
    };
    expect(collectProductNodes(doc, PRODUCT_TAGS)).toHaveLength(3);
  });

  it('an explicit row path selects exactly those rows', () => {
    const doc: XmlNode = { catalog: { entry: [{ n: 1 }, { n: 2 }], product: [{ n: 3 }] } };
    expect(collectProductNodes(doc, PRODUCT_TAGS, 'catalog.entry')).toHaveLength(2);
  });
});

describe('feed bytes are decoded by BOM or declaration, never assumed UTF-8', () => {
  it('Windows-1253 Greek decodes', () => {
    const head = new TextEncoder().encode('<?xml version="1.0" encoding="windows-1253"?><a>');
    const greek = new Uint8Array([0xd0, 0xeb, 0xe1, 0xea, 0xdc, 0xea, 0xe9]);
    const tail = new TextEncoder().encode('</a>');
    const bytes = new Uint8Array([...head, ...greek, ...tail]);
    expect(decodeFeedBytes(bytes).text).toContain('Πλακάκι');
  });

  it('undeclared non-UTF-8 is refused rather than garbled', () => {
    expect(() => decodeFeedBytes(new Uint8Array([0x3c, 0x61, 0x3e, 0xd0, 0xeb, 0x3c]))).toThrow(/not valid UTF-8/);
  });

  it('the runner sends raw bytes, not btoa over decoded text', () => {
    const src = read(RUNNER);
    expect(src).toContain('bytesToBase64(xmlBytes)');
    expect(src).not.toMatch(/btoa\(xmlContent\)/);
  });

  it('the UI reads the file as bytes', () => {
    for (const p of XML_UI) expect(read(p)).not.toMatch(/\.text\(\)/);
  });
});

describe('scheduling has one validated calculation and one claim per run', () => {
  it('computes the next minute a cron fires, in UTC', () => {
    const from = new Date('2026-10-17T10:15:30Z');
    expect(nextCronRun('0 */6 * * *', from).toISOString()).toBe('2026-10-17T12:00:00.000Z');
    expect(nextCronRun('30 2 * * 1', from).toISOString()).toBe('2026-10-19T02:30:00.000Z');
    expect(nextCronRun('0 0 1 * *', from).toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });

  it('rejects an unknown expression instead of running hourly', () => {
    for (const bad of ['every day', '61 * * * *', '* * * *', '0 0 31 2 *']) {
      expect(() => nextCronRun(bad, new Date())).toThrow(InvalidCronError);
    }
  });

  it('the schedule modal holds no calculation of its own', () => {
    const src = read(SCHEDULE_MODAL);
    expect(src).not.toMatch(/setHours|calculateNextRun/);
    expect(src).not.toMatch(/from\('data_import_jobs'\)\s*\.update/);
  });

  it('the runner claims each due run by compare-and-set and records every attempt', () => {
    const src = read(RUNNER);
    expect(src).toMatch(/\.eq\('next_run_at', job\.next_run_at\)/);
    expect(src).toContain("rpc('merge_import_job_metadata'");
  });
});

describe('XML import UI reads the active workspace', () => {
  it('never picks the earliest membership', () => {
    for (const p of XML_UI) {
      const src = read(p);
      expect(src, p).not.toMatch(/order\('joined_at'/);
    }
  });
});

describe('supplier cost lists parse locale numbers whole', () => {
  it.each([
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['12,50', 12.5],
    ['12.50', 12.5],
    ['€ 1.234.567,89', 1234567.89],
    ['1.234.567', 1234567],
    ['42', 42],
  ])('%s → %d', (raw, expected) => {
    expect(parseLocaleNumber(raw)).toBe(expected);
  });

  it.each(['1.234', '1,234', '12a', '1.2.3,4,5', ''])('%s is refused', (raw) => {
    expect(parseLocaleNumber(raw)).toBeNull();
  });
});
