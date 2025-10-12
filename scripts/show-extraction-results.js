#!/usr/bin/env node

/**
 * Comprehensive Results Display Script
 * Shows detailed extraction results from MIVAA PDF processing
 */

const MIVAA_BASE_URL = 'http://localhost:8000';
const PDF_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/49f683ad-ebf2-4296-a410-0d8c011ce0be/WIFI%20MOMO%20lookbook%2001s.pdf';

async function makeRequest(url, options = {}) {
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`❌ Request failed: ${error.message}`);
    throw error;
  }
}

async function processAndShowResults() {
  console.log('🎯 WIFI MOMO LOOKBOOK - COMPREHENSIVE EXTRACTION RESULTS');
  console.log('='.repeat(80));
  
  try {
    // Step 1: Submit processing job
    console.log('\n📤 Step 1: Submitting PDF for processing...');
    const bulkResponse = await makeRequest(`${MIVAA_BASE_URL}/api/bulk/process`, {
      method: 'POST',
      body: JSON.stringify({
        urls: [PDF_URL],
        batch_size: 1,
        options: {
          extract_text: true,
          extract_images: true,
          extract_tables: true
        }
      })
    });
    
    const jobId = bulkResponse.data?.job_id;
    if (!jobId) {
      throw new Error('No job ID returned');
    }
    
    console.log(`✅ Job submitted: ${jobId}`);
    
    // Step 2: Monitor job completion
    console.log('\n⏰ Step 2: Monitoring job progress...');
    let attempts = 0;
    const maxAttempts = 40; // 10 minutes max
    let jobStatus = 'pending';
    
    while (attempts < maxAttempts && jobStatus !== 'completed') {
      await new Promise(resolve => setTimeout(resolve, 15000)); // Wait 15 seconds
      
      const jobsResponse = await makeRequest(`${MIVAA_BASE_URL}/api/jobs`);
      const job = jobsResponse.jobs?.find(j => j.job_id === jobId);
      
      if (job) {
        jobStatus = job.status;
        console.log(`🔄 Attempt ${attempts + 1}: Status = ${jobStatus}`);
        
        if (jobStatus === 'failed') {
          throw new Error(`Job failed: ${job.error_message || 'Unknown error'}`);
        }
      } else {
        console.log(`⚠️ Job ${jobId} not found in jobs list`);
      }
      
      attempts++;
    }
    
    if (jobStatus !== 'completed') {
      throw new Error(`Job did not complete within ${maxAttempts * 15} seconds`);
    }
    
    console.log('✅ Job completed successfully!');
    
    // Step 3: Get detailed results
    console.log('\n📊 Step 3: Retrieving detailed extraction results...');
    
    // Try to get results from different endpoints
    let results = null;
    
    // Try job results endpoint
    try {
      results = await makeRequest(`${MIVAA_BASE_URL}/api/jobs/${jobId}/results`);
      console.log('✅ Retrieved results from job results endpoint');
    } catch (error) {
      console.log('⚠️ Job results endpoint not available, trying alternative...');
      
      // Try direct processing endpoint
      try {
        const directResponse = await makeRequest(`${MIVAA_BASE_URL}/api/documents/process`, {
          method: 'POST',
          body: JSON.stringify({
            url: PDF_URL,
            extract_text: true,
            extract_images: true,
            extract_tables: true
          })
        });
        results = directResponse;
        console.log('✅ Retrieved results from direct processing endpoint');
      } catch (directError) {
        console.log('⚠️ Direct processing also failed, showing job status only');
        results = { message: 'Results not accessible via API endpoints' };
      }
    }
    
    // Step 4: Display comprehensive results
    console.log('\n' + '='.repeat(80));
    console.log('📋 COMPREHENSIVE EXTRACTION RESULTS');
    console.log('='.repeat(80));
    
    if (results && results.chunks) {
      console.log(`\n📝 TEXT CHUNKS EXTRACTED: ${results.chunks.length}`);
      console.log('-'.repeat(50));
      
      results.chunks.forEach((chunk, index) => {
        console.log(`\n🔸 Chunk ${index + 1}:`);
        console.log(`   Length: ${chunk.length} characters`);
        console.log(`   Preview: "${chunk.substring(0, 100)}${chunk.length > 100 ? '...' : ''}"`);
        
        // Check for specific MOMO content
        if (chunk.toLowerCase().includes('momo')) {
          console.log(`   ✨ Contains MOMO brand content!`);
        }
      });
    }
    
    if (results && results.images) {
      console.log(`\n🖼️ IMAGES EXTRACTED: ${results.images.length}`);
      console.log('-'.repeat(50));
      
      results.images.forEach((image, index) => {
        console.log(`\n🔸 Image ${index + 1}:`);
        console.log(`   URL: ${image.url || 'N/A'}`);
        console.log(`   Size: ${image.width || 'N/A'}x${image.height || 'N/A'}`);
        console.log(`   Format: ${image.format || 'N/A'}`);
        console.log(`   Page: ${image.page || 'N/A'}`);
        
        if (image.description) {
          console.log(`   Description: ${image.description}`);
        }
      });
    }
    
    if (results && results.metadata) {
      console.log(`\n📊 DOCUMENT METADATA:`);
      console.log('-'.repeat(50));
      console.log(`   Pages: ${results.metadata.pages || 'N/A'}`);
      console.log(`   Word Count: ${results.metadata.word_count || 'N/A'}`);
      console.log(`   Character Count: ${results.metadata.character_count || 'N/A'}`);
      console.log(`   Processing Time: ${results.metadata.processing_time || 'N/A'}s`);
    }
    
    // Step 5: Show layout relationships
    console.log(`\n🔗 LAYOUT RELATIONSHIPS:`);
    console.log('-'.repeat(50));
    
    if (results && results.chunks && results.images) {
      console.log(`   Total Content Units: ${results.chunks.length + results.images.length}`);
      console.log(`   Text-to-Image Ratio: ${results.chunks.length}:${results.images.length}`);
      
      // Analyze content distribution
      const pagesWithContent = new Set();
      if (results.images) {
        results.images.forEach(img => {
          if (img.page) pagesWithContent.add(img.page);
        });
      }
      
      console.log(`   Pages with Images: ${pagesWithContent.size}`);
      console.log(`   Average Images per Page: ${(results.images.length / pagesWithContent.size).toFixed(1)}`);
    }
    
    // Step 6: Content quality analysis
    console.log(`\n✨ CONTENT QUALITY ANALYSIS:`);
    console.log('-'.repeat(50));
    
    if (results && results.chunks) {
      const totalText = results.chunks.join(' ');
      const momoMentions = (totalText.match(/momo/gi) || []).length;
      const designTerms = (totalText.match(/design|aesthetic|style|elegant/gi) || []).length;
      
      console.log(`   MOMO Brand Mentions: ${momoMentions}`);
      console.log(`   Design-related Terms: ${designTerms}`);
      console.log(`   Text Extraction Quality: ${totalText.length > 1000 ? 'High' : totalText.length > 100 ? 'Medium' : 'Low'}`);
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('🎉 EXTRACTION ANALYSIS COMPLETE!');
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    console.error(`📋 Full error:`, error);
  }
}

// Run the analysis
processAndShowResults().catch(console.error);
