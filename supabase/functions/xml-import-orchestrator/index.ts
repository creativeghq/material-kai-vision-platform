import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { captureException } from '../_shared/sentry.ts';
import { XMLParser } from 'https://esm.sh/fast-xml-parser@4.5.0';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, isAdminAccess, userCanAccessWorkspace } from '../_shared/auth.ts';
import { getToolPrompt } from '../_shared/prompt-utils.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import {
  classifyFields,
  type MappingSuggestion,
} from '../_shared/xml-field-dictionary.ts';

// ---------------------------------------------------------------------------
// XML parser setup
//
// The previous implementation relied on deno_dom's DOMParser in `text/html`
// mode, which silently accepted malformed XML and normalized all tag names to
// lowercase. fast-xml-parser gives us a proper XML parser with explicit
// configuration over casing, array coercion, and attribute handling.
// ---------------------------------------------------------------------------
const PRODUCT_ARRAY_TAGS = new Set([
  'product', 'item', 'material', 'producto', 'articulo', 'produit',
]);
const CATEGORIES_CATEGORY_JPATH_SUFFIX = '.categories.category';

// ---------------------------------------------------------------------------
// Safety envelope
//
// Supabase Edge Functions run on Deno Deploy with a 256 MB memory cap and ~2 s
// of synchronous CPU per invocation. fast-xml-parser builds a full DOM in JS
// memory (~2–5× the XML byte size) and holds the parsed products array until
// they've been chunk-inserted into data_import_job_products. That's the true
// memory ceiling here; after chunk-insert the edge function is done and the
// Python side page-reads products by index without ever holding all of them.
//
// Tunable via env vars (set on the Supabase edge-function deployment):
//   XML_IMPORT_MAX_MB          — raw decoded XML size cap
//   XML_IMPORT_MAX_PRODUCTS    — product count cap per import
//   XML_IMPORT_INSERT_CHUNK    — rows per product-batch INSERT to PostgREST
// ---------------------------------------------------------------------------
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

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  transformTagName: (tag: string) => tag.toLowerCase(),
  textNodeName: '#text',
  isArray: (tagName: string, jPath: string) => {
    if (PRODUCT_ARRAY_TAGS.has(tagName)) return true;
    if (jPath.endsWith(CATEGORIES_CATEGORY_JPATH_SUFFIX)) return true;
    return false;
  },
});

type XmlNode = Record<string, any>;

/** Parse an XML string into a plain-object tree with lowercased tag names. */
function parseXmlDoc(xmlString: string): XmlNode {
  try {
    return xmlParser.parse(xmlString);
  } catch (e: any) {
    throw new Error(`XML parsing error: ${e?.message || e}`);
  }
}

/**
 * Walk the parsed tree and return the array of product nodes under whichever
 * supported container tag exists first. We don't assume a specific wrapper —
 * some catalogs put products under <products>, others under <catalog>, etc.
 */
function findProductNodes(doc: XmlNode): XmlNode[] {
  const queue: any[] = [doc];
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node || typeof node !== 'object') continue;
    for (const key of Object.keys(node)) {
      if (PRODUCT_ARRAY_TAGS.has(key)) {
        const val = node[key];
        if (Array.isArray(val)) return val;
      }
      const child = node[key];
      if (Array.isArray(child)) {
        for (const v of child) if (v && typeof v === 'object') queue.push(v);
      } else if (child && typeof child === 'object') {
        queue.push(child);
      }
    }
  }
  return [];
}

/**
 * Read the text value of a named child element from a product node.
 * Matches the old `getElementText` contract: returns undefined when missing
 * or blank, returns trimmed string otherwise.
 *
 * Handles the four shapes fast-xml-parser can produce for a child:
 *   - string (simple text content)
 *   - { '#text': string, ...attrs } (element with attributes or mixed)
 *   - array of either of the above (when multiple siblings with same tag)
 *   - number/boolean (we disabled parseTagValue, but guard anyway)
 */
function getText(node: XmlNode | undefined, tagName: string): string | undefined {
  if (!node) return undefined;
  const val = node[tagName.toLowerCase()];
  return coerceToText(val);
}

function coerceToText(val: unknown): string | undefined {
  if (val === undefined || val === null) return undefined;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    return trimmed || undefined;
  }
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (Array.isArray(val)) {
    for (const item of val) {
      const text = coerceToText(item);
      if (text) return text;
    }
    return undefined;
  }
  if (typeof val === 'object') {
    const text = (val as any)['#text'];
    if (typeof text === 'string') {
      const trimmed = text.trim();
      return trimmed || undefined;
    }
  }
  return undefined;
}

/**
 * Fallback image extractor: look for <img> / <picture> children, reading the
 * `src` / `url` attribute first, then the inner text.
 */
function collectFallbackImages(node: XmlNode): string[] {
  const out: string[] = [];
  for (const key of ['img', 'picture']) {
    const val = node[key];
    if (!val) continue;
    const arr = Array.isArray(val) ? val : [val];
    for (const item of arr) {
      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (trimmed) out.push(trimmed);
      } else if (item && typeof item === 'object') {
        const candidate = item['@_src'] || item['@_url'] || item['#text'];
        if (typeof candidate === 'string' && candidate.trim()) out.push(candidate.trim());
      }
    }
  }
  return out;
}

/** Extract nested `<categories><category>...</category></categories>` array. */
function collectNestedCategories(node: XmlNode): string[] {
  const cats = node.categories?.category;
  if (!cats) return [];
  const arr = Array.isArray(cats) ? cats : [cats];
  return arr
    .map((c: any) => coerceToText(c))
    .filter((v): v is string => typeof v === 'string' && v.length > 0);
}

interface XMLImportRequest {
  workspace_id: string;
  category: string;
  xml_content: string; // Base64 encoded XML
  source_name?: string;
  mapping_template_id?: string; // Optional: use existing mapping template
  field_mappings?: Record<string, string>; // Optional: custom field mappings
  preview_only?: boolean; // If true, only return detected fields without creating job
  generate_preview?: boolean; // If true, return a single sample product with applied mappings
  // Manual values keyed by target field name. Applied as fallbacks per-row when
  // the mapped XML tag is missing/empty. Any target is allowed (not just the
  // three originally-required fields) — the Fill-the-Gaps UI uses this for
  // optional fields too (e.g. job-level default description).
  manual_values?: Record<string, string>;
}

interface DetectedField {
  xml_field: string;
  sample_values: string[];
  suggested_mapping: string;
  confidence: number;
  data_type: string;
  // Coverage stats — populated by the preview_only pass so the
  // Fill-the-Gaps UI can render "present in N/M rows" badges.
  total_rows: number;
  present_count: number;
  coverage_pct: number;
  distinct_values: number;
}

interface ProductData {
  name: string;
  description?: string;
  factory_name: string;
  factory_group_name?: string;
  // Expanded factory fields
  factory_address?: string;
  factory_city?: string;
  factory_country?: string;
  factory_postal_code?: string;
  factory_phone?: string;
  factory_email?: string;
  factory_website?: string;
  factory_country_of_origin?: string;
  factory_founded_year?: string;
  factory_company_type?: string;
  factory_linkedin_url?: string;
  factory_employee_count?: string;
  material_category: string;
  images?: string[];
  metadata?: Record<string, any>;
}

interface XMLImportResponse {
  success: boolean;
  job_id?: string;
  message?: string;
  error?: string;
  total_products?: number;
  dropped_count?: number;  // Products skipped due to missing required fields
  detected_fields?: DetectedField[]; // For preview mode
  suggested_mappings?: Record<string, string>; // AI-suggested mappings
  total_rows?: number; // Total product rows in the XML (returned with preview)
  preview_product?: ProductData; // For generate_preview mode
  // Per-field provenance for the preview product: 'xml' = pulled from the XML
  // tag, 'default' = filled in from manual_values fallback. Lets the preview
  // modal show "from default" badges so the operator knows what's papered over.
  preview_value_sources?: Record<string, 'xml' | 'default'>;
}

/**
 * Per-field coverage rollup returned by `detectXMLFields`.
 *
 * We walk every product node (not just the first 10) so the coverage
 * percentages drive the Fill-the-Gaps panel honestly — a field that's present
 * in only 312/418 rows shows up as 74%, not "looks fine in the first 10".
 *
 * `distinct_values` is capped at MAX_DISTINCT_VALUES_TRACKED to avoid a
 * pathological feed (e.g. 20K rows with unique GUIDs) blowing up the Set.
 */
interface FieldDetection {
  samples: string[];
  present_count: number;
  distinct_values: number;
}

const MAX_DISTINCT_VALUES_TRACKED = 200;

function detectXMLFields(xmlContent: string): {
  fields: Map<string, FieldDetection>;
  total_rows: number;
} {
  const doc = parseXmlDoc(xmlContent);
  const productNodes = findProductNodes(doc);
  if (productNodes.length === 0) {
    throw new Error('No product elements found in XML');
  }

  // Per-field: sample values (capped at 3), distinct value tracker (capped at
  // MAX_DISTINCT_VALUES_TRACKED), and present_count over ALL rows.
  const samples = new Map<string, Set<string>>();
  const distinctTrackers = new Map<string, Set<string>>();
  const presentCounts = new Map<string, number>();
  const distinctOverflowed = new Map<string, boolean>();

  for (const node of productNodes) {
    for (const [key, val] of Object.entries(node)) {
      if (key.startsWith('@_') || key === '#text') continue;
      const text = coerceToText(val);
      if (!text) continue;

      presentCounts.set(key, (presentCounts.get(key) || 0) + 1);

      if (!samples.has(key)) samples.set(key, new Set<string>());
      const sampleSet = samples.get(key)!;
      if (sampleSet.size < 3) sampleSet.add(text);

      if (!distinctOverflowed.get(key)) {
        if (!distinctTrackers.has(key)) distinctTrackers.set(key, new Set<string>());
        const distinctSet = distinctTrackers.get(key)!;
        distinctSet.add(text);
        if (distinctSet.size >= MAX_DISTINCT_VALUES_TRACKED) {
          distinctOverflowed.set(key, true);
        }
      }
    }
  }

  const out = new Map<string, FieldDetection>();
  for (const [field, sampleSet] of samples) {
    out.set(field, {
      samples: Array.from(sampleSet),
      present_count: presentCounts.get(field) || 0,
      distinct_values: distinctTrackers.get(field)?.size || 0,
    });
  }
  return { fields: out, total_rows: productNodes.length };
}

/**
 * Hybrid field-mapping suggester.
 *
 * Architecture (see `_shared/xml-field-dictionary.ts`):
 *   1. Dictionary first — `classifyFields` buckets every detected tag into
 *      confident / ambiguous / unknown based on `AI_BYPASS_CONFIDENCE`.
 *   2. AI only for the residual — `ambiguous` + `unknown` get sent to Haiku
 *      in a single batched prompt. Confident dictionary hits are returned
 *      as-is, no API call.
 *   3. Cheap model — Haiku (claude-haiku-4-5) is plenty for "which target
 *      does this XML tag map to". Opus would be ~20× the cost for marginal
 *      gain on a simple categorization task.
 *
 * To extend coverage for a new language or supplier: edit the dictionary
 * file, NOT this function. The dictionary is shared across edge functions
 * and gets first crack at every field.
 */
async function suggestFieldMappings(
  fieldSamples: Map<string, FieldDetection>,
  anthropicApiKey: string,
  supabase: SupabaseClient,
): Promise<Map<string, MappingSuggestion>> {
  const allFieldNames = Array.from(fieldSamples.keys());
  const { confident, ambiguous, unknown } = classifyFields(allFieldNames);

  console.log(
    `🔍 Dictionary classification: ${confident.size} confident, ` +
    `${ambiguous.size} ambiguous, ${unknown.length} unknown ` +
    `(${allFieldNames.length} total)`,
  );

  // Start with everything the dictionary was confident about — no API call
  // needed for these.
  const suggestions = new Map<string, MappingSuggestion>(confident);

  // The residual: ambiguous (low-confidence dict hits) + unknown (no dict
  // hit at all). If empty, we're done — the dictionary covered everything.
  const residualFields = [...ambiguous.keys(), ...unknown];
  if (residualFields.length === 0) {
    console.log('✅ All fields resolved by dictionary, skipping AI call');
    return suggestions;
  }

  // Default for the residual when AI isn't available or fails: use the
  // ambiguous dict hits (which are better than nothing), and fall unknowns
  // to `metadata` at 0.5 confidence.
  const applyDefaults = () => {
    for (const [field, hit] of ambiguous) suggestions.set(field, hit);
    for (const field of unknown) {
      suggestions.set(field, { mapping: 'metadata', confidence: 0.5 });
    }
  };

  if (!anthropicApiKey) {
    console.log('⚠️ No Anthropic API key, using dictionary-only fallback for residual');
    applyDefaults();
    return suggestions;
  }

  // Build AI prompt — only send the residual, not all fields. This is the
  // cost lever: stable feeds with all-standard tag names skip the AI call
  // entirely; messy feeds only pay for the weird fields.
  const fieldsInfo = residualFields.map((field) => ({
    xml_field: field,
    sample_values: fieldSamples.get(field)?.samples || [],
    dictionary_hint: ambiguous.get(field) || null, // hint at what dict guessed (low confidence)
  }));

  const systemPrompt = await getToolPrompt(supabase, 'xml_field_mapper');
  const prompt = `${systemPrompt}

XML Fields Found (residual after dictionary lookup — only fields the dictionary couldn't confidently match):
${JSON.stringify(fieldsInfo, null, 2)}

For each xml_field, return its best target mapping with a confidence score 0.0-1.0. If a dictionary_hint is provided, it's a low-confidence guess — confirm or override.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        // Haiku is enough — categorization-with-context is well within its
        // capability and ~20× cheaper than Opus per call.
        model: 'claude-haiku-4-5',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error('Claude API error:', await response.text());
      applyDefaults();
      return suggestions;
    }

    const data = await response.json();
    const content = data.content[0].text;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in Claude response');
      applyDefaults();
      return suggestions;
    }

    const aiMappings = JSON.parse(jsonMatch[0]);
    for (const [xmlField, suggestion] of Object.entries(aiMappings)) {
      // Only accept AI verdicts for fields that were actually in the residual
      // — guards against the model hallucinating mappings for fields we
      // already resolved confidently via the dictionary.
      if (residualFields.includes(xmlField)) {
        suggestions.set(xmlField, suggestion as MappingSuggestion);
      }
    }

    // Backfill anything the AI didn't return (rare, but possible if it skips
    // a field) using the ambiguous dict hint or metadata default.
    for (const field of residualFields) {
      if (!suggestions.has(field)) {
        const fallback = ambiguous.get(field) || { mapping: 'metadata', confidence: 0.5 };
        suggestions.set(field, fallback);
      }
    }

    return suggestions;
  } catch (error) {
    console.error('Error calling Claude API:', error);
    applyDefaults();
    return suggestions;
  }
}


Deno.serve(withApiLogging('xml-import-orchestrator', async (req) => {
  console.log(`XML Import Orchestrator called - Method: ${req.method}`);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Method not allowed. Use POST.',
      }),
      {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    console.log('📥 Parsing request body...');
    let requestBody: any;
    try {
      requestBody = await req.json();
    } catch {
      throw new HttpError(400, 'Invalid JSON body');
    }
    console.log('✅ Request body parsed:', {
      has_workspace_id: !!requestBody.workspace_id,
      has_xml_content: !!requestBody.xml_content,
      xml_content_length: requestBody.xml_content?.length || 0,
      preview_only: requestBody.preview_only,
      category: requestBody.category,
    });

    const {
      workspace_id,
      category,
      xml_content,
      source_name,
      mapping_template_id,
      field_mappings,
      preview_only,
      generate_preview,
      manual_values
    }: XMLImportRequest = requestBody;

    console.log(`Processing XML import for workspace: ${workspace_id}, category: ${category}, preview_only: ${preview_only}, generate_preview: ${generate_preview}`);

    // Validate inputs
    if (!workspace_id || !xml_content) {
      throw new HttpError(400, 'Missing required parameters: workspace_id, xml_content');
    }

    // Reject oversized uploads before we attempt to decode — holding a 20 MB
    // base64 blob + its decoded form + parsed tree simultaneously is the
    // fastest way to OOM this function. See MAX_XML_BYTES docstring.
    if (typeof xml_content === 'string' && xml_content.length > MAX_BASE64_CHARS) {
      const approxMb = (xml_content.length * 0.75 / (1024 * 1024)).toFixed(1);
      throw new HttpError(
        413,
        `XML too large: ~${approxMb} MB decoded (max ${MAX_XML_BYTES / (1024 * 1024)} MB). ` +
        `Split the file or reduce the number of products per upload.`
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anthropicApiKey = () => Deno.env.get('ANTHROPIC_API_KEY') || '';

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Authenticate request
    const auth = await authenticate(req);

    if (!auth.success) {
      throw new HttpError(401, auth.error || 'Authentication failed');
    }

    const user = auth.user;
    const userId = auth.userId;

    // Tenant isolation: the body-supplied workspace_id runs under the service
    // role (RLS-bypassing). Bind the caller to it, or any user could import
    // products into a workspace they don't belong to.
    if (!isAdminAccess(auth) && !(await userCanAccessWorkspace(supabase, userId, workspace_id))) {
      return new Response(JSON.stringify({ error: 'Not authorized for this workspace' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Forward the caller's auth header to the Python /api/import/process
    // handoff so Python can identify the user (this was a latent bug — the
    // import-mode code path referenced `authHeader` without ever defining it,
    // causing every Python handoff to throw a ReferenceError that the surrounding
    // .catch() silently swallowed into Sentry).
    const authHeader =
      req.headers.get('Authorization') ||
      req.headers.get('authorization') ||
      `Bearer ${supabaseKey}`;

    // Decode base64 XML content (UTF-8 safe)
    console.log('🔓 Decoding base64 XML content...');
    console.log(`Base64 content length: ${xml_content.length} characters`);

    let xmlString: string;
    try {
      // The frontend encodes using TextEncoder + btoa, so we need to reverse that process
      const binaryString = atob(xml_content);
      console.log(`✅ atob() successful, binary string length: ${binaryString.length}`);

      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      console.log(`✅ Converted to Uint8Array: ${bytes.length} bytes`);

      const decoder = new TextDecoder('utf-8');
      xmlString = decoder.decode(bytes);
      console.log(`✅ Decoded XML content (${xmlString.length} characters)`);
      console.log(`First 200 chars: ${xmlString.substring(0, 200)}`);

      // Second-stage size check after decode (some base64 is inflated by
      // entity-dense XML; we want the true byte count).
      const decodedBytes = new TextEncoder().encode(xmlString).length;
      if (decodedBytes > MAX_XML_BYTES) {
        throw new HttpError(
          413,
          `XML too large: ${(decodedBytes / (1024 * 1024)).toFixed(1)} MB decoded ` +
          `(max ${MAX_XML_BYTES / (1024 * 1024)} MB). ` +
          `Split the file or reduce the number of products per upload.`
        );
      }
    } catch (decodeError: any) {
      // Preserve an already-typed client error (e.g. the too-large HttpError).
      if (decodeError instanceof HttpError) throw decodeError;
      console.error('❌ Error decoding base64:', decodeError);
      console.error('Base64 sample (first 100 chars):', xml_content.substring(0, 100));
      throw new HttpError(400, `Failed to decode base64 XML content: ${decodeError?.message || decodeError}`);
    }

    // PREVIEW MODE: Detect fields and suggest mappings
    if (preview_only) {
      console.log('Preview mode: detecting fields and suggesting mappings');

      const { fields: fieldDetections, total_rows } = detectXMLFields(xmlString);
      console.log(`Detected ${fieldDetections.size} unique fields across ${total_rows} product rows`);

      // Dictionary-first, AI-for-residual. `suggestFieldMappings` handles
      // both branches internally (no-AI fallback, AI residual on Haiku) — see
      // the function docstring for the rationale.
      const aiSuggestions = await suggestFieldMappings(
        fieldDetections,
        anthropicApiKey(),
        supabase,
      );

      // Build detected fields response
      const detectedFields: DetectedField[] = Array.from(fieldDetections.entries()).map(([xmlField, detection]) => {
        const suggestion = aiSuggestions.get(xmlField) || { mapping: 'metadata', confidence: 0.5 };
        const samples = detection.samples;

        // Determine data type from samples
        let dataType = 'string';
        if (samples.length > 0) {
          const firstSample = samples[0];
          if (firstSample.startsWith('http://') || firstSample.startsWith('https://')) {
            dataType = 'url';
          } else if (!isNaN(Number(firstSample))) {
            dataType = 'number';
          } else if (firstSample.length > 100) {
            dataType = 'text';
          }
        }

        const coverage_pct = total_rows > 0
          ? Math.round((detection.present_count / total_rows) * 1000) / 10  // 1-decimal place
          : 0;

        return {
          xml_field: xmlField,
          sample_values: samples,
          suggested_mapping: suggestion.mapping,
          confidence: suggestion.confidence,
          data_type: dataType,
          total_rows,
          present_count: detection.present_count,
          coverage_pct,
          distinct_values: detection.distinct_values,
        };
      });

      // Build suggested mappings object
      const suggestedMappings: Record<string, string> = {};
      for (const field of detectedFields) {
        suggestedMappings[field.xml_field] = field.suggested_mapping;
      }

      return new Response(
        JSON.stringify({
          success: true,
          detected_fields: detectedFields,
          suggested_mappings: suggestedMappings,
          total_rows,
          message: `Detected ${detectedFields.length} fields across ${total_rows} product rows. Review and confirm mappings to proceed.`
        } as XMLImportResponse),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // GENERATE PREVIEW MODE: Extract and return a single sample product
    if (generate_preview) {
      console.log('Generate preview mode: extracting sample product with applied mappings');

      const previewDoc = parseXmlDoc(xmlString);
      const productNodes = findProductNodes(previewDoc);
      if (productNodes.length === 0) {
        throw new HttpError(400, 'No product elements found in XML');
      }
      console.log(`Found ${productNodes.length} products, extracting first one for preview`);

      const { product: previewProduct, value_sources } = extractProductDataWithMappings(
        productNodes[0],
        field_mappings,
        manual_values,
      );

      return new Response(
        JSON.stringify({
          success: true,
          preview_product: previewProduct,
          preview_value_sources: value_sources,
          total_products: productNodes.length,
          message: `Preview generated from 1 of ${productNodes.length} products`,
        } as XMLImportResponse),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // IMPORT MODE: Validate category is provided
    if (!category) {
      throw new HttpError(400, 'Missing required parameter: category');
    }

    // Parse XML and extract products. Manual-values fall back per-row when the
    // mapped tag is empty, AND the job-level `category` (chosen on the upload
    // screen) is used as the material_category fallback for every product so
    // the operator doesn't have to map it from the XML.
    const manualValuesWithCategory: Record<string, string> = {
      ...(manual_values || {}),
    };
    if (!manualValuesWithCategory.material_category) {
      manualValuesWithCategory.material_category = category;
    }

    const { products, droppedCount } = await parseXML(
      xmlString,
      field_mappings,
      manualValuesWithCategory,
    );
    console.log(`Extracted ${products.length} products from XML (${droppedCount} dropped)`);

    // Hard cap on products per import — the full array is stored as one JSONB
    // blob in data_import_jobs.metadata and held in memory by both this edge
    // function and the downstream Python /api/import/process handler.
    if (products.length > MAX_PRODUCTS_PER_IMPORT) {
      throw new HttpError(
        413,
        `XML contains ${products.length} products (max ${MAX_PRODUCTS_PER_IMPORT} per import). ` +
        `Split the file into multiple smaller imports.`
      );
    }

    const validationResult = validateProducts(products);
    if (!validationResult.valid) {
      throw new HttpError(400, `Product validation failed: ${validationResult.errors.join(', ')}`);
    }

    const jobId = await createImportJob(
      supabase,
      workspace_id,
      category,
      products,
      source_name || 'xml_upload',
      xml_content,
      field_mappings,
      mapping_template_id,
      droppedCount,
    );
    console.log(`Created import job: ${jobId}`);

    // Non-blocking Python handoff — failures are captured in webhook_calls + Sentry.
    // When the handoff exhausts its retries, mark the job 'failed' so it reaches a
    // terminal state. Previously the throw landed here and only logged, leaving the
    // data_import_jobs row stuck in 'pending' forever (Python never started, so
    // nothing else would ever transition it).
    callPythonAPI(supabase, jobId, workspace_id, authHeader).catch(async (error) => {
      console.error(`Error calling Python API for job ${jobId}:`, error);
      try {
        await supabase
          .from('data_import_jobs')
          .update({
            status: 'failed',
            error_message: `Python handoff failed: ${error?.message ?? String(error)}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId);
      } catch (markErr) {
        console.error(`Failed to mark job ${jobId} as failed after handoff error:`, markErr);
      }
    });

    const message = droppedCount > 0
      ? `Import job created — ${products.length} products queued, ${droppedCount} dropped for missing required fields`
      : 'Import job created, processing started';

    return new Response(
      JSON.stringify({
        success: true,
        job_id: jobId,
        message,
        total_products: products.length,
        dropped_count: droppedCount,
      } as XMLImportResponse),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    // Client errors (bad input / auth / oversized) carry their own status and skip
    // Sentry via the wrapper. Let them propagate.
    if (error instanceof HttpError) throw error;
    console.error('❌ Error in XML import orchestrator:', error);
    console.error('Error stack:', error?.stack);

    const errorMessage = error?.message || String(error);
    // Top-level capture is handled by withApiLogging (returns 5xx → Sentry).

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      } as XMLImportResponse),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
}));

/**
 * Parse XML content and extract product data.
 *
 * Returns both the extracted products and a drop count. Callers should surface
 * the drop count so partial-failure imports are distinguishable from clean ones.
 */
async function parseXML(
  xmlString: string,
  fieldMappings?: Record<string, string>,
  manualValues?: Record<string, string>,
): Promise<{ products: ProductData[]; droppedCount: number }> {
  const products: ProductData[] = [];
  let droppedCount = 0;

  let doc: XmlNode;
  try {
    doc = parseXmlDoc(xmlString);
  } catch (error: any) {
    console.error('XML parsing error:', error);
    throw new Error(`Failed to parse XML: ${error?.message || error}`);
  }

  const productNodes = findProductNodes(doc);
  if (productNodes.length === 0) {
    const supportedList = Array.from(PRODUCT_ARRAY_TAGS).map((t) => `<${t}>`).join(', ');
    throw new Error(`No product elements found in XML. Supported tags: ${supportedList}`);
  }

  console.log(`Found ${productNodes.length} product elements in XML`);

  // When the caller passed field_mappings (the Fill-the-Gaps UI always does),
  // honor them and apply manual_values as per-row fallbacks. When no mappings
  // are passed (legacy / programmatic callers), fall back to the hardcoded
  // tag-name guessing in extractProductData.
  const usingMappings = !!(fieldMappings && Object.keys(fieldMappings).length > 0);

  for (const node of productNodes) {
    let product: ProductData | null;
    if (usingMappings) {
      const { product: mapped, missingRequired } = extractProductDataFromMappings(
        node,
        fieldMappings!,
        manualValues,
      );
      product = missingRequired ? null : mapped;
    } else {
      product = extractProductData(node);
    }

    if (product) {
      products.push(product);
    } else {
      droppedCount++;
    }
  }

  if (droppedCount > 0) {
    console.warn(`⚠️ Dropped ${droppedCount}/${productNodes.length} products (missing required fields)`);
  }

  return { products, droppedCount };
}

/**
 * Extract product data from XML element
 */
function extractProductData(node: XmlNode): ProductData | null {
  try {
    const name = getText(node, 'name') || getText(node, 'title') || getText(node, 'product_name');
    const factory_name = getText(node, 'factory') || getText(node, 'manufacturer') || getText(node, 'supplier');
    const material_category = getText(node, 'category') || getText(node, 'material_type') || getText(node, 'type');

    if (!name || !factory_name || !material_category) {
      console.warn('Skipping product - missing required fields:', { name, factory_name, material_category });
      return null;
    }

    const description = getText(node, 'description') || getText(node, 'desc');
    const factory_group_name = getText(node, 'factory_group') || getText(node, 'factory_group_name') || getText(node, 'group') || getText(node, 'brand_group');

    const factory_address            = getText(node, 'factory_address')      || getText(node, 'manufacturer_address') || getText(node, 'address');
    const factory_city               = getText(node, 'factory_city')         || getText(node, 'city');
    const factory_country            = getText(node, 'factory_country')      || getText(node, 'manufacturer_country') || getText(node, 'country');
    const factory_postal_code        = getText(node, 'factory_postal_code')  || getText(node, 'postal_code') || getText(node, 'zip');
    const factory_phone              = getText(node, 'factory_phone')        || getText(node, 'manufacturer_phone') || getText(node, 'phone') || getText(node, 'tel');
    const factory_email              = getText(node, 'factory_email')        || getText(node, 'manufacturer_email') || getText(node, 'email');
    const factory_website            = getText(node, 'factory_website')      || getText(node, 'manufacturer_website') || getText(node, 'homepage');
    const factory_country_of_origin  = getText(node, 'country_of_origin')    || getText(node, 'origin') || getText(node, 'made_in');
    const factory_founded_year       = getText(node, 'founded_year')         || getText(node, 'founded') || getText(node, 'established');
    const factory_employee_count     = getText(node, 'employee_count')       || getText(node, 'employees');
    const factory_linkedin_url       = getText(node, 'linkedin_url')         || getText(node, 'linkedin');

    const images: string[] = [];
    const imageLink = getText(node, 'image_link') || getText(node, 'image');
    if (imageLink) images.push(imageLink);

    const additionalImageLink = getText(node, 'additional_image_link') || getText(node, 'additional_images');
    if (additionalImageLink) {
      images.push(...additionalImageLink.split(',').map((u) => u.trim()).filter(Boolean));
    }

    if (images.length === 0) {
      images.push(...collectFallbackImages(node));
    }

    const productId = getText(node, 'id') || getText(node, 'product_id') || getText(node, 'sku');

    const metadata: Record<string, any> = {
      source_type: 'xml',
      extraction_date: new Date().toISOString(),
      extraction_method: 'xml_import',
    };
    if (productId) metadata.product_id = productId;

    const metadataFields = ['price', 'color', 'colors', 'dimensions', 'size', 'designer', 'collection', 'finish', 'material', 'link'];
    for (const field of metadataFields) {
      const value = getText(node, field);
      if (value) metadata[field] = value;
    }

    // Canonical factory nested object. The flat keys alongside it
    // (factory_name / factory_group_name / country_of_origin) are consumed
    // directly by the frontend productMetadata helpers and edge-function
    // database tools, so they're kept in sync here rather than relying on
    // the Python metadata_normalizer to back-fill them post-import.
    const factoryObj: Record<string, string> = {};
    if (factory_name)              factoryObj.factory_name         = factory_name;
    if (factory_group_name)        factoryObj.factory_group_name   = factory_group_name;
    if (factory_address)           factoryObj.address              = factory_address;
    if (factory_city)              factoryObj.city                 = factory_city;
    if (factory_country)           factoryObj.country              = factory_country;
    if (factory_postal_code)       factoryObj.postal_code          = factory_postal_code;
    if (factory_phone)             factoryObj.phone                = factory_phone;
    if (factory_email)             factoryObj.email                = factory_email;
    if (factory_website)           factoryObj.website              = factory_website;
    if (factory_country_of_origin) factoryObj.country_of_origin    = factory_country_of_origin;
    if (factory_founded_year)      factoryObj.founded_year         = factory_founded_year;
    if (factory_employee_count)    factoryObj.employee_count       = factory_employee_count;
    if (factory_linkedin_url)      factoryObj.linkedin_url         = factory_linkedin_url;

    if (Object.keys(factoryObj).length > 0) {
      metadata.factory = factoryObj;
      if (factory_name)              metadata.factory_name        = factory_name;
      if (factory_group_name)        metadata.factory_group_name  = factory_group_name;
      if (factory_country_of_origin) metadata.country_of_origin   = factory_country_of_origin;
    }

    const nestedCategories = collectNestedCategories(node);
    if (nestedCategories.length > 0) {
      metadata.categories = nestedCategories;
    }

    return {
      name,
      description,
      factory_name,
      factory_group_name,
      factory_address: factory_address || undefined,
      factory_city: factory_city || undefined,
      factory_country: factory_country || undefined,
      factory_postal_code: factory_postal_code || undefined,
      factory_phone: factory_phone || undefined,
      factory_email: factory_email || undefined,
      factory_website: factory_website || undefined,
      factory_country_of_origin: factory_country_of_origin || undefined,
      factory_founded_year: factory_founded_year || undefined,
      factory_employee_count: factory_employee_count || undefined,
      factory_linkedin_url: factory_linkedin_url || undefined,
      material_category,
      images,
      metadata,
    };
  } catch (error) {
    console.error('Error extracting product data:', error);
    return null;
  }
}

/**
 * Build the (target -> [xml_field, ...]) inverse index from the user's
 * mappings. Multiple XML fields can map to the same target (the operator
 * resolves this in the conflict UI by leaving only one mapped); whatever wins
 * "first non-empty" at extraction time is what gets persisted.
 */
function invertMappings(mappings: Record<string, string>): Map<string, string[]> {
  const inverse = new Map<string, string[]>();
  for (const [xmlField, target] of Object.entries(mappings)) {
    if (!target) continue;
    if (!inverse.has(target)) inverse.set(target, []);
    inverse.get(target)!.push(xmlField);
  }
  return inverse;
}

/**
 * Resolve a single target's value for a product node:
 *   1. Try each mapped XML tag in order; return the first non-empty value with
 *      source='xml'.
 *   2. If none yielded a value, fall back to manualValues[target] with
 *      source='default'.
 *   3. Otherwise undefined / source='missing'.
 *
 * This is the chokepoint that implements the "Fill-the-Gaps" semantics: a
 * mapped-and-present row keeps its real data; a mapped-but-empty or unmapped
 * row gets the operator's job-level default.
 */
function resolveTargetValue(
  node: XmlNode,
  target: string,
  inverseMappings: Map<string, string[]>,
  manualValues?: Record<string, string>,
): { value: string | undefined; source: 'xml' | 'default' | 'missing' } {
  const xmlFields = inverseMappings.get(target) || [];
  for (const xmlField of xmlFields) {
    const val = getText(node, xmlField);
    if (val) return { value: val, source: 'xml' };
  }
  const fallback = manualValues?.[target];
  if (fallback) return { value: fallback, source: 'default' };
  return { value: undefined, source: 'missing' };
}

// Structural fields that land at the TOP LEVEL of ProductData. The Python
// downstream reads these from product_data.<field> directly (see audit:
// data_import_service.py:531-671). Mirroring the orchestrator's pre-refactor
// extractProductData contract — any structural change here cascades to the
// Python normalizer + Stage 4 product insert.
const STRUCTURAL_TARGET_FIELDS = [
  'name', 'factory_name', 'material_category', 'description', 'factory_group_name',
  'factory_address', 'factory_city', 'factory_country', 'factory_postal_code',
  'factory_phone', 'factory_email', 'factory_website', 'factory_country_of_origin',
  'factory_founded_year', 'factory_employee_count', 'factory_linkedin_url',
];

// "Attribute" target fields. The Python embedding/canonicalization path reads
// these as top-level on product_data (data_import_service.py:599, 605, 678).
// Anything mapped to one of these targets MUST land both at the top level AND
// in metadata under the canonical target name, so:
//   (a) properties.price / properties.dimensions JSONB writes find the value
//   (b) the text-embedding concat picks it up
//   (c) facet canonicalization sees the whitelisted key
const ATTRIBUTE_TARGET_FIELDS = [
  'price', 'color', 'colors', 'dimensions', 'size',
  'designer', 'collection', 'finish', 'material',
];

// `external_sku` is special — Python's re-import dedup reads from
// product_data.product_id / product_data.sku / metadata.product_id
// (data_import_service.py:628-631). We mirror to all three so an operator
// mapping <code> → external_sku actually seeds the dedup key.
const SKU_TARGET = 'external_sku';

// Every target the resolver knows how to handle (drives the manual_values
// fallback loop). If a target is in the Fill-the-Gaps UI but not here, the
// operator's job-level default would silently fail to apply.
const ALL_RESOLVABLE_TARGETS = [
  ...STRUCTURAL_TARGET_FIELDS,
  ...ATTRIBUTE_TARGET_FIELDS,
  SKU_TARGET,
];

const REQUIRED_TARGET_FIELDS = ['name', 'factory_name', 'material_category'];

/**
 * Single mapping-aware extractor. Used by both the live preview
 * (extractProductDataWithMappings) and the import-time row builder
 * (extractProductDataFromMappings — thin wrapper below).
 *
 * Returns the product plus a per-target `value_sources` map so the preview UI
 * can label each rendered field "from XML" vs "from default".
 */
function buildProductWithMappings(
  node: XmlNode,
  mappings: Record<string, string>,
  manualValues?: Record<string, string>,
): { product: ProductData; value_sources: Record<string, 'xml' | 'default'>; missingRequired: string[] } {
  const inverseMappings = invertMappings(mappings);
  const value_sources: Record<string, 'xml' | 'default'> = {};
  const missingRequired: string[] = [];

  // Resolve every known target via mapped tags → manual_values fallback. This
  // includes BOTH structural fields and attribute fields (price/color/...) and
  // external_sku — the operator's manual default must work for all of them.
  const resolved: Record<string, string | undefined> = {};
  for (const target of ALL_RESOLVABLE_TARGETS) {
    const { value, source } = resolveTargetValue(node, target, inverseMappings, manualValues);
    resolved[target] = value;
    if (source !== 'missing') value_sources[target] = source;
  }

  for (const req of REQUIRED_TARGET_FIELDS) {
    if (!resolved[req]) missingRequired.push(req);
  }

  // Images: target='images' is special — collect from ALL mapped tags, split
  // comma-separated values, then fall back to the hardcoded <image_link>/<img>
  // probe so a mis-mapped image field doesn't lose every URL.
  const images: string[] = [];
  const imageXmlFields = inverseMappings.get('images') || [];
  for (const xmlField of imageXmlFields) {
    const raw = getText(node, xmlField);
    if (!raw) continue;
    if (raw.includes(',')) {
      images.push(...raw.split(',').map((u) => u.trim()).filter(Boolean));
    } else {
      images.push(raw);
    }
  }
  if (images.length === 0) {
    const imageLink = getText(node, 'image_link') || getText(node, 'image');
    if (imageLink) images.push(imageLink);
    const additionalImageLink = getText(node, 'additional_image_link') || getText(node, 'additional_images');
    if (additionalImageLink) {
      images.push(...additionalImageLink.split(',').map((u) => u.trim()).filter(Boolean));
    }
    if (images.length === 0) {
      images.push(...collectFallbackImages(node));
    }
  }
  if (images.length > 0) value_sources['images'] = 'xml';

  const metadata: Record<string, any> = {
    source_type: 'xml',
    extraction_date: new Date().toISOString(),
    extraction_method: 'xml_import',
  };

  // Attribute targets (price/color/dimensions/...) get mirrored into metadata
  // under their CANONICAL target name so:
  //   (a) facet canonicalizer's whitelist check passes (color → canonicalized)
  //   (b) Python embedding service's `metadata.get(key)` fallback works
  // The top-level write happens further down in the ProductData literal.
  for (const target of ATTRIBUTE_TARGET_FIELDS) {
    if (resolved[target]) metadata[target] = resolved[target];
  }

  // XML fields the operator explicitly routed to 'metadata' (or to a target
  // not in any known list) — preserve them in the metadata blob under their
  // lowercase XML tag name. This is the "Unmapped → metadata" bucket shown in
  // the UI accordion.
  for (const [xmlField, target] of Object.entries(mappings)) {
    if (!target) continue;
    if (target === 'metadata') {
      const v = getText(node, xmlField);
      if (v) metadata[xmlField] = v;
      continue;
    }
    const isKnownTarget =
      STRUCTURAL_TARGET_FIELDS.includes(target) ||
      ATTRIBUTE_TARGET_FIELDS.includes(target) ||
      target === SKU_TARGET ||
      target === 'images';
    if (!isKnownTarget) {
      const v = getText(node, xmlField);
      if (v) metadata[xmlField] = v;
    }
  }

  // External SKU / product_id — Python re-import dedup checks three paths
  // (product_data.product_id, .sku, metadata.product_id). We mirror to all
  // three: the operator's external_sku mapping wins, otherwise fall back to
  // the hardcoded <id>/<product_id>/<sku> probe for legacy XML feeds.
  const productId =
    resolved[SKU_TARGET] ||
    getText(node, 'id') ||
    getText(node, 'product_id') ||
    getText(node, 'sku');
  if (productId) {
    metadata.product_id = productId;
  }

  // Build the factory nested object the way the legacy extractor did, so
  // downstream consumers that read `metadata.factory` still work.
  const factoryObj: Record<string, string> = {};
  const factoryFieldMap: Array<[string, string]> = [
    ['factory_name', 'factory_name'],
    ['factory_group_name', 'factory_group_name'],
    ['factory_address', 'address'],
    ['factory_city', 'city'],
    ['factory_country', 'country'],
    ['factory_postal_code', 'postal_code'],
    ['factory_phone', 'phone'],
    ['factory_email', 'email'],
    ['factory_website', 'website'],
    ['factory_country_of_origin', 'country_of_origin'],
    ['factory_founded_year', 'founded_year'],
    ['factory_employee_count', 'employee_count'],
    ['factory_linkedin_url', 'linkedin_url'],
  ];
  for (const [target, factoryKey] of factoryFieldMap) {
    if (resolved[target]) factoryObj[factoryKey] = resolved[target]!;
  }
  if (Object.keys(factoryObj).length > 0) {
    metadata.factory = factoryObj;
    if (resolved.factory_name) metadata.factory_name = resolved.factory_name;
    if (resolved.factory_group_name) metadata.factory_group_name = resolved.factory_group_name;
    if (resolved.factory_country_of_origin) metadata.country_of_origin = resolved.factory_country_of_origin;
  }

  const nestedCategories = collectNestedCategories(node);
  if (nestedCategories.length > 0) metadata.categories = nestedCategories;

  // ProductData literal: structural fields + attribute fields all at top level.
  // The cast to ProductData & Record is because attribute fields aren't on the
  // ProductData type declaration today (the legacy extractor wrote them only to
  // metadata); Python reads them off the top-level object via untyped
  // .get('price') / .get('color') / etc. so JSON shape is what matters.
  const product: ProductData = {
    name: resolved.name || '',
    description: resolved.description,
    factory_name: resolved.factory_name || '',
    factory_group_name: resolved.factory_group_name,
    factory_address: resolved.factory_address,
    factory_city: resolved.factory_city,
    factory_country: resolved.factory_country,
    factory_postal_code: resolved.factory_postal_code,
    factory_phone: resolved.factory_phone,
    factory_email: resolved.factory_email,
    factory_website: resolved.factory_website,
    factory_country_of_origin: resolved.factory_country_of_origin,
    factory_founded_year: resolved.factory_founded_year,
    factory_employee_count: resolved.factory_employee_count,
    factory_linkedin_url: resolved.factory_linkedin_url,
    material_category: resolved.material_category || '',
    images,
    metadata,
  };

  // Top-level attribute mirrors — Python reads these directly off the product
  // dict (data_import_service.py:599 .price, :605 .dimensions, :678 .color/...
  // /.designer/.collection/.finish/.material). Adding them here makes mapped
  // attribute fields actually reach the Stage 4 properties JSONB write + the
  // text embedding concat. Indexed assignment keeps the typed ProductData
  // interface above unchanged while still landing the keys in the JSON shape.
  for (const target of ATTRIBUTE_TARGET_FIELDS) {
    if (resolved[target]) (product as Record<string, any>)[target] = resolved[target];
  }
  // SKU also mirrored to top-level product_id + sku for dedup paths 1 and 2.
  if (productId) {
    (product as Record<string, any>).product_id = productId;
    (product as Record<string, any>).sku = productId;
  }

  return { product, value_sources, missingRequired };
}

/**
 * Used by `generate_preview` — wraps `buildProductWithMappings`. Returns a
 * non-null product even when required fields are missing (the preview UI
 * surfaces gaps via badges; it doesn't drop the row).
 */
function extractProductDataWithMappings(
  node: XmlNode,
  mappings?: Record<string, string>,
  manualValues?: Record<string, string>,
): { product: ProductData; value_sources: Record<string, 'xml' | 'default'> } {
  if (!mappings || Object.keys(mappings).length === 0) {
    const fallback = extractProductData(node) || {
      name: 'Unknown Product',
      factory_name: 'Unknown Factory',
      material_category: 'Unknown Category',
      images: [],
      metadata: {},
    };
    return { product: fallback, value_sources: {} };
  }
  const { product, value_sources } = buildProductWithMappings(node, mappings, manualValues);
  return { product, value_sources };
}

/**
 * Used by the import-time path. Returns the product plus a list of required
 * fields that were missing after applying the mapping + manual-value fallback;
 * the caller drops the row when missingRequired is non-empty.
 */
function extractProductDataFromMappings(
  node: XmlNode,
  mappings: Record<string, string>,
  manualValues?: Record<string, string>,
): { product: ProductData; missingRequired: boolean } {
  const { product, missingRequired } = buildProductWithMappings(node, mappings, manualValues);
  if (missingRequired.length > 0) {
    console.warn('Skipping product - missing required fields:', missingRequired);
    return { product, missingRequired: true };
  }
  return { product, missingRequired: false };
}

/**
 * Validate extracted products
 */
function validateProducts(products: ProductData[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (products.length === 0) {
    errors.push('No valid products found in XML');
  }

  // Validate each product has required fields
  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    if (!product.name) {
      errors.push(`Product ${i + 1}: Missing name`);
    }
    if (!product.factory_name) {
      errors.push(`Product ${i + 1}: Missing factory_name`);
    }
    if (!product.material_category) {
      errors.push(`Product ${i + 1}: Missing material_category`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Create import job in database
 */
/**
 * Create the data_import_jobs row AND chunk-insert the products into the
 * child table data_import_job_products.
 *
 * We do NOT store the products array on data_import_jobs.metadata anymore.
 * That previously forced the entire array to live as a single JSONB blob
 * which the Python side had to load into memory before batching. With a
 * child table, the Python service pages through products with
 * `batch_size` rows per fetch and never holds more than one batch in memory.
 *
 * Products are batched into chunks of PRODUCT_INSERT_CHUNK_SIZE rows per
 * INSERT. The chunk size is a tradeoff between round-trip count and
 * individual payload size — 100 rows × ~5 KB = ~500 KB per INSERT, well
 * under the PostgREST default body limit.
 */
const PRODUCT_INSERT_CHUNK_SIZE = envInt('XML_IMPORT_INSERT_CHUNK', 100);

async function createImportJob(
  supabase: any,
  workspace_id: string,
  category: string,
  products: ProductData[],
  source_name: string,
  original_xml_content?: string,
  field_mappings?: Record<string, string>,
  mapping_template_id?: string,
  droppedCount: number = 0,
): Promise<string> {
  const { data: jobData, error: jobError } = await supabase
    .from('data_import_jobs')
    .insert({
      workspace_id,
      import_type: 'xml',
      source_name,
      status: 'pending',
      total_products: products.length,
      processed_products: 0,
      failed_products: 0,
      category,
      original_xml_content,
      field_mappings,
      mapping_template_id,
      metadata: {
        created_by: 'xml-import-orchestrator',
        dropped_count: droppedCount,
      },
    })
    .select()
    .single();

  if (jobError) {
    throw new Error(`Failed to create import job: ${jobError.message}`);
  }

  const jobId = jobData.id;
  console.log(`✅ Created data_import_job ${jobId} (background_job auto-created by trigger)`);

  // Chunk-insert products into the child table.
  for (let offset = 0; offset < products.length; offset += PRODUCT_INSERT_CHUNK_SIZE) {
    const slice = products.slice(offset, offset + PRODUCT_INSERT_CHUNK_SIZE);
    const rows = slice.map((product, i) => ({
      job_id: jobId,
      product_index: offset + i,
      product_data: product,
    }));

    const { error: insertError } = await supabase
      .from('data_import_job_products')
      .insert(rows);

    if (insertError) {
      // Best-effort: mark the job as failed so it doesn't hang in 'pending'.
      await supabase
        .from('data_import_jobs')
        .update({ status: 'failed', error_message: `Failed to store products: ${insertError.message}` })
        .eq('id', jobId);
      throw new Error(`Failed to store products for job ${jobId}: ${insertError.message}`);
    }
  }

  if (products.length > 0) {
    console.log(`✅ Inserted ${products.length} products into data_import_job_products for job ${jobId}`);
  }

  return jobId;
}

/**
 * Call Python API to start processing with webhook tracking and retry logic
 */
async function callPythonAPI(
  supabase: any,
  jobId: string,
  workspace_id: string,
  authHeader: string
): Promise<void> {
  const pythonApiUrl = Deno.env.get('PYTHON_API_URL') || 'https://v1api.materialshub.gr';
  const apiUrl = `${pythonApiUrl}/api/import/process`;
  const MAX_RETRIES = 3;
  const BASE_DELAY_MS = 2000;

  const requestPayload = {
    job_id: jobId,
    workspace_id,
  };

  // 🆕 Create webhook_call record
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
      metadata: {
        workspace_id,
        job_id: jobId,
      },
    })
    .select('id')
    .single();

  const webhookCallId = webhookCall?.id;
  console.log(`📝 Created webhook_call record: ${webhookCallId}`);

  // Retry loop with exponential backoff
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const startTime = Date.now();

    try {
      console.log(`📡 Calling Python API (attempt ${attempt + 1}/${MAX_RETRIES}): POST ${apiUrl}`);

      // Update retry count if not first attempt
      if (attempt > 0 && webhookCallId) {
        await supabase
          .from('webhook_calls')
          .update({ retry_count: attempt, status: 'retrying' })
          .eq('id', webhookCallId);
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestPayload),
      });

      const responseTime = Date.now() - startTime;
      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(`Python API error: ${response.status} - ${responseText}`);
      }

      const result = JSON.parse(responseText);
      console.log(`✅ Python API response for job ${jobId} (${responseTime}ms):`, result);

      // 🆕 Update webhook_call with success
      if (webhookCallId) {
        await supabase
          .from('webhook_calls')
          .update({
            response_status: response.status,
            response_body: result,
            response_time_ms: responseTime,
            status: 'success',
            completed_at: new Date().toISOString(),
          })
          .eq('id', webhookCallId);

        console.log(`✅ Updated webhook_call ${webhookCallId} to 'success'`);
      }

      // Success - exit retry loop
      return;

    } catch (error) {
      const isLastAttempt = attempt === MAX_RETRIES - 1;
      const responseTime = Date.now() - startTime;

      console.error(`❌ Attempt ${attempt + 1} failed:`, error.message);

      // 🆕 Update webhook_call with error
      if (webhookCallId) {
        await supabase
          .from('webhook_calls')
          .update({
            error_message: error.message,
            response_time_ms: responseTime,
            status: isLastAttempt ? 'failed' : 'retrying',
            retry_count: attempt,
            next_retry_at: isLastAttempt ? null : new Date(Date.now() + BASE_DELAY_MS * Math.pow(2, attempt)).toISOString(),
            completed_at: isLastAttempt ? new Date().toISOString() : null,
          })
          .eq('id', webhookCallId);
      }

      if (isLastAttempt) {
        console.error(`❌ All ${MAX_RETRIES} attempts failed for job ${jobId}`);

        // Get job details for Sentry context
        const { data: jobData } = await supabase
          .from('data_import_jobs')
          .select('*')
          .eq('id', jobId)
          .single();

        // 🚨 SENTRY ALERT: Send XML import job failure to Sentry
        await captureException(error, {
          tags: {
            function: 'xml-import-orchestrator',
            error_type: 'xml_import_job_failed',
            job_id: jobId,
            source_name: jobData?.source_name || 'unknown',
          },
          extra: {
            job_id: jobId,
            source_name: jobData?.source_name,
            import_type: jobData?.import_type,
            total_products: jobData?.total_products || 0,
            processed_products: jobData?.processed_products || 0,
            failed_products: jobData?.failed_products || 0,
            error_message: error.message,
            retry_count: MAX_RETRIES,
            timestamp: new Date().toISOString(),
          },
          fingerprint: ['xml-import-job-failed', jobData?.source_name || 'unknown'],
        });

        throw error; // Re-throw on final failure
      } else {
        // Calculate exponential backoff delay
        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
        console.log(`⏳ Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
}

