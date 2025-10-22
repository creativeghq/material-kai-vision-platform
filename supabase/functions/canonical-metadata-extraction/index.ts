import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface CanonicalMetadataRequest {
  content: string;
  productId?: string;
  options?: {
    includeCategories?: string[];
    confidenceThreshold?: number;
    extractionMethod?: string;
    validateRequired?: boolean;
  };
}

interface MetadataExtractionResult {
  metadata: Record<string, any>;
  confidence: number;
  extractedFields: number;
  totalFields: number;
  extractionMethod: string;
  processingTime: number;
  issues?: Array<{
    field: string;
    issue: string;
    severity: 'low' | 'medium' | 'high';
  }>;
}

// Field mappings to categories
const FIELD_MAPPINGS = new Map<string, string>([
  // Core Identity mappings
  ['manufacturer', 'coreIdentity'],
  ['brand', 'coreIdentity'],
  ['collection', 'coreIdentity'],
  ['productCode', 'coreIdentity'],
  ['sku', 'coreIdentity'],
  ['model', 'coreIdentity'],
  ['year', 'coreIdentity'],
  ['countryOfOrigin', 'coreIdentity'],
  ['factory', 'coreIdentity'],
  ['groupOfCompanies', 'coreIdentity'],
  ['quarryName', 'coreIdentity'],
  
  // Physical Properties mappings
  ['length', 'physicalProperties'],
  ['width', 'physicalProperties'],
  ['thickness', 'physicalProperties'],
  ['dimensionUnit', 'physicalProperties'],
  ['weightValue', 'physicalProperties'],
  ['weightUnit', 'physicalProperties'],
  ['tileShape', 'physicalProperties'],
  ['edgeType', 'physicalProperties'],
  ['rectified', 'physicalProperties'],
  ['materialCategory', 'physicalProperties'],
  ['tileType', 'physicalProperties'],
  ['woodSpecies', 'physicalProperties'],
  ['stoneType', 'physicalProperties'],
  ['stoneDensity', 'physicalProperties'],
  ['porosity', 'physicalProperties'],
  ['moistureContent', 'physicalProperties'],
  
  // Visual Properties mappings
  ['primaryColor', 'visualProperties'],
  ['secondaryColor', 'visualProperties'],
  ['colorFamily', 'visualProperties'],
  ['colorVariation', 'visualProperties'],
  ['surfaceFinish', 'visualProperties'],
  ['surfacePattern', 'visualProperties'],
  ['surfaceTexture', 'visualProperties'],
  ['surfaceTreatment', 'visualProperties'],
  ['grainPattern', 'visualProperties'],
  ['veiningPattern', 'visualProperties'],
  ['movementPattern', 'visualProperties'],
  ['vRating', 'visualProperties'],
  
  // Technical Specifications mappings
  ['breakingStrength', 'technicalSpecifications'],
  ['modulusOfRupture', 'technicalSpecifications'],
  ['compressiveStrength', 'technicalSpecifications'],
  ['flexuralStrength', 'technicalSpecifications'],
  ['mohsHardness', 'technicalSpecifications'],
  ['jankaHardness', 'technicalSpecifications'],
  ['stoneHardness', 'technicalSpecifications'],
  ['waterAbsorption', 'technicalSpecifications'],
  ['slipResistance', 'technicalSpecifications'],
  ['frostResistance', 'technicalSpecifications'],
  ['heatResistance', 'technicalSpecifications'],
  ['chemicalResistance', 'technicalSpecifications'],
  ['stainResistance', 'technicalSpecifications'],
  ['fadeResistance', 'technicalSpecifications'],
  ['abrasionResistance', 'technicalSpecifications'],
  ['wearResistance', 'technicalSpecifications'],
  ['peiRating', 'technicalSpecifications'],
  ['trafficRating', 'technicalSpecifications'],
  ['fireRating', 'technicalSpecifications'],
  ['thermalExpansion', 'technicalSpecifications'],
  ['thermalConductivity', 'technicalSpecifications'],
  ['thermalShock', 'technicalSpecifications'],
  ['antimicrobial', 'technicalSpecifications'],
  ['soundInsulation', 'technicalSpecifications'],
  ['dimensionalStability', 'technicalSpecifications'],
  
  // Commercial Information mappings
  ['priceRange', 'commercialInformation'],
  ['priceCurrency', 'commercialInformation'],
  ['priceUnit', 'commercialInformation'],
  ['stockStatus', 'commercialInformation'],
  ['leadTimeDays', 'commercialInformation'],
  ['minimumOrder', 'commercialInformation'],
  ['warranty', 'commercialInformation'],
  ['certifications', 'commercialInformation'],
  ['applicationArea', 'commercialInformation'],
  ['usageType', 'commercialInformation'],
  ['environments', 'commercialInformation'],
  
  // Sustainability & Compliance mappings
  ['sustainability', 'sustainabilityCompliance'],
  ['recycledContentPercent', 'sustainabilityCompliance'],
  ['recyclable', 'sustainabilityCompliance'],
  ['vocLevel', 'sustainabilityCompliance'],
  ['energyEfficiency', 'sustainabilityCompliance'],
  ['carbonFootprint', 'sustainabilityCompliance'],
  
  // Installation & Maintenance mappings
  ['installationMethod', 'installationMaintenance'],
  ['installationFormat', 'installationMaintenance'],
  ['installationPattern', 'installationMaintenance'],
  ['difficultyLevel', 'installationMaintenance'],
  ['toolsRequired', 'installationMaintenance'],
  ['preparationNeeded', 'installationMaintenance'],
  ['installationTime', 'installationMaintenance'],
  ['subfloorRequirements', 'installationMaintenance'],
  ['underlaymentRequired', 'installationMaintenance'],
  ['jointWidth', 'installationMaintenance'],
  ['cleaningMethod', 'installationMaintenance'],
  ['sealingRequired', 'installationMaintenance'],
  ['maintenanceFrequency', 'installationMaintenance'],
  ['repairability', 'installationMaintenance'],
]);

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const { content, productId, options = {} }: CanonicalMetadataRequest = await req.json();
    const startTime = Date.now();

    console.log('🔍 Starting canonical metadata extraction...');

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get metafield definitions
    const { data: metafieldDefs, error: metafieldError } = await supabase
      .from('material_metadata_fields')
      .select('*')
      .eq('is_global', true);

    if (metafieldError) {
      throw new Error(`Failed to get metafield definitions: ${metafieldError.message}`);
    }

    // Extract metadata using Claude
    const extractedMetadata = await extractMetadataWithAI(content, metafieldDefs || []);

    // Organize into canonical schema
    const canonicalMetadata = organizeIntoCanonicalSchema(
      extractedMetadata,
      options.includeCategories
    );

    // Calculate metrics
    const extractedFields = Object.keys(extractedMetadata).length;
    const totalFields = metafieldDefs?.length || 0;
    const confidence = calculateOverallConfidence(extractedMetadata, extractedFields, totalFields);
    const processingTime = Date.now() - startTime;

    // Save to database if productId provided
    if (productId) {
      await saveCanonicalMetadata(supabase, productId, canonicalMetadata, extractedMetadata);
    }

    console.log(`✅ Extracted ${extractedFields}/${totalFields} metadata fields`);
    console.log(`📊 Overall confidence: ${(confidence * 100).toFixed(1)}%`);

    const result: MetadataExtractionResult = {
      metadata: canonicalMetadata,
      confidence,
      extractedFields,
      totalFields,
      extractionMethod: options.extractionMethod || 'ai_extraction',
      processingTime,
    };

    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('❌ Error in canonical metadata extraction:', error);
    
    return new Response(
      JSON.stringify({
        error: 'Failed to extract canonical metadata',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
});

async function extractMetadataWithAI(content: string, metafieldDefs: any[]): Promise<Record<string, any>> {
  try {
    // Create extraction prompt
    const fieldDescriptions = metafieldDefs.slice(0, 50).map(def => 
      `- ${def.field_name}: ${def.description} (Type: ${def.field_type})`
    );

    const prompt = `
Extract metadata from the following product content. Return a JSON object with field names as keys and extracted values.

Available fields:
${fieldDescriptions.join('\n')}

Content:
${content.substring(0, 2000)}

Return only valid JSON with extracted values. Use null for missing values.
`;

    // Call Claude API
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!claudeResponse.ok) {
      throw new Error(`Claude API error: ${claudeResponse.statusText}`);
    }

    const claudeData = await claudeResponse.json();
    const responseText = claudeData.content[0].text;

    // Parse JSON response
    try {
      const extractedMetadata = JSON.parse(responseText);
      return extractedMetadata;
    } catch (parseError) {
      console.warn('⚠️ Failed to parse AI response as JSON, using empty metadata');
      return {};
    }

  } catch (error) {
    console.error('❌ Error in AI metadata extraction:', error);
    return {};
  }
}

function organizeIntoCanonicalSchema(
  extractedMetadata: Record<string, any>,
  includeCategories?: string[]
): Record<string, any> {
  const canonicalMetadata: Record<string, any> = {
    coreIdentity: {},
    physicalProperties: {},
    visualProperties: {},
    technicalSpecifications: {},
    commercialInformation: {},
    sustainabilityCompliance: {},
    installationMaintenance: {},
  };

  // Organize fields by category
  for (const [fieldName, value] of Object.entries(extractedMetadata)) {
    const category = FIELD_MAPPINGS.get(fieldName);
    
    if (category && (!includeCategories || includeCategories.includes(category))) {
      if (!canonicalMetadata[category]) {
        canonicalMetadata[category] = {};
      }
      canonicalMetadata[category][fieldName] = value;
    }
  }

  // Remove empty categories
  Object.keys(canonicalMetadata).forEach(key => {
    if (Object.keys(canonicalMetadata[key]).length === 0) {
      delete canonicalMetadata[key];
    }
  });

  return canonicalMetadata;
}

function calculateOverallConfidence(
  extractedMetadata: Record<string, any>,
  extractedFields: number,
  totalFields: number
): number {
  // Base confidence from extraction coverage
  const coverageScore = totalFields > 0 ? extractedFields / totalFields : 0;
  
  // Bonus for critical fields
  const criticalFields = ['manufacturer', 'brand', 'collection', 'materialCategory', 'primaryColor'];
  const criticalFieldsFound = criticalFields.filter(field => extractedMetadata[field]).length;
  const criticalBonus = criticalFieldsFound / criticalFields.length * 0.2;
  
  // Quality bonus for non-empty values
  const nonEmptyValues = Object.values(extractedMetadata).filter(value => 
    value !== null && value !== undefined && value !== ''
  ).length;
  const qualityBonus = extractedFields > 0 ? (nonEmptyValues / extractedFields) * 0.1 : 0;
  
  return Math.min(1.0, coverageScore + criticalBonus + qualityBonus);
}

async function saveCanonicalMetadata(
  supabase: any,
  productId: string,
  canonicalMetadata: Record<string, any>,
  rawMetadata: Record<string, any>
): Promise<void> {
  try {
    // Update product with canonical metadata in properties field
    const { error: updateError } = await supabase
      .from('products')
      .update({
        properties: {
          ...canonicalMetadata,
          extractionTimestamp: new Date().toISOString(),
          extractionMethod: 'canonical_schema',
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', productId);

    if (updateError) throw updateError;

    console.log(`✅ Saved canonical metadata for product ${productId}`);

  } catch (error) {
    console.error('❌ Error saving canonical metadata:', error);
    throw error;
  }
}
