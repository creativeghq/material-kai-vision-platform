#!/usr/bin/env node

/**
 * Generate CLIP embeddings for existing images in database
 * 
 * This script:
 * 1. Fetches all images for a document that don't have CLIP embeddings
 * 2. Downloads each image from storage
 * 3. Generates CLIP embeddings via API
 * 4. Updates the database with the embeddings
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MIVAA_API = 'http://v1api.materialshub.gr';

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable not set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function generateClipForExistingImages(documentId) {
  console.log(`\n🎨 Generating CLIP embeddings for document: ${documentId}\n`);

  // 1. Fetch all images without CLIP embeddings
  const { data: images, error } = await supabase
    .from('document_images')
    .select('id, image_url, page_number, metadata')
    .eq('document_id', documentId)
    .is('visual_clip_embedding_512', null);

  if (error) {
    console.error('❌ Error fetching images:', error);
    return;
  }

  console.log(`📊 Found ${images.length} images without CLIP embeddings\n`);

  let successCount = 0;
  let failCount = 0;

  // 2. Process each image
  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    console.log(`[${i + 1}/${images.length}] Processing image ${image.id} (page ${image.page_number})...`);

    try {
      // Download image from storage
      const imageResponse = await fetch(image.image_url);
      if (!imageResponse.ok) {
        throw new Error(`Failed to download image: ${imageResponse.statusText}`);
      }

      const imageBuffer = await imageResponse.arrayBuffer();
      const imageBase64 = Buffer.from(imageBuffer).toString('base64');

      // Generate CLIP embeddings
      const clipResponse = await fetch(`${MIVAA_API}/api/embeddings/clip-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_data: imageBase64,
          model: 'clip-vit-base-patch32'
        })
      });

      if (!clipResponse.ok) {
        const errorText = await clipResponse.text();
        throw new Error(`CLIP API error: ${clipResponse.status} - ${errorText}`);
      }

      const clipResult = await clipResponse.json();

      // Update database with CLIP embeddings
      const { error: updateError } = await supabase
        .from('document_images')
        .update({
          visual_clip_embedding_512: clipResult.embedding_512,
          processing_status: 'completed',
          embedding_metadata: {
            ...image.metadata?.embedding_metadata,
            clip_generated_at: new Date().toISOString(),
            clip_model: 'clip-vit-base-patch32'
          }
        })
        .eq('id', image.id);

      if (updateError) {
        throw new Error(`Database update error: ${updateError.message}`);
      }

      successCount++;
      console.log(`   ✅ Success (${successCount}/${images.length})`);

    } catch (error) {
      failCount++;
      console.error(`   ❌ Failed: ${error.message}`);
    }

    // Small delay to avoid overwhelming the API
    if (i < images.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log(`\n📊 Final Results:`);
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log(`   📈 Success Rate: ${((successCount / images.length) * 100).toFixed(1)}%\n`);
}

// Run the script
const documentId = process.argv[2];

if (!documentId) {
  console.error('Usage: node generate-clip-for-existing-images.js <document_id>');
  process.exit(1);
}

generateClipForExistingImages(documentId)
  .then(() => {
    console.log('✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

