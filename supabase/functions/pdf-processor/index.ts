import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProcessingRequest {
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

interface TileData {
  pageNumber: number;
  tileIndex: number;
  xCoordinate: number;
  yCoordinate: number;
  width: number;
  height: number;
  extractedText: string;
  ocrConfidence: number;
  materialDetected: boolean;
  materialType?: string;
  materialConfidence?: number;
  structuredData: any;
  metadataExtracted: any;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const requestData: ProcessingRequest = await req.json();
    const { fileUrl, originalFilename, fileSize, userId, extractionOptions = {} } = requestData;

    if (!fileUrl || !originalFilename || !userId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: fileUrl, originalFilename, userId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Starting PDF processing for:', originalFilename);

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
        tile_size_pixels: extractionOptions.tileSize || 512,
        overlap_percentage: extractionOptions.overlapPercentage || 10,
        ocr_model_version: 'hybrid_ocr_v1.0',
        material_recognition_model_version: 'material_classifier_v2.0'
      })
      .select()
      .single();

    if (createError) {
      throw new Error(`Failed to create processing record: ${createError.message}`);
    }

    const processingId = processingRecord.id;
    const startTime = Date.now();

    try {
      // Simulate PDF processing workflow
      console.log('Processing PDF pages...');
      
      // Mock PDF metadata extraction
      const pdfMetadata = {
        total_pages: 3,
        document_title: 'Material Specification Sheet',
        document_author: 'Material Supplier Inc.',
        document_subject: 'Ceramic Tile Specifications',
        document_keywords: 'ceramic, tile, specifications, technical'
      };

      // Update processing record with PDF metadata
      await supabase
        .from('pdf_processing_results')
        .update(pdfMetadata)
        .eq('id', processingId);

      // Mock tile processing for each page
      const allTiles: TileData[] = [];
      let materialCount = 0;
      const confidenceScores: number[] = [];

      for (let pageNum = 1; pageNum <= pdfMetadata.total_pages; pageNum++) {
        console.log(`Processing page ${pageNum}...`);
        
        // Simulate tiling (2x2 grid per page)
        const tilesPerPage = 4;
        const tileSize = extractionOptions.tileSize || 512;
        
        for (let tileIdx = 0; tileIdx < tilesPerPage; tileIdx++) {
          const xPos = (tileIdx % 2) * tileSize;
          const yPos = Math.floor(tileIdx / 2) * tileSize;
          
          // Mock OCR extraction
          const extractedText = generateMockOCRText(pageNum, tileIdx);
          const ocrConfidence = 0.85 + Math.random() * 0.1;
          
          // Mock material detection
          const materialDetected = Math.random() > 0.6; // 40% chance
          let materialType: string | undefined;
          let materialConfidence: number | undefined;
          let structuredData = {};
          let metadataExtracted = {};

          if (materialDetected) {
            materialCount++;
            materialType = getMockMaterialType(pageNum, tileIdx);
            materialConfidence = 0.75 + Math.random() * 0.2;
            confidenceScores.push(materialConfidence);
            
            // Generate structured data based on material type
            structuredData = generateMockStructuredData(materialType);
            metadataExtracted = generateMockMetadata(materialType);
          }

          const tileData: TileData = {
            pageNumber: pageNum,
            tileIndex: tileIdx,
            xCoordinate: xPos,
            yCoordinate: yPos,
            width: tileSize,
            height: tileSize,
            extractedText,
            ocrConfidence,
            materialDetected,
            materialType,
            materialConfidence,
            structuredData,
            metadataExtracted
          };

          allTiles.push(tileData);

          // Insert tile record
          await supabase
            .from('pdf_processing_tiles')
            .insert({
              pdf_processing_id: processingId,
              page_number: pageNum,
              tile_index: tileIdx,
              x_coordinate: xPos,
              y_coordinate: yPos,
              width: tileSize,
              height: tileSize,
              extracted_text: extractedText,
              ocr_confidence: ocrConfidence,
              material_detected: materialDetected,
              material_type: materialType,
              material_confidence: materialConfidence,
              structured_data: structuredData,
              metadata_extracted: metadataExtracted,
              image_url: `https://example.com/tiles/${processingId}/${pageNum}_${tileIdx}.jpg`
            });
        }

        // Add small delay to simulate processing time
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const processingTime = Date.now() - startTime;
      const avgConfidence = confidenceScores.length > 0 
        ? confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length 
        : 0;

      // Update final processing results
      await supabase
        .from('pdf_processing_results')
        .update({
          processing_status: 'completed',
          processing_completed_at: new Date().toISOString(),
          processing_time_ms: processingTime,
          total_tiles_extracted: allTiles.length,
          materials_identified_count: materialCount,
          confidence_score_avg: Math.round(avgConfidence * 100) / 100
        })
        .eq('id', processingId);

      console.log(`PDF processing completed successfully. ${allTiles.length} tiles processed, ${materialCount} materials identified.`);

      return new Response(
        JSON.stringify({
          success: true,
          processingId,
          summary: {
            totalPages: pdfMetadata.total_pages,
            tilesExtracted: allTiles.length,
            materialsIdentified: materialCount,
            averageConfidence: avgConfidence,
            processingTimeMs: processingTime
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (processingError) {
      console.error('Error during PDF processing:', processingError);
      
      // Update processing record with error
      await supabase
        .from('pdf_processing_results')
        .update({
          processing_status: 'failed',
          processing_completed_at: new Date().toISOString(),
          error_message: processingError.message,
          processing_time_ms: Date.now() - startTime
        })
        .eq('id', processingId);

      throw processingError;
    }

  } catch (error) {
    console.error('Error in PDF processor:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper functions for mock data generation
function generateMockOCRText(pageNum: number, tileIdx: number): string {
  const texts = [
    "Material Specification\nProduct: Ceramic Floor Tile\nSize: 600x600mm\nThickness: 10mm",
    "Technical Properties\nWater Absorption: <0.5%\nSlip Resistance: R11\nPEI Rating: 4",
    "Installation Requirements\nAdhesive Type: C2 TE S1\nJoint Width: 3-5mm\nSubfloor: Level, dry",
    "Quality Standards\nISO 13006 Group BIa\nCE Marking: Available\nFrost Resistance: Yes",
    "Color Information\nBase Color: Cream White\nVariation: V2 - Slight\nFinish: Matt",
    "Usage Recommendations\nResidential: Yes\nCommercial: Yes\nExterior: Yes"
  ];
  
  return texts[(pageNum - 1) * 4 + tileIdx] || "Additional specification text...";
}

function getMockMaterialType(pageNum: number, tileIdx: number): string {
  const types = ['ceramics', 'concrete', 'wood', 'metals'];
  return types[(pageNum + tileIdx) % types.length];
}

function generateMockStructuredData(materialType: string): any {
  const baseData = {
    brand: "Premium Materials Co.",
    collection: "Professional Series",
    model: `${materialType.toUpperCase()}-PRO-001`,
    origin_country: "Italy"
  };

  switch (materialType) {
    case 'ceramics':
      return {
        ...baseData,
        tile_type: "porcelain",
        length: 600,
        width: 600,
        thickness: 10,
        dimension_unit: "mm",
        water_absorption: "BIa (≤0.5%)",
        slip_resistance: "R11",
        pei_rating: "4",
        surface_finish: "Matte",
        frost_resistance: true
      };
    case 'concrete':
      return {
        ...baseData,
        stone_type: "limestone",
        compressive_strength: 45.5,
        stone_density: 2650,
        formation_type: "sedimentary"
      };
    case 'wood':
      return {
        ...baseData,
        wood_type: "engineered",
        wood_species: "Oak",
        species_family: "hardwood",
        janka_hardness: 1290
      };
    default:
      return baseData;
  }
}

function generateMockMetadata(materialType: string): any {
  return {
    extraction_confidence: 0.89,
    source_section: "technical_specifications",
    page_location: "center",
    text_quality: "high",
    material_category_detected: materialType,
    structured_fields_found: ["dimensions", "properties", "specifications"]
  };
}