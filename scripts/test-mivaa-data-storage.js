#!/usr/bin/env node

/**
 * Test MIVAA Data Storage Integration
 * Verify that MIVAA processing results are properly stored in the database
 */

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';

async function testMivaaDataStorage() {
  console.log('🔍 Testing MIVAA Data Storage Integration...\n');

  // Step 1: Check current database state
  console.log('📊 Step 1: Checking current database state...');
  
  try {
    // Check chunks
    const chunksResponse = await fetch(`${SUPABASE_URL}/rest/v1/document_chunks?select=count`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'count=exact'
      }
    });
    
    const chunksCount = chunksResponse.headers.get('content-range')?.split('/')[1] || '0';
    console.log(`   📝 Current chunks: ${chunksCount}`);

    // Check images
    const imagesResponse = await fetch(`${SUPABASE_URL}/rest/v1/document_images?select=count`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'count=exact'
      }
    });
    
    const imagesCount = imagesResponse.headers.get('content-range')?.split('/')[1] || '0';
    console.log(`   🖼️  Current images: ${imagesCount}`);

    // Check embeddings
    const embeddingsResponse = await fetch(`${SUPABASE_URL}/rest/v1/embeddings?select=count`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'count=exact'
      }
    });
    
    const embeddingsCount = embeddingsResponse.headers.get('content-range')?.split('/')[1] || '0';
    console.log(`   🧠 Current embeddings: ${embeddingsCount}`);

  } catch (error) {
    console.log(`   ❌ Error checking database: ${error.message}`);
  }

  console.log('\n' + '='.repeat(60));

  // Step 2: Process a PDF and monitor data storage
  console.log('\n📄 Step 2: Processing PDF and monitoring data storage...');
  
  let jobId = null;
  
  try {
    // Start MIVAA processing
    const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'bulk_process',
        payload: {
          urls: ['https://www.adobe.com/support/products/enterprise/knowledgecenter/media/c4611_sample_explain.pdf'],
          batch_size: 1,
          processing_options: {
            extract_text: true,
            extract_images: true,
            extract_tables: true,
          }
        }
      })
    });

    const data = await response.json();
    
    if (response.ok && data.data && data.data.job_id) {
      jobId = data.data.job_id;
      console.log(`   ✅ Job created: ${jobId}`);
    } else {
      console.log('   ❌ Failed to create job');
      return;
    }
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return;
  }

  // Step 3: Wait for completion and check data storage
  console.log('\n⏳ Step 3: Waiting for completion and checking data storage...');
  
  let completed = false;
  let attempts = 0;
  const maxAttempts = 24; // 2 minutes max
  
  while (!completed && attempts < maxAttempts) {
    try {
      // Check job status
      const statusResponse = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'get_job_status',
          payload: { job_id: jobId }
        })
      });

      const statusData = await statusResponse.json();
      
      if (statusResponse.ok && statusData.data) {
        const status = statusData.data.status;
        const progress = statusData.data.progress_percentage || 0;
        const details = statusData.data.details || {};
        
        console.log(`   📊 Attempt ${attempts + 1}: Status=${status}, Progress=${progress}%`);
        
        if (details.chunks_created) {
          console.log(`      📝 Chunks created: ${details.chunks_created}`);
        }
        if (details.images_extracted) {
          console.log(`      🖼️  Images extracted: ${details.images_extracted}`);
        }
        
        if (status === 'completed') {
          completed = true;
          console.log('   ✅ Job completed!');
          
          // Now check if data was stored in database
          console.log('\n🔍 Step 4: Verifying data storage in database...');
          
          // Wait a moment for data to be stored
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Check chunks again
          const newChunksResponse = await fetch(`${SUPABASE_URL}/rest/v1/document_chunks?select=count`, {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'count=exact'
            }
          });
          
          const newChunksCount = newChunksResponse.headers.get('content-range')?.split('/')[1] || '0';
          console.log(`   📝 New chunks count: ${newChunksCount}`);

          // Check images again
          const newImagesResponse = await fetch(`${SUPABASE_URL}/rest/v1/document_images?select=count`, {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'count=exact'
            }
          });
          
          const newImagesCount = newImagesResponse.headers.get('content-range')?.split('/')[1] || '0';
          console.log(`   🖼️  New images count: ${newImagesCount}`);

          // Check embeddings again
          const newEmbeddingsResponse = await fetch(`${SUPABASE_URL}/rest/v1/embeddings?select=count`, {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'count=exact'
            }
          });
          
          const newEmbeddingsCount = newEmbeddingsResponse.headers.get('content-range')?.split('/')[1] || '0';
          console.log(`   🧠 New embeddings count: ${newEmbeddingsCount}`);

          // Check for recent entries
          console.log('\n📋 Step 5: Checking recent entries...');
          
          const recentChunksResponse = await fetch(`${SUPABASE_URL}/rest/v1/document_chunks?select=*&order=created_at.desc&limit=3`, {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (recentChunksResponse.ok) {
            const recentChunks = await recentChunksResponse.json();
            console.log(`   📝 Recent chunks: ${recentChunks.length} found`);
            
            recentChunks.forEach((chunk, index) => {
              console.log(`      ${index + 1}. ${chunk.content.substring(0, 100)}...`);
              console.log(`         Document ID: ${chunk.document_id}`);
              console.log(`         Created: ${new Date(chunk.created_at).toLocaleString()}`);
            });
          }
          
          break;
        } else if (status === 'failed' || status === 'error') {
          console.log(`   ❌ Job failed: ${statusData.data.error_message || 'Unknown error'}`);
          return;
        }
        
      } else {
        console.log(`   ❌ Status check failed: ${statusData.message || 'Unknown error'}`);
      }
      
    } catch (error) {
      console.log(`   ❌ Error checking status: ${error.message}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    attempts++;
  }
  
  if (!completed) {
    console.log('   ⏰ Timeout waiting for completion');
    return;
  }

  console.log('\n🎯 Test Complete!');
  console.log('\n📝 Summary:');
  console.log('   - MIVAA processing completed successfully');
  console.log('   - Check the Knowledge Base UI to see if data appears');
  console.log('   - If no data appears, there may be an issue with data storage integration');
}

// Run the test
testMivaaDataStorage().catch(console.error);
