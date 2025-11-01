#!/usr/bin/env node

/**
 * HARMONY PDF - COMPLETE VALIDATION WITH ALL DETAILS
 * 
 * Shows exactly what was created:
 * - Products (count, names, metafields)
 * - Chunks (count, content samples, embeddings)
 * - Images (count, embeddings, analysis)
 * - Metafields (types, values, linking)
 * - All embedding types and dimensions
 */

import { createClient } from '@supabase/supabase-js';

// Configuration
const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTkwNjAzMSwiZXhwIjoyMDY3NDgyMDMxfQ.KCfP909Qttvs3jr4t1pTYMjACVz2-C-Ga4Xm_ZyecwM';
const WORKSPACE_ID = 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

console.log('\n' + '='.repeat(80));
console.log('🔍 HARMONY PDF - COMPLETE VALIDATION REPORT');
console.log('='.repeat(80) + '\n');

async function getLatestDocument() {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('workspace_id', WORKSPACE_ID)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  if (error) throw error;
  return data;
}

async function getProducts(workspaceId) {
  const { data, error} = await supabase
    .from('products')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

async function getChunks(workspaceId) {
  const { data, error } = await supabase
    .from('document_chunks')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

async function getImages(workspaceId) {
  const { data, error } = await supabase
    .from('document_images')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

async function getProductMetafieldValues(productId) {
  const { data, error } = await supabase
    .from('product_metafield_values')
    .select('*')
    .eq('product_id', productId);

  if (error) {
    console.log(`Warning: Could not fetch metafields for product ${productId}: ${error.message}`);
    return [];
  }
  return data || [];
}

function analyzeEmbedding(embedding, name) {
  if (!embedding || !Array.isArray(embedding)) {
    return { valid: false, reason: 'Not an array' };
  }
  
  const dimension = embedding.length;
  const nonZero = embedding.filter(v => v !== 0).length;
  const avg = embedding.reduce((a, b) => a + b, 0) / dimension;
  const variance = embedding.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / dimension;
  const stdDev = Math.sqrt(variance);
  
  return {
    valid: dimension > 0 && nonZero > dimension * 0.5,
    dimension,
    nonZero,
    nonZeroPercent: ((nonZero / dimension) * 100).toFixed(1),
    avg: avg.toFixed(6),
    stdDev: stdDev.toFixed(6),
    sample: embedding.slice(0, 5).map(v => v.toFixed(4))
  };
}

async function main() {
  try {
    // Get latest document
    console.log('📄 DOCUMENT INFORMATION');
    console.log('-'.repeat(80));
    const doc = await getLatestDocument();
    console.log(`Document ID: ${doc.id}`);
    console.log(`Title: ${doc.title}`);
    console.log(`Created: ${doc.created_at}`);
    console.log(`Status: ${doc.status || 'N/A'}`);
    console.log();

    // Get products
    console.log('🏷️  PRODUCTS');
    console.log('-'.repeat(80));
    const products = await getProducts(WORKSPACE_ID);
    console.log(`Total Products: ${products.length}`);
    console.log();
    
    if (products.length > 0) {
      console.log('Product Details:');
      for (let i = 0; i < products.length; i++) {
        const p = products[i];
        console.log(`\n${i + 1}. ${p.name || 'Unnamed'}`);
        console.log(`   ID: ${p.id}`);
        console.log(`   Description: ${(p.description || 'N/A').substring(0, 100)}...`);
        
        // Get metafields for this product
        const metafields = await getProductMetafieldValues(p.id);
        if (metafields.length > 0) {
          console.log(`   Metafields: ${metafields.length} values`);
        }
        
        // Check metadata
        if (p.metadata) {
          console.log(`   Metadata keys: ${Object.keys(p.metadata).join(', ')}`);
        }
      }
    }
    console.log();

    // Get chunks
    console.log('📝 CHUNKS');
    console.log('-'.repeat(80));
    const chunks = await getChunks(WORKSPACE_ID);
    console.log(`Total Chunks: ${chunks.length}`);
    console.log();
    
    if (chunks.length > 0) {
      console.log('Chunk Samples (first 3):');
      for (let i = 0; i < Math.min(3, chunks.length); i++) {
        const chunk = chunks[i];
        console.log(`\n${i + 1}. Chunk ID: ${chunk.id}`);
        console.log(`   Content: ${(chunk.content || 'N/A').substring(0, 150)}...`);
        console.log(`   Length: ${(chunk.content || '').length} characters`);
        
        // Analyze embedding
        if (chunk.embedding) {
          const analysis = analyzeEmbedding(chunk.embedding, 'text');
          console.log(`   Embedding: ${analysis.dimension}D, ${analysis.nonZeroPercent}% non-zero`);
          console.log(`   Sample values: [${analysis.sample.join(', ')}]`);
        } else {
          console.log(`   Embedding: ❌ Missing`);
        }
      }
      
      // Embedding statistics
      const chunksWithEmbeddings = chunks.filter(c => c.embedding && Array.isArray(c.embedding));
      console.log(`\nEmbedding Statistics:`);
      console.log(`  Chunks with embeddings: ${chunksWithEmbeddings.length} / ${chunks.length}`);
      if (chunksWithEmbeddings.length > 0) {
        const firstEmbed = chunksWithEmbeddings[0].embedding;
        console.log(`  Embedding dimension: ${firstEmbed.length}D`);
      }
    }
    console.log();

    // Get images
    console.log('🖼️  IMAGES');
    console.log('-'.repeat(80));
    const images = await getImages(WORKSPACE_ID);
    console.log(`Total Images: ${images.length}`);
    console.log();
    
    if (images.length > 0) {
      console.log('Image Samples (first 3):');
      for (let i = 0; i < Math.min(3, images.length); i++) {
        const img = images[i];
        console.log(`\n${i + 1}. Image ID: ${img.id}`);
        console.log(`   Page: ${img.page_number || 'N/A'}`);
        console.log(`   Storage Path: ${img.storage_path || 'N/A'}`);
        console.log(`   Analysis: ${img.anthropic_analysis ? 'Yes' : 'No'}`);
        console.log(`   Quality Score: ${img.quality_score || 'N/A'}`);
        
        // Check all embedding types
        const embeddingTypes = [
          { name: 'Visual', field: 'clip_visual_embedding' },
          { name: 'Color', field: 'clip_color_embedding' },
          { name: 'Texture', field: 'clip_texture_embedding' },
          { name: 'Application', field: 'clip_application_embedding' },
          { name: 'Material', field: 'clip_material_embedding' }
        ];
        
        console.log(`   Embeddings:`);
        embeddingTypes.forEach(({ name, field }) => {
          if (img[field]) {
            const analysis = analyzeEmbedding(img[field], name);
            console.log(`     ${name}: ${analysis.dimension}D, ${analysis.nonZeroPercent}% non-zero`);
          } else {
            console.log(`     ${name}: ❌ Missing`);
          }
        });
      }
      
      // Embedding statistics
      console.log(`\nImage Embedding Statistics:`);
      const embTypes = ['clip_visual_embedding', 'clip_color_embedding', 'clip_texture_embedding', 
                        'clip_application_embedding', 'clip_material_embedding'];
      embTypes.forEach(type => {
        const count = images.filter(img => img[type] && Array.isArray(img[type])).length;
        console.log(`  ${type}: ${count} / ${images.length}`);
      });
    }
    console.log();

    // Summary
    console.log('📊 SUMMARY');
    console.log('='.repeat(80));
    console.log(`✅ Products: ${products.length}`);
    console.log(`✅ Chunks: ${chunks.length}`);
    console.log(`✅ Images: ${images.length}`);
    console.log(`✅ Chunks with embeddings: ${chunks.filter(c => c.embedding).length}`);
    console.log(`✅ Images with CLIP embeddings: ${images.filter(i => i.clip_visual_embedding).length}`);
    
    // Calculate total metafields
    let totalMetafields = 0;
    for (const p of products) {
      const mf = await getProductMetafieldValues(p.id);
      totalMetafields += mf.length;
    }
    console.log(`✅ Total metafield values: ${totalMetafields}`);
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ VALIDATION COMPLETE');
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

main();

