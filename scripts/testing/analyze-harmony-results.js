import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DOCUMENT_ID = '69cba085-9c2d-405c-aff2-8a20caf0b568';

async function analyzeHarmonyResults() {
  console.log('\n' + '='.repeat(100));
  console.log('📊 HARMONY PDF - COMPREHENSIVE ANALYSIS');
  console.log('='.repeat(100) + '\n');

  // 1. CHUNKS ANALYSIS
  console.log('📄 CHUNKS ANALYSIS');
  console.log('-'.repeat(100));

  const { data: chunks, error: chunksError } = await supabase
    .from('chunks')
    .select('*')
    .eq('document_id', DOCUMENT_ID)
    .order('chunk_index', { ascending: true });

  if (chunksError) {
    console.error('❌ Error fetching chunks:', chunksError);
    return;
  }

  console.log(`\n✅ Total Chunks: ${chunks.length}`);

  // Analyze chunk sizes
  const chunkSizes = chunks.map(c => c.content?.length || 0);
  const avgSize = chunkSizes.reduce((a, b) => a + b, 0) / chunkSizes.length;
  const minSize = Math.min(...chunkSizes);
  const maxSize = Math.max(...chunkSizes);

  console.log(`\n📏 Chunk Size Statistics:`);
  console.log(`   Average: ${avgSize.toFixed(0)} characters`);
  console.log(`   Min: ${minSize} characters`);
  console.log(`   Max: ${maxSize} characters`);

  // Show sample chunks with metadata
  console.log(`\n📋 Sample Chunks (first 5):`);
  chunks.slice(0, 5).forEach((chunk, idx) => {
    console.log(`\n   Chunk ${idx + 1}:`);
    console.log(`   - ID: ${chunk.id}`);
    console.log(`   - Index: ${chunk.chunk_index}`);
    console.log(`   - Size: ${chunk.content?.length || 0} chars`);
    console.log(`   - Page: ${chunk.metadata?.page_number || 'N/A'}`);
    console.log(`   - Has Embedding: ${chunk.embedding ? 'Yes' : 'No'}`);
    console.log(`   - Content Preview: ${chunk.content?.substring(0, 150)}...`);
    console.log(`   - Metadata: ${JSON.stringify(chunk.metadata, null, 2)}`);
  });

  // 2. EMBEDDINGS ANALYSIS
  console.log('\n\n' + '='.repeat(100));
  console.log('🧬 EMBEDDINGS ANALYSIS');
  console.log('-'.repeat(100));

  const chunksWithEmbeddings = chunks.filter(c => c.embedding);
  const chunksWithoutEmbeddings = chunks.filter(c => !c.embedding);

  console.log(`\n✅ Chunks with Embeddings: ${chunksWithEmbeddings.length}`);
  console.log(`❌ Chunks without Embeddings: ${chunksWithoutEmbeddings.length}`);

  if (chunksWithEmbeddings.length > 0) {
    const sampleEmbedding = chunksWithEmbeddings[0].embedding;
    console.log(`\n📊 Embedding Details:`);
    console.log(`   - Dimensions: ${sampleEmbedding?.length || 'N/A'}`);
    console.log(`   - Sample values: [${sampleEmbedding?.slice(0, 5).join(', ')}...]`);
    console.log(`   - Embedding model: ${chunksWithEmbeddings[0].embedding_model || 'N/A'}`);
  }

  // 3. IMAGES ANALYSIS
  console.log('\n\n' + '='.repeat(100));
  console.log('🖼️  IMAGES ANALYSIS');
  console.log('-'.repeat(100));

  const { data: images, error: imagesError } = await supabase
    .from('images')
    .select('*')
    .eq('document_id', DOCUMENT_ID)
    .order('page_number', { ascending: true });

  if (imagesError) {
    console.error('❌ Error fetching images:', imagesError);
  } else {
    console.log(`\n✅ Total Images: ${images.length}`);

    // Group by page
    const imagesByPage = {};
    images.forEach(img => {
      const page = img.page_number || 'unknown';
      if (!imagesByPage[page]) imagesByPage[page] = [];
      imagesByPage[page].push(img);
    });

    console.log(`\n📄 Images by Page:`);
    Object.keys(imagesByPage).sort((a, b) => parseInt(a) - parseInt(b)).forEach(page => {
      console.log(`   Page ${page}: ${imagesByPage[page].length} images`);
    });

    // Analyze image metadata and metafields
    console.log(`\n🏷️  Image Metadata & Metafields Analysis:`);
    images.slice(0, 10).forEach((img, idx) => {
      console.log(`\n   Image ${idx + 1}:`);
      console.log(`   - ID: ${img.id}`);
      console.log(`   - Page: ${img.page_number}`);
      console.log(`   - Storage Path: ${img.storage_path}`);
      console.log(`   - Has Embedding: ${img.embedding ? 'Yes' : 'No'}`);
      console.log(`   - Embedding Model: ${img.embedding_model || 'N/A'}`);
      console.log(`   - Metadata: ${JSON.stringify(img.metadata, null, 2)}`);

      // Check for Claude analysis
      if (img.metadata?.claude_analysis) {
        console.log(`   - Claude Analysis:`);
        console.log(`     * Description: ${img.metadata.claude_analysis.description?.substring(0, 100)}...`);
        console.log(`     * Detected Objects: ${img.metadata.claude_analysis.detected_objects?.join(', ') || 'N/A'}`);
        console.log(`     * Colors: ${img.metadata.claude_analysis.colors?.join(', ') || 'N/A'}`);
      }
    });

    // Check metafield relationships
    console.log(`\n\n🔗 Image-Metafield Relationships:`);
    const { data: imageMetafields, error: metaError } = await supabase
      .from('metafield_values')
      .select('*, metafield:metafields(*)')
      .eq('entity_type', 'image')
      .in('entity_id', images.map(i => i.id))
      .limit(20);

    if (metaError) {
      console.error('   ❌ Error fetching metafields:', metaError);
    } else {
      console.log(`   ✅ Found ${imageMetafields?.length || 0} metafield values for images`);
      imageMetafields?.slice(0, 5).forEach((mf, idx) => {
        console.log(`\n   Metafield ${idx + 1}:`);
        console.log(`   - Field: ${mf.metafield?.name || 'N/A'}`);
        console.log(`   - Value: ${mf.value}`);
        console.log(`   - Image ID: ${mf.entity_id}`);
      });
    }
  }

  // 4. PRODUCTS ANALYSIS
  console.log('\n\n' + '='.repeat(100));
  console.log('📦 PRODUCTS ANALYSIS');
  console.log('-'.repeat(100));

  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('*')
    .eq('source_document_id', DOCUMENT_ID)
    .order('created_at', { ascending: true });

  if (productsError) {
    console.error('❌ Error fetching products:', productsError);
  } else {
    console.log(`\n✅ Total Products Created: ${products.length}`);

    console.log(`\n📋 Product Details:`);
    products.forEach((product, idx) => {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`PRODUCT ${idx + 1}: ${product.name}`);
      console.log('='.repeat(80));
      console.log(`ID: ${product.id}`);
      console.log(`Status: ${product.status}`);
      console.log(`Created From: ${product.created_from_type}`);
      console.log(`\nDescription:`);
      console.log(`${product.description || 'N/A'}`);
      console.log(`\nLong Description:`);
      console.log(`${product.long_description?.substring(0, 300) || 'N/A'}...`);
      console.log(`\nProperties:`);
      console.log(JSON.stringify(product.properties, null, 2));
      console.log(`\nSpecifications:`);
      console.log(JSON.stringify(product.specifications, null, 2));
      console.log(`\nMetadata:`);
      console.log(JSON.stringify(product.metadata, null, 2));
      console.log(`\nSource Chunks: ${product.source_chunks?.length || 0} chunks`);
      console.log(`Has Embedding: ${product.embedding ? 'Yes' : 'No'}`);
      console.log(`Embedding Model: ${product.embedding_model || 'N/A'}`);
    });

    // Check product metafields
    console.log(`\n\n🔗 Product-Metafield Relationships:`);
    const { data: productMetafields, error: prodMetaError } = await supabase
      .from('metafield_values')
      .select('*, metafield:metafields(*)')
      .eq('entity_type', 'product')
      .in('entity_id', products.map(p => p.id));

    if (prodMetaError) {
      console.error('   ❌ Error fetching product metafields:', prodMetaError);
    } else {
      console.log(`   ✅ Found ${productMetafields?.length || 0} metafield values for products`);

      // Group by product
      const metafieldsByProduct = {};
      productMetafields?.forEach(mf => {
        if (!metafieldsByProduct[mf.entity_id]) {
          metafieldsByProduct[mf.entity_id] = [];
        }
        metafieldsByProduct[mf.entity_id].push(mf);
      });

      Object.keys(metafieldsByProduct).forEach((productId, idx) => {
        const product = products.find(p => p.id === productId);
        console.log(`\n   Product: ${product?.name || productId}`);
        metafieldsByProduct[productId].forEach(mf => {
          console.log(`   - ${mf.metafield?.name || 'Unknown'}: ${mf.value}`);
        });
      });
    }
  }

  // 5. EXPECTED VS ACTUAL PRODUCTS
  console.log('\n\n' + '='.repeat(100));
  console.log('🎯 EXPECTED VS ACTUAL PRODUCTS');
  console.log('-'.repeat(100));

  const expectedProducts = [
    { name: 'FOLD', pages: '6-7, 32-33', size: '15×38', designer: 'ESTUDI{H}AC' },
    { name: 'BEAT', pages: '8', size: '20×40', designer: '—' },
    { name: 'VALENOVA', pages: '23-26', size: '11.8×11.8', designer: 'SG NY (Stacy Garcia)' },
    { name: 'PIQUÉ', pages: '38-41', size: '10×40 / 10×10 / 20×20', designer: 'ESTUDI{H}AC' },
    { name: 'ONA', pages: '52-55', size: '12×45', designer: 'DSIGNIO' },
    { name: 'MARE', pages: '66-69', size: '32×90', designer: 'DSIGNIO' },
    { name: 'LOG', pages: '74-77', size: '12.5×50', designer: 'ALT DESIGN' },
    { name: 'BOW', pages: '84-91', size: '15×45', designer: 'MUT' },
    { name: 'LINS', pages: '94-103', size: '20×20', designer: 'YONOH' },
    { name: 'MAISON', pages: '116-121', size: '22.3×22.3', designer: 'ONSET (Francisco Segarra)' }
  ];

  console.log(`\n📊 Expected Products: ${expectedProducts.length}`);
  console.log(`📊 Actual Products Created: ${products?.length || 0}`);

  console.log(`\n📋 Expected Product List:`);
  expectedProducts.forEach((exp, idx) => {
    console.log(`   ${idx + 1}. ${exp.name} (${exp.size}) - Pages ${exp.pages} - Designer: ${exp.designer}`);
  });

  console.log(`\n🔍 Product Name Matching Analysis:`);
  expectedProducts.forEach(exp => {
    const found = products?.find(p =>
      p.name?.toUpperCase().includes(exp.name) ||
      p.description?.toUpperCase().includes(exp.name) ||
      p.long_description?.toUpperCase().includes(exp.name)
    );

    if (found) {
      console.log(`   ✅ ${exp.name}: FOUND in product "${found.name}"`);
    } else {
      console.log(`   ❌ ${exp.name}: NOT FOUND`);
    }
  });

  console.log('\n' + '='.repeat(100));
  console.log('✅ ANALYSIS COMPLETE');
  console.log('='.repeat(100) + '\n');
}

analyzeHarmonyResults().catch(console.error);