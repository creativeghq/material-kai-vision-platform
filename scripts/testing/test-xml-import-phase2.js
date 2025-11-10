/**
 * Test Script: XML Import Phase 2 - Backend Data Processing
 * 
 * Tests the complete XML import flow:
 * 1. Upload XML file with field mappings
 * 2. Edge Function creates import job
 * 3. Python API processes job in batches
 * 4. Images are downloaded
 * 5. Products are created in database
 * 6. Progress is tracked in real-time
 * 
 * Usage:
 *   node scripts/testing/test-xml-import-phase2.js
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const WORKSPACE_ID = 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e';
const CATEGORY = 'materials';

// Sample XML for testing
const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<catalog>
  <product>
    <name>Marble Tile Premium</name>
    <factory>Italian Stone Co</factory>
    <category>Natural Stone</category>
    <description>Premium white marble tiles with elegant veining</description>
    <price>89.99</price>
    <dimensions>60x60cm</dimensions>
    <finish>Polished</finish>
    <color>White</color>
    <image>https://images.unsplash.com/photo-1615971677499-5467cbab01c0?w=800</image>
  </product>
  <product>
    <name>Oak Hardwood Flooring</name>
    <factory>Nordic Woods</factory>
    <category>Wood Flooring</category>
    <description>Solid oak hardwood flooring with natural grain</description>
    <price>129.99</price>
    <dimensions>120x20cm</dimensions>
    <finish>Matte</finish>
    <color>Natural Oak</color>
    <image>https://images.unsplash.com/photo-1615876234886-fd9a39fda97f?w=800</image>
  </product>
  <product>
    <name>Ceramic Wall Tiles</name>
    <factory>Spanish Ceramics</factory>
    <category>Ceramic Tiles</category>
    <description>Modern ceramic wall tiles with geometric pattern</description>
    <price>45.99</price>
    <dimensions>30x30cm</dimensions>
    <finish>Glossy</finish>
    <color>Blue</color>
    <image>https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800</image>
  </product>
</catalog>`;

// Field mappings (XML field -> Platform field)
const FIELD_MAPPINGS = {
  'name': 'name',
  'factory': 'factory_name',
  'category': 'material_category',
  'description': 'description',
  'price': 'price',
  'dimensions': 'dimensions',
  'finish': 'finish',
  'color': 'color',
  'image': 'images'
};

console.log('🧪 XML Import Phase 2 - Integration Test\n');
console.log('=' .repeat(60));

// Initialize Supabase client
if (!SUPABASE_ANON_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_ANON_KEY not found in environment');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Step 1: Upload XML and create import job
 */
async function uploadXML() {
  console.log('\n📤 Step 1: Uploading XML file...');
  
  try {
    // Encode XML to base64
    const xmlBase64 = Buffer.from(SAMPLE_XML).toString('base64');
    
    // Call Edge Function
    const { data, error } = await supabase.functions.invoke('xml-import-orchestrator', {
      body: {
        workspace_id: WORKSPACE_ID,
        category: CATEGORY,
        xml_content: xmlBase64,
        field_mappings: FIELD_MAPPINGS,
        source_name: 'Test XML Import - Phase 2'
      }
    });
    
    if (error) {
      throw new Error(`Edge Function error: ${error.message}`);
    }
    
    console.log('✅ XML uploaded successfully');
    console.log(`   Job ID: ${data.job_id}`);
    console.log(`   Total Products: ${data.total_products}`);
    
    return data.job_id;
    
  } catch (error) {
    console.error('❌ Failed to upload XML:', error.message);
    throw error;
  }
}

/**
 * Step 2: Monitor job progress
 */
async function monitorJobProgress(jobId) {
  console.log('\n📊 Step 2: Monitoring job progress...');
  
  const maxAttempts = 60; // 5 minutes max
  const pollInterval = 5000; // 5 seconds
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Get job status from database
      const { data: job, error } = await supabase
        .from('data_import_jobs')
        .select('*')
        .eq('id', jobId)
        .single();
      
      if (error) {
        throw new Error(`Failed to get job status: ${error.message}`);
      }
      
      const status = job.status;
      const progress = job.processed_products || 0;
      const total = job.total_products || 0;
      const failed = job.failed_products || 0;
      const percentage = total > 0 ? Math.round((progress / total) * 100) : 0;
      
      console.log(`   [${attempt + 1}/${maxAttempts}] Status: ${status} | Progress: ${progress}/${total} (${percentage}%) | Failed: ${failed}`);
      
      if (status === 'completed') {
        console.log('✅ Job completed successfully!');
        return job;
      }
      
      if (status === 'failed') {
        console.error('❌ Job failed:', job.error_message);
        throw new Error(`Job failed: ${job.error_message}`);
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      
    } catch (error) {
      console.error('❌ Error monitoring job:', error.message);
      throw error;
    }
  }
  
  throw new Error('Job monitoring timeout - job did not complete in 5 minutes');
}

/**
 * Step 3: Verify products were created
 */
async function verifyProducts(jobId) {
  console.log('\n🔍 Step 3: Verifying products...');
  
  try {
    // Get products created from this import job
    const { data: products, error } = await supabase
      .from('products')
      .select('id, name, properties, metadata')
      .eq('properties->>import_job_id', jobId);
    
    if (error) {
      throw new Error(`Failed to get products: ${error.message}`);
    }
    
    console.log(`✅ Found ${products.length} products:`);
    
    products.forEach((product, index) => {
      console.log(`\n   Product ${index + 1}:`);
      console.log(`   - ID: ${product.id}`);
      console.log(`   - Name: ${product.name}`);
      console.log(`   - Factory: ${product.properties?.factory_name || 'N/A'}`);
      console.log(`   - Category: ${product.properties?.material_category || 'N/A'}`);
    });
    
    return products;
    
  } catch (error) {
    console.error('❌ Failed to verify products:', error.message);
    throw error;
  }
}

/**
 * Step 4: Verify images were downloaded
 */
async function verifyImages(products) {
  console.log('\n🖼️ Step 4: Verifying images...');
  
  try {
    let totalImages = 0;
    
    for (const product of products) {
      const { data: images, error } = await supabase
        .from('document_images')
        .select('id, filename, public_url, size_bytes')
        .eq('product_id', product.id);
      
      if (error) {
        console.warn(`⚠️ Failed to get images for product ${product.id}:`, error.message);
        continue;
      }
      
      if (images && images.length > 0) {
        console.log(`   ✅ Product "${product.name}": ${images.length} image(s)`);
        images.forEach(img => {
          console.log(`      - ${img.filename} (${Math.round(img.size_bytes / 1024)}KB)`);
        });
        totalImages += images.length;
      } else {
        console.log(`   ⚠️ Product "${product.name}": No images`);
      }
    }
    
    console.log(`\n   Total images downloaded: ${totalImages}`);
    return totalImages;
    
  } catch (error) {
    console.error('❌ Failed to verify images:', error.message);
    throw error;
  }
}

/**
 * Step 5: Verify import history
 */
async function verifyImportHistory(jobId) {
  console.log('\n📜 Step 5: Verifying import history...');
  
  try {
    const { data: history, error } = await supabase
      .from('data_import_history')
      .select('*')
      .eq('job_id', jobId);
    
    if (error) {
      throw new Error(`Failed to get import history: ${error.message}`);
    }
    
    const successful = history.filter(h => h.processing_status === 'success').length;
    const failed = history.filter(h => h.processing_status === 'failed').length;
    
    console.log(`✅ Import history records: ${history.length}`);
    console.log(`   - Successful: ${successful}`);
    console.log(`   - Failed: ${failed}`);
    
    return history;
    
  } catch (error) {
    console.error('❌ Failed to verify import history:', error.message);
    throw error;
  }
}

/**
 * Main test execution
 */
async function runTest() {
  try {
    console.log('Starting XML Import Phase 2 integration test...\n');
    
    // Step 1: Upload XML
    const jobId = await uploadXML();
    
    // Step 2: Monitor progress
    const completedJob = await monitorJobProgress(jobId);
    
    // Step 3: Verify products
    const products = await verifyProducts(jobId);
    
    // Step 4: Verify images
    const imageCount = await verifyImages(products);
    
    // Step 5: Verify import history
    const history = await verifyImportHistory(jobId);
    
    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('🎉 TEST COMPLETED SUCCESSFULLY!\n');
    console.log('Summary:');
    console.log(`  - Job ID: ${jobId}`);
    console.log(`  - Status: ${completedJob.status}`);
    console.log(`  - Products Created: ${products.length}`);
    console.log(`  - Images Downloaded: ${imageCount}`);
    console.log(`  - History Records: ${history.length}`);
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ TEST FAILED!');
    console.error(`Error: ${error.message}`);
    console.error('='.repeat(60));
    process.exit(1);
  }
}

// Run the test
runTest();

