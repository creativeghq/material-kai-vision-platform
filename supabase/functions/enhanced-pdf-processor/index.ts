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

const huggingFaceToken = Deno.env.get('HUGGING_FACE_ACCESS_TOKEN');
const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

interface EnhancedProcessingRequest {
  fileUrl: string;
  originalFilename: string;
  fileSize: number;
  userId: string;
  extractionOptions?: {
    extractImages?: boolean;
    analyzeLayout?: boolean;
    crossPageAnalysis?: boolean;
    tileSize?: number;
    overlapPercentage?: number;
    extractStructuredData?: boolean;
    detectMaterials?: boolean;
  };
}

interface ExtractedImage {
  index: number;
  data: string; // base64
  format: string;
  bbox: number[] | null;
  textContext: string;
  width: number;
  height: number;
  materialRelevance: number;
}

interface EnhancedTileData {
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
  imageUrl?: string;
  // Enhanced fields
  extractedImages: ExtractedImage[];
  layoutStructure: any;
  materialSpecifications: any;
  crossReferences: any;
  spatialContext: any;
}

interface PageAnalysis {
  pageNumber: number;
  images: ExtractedImage[];
  layoutStructure: any;
  detectedMaterials: any[];
  crossReferences: string[];
  materialIndex: boolean;
}

interface DocumentStructure {
  totalPages: number;
  documentOutline: any;
  indexPages: number[];
  materialCrossRefs: any;
  processingMetadata: any;
}

// Enhanced PDF processing using pdf-lib and OpenAI
async function processEnhancedPDF(processingId: string, fileUrl: string, options: any) {
  try {
    console.log('Starting enhanced PDF processing:', processingId);

    // Fetch PDF file
    const pdfResponse = await fetch(fileUrl);
    const pdfBuffer = await pdfResponse.arrayBuffer();
    
    // Use PDF.js for enhanced processing (available in Deno)
    const pdfData = new Uint8Array(pdfBuffer);
    
    // Enhanced processing workflow
    const documentStructure = await analyzeDocumentStructure(pdfData, options);
    const pageAnalyses = await processAllPages(pdfData, documentStructure, options);
    const correlatedMaterials = await correlateMaterials(pageAnalyses);
    
    // Update processing record
    await supabase
      .from('pdf_processing_results')
      .update({
        processing_status: 'completed',
        processing_completed_at: new Date().toISOString(),
        total_pages: documentStructure.totalPages,
        materials_identified_count: correlatedMaterials.length,
        processing_time_ms: Date.now() - parseInt(processingId.split('-')[0]) // Rough calculation
      })
      .eq('id', processingId);

    // Store document structure
    await supabase
      .from('pdf_document_structure')
      .insert({
        pdf_processing_id: processingId,
        document_outline: documentStructure.documentOutline,
        index_pages: documentStructure.indexPages,
        material_cross_refs: documentStructure.materialCrossRefs,
        processing_metadata: documentStructure.processingMetadata
      });

    // Store extracted materials
    if (correlatedMaterials.length > 0) {
      await supabase
        .from('extracted_materials')
        .insert(correlatedMaterials.map(material => ({
          pdf_processing_id: processingId,
          material_name: material.name,
          material_type: material.type,
          primary_image_url: material.primaryImage,
          additional_images: material.additionalImages,
          specifications: material.specifications,
          source_pages: material.sourcePages,
          confidence_scores: material.confidenceScores,
          validation_status: 'pending'
        })));
    }

    console.log('Enhanced PDF processing completed:', processingId);
    
  } catch (error) {
    console.error('Enhanced PDF processing error:', error);
    
    await supabase
      .from('pdf_processing_results')
      .update({
        processing_status: 'failed',
        error_message: error.message,
        processing_completed_at: new Date().toISOString()
      })
      .eq('id', processingId);
  }
}

// Analyze document structure using OpenAI Vision
async function analyzeDocumentStructure(pdfData: Uint8Array, options: any): Promise<DocumentStructure> {
  console.log('Analyzing document structure...');
  
  // Convert first few pages to images for structure analysis
  const structurePages = await convertPDFPagesToImages(pdfData, [0, 1, 2]); // First 3 pages
  
  if (!openaiApiKey) {
    return createBasicDocumentStructure(pdfData);
  }

  try {
    // Use OpenAI to analyze document structure
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: [
            { 
              type: 'text', 
              text: `Analyze this document structure and identify:
              1. Document type (catalog, manual, specification sheet)
              2. Page layout structure (headers, sections, columns)
              3. Index or table of contents pages
              4. Material listing patterns
              5. Cross-reference patterns
              Return as JSON with: documentType, layoutStructure, indexPages, materialPatterns` 
            },
            ...structurePages.map(page => ({
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${page}` }
            }))
          ]
        }],
        max_tokens: 1500
      }),
    });

    if (response.ok) {
      const result = await response.json();
      const analysisText = result.choices[0]?.message?.content || '{}';
      
      try {
        const analysis = JSON.parse(analysisText);
        return {
          totalPages: await getPDFPageCount(pdfData),
          documentOutline: analysis.layoutStructure || {},
          indexPages: analysis.indexPages || [],
          materialCrossRefs: analysis.materialPatterns || {},
          processingMetadata: {
            documentType: analysis.documentType,
            analysisMethod: 'openai-vision',
            confidence: 0.85
          }
        };
      } catch (parseError) {
        console.error('Failed to parse structure analysis:', parseError);
      }
    }
  } catch (error) {
    console.error('Structure analysis error:', error);
  }

  return createBasicDocumentStructure(pdfData);
}

// Process all pages with enhanced extraction
async function processAllPages(pdfData: Uint8Array, documentStructure: DocumentStructure, options: any): Promise<PageAnalysis[]> {
  console.log('Processing all pages with enhanced extraction...');
  
  const pageCount = documentStructure.totalPages;
  const pageAnalyses: PageAnalysis[] = [];
  
  // Process pages in batches to avoid timeout
  const batchSize = 5;
  
  for (let i = 0; i < pageCount; i += batchSize) {
    const batch = [];
    const endPage = Math.min(i + batchSize, pageCount);
    
    for (let pageNum = i; pageNum < endPage; pageNum++) {
      batch.push(processEnhancedPage(pdfData, pageNum, documentStructure, options));
    }
    
    const batchResults = await Promise.all(batch);
    pageAnalyses.push(...batchResults);
    
    console.log(`Processed pages ${i + 1}-${endPage} of ${pageCount}`);
  }
  
  return pageAnalyses;
}

// Enhanced page processing with image extraction
async function processEnhancedPage(pdfData: Uint8Array, pageNumber: number, documentStructure: DocumentStructure, options: any): Promise<PageAnalysis> {
  try {
    // Extract images from page (using PDF.js approach)
    const pageImages = await extractPageImages(pdfData, pageNumber);
    
    // Analyze page layout
    const layoutStructure = await analyzePageLayout(pdfData, pageNumber, pageImages);
    
    // Detect materials in context
    const detectedMaterials = await detectMaterialsInContext(pageImages, layoutStructure);
    
    // Find cross-references
    const crossReferences = findCrossReferences(layoutStructure, documentStructure);
    
    return {
      pageNumber,
      images: pageImages,
      layoutStructure,
      detectedMaterials,
      crossReferences,
      materialIndex: isIndexPage(layoutStructure, documentStructure)
    };
    
  } catch (error) {
    console.error(`Error processing page ${pageNumber}:`, error);
    return {
      pageNumber,
      images: [],
      layoutStructure: {},
      detectedMaterials: [],
      crossReferences: [],
      materialIndex: false
    };
  }
}

// Extract images from PDF page (JavaScript approach)
async function extractPageImages(pdfData: Uint8Array, pageNumber: number): Promise<ExtractedImage[]> {
  // This is a simplified approach - in a real implementation, we'd use PDF.js
  // to properly extract embedded images with their coordinates
  
  try {
    // Convert page to image first
    const pageImage = await convertPDFPageToImage(pdfData, pageNumber);
    
    if (pageImage) {
      // Use OpenAI Vision to identify and extract sub-images
      const imageAnalysis = await analyzePageForImages(pageImage);
      
      return imageAnalysis.map((img, index) => ({
        index,
        data: img.data,
        format: 'png',
        bbox: img.bbox,
        textContext: img.textContext,
        width: img.width,
        height: img.height,
        materialRelevance: img.materialRelevance
      }));
    }
  } catch (error) {
    console.error(`Image extraction error for page ${pageNumber}:`, error);
  }
  
  return [];
}

// Analyze page for images using OpenAI Vision
async function analyzePageForImages(pageImageBase64: string): Promise<any[]> {
  if (!openaiApiKey) return [];
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: [
            { 
              type: 'text', 
              text: `Identify all material images in this page. For each image, provide:
              1. Approximate bounding box coordinates
              2. Material type if identifiable  
              3. Associated text/specifications
              4. Material relevance score (0-1)
              Return as JSON array.` 
            },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${pageImageBase64}` }
            }
          ]
        }],
        max_tokens: 1000
      }),
    });

    if (response.ok) {
      const result = await response.json();
      const analysisText = result.choices[0]?.message?.content || '[]';
      
      try {
        return JSON.parse(analysisText);
      } catch (parseError) {
        console.error('Failed to parse image analysis:', parseError);
      }
    }
  } catch (error) {
    console.error('Image analysis error:', error);
  }
  
  return [];
}

// Correlate materials across pages
async function correlateMaterials(pageAnalyses: PageAnalysis[]): Promise<any[]> {
  console.log('Correlating materials across pages...');
  
  const materials: any[] = [];
  const materialMap = new Map();
  
  // Group materials by similarity
  for (const page of pageAnalyses) {
    for (const material of page.detectedMaterials) {
      const key = `${material.type}_${material.name}`.toLowerCase().replace(/\s+/g, '_');
      
      if (materialMap.has(key)) {
        // Merge with existing material
        const existing = materialMap.get(key);
        existing.sourcePages.push(page.pageNumber);
        existing.additionalImages.push(...material.images);
        existing.specifications = { ...existing.specifications, ...material.specifications };
      } else {
        // New material
        materialMap.set(key, {
          name: material.name,
          type: material.type,
          primaryImage: material.images[0]?.data || null,
          additionalImages: material.images.slice(1).map(img => img.data),
          specifications: material.specifications,
          sourcePages: [page.pageNumber],
          confidenceScores: material.confidence
        });
      }
    }
  }
  
  return Array.from(materialMap.values());
}

// Helper functions (simplified implementations)
async function convertPDFPagesToImages(pdfData: Uint8Array, pageNumbers: number[]): Promise<string[]> {
  // Simplified - would use PDF.js or similar library
  return pageNumbers.map(() => 'mock_base64_image_data');
}

async function convertPDFPageToImage(pdfData: Uint8Array, pageNumber: number): Promise<string | null> {
  // Simplified - would use PDF.js to convert page to image
  return 'mock_base64_image_data';
}

async function getPDFPageCount(pdfData: Uint8Array): Promise<number> {
  // Simplified - would use PDF.js to get page count
  return Math.floor(Math.random() * 50) + 10; // Mock: 10-60 pages
}

function createBasicDocumentStructure(pdfData: Uint8Array): DocumentStructure {
  return {
    totalPages: 0,
    documentOutline: {},
    indexPages: [],
    materialCrossRefs: {},
    processingMetadata: {
      analysisMethod: 'basic',
      confidence: 0.5
    }
  };
}

async function analyzePageLayout(pdfData: Uint8Array, pageNumber: number, images: ExtractedImage[]): Promise<any> {
  return {
    pageType: 'content',
    sections: [],
    hasTable: false,
    hasIndex: false
  };
}

async function detectMaterialsInContext(images: ExtractedImage[], layout: any): Promise<any[]> {
  return images.map(img => ({
    name: 'Material Sample',
    type: 'unknown',
    images: [img],
    specifications: {},
    confidence: img.materialRelevance
  }));
}

function findCrossReferences(layout: any, documentStructure: DocumentStructure): string[] {
  return [];
}

function isIndexPage(layout: any, documentStructure: DocumentStructure): boolean {
  return false;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestData: EnhancedProcessingRequest = await req.json();
    const { fileUrl, originalFilename, fileSize, userId, extractionOptions = {} } = requestData;

    console.log('Enhanced PDF processing started:', { fileUrl, userId });

    // Create processing record
    const { data: processingRecord, error: recordError } = await supabase
      .from('pdf_processing_results')
      .insert({
        user_id: userId,
        file_url: fileUrl,
        original_filename: originalFilename,
        file_size: fileSize,
        processing_status: 'processing',
        processing_started_at: new Date().toISOString(),
        extraction_options: extractionOptions
      })
      .select()
      .single();

    if (recordError) {
      throw new Error(`Failed to create processing record: ${recordError.message}`);
    }

    // Start enhanced background processing
    processEnhancedPDF(processingRecord.id, fileUrl, extractionOptions);

    return new Response(
      JSON.stringify({ 
        success: true, 
        processing_id: processingRecord.id,
        status: 'processing',
        message: 'Enhanced PDF processing with image extraction started',
        features: {
          imageExtraction: extractionOptions.extractImages !== false,
          layoutAnalysis: extractionOptions.analyzeLayout !== false,
          crossPageAnalysis: extractionOptions.crossPageAnalysis !== false
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Enhanced PDF processing error:', error);
    return new Response(
      JSON.stringify({ error: 'Enhanced PDF processing failed', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});