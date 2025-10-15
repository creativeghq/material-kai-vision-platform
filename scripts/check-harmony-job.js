#!/usr/bin/env node

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';
const HARMONY_JOB_ID = 'bulk_20251015_063206';

async function checkHarmonyJob() {
  try {
    console.log(`🔍 Checking Harmony job: ${HARMONY_JOB_ID}`);
    
    const response = await fetch(`${MIVAA_BASE_URL}/api/jobs/${HARMONY_JOB_ID}/status`);
    
    if (response.ok) {
      const data = await response.json();
      const jobData = data.data || data;
      
      console.log(`📊 Status: ${jobData.status}`);
      console.log(`📈 Progress: ${Math.round(jobData.progress_percentage * 100) / 100 || 0}%`);
      console.log(`📝 Step: ${jobData.current_step || 'Unknown'}`);
      
      if (jobData.details) {
        console.log(`\n📊 PROCESSING RESULTS:`);
        console.log(`   📄 Documents Processed: ${jobData.details.processed_count || 0}`);
        console.log(`   ❌ Documents Failed: ${jobData.details.failed_count || 0}`);
        console.log(`   📄 Total Chunks Created: ${jobData.details.chunks_created || 0}`);
        console.log(`   🖼️ Total Images Extracted: ${jobData.details.images_extracted || 0}`);
        
        if (jobData.details.results && jobData.details.results.length > 0) {
          const result = jobData.details.results[0];
          console.log(`\n📋 DOCUMENT DETAILS:`);
          console.log(`   📊 Status: ${result.status}`);
          console.log(`   🆔 Document ID: ${result.document_id || 'N/A'}`);
          
          if (result.error) {
            console.log(`   ❌ Error: ${result.error}`);
          }
          
          // Test database retrieval if we have a document ID
          if (result.document_id) {
            console.log(`\n📋 TESTING DATABASE RETRIEVAL:`);
            
            // Test chunks
            try {
              const chunksResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents/${result.document_id}/chunks`);
              console.log(`   📄 Chunks endpoint: ${chunksResponse.status}`);
              
              if (chunksResponse.ok) {
                const chunksData = await chunksResponse.json();
                const chunkCount = chunksData.data?.length || 0;
                console.log(`   📄 Database chunks: ${chunkCount}`);
                
                if (chunkCount > 0) {
                  console.log(`   🎉 CHUNKS FOUND IN DATABASE!`);
                  const firstChunk = chunksData.data[0];
                  console.log(`   📄 First chunk: ${(firstChunk.content || '').substring(0, 80)}...`);
                } else {
                  console.log(`   ⚠️ No chunks in database`);
                }
              } else {
                const errorText = await chunksResponse.text();
                console.log(`   ❌ Chunks error: ${errorText.substring(0, 100)}...`);
              }
            } catch (e) {
              console.log(`   ❌ Chunks test failed: ${e.message}`);
            }
            
            // Test images
            try {
              const imagesResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents/${result.document_id}/images`);
              console.log(`   🖼️ Images endpoint: ${imagesResponse.status}`);
              
              if (imagesResponse.ok) {
                const imagesData = await imagesResponse.json();
                const imageCount = imagesData.data?.length || 0;
                console.log(`   🖼️ Database images: ${imageCount}`);
                
                if (imageCount > 0) {
                  console.log(`   🎉 IMAGES FOUND IN DATABASE!`);
                } else {
                  console.log(`   ⚠️ No images in database`);
                }
              } else {
                const errorText = await imagesResponse.text();
                console.log(`   ❌ Images error: ${errorText.substring(0, 100)}...`);
              }
            } catch (e) {
              console.log(`   ❌ Images test failed: ${e.message}`);
            }
          }
        }
      }
      
    } else {
      console.log(`❌ Failed: ${response.status} ${response.statusText}`);
    }
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

checkHarmonyJob();
