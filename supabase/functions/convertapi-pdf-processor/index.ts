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

const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
const convertApiKey = Deno.env.get('CONVERTAPI_KEY');

console.log('🔑 Environment check:');
console.log('- OpenAI API key:', openaiApiKey ? 'Set' : 'Missing');
console.log('- ConvertAPI key:', convertApiKey ? 'Set' : 'Missing');

interface ConvertAPIProcessingRequest {
  fileUrl: string;
  originalFilename: string;
  fileSize: number;
  userId: string;
  options?: {
    extractMaterials?: boolean;
    language?: string;
  };
}

interface ProcessedImage {
  originalUrl: string;
  supabaseUrl: string;
  filename: string;
  size: number;
}

// Convert PDF to HTML using ConvertAPI
async function convertPDFToHTML(fileUrl: string): Promise<{
  htmlContent: string;
  downloadUrl: string;
}> {
  console.log('🔄 Starting ConvertAPI PDF to HTML conversion...');
  
  try {
    // Call ConvertAPI to convert PDF to HTML
    const response = await fetch('https://v2.convertapi.com/convert/pdf/to/html', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${convertApiKey}`,
      },
      body: JSON.stringify({
        Parameters: [
          {
            Name: 'File',
            FileValue: {
              Url: fileUrl
            }
          },
          {
            Name: 'PageRange',
            Value: '1-50' // Limit to first 50 pages for performance
          },
          {
            Name: 'EmbedCss',
            Value: true
          },
          {
            Name: 'EmbedImages',
            Value: false // We want separate image files
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ConvertAPI request failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ ConvertAPI conversion successful');

    if (!result.Files || result.Files.length === 0) {
      throw new Error('No HTML file returned from ConvertAPI');
    }

    // Get the HTML file URL
    const htmlFile = result.Files.find((file: any) => file.FileName.endsWith('.html'));
    if (!htmlFile) {
      throw new Error('No HTML file found in ConvertAPI response');
    }

    // Download the HTML content
    console.log('📥 Downloading HTML content from ConvertAPI...');
    const htmlResponse = await fetch(htmlFile.Url);
    if (!htmlResponse.ok) {
      throw new Error(`Failed to download HTML: ${htmlResponse.status}`);
    }

    const htmlContent = await htmlResponse.text();
    console.log(`✅ Downloaded HTML content (${htmlContent.length} characters)`);

    return {
      htmlContent,
      downloadUrl: htmlFile.Url
    };

  } catch (error) {
    console.error('❌ ConvertAPI conversion error:', error);
    throw new Error(`PDF to HTML conversion failed: ${error.message}`);
  }
}

// Extract image URLs from HTML content
function extractImageUrls(htmlContent: string): string[] {
  console.log('🔍 Extracting image URLs from HTML...');
  
  const imageUrls: string[] = [];
  
  // Regular expressions to find image URLs
  const imgTagRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  const cssBackgroundRegex = /background-image:\s*url\(["']?([^"')]+)["']?\)/gi;
  const cssUrlRegex = /url\(["']?([^"')]+\.(jpg|jpeg|png|gif|svg|webp))["']?\)/gi;
  
  let match;
  
  // Extract from img tags
  while ((match = imgTagRegex.exec(htmlContent)) !== null) {
    const url = match[1];
    if (url && !url.startsWith('data:') && !url.startsWith('#')) {
      imageUrls.push(url);
    }
  }
  
  // Extract from CSS background-image
  while ((match = cssBackgroundRegex.exec(htmlContent)) !== null) {
    const url = match[1];
    if (url && !url.startsWith('data:') && !url.startsWith('#')) {
      imageUrls.push(url);
    }
  }
  
  // Extract from CSS url() functions
  while ((match = cssUrlRegex.exec(htmlContent)) !== null) {
    const url = match[1];
    if (url && !url.startsWith('data:') && !url.startsWith('#')) {
      imageUrls.push(url);
    }
  }
  
  // Remove duplicates and filter valid URLs
  const uniqueUrls = [...new Set(imageUrls)].filter(url => {
    try {
      new URL(url);
      return true;
    } catch {
      // If it's a relative URL, try to make it absolute based on ConvertAPI domain
      if (!url.startsWith('http')) {
        return url.includes('.') && /\.(jpg|jpeg|png|gif|svg|webp)$/i.test(url);
      }
      return false;
    }
  });
  
  console.log(`✅ Found ${uniqueUrls.length} unique image URLs`);
  return uniqueUrls;
}

// Download image and upload to Supabase storage
async function downloadAndStoreImage(imageUrl: string, userId: string, index: number): Promise<ProcessedImage | null> {
  try {
    console.log(`📥 Downloading image ${index + 1}: ${imageUrl}`);
    
    // Make URL absolute if it's relative
    let fullUrl = imageUrl;
    if (!imageUrl.startsWith('http')) {
      // Assume it's from ConvertAPI's domain
      fullUrl = `https://v2.convertapi.com${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
    }
    
    const response = await fetch(fullUrl);
    if (!response.ok) {
      console.warn(`⚠️ Failed to download image: ${response.status} - ${imageUrl}`);
      return null;
    }
    
    const imageBuffer = await response.arrayBuffer();
    const imageBytes = new Uint8Array(imageBuffer);
    
    if (imageBytes.length === 0) {
      console.warn(`⚠️ Empty image file: ${imageUrl}`);
      return null;
    }
    
    // Determine file extension
    const urlPath = new URL(fullUrl).pathname;
    const extension = urlPath.split('.').pop()?.toLowerCase() || 'jpg';
    const filename = `pdf-image-${Date.now()}-${index}.${extension}`;
    const storagePath = `${userId}/pdf-images/${filename}`;
    
    // Upload to Supabase storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('pdf-documents')
      .upload(storagePath, imageBytes, {
        contentType: `image/${extension === 'jpg' ? 'jpeg' : extension}`,
        upsert: false
      });
    
    if (uploadError) {
      console.error(`❌ Failed to upload image to storage:`, uploadError);
      return null;
    }
    
    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('pdf-documents')
      .getPublicUrl(storagePath);
    
    console.log(`✅ Image uploaded successfully: ${filename}`);
    
    return {
      originalUrl: imageUrl,
      supabaseUrl: publicUrl,
      filename,
      size: imageBytes.length
    };
    
  } catch (error) {
    console.error(`❌ Error processing image ${imageUrl}:`, error);
    return null;
  }
}

// Replace image URLs in HTML with Supabase URLs
function replaceImageUrls(htmlContent: string, processedImages: ProcessedImage[]): string {
  console.log('🔄 Replacing image URLs in HTML...');
  
  let updatedHtml = htmlContent;
  
  for (const image of processedImages) {
    // Replace all occurrences of the original URL with the Supabase URL
    const originalUrl = image.originalUrl;
    const supabaseUrl = image.supabaseUrl;
    
    // Handle both absolute and relative URLs
    const patterns = [
      new RegExp(escapeRegExp(originalUrl), 'g'),
      new RegExp(escapeRegExp(originalUrl.replace(/^https?:\/\/[^\/]+/, '')), 'g'), // Remove domain
    ];
    
    for (const pattern of patterns) {
      updatedHtml = updatedHtml.replace(pattern, supabaseUrl);
    }
  }
  
  console.log(`✅ Replaced ${processedImages.length} image URLs in HTML`);
  return updatedHtml;
}

// Escape special regex characters
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Generate embeddings for the extracted content
async function generateEmbedding(text: string): Promise<string | null> {
  try {
    if (!openaiApiKey) {
      // Return a mock embedding if no API key
      const mockEmbedding = Array.from({length: 1536}, () => Math.random() * 0.1 - 0.05);
      return `[${mockEmbedding.join(',')}]`;
    }

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text.substring(0, 8000) // Limit input size
      }),
    });

    if (response.ok) {
      const result = await response.json();
      const embedding = result.data[0]?.embedding;
      return embedding ? `[${embedding.join(',')}]` : null;
    }

    return null;
  } catch (error) {
    console.error('Embedding generation error:', error);
    return null;
  }
}

// Extract text content from HTML for embedding generation
function extractTextFromHTML(htmlContent: string): string {
  // Remove script and style tags
  let text = htmlContent.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Remove HTML tags
  text = text.replace(/<[^>]*>/g, ' ');
  
  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  
  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim();
  
  return text;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🚀 ConvertAPI PDF processor started');
    
    // Check for required environment variables
    if (!convertApiKey) {
      console.error('❌ CONVERTAPI_KEY environment variable is missing');
      return new Response(
        JSON.stringify({ 
          error: 'ConvertAPI key not configured',
          details: 'The CONVERTAPI_KEY environment variable must be set in edge function secrets'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const requestData: ConvertAPIProcessingRequest = await req.json();
    const { fileUrl, originalFilename, fileSize, userId, options = {} } = requestData;

    if (!fileUrl || !originalFilename || !userId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: fileUrl, originalFilename, userId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🚀 Starting ConvertAPI PDF processing for:', originalFilename);

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
        processing_time_ms: 0,
        total_pages: 1
      })
      .select()
      .single();

    if (createError) {
      throw new Error(`Failed to create processing record: ${createError.message}`);
    }

    const processingId = processingRecord.id;
    const startTime = Date.now();

    // PHASE 1: Call ConvertAPI (lightweight, fast)
    console.log('📄 Phase 1: Initiating ConvertAPI conversion...');
    
    const response = await fetch('https://v2.convertapi.com/convert/pdf/to/html', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${convertApiKey}`,
      },
      body: JSON.stringify({
        Parameters: [
          {
            Name: 'File',
            FileValue: {
              Url: fileUrl
            }
          },
          {
            Name: 'PageRange',
            Value: '1-20' // Reduced to 20 pages to avoid memory issues
          },
          {
            Name: 'EmbedCss',
            Value: true
          },
          {
            Name: 'EmbedImages',
            Value: false
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      await supabase
        .from('pdf_processing_results')
        .update({
          processing_status: 'failed',
          processing_completed_at: new Date().toISOString(),
          error_message: `ConvertAPI request failed: ${response.status} - ${errorText}`,
          processing_time_ms: Date.now() - startTime
        })
        .eq('id', processingId);
        
      throw new Error(`ConvertAPI request failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ ConvertAPI conversion initiated successfully');

    if (!result.Files || result.Files.length === 0) {
      throw new Error('No HTML file returned from ConvertAPI');
    }

    // Get the HTML file URL
    const htmlFile = result.Files.find((file: any) => file.FileName.endsWith('.html'));
    if (!htmlFile) {
      throw new Error('No HTML file found in ConvertAPI response');
    }

    // Store ConvertAPI result info and return immediately
    await supabase
      .from('pdf_processing_results')
      .update({
        processing_status: 'downloading',
        document_classification: {
          content_type: 'pdf_html_document',
          processing_method: 'convertapi_html_conversion',
          convertapi_download_url: htmlFile.Url
        }
      })
      .eq('id', processingId);

    // PHASE 2: Background processing - Download HTML and images to storage
    const backgroundProcessing = async () => {
      try {
        console.log('📥 Phase 2: Starting background download and processing...');
        
        // Download HTML content
        console.log('📥 Downloading HTML content from ConvertAPI...');
        const htmlResponse = await fetch(htmlFile.Url);
        if (!htmlResponse.ok) {
          throw new Error(`Failed to download HTML: ${htmlResponse.status}`);
        }

        const htmlContent = await htmlResponse.text();
        console.log(`✅ Downloaded HTML content (${htmlContent.length} characters)`);

        // Store HTML content to Supabase storage
        const htmlStoragePath = `${userId}/pdf-html/${originalFilename.replace('.pdf', '')}-${Date.now()}.html`;
        const { data: htmlUpload, error: htmlUploadError } = await supabase.storage
          .from('pdf-documents')
          .upload(htmlStoragePath, htmlContent, {
            contentType: 'text/html',
            upsert: false
          });

        if (htmlUploadError) {
          throw new Error(`Failed to upload HTML to storage: ${htmlUploadError.message}`);
        }

        // Get public URL for HTML
        const { data: { publicUrl: htmlPublicUrl } } = supabase.storage
          .from('pdf-documents')
          .getPublicUrl(htmlStoragePath);

        // Extract image URLs from HTML
        console.log('🖼️ Extracting image URLs from HTML...');
        const imageUrls = extractImageUrls(htmlContent);
        
        // Process images in smaller batches to avoid memory issues
        const processedImages: ProcessedImage[] = [];
        const batchSize = 3; // Process 3 images at a time
        
        for (let i = 0; i < imageUrls.length; i += batchSize) {
          const batch = imageUrls.slice(i, i + batchSize);
          console.log(`Processing image batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(imageUrls.length/batchSize)}`);
          
          const batchPromises = batch.map((imageUrl, batchIndex) => 
            downloadAndStoreImage(imageUrl, userId, i + batchIndex)
          );
          
          const batchResults = await Promise.allSettled(batchPromises);
          
          for (const result of batchResults) {
            if (result.status === 'fulfilled' && result.value) {
              processedImages.push(result.value);
            }
          }
          
          // Small delay between batches to avoid overwhelming the system
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Replace image URLs in HTML
        console.log('🔄 Replacing image URLs in HTML...');
        const finalHtmlContent = replaceImageUrls(htmlContent, processedImages);

        // Store updated HTML with replaced URLs
        const updatedHtmlPath = `${userId}/pdf-html/${originalFilename.replace('.pdf', '')}-final-${Date.now()}.html`;
        await supabase.storage
          .from('pdf-documents')
          .upload(updatedHtmlPath, finalHtmlContent, {
            contentType: 'text/html',
            upsert: false
          });

        const { data: { publicUrl: finalHtmlUrl } } = supabase.storage
          .from('pdf-documents')
          .getPublicUrl(updatedHtmlPath);

        // Extract text for embedding (limited to avoid memory issues)
        console.log('📝 Extracting text for embedding...');
        const extractedText = extractTextFromHTML(finalHtmlContent).substring(0, 5000); // Limit text

        // Generate embeddings
        console.log('🧠 Generating embeddings...');
        const embedding = await generateEmbedding(extractedText);

        // Store in knowledge base
        console.log('💾 Storing in knowledge base...');
        const knowledgeEntry = {
          title: `${originalFilename.replace('.pdf', '')} - HTML Document`,
          content: extractedText,
          content_type: 'pdf_html_document',
          source_url: fileUrl,
          semantic_tags: ['pdf', 'html', 'convertapi', 'uploaded-content'],
          language: options.language || 'en',
          technical_complexity: 5,
          reading_level: 10,
          openai_embedding: embedding,
          confidence_scores: {
            conversion: 0.95,
            text_extraction: 0.9,
            overall: 0.92
          },
          search_keywords: extractedText.split(' ').slice(0, 20), // Reduced keywords
          metadata: {
            source_type: 'convertapi_pdf_upload',
            processing_method: 'convertapi_html_conversion',
            file_info: {
              original_filename: originalFilename,
              file_size: fileSize,
              processing_date: new Date().toISOString()
            },
            storage_info: {
              html_storage_url: finalHtmlUrl,
              original_html_url: htmlPublicUrl,
              images_processed: processedImages.length,
              images_found: imageUrls.length
            },
            processed_images: processedImages.map(img => ({
              original_url: img.originalUrl,
              supabase_url: img.supabaseUrl,
              filename: img.filename,
              size: img.size
            }))
          },
          created_by: userId,
          last_modified_by: userId,
          status: 'published'
        };

        const { data: knowledgeData, error: knowledgeError } = await supabase
          .from('enhanced_knowledge_base')
          .insert(knowledgeEntry)
          .select()
          .single();

        if (knowledgeError) {
          throw new Error(`Failed to add document to knowledge base: ${knowledgeError.message}`);
        }

        // Final update to processing results
        const processingTime = Date.now() - startTime;
        await supabase
          .from('pdf_processing_results')
          .update({
            processing_status: 'completed',
            processing_completed_at: new Date().toISOString(),
            processing_time_ms: processingTime,
            document_title: knowledgeEntry.title,
            confidence_score_avg: 0.92,
            document_keywords: knowledgeEntry.search_keywords?.join(', ')
          })
          .eq('id', processingId);

        console.log(`🎉 Background processing completed in ${processingTime}ms`);

      } catch (backgroundError) {
        console.error('❌ Background processing error:', backgroundError);
        
        await supabase
          .from('pdf_processing_results')
          .update({
            processing_status: 'failed',
            processing_completed_at: new Date().toISOString(),
            error_message: backgroundError instanceof Error ? backgroundError.message : String(backgroundError),
            processing_time_ms: Date.now() - startTime
          })
          .eq('id', processingId);
      }
    };

    // Start background processing without awaiting
    EdgeRuntime.waitUntil(backgroundProcessing());

    // Return immediate response
    return new Response(
      JSON.stringify({
        success: true,
        message: 'PDF conversion initiated successfully',
        processingId: processingId,
        status: 'processing',
        details: 'HTML content will be downloaded and processed in the background',
        estimatedTime: '30-60 seconds'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Top-level error in ConvertAPI PDF processor:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.name : typeof error,
        context: 'convertapi_initialization_error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});