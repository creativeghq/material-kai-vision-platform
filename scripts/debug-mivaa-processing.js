#!/usr/bin/env node

/**
 * Debug MIVAA Processing
 * Check what's actually happening with the processing
 */

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';

async function debugMivaaProcessing() {
  console.log('🔍 Debugging MIVAA Processing...\n');

  // Test 1: Try direct document processing instead of bulk
  console.log('📄 Step 1: Testing direct document processing...');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'pdf_process_document',
        payload: {
          fileUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
          filename: 'dummy.pdf',
          options: {
            extract_text: true,
            extract_images: true,
            extract_tables: true,
          }
        }
      })
    });

    const data = await response.json();
    
    console.log(`   Status: ${response.status}`);
    console.log(`   Response keys:`, Object.keys(data));
    
    if (response.ok) {
      console.log('   ✅ Direct processing works!');
      
      if (data.chunks) console.log(`   📝 Chunks: ${data.chunks.length}`);
      if (data.images) console.log(`   🖼️  Images: ${data.images.length}`);
      if (data.content) console.log(`   📄 Content: ${data.content.length} chars`);
      if (data.text) console.log(`   📄 Text: ${data.text.length} chars`);
      if (data.metadata) console.log(`   📊 Metadata:`, Object.keys(data.metadata));
      
      // Show first few chunks if available
      if (data.chunks && data.chunks.length > 0) {
        console.log(`   📝 First chunk preview: "${data.chunks[0].substring(0, 100)}..."`);
      }
      
    } else {
      console.log('   ❌ Direct processing failed');
      console.log('   📊 Error:', data);
    }
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  console.log('\n' + '='.repeat(60));

  // Test 2: Try PDF extract endpoints
  console.log('\n📄 Step 2: Testing PDF extract endpoints...');
  
  const extractEndpoints = ['pdf_extract_markdown', 'pdf_extract_tables', 'pdf_extract_images'];
  
  for (const endpoint of extractEndpoints) {
    console.log(`\n   🔍 Testing ${endpoint}...`);
    
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: endpoint,
          payload: {
            fileUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            filename: 'dummy.pdf'
          }
        })
      });

      const data = await response.json();
      
      console.log(`      Status: ${response.status}`);
      
      if (response.ok) {
        console.log(`      ✅ ${endpoint} works!`);
        console.log(`      📊 Response keys:`, Object.keys(data));
        
        if (data.markdown) console.log(`      📝 Markdown: ${data.markdown.length} chars`);
        if (data.tables) console.log(`      📊 Tables: ${data.tables.length}`);
        if (data.images) console.log(`      🖼️  Images: ${data.images.length}`);
        if (data.content) console.log(`      📄 Content: ${data.content.length} chars`);
        
      } else {
        console.log(`      ❌ ${endpoint} failed:`, data.message || 'Unknown error');
      }
      
    } catch (error) {
      console.log(`      ❌ Error: ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(60));

  // Test 3: Check what bulk processing actually does
  console.log('\n📦 Step 3: Analyzing bulk processing behavior...');
  
  try {
    // Create a job with a real PDF that should have content
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
      const jobId = data.data.job_id;
      console.log(`   ✅ Job created: ${jobId}`);
      
      // Wait a bit and check detailed status
      console.log('   ⏳ Waiting 10 seconds then checking detailed status...');
      await new Promise(resolve => setTimeout(resolve, 10000));
      
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
        console.log('   📊 Detailed job status:');
        console.log('      Status:', statusData.data.status);
        console.log('      Progress:', statusData.data.progress_percentage + '%');
        console.log('      Current step:', statusData.data.current_step);
        
        if (statusData.data.details) {
          console.log('      Details:', statusData.data.details);
        }
        
        if (statusData.data.parameters) {
          console.log('      Parameters:', statusData.data.parameters);
        }
        
        if (statusData.data.result) {
          console.log('      Result available:', Object.keys(statusData.data.result));
        } else {
          console.log('      ⚠️  No result data yet');
        }
      }
      
    } else {
      console.log('   ❌ Failed to create bulk job');
    }
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  console.log('\n🎯 Debug Complete!');
  console.log('\n📝 Analysis:');
  console.log('   - Check which endpoints actually return processing results');
  console.log('   - Bulk processing might be async without storing results');
  console.log('   - Direct processing endpoints might work better');
  console.log('   - May need to use different approach for getting results');
}

// Run the debug
debugMivaaProcessing().catch(console.error);
