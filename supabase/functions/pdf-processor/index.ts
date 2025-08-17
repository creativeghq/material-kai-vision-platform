import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

interface PDFProcessRequest {
  file_id?: string;
  file_url?: string;
  file_data?: string; // Base64 encoded PDF data
  processing_options: {
    extract_text?: boolean;
    extract_images?: boolean;
    extract_metadata?: boolean;
    extract_tables?: boolean;
    extract_forms?: boolean;
    ocr_enabled?: boolean;
    language?: string;
    page_range?: {
      start?: number;
      end?: number;
    };
  };
  output_format?: 'json' | 'markdown' | 'text' | 'structured';
  user_id?: string;
}

interface PDFMetadata {
  title?: string;
  author?: string;
  subject?: string;
  creator?: string;
  producer?: string;
  creation_date?: string;
  modification_date?: string;
  page_count: number;
  file_size: number;
  pdf_version?: string;
  encrypted: boolean;
  form_fields: boolean;
  javascript: boolean;
  annotations: boolean;
}

interface PDFPage {
  page_number: number;
  text_content: string;
  images: {
    image_id: string;
    position: { x: number; y: number; width: number; height: number };
    format: string;
    size: number;
    extracted_data?: string; // Base64 encoded image data
  }[];
  tables: {
    table_id: string;
    position: { x: number; y: number; width: number; height: number };
    rows: string[][];
    headers?: string[];
  }[];
  forms: {
    field_name: string;
    field_type: string;
    field_value: string;
    position: { x: number; y: number; width: number; height: number };
  }[];
  annotations: {
    type: string;
    content: string;
    position: { x: number; y: number; width: number; height: number };
  }[];
}

interface PDFProcessResult {
  document_info: {
    metadata: PDFMetadata;
    processing_summary: {
      pages_processed: number;
      text_extracted: boolean;
      images_extracted: number;
      tables_extracted: number;
      forms_extracted: number;
      ocr_applied: boolean;
    };
  };
  pages: PDFPage[];
  extracted_content: {
    full_text: string;
    structured_data: {
      headings: { level: number; text: string; page: number }[];
      paragraphs: { text: string; page: number }[];
      lists: { type: 'ordered' | 'unordered'; items: string[]; page: number }[];
      tables: { headers: string[]; rows: string[][]; page: number }[];
    };
    images_summary: {
      total_images: number;
      formats: Record<string, number>;
      total_size: number;
    };
    forms_summary: {
      total_fields: number;
      field_types: Record<string, number>;
      filled_fields: number;
    };
  };
  quality_assessment: {
    text_quality: 'excellent' | 'good' | 'fair' | 'poor';
    image_quality: 'excellent' | 'good' | 'fair' | 'poor';
    extraction_confidence: number;
    issues: string[];
    recommendations: string[];
  };
  processing_metadata: {
    processing_time_ms: number;
    file_size_bytes: number;
    output_size_bytes: number;
    compression_ratio: number;
    processing_method: string;
  };
}

// Simulated PDF processing functions
async function extractPDFMetadata(pdfData: Uint8Array): Promise<PDFMetadata> {
  // Simulate PDF metadata extraction
  return {
    title: 'Material Analysis Report',
    author: 'Materials Lab',
    subject: 'Composite Material Properties',
    creator: 'PDF Generator v2.1',
    producer: 'Advanced PDF Library',
    creation_date: '2024-01-15T10:30:00Z',
    modification_date: '2024-01-15T14:45:00Z',
    page_count: 25,
    file_size: pdfData.length,
    pdf_version: '1.7',
    encrypted: false,
    form_fields: true,
    javascript: false,
    annotations: true,
  };
}

async function extractTextFromPDF(pdfData: Uint8Array, options: any): Promise<PDFPage[]> {
  const pages: PDFPage[] = [];

  // Simulate text extraction from multiple pages
  const sampleTexts = [
    'Executive Summary\n\nThis report presents a comprehensive analysis of advanced composite materials used in aerospace applications. The study focuses on carbon fiber reinforced polymers (CFRP) and their mechanical properties under various environmental conditions.',

    '1. Introduction\n\nComposite materials have revolutionized the aerospace industry due to their exceptional strength-to-weight ratio and design flexibility. This study examines the performance characteristics of next-generation CFRP materials.',

    '2. Material Specifications\n\nThe tested materials include:\n- T800/M21 carbon fiber prepreg\n- IM7/8552 unidirectional tape\n- T700/VTM264 fabric prepreg\n\nEach material was manufactured according to aerospace quality standards.',

    '3. Testing Methodology\n\nTensile testing was performed according to ASTM D3039 standard. Specimens were conditioned at 23°C and 50% relative humidity for 48 hours prior to testing.',

    '4. Results and Analysis\n\nTensile Strength Results:\n- T800/M21: 2,950 MPa (±150 MPa)\n- IM7/8552: 3,100 MPa (±120 MPa)\n- T700/VTM264: 2,750 MPa (±180 MPa)',
  ];

  for (let i = 0; i < Math.min(sampleTexts.length, options.page_range?.end || 25); i++) {
    if (options.page_range?.start && i < options.page_range.start - 1) continue;

    pages.push({
      page_number: i + 1,
      text_content: sampleTexts[i] || `Page ${i + 1} content - Additional technical details and analysis data.`,
      images: await extractImagesFromPage(i + 1, options.extract_images),
      tables: await extractTablesFromPage(i + 1, options.extract_tables),
      forms: await extractFormsFromPage(i + 1, options.extract_forms),
      annotations: [],
    });
  }

  return pages;
}

async function extractImagesFromPage(pageNumber: number, extractImages: boolean): Promise<any[]> {
  if (!extractImages) return [];

  // Simulate image extraction
  const images: Array<{
    image_id: string;
    position: { x: number; y: number; width: number; height: number; };
    format: string;
    size: number;
    extracted_data: string;
  }> = [];
  if (pageNumber <= 3) { // First few pages have images
    images.push({
      image_id: `img_${pageNumber}_1`,
      position: { x: 100, y: 200, width: 400, height: 300 },
      format: 'JPEG',
      size: 45000,
      extracted_data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', // Placeholder base64
    });
  }

  return images;
}

async function extractTablesFromPage(pageNumber: number, extractTables: boolean): Promise<any[]> {
  if (!extractTables) return [];

  // Simulate table extraction
  const tables: Array<{
    table_id: string;
    position: { x: number; y: number; width: number; height: number; };
    headers: string[];
    rows: string[][];
  }> = [];
  if (pageNumber === 5) { // Results page has tables
    tables.push({
      table_id: `table_${pageNumber}_1`,
      position: { x: 50, y: 300, width: 500, height: 200 },
      headers: ['Material', 'Tensile Strength (MPa)', 'Elastic Modulus (GPa)', 'Strain at Failure (%)'],
      rows: [
        ['T800/M21', '2,950', '165', '1.8'],
        ['IM7/8552', '3,100', '170', '1.9'],
        ['T700/VTM264', '2,750', '155', '1.7'],
      ],
    });
  }

  return tables;
}

async function extractFormsFromPage(pageNumber: number, extractForms: boolean): Promise<any[]> {
  if (!extractForms) return [];

  // Simulate form field extraction
  const forms: Array<{
    field_name: string;
    field_type: string;
    field_value: string;
    position: { x: number; y: number; width: number; height: number; };
  }> = [];
  if (pageNumber === 1) { // First page might have form fields
    forms.push(
      {
        field_name: 'report_date',
        field_type: 'text',
        field_value: '2024-01-15',
        position: { x: 400, y: 50, width: 100, height: 20 },
      },
      {
        field_name: 'lab_technician',
        field_type: 'text',
        field_value: 'Dr. Sarah Johnson',
        position: { x: 400, y: 80, width: 150, height: 20 },
      },
    );
  }

  return forms;
}

async function performOCR(pdfData: Uint8Array, language: string): Promise<string> {
  // Simulate OCR processing
  return 'OCR extracted text: Additional text content extracted from images and scanned portions of the document.';
}

function analyzeTextQuality(pages: PDFPage[]): 'excellent' | 'good' | 'fair' | 'poor' {
  const totalText = pages.reduce((sum, page) => sum + page.text_content.length, 0);
  const avgTextPerPage = totalText / pages.length;

  if (avgTextPerPage > 500) return 'excellent';
  if (avgTextPerPage > 300) return 'good';
  if (avgTextPerPage > 100) return 'fair';
  return 'poor';
}

function analyzeImageQuality(pages: PDFPage[]): 'excellent' | 'good' | 'fair' | 'poor' {
  const totalImages = pages.reduce((sum, page) => sum + page.images.length, 0);
  const avgImageSize = pages.reduce((sum, page) =>
    sum + page.images.reduce((imgSum, img) => imgSum + img.size, 0), 0) / Math.max(totalImages, 1);

  if (avgImageSize > 50000) return 'excellent';
  if (avgImageSize > 30000) return 'good';
  if (avgImageSize > 10000) return 'fair';
  return 'poor';
}

function extractStructuredData(pages: PDFPage[]): any {
  const headings: any[] = [];
  const paragraphs: any[] = [];
  const lists: any[] = [];
  const tables: any[] = [];

  pages.forEach(page => {
    const lines = page.text_content.split('\n');

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;

      // Detect headings (simple heuristic)
      if (trimmed.match(/^\d+\.\s+/) || trimmed === trimmed.toUpperCase()) {
        headings.push({
          level: trimmed.match(/^\d+\.\s+/) ? 1 : 0,
          text: trimmed,
          page: page.page_number,
        });
      }
      // Detect lists
      else if (trimmed.match(/^[-*]\s+/)) {
        const existingList = lists.find(l => l.page === page.page_number);
        if (existingList) {
          existingList.items.push(trimmed.substring(2));
        } else {
          lists.push({
            type: 'unordered' as const,
            items: [trimmed.substring(2)],
            page: page.page_number,
          });
        }
      }
      // Regular paragraphs
      else if (trimmed.length > 50) {
        paragraphs.push({
          text: trimmed,
          page: page.page_number,
        });
      }
    });

    // Add extracted tables
    page.tables.forEach(table => {
      tables.push({
        headers: table.headers || [],
        rows: table.rows,
        page: page.page_number,
      });
    });
  });

  return { headings, paragraphs, lists, tables };
}

async function processPDF(request: PDFProcessRequest): Promise<PDFProcessResult> {
  const startTime = Date.now();

  try {
    console.log('Processing PDF with options:', request.processing_options);

    // Get PDF data
    let pdfData: Uint8Array;
    let fileInfo: any = {};

    if (request.file_id) {
      const { data, error } = await supabase
        .from('uploaded_files')
        .select('*')
        .eq('id', request.file_id)
        .single();

      if (error) throw new Error(`File not found: ${error.message}`);
      fileInfo = data;

      // In a real implementation, you would fetch the actual file data
      pdfData = new Uint8Array(1024 * 1024); // Simulate 1MB PDF
    } else if (request.file_url) {
      // Fetch PDF from URL
      const response = await fetch(request.file_url);
      if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.statusText}`);
      pdfData = new Uint8Array(await response.arrayBuffer());
    } else if (request.file_data) {
      // Decode base64 data
      const binaryString = atob(request.file_data);
      pdfData = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        pdfData[i] = binaryString.charCodeAt(i);
      }
    } else {
      throw new Error('No PDF source provided');
    }

    // Extract metadata
    const metadata = await extractPDFMetadata(pdfData);

    // Extract content based on options
    const pages = await extractTextFromPDF(pdfData, request.processing_options);

    // Apply OCR if requested
    let ocrText = '';
    if (request.processing_options.ocr_enabled) {
      ocrText = await performOCR(pdfData, request.processing_options.language || 'en');
    }

    // Combine all text
    const fullText = pages.map(p => p.text_content).join('\n\n') +
                    (ocrText ? '\n\nOCR Content:\n' + ocrText : '');

    // Extract structured data
    const structuredData = extractStructuredData(pages);

    // Calculate summaries
    const imagesSummary = {
      total_images: pages.reduce((sum, p) => sum + p.images.length, 0),
      formats: pages.reduce((formats, p) => {
        p.images.forEach(img => {
          formats[img.format] = (formats[img.format] || 0) + 1;
        });
        return formats;
      }, {} as Record<string, number>),
      total_size: pages.reduce((sum, p) =>
        sum + p.images.reduce((imgSum, img) => imgSum + img.size, 0), 0),
    };

    const formsSummary = {
      total_fields: pages.reduce((sum, p) => sum + p.forms.length, 0),
      field_types: pages.reduce((types, p) => {
        p.forms.forEach(form => {
          types[form.field_type] = (types[form.field_type] || 0) + 1;
        });
        return types;
      }, {} as Record<string, number>),
      filled_fields: pages.reduce((sum, p) =>
        sum + p.forms.filter(f => f.field_value.trim() !== '').length, 0),
    };

    // Quality assessment
    const textQuality = analyzeTextQuality(pages);
    const imageQuality = analyzeImageQuality(pages);
    const extractionConfidence = textQuality === 'excellent' ? 0.95 :
                                textQuality === 'good' ? 0.85 :
                                textQuality === 'fair' ? 0.70 : 0.50;

    const issues: string[] = [];
    const recommendations: string[] = [];

    if (textQuality === 'poor') {
      issues.push('Low text extraction quality detected');
      recommendations.push('Consider enabling OCR for better text extraction');
    }

    if (imagesSummary.total_images === 0 && request.processing_options.extract_images) {
      issues.push('No images found in document');
    }

    if (formsSummary.filled_fields < formsSummary.total_fields * 0.5) {
      issues.push('Many form fields are empty');
    }

    const processingTime = Date.now() - startTime;
    const outputSize = JSON.stringify({ pages, structuredData }).length;

    const result: PDFProcessResult = {
      document_info: {
        metadata,
        processing_summary: {
          pages_processed: pages.length,
          text_extracted: request.processing_options.extract_text !== false,
          images_extracted: imagesSummary.total_images,
          tables_extracted: pages.reduce((sum, p) => sum + p.tables.length, 0),
          forms_extracted: formsSummary.total_fields,
          ocr_applied: request.processing_options.ocr_enabled || false,
        },
      },
      pages,
      extracted_content: {
        full_text: fullText,
        structured_data: structuredData,
        images_summary: imagesSummary,
        forms_summary: formsSummary,
      },
      quality_assessment: {
        text_quality: textQuality,
        image_quality: imageQuality,
        extraction_confidence: extractionConfidence,
        issues,
        recommendations,
      },
      processing_metadata: {
        processing_time_ms: processingTime,
        file_size_bytes: pdfData.length,
        output_size_bytes: outputSize,
        compression_ratio: outputSize / pdfData.length,
        processing_method: 'simulated_extraction',
      },
    };

    // Store processing results
    await supabase
      .from('pdf_processing_results')
      .insert({
        file_id: request.file_id,
        file_url: request.file_url,
        processing_options: request.processing_options,
        metadata: metadata,
        pages_processed: pages.length,
        extraction_confidence: extractionConfidence,
        processing_time_ms: processingTime,
        user_id: request.user_id,
        created_at: new Date().toISOString(),
      });

    // Log analytics
    if (request.user_id) {
      await supabase
        .from('analytics_events')
        .insert({
          user_id: request.user_id,
          event_type: 'pdf_processing',
          event_data: {
            pages_processed: pages.length,
            text_extracted: result.document_info.processing_summary.text_extracted,
            images_extracted: imagesSummary.total_images,
            tables_extracted: result.document_info.processing_summary.tables_extracted,
            processing_time_ms: processingTime,
            extraction_confidence: extractionConfidence,
          },
        });
    }

    return result;

  } catch (error) {
    console.error('PDF processing error:', error);
    throw error;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: PDFProcessRequest = await req.json();

    console.log('Processing PDF request:', {
      has_file_id: !!request.file_id,
      has_file_url: !!request.file_url,
      has_file_data: !!request.file_data,
      options: request.processing_options,
    });

    if (!request.file_id && !request.file_url && !request.file_data) {
      return new Response(
        JSON.stringify({ error: 'One of file_id, file_url, or file_data is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    if (!request.processing_options) {
      return new Response(
        JSON.stringify({ error: 'processing_options is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const result = await processPDF(request);

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );

  } catch (error) {
    console.error('PDF processor error:', error);

    return new Response(
      JSON.stringify({
        error: 'PDF processing failed',
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
