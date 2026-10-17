import type { DbClient } from '../_shared/supabase-client.ts';
import { callClaudeMessages } from '../_shared/ai-client.ts';
import { createClient } from '@supabase/supabase-js';
import { captureException } from '../_shared/sentry.ts';
import { XMLParser } from 'https://esm.sh/fast-xml-parser@4.5.0';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, isAdminAccess, userHasWorkspaceCapability } from '../_shared/auth.ts';
import { getToolPrompt, getGenerationPrompt, renderPromptTemplate } from '../_shared/prompt-utils.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { assertSafeUrl } from '../_shared/ssrf-guard.ts';
import { resolveSecret } from '../_shared/secrets.ts';
import {
  classifyFields,
  type MappingSuggestion,
} from '../_shared/xml-field-dictionary.ts';
import {
  REGISTRY_FIELDS_SHADOWED_BY_CORE,
  FeedInputError,
  buildProduct,
  collectProductNodes,
  decodeFeedBytes,
  flattenNode,
  rawCategoryValues,
  sanitizeTargets,
  type XmlNode,
} from './feed.ts';
import { InvalidCronError, nextCronRun } from '../scheduled-import-runner/cron.ts';

const PRODUCT_ARRAY_TAGS = new Set([
  'product', 'item', 'material', 'producto', 'articulo', 'produit',
]);

function envInt(name: string, defaultValue: number, min: number = 1): number {
  const raw = Deno.env.get(name);
  if (!raw) return defaultValue;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < min) {
    console.warn(`⚠️ ${name}=${raw} is invalid; using default ${defaultValue}`);
    return defaultValue;
  }
  return Math.floor(parsed);
}

const MAX_XML_BYTES = envInt('XML_IMPORT_MAX_MB', 25) * 1024 * 1024;
const MAX_BASE64_CHARS = MAX_XML_BYTES * 2;
const MAX_PRODUCTS_PER_IMPORT = envInt('XML_IMPORT_MAX_PRODUCTS', 20_000);
const MAX_DISTINCT_CATEGORY_VALUES = 200;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  transformTagName: (tag: string) => tag.toLowerCase(),
  textNodeName: '#text',
  isArray: (tagName: string) => PRODUCT_ARRAY_TAGS.has(tagName),
});

// A DOCTYPE declaration is refused outright (#363 `EE-15`).
const DOCTYPE_RE = /<!DOCTYPE/i;

function parseXmlDoc(xmlString: string): XmlNode {
  if (DOCTYPE_RE.test(xmlString)) {
    throw new HttpError(
      400,
      'XML parsing error: DOCTYPE declarations are not accepted. Custom entity definitions are ' +
      'a denial-of-service and external-entity vector; product feeds do not need them.',
    );
  }
  try {
    return xmlParser.parse(xmlString);
  } catch (e: any) {
    throw new HttpError(400, `XML parsing error: ${e?.message || e}`);
  }
}

function productRows(doc: XmlNode, rowPath?: string | null): XmlNode[] {
  let nodes: XmlNode[];
  try {
    nodes = collectProductNodes(doc, PRODUCT_ARRAY_TAGS, rowPath);
  } catch (e) {
    if (e instanceof FeedInputError) throw new HttpError(400, e.message);
    throw e;
  }
  if (nodes.length === 0) {
    const supported = Array.from(PRODUCT_ARRAY_TAGS).map((t) => `<${t}>`).join(', ');
    throw new HttpError(400, rowPath
      ? `No rows found at row path "${rowPath}".`
      : `No product elements found in XML. Supported tags: ${supported}, or name a row path.`);
  }
  return nodes;
}

interface XMLImportRequest {
  action?: 'schedule';
  workspace_id: string;
  category: string;
  xml_content: string;
  source_name?: string;
  source_url?: string;
  row_path?: string;
  parent_job_id?: string;
  mapping_template_id?: string;
  field_mappings?: Record<string, string>;
  preview_only?: boolean;
  generate_preview?: boolean;
  manual_values?: Record<string, string>;
  job_id?: string;
  cron_schedule?: string | null;
}

interface DetectedField {
  xml_field: string;
  sample_values: string[];
  suggested_mapping: string;
  confidence: number;
  data_type: string;
  total_rows: number;
  present_count: number;
  coverage_pct: number;
  distinct_values: number;
}

interface AttributeTarget {
  field_name: string;
  label: string;
  destination: string;
}

interface FieldDetection {
  samples: string[];
  present_count: number;
  distinct_values: number;
}

const MAX_DISTINCT_VALUES_TRACKED = 200;

function detectXMLFields(nodes: XmlNode[]): Map<string, FieldDetection> {
  const samples = new Map<string, Set<string>>();
  const distinct = new Map<string, Set<string>>();
  const present = new Map<string, number>();
  for (const node of nodes) {
    for (const [path, values] of flattenNode(node)) {
      present.set(path, (present.get(path) || 0) + 1);
      const s = samples.get(path) ?? new Set<string>();
      for (const v of values) if (s.size < 3) s.add(v);
      samples.set(path, s);
      const d = distinct.get(path) ?? new Set<string>();
      if (d.size < MAX_DISTINCT_VALUES_TRACKED) d.add(values.join(' | '));
      distinct.set(path, d);
    }
  }
  const out = new Map<string, FieldDetection>();
  for (const [path, s] of samples) {
    out.set(path, {
      samples: [...s],
      present_count: present.get(path) || 0,
      distinct_values: distinct.get(path)?.size || 0,
    });
  }
  return out;
}

/**
 * The forced tool for the residual-field classifier (invariant 9). `mappings` is an array:
 * a JSON Schema cannot constrain the VALUES of arbitrary map keys.
 */
const FIELD_MAPPING_TOOL = {
  name: 'record_field_mappings',
  description:
    'Record the destination for each XML field. Return one entry per field you were asked ' +
    'about, and no entries for fields you were not asked about.',
  input_schema: {
    type: 'object',
    properties: {
      mappings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            xml_field: { type: 'string', description: 'The XML tag name, exactly as given.' },
            mapping: {
              type: 'string',
              description:
                'Destination product field, or "metadata" when it belongs in the attributes blob.',
            },
            confidence: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description: 'How confident you are, 0..1.',
            },
          },
          required: ['xml_field', 'mapping', 'confidence'],
        },
      },
    },
    required: ['mappings'],
  },
} as const;

/** The dictionary keys on a tag name, so a path is classified by its last element or attribute. */
function leafName(path: string): string {
  const bracket = /\[([^\]]+)\]$/.exec(path);
  if (bracket) return bracket[1];
  return path.split(/[.@]/).filter(Boolean).pop() ?? path;
}

async function suggestFieldMappings(
  fieldSamples: Map<string, FieldDetection>,
  supabase: DbClient,
  userId: string | null,
  workspaceId: string | null,
): Promise<Map<string, MappingSuggestion>> {
  const allFieldNames = Array.from(fieldSamples.keys());
  const leafOf = new Map(allFieldNames.map((p) => [p, leafName(p)]));
  const byLeaf = classifyFields([...new Set(leafOf.values())]);
  const confident = new Map<string, MappingSuggestion>();
  const ambiguous = new Map<string, MappingSuggestion>();
  const unknown: string[] = [];
  for (const [path, leaf] of leafOf) {
    const c = byLeaf.confident.get(leaf);
    const a = byLeaf.ambiguous.get(leaf);
    if (c) confident.set(path, c);
    else if (a) ambiguous.set(path, a);
    else unknown.push(path);
  }

  const suggestions = new Map<string, MappingSuggestion>(confident);
  const residualFields = [...ambiguous.keys(), ...unknown];
  if (residualFields.length === 0) return suggestions;

  const applyDefaults = () => {
    for (const [field, hit] of ambiguous) suggestions.set(field, hit);
    for (const field of unknown) {
      suggestions.set(field, { mapping: 'metadata', confidence: 0.5 });
    }
  };

  const fieldsInfo = residualFields.map((field) => ({
    xml_field: field,
    sample_values: fieldSamples.get(field)?.samples || [],
    dictionary_hint: ambiguous.get(field) || null,
  }));

  const systemPrompt = await getToolPrompt(supabase, 'xml_field_mapper');
  const prompt = renderPromptTemplate(await getGenerationPrompt(supabase, 'xml_field_mapper_user'), { system_prompt: systemPrompt, json: JSON.stringify(fieldsInfo, null, 2) });

  // Debit before Haiku runs, refund on failure; a null user (service-role import) runs unbilled.
  const XML_FIELD_MAP_CREDIT_COST = 1;
  const refundMapping = async (): Promise<void> => {
    if (!userId) return;
    try {
      await supabase.rpc('refund_credits', {
        p_user_id: userId,
        p_amount: XML_FIELD_MAP_CREDIT_COST,
        p_operation_type: 'xml_field_mapping_refund',
        p_description: 'XML field mapping refund (Haiku failed)',
        p_metadata: { workspace_id: workspaceId, residual_count: residualFields.length },
        p_workspace_id: workspaceId,
      });
    } catch (e) { console.warn('XML field mapping refund failed:', e); }
  };
  if (userId) {
    const { data: dd, error: de } = await supabase.rpc('debit_credits', {
      p_user_id: userId,
      p_amount: XML_FIELD_MAP_CREDIT_COST,
      p_operation_type: 'xml_field_mapping',
      p_description: `XML field mapping (${residualFields.length} residual fields)`,
      p_metadata: { workspace_id: workspaceId, residual_count: residualFields.length },
      p_workspace_id: workspaceId,
    });
    const drow = Array.isArray(dd) ? dd[0] : dd;
    if (de || !drow?.success) {
      applyDefaults();
      return suggestions;
    }
  }

  try {
    const data = await callClaudeMessages({
      model: 'claude-haiku-4-5',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
      // Forced tool_choice (#363 `EE-16`, invariant 9): this verdict drives a DB write.
      tools: [FIELD_MAPPING_TOOL],
      tool_choice: { type: 'tool', name: FIELD_MAPPING_TOOL.name },
    }, { task: 'xml_field_mapper', userId: userId ?? undefined, workspaceId });

    const toolUse = (data.content || []).find(
      (b: any) => b?.type === 'tool_use' && b?.name === FIELD_MAPPING_TOOL.name,
    );
    if (!toolUse?.input?.mappings || !Array.isArray(toolUse.input.mappings)) {
      console.error('No tool_use block in Claude response for xml_field_mapper');
      await refundMapping();
      applyDefaults();
      return suggestions;
    }

    for (const entry of toolUse.input.mappings as Array<Record<string, unknown>>) {
      const xmlField = typeof entry?.xml_field === 'string' ? entry.xml_field : null;
      if (!xmlField || !residualFields.includes(xmlField)) continue;
      const mapping = typeof entry.mapping === 'string' ? entry.mapping : null;
      if (!mapping) continue;
      const rawConfidence = Number(entry.confidence);
      const confidence = Number.isFinite(rawConfidence)
        ? Math.min(1, Math.max(0, rawConfidence))
        : 0.5;
      suggestions.set(xmlField, { mapping, confidence });
    }

    for (const field of residualFields) {
      if (!suggestions.has(field)) {
        suggestions.set(field, ambiguous.get(field) || { mapping: 'metadata', confidence: 0.5 });
      }
    }
    return suggestions;
  } catch (error) {
    console.error('Error calling Claude API:', error);
    await refundMapping();
    applyDefaults();
    return suggestions;
  }
}

/** The category's registry fields a feed may fill, from `material_metadata_fields`. */
async function loadAttributeTargets(supabase: DbClient, categoryKey: string): Promise<AttributeTarget[]> {
  const { data, error } = await supabase
    .from('material_metadata_fields')
    .select('field_name, display_name, label_by_category, applies_to_categories, is_global, sensitivity, destination')
    .eq('status', 'active');
  if (error) throw new Error(`Could not read the field registry: ${error.message}`);
  const rows = (data ?? []) as Array<Record<string, any>>;
  if (rows.length === 0) throw new Error('The field registry returned no rows');
  return rows
    .filter((r) => r.is_global === true || (Array.isArray(r.applies_to_categories) && r.applies_to_categories.includes(categoryKey)))
    .filter((r) => r.sensitivity !== 'internal' && !REGISTRY_FIELDS_SHADOWED_BY_CORE.has(r.field_name))
    .map((r) => ({
      field_name: String(r.field_name),
      label: (r.label_by_category?.[categoryKey] as string) || (r.display_name as string) || String(r.field_name),
      destination: String(r.destination ?? 'metadata'),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

async function resolveCategoryKey(supabase: DbClient, raw: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('resolve_material_category_key', { p_value: raw });
  if (error) throw new Error(`Category resolution failed: ${error.message}`);
  return typeof data === 'string' && data ? data : null;
}

async function resolveRowCategories(
  supabase: DbClient,
  nodes: XmlNode[],
  mappings: Record<string, string>,
): Promise<Map<string, string | null>> {
  const raws = rawCategoryValues(nodes, mappings);
  if (raws.length > MAX_DISTINCT_CATEGORY_VALUES) {
    throw new HttpError(400, `The mapped category field has ${raws.length} distinct values (max ${MAX_DISTINCT_CATEGORY_VALUES}). Map a coarser field or leave it unmapped.`);
  }
  const out = new Map<string, string | null>();
  for (const raw of raws) out.set(raw, await resolveCategoryKey(supabase, raw));
  return out;
}

function decodeBase64Feed(xmlContent: string): string {
  let bytes: Uint8Array;
  try {
    const binary = atob(xmlContent);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  } catch (e: any) {
    throw new HttpError(400, `Failed to decode base64 XML content: ${e?.message || e}`);
  }
  if (bytes.length > MAX_XML_BYTES) {
    throw new HttpError(413, `XML too large: ${(bytes.length / (1024 * 1024)).toFixed(1)} MB (max ${MAX_XML_BYTES / (1024 * 1024)} MB). Split the file or reduce the number of products per upload.`);
  }
  try {
    return decodeFeedBytes(bytes).text;
  } catch (e) {
    if (e instanceof FeedInputError) throw new HttpError(400, e.message);
    throw e;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleSchedule(supabase: DbClient, body: XMLImportRequest): Promise<Response> {
  if (!body.job_id) throw new HttpError(400, 'job_id is required');
  const { data: job } = await supabase
    .from('data_import_jobs')
    .select('id')
    .eq('id', body.job_id)
    .eq('workspace_id', body.workspace_id)
    .maybeSingle();
  if (!job) throw new HttpError(404, 'Import job not found');

  if (!body.cron_schedule) {
    const { error } = await supabase
      .from('data_import_jobs')
      .update({ is_scheduled: false, cron_schedule: null, next_run_at: null })
      .eq('id', body.job_id)
      .eq('workspace_id', body.workspace_id);
    if (error) throw new Error(`Failed to remove schedule: ${error.message}`);
    return json({ success: true, is_scheduled: false });
  }

  if (!body.source_url) throw new HttpError(400, 'source_url is required for a scheduled import');
  let sourceUrl: string;
  try {
    sourceUrl = await assertSafeUrl(body.source_url, { allowSchemes: ['https:', 'http:'] });
  } catch (e: any) {
    throw new HttpError(400, `Source URL refused: ${e?.message || e}`);
  }
  let nextRunAt: string;
  try {
    nextRunAt = nextCronRun(body.cron_schedule, new Date()).toISOString();
  } catch (e) {
    if (e instanceof InvalidCronError) throw new HttpError(400, `Invalid schedule: ${e.message}`);
    throw e;
  }
  const { error } = await supabase
    .from('data_import_jobs')
    .update({ is_scheduled: true, cron_schedule: body.cron_schedule.trim(), source_url: sourceUrl, next_run_at: nextRunAt })
    .eq('id', body.job_id)
    .eq('workspace_id', body.workspace_id);
  if (error) throw new Error(`Failed to save schedule: ${error.message}`);
  return json({ success: true, is_scheduled: true, next_run_at: nextRunAt });
}

Deno.serve(withApiLogging('xml-import-orchestrator', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed. Use POST.' }, 405);
  }

  try {
    let body: XMLImportRequest;
    try {
      body = await req.json();
    } catch {
      throw new HttpError(400, 'Invalid JSON body');
    }
    const { workspace_id, xml_content, preview_only, generate_preview } = body;
    if (!workspace_id) throw new HttpError(400, 'Missing required parameter: workspace_id');

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) throw new Error('Supabase credentials not configured');
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const auth = await authenticate(req);
    if (!auth.success) throw new HttpError(401, auth.error || 'Authentication failed');
    const userId = auth.userId;

    // The body's workspace runs under the service role; a supplier feed is an import OR a price write.
    if (!isAdminAccess(auth) && !(await userHasWorkspaceCapability(supabase, userId, workspace_id, ['catalog.import', 'pricing.manage']))) {
      return json({ error: 'Not authorized for this workspace' }, 403);
    }

    if (body.action === 'schedule') return await handleSchedule(supabase, body);

    if (!xml_content) throw new HttpError(400, 'Missing required parameter: xml_content');
    if (typeof xml_content === 'string' && xml_content.length > MAX_BASE64_CHARS) {
      const approxMb = (xml_content.length * 0.75 / (1024 * 1024)).toFixed(1);
      throw new HttpError(413, `XML too large: ~${approxMb} MB decoded (max ${MAX_XML_BYTES / (1024 * 1024)} MB). Split the file or reduce the number of products per upload.`);
    }
    if (!body.category) throw new HttpError(400, 'Missing required parameter: category');
    const uploadCategory = await resolveCategoryKey(supabase, body.category);
    if (!uploadCategory) throw new HttpError(400, `Unknown material category "${body.category}"`);

    const xmlString = decodeBase64Feed(xml_content);
    const nodes = productRows(parseXmlDoc(xmlString), body.row_path);
    const attributeTargets = await loadAttributeTargets(supabase, uploadCategory);
    const attributeNames = new Set(attributeTargets.map((t) => t.field_name));

    if (preview_only) {
      const detections = detectXMLFields(nodes);
      const suggestions = await suggestFieldMappings(detections, supabase, userId, workspace_id);
      const total_rows = nodes.length;
      const rawSuggested: Record<string, string> = {};
      for (const [path, s] of suggestions) rawSuggested[path] = s.mapping;
      const suggested = sanitizeTargets(rawSuggested, attributeNames);

      const detectedFields: DetectedField[] = Array.from(detections.entries()).map(([xmlField, d]) => {
        const first = d.samples[0] ?? '';
        const dataType = /^https?:\/\//.test(first) ? 'url'
          : first !== '' && !isNaN(Number(first)) ? 'number'
          : first.length > 100 ? 'text' : 'string';
        return {
          xml_field: xmlField,
          sample_values: d.samples,
          suggested_mapping: suggested[xmlField] ?? 'metadata',
          confidence: suggestions.get(xmlField)?.confidence ?? 0.5,
          data_type: dataType,
          total_rows,
          present_count: d.present_count,
          coverage_pct: total_rows > 0 ? Math.round((d.present_count / total_rows) * 1000) / 10 : 0,
          distinct_values: d.distinct_values,
        };
      });

      return json({
        success: true,
        detected_fields: detectedFields,
        suggested_mappings: suggested,
        attribute_targets: attributeTargets,
        category: uploadCategory,
        total_rows,
        message: `Detected ${detectedFields.length} fields across ${total_rows} product rows. Review and confirm mappings to proceed.`,
      });
    }

    let mappingSource = body.field_mappings;
    let manualValues = body.manual_values ?? {};
    if ((!mappingSource || Object.keys(mappingSource).length === 0) && body.mapping_template_id) {
      const { data: template } = await supabase
        .from('xml_mapping_templates')
        .select('field_mappings, manual_values')
        .eq('id', body.mapping_template_id)
        .eq('workspace_id', workspace_id)
        .maybeSingle();
      if (!template) throw new HttpError(404, 'Mapping template not found');
      mappingSource = (template as any).field_mappings ?? {};
      if (!body.manual_values) manualValues = (template as any).manual_values ?? {};
    }
    if (!mappingSource || Object.keys(mappingSource).length === 0) {
      const suggestions = await suggestFieldMappings(detectXMLFields(nodes), supabase, userId, workspace_id);
      mappingSource = Object.fromEntries([...suggestions].map(([p, s]) => [p, s.mapping]));
    }
    const mappings = sanitizeTargets(mappingSource, attributeNames);
    const rowCategories = await resolveRowCategories(supabase, nodes, mappings);
    const ctx = {
      mappings,
      manualValues,
      uploadCategory,
      categoryKeyFor: (raw: string) => rowCategories.get(raw) ?? null,
      attributeTargets: attributeNames,
    };

    if (generate_preview) {
      const { product, value_sources } = buildProduct(nodes[0], ctx);
      return json({
        success: true,
        preview_product: product,
        preview_value_sources: value_sources,
        total_products: nodes.length,
        message: `Preview generated from 1 of ${nodes.length} products`,
      });
    }

    if (nodes.length > MAX_PRODUCTS_PER_IMPORT) {
      throw new HttpError(413, `XML contains ${nodes.length} products (max ${MAX_PRODUCTS_PER_IMPORT} per import). Split the file into multiple smaller imports.`);
    }
    const products: Record<string, unknown>[] = [];
    let droppedCount = 0;
    for (const node of nodes) {
      const built = buildProduct(node, ctx);
      if (built.missingRequired.length > 0) droppedCount++;
      else products.push(built.product);
    }
    if (products.length === 0) {
      throw new HttpError(400, `No valid products found in XML: all ${nodes.length} rows miss a required field (name, brand).`);
    }

    let parentJobId: string | null = null;
    if (body.parent_job_id) {
      const { data: parent } = await supabase
        .from('data_import_jobs')
        .select('id, parent_job_id')
        .eq('id', body.parent_job_id)
        .eq('workspace_id', workspace_id)
        .maybeSingle();
      if (!parent) throw new HttpError(404, 'Parent import job not found');
      parentJobId = (parent as any).parent_job_id ?? (parent as any).id;
    }
    let sourceUrl: string | null = null;
    if (body.source_url) {
      try {
        sourceUrl = await assertSafeUrl(body.source_url, { allowSchemes: ['https:', 'http:'] });
      } catch (e: any) {
        throw new HttpError(400, `Source URL refused: ${e?.message || e}`);
      }
    }

    const jobId = await createImportJob(supabase, {
      workspace_id,
      category: uploadCategory,
      products,
      source_name: body.source_name || 'xml_upload',
      original_xml_content: xml_content,
      field_mappings: mappings,
      manual_values: manualValues,
      mapping_template_id: body.mapping_template_id ?? null,
      parent_job_id: parentJobId,
      source_url: sourceUrl,
      row_path: body.row_path ?? null,
      dropped_count: droppedCount,
    });

    const pythonAuth = auth.level === 'user'
      ? (req.headers.get('Authorization') || '')
      : `Bearer ${(await resolveSecret(supabase, 'MIVAA_API_KEY')).value ?? ''}`;

    // Non-blocking handoff; on exhausted retries the job reaches a terminal state.
    callPythonAPI(supabase, jobId, workspace_id, pythonAuth).catch(async (error) => {
      console.error(`Error calling Python API for job ${jobId}:`, error);
      const { error: markErr } = await supabase
        .from('data_import_jobs')
        .update({
          status: 'failed',
          error_message: `Python handoff failed: ${error?.message ?? String(error)}`,
          completed_at: new Date().toISOString(),
        })
        .eq('id', jobId)
        .eq('workspace_id', workspace_id)
        .eq('status', 'pending');
      if (markErr) console.error(`Failed to mark job ${jobId} as failed after handoff error:`, markErr);
    });

    return json({
      success: true,
      job_id: jobId,
      message: droppedCount > 0
        ? `Import job created — ${products.length} products queued, ${droppedCount} dropped for missing required fields`
        : 'Import job created, processing started',
      total_products: products.length,
      dropped_count: droppedCount,
    });
  } catch (error: any) {
    if (error instanceof HttpError) throw error;
    console.error('❌ Error in XML import orchestrator:', error);
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}));

const PRODUCT_INSERT_CHUNK_SIZE = envInt('XML_IMPORT_INSERT_CHUNK', 100);

interface NewImportJob {
  workspace_id: string;
  category: string;
  products: Record<string, unknown>[];
  source_name: string;
  original_xml_content: string;
  field_mappings: Record<string, string>;
  manual_values: Record<string, string>;
  mapping_template_id: string | null;
  parent_job_id: string | null;
  source_url: string | null;
  row_path: string | null;
  dropped_count: number;
}

/** The data_import_jobs row plus its products, chunk-inserted into data_import_job_products. */
async function createImportJob(supabase: DbClient, job: NewImportJob): Promise<string> {
  const { data: jobData, error: jobError } = await supabase
    .from('data_import_jobs')
    .insert({
      workspace_id: job.workspace_id,
      import_type: 'xml',
      source_name: job.source_name,
      status: 'pending',
      total_products: job.products.length,
      processed_products: 0,
      failed_products: 0,
      category: job.category,
      original_xml_content: job.original_xml_content,
      field_mappings: job.field_mappings,
      manual_values: job.manual_values,
      mapping_template_id: job.mapping_template_id,
      parent_job_id: job.parent_job_id,
      source_url: job.source_url,
      metadata: {
        created_by: 'xml-import-orchestrator',
        dropped_count: job.dropped_count,
        row_path: job.row_path,
      },
    })
    .select('id')
    .single();
  if (jobError) throw new Error(`Failed to create import job: ${jobError.message}`);

  const jobId = (jobData as { id: string }).id;
  for (let offset = 0; offset < job.products.length; offset += PRODUCT_INSERT_CHUNK_SIZE) {
    const rows = job.products.slice(offset, offset + PRODUCT_INSERT_CHUNK_SIZE).map((product, i) => ({
      job_id: jobId,
      product_index: offset + i,
      product_data: product,
    }));
    const { error: insertError } = await supabase.from('data_import_job_products').insert(rows);
    if (insertError) {
      await supabase
        .from('data_import_jobs')
        .update({ status: 'failed', error_message: `Failed to store products: ${insertError.message}` })
        .eq('id', jobId);
      throw new Error(`Failed to store products for job ${jobId}: ${insertError.message}`);
    }
  }
  return jobId;
}

/** Hand the job to MIVAA with webhook tracking and retries. */
async function callPythonAPI(
  supabase: DbClient,
  jobId: string,
  workspace_id: string,
  authHeader: string,
): Promise<void> {
  const pythonApiUrl = Deno.env.get('PYTHON_API_URL') || 'https://v1api.materialshub.gr';
  const apiUrl = `${pythonApiUrl}/api/import/process`;
  const MAX_RETRIES = 3;
  const BASE_DELAY_MS = 2000;
  const requestPayload = { job_id: jobId, workspace_id };

  const { data: webhookCall } = await supabase
    .from('webhook_calls')
    .insert({
      source_type: 'xml_import',
      source_id: jobId,
      webhook_url: apiUrl,
      webhook_method: 'POST',
      request_payload: requestPayload,
      retry_count: 0,
      max_retries: MAX_RETRIES,
      status: 'pending',
      metadata: { workspace_id, job_id: jobId },
    })
    .select('id')
    .single();
  const webhookCallId = (webhookCall as { id?: string } | null)?.id;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const startTime = Date.now();
    try {
      if (attempt > 0 && webhookCallId) {
        await supabase.from('webhook_calls').update({ retry_count: attempt, status: 'retrying' }).eq('id', webhookCallId);
      }
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });
      const responseTime = Date.now() - startTime;
      const responseText = await response.text();
      // 409 = MIVAA already claimed this job; retrying would only be refused again.
      if (response.status === 409) return;
      if (!response.ok) throw new Error(`Python API error: ${response.status} - ${responseText}`);
      const result = JSON.parse(responseText);
      if (webhookCallId) {
        await supabase.from('webhook_calls').update({
          response_status: response.status,
          response_body: result,
          response_time_ms: responseTime,
          status: 'success',
          completed_at: new Date().toISOString(),
        }).eq('id', webhookCallId);
      }
      return;
    } catch (error) {
      const isLastAttempt = attempt === MAX_RETRIES - 1;
      const responseTime = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));
      if (webhookCallId) {
        await supabase.from('webhook_calls').update({
          error_message: err.message,
          response_time_ms: responseTime,
          status: isLastAttempt ? 'failed' : 'retrying',
          retry_count: attempt,
          next_retry_at: isLastAttempt ? null : new Date(Date.now() + BASE_DELAY_MS * Math.pow(2, attempt)).toISOString(),
          completed_at: isLastAttempt ? new Date().toISOString() : null,
        }).eq('id', webhookCallId);
      }
      if (isLastAttempt) {
        const { data: jobData } = await supabase
          .from('data_import_jobs')
          .select('source_name, import_type, total_products')
          .eq('id', jobId)
          .single();
        const j = jobData as Record<string, any> | null;
        await captureException(err, {
          tags: {
            function: 'xml-import-orchestrator',
            error_type: 'xml_import_job_failed',
            job_id: jobId,
            source_name: j?.source_name || 'unknown',
          },
          extra: {
            job_id: jobId,
            source_name: j?.source_name,
            import_type: j?.import_type,
            total_products: j?.total_products || 0,
            error_message: err.message,
            retry_count: MAX_RETRIES,
          },
          fingerprint: ['xml-import-job-failed', j?.source_name || 'unknown'],
        });
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, BASE_DELAY_MS * Math.pow(2, attempt)));
    }
  }
}

