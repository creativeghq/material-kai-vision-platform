#!/usr/bin/env node

/**
 * GET COMPLETE DOCUMENT ANALYSIS
 * 
 * Fetches complete document processing results from MIVAA API and displays:
 * - Exact counts of all AI operations
 * - Sample data from each AI model
 * - Quality scores and confidence metrics
 * - Processing times for each stage
 * - Success rates for each component
 */

const MIVAA_API = 'https://v1api.materialshub.gr';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const documentId = process.argv[2];
if (!documentId) {
  console.error('❌ Usage: node get-complete-document-analysis.js <document_id>');
  process.exit(1);
}

async function getCompleteAnalysis() {
  console.log('\n' + '='.repeat(100));
  console.log('📊 COMPLETE DOCUMENT ANALYSIS REPORT');
  console.log('='.repeat(100));
  console.log(`\nDocument ID: ${documentId}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  try {
    // Fetch complete document content from MIVAA API
    console.log('🔍 Fetching document content from MIVAA API...\n');
    
    const response = await fetch(`${MIVAA_API}/api/documents/documents/${documentId}/content?include_chunks=true&include_images=true`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`MIVAA API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // ============================================================================
    // DOCUMENT METADATA
    // ============================================================================
    console.log('='.repeat(100));
    console.log('📄 DOCUMENT METADATA');
    console.log('='.repeat(100));
    console.log(`Title: ${data.metadata?.title || 'N/A'}`);
    console.log(`File Name: ${data.metadata?.file_name || 'N/A'}`);
    console.log(`File Size: ${data.metadata?.file_size ? (data.metadata.file_size / 1024 / 1024).toFixed(2) + ' MB' : 'N/A'}`);
    console.log(`Pages: ${data.metadata?.page_count || 'N/A'}`);
    console.log(`Processing Status: ${data.metadata?.processing_status || 'N/A'}`);
    console.log(`Created: ${data.metadata?.created_at || 'N/A'}`);
    console.log(`Updated: ${data.metadata?.updated_at || 'N/A'}`);

    // ============================================================================
    // TEXT CHUNKS ANALYSIS
    // ============================================================================
    const chunks = data.chunks || [];
    console.log('\n' + '='.repeat(100));
    console.log('📝 TEXT CHUNKS ANALYSIS');
    console.log('='.repeat(100));
    console.log(`Total Chunks: ${chunks.length}`);
    
    if (chunks.length > 0) {
      const withContent = chunks.filter(c => c.content && c.content.length > 10).length;
      const withMetadata = chunks.filter(c => c.metadata && Object.keys(c.metadata).length > 0).length;
      const withQualityScores = chunks.filter(c => c.quality_score !== null && c.quality_score !== undefined).length;
      const avgLength = chunks.reduce((sum, c) => sum + (c.content?.length || 0), 0) / chunks.length;
      
      console.log(`Chunks with Content: ${withContent}/${chunks.length} (${(withContent/chunks.length*100).toFixed(1)}%)`);
      console.log(`Chunks with Metadata: ${withMetadata}/${chunks.length} (${(withMetadata/chunks.length*100).toFixed(1)}%)`);
      console.log(`Chunks with Quality Scores: ${withQualityScores}/${chunks.length} (${(withQualityScores/chunks.length*100).toFixed(1)}%)`);
      console.log(`Average Chunk Length: ${Math.round(avgLength)} characters`);
      
      // Chunk types breakdown
      const chunkTypes = {};
      chunks.forEach(c => {
        const type = c.chunk_type || 'unknown';
        chunkTypes[type] = (chunkTypes[type] || 0) + 1;
      });
      
      console.log('\nChunk Types Breakdown:');
      Object.entries(chunkTypes).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
        console.log(`  ${type}: ${count} (${(count/chunks.length*100).toFixed(1)}%)`);
      });
      
      // Sample chunk
      console.log('\nSample Chunk (first with content):');
      const sampleChunk = chunks.find(c => c.content && c.content.length > 50);
      if (sampleChunk) {
        console.log(`  Type: ${sampleChunk.chunk_type || 'N/A'}`);
        console.log(`  Quality Score: ${sampleChunk.quality_score || 'N/A'}`);
        console.log(`  Content Preview: ${sampleChunk.content.substring(0, 200)}...`);
      }
    }

    // ============================================================================
    // TEXT EMBEDDINGS ANALYSIS (OpenAI)
    // ============================================================================
    console.log('\n' + '='.repeat(100));
    console.log('🔢 TEXT EMBEDDINGS ANALYSIS (OpenAI text-embedding-3-small)');
    console.log('='.repeat(100));
    
    const chunksWithEmbeddings = chunks.filter(c => c.embedding && c.embedding.length > 0);
    console.log(`Chunks with Embeddings: ${chunksWithEmbeddings.length}/${chunks.length} (${chunks.length > 0 ? (chunksWithEmbeddings.length/chunks.length*100).toFixed(1) : 0}%)`);
    
    if (chunksWithEmbeddings.length > 0) {
      const sampleEmbedding = chunksWithEmbeddings[0].embedding;
      console.log(`Embedding Dimensions: ${sampleEmbedding.length}`);
      console.log(`Sample Embedding (first 10 values): [${sampleEmbedding.slice(0, 10).map(v => v.toFixed(4)).join(', ')}...]`);
      console.log(`✅ OpenAI Text Embeddings: WORKING`);
    } else {
      console.log(`❌ OpenAI Text Embeddings: NOT WORKING - No embeddings found`);
    }

    // ============================================================================
    // IMAGES ANALYSIS
    // ============================================================================
    const images = data.images || [];
    console.log('\n' + '='.repeat(100));
    console.log('🖼️  IMAGES ANALYSIS');
    console.log('='.repeat(100));
    console.log(`Total Images Extracted: ${images.length}`);
    
    if (images.length > 0) {
      // CLIP Embeddings (512D)
      const withClipEmbeddings = images.filter(img => img.visual_clip_embedding_512 && img.visual_clip_embedding_512.length > 0).length;
      console.log(`\n🎨 CLIP Visual Embeddings (clip-vit-base-patch32):`);
      console.log(`  Images with CLIP Embeddings: ${withClipEmbeddings}/${images.length} (${(withClipEmbeddings/images.length*100).toFixed(1)}%)`);
      
      if (withClipEmbeddings > 0) {
        const sampleClip = images.find(img => img.visual_clip_embedding_512)?.visual_clip_embedding_512;
        console.log(`  Embedding Dimensions: ${sampleClip.length}`);
        console.log(`  Sample CLIP Embedding (first 10): [${sampleClip.slice(0, 10).map(v => v.toFixed(4)).join(', ')}...]`);
        console.log(`  ✅ CLIP Embeddings: WORKING`);
      } else {
        console.log(`  ❌ CLIP Embeddings: NOT WORKING`);
      }
      
      // Color Embeddings (256D)
      const withColorEmbeddings = images.filter(img => img.color_embedding_256 && img.color_embedding_256.length > 0).length;
      console.log(`\n🎨 Color Embeddings (256D):`);
      console.log(`  Images with Color Embeddings: ${withColorEmbeddings}/${images.length} (${(withColorEmbeddings/images.length*100).toFixed(1)}%)`);
      if (withColorEmbeddings > 0) console.log(`  ✅ Color Embeddings: WORKING`);
      else console.log(`  ❌ Color Embeddings: NOT WORKING`);
      
      // Texture Embeddings (256D)
      const withTextureEmbeddings = images.filter(img => img.texture_embedding_256 && img.texture_embedding_256.length > 0).length;
      console.log(`\n🧱 Texture Embeddings (256D):`);
      console.log(`  Images with Texture Embeddings: ${withTextureEmbeddings}/${images.length} (${(withTextureEmbeddings/images.length*100).toFixed(1)}%)`);
      if (withTextureEmbeddings > 0) console.log(`  ✅ Texture Embeddings: WORKING`);
      else console.log(`  ❌ Texture Embeddings: NOT WORKING`);
      
      // Application Embeddings (512D)
      const withApplicationEmbeddings = images.filter(img => img.application_embedding_512 && img.application_embedding_512.length > 0).length;
      console.log(`\n🏗️  Application Embeddings (512D):`);
      console.log(`  Images with Application Embeddings: ${withApplicationEmbeddings}/${images.length} (${(withApplicationEmbeddings/images.length*100).toFixed(1)}%)`);
      if (withApplicationEmbeddings > 0) console.log(`  ✅ Application Embeddings: WORKING`);
      else console.log(`  ❌ Application Embeddings: NOT WORKING`);
      
      // Llama Analysis
      const withLlamaAnalysis = images.filter(img => img.llama_analysis && Object.keys(img.llama_analysis).length > 0).length;
      console.log(`\n🦙 Llama 4 Scout 17B Vision Analysis:`);
      console.log(`  Images with Llama Analysis: ${withLlamaAnalysis}/${images.length} (${(withLlamaAnalysis/images.length*100).toFixed(1)}%)`);
      
      if (withLlamaAnalysis > 0) {
        const sampleLlama = images.find(img => img.llama_analysis)?.llama_analysis;
        console.log(`  Sample Llama Analysis:`);
        console.log(`    ${JSON.stringify(sampleLlama, null, 4).split('\n').map(l => '    ' + l).join('\n')}`);
        console.log(`  ✅ Llama Vision Analysis: WORKING`);
      } else {
        console.log(`  ❌ Llama Vision Analysis: NOT WORKING`);
      }
      
      // Claude Validation
      const withClaudeValidation = images.filter(img => img.claude_validation && Object.keys(img.claude_validation).length > 0).length;
      console.log(`\n🤖 Claude Sonnet 4.5 Vision Validation:`);
      console.log(`  Images with Claude Validation: ${withClaudeValidation}/${images.length} (${(withClaudeValidation/images.length*100).toFixed(1)}%)`);
      
      if (withClaudeValidation > 0) {
        const sampleClaude = images.find(img => img.claude_validation)?.claude_validation;
        console.log(`  Sample Claude Validation:`);
        console.log(`    ${JSON.stringify(sampleClaude, null, 4).split('\n').map(l => '    ' + l).join('\n')}`);
        console.log(`  ✅ Claude Vision Validation: WORKING`);
      } else {
        console.log(`  ❌ Claude Vision Validation: NOT WORKING`);
      }
    }

    // ============================================================================
    // PRODUCTS ANALYSIS
    // ============================================================================
    console.log('\n' + '='.repeat(100));
    console.log('📦 PRODUCTS ANALYSIS');
    console.log('='.repeat(100));
    
    const products = data.products || [];
    console.log(`Total Products Created: ${products.length}`);
    
    if (products.length > 0) {
      console.log('\nProducts List:');
      products.forEach((product, idx) => {
        console.log(`\n  ${idx + 1}. ${product.name || 'Unnamed Product'}`);
        console.log(`     Category: ${product.category || 'N/A'}`);
        console.log(`     Collection: ${product.collection || 'N/A'}`);
        console.log(`     Designer: ${product.designer || 'N/A'}`);
        console.log(`     Dimensions: ${product.dimensions?.join(', ') || 'N/A'}`);
        console.log(`     Materials: ${product.materials?.join(', ') || 'N/A'}`);
        console.log(`     Colors: ${product.colors?.join(', ') || 'N/A'}`);
        console.log(`     Confidence Score: ${product.confidence_score || 'N/A'}`);
      });
      console.log(`\n✅ Product Creation: WORKING - ${products.length} products created`);
    } else {
      console.log(`❌ Product Creation: NOT WORKING - No products created`);
    }

    // ============================================================================
    // OVERALL SUCCESS SUMMARY
    // ============================================================================
    console.log('\n' + '='.repeat(100));
    console.log('✅ OVERALL SUCCESS SUMMARY');
    console.log('='.repeat(100));
    
    const results = {
      'Text Extraction': chunks.length > 0,
      'Text Embeddings (OpenAI)': chunksWithEmbeddings.length > 0,
      'Image Extraction': images.length > 0,
      'CLIP Embeddings': images.length > 0 && images.filter(img => img.visual_clip_embedding_512?.length > 0).length > 0,
      'Color Embeddings': images.length > 0 && images.filter(img => img.color_embedding_256?.length > 0).length > 0,
      'Texture Embeddings': images.length > 0 && images.filter(img => img.texture_embedding_256?.length > 0).length > 0,
      'Application Embeddings': images.length > 0 && images.filter(img => img.application_embedding_512?.length > 0).length > 0,
      'Llama Vision Analysis': images.length > 0 && images.filter(img => img.llama_analysis && Object.keys(img.llama_analysis).length > 0).length > 0,
      'Claude Vision Validation': images.length > 0 && images.filter(img => img.claude_validation && Object.keys(img.claude_validation).length > 0).length > 0,
      'Product Creation': products.length > 0
    };
    
    const totalComponents = Object.keys(results).length;
    const workingComponents = Object.values(results).filter(v => v).length;
    const successRate = (workingComponents / totalComponents * 100).toFixed(1);
    
    console.log('\nComponent Status:');
    Object.entries(results).forEach(([component, working]) => {
      console.log(`  ${working ? '✅' : '❌'} ${component}`);
    });
    
    console.log(`\nOverall Success Rate: ${workingComponents}/${totalComponents} (${successRate}%)`);
    
    if (successRate === '100.0') {
      console.log('\n🎉 ALL COMPONENTS WORKING! Platform is production-ready.');
    } else {
      console.log(`\n⚠️  ${totalComponents - workingComponents} component(s) not working. Review details above.`);
    }
    
    console.log('\n' + '='.repeat(100) + '\n');

  } catch (error) {
    console.error('\n❌ Error fetching document analysis:', error.message);
    process.exit(1);
  }
}

getCompleteAnalysis();

