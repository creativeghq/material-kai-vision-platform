#!/usr/bin/env node

/**
 * HARMONY PDF SERVER-SIDE TEST
 * 
 * Runs on the server to test PDF processing with local MIVAA API
 * Usage: node harmony-server-test.js
 */

import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';

const MIVAA_API = 'http://127.0.0.1:8000';
const HARMONY_PDF_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/49f683ad-ebf2-4296-a410-0d8c011ce0be/harmony-signature-book-24-25.pdf';
const WORKSPACE_ID = 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e';

function log(section, message, type = 'info') {
  const timestamp = new Date().toISOString();
  const icons = {
    'info': '📋',
    'success': '✅',
    'error': '❌',
    'warn': '⚠️',
    'step': '🚀',
    'monitor': '📊'
  };
  const icon = icons[type] || '•';
  console.log(`[${timestamp}] ${icon} [${section}] ${message}`);
}

async function testHarmonyPDF() {
  try {
    log('TEST', 'Starting Harmony PDF server-side test', 'step');
    
    // Download PDF
    log('DOWNLOAD', 'Fetching Harmony PDF...', 'info');
    const pdfResponse = await fetch(HARMONY_PDF_URL);
    if (!pdfResponse.ok) throw new Error(`Failed to fetch PDF: ${pdfResponse.statusText}`);
    
    const pdfBuffer = await pdfResponse.buffer();
    const sizeMB = (pdfBuffer.length / 1024 / 1024).toFixed(2);
    log('DOWNLOAD', `Downloaded ${sizeMB} MB`, 'success');
    
    // Upload to MIVAA API
    log('UPLOAD', 'Uploading to MIVAA API...', 'info');
    const formData = new FormData();
    formData.append('file', pdfBuffer, {
      filename: 'harmony-signature-book-24-25.pdf',
      contentType: 'application/pdf'
    });
    formData.append('workspace_id', WORKSPACE_ID);
    formData.append('title', 'Harmony Signature Book 24-25 - Server Test');
    
    const uploadResponse = await fetch(`${MIVAA_API}/api/rag/documents/upload-async`, {
      method: 'POST',
      headers: formData.getHeaders(),
      body: formData
    });
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`);
    }
    
    const uploadResult = await uploadResponse.json();
    const jobId = uploadResult.job_id;
    const documentId = uploadResult.document_id;
    
    log('UPLOAD', `Job ID: ${jobId}`, 'success');
    log('UPLOAD', `Document ID: ${documentId}`, 'success');
    
    // Monitor progress
    log('MONITOR', 'Monitoring PDF processing...', 'step');
    let progress = 0;
    let lastProgress = 0;
    let stuckCount = 0;
    const maxStuckAttempts = 40; // 10 minutes at 15-second intervals
    
    while (progress < 100) {
      await new Promise(resolve => setTimeout(resolve, 15000)); // Wait 15 seconds
      
      const statusResponse = await fetch(`${MIVAA_API}/api/rag/documents/job/${jobId}`, {
        method: 'GET',
        headers: { 'Authorization': 'Bearer test' }
      });
      
      if (!statusResponse.ok) {
        throw new Error(`Failed to get job status: ${statusResponse.status}`);
      }
      
      const status = await statusResponse.json();
      progress = status.progress || 0;
      
      if (progress === lastProgress) {
        stuckCount++;
        if (stuckCount > maxStuckAttempts) {
          throw new Error(`Processing stuck at ${progress}% for too long`);
        }
      } else {
        stuckCount = 0;
      }
      
      lastProgress = progress;
      log('MONITOR', `Progress: ${progress}%`, 'monitor');
      
      if (status.status === 'failed') {
        throw new Error(`Job failed: ${status.error}`);
      }
    }
    
    log('MONITOR', 'Processing complete!', 'success');
    
    // Get final metrics
    log('METRICS', 'Fetching final metrics...', 'info');
    
    // Query database for counts
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTkwNjAzMSwiZXhwIjoyMDY3NDgyMDMxfQ.KCfP909Qttvs3jr4t1pTYMjACVz2-C-Ga4Xm_ZyecwM';
    
    const queries = [
      { name: 'Images', query: `SELECT COUNT(*) as count FROM document_images WHERE document_id = '${documentId}'` },
      { name: 'Chunks', query: `SELECT COUNT(*) as count FROM document_chunks WHERE document_id = '${documentId}'` },
      { name: 'Products', query: `SELECT COUNT(*) as count FROM products WHERE source_document_id = '${documentId}'` }
    ];
    
    for (const q of queries) {
      const response = await fetch('https://bgbavxtjlbvgplozizxu.supabase.co/rest/v1/rpc/query', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: q.query })
      }).catch(() => null);
      
      if (response && response.ok) {
        const result = await response.json();
        const count = result[0]?.count || 0;
        log('METRICS', `${q.name}: ${count}`, 'success');
      }
    }
    
    log('TEST', 'Test completed successfully!', 'success');
    
  } catch (error) {
    log('ERROR', error.message, 'error');
    process.exit(1);
  }
}

testHarmonyPDF();

