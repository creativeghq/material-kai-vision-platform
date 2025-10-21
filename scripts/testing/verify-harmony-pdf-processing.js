import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const DOCUMENT_ID = process.argv[2] || 'cb5fd9c8-be9e-4ba6-baec-365af6ba71d3'; // Harmony PDF - PRODUCT CREATION TEST

async function verifyHarmonyPDFProcessing() {
  console.log('\n🔍 **HARMONY PDF PROCESSING VERIFICATION**\n');
  console.log(`Document ID: ${DOCUMENT_ID}\n`);

  try {
    // 1. Check document record
    console.log('1️⃣ Checking document record...');
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', DOCUMENT_ID)
      .single();

    if (docError) {
      console.error(`❌ Document not found: ${docError.message}`);
      return;
    }

    console.log(`✅ Document found: "${document.title}"`);
    console.log(`   - Status: ${document.status}`);
    console.log(`   - Created: ${document.created_at}`);

    // 2. Check chunks
    console.log('\n2️⃣ Checking document chunks...');
    const { data: chunks, error: chunksError } = await supabase
      .from('document_chunks')
      .select('id, chunk_index, content')
      .eq('document_id', DOCUMENT_ID)
      .order('chunk_index');

    if (chunksError) {
      console.error(`❌ Error fetching chunks: ${chunksError.message}`);
    } else {
      console.log(`✅ Found ${chunks.length} chunks`);
      if (chunks.length > 0) {
        console.log(`   - First chunk (${chunks[0].content.substring(0, 100)}...)`);
        console.log(`   - Last chunk (${chunks[chunks.length - 1].content.substring(0, 100)}...)`);
      }
    }

    // 3. Check embeddings
    console.log('\n3️⃣ Checking embeddings...');
    const { data: embeddings, error: embError } = await supabase
      .from('embeddings')
      .select('id, chunk_id')
      .eq('document_id', DOCUMENT_ID);

    if (embError) {
      console.error(`❌ Error fetching embeddings: ${embError.message}`);
    } else {
      console.log(`✅ Found ${embeddings.length} embeddings`);
    }

    // 4. Check images
    console.log('\n4️⃣ Checking document images...');
    const { data: images, error: imgError } = await supabase
      .from('document_images')
      .select('*')
      .eq('document_id', DOCUMENT_ID)
      .order('page_number');

    if (imgError) {
      console.error(`❌ Error fetching images: ${imgError.message}`);
    } else {
      console.log(`✅ Found ${images.length} images`);

      if (images.length > 0) {
        console.log(`\n   📊 Image Details:`);

        // Group by page
        const imagesByPage = {};
        images.forEach(img => {
          if (!imagesByPage[img.page_number]) {
            imagesByPage[img.page_number] = [];
          }
          imagesByPage[img.page_number].push(img);
        });

        console.log(`   - Pages with images: ${Object.keys(imagesByPage).length}`);
        console.log(`   - Images per page:`);
        Object.entries(imagesByPage).forEach(([page, imgs]) => {
          console.log(`     • Page ${page}: ${imgs.length} images`);
        });

        // Check CLIP embeddings
        const imagesWithEmbeddings = images.filter(img => img.image_embedding && img.image_embedding.length > 0);
        console.log(`\n   - Images with CLIP embeddings: ${imagesWithEmbeddings.length}/${images.length}`);

        if (imagesWithEmbeddings.length > 0) {
          console.log(`   - Embedding dimensions: ${imagesWithEmbeddings[0].image_embedding.length}D`);
        }

        // Check Anthropic analysis
        const imagesWithAnalysis = images.filter(img => img.image_analysis_results && Object.keys(img.image_analysis_results).length > 0);
        console.log(`   - Images with Anthropic analysis: ${imagesWithAnalysis.length}/${images.length}`);

        // Check chunk relationships
        const imagesWithChunks = images.filter(img => img.chunk_id);
        console.log(`   - Images linked to chunks: ${imagesWithChunks.length}/${images.length}`);

        // Sample image details
        console.log(`\n   📸 Sample Image:`);
        const sampleImage = images[0];
        console.log(`   - URL: ${sampleImage.image_url}`);
        console.log(`   - Caption: ${sampleImage.caption}`);
        console.log(`   - Page: ${sampleImage.page_number}`);
        console.log(`   - Processing status: ${sampleImage.processing_status}`);
        console.log(`   - Quality score: ${sampleImage.quality_score}`);
      }
    }

    // 5. Check products
    console.log('\n5️⃣ Checking products created from chunks...');
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*')
      .eq('source_document_id', DOCUMENT_ID)
      .order('created_at');

    if (productsError) {
      console.error(`❌ Error fetching products: ${productsError.message}`);
    } else {
      console.log(`✅ Found ${products.length} products`);

      if (products.length > 0) {
        console.log(`\n   📦 Product Details:`);
        products.forEach((product, idx) => {
          console.log(`\n   Product ${idx + 1}:`);
          console.log(`   - ID: ${product.id}`);
          console.log(`   - Name: ${product.name}`);
          console.log(`   - Description: ${product.description?.substring(0, 100)}...`);
          console.log(`   - Status: ${product.status}`);
          console.log(`   - Created from: ${product.created_from_type}`);
          console.log(`   - Source chunks: ${product.source_chunks?.length || 0}`);
        });
      }
    }

    // 6. Summary
    console.log('\n📊 **PROCESSING SUMMARY**\n');
    console.log(`✅ Document: ${document.title}`);
    console.log(`✅ Chunks: ${chunks?.length || 0}`);
    console.log(`✅ Embeddings: ${embeddings?.length || 0}`);
    console.log(`✅ Images: ${images?.length || 0}`);
    console.log(`✅ Products: ${products?.length || 0}`);

    if (images && images.length > 0) {
      const imagesWithEmbeddings = images.filter(img => img.image_embedding && img.image_embedding.length > 0);
      const imagesWithAnalysis = images.filter(img => img.image_analysis_results && Object.keys(img.image_analysis_results).length > 0);
      const imagesWithChunks = images.filter(img => img.chunk_id);

      console.log(`\n🖼️ **IMAGE PROCESSING DETAILS**`);
      console.log(`   - CLIP embeddings: ${imagesWithEmbeddings.length}/${images.length}`);
      console.log(`   - Anthropic analysis: ${imagesWithAnalysis.length}/${images.length}`);
      console.log(`   - Chunk relationships: ${imagesWithChunks.length}/${images.length}`);

      if (imagesWithEmbeddings.length === images.length &&
          imagesWithAnalysis.length === images.length &&
          imagesWithChunks.length === images.length) {
        console.log(`\n🎉 **ALL IMAGES FULLY PROCESSED!**`);
      } else {
        console.log(`\n⚠️ **SOME IMAGES INCOMPLETE**`);
      }
    }

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    console.error(error);
  }
}

verifyHarmonyPDFProcessing();
