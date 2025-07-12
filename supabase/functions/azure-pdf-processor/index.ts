import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const azureApiKey = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_KEY');
const azureEndpoint = 'https://kai-documents.cognitiveservices.azure.com';

interface AzureProcessingRequest {
  fileUrl: string;
  originalFilename: string;
  fileSize: number;
  userId: string;
  extractionOptions?: {
    tileSize?: number;
    overlapPercentage?: number;
    extractStructuredData?: boolean;
    detectMaterials?: boolean;
  };
}

interface AzureDocumentResult {
  status: string;
  createdDateTime: string;
  lastUpdatedDateTime: string;
  analyzeResult?: {
    apiVersion: string;
    modelId: string;
    stringIndexType: string;
    content: string;
    pages: Array<{
      pageNumber: number;
      angle: number;
      width: number;
      height: number;
      unit: string;
      words: Array<{
        content: string;
        polygon: number[];
        confidence: number;
        span: { offset: number; length: number };
      }>;
      lines: Array<{
        content: string;
        polygon: number[];
        spans: Array<{ offset: number; length: number }>;
      }>;
    }>;
    tables?: Array<{
      rowCount: number;
      columnCount: number;
      cells: Array<{
        kind: string;
        rowIndex: number;
        columnIndex: number;
        rowSpan?: number;
        columnSpan?: number;
        content: string;
        boundingRegions: Array<{
          pageNumber: number;
          polygon: number[];
        }>;
        spans: Array<{ offset: number; length: number }>;
      }>;
      boundingRegions: Array<{
        pageNumber: number;
        polygon: number[];
      }>;
      spans: Array<{ offset: number; length: number }>;
    }>;
    keyValuePairs?: Array<{
      key: {
        content: string;
        boundingRegions: Array<{
          pageNumber: number;
          polygon: number[];
        }>;
        spans: Array<{ offset: number; length: number }>;
      };
      value?: {
        content: string;
        boundingRegions: Array<{
          pageNumber: number;
          polygon: number[];
        }>;
        spans: Array<{ offset: number; length: number }>;
      };
      confidence: number;
    }>;
    documents?: Array<{
      docType: string;
      confidence: number;
      spans: Array<{ offset: number; length: number }>;
      fields: Record<string, any>;
    }>;
  };
}

// Enhanced material detection using Azure's extracted content
async function detectMaterialsFromAzureContent(content: string, confidence: number): Promise<{
  detected: boolean;
  type: string;
  confidence: number;
  properties: any;
}> {
  const materialPatterns = {
    ceramics: {
      keywords: ['ceramic', 'porcelain', 'tile', 'glazed', 'unglazed', 'vitrified', 'pei rating', 'slip resistance', 'frost resistant'],
      properties: ['water absorption', 'thermal expansion', 'breaking strength', 'modulus of rupture']
    },
    metals: {
      keywords: ['steel', 'aluminum', 'copper', 'brass', 'iron', 'alloy', 'galvanized', 'stainless', 'carbon steel'],
      properties: ['tensile strength', 'yield strength', 'hardness', 'elastic modulus', 'thermal conductivity']
    },
    concrete: {
      keywords: ['concrete', 'cement', 'aggregate', 'compressive', 'reinforced', 'precast', 'admixture'],
      properties: ['compressive strength', 'density', 'slump', 'air content', 'workability']
    },
    wood: {
      keywords: ['wood', 'timber', 'lumber', 'hardwood', 'softwood', 'plywood', 'veneer', 'moisture content'],
      properties: ['janka hardness', 'specific gravity', 'moisture content', 'modulus of elasticity']
    },
    plastics: {
      keywords: ['plastic', 'polymer', 'pvc', 'hdpe', 'ldpe', 'polystyrene', 'acrylic', 'polyethylene'],
      properties: ['tensile strength', 'impact strength', 'flexural modulus', 'heat deflection']
    },
    glass: {
      keywords: ['glass', 'tempered', 'laminated', 'float', 'thermal', 'safety glass', 'annealed'],
      properties: ['thickness', 'thermal stress', 'impact resistance', 'visible light transmittance']
    },
    textiles: {
      keywords: ['fabric', 'textile', 'fiber', 'yarn', 'weave', 'cotton', 'polyester', 'nylon'],
      properties: ['thread count', 'weight', 'tensile strength', 'abrasion resistance']
    }
  };

  const lowercaseContent = content.toLowerCase();
  let bestMatch = { type: 'unknown', confidence: 0, properties: {} };

  for (const [materialType, patterns] of Object.entries(materialPatterns)) {
    let keywordScore = 0;
    let propertyScore = 0;
    const detectedProperties: any = {};

    // Count keyword matches
    patterns.keywords.forEach(keyword => {
      if (lowercaseContent.includes(keyword)) {
        keywordScore += 1;
      }
    });

    // Extract property values
    patterns.properties.forEach(property => {
      if (lowercaseContent.includes(property)) {
        propertyScore += 1;
        const propertyRegex = new RegExp(`${property}[:\\s]*([0-9]+\\.?[0-9]*)[\\s%]*([a-zA-Z/]*)?`, 'i');
        const match = content.match(propertyRegex);
        if (match) {
          detectedProperties[property] = {
            value: parseFloat(match[1]),
            unit: match[2] || ''
          };
        }
      }
    });

    const totalScore = (keywordScore * 2 + propertyScore) / (patterns.keywords.length + patterns.properties.length);
    const adjustedConfidence = Math.min(totalScore * confidence, 1);

    if (adjustedConfidence > bestMatch.confidence) {
      bestMatch = {
        type: materialType,
        confidence: adjustedConfidence,
        properties: detectedProperties
      };
    }
  }

  return {
    detected: bestMatch.confidence > 0.3,
    type: bestMatch.type,
    confidence: bestMatch.confidence,
    properties: bestMatch.properties
  };
}

// Extract structured data from Azure Document Intelligence results
function extractStructuredDataFromAzure(analyzeResult: any): any {
  const structuredData: any = {
    extraction_method: 'azure_document_intelligence',
    document_classification: {},
    extracted_tables: [],
    form_fields: {},
    key_value_pairs: []
  };

  // Extract tables
  if (analyzeResult.tables) {
    structuredData.extracted_tables = analyzeResult.tables.map((table: any) => ({
      rowCount: table.rowCount,
      columnCount: table.columnCount,
      cells: table.cells.map((cell: any) => ({
        content: cell.content,
        rowIndex: cell.rowIndex,
        columnIndex: cell.columnIndex,
        confidence: cell.confidence || 1.0
      }))
    }));
  }

  // Extract key-value pairs
  if (analyzeResult.keyValuePairs) {
    structuredData.key_value_pairs = analyzeResult.keyValuePairs.map((kvp: any) => ({
      key: kvp.key.content,
      value: kvp.value?.content || '',
      confidence: kvp.confidence
    }));
  }

  // Extract form fields if documents are detected
  if (analyzeResult.documents) {
    analyzeResult.documents.forEach((doc: any) => {
      structuredData.form_fields[doc.docType] = {
        confidence: doc.confidence,
        fields: doc.fields
      };
    });
  }

  return structuredData;
}

// Process PDF using Azure Document Intelligence
async function processWithAzureDocumentIntelligence(fileUrl: string): Promise<AzureDocumentResult> {
  if (!azureApiKey) {
    throw new Error('Azure Document Intelligence API key not configured. Please add AZURE_DOCUMENT_INTELLIGENCE_KEY to your Supabase secrets.');
  }

  console.log('Starting Azure Document Intelligence analysis...');
  console.log('Azure endpoint:', azureEndpoint);
  console.log('File URL:', fileUrl);

  // Start the analysis
  const analyzeResponse = await fetch(`${azureEndpoint}/formrecognizer/documentModels/prebuilt-layout:analyze?api-version=2023-07-31`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': azureApiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      urlSource: fileUrl
    })
  });

  if (!analyzeResponse.ok) {
    const errorText = await analyzeResponse.text();
    console.error('Azure API Error:', {
      status: analyzeResponse.status,
      statusText: analyzeResponse.statusText,
      body: errorText,
      headers: Object.fromEntries(analyzeResponse.headers.entries())
    });
    throw new Error(`Azure analysis failed: ${analyzeResponse.status} - ${errorText}`);
  }

  const operationLocation = analyzeResponse.headers.get('operation-location');
  if (!operationLocation) {
    throw new Error('No operation location returned from Azure');
  }

  console.log('Azure analysis started, polling for results...');

  // Poll for results
  let result: AzureDocumentResult;
  let attempts = 0;
  const maxAttempts = 30; // 5 minutes max

  do {
    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
    attempts++;

    const resultResponse = await fetch(operationLocation, {
      headers: {
        'Ocp-Apim-Subscription-Key': azureApiKey
      }
    });

    if (!resultResponse.ok) {
      throw new Error(`Failed to get results: ${resultResponse.status}`);
    }

    result = await resultResponse.json();
    console.log(`Azure analysis status: ${result.status} (attempt ${attempts}/${maxAttempts})`);

  } while (result.status === 'running' && attempts < maxAttempts);

  if (result.status !== 'succeeded') {
    throw new Error(`Azure analysis failed with status: ${result.status}`);
  }

  return result;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestData: AzureProcessingRequest = await req.json();
    const { fileUrl, originalFilename, fileSize, userId, extractionOptions = {} } = requestData;

    console.log('Request received:', { originalFilename, fileSize, userId, hasApiKey: !!azureApiKey });

    // Check file size limit for Azure Document Intelligence (50MB)
    const azureSizeLimit = 50 * 1024 * 1024; // 50MB in bytes
    if (fileSize > azureSizeLimit) {
      console.log(`File too large for Azure (${fileSize} bytes > ${azureSizeLimit} bytes), using fallback processing`);
      throw new Error(`File size ${Math.round(fileSize / 1024 / 1024)}MB exceeds Azure Document Intelligence limit of 50MB. Please use a smaller file or the system will automatically use standard processing.`);
    }

    if (!fileUrl || !originalFilename || !userId) {
      console.error('Missing required fields:', { fileUrl: !!fileUrl, originalFilename: !!originalFilename, userId: !!userId });
      return new Response(
        JSON.stringify({ error: 'Missing required fields: fileUrl, originalFilename, userId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Starting Azure Document Intelligence processing for:', originalFilename);

    // Create initial processing record
    const { data: processingRecord, error: createError } = await supabase
      .from('pdf_processing_results')
      .insert({
        user_id: userId,
        original_filename: originalFilename,
        file_size: fileSize,
        file_url: fileUrl,
        processing_status: 'processing',
        processing_started_at: new Date().toISOString(),
        extraction_options: extractionOptions,
        azure_model_used: 'prebuilt-layout',
        tile_size_pixels: extractionOptions.tileSize || 512,
        overlap_percentage: extractionOptions.overlapPercentage || 10,
        ocr_model_version: 'azure_document_intelligence_v3.1',
        material_recognition_model_version: 'azure_enhanced_v1.0'
      })
      .select()
      .single();

    if (createError) {
      throw new Error(`Failed to create processing record: ${createError.message}`);
    }

    const processingId = processingRecord.id;
    const startTime = Date.now();

    try {
      // Process with Azure Document Intelligence
      const azureResult = await processWithAzureDocumentIntelligence(fileUrl);
      
      if (!azureResult.analyzeResult) {
        throw new Error('No analysis result from Azure');
      }

      const analyzeResult = azureResult.analyzeResult;
      console.log('Azure processing completed, extracting data...');

      // Extract document metadata
      const totalPages = analyzeResult.pages?.length || 1;
      const averageConfidence = analyzeResult.pages?.reduce((sum, page) => {
        const pageConfidence = page.words?.reduce((wordSum, word) => wordSum + word.confidence, 0) / (page.words?.length || 1);
        return sum + pageConfidence;
      }, 0) / totalPages || 0.85;

      // Extract structured data
      const structuredData = extractStructuredDataFromAzure(analyzeResult);
      
      // Detect materials from content
      const materialResult = await detectMaterialsFromAzureContent(
        analyzeResult.content || '', 
        averageConfidence
      );

      // Process each page and create tiles
      let totalTiles = 0;
      let materialCount = 0;
      const confidenceScores: number[] = [];

      for (const page of analyzeResult.pages || []) {
        const pageNumber = page.pageNumber;
        
        // Create semantic tiles based on content regions
        const lines = page.lines || [];
        const tileSize = extractionOptions.tileSize || 512;
        
        // Group lines into logical tiles
        const tilesPerRow = 3;
        const tilesPerCol = 3;
        const tileWidth = page.width / tilesPerRow;
        const tileHeight = page.height / tilesPerCol;

        for (let row = 0; row < tilesPerCol; row++) {
          for (let col = 0; col < tilesPerRow; col++) {
            const tileIndex = row * tilesPerRow + col;
            const xStart = col * tileWidth;
            const yStart = row * tileHeight;
            const xEnd = xStart + tileWidth;
            const yEnd = yStart + tileHeight;

            // Find content within this tile area
            const tileLines = lines.filter(line => {
              const [x1, y1] = line.polygon.slice(0, 2);
              return x1 >= xStart && x1 <= xEnd && y1 >= yStart && y1 <= yEnd;
            });

            const tileText = tileLines.map(line => line.content).join('\n');
            const tileWords = page.words?.filter(word => {
              const [x1, y1] = word.polygon.slice(0, 2);
              return x1 >= xStart && x1 <= xEnd && y1 >= yStart && y1 <= yEnd;
            }) || [];

            const tileConfidence = tileWords.length > 0 
              ? tileWords.reduce((sum, word) => sum + word.confidence, 0) / tileWords.length
              : 0.85;

            // Detect materials in this tile
            const tileMaterial = await detectMaterialsFromAzureContent(tileText, tileConfidence);
            
            if (tileMaterial.detected) {
              materialCount++;
              confidenceScores.push(tileMaterial.confidence);
            }

            // Create tile record
            const { error: tileError } = await supabase
              .from('pdf_processing_tiles')
              .insert({
                pdf_processing_id: processingId,
                page_number: pageNumber,
                tile_index: tileIndex,
                x_coordinate: Math.round(xStart),
                y_coordinate: Math.round(yStart),
                width: Math.round(tileWidth),
                height: Math.round(tileHeight),
                extracted_text: tileText,
                ocr_confidence: tileConfidence,
                material_detected: tileMaterial.detected,
                material_type: tileMaterial.type,
                material_confidence: tileMaterial.confidence,
                azure_element_type: 'text_region',
                azure_confidence: tileConfidence,
                bounding_polygon: {
                  points: [
                    [xStart, yStart],
                    [xEnd, yStart],
                    [xEnd, yEnd],
                    [xStart, yEnd]
                  ]
                },
                structured_data: extractionOptions.extractStructuredData ? {
                  tile_content: tileText,
                  word_count: tileWords.length,
                  material_properties: tileMaterial.properties
                } : {},
                metadata_extracted: {
                  azure_processed: true,
                  confidence_score: tileConfidence,
                  material_detected: tileMaterial.detected,
                  processing_method: 'azure_document_intelligence'
                }
              });

            if (tileError) {
              console.error('Error creating tile:', tileError);
            } else {
              totalTiles++;
            }
          }
        }
      }

      const processingTime = Date.now() - startTime;
      const avgConfidence = confidenceScores.length > 0 
        ? confidenceScores.reduce((sum, conf) => sum + conf, 0) / confidenceScores.length 
        : averageConfidence;

      // Update processing record with final results
      const { error: updateError } = await supabase
        .from('pdf_processing_results')
        .update({
          processing_status: 'completed',
          processing_completed_at: new Date().toISOString(),
          processing_time_ms: processingTime,
          total_pages: totalPages,
          total_tiles_extracted: totalTiles,
          materials_identified_count: materialCount,
          confidence_score_avg: avgConfidence,
          azure_confidence_score: averageConfidence,
          document_classification: structuredData.document_classification,
          extracted_tables: structuredData.extracted_tables,
          form_fields: structuredData.form_fields,
          document_title: `Azure Analysis: ${originalFilename.replace('.pdf', '')}`,
          document_author: 'Azure Document Intelligence',
          document_subject: 'Material Specifications and Technical Documentation',
          document_keywords: 'materials, azure, ai, document intelligence, specifications'
        })
        .eq('id', processingId);

      if (updateError) {
        console.error('Error updating processing record:', updateError);
      }

      const result = {
        processingId,
        summary: {
          totalPages,
          tilesExtracted: totalTiles,
          materialsIdentified: materialCount,
          averageConfidence: avgConfidence,
          processingTimeMs: processingTime,
          azureModel: 'prebuilt-layout',
          extractedTables: structuredData.extracted_tables.length,
          keyValuePairs: structuredData.key_value_pairs.length
        }
      };

      console.log('Azure Document Intelligence processing completed successfully');

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (processingError) {
      console.error('Processing error:', processingError);
      
      // Update record with error
      await supabase
        .from('pdf_processing_results')
        .update({
          processing_status: 'failed',
          error_message: processingError instanceof Error ? processingError.message : 'Unknown processing error',
          processing_completed_at: new Date().toISOString(),
          processing_time_ms: Date.now() - startTime
        })
        .eq('id', processingId);

      throw processingError;
    }

  } catch (error) {
    console.error('Azure PDF processing error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack available');
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Final error message:', errorMessage);
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: 'Failed to process PDF with Azure Document Intelligence',
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});