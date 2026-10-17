import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { blankComments } from '../helpers/stripComments';
import { jobOutcome, latestStageStatuses, completedStages, failedStages } from '../../src/components/Admin/AsyncJobQueueMonitor/jobOutcome';
import { parseQuantity } from '../../src/modules/quotes/components/QuantityInput';
import { describeVariant, isPriceOnRequest } from '../../src/modules/quotes/quoteVariantLabels';
import { buildCompareSections, productValues } from '../../src/pages/compareRows';
import { toMillimetres, formatDimensionsMm, pickPackagingValue } from '../../src/components/features/products/productDisplayUnits';
import { routeByDestination } from '../../src/services/dealerProductsService';
import { parseEditorText, toEditorText, valueKind } from '../../src/components/Admin/metadataFieldEditor';
import { cartKey, parseCartKey } from '../../src/modules/finance/services/storefrontService';
import { productStatusBadge } from '../../src/services/productPublishService';
import type { FieldRegistrySnapshot, RegistryField } from '../../src/services/fieldRegistryService';

const src = (p: string) => blankComments(readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n'));

const field = (p: Partial<RegistryField> & { name: string }): RegistryField => ({
  label: p.name, section: 'other', categories: null, sortOrder: 0, sensitivity: 'public',
  role: 'descriptive', labelByCategory: null, descriptionByCategory: null, description: null, ...p,
});
const snapshot = (fields: RegistryField[]): FieldRegistrySnapshot => ({
  fields, byName: new Map(fields.map((f) => [f.name, f])), internalPattern: /(^|_)(cost|margin|markup)(_|$)/,
});

describe('B12 — uploads go to the ACTIVE workspace', () => {
  it('has no hardcoded workspace id and sends the active one', () => {
    const s = src('src/components/features/pdf/PDFUploadSection.tsx');
    expect(s).not.toMatch(/ffafc28b-1b8b-4b0d-b226-9f9a6154004e/);
    expect(s).toMatch(/useWorkspace\(\)/);
    expect(s).toMatch(/formData\.append\('workspace_id', activeWorkspaceId\)/);
  });

  it('every MIVAA call carries X-Workspace-Id from the active workspace', () => {
    const s = src('src/services/mivaaApiClient.ts');
    expect(s).toMatch(/headers\['X-Workspace-Id'\] = workspaceId/);
    expect(s).toMatch(/getActiveWorkspaceId\(session\.user\?\.id\)/);
    expect(s).not.toMatch(/Authorization: `Bearer \$\{token\}`/);
  });
});

describe('B18 — job controls do what they say', () => {
  const s = src('src/components/Admin/AsyncJobQueueMonitor/AsyncJobQueueMonitor.tsx');
  it('Continue resumes through MIVAA and delete hits the real route', () => {
    expect(s).toMatch(/mivaaApi\.resumeJob\(jobId\)/);
    expect(s).toMatch(/mivaaApi\.deleteJob\(jobId\)/);
    expect(s).not.toMatch(/api\/v1\/rag/);
    const client = src('src/services/mivaaApiClient.ts');
    expect(client).toMatch(/\/api\/rag\/documents\/job\/\$\{encodeURIComponent\(jobId\)\}\/resume/);
    expect(client).toMatch(/\/api\/rag\/documents\/jobs\/\$\{encodeURIComponent\(jobId\)\}/);
  });

  it('Clear Queue stamps cancelled, never interrupted', () => {
    const clear = s.slice(s.indexOf('const handleClearQueue'), s.indexOf('const handleDeleteJobById'));
    expect(clear).toMatch(/status: 'cancelled'/);
    expect(clear).not.toMatch(/status: 'interrupted'/);
  });

  it('the job comparator watches heartbeat, slow operation and failure summary', () => {
    expect(s).toMatch(/prev\.last_heartbeat ===/);
    expect(s).toMatch(/prev\.current_slow_operation/);
    expect(s).toMatch(/prev\.failure_summary/);
  });

  it('the active-jobs banner includes product_discovery_upload', () => {
    expect(src('src/components/Admin/DataImportHub.tsx')).toMatch(/\.in\('job_type', \['pdf_processing', 'product_discovery_upload'\]\)/);
  });

  it('a failed stage is not a completed one, and a partial job is not a clean success', () => {
    const events = [
      { stage: 'a', status: 'completed' },
      { stage: 'b', status: 'in_progress' },
      { stage: 'b', status: 'failed' },
      { stage: 'c' },
      { stage: 'product_processing', status: 'completed_with_failures' },
    ];
    const latest = latestStageStatuses(events);
    expect(completedStages(latest)).not.toContain('b');
    expect(failedStages(latest)).toEqual(['b', 'product_processing']);
    const ok = jobOutcome({ status: 'completed', metadata: {}, failure_summary: null }, [{ stage: 'a', status: 'completed' }]);
    expect(ok.completedWithFailures).toBe(false);
    const partial = jobOutcome({ status: 'completed', metadata: { completion_reason: 'completed_with_failures', products_failed: 2 }, failure_summary: null }, []);
    expect(partial.completedWithFailures).toBe(true);
    expect(partial.productsFailed).toBe(2);
  });
});

describe('B13 — publish', () => {
  it('the materials list publishes through publish_products and badges status', () => {
    const tab = src('src/components/Admin/MaterialsData/ProductsTab.tsx');
    expect(tab).toMatch(/publishProducts\(\[productId\]\)/);
    expect(tab).toMatch(/publishCatalogue\(workspaceId, sourceDocumentId\)/);
    expect(tab).toMatch(/<HubEmptyState/);
    expect(src('src/services/productPublishService.ts')).toMatch(/rpc\('publish_products'/);
    expect(productStatusBadge('draft')).toEqual({ label: 'Draft', variant: 'warning' });
    expect(productStatusBadge('active').variant).toBe('success');
  });

  it('publishCatalogue pages every draft id past the 1000-row cap', () => {
    const svc = src('src/services/productPublishService.ts');
    const fn = svc.slice(svc.indexOf('export async function publishCatalogue'));
    expect(fn).toMatch(/\.order\('id', \{ ascending: true \}\)\s*\.limit\(PAGE\)/);
    expect(fn).toMatch(/q = q\.gt\('id', after\)/);
    expect(fn).toMatch(/if \(page\.length < PAGE\) break;/);
    expect(fn).toMatch(/return \{ requested: ids\.length, published \}/);
  });

  it('the materials page uses the active workspace', () => {
    const page = src('src/components/Admin/MaterialsData/MaterialsDataPage.tsx');
    expect(page).toMatch(/useWorkspace\(\)/);
    expect(page).not.toMatch(/from\('workspaces'\)/);
  });
});

describe('B15 — quotes', () => {
  it('quantities parse decimals with either separator', () => {
    expect(parseQuantity('13,2')).toBe(13.2);
    expect(parseQuantity('13.2')).toBe(13.2);
    expect(parseQuantity('0')).toBeNull();
    expect(parseQuantity('abc')).toBeNull();
    for (const f of ['src/modules/quotes/components/QuoteItemsList.tsx', 'src/modules/quotes/components/AddToQuoteModal.tsx', 'src/modules/quotes/components/AddProductsSheet.tsx']) {
      expect(src(f), f).not.toMatch(/parseInt\(e\.target\.value\)/);
    }
  });

  it('the tile dialog applies only a current, successful calculation', () => {
    const s = src('src/modules/finance/components/TileQuantityDialog.tsx');
    expect(s).toMatch(/disabled=\{!canApply\}/);
    expect(s).not.toMatch(/quantity\?\.supplied \?\? measured\.area/);
  });

  it('an unpriced line is "Price on request", and a variant is named by the registry', () => {
    expect(isPriceOnRequest('call_for_price', 10)).toBe(true);
    expect(isPriceOnRequest('priced', null)).toBe(true);
    expect(isPriceOnRequest('priced', 12)).toBe(false);
    const reg = snapshot([field({ name: 'body_material', label: 'Body Material', labelByCategory: { kitchen: 'Material' } })]);
    expect(describeVariant({ body_material: 'Oak', finish: 'Matt' }, 'kitchen', reg)).toBe('Material: Oak · Finish: Matt');
  });

  it('the picker is scoped to the quote and reads the typed search contract', () => {
    const s = src('src/modules/quotes/services/QuotesService.ts');
    const fn = s.slice(s.indexOf('async searchProductsWithImages'), s.indexOf('private async searchProductsDirectDB'));
    expect(fn).toMatch(/UnifiedSearchService\.searchMultiVector/);
    expect(fn).not.toMatch(/item\.product_id/);
    expect(fn).not.toMatch(/order\('joined_at'/);
    expect(fn).toMatch(/if \(hits\.length === 0\) return this\.searchProductsDirectDB\(query, workspaceId, limit\);/);
    const getQuote = s.slice(s.indexOf('async getQuote(quoteId'), s.indexOf('async getQuoteDocuments'));
    expect(getQuote).not.toMatch(/products\(/);
    expect(getQuote).toMatch(/withLineProducts\(/);
  });
});

describe('product detail reads are batched', () => {
  it('quote lines and moodboard materials read through get_product_details, not one RPC per id', () => {
    const svc = src('src/services/productDetailService.ts');
    expect(svc).toMatch(/rpc\('get_product_details' as never, \{\s*p_ids: ids\.slice\(i, i \+ 200\)/);
    const quotes = src('src/modules/quotes/services/QuotesService.ts');
    const lines = quotes.slice(quotes.indexOf('async function quoteLineProducts'), quotes.indexOf('async function withLineProducts'));
    expect(lines).toMatch(/productDetailService\.fetchMany\(productIds\)/);
    expect(lines).not.toMatch(/productDetailService\.fetch\(/);
    const mood = src('src/services/moodboardAPI.ts');
    const load = mood.slice(mood.indexOf('async function loadMaterials'), mood.indexOf('export interface CreateMoodBoardData'));
    expect(load).toMatch(/productDetailService\.fetchMany\(ids\)/);
    expect(load).not.toMatch(/productDetailService\.fetch\(/);
  });
});

describe('product display', () => {
  const reg = snapshot([
    field({ name: 'finish', label: 'Finish', section: 'appearance' }),
    field({ name: 'pieces_per_box', label: 'Pieces / Box', section: 'packaging', categories: ['tiles'] }),
    field({ name: 'wholesale_cost', label: 'Cost', section: 'commercial', sensitivity: 'public' }),
  ]);

  it('compare rows come from attributes + metadata through the registry, gated per key', () => {
    const sections = buildCompareSections([
      { id: 'a', category: 'tiles', attributes: { finish: 'Matt', wholesale_cost: 3 }, metadata: { packaging: { pieces_per_box: 6 } } },
      { id: 'b', category: 'tiles', metadata: { finish: 'Gloss' } },
    ], reg);
    const keys = sections.flatMap((s) => s.rows.map((r) => r.key));
    expect(keys).toContain('finish');
    expect(keys).toContain('pieces_per_box');
    expect(keys).not.toContain('wholesale_cost');
    expect(productValues({ id: 'x', attributes: { finish: 'A' }, metadata: { finish: 'B' } }).finish).toBe('B');
  });

  it('dimensions are one explicit unit and packaging resolves flat or nested', () => {
    expect(toMillimetres(null)).toBeNull();
    expect(toMillimetres('550')).toBe(550);
    expect(formatDimensionsMm({ w: 600, h: null, d: 300 })).toBe('W 600 × D 300 mm');
    expect(pickPackagingValue({}, { pieces_per_box: 8 }, 'pieces_per_box')).toBe('8');
    expect(pickPackagingValue({ pieces_per_box: { value: 4 } }, {}, 'pieces_per_box')).toBe('4');
  });

  it('the modal registry section cards apply the per-key gate', () => {
    const s = src('src/components/features/products/ProductDetailModal.tsx');
    expect(s).toMatch(/fieldRegistry\.isInternalField\(field\.key\) !== false/);
  });

  it('Discover and Compare read get_product_detail', () => {
    expect(src('src/pages/DiscoverPage.tsx')).toMatch(/productDetailService\.fetch\(p\.id\)/);
    const cmp = src('src/pages/MaterialComparePage.tsx');
    expect(cmp).toMatch(/productDetailService\.fetch/);
    expect(cmp).not.toMatch(/from\('products'\)/);
  });

  it('search facets are not hardcoded substring lists', () => {
    const s = src('src/components/features/search/materialSearchFilters.ts');
    expect(s).not.toMatch(/MATERIAL_TYPES|COLORS = \[|TEXTURES|APPLICATIONS/);
    expect(s).toMatch(/isInternalFieldKey\(registry, key\) !== false/);
  });
});

describe('writers', () => {
  it('ProductFiscalCard reads markup through get_product_costs and writes TARIC in one update', () => {
    const s = src('src/components/business/marketplace/ProductFiscalCard.tsx');
    const cols = s.slice(s.indexOf('const SELECT_COLUMNS'), s.indexOf("].join(', ')"));
    expect(cols).not.toMatch(/markup_percent/);
    expect(s).toMatch(/productDetailService\.costs\(\[productId\]\)/);
    expect(s).toMatch(/taric_code: form\.taric \|\| null,\s*taric_status:/);
  });

  it('admin product counts select only the id', () => {
    for (const f of [
      'src/components/Admin/MaterialsData/MaterialsDataPage.tsx',
      'src/components/Admin/UnifiedProcessingMonitor.tsx',
      'src/components/Admin/MetadataManagement.tsx',
      'src/pages/Admin/BatchCategorizationPage.tsx',
    ]) {
      expect(src(f), f).not.toMatch(/from\('products'\)\s*\.select\('\*'/);
    }
  });

  it('metadata edits keep their JSON type and go through the one-key writer', () => {
    expect(valueKind(['a'])).toBe('array');
    expect(parseEditorText(toEditorText(['a', 'b']), 'array')).toEqual({ ok: true, value: ['a', 'b'] });
    expect(parseEditorText('1,5', 'number')).toEqual({ ok: true, value: 1.5 });
    expect(parseEditorText('"x"', 'object').ok).toBe(false);
    const s = src('src/components/Admin/MetadataManagement.tsx');
    expect(s).toMatch(/patchProductField\(/);
    expect(s).not.toMatch(/\.update\(\{ metadata: updatedMetadata \}\)/);
    expect(s).not.toMatch(/: 1\.0;/);
  });

  it('dealer values are routed by registry destination', () => {
    const out = routeByDestination({ brand: 'X', finish: 'Matt', custom: 1 }, [
      { field_name: 'brand', label: 'Brand', field_type: 'text', canonicalize: false, destination: 'column' },
      { field_name: 'finish', label: 'Finish', field_type: 'text', canonicalize: true, destination: 'metadata' },
    ]);
    expect(out).toEqual({ metadata: { finish: 'Matt', custom: 1 }, column_fields: { brand: 'X' } });
  });

  it('receive-to-warehouse validates every line before the first product is created', () => {
    const s = src('src/modules/finance/components/ReceiveToWarehouseDialog.tsx');
    const submit = s.slice(s.indexOf('const submit = async'));
    expect(submit.indexOf('netListPrice({')).toBeLessThan(submit.indexOf('createProductViaIngestCore('));
  });

  it('receive-to-warehouse latches before the first validation await', () => {
    const s = src('src/modules/finance/components/ReceiveToWarehouseDialog.tsx');
    const submit = s.slice(s.indexOf('const submit = async'), s.indexOf('const runSubmit = async'));
    expect(submit).toMatch(/if \(submittingRef\.current\) return;\s*submittingRef\.current = true;\s*setBusy\(true\);\s*try \{\s*await runSubmit\(\);\s*\} finally \{\s*submittingRef\.current = false;\s*setBusy\(false\);/);
    const run = s.slice(s.indexOf('const runSubmit = async'));
    expect(run.indexOf('productUomService.getUom(')).toBeGreaterThan(0);
  });

  it('a service price write is part of the create, and null clears it', () => {
    const s = src('src/modules/finance/services/servicesService.ts');
    expect(s).toMatch(/from\('products'\)\.delete\(\)\.eq\('id', productId\)/);
    expect(s).toMatch(/update\(\{ list_price: null \}\)/);
  });

  it('the storefront cart is keyed by product AND variant', () => {
    expect(parseCartKey(cartKey('p1', 'size=60x60'))).toEqual({ product_id: 'p1', variant_key: 'size=60x60' });
    expect(parseCartKey(cartKey('p1', null))).toEqual({ product_id: 'p1', variant_key: null });
  });
});
