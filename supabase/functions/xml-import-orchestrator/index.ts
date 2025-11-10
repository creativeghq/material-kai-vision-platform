import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface XMLImportRequest {
  workspace_id: string;
  category: string;
  xml_content: string; // Base64 encoded XML
  source_name?: string;
  mapping_template_id?: string; // Optional: use existing mapping template
  field_mappings?: Record<string, string>; // Optional: custom field mappings
  preview_only?: boolean; // If true, only return detected fields without creating job
}

interface DetectedField {
  xml_field: string;
  sample_values: string[];
  suggested_mapping: string;
  confidence: number;
  data_type: string;
}

interface ProductData {
  name: string;
  description?: string;
  factory_name: string;
  factory_group_name?: string;
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
  detected_fields?: DetectedField[]; // For preview mode
  suggested_mappings?: Record<string, string>; // AI-suggested mappings
}

/**
 * Detect all unique fields in XML and collect sample values
 */
function detectXMLFields(xmlContent: string): Map<string, string[]> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlContent, 'text/xml');

  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error(`XML parsing error: ${parserError.textContent}`);
  }

  // Find product elements (support multiple languages/formats)
  let products = doc.querySelectorAll('product');
  if (products.length === 0) products = doc.querySelectorAll('item');
  if (products.length === 0) products = doc.querySelectorAll('material');
  if (products.length === 0) products = doc.querySelectorAll('producto');
  if (products.length === 0) products = doc.querySelectorAll('articulo');
  if (products.length === 0) products = doc.querySelectorAll('produit');

  if (products.length === 0) {
    throw new Error('No product elements found in XML');
  }

  // Collect all unique fields and sample values (from first 5 products)
  const fieldSamples = new Map<string, string[]>();

  Array.from(products).slice(0, 5).forEach((product) => {
    Array.from(product.children).forEach((child) => {
      const fieldName = child.tagName.toLowerCase();
      const value = child.textContent?.trim() || '';

      if (!fieldSamples.has(fieldName)) {
        fieldSamples.set(fieldName, []);
      }

      const samples = fieldSamples.get(fieldName)!;
      if (samples.length < 3 && value && !samples.includes(value)) {
        samples.push(value);
      }
    });
  });

  return fieldSamples;
}

/**
 * Use AI to suggest field mappings based on field names and sample values
 */
async function suggestFieldMappings(
  fieldSamples: Map<string, string[]>,
  anthropicApiKey: string
): Promise<Map<string, { mapping: string; confidence: number }>> {
  const suggestions = new Map<string, { mapping: string; confidence: number }>();

  // Our target schema fields
  const targetFields = [
    'name', 'description', 'factory_name', 'factory_group_name',
    'material_category', 'price', 'color', 'colors', 'dimensions',
    'size', 'designer', 'collection', 'finish', 'material', 'image', 'images'
  ];

  // Build prompt for Claude
  const fieldsInfo = Array.from(fieldSamples.entries()).map(([field, samples]) => ({
    xml_field: field,
    sample_values: samples
  }));

  const prompt = `You are an expert at mapping XML product data fields to a standardized schema.

Target Schema Fields:
- name (required): Product name/title
- factory_name (required): Manufacturer/supplier/factory name
- material_category (required): Material type (tiles, flooring, wallpaper, etc.)
- description: Product description
- factory_group_name: Factory group or brand
- price: Product price
- color/colors: Color information
- dimensions/size: Product dimensions
- designer: Designer name
- collection: Collection name
- finish: Surface finish
- material: Material composition
- image/images: Image URLs

XML Fields Found:
${JSON.stringify(fieldsInfo, null, 2)}

For each XML field, suggest the best matching target field. Return ONLY a JSON object with this structure:
{
  "xml_field_name": {
    "mapping": "target_field_name",
    "confidence": 0.95
  }
}

Rules:
1. confidence should be 0.0-1.0 (1.0 = certain match)
2. Only map to target fields listed above
3. Use "metadata" for fields that don't match any target field
4. Consider field names AND sample values
5. Be conservative with confidence scores`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    if (!response.ok) {
      console.error('Claude API error:', await response.text());
      return fallbackMappings(fieldSamples);
    }

    const data = await response.json();
    const content = data.content[0].text;

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in Claude response');
      return fallbackMappings(fieldSamples);
    }

    const mappings = JSON.parse(jsonMatch[0]);

    for (const [xmlField, suggestion] of Object.entries(mappings)) {
      suggestions.set(xmlField, suggestion as { mapping: string; confidence: number });
    }

    return suggestions;
  } catch (error) {
    console.error('Error calling Claude API:', error);
    return fallbackMappings(fieldSamples);
  }
}

/**
 * Fallback rule-based mapping when AI is unavailable
 */
function fallbackMappings(fieldSamples: Map<string, string[]>): Map<string, { mapping: string; confidence: number }> {
  const suggestions = new Map<string, { mapping: string; confidence: number }>();

  const mappingRules: Record<string, { mapping: string; confidence: number }> = {
    // Name variations
    'name': { mapping: 'name', confidence: 1.0 },
    'title': { mapping: 'name', confidence: 0.95 },
    'product_name': { mapping: 'name', confidence: 1.0 },
    'productname': { mapping: 'name', confidence: 1.0 },
    'nombre': { mapping: 'name', confidence: 0.95 },
    'titulo': { mapping: 'name', confidence: 0.9 },
    'nom': { mapping: 'name', confidence: 0.95 },

    // Factory variations
    'factory': { mapping: 'factory_name', confidence: 1.0 },
    'factory_name': { mapping: 'factory_name', confidence: 1.0 },
    'manufacturer': { mapping: 'factory_name', confidence: 1.0 },
    'supplier': { mapping: 'factory_name', confidence: 0.95 },
    'brand': { mapping: 'factory_name', confidence: 0.9 },
    'fabricante': { mapping: 'factory_name', confidence: 0.95 },
    'fabricant': { mapping: 'factory_name', confidence: 0.95 },

    // Category variations
    'category': { mapping: 'material_category', confidence: 1.0 },
    'material_category': { mapping: 'material_category', confidence: 1.0 },
    'type': { mapping: 'material_category', confidence: 0.9 },
    'material_type': { mapping: 'material_category', confidence: 1.0 },
    'categoria': { mapping: 'material_category', confidence: 0.95 },
    'tipo': { mapping: 'material_category', confidence: 0.9 },
    'categorie': { mapping: 'material_category', confidence: 0.95 },

    // Description
    'description': { mapping: 'description', confidence: 1.0 },
    'desc': { mapping: 'description', confidence: 0.95 },
    'descripcion': { mapping: 'description', confidence: 0.95 },

    // Images
    'image': { mapping: 'images', confidence: 1.0 },
    'images': { mapping: 'images', confidence: 1.0 },
    'img': { mapping: 'images', confidence: 0.95 },
    'picture': { mapping: 'images', confidence: 0.9 },
    'photo': { mapping: 'images', confidence: 0.9 },
    'imagen': { mapping: 'images', confidence: 0.95 },
  };

  for (const [xmlField] of fieldSamples) {
    const lowerField = xmlField.toLowerCase();
    if (mappingRules[lowerField]) {
      suggestions.set(xmlField, mappingRules[lowerField]);
    } else {
      // Unknown field -> metadata
      suggestions.set(xmlField, { mapping: 'metadata', confidence: 0.5 });
    }
  }

  return suggestions;
}

Deno.serve(async (req) => {
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
    const {
      workspace_id,
      category,
      xml_content,
      source_name,
      mapping_template_id,
      field_mappings,
      preview_only
    }: XMLImportRequest = await req.json();

    console.log(`Processing XML import for workspace: ${workspace_id}, category: ${category}, preview_only: ${preview_only}`);

    // Validate inputs
    if (!workspace_id || !xml_content) {
      throw new Error('Missing required parameters: workspace_id, xml_content');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Get auth info
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header found');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error('Authentication failed');
    }

    // Decode base64 XML content
    const xmlString = atob(xml_content);
    console.log(`Decoded XML content (${xmlString.length} characters)`);

    // PREVIEW MODE: Detect fields and suggest mappings
    if (preview_only) {
      console.log('Preview mode: detecting fields and suggesting mappings');

      const fieldSamples = detectXMLFields(xmlString);
      console.log(`Detected ${fieldSamples.size} unique fields`);

      // Get AI suggestions if API key available
      let aiSuggestions: Map<string, { mapping: string; confidence: number }>;
      if (anthropicApiKey) {
        console.log('Using Claude AI for field mapping suggestions');
        aiSuggestions = await suggestFieldMappings(fieldSamples, anthropicApiKey);
      } else {
        console.log('Using fallback rule-based mapping');
        aiSuggestions = fallbackMappings(fieldSamples);
      }

      // Build detected fields response
      const detectedFields: DetectedField[] = Array.from(fieldSamples.entries()).map(([xmlField, samples]) => {
        const suggestion = aiSuggestions.get(xmlField) || { mapping: 'metadata', confidence: 0.5 };

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

        return {
          xml_field: xmlField,
          sample_values: samples,
          suggested_mapping: suggestion.mapping,
          confidence: suggestion.confidence,
          data_type: dataType
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
          message: `Detected ${detectedFields.length} fields. Review and confirm mappings to proceed.`
        } as XMLImportResponse),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // IMPORT MODE: Validate category is provided
    if (!category) {
      throw new Error('Missing required parameter: category');
    }

    // Parse XML and extract products
    const products = await parseXML(xmlString);
    console.log(`Extracted ${products.length} products from XML`);

    // Validate products
    const validationResult = validateProducts(products);
    if (!validationResult.valid) {
      throw new Error(`Product validation failed: ${validationResult.errors.join(', ')}`);
    }

    // Create import job in database
    const jobId = await createImportJob(
      supabase,
      workspace_id,
      category,
      products,
      source_name || 'xml_upload',
      xml_content, // Store original XML for re-runs
      field_mappings,
      mapping_template_id,
      parent_job_id
    );
    console.log(`Created import job: ${jobId}`);

    // Call Python API to start processing (non-blocking)
    callPythonAPI(jobId, workspace_id, authHeader).catch((error) => {
      console.error(`Error calling Python API for job ${jobId}:`, error);
    });

    return new Response(
      JSON.stringify({
        success: true,
        job_id: jobId,
        message: 'Import job created, processing started',
        total_products: products.length,
      } as XMLImportResponse),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in XML import orchestrator:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      } as XMLImportResponse),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

/**
 * Parse XML content and extract product data
 */
async function parseXML(xmlString: string): Promise<ProductData[]> {
  const products: ProductData[] = [];

  try {
    // Use DOMParser to parse XML
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

    // Check for parsing errors
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
      throw new Error(`XML parsing error: ${parserError.textContent}`);
    }

    // Try to detect XML schema type and extract products
    // Support multiple common XML formats

    // Format 1: <products><product>...</product></products>
    let productElements = xmlDoc.querySelectorAll('product');
    
    // Format 2: <items><item>...</item></items>
    if (productElements.length === 0) {
      productElements = xmlDoc.querySelectorAll('item');
    }

    // Format 3: <materials><material>...</material></materials>
    if (productElements.length === 0) {
      productElements = xmlDoc.querySelectorAll('material');
    }

    if (productElements.length === 0) {
      throw new Error('No product elements found in XML. Supported tags: <product>, <item>, <material>');
    }

    console.log(`Found ${productElements.length} product elements in XML`);

    // Extract data from each product element
    for (const element of productElements) {
      const product = extractProductData(element);
      if (product) {
        products.push(product);
      }
    }

    return products;
  } catch (error) {
    console.error('XML parsing error:', error);
    throw new Error(`Failed to parse XML: ${error.message}`);
  }
}

/**
 * Extract product data from XML element
 */
function extractProductData(element: Element): ProductData | null {
  try {
    // Extract required fields
    const name = getElementText(element, 'name') || getElementText(element, 'title') || getElementText(element, 'product_name');
    const factory_name = getElementText(element, 'factory') || getElementText(element, 'manufacturer') || getElementText(element, 'supplier');
    const material_category = getElementText(element, 'category') || getElementText(element, 'material_type') || getElementText(element, 'type');

    // Validate required fields
    if (!name || !factory_name || !material_category) {
      console.warn('Skipping product - missing required fields:', { name, factory_name, material_category });
      return null;
    }

    // Extract optional fields
    const description = getElementText(element, 'description') || getElementText(element, 'desc');
    const factory_group_name = getElementText(element, 'factory_group') || getElementText(element, 'group');

    // Extract images
    const images: string[] = [];
    const imageElements = element.querySelectorAll('image, img, picture');
    for (const imgEl of imageElements) {
      const url = imgEl.textContent?.trim() || imgEl.getAttribute('url') || imgEl.getAttribute('src');
      if (url) {
        images.push(url);
      }
    }

    // Extract metadata
    const metadata: Record<string, any> = {
      source_type: 'xml',
      extraction_date: new Date().toISOString(),
      extraction_method: 'xml_import',
    };

    // Extract additional fields as metadata
    const metadataFields = ['price', 'color', 'colors', 'dimensions', 'size', 'designer', 'collection', 'finish', 'material'];
    for (const field of metadataFields) {
      const value = getElementText(element, field);
      if (value) {
        metadata[field] = value;
      }
    }

    return {
      name,
      description,
      factory_name,
      factory_group_name,
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
 * Get text content from XML element by tag name
 */
function getElementText(parent: Element, tagName: string): string | undefined {
  const element = parent.querySelector(tagName);
  return element?.textContent?.trim() || undefined;
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
async function createImportJob(
  supabase: any,
  workspace_id: string,
  category: string,
  products: ProductData[],
  source_name: string,
  original_xml_content?: string,
  field_mappings?: Record<string, string>,
  mapping_template_id?: string,
  parent_job_id?: string
): Promise<string> {
  // Create job record with products in metadata
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
      parent_job_id,
      metadata: {
        created_by: 'xml-import-orchestrator',
        products: products, // Store products for Python API to process
      },
    })
    .select()
    .single();

  if (jobError) {
    throw new Error(`Failed to create import job: ${jobError.message}`);
  }

  const jobId = jobData.id;

  return jobId;
}

/**
 * Call Python API to start processing (non-blocking)
 */
async function callPythonAPI(jobId: string, workspace_id: string, authHeader: string): Promise<void> {
  const pythonApiUrl = Deno.env.get('PYTHON_API_URL') || 'https://v1api.materialshub.gr';

  try {
    const response = await fetch(`${pythonApiUrl}/api/import/process`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        job_id: jobId,
        workspace_id,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Python API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log(`Python API response for job ${jobId}:`, result);
  } catch (error) {
    console.error(`Failed to call Python API for job ${jobId}:`, error);
    throw error;
  }
}

