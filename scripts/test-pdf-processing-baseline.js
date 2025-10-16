#!/usr/bin/env node

/**
 * Test PDF Processing with Baseline Metrics
 * 
 * This script:
 * 1. Downloads the WIFI MOMO PDF
 * 2. Triggers processing with new chunking config
 * 3. Polls for completion
 * 4. Measures and reports baseline metrics
 * 5. Stores results for comparison
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration
const MIVAA_API_URL = process.env.MIVAA_API_URL || 'http://localhost:8000';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const PDF_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/49f683ad-ebf2-4296-a410-0d8c011ce0be/1760462185826-harmony-signature-book-24-25.pdf';

const POLLING_INTERVAL = 5000; // 5 seconds
const MAX_POLLING_TIME = 600000; // 10 minutes
const RESULTS_FILE = path.join(__dirname, 'baseline-metrics.json');

// Helper functions
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: '📋',
    success: '✅',
    error: '❌',
    warning: '⚠️',
    metric: '📊',
  }[type] || '📋';
  console.log(`${prefix} [${timestamp}] ${message}`);
}

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function uploadPDF(pdfBuffer, filename) {
  log(`Uploading PDF: ${filename}`, 'info');
  
  const formData = new FormData();
  formData.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), filename);
  
  const response = await fetch(`${MIVAA_API_URL}/api/pdf/process`, {
    method: 'POST',
    body: formData,
  });
  
  if (!response.ok) {
    throw new Error(`Upload failed: ${response.statusText}`);
  }
  
  const data = await response.json();
  log(`PDF uploaded successfully. Job ID: ${data.job_id}`, 'success');
  return data.job_id;
}

async function pollJobStatus(jobId) {
  log(`Polling job status: ${jobId}`, 'info');
  
  const startTime = Date.now();
  let lastProgress = 0;
  
  while (Date.now() - startTime < MAX_POLLING_TIME) {
    const response = await fetch(`${MIVAA_API_URL}/api/jobs/${jobId}`);
    
    if (!response.ok) {
      throw new Error(`Failed to get job status: ${response.statusText}`);
    }
    
    const job = await response.json();
    
    // Log progress updates
    if (job.progress && job.progress.percentage !== lastProgress) {
      lastProgress = job.progress.percentage;
      log(`Progress: ${job.progress.percentage}% - ${job.progress.current_step}`, 'metric');
    }
    
    if (job.status === 'completed') {
      log(`Job completed successfully!`, 'success');
      return job;
    }
    
    if (job.status === 'failed') {
      throw new Error(`Job failed: ${job.error}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
  }
  
  throw new Error('Job polling timeout');
}

async function fetchChunksAndImages(documentId) {
  log(`Fetching chunks and images for document: ${documentId}`, 'info');
  
  const headers = {
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };
  
  // Fetch chunks
  const chunksResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/document_chunks?document_id=eq.${documentId}&select=*`,
    { headers }
  );
  
  if (!chunksResponse.ok) {
    throw new Error(`Failed to fetch chunks: ${chunksResponse.statusText}`);
  }
  
  const chunks = await chunksResponse.json();
  
  // Fetch images
  const imagesResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/document_images?document_id=eq.${documentId}&select=*`,
    { headers }
  );
  
  if (!imagesResponse.ok) {
    throw new Error(`Failed to fetch images: ${imagesResponse.statusText}`);
  }
  
  const images = await imagesResponse.json();
  
  return { chunks, images };
}

function calculateMetrics(chunks, images) {
  log(`Calculating baseline metrics...`, 'info');
  
  const metrics = {
    timestamp: new Date().toISOString(),
    chunk_metrics: {
      total_chunks: chunks.length,
      average_size: chunks.length > 0 
        ? Math.round(chunks.reduce((sum, c) => sum + c.content.length, 0) / chunks.length)
        : 0,
      min_size: chunks.length > 0 
        ? Math.min(...chunks.map(c => c.content.length))
        : 0,
      max_size: chunks.length > 0 
        ? Math.max(...chunks.map(c => c.content.length))
        : 0,
      size_distribution: {
        small: chunks.filter(c => c.content.length < 500).length,
        medium: chunks.filter(c => c.content.length >= 500 && c.content.length < 1500).length,
        large: chunks.filter(c => c.content.length >= 1500 && c.content.length < 3000).length,
        extra_large: chunks.filter(c => c.content.length >= 3000).length,
      }
    },
    image_metrics: {
      total_images: images.length,
      images_with_captions: images.filter(i => i.caption && i.caption.length > 0).length,
      average_confidence: images.length > 0
        ? (images.reduce((sum, i) => sum + (i.confidence || 0), 0) / images.length).toFixed(3)
        : 0,
      confidence_distribution: {
        low: images.filter(i => (i.confidence || 0) < 0.7).length,
        medium: images.filter(i => (i.confidence || 0) >= 0.7 && (i.confidence || 0) < 0.85).length,
        high: images.filter(i => (i.confidence || 0) >= 0.85).length,
      }
    },
    quality_assessment: {
      chunks_per_page: (chunks.length / 40).toFixed(2), // Assuming 40-page document
      image_to_chunk_ratio: (images.length / chunks.length).toFixed(3),
      average_chunk_quality: 'pending', // Will be calculated after semantic analysis
    }
  };
  
  return metrics;
}

function saveResults(metrics, jobData) {
  const results = {
    test_date: new Date().toISOString(),
    configuration: {
      chunkSize: 1500,
      overlap: 100,
      minChunkSize: 500,
      maxChunkSize: 3000,
      preserveStructure: true,
      respectHierarchy: true,
    },
    job_data: jobData,
    metrics: metrics,
  };
  
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
  log(`Results saved to: ${RESULTS_FILE}`, 'success');
  
  return results;
}

function printMetricsSummary(metrics) {
  console.log('\n' + '='.repeat(60));
  console.log('📊 BASELINE METRICS SUMMARY');
  console.log('='.repeat(60));
  
  console.log('\n📄 CHUNK METRICS:');
  console.log(`  Total Chunks: ${metrics.chunk_metrics.total_chunks}`);
  console.log(`  Average Size: ${metrics.chunk_metrics.average_size} chars`);
  console.log(`  Size Range: ${metrics.chunk_metrics.min_size} - ${metrics.chunk_metrics.max_size} chars`);
  console.log(`  Distribution:`);
  console.log(`    - Small (<500): ${metrics.chunk_metrics.size_distribution.small}`);
  console.log(`    - Medium (500-1500): ${metrics.chunk_metrics.size_distribution.medium}`);
  console.log(`    - Large (1500-3000): ${metrics.chunk_metrics.size_distribution.large}`);
  console.log(`    - Extra Large (>3000): ${metrics.chunk_metrics.size_distribution.extra_large}`);
  
  console.log('\n🖼️  IMAGE METRICS:');
  console.log(`  Total Images: ${metrics.image_metrics.total_images}`);
  console.log(`  Images with Captions: ${metrics.image_metrics.images_with_captions}`);
  console.log(`  Average Confidence: ${metrics.image_metrics.average_confidence}`);
  console.log(`  Confidence Distribution:`);
  console.log(`    - Low (<0.7): ${metrics.image_metrics.confidence_distribution.low}`);
  console.log(`    - Medium (0.7-0.85): ${metrics.image_metrics.confidence_distribution.medium}`);
  console.log(`    - High (>0.85): ${metrics.image_metrics.confidence_distribution.high}`);
  
  console.log('\n✨ QUALITY ASSESSMENT:');
  console.log(`  Chunks per Page: ${metrics.quality_assessment.chunks_per_page}`);
  console.log(`  Image to Chunk Ratio: ${metrics.quality_assessment.image_to_chunk_ratio}`);
  
  console.log('\n' + '='.repeat(60) + '\n');
}

// Main execution
async function main() {
  try {
    log('Starting PDF processing baseline test...', 'info');
    
    // Step 1: Download PDF
    log('Downloading WIFI MOMO PDF...', 'info');
    const pdfBuffer = await downloadFile(PDF_URL);
    log(`PDF downloaded: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB`, 'success');
    
    // Step 2: Upload and process
    const jobId = await uploadPDF(pdfBuffer, 'wifi-momo-lookbook.pdf');
    
    // Step 3: Poll for completion
    const completedJob = await pollJobStatus(jobId);
    
    // Step 4: Fetch results
    const { chunks, images } = await fetchChunksAndImages(completedJob.document_id);
    
    // Step 5: Calculate metrics
    const metrics = calculateMetrics(chunks, images);
    
    // Step 6: Save results
    const results = saveResults(metrics, completedJob);
    
    // Step 7: Print summary
    printMetricsSummary(metrics);
    
    log('Baseline test completed successfully!', 'success');
    
  } catch (error) {
    log(`Error: ${error.message}`, 'error');
    process.exit(1);
  }
}

main();

