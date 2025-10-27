#!/usr/bin/env node

/**
 * COMPLETE DOCUMENT ANALYSIS - Shows ALL AI model results
 * 
 * This script provides COMPREHENSIVE analysis of a processed document including:
 * - Exact counts: chunks, images, products
 * - AI model usage: Llama, Claude, OpenAI, CLIP
 * - Embeddings: text, visual, color, texture, application
 * - Sample data from each AI model
 * - Success rates and quality scores
 */

const MIVAA_GATEWAY_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/mivaa-gateway';
const DOCUMENT_ID = process.argv[2] || '90aec15c-f871-4a04-85c6-08e61baefd1c';

console.log('====================================================================================================');
console.log('📊 COMPLETE DOCUMENT ANALYSIS - ALL AI MODELS & RESULTS');
console.log('====================================================================================================\n');
console.log(`Document ID: ${DOCUMENT_ID}\n`);

async function getCompleteAnalysis() {
  try {
    // Fetch complete document data from MIVAA API
    const MIVAA_API_URL = 'https://v1api.materialshub.gr/api/rag/documents/documents';
    const response = await fetch(`${MIVAA_API_URL}/${DOCUMENT_ID}/content?include_chunks=true&include_images=true&include_products=true`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    // ========================================
    // 1. DOCUMENT OVERVIEW
    // ========================================
    console.log('═══════════════════════════════════════════════════════════════════════════════════════════════');
    console.log('1️⃣  DOCUMENT OVERVIEW');
    console.log('═══════════════════════════════════════════════════════════════════════════════════════════════\n');
    
    console.log(`📄 Title: ${data.metadata?.title || 'N/A'}`);
    console.log(`📅 Created: ${new Date(data.created_at).toLocaleString()}`);
    console.log(`🏷️  Tags: ${data.metadata?.tags?.join(', ') || 'None'}`);
    console.log(`📝 Description: ${data.metadata?.description || 'N/A'}\n`);

    // ========================================
    // 2. PROCESSING STATISTICS
    // ========================================
    console.log('═══════════════════════════════════════════════════════════════════════════════════════════════');
    console.log('2️⃣  PROCESSING STATISTICS');
    console.log('═══════════════════════════════════════════════════════════════════════════════════════════════\n');

    const chunks = data.chunks || [];
    const images = data.images || [];
    const products = data.products || [];

    console.log(`📦 Total Chunks Created: ${chunks.length}`);
    console.log(`🖼️  Total Images Extracted: ${images.length}`);
    console.log(`🏭 Total Products Created: ${products.length}\n`);

    // ========================================
    // 3. TEXT EMBEDDINGS (OpenAI)
    // ========================================
    console.log('═══════════════════════════════════════════════════════════════════════════════════════════════');
    console.log('3️⃣  TEXT EMBEDDINGS (OpenAI text-embedding-3-small)');
    console.log('═══════════════════════════════════════════════════════════════════════════════════════════════\n');

    const chunksWithEmbeddings = chunks.filter(c => c.embeddings && c.embeddings.length > 0);
    const textEmbeddingsCount = chunksWithEmbeddings.length;
    const successRate = chunks.length > 0 ? ((textEmbeddingsCount / chunks.length) * 100).toFixed(1) : 0;

    console.log(`✅ Chunks with Embeddings: ${textEmbeddingsCount}/${chunks.length} (${successRate}%)`);
    console.log(`🤖 OpenAI API Calls: ${textEmbeddingsCount}`);
    console.log(`📊 Embedding Dimensions: 1536D\n`);

    if (chunksWithEmbeddings.length > 0) {
      const sample = chunksWithEmbeddings[0];
      console.log(`📝 Sample Chunk:`);
      console.log(`   Content: "${sample.content.substring(0, 100)}..."`);
      console.log(`   Embedding: [${sample.embeddings[0].embedding.slice(0, 5).join(', ')}...] (${sample.embeddings[0].dimensions}D)\n`);
    }

    // ========================================
    // 4. IMAGE AI ANALYSIS
    // ========================================
    console.log('═══════════════════════════════════════════════════════════════════════════════════════════════');
    console.log('4️⃣  IMAGE AI ANALYSIS');
    console.log('═══════════════════════════════════════════════════════════════════════════════════════════════\n');

    const imagesWithClip = images.filter(img => img.visual_clip_embedding_512);
    const imagesWithLlama = images.filter(img => img.llama_analysis);
    const imagesWithClaude = images.filter(img => img.claude_validation);
    const imagesWithColor = images.filter(img => img.color_embedding_256);
    const imagesWithTexture = images.filter(img => img.texture_embedding_256);
    const imagesWithApplication = images.filter(img => img.application_embedding_512);

    console.log(`🔍 CLIP Visual Embeddings (512D): ${imagesWithClip.length}/${images.length}`);
    console.log(`🦙 Llama 4 Scout 17B Analysis: ${imagesWithLlama.length}/${images.length}`);
    console.log(`🤖 Claude Sonnet 4.5 Validation: ${imagesWithClaude.length}/${images.length}`);
    console.log(`🎨 Color Embeddings (256D): ${imagesWithColor.length}/${images.length}`);
    console.log(`🧵 Texture Embeddings (256D): ${imagesWithTexture.length}/${images.length}`);
    console.log(`🏗️  Application Embeddings (512D): ${imagesWithApplication.length}/${images.length}\n`);

    // Show sample image analysis
    if (imagesWithLlama.length > 0) {
      const sampleImg = imagesWithLlama[0];
      console.log(`📸 Sample Image Analysis:`);
      console.log(`   Image: ${sampleImg.image_url?.split('/').pop() || 'N/A'}`);
      console.log(`   Page: ${sampleImg.page_number || 'N/A'}`);
      
      if (sampleImg.llama_analysis) {
        console.log(`\n   🦙 Llama Analysis:`);
        console.log(`      ${JSON.stringify(sampleImg.llama_analysis, null, 6).substring(0, 300)}...`);
      }
      
      if (sampleImg.claude_validation) {
        console.log(`\n   🤖 Claude Validation:`);
        console.log(`      ${JSON.stringify(sampleImg.claude_validation, null, 6).substring(0, 300)}...`);
      }
      
      if (sampleImg.visual_clip_embedding_512) {
        console.log(`\n   🔍 CLIP Embedding: [${sampleImg.visual_clip_embedding_512.slice(0, 5).join(', ')}...] (512D)`);
      }
      
      console.log('');
    }

    // ========================================
    // 5. AI MODEL USAGE SUMMARY
    // ========================================
    console.log('═══════════════════════════════════════════════════════════════════════════════════════════════');
    console.log('5️⃣  AI MODEL USAGE SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════════════════════════════════════\n');

    const totalLlamaCalls = imagesWithLlama.length;
    const totalClaudeCalls = imagesWithClaude.length;
    const totalOpenAICalls = textEmbeddingsCount;
    const totalClipEmbeddings = imagesWithClip.length;

    console.log(`🤖 AI Model Calls:`);
    console.log(`   - OpenAI (text-embedding-3-small): ${totalOpenAICalls} calls`);
    console.log(`   - Llama 4 Scout 17B Vision: ${totalLlamaCalls} calls`);
    console.log(`   - Claude Sonnet 4.5 Vision: ${totalClaudeCalls} calls`);
    console.log(`   - CLIP (clip-vit-base-patch32): ${totalClipEmbeddings} embeddings`);
    console.log(`\n📊 Total Embeddings Generated:`);
    console.log(`   - Text (1536D): ${textEmbeddingsCount}`);
    console.log(`   - Visual (512D): ${imagesWithClip.length}`);
    console.log(`   - Color (256D): ${imagesWithColor.length}`);
    console.log(`   - Texture (256D): ${imagesWithTexture.length}`);
    console.log(`   - Application (512D): ${imagesWithApplication.length}`);
    console.log(`   - TOTAL: ${textEmbeddingsCount + imagesWithClip.length + imagesWithColor.length + imagesWithTexture.length + imagesWithApplication.length}\n`);

    // ========================================
    // 6. PRODUCTS CREATED
    // ========================================
    console.log('═══════════════════════════════════════════════════════════════════════════════════════════════');
    console.log('6️⃣  PRODUCTS CREATED');
    console.log('═══════════════════════════════════════════════════════════════════════════════════════════════\n');

    console.log(`🏭 Total Products: ${products.length}\n`);

    if (products.length > 0) {
      products.slice(0, 3).forEach((product, i) => {
        console.log(`   ${i + 1}. ${product.name || 'Unnamed Product'}`);
        console.log(`      Description: ${product.description?.substring(0, 100) || 'N/A'}...`);
        console.log(`      Properties: ${JSON.stringify(product.properties || {}).substring(0, 100)}...`);
        console.log('');
      });
    }

    // ========================================
    // 7. FINAL SUMMARY
    // ========================================
    console.log('═══════════════════════════════════════════════════════════════════════════════════════════════');
    console.log('7️⃣  FINAL SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════════════════════════════════════\n');

    const allAIComplete = textEmbeddingsCount === chunks.length && 
                          imagesWithClip.length === images.length &&
                          imagesWithLlama.length === images.length &&
                          imagesWithClaude.length === images.length;

    console.log(`✅ Processing Status: ${allAIComplete ? 'COMPLETE' : 'PARTIAL'}`);
    console.log(`📊 Text Processing: ${textEmbeddingsCount}/${chunks.length} chunks (${successRate}%)`);
    console.log(`🖼️  Image Processing: ${imagesWithClip.length}/${images.length} images (${images.length > 0 ? ((imagesWithClip.length / images.length) * 100).toFixed(1) : 0}%)`);
    console.log(`🏭 Product Creation: ${products.length} products\n`);

    console.log('====================================================================================================');
    console.log('✅ ANALYSIS COMPLETE');
    console.log('====================================================================================================\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

getCompleteAnalysis();

