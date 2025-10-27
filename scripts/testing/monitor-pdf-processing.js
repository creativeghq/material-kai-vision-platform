#!/usr/bin/env node

/**
 * REAL-TIME PDF PROCESSING MONITOR
 *
 * Monitors PDF processing with detailed metrics:
 * 1. Pages processed
 * 2. Images extracted
 * 3. Chunks created
 * 4. Metadata extracted
 * 5. AI model usage (Llama, Claude, CLIP)
 * 6. Errors and issues
 */

import fetch from 'node-fetch';

// Configuration
const MIVAA_GATEWAY_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/mivaa-gateway';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const JOB_ID = process.argv[2];
if (!JOB_ID) {
  console.error('❌ Usage: node monitor-pdf-processing.js <job_id>');
  process.exit(1);
}

let previousMetrics = {
  pages: 0,
  images: 0,
  chunks: 0,
  products: 0,
  errors: []
};

async function callMivaaGateway(action, data = {}) {
  const response = await fetch(MIVAA_GATEWAY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
    },
    body: JSON.stringify({ action, ...data })
  });

  if (!response.ok) {
    throw new Error(`MIVAA Gateway error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

async function getJobMetrics(jobId) {
  try {
    // Get job status from MIVAA
    const jobResponse = await callMivaaGateway('get_job_status', { job_id: jobId });

    if (!jobResponse.success) {
      throw new Error(jobResponse.message || 'Failed to get job status');
    }

    const job = jobResponse.data;
    const documentId = job.document_id;
    const progress = job.progress || 0;
    const status = job.status;

    // Get document content with chunks and images from MIVAA API
    const docResponse = await callMivaaGateway('get_document_content', {
      document_id: documentId,
      include_chunks: true,
      include_images: true
    });

    const chunks = docResponse.data?.chunks || [];
    const images = docResponse.data?.images || [];
    const metadata = docResponse.data?.metadata || {};

    // Count embeddings and analysis
    const chunksWithEmbeddings = chunks.filter(c => c.embedding && c.embedding.length > 0).length;
    const imagesWithClip = images.filter(i => i.clip_embedding && i.clip_embedding.length > 0).length;
    const imagesWithAnalysis = images.filter(i => i.analysis_data && Object.keys(i.analysis_data).length > 0).length;

    // Get products count (if available)
    let productsCount = 0;
    try {
      const productsResponse = await callMivaaGateway('get_document_products', { document_id: documentId });
      productsCount = productsResponse.data?.products?.length || 0;
    } catch (e) {
      // Products endpoint might not exist yet
    }

    return {
      status,
      progress,
      documentId,
      pages: metadata.page_count || job.total_pages || 0,
      chunks: chunks.length,
      chunksWithEmbeddings,
      images: images.length,
      imagesWithClip,
      imagesWithAnalysis,
      products: productsCount,
      metadata: job.metadata || {},
      result: job.result || {},
      errorDetails: job.error || null
    };
  } catch (error) {
    console.error('❌ Error fetching metrics:', error.message);
    return null;
  }
}

async function getServerErrors() {
  try {
    // Get recent errors from MIVAA logs endpoint
    const response = await callMivaaGateway('get_service_logs', {
      level: 'ERROR',
      limit: 20
    });

    if (response.success && response.data?.logs) {
      return response.data.logs.map(log => log.message || log);
    }

    return [];
  } catch (error) {
    // Fallback: return empty array if logs endpoint doesn't exist
    return [];
  }
}

function printMetrics(metrics, errors) {
  console.clear();
  console.log('═'.repeat(100));
  console.log('📊 REAL-TIME PDF PROCESSING MONITOR');
  console.log('═'.repeat(100));
  console.log(`Job ID: ${JOB_ID}`);
  console.log(`Document ID: ${metrics.documentId}`);
  console.log(`Status: ${metrics.status.toUpperCase()} (${metrics.progress}%)`);
  console.log('─'.repeat(100));
  
  console.log('\n📄 PROCESSING METRICS:');
  console.log(`  Pages Processed:     ${metrics.pages}`);
  console.log(`  Images Extracted:    ${metrics.images} (${metrics.imagesWithClip} with CLIP, ${metrics.imagesWithAnalysis} with analysis)`);
  console.log(`  Chunks Created:      ${metrics.chunks} (${metrics.chunksWithEmbeddings} with embeddings)`);
  console.log(`  Products Detected:   ${metrics.products}`);
  
  console.log('\n🤖 AI MODEL USAGE:');
  const llamaUsage = metrics.result.llama_calls || 0;
  const claudeUsage = metrics.result.claude_calls || 0;
  const clipUsage = metrics.imagesWithClip;
  console.log(`  Llama 4 Scout:       ${llamaUsage} calls`);
  console.log(`  Claude Vision:       ${claudeUsage} calls`);
  console.log(`  CLIP Embeddings:     ${clipUsage} generated`);
  
  console.log('\n📈 DELTA (since last check):');
  console.log(`  +Pages:    ${metrics.pages - previousMetrics.pages}`);
  console.log(`  +Images:   ${metrics.images - previousMetrics.images}`);
  console.log(`  +Chunks:   ${metrics.chunks - previousMetrics.chunks}`);
  console.log(`  +Products: ${metrics.products - previousMetrics.products}`);
  
  if (errors.length > 0) {
    console.log('\n❌ RECENT ERRORS:');
    errors.slice(-10).forEach((error, i) => {
      const timestamp = error.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)?.[0] || '';
      const message = error.replace(/.*ERROR - /, '').substring(0, 80);
      console.log(`  ${i + 1}. [${timestamp}] ${message}`);
    });
  } else {
    console.log('\n✅ NO ERRORS DETECTED');
  }
  
  console.log('\n📊 METADATA EXTRACTED:');
  const metadata = metrics.metadata || {};
  Object.entries(metadata).slice(0, 5).forEach(([key, value]) => {
    console.log(`  ${key}: ${JSON.stringify(value).substring(0, 60)}`);
  });
  
  console.log('\n─'.repeat(100));
  console.log(`Last updated: ${new Date().toLocaleTimeString()}`);
  console.log('Press Ctrl+C to stop monitoring');
  console.log('═'.repeat(100));
  
  // Update previous metrics
  previousMetrics = {
    pages: metrics.pages,
    images: metrics.images,
    chunks: metrics.chunks,
    products: metrics.products,
    errors
  };
}

async function monitor() {
  console.log(`🔍 Starting monitor for job: ${JOB_ID}\n`);
  
  let isRunning = true;
  let checkCount = 0;
  
  while (isRunning) {
    checkCount++;
    
    const metrics = await getJobMetrics(JOB_ID);
    if (!metrics) {
      console.error('❌ Failed to fetch metrics');
      await new Promise(resolve => setTimeout(resolve, 5000));
      continue;
    }
    
    const errors = await getServerErrors();
    
    printMetrics(metrics, errors);
    
    // Stop if completed or failed
    if (metrics.status === 'completed' || metrics.status === 'failed') {
      console.log(`\n\n🏁 Processing ${metrics.status.toUpperCase()}`);
      
      if (metrics.status === 'completed') {
        console.log('\n✅ FINAL RESULTS:');
        console.log(`  Total Pages:    ${metrics.pages}`);
        console.log(`  Total Images:   ${metrics.images}`);
        console.log(`  Total Chunks:   ${metrics.chunks}`);
        console.log(`  Total Products: ${metrics.products}`);
        console.log(`  CLIP Coverage:  ${((metrics.imagesWithClip / metrics.images) * 100).toFixed(1)}%`);
        console.log(`  Embedding Coverage: ${((metrics.chunksWithEmbeddings / metrics.chunks) * 100).toFixed(1)}%`);
      }
      
      if (errors.length > 0) {
        console.log('\n⚠️ ERRORS ENCOUNTERED:');
        const errorTypes = {};
        errors.forEach(error => {
          const type = error.match(/ERROR - (.+?):/)?.[1] || 'Unknown';
          errorTypes[type] = (errorTypes[type] || 0) + 1;
        });
        Object.entries(errorTypes).forEach(([type, count]) => {
          console.log(`  ${type}: ${count} occurrences`);
        });
      }
      
      isRunning = false;
      break;
    }
    
    // Wait 5 seconds before next check
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\n👋 Monitoring stopped by user');
  process.exit(0);
});

// Start monitoring
monitor().catch(error => {
  console.error('❌ Monitor error:', error);
  process.exit(1);
});

