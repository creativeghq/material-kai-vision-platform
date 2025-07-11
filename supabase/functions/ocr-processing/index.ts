import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OCRRequest {
  imageUrl: string;
  options?: {
    language?: string;
    extractStructuredData?: boolean;
    documentType?: 'certificate' | 'label' | 'specification' | 'general';
    materialContext?: string;
  };
  userId?: string;
}

interface OCRResult {
  text: string;
  confidence: number;
  language?: string;
  structuredData?: any;
  documentType?: string;
  processingTime?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const { imageUrl, options = {}, userId }: OCRRequest = await req.json();
    
    if (!imageUrl) {
      throw new Error('Image URL is required');
    }

    const startTime = Date.now();
    console.log('Processing OCR request:', { imageUrl, options, userId });

    // Build OpenAI prompt based on document type and context
    const systemPrompt = buildSystemPrompt(options.documentType, options.materialContext);
    
    // Call OpenAI Vision API for OCR
    const ocrResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: options.extractStructuredData 
                  ? 'Extract and structure all text from this image. Focus on material properties, specifications, and any technical data.'
                  : 'Extract all text from this image accurately.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        max_tokens: 2000,
        temperature: 0.1 // Low temperature for accurate text extraction
      }),
    });

    if (!ocrResponse.ok) {
      const error = await ocrResponse.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const ocrData = await ocrResponse.json();
    const extractedContent = ocrData.choices[0].message.content;
    
    // Parse structured data if requested
    let structuredData = null;
    let plainText = extractedContent;
    
    if (options.extractStructuredData) {
      try {
        // Try to parse JSON if the response is structured
        if (extractedContent.trim().startsWith('{')) {
          const parsed = JSON.parse(extractedContent);
          structuredData = parsed.structuredData || parsed;
          plainText = parsed.plainText || parsed.text || extractedContent;
        } else {
          // Extract structured patterns from plain text
          structuredData = extractMaterialProperties(extractedContent);
          plainText = extractedContent;
        }
      } catch (e) {
        console.log('Failed to parse structured data, using plain text');
        structuredData = extractMaterialProperties(extractedContent);
      }
    }

    // Detect language
    const detectedLanguage = detectLanguage(plainText);
    
    const result: OCRResult = {
      text: plainText,
      confidence: calculateConfidence(plainText),
      language: detectedLanguage,
      structuredData,
      documentType: options.documentType,
      processingTime: Date.now() - startTime
    };

    // Store OCR result in database if user provided
    if (userId) {
      await supabaseClient
        .from('ml_processing_queue')
        .insert({
          user_id: userId,
          task_type: 'ocr_processing',
          input_data: { imageUrl, options },
          result_data: result,
          status: 'completed',
          processing_time_ms: result.processingTime,
          completed_at: new Date().toISOString()
        });
    }

    console.log('OCR processing completed successfully');
    
    return new Response(JSON.stringify({ 
      success: true, 
      data: result 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in OCR processing:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function buildSystemPrompt(documentType?: string, materialContext?: string): string {
  let basePrompt = `You are an expert OCR system specialized in extracting text from material and construction documents. 
Extract all text accurately, maintaining original formatting where possible.`;

  switch (documentType) {
    case 'certificate':
      basePrompt += ` This appears to be a certification or compliance document. Pay special attention to:
- Certificate numbers and standards (ISO, ASTM, etc.)
- Compliance statements and regulations
- Test results and measurements
- Expiration dates and validity periods
- Certifying authority information`;
      break;
      
    case 'label':
      basePrompt += ` This appears to be a product label. Focus on:
- Product names and model numbers
- Material composition and properties
- Safety warnings and instructions
- Manufacturer information
- Batch/lot numbers and dates`;
      break;
      
    case 'specification':
      basePrompt += ` This appears to be a technical specification sheet. Extract:
- Technical specifications and measurements
- Material properties (strength, density, etc.)
- Performance characteristics
- Installation or usage instructions
- Dimensional data`;
      break;
      
    default:
      basePrompt += ` Extract all visible text with high accuracy.`;
  }

  if (materialContext) {
    basePrompt += ` Context: This document relates to ${materialContext}.`;
  }

  basePrompt += ` 

If structured data extraction is requested, format the response as JSON with:
{
  "plainText": "all extracted text",
  "structuredData": {
    "key_properties": "extracted values",
    "specifications": {},
    "identifiers": {},
    "dates": {},
    "measurements": {}
  }
}`;

  return basePrompt;
}

function extractMaterialProperties(text: string): any {
  const patterns = {
    materialId: /(?:Material\s+ID|Product\s+Code|SKU|Model)[:\s]+([A-Z0-9-_]+)/gi,
    certification: /(?:Certificate|Certification|Standard|Complies\s+with)[:\s]+([A-Z0-9-\s]+)/gi,
    composition: /(?:Composition|Material|Made\s+of)[:\s]+([^,\n]+)/gi,
    thickness: /(?:Thickness|Thick)[:\s]+([\d.]+\s*(?:mm|cm|inches?|in))/gi,
    dimensions: /(?:Dimensions|Size)[:\s]+([\d.\s]+(?:x|×|by)\s*[\d.\s]+(?:\s*(?:mm|cm|inches?|in|ft))?)/gi,
    weight: /(?:Weight|Mass)[:\s]+([\d.]+\s*(?:kg|g|lbs?|oz))/gi,
    density: /(?:Density)[:\s]+([\d.]+\s*(?:kg\/m³|g\/cm³|lb\/ft³))/gi,
    strength: /(?:Strength|Tensile|Compressive)[:\s]+([\d.]+\s*(?:MPa|PSI|N\/mm²))/gi,
    manufacturer: /(?:Manufacturer|Made\s+by|Brand)[:\s]+([^,\n]+)/gi,
    dateCode: /(?:Date|Manufactured|Prod\.?\s+Date|Expiry|Valid\s+until)[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/gi,
    batchNumber: /(?:Batch|Lot|Serial)[:\s#]+([A-Z0-9-]+)/gi,
    temperature: /(?:Temperature|Temp)[:\s]+(-?[\d.]+\s*(?:°C|°F|K))/gi,
    pressure: /(?:Pressure)[:\s]+([\d.]+\s*(?:Pa|bar|psi|atm))/gi
  };

  const extracted: any = {};

  for (const [key, pattern] of Object.entries(patterns)) {
    const matches = Array.from(text.matchAll(pattern));
    if (matches.length > 0) {
      if (matches.length === 1) {
        extracted[key] = matches[0][1].trim();
      } else {
        extracted[key] = matches.map(match => match[1].trim());
      }
    }
  }

  return Object.keys(extracted).length > 0 ? extracted : null;
}

function detectLanguage(text: string): string {
  const patterns = {
    en: /\b(?:material|specification|certificate|thickness|weight|manufacturer|properties)\b/i,
    es: /\b(?:material|especificación|certificado|espesor|peso|fabricante|propiedades)\b/i,
    fr: /\b(?:matériau|spécification|certificat|épaisseur|poids|fabricant|propriétés)\b/i,
    de: /\b(?:material|spezifikation|zertifikat|dicke|gewicht|hersteller|eigenschaften)\b/i,
    it: /\b(?:materiale|specifica|certificato|spessore|peso|produttore|proprietà)\b/i
  };

  for (const [lang, pattern] of Object.entries(patterns)) {
    if (pattern.test(text)) {
      return lang;
    }
  }

  return 'en'; // Default to English
}

function calculateConfidence(text: string): number {
  if (!text || text.length < 10) return 0.3;
  
  // Higher confidence for structured, technical text
  const technicalTerms = /\b(?:specification|certificate|standard|ISO|ASTM|material|thickness|density|strength|manufacturer|complies|approved|tested)\b/gi;
  const technicalMatches = (text.match(technicalTerms) || []).length;
  
  // Base confidence from text length and structure
  let confidence = Math.min(0.7 + (text.length / 1000) * 0.2, 0.9);
  
  // Boost for technical content
  if (technicalMatches > 0) {
    confidence = Math.min(confidence + (technicalMatches * 0.05), 0.95);
  }
  
  // Reduce for very short or garbled text
  if (text.length < 50) {
    confidence *= 0.6;
  }
  
  return Math.round(confidence * 100) / 100;
}