import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function diagnoseImageStorage() {
  console.log('\n🔍 DIAGNOSING IMAGE STORAGE ISSUE\n');
  console.log('='.repeat(80));

  // Get the most recent document from the last test run
  const { data: documents, error: docsError } = await supabase
    .from('documents')
    .select('id, filename, created_at, metadata, processing_status')
    .order('created_at', { ascending: false })
    .limit(5);

  if (docsError) {
    console.error('❌ Error fetching documents:', docsError);
    return;
  }

  console.log(`\n📄 Found ${documents.length} recent documents:\n`);
  documents.forEach((doc, i) => {
    console.log(`${i + 1}. ${doc.filename || 'Untitled'}`);
    console.log(`   ID: ${doc.id}`);
    console.log(`   Created: ${doc.created_at}`);
    console.log(`   Status: ${doc.processing_status}`);
    console.log(`   Metadata:`, JSON.stringify(doc.metadata, null, 2));
    console.log('');
  });

  // Check each document for images
  for (const doc of documents) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 ANALYZING DOCUMENT: ${doc.filename || doc.id}`);
    console.log(`${'='.repeat(80)}\n`);

    // Check database for images
    const { data: dbImages, error: imagesError } = await supabase
      .from('document_images')
      .select('*')
      .eq('document_id', doc.id);

    console.log(`📸 Database Images: ${dbImages?.length || 0}`);
    if (dbImages && dbImages.length > 0) {
      dbImages.slice(0, 3).forEach((img, i) => {
        console.log(`   ${i + 1}. URL: ${img.image_url}`);
        console.log(`      Page: ${img.page_number}, Type: ${img.image_type}`);
      });
    }

    // Check chunks
    const { data: chunks, error: chunksError } = await supabase
      .from('document_chunks')
      .select('id, chunk_index, content')
      .eq('document_id', doc.id)
      .limit(5);

    console.log(`📝 Database Chunks: ${chunks?.length || 0}`);
    if (chunks && chunks.length > 0) {
      console.log(`   Sample: "${chunks[0].content.substring(0, 100)}..."`);
    }

    // Try MIVAA gateway to get document content
    console.log(`\n🔍 Querying MIVAA gateway for document content...`);
    try {
      const mivaaResponse = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'get_document_content',
          payload: { document_id: doc.id }
        })
      });

      const mivaaText = await mivaaResponse.text();
      let mivaaData;
      try {
        mivaaData = JSON.parse(mivaaText);
      } catch (e) {
        console.log(`⚠️ MIVAA response not JSON: ${mivaaText.substring(0, 200)}`);
        continue;
      }

      console.log(`📊 MIVAA Response:`, {
        success: mivaaData.success,
        hasData: !!mivaaData.data,
        dataKeys: mivaaData.data ? Object.keys(mivaaData.data) : []
      });

      if (mivaaData.success && mivaaData.data) {
        const data = mivaaData.data;
        console.log(`   Chunks: ${data.chunks_created || data.chunks?.length || 0}`);
        console.log(`   Images: ${data.images_extracted || data.images?.length || 0}`);
        console.log(`   Text Length: ${data.text_length || 0}`);
        
        if (data.images && data.images.length > 0) {
          console.log(`\n   📸 Sample Images from MIVAA:`);
          data.images.slice(0, 3).forEach((img, i) => {
            console.log(`      ${i + 1}. ${JSON.stringify(img, null, 2)}`);
          });
        }
      }

      // Try get_document_images endpoint
      console.log(`\n🔍 Querying MIVAA gateway for document images...`);
      const imagesResponse = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'get_document_images',
          payload: { document_id: doc.id }
        })
      });

      const imagesText = await imagesResponse.text();
      let imagesData;
      try {
        imagesData = JSON.parse(imagesText);
      } catch (e) {
        console.log(`⚠️ Images response not JSON: ${imagesText.substring(0, 200)}`);
        continue;
      }

      console.log(`📊 MIVAA Images Response:`, {
        success: imagesData.success,
        hasData: !!imagesData.data,
        dataType: Array.isArray(imagesData.data) ? 'array' : typeof imagesData.data,
        dataLength: Array.isArray(imagesData.data) ? imagesData.data.length : 'N/A'
      });

      if (imagesData.data && Array.isArray(imagesData.data) && imagesData.data.length > 0) {
        console.log(`\n   📸 Images from get_document_images:`);
        imagesData.data.slice(0, 3).forEach((img, i) => {
          console.log(`      ${i + 1}. ${JSON.stringify(img, null, 2)}`);
        });
      }

    } catch (error) {
      console.error(`❌ Error querying MIVAA:`, error.message);
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log('✅ DIAGNOSIS COMPLETE');
  console.log(`${'='.repeat(80)}\n`);
}

diagnoseImageStorage().catch(console.error);

