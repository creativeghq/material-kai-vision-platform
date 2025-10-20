#!/usr/bin/env node

/**
 * TEST FRONTEND PDF WORKFLOW
 *
 * This test mimics EXACTLY what the frontend does when processing a PDF:
 * 1. Calls Supabase edge function (mivaa-gateway) with FormData
 * 2. Edge function forwards to MIVAA RAG upload endpoint
 * 3. Tests the complete flow through the edge function
 */

import fetch from 'node-fetch';
import FormData from 'form-data';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';
const TEST_PDF_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/harmony-signature-book-24-25.pdf';

function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = {
    'info': '📋',
    'success': '✅',
    'error': '❌',
    'warning': '⚠️',
    'step': '🔄',
  }[type] || '📋';
  console.log(`${prefix} [${timestamp}] ${message}`);
}

async function testFrontendWorkflow() {
  console.log(`
========================================================================================================================
🔍 FRONTEND PDF WORKFLOW TEST - EXACT SIMULATION
========================================================================================================================
`);

  try {
    // Step 1: Download PDF (like frontend does)
    log('STEP 1: Downloading test PDF', 'step');
    const pdfResponse = await fetch(TEST_PDF_URL);
    if (!pdfResponse.ok) {
      throw new Error(`Failed to download PDF: ${pdfResponse.statusText}`);
    }
    const pdfBuffer = await pdfResponse.buffer();
    log(`✅ PDF downloaded: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB`, 'success');

    // Step 2: Prepare FormData (exactly like consolidatedPDFWorkflowService.ts line 478-483)
    log('STEP 2: Preparing FormData (like frontend)', 'step');
    const formData = new FormData();
    formData.append('file', pdfBuffer, {
      filename: 'harmony-signature-book-24-25.pdf',
      contentType: 'application/pdf',
    });
    formData.append('title', 'harmony-signature-book-24-25.pdf');
    formData.append('enable_embedding', 'true');
    formData.append('chunk_size', '1000');
    formData.append('chunk_overlap', '200');
    log('✅ FormData prepared', 'success');

    // Step 3: Call Supabase edge function (exactly like consolidatedPDFWorkflowService.ts line 2252)
    log('STEP 3: Calling Supabase edge function (mivaa-gateway)', 'step');
    const url = `${SUPABASE_URL}/functions/v1/mivaa-gateway`;
    log(`   URL: ${url}`, 'info');
    log(`   Using Supabase anon key for authentication`, 'info');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: formData,
    });

    log(`   Response status: ${response.status} ${response.statusText}`, response.ok ? 'success' : 'error');

    const responseText = await response.text();
    
    if (!response.ok) {
      log(`❌ MIVAA RAG upload failed!`, 'error');
      log(`   Status: ${response.status}`, 'error');
      log(`   Response: ${responseText.substring(0, 500)}`, 'error');
      throw new Error(`MIVAA RAG upload failed: HTTP ${response.status}`);
    }

    // Step 4: Parse response
    log('STEP 4: Parsing response', 'step');
    let data;
    try {
      data = JSON.parse(responseText);
      log('✅ Response is valid JSON', 'success');
    } catch (parseError) {
      log(`❌ Response is not JSON: ${responseText.substring(0, 200)}`, 'error');
      throw new Error('Invalid JSON response');
    }

    // Step 5: Validate response structure
    log('STEP 5: Validating response structure', 'step');
    log(`   Document ID: ${data.document_id || 'N/A'}`, 'info');
    log(`   Title: ${data.title || 'N/A'}`, 'info');
    log(`   Status: ${data.status || 'N/A'}`, data.status === 'completed' ? 'success' : 'warning');
    log(`   Chunks created: ${data.chunks_created || 0}`, 'info');
    log(`   Embeddings generated: ${data.embeddings_generated || false}`, 'info');
    log(`   Processing time: ${data.processing_time || 'N/A'}s`, 'info');
    log(`   Message: ${data.message || 'N/A'}`, 'info');

    // Step 6: Check for issues
    log('STEP 6: Checking for issues', 'step');
    const issues = [];
    
    if (data.status === 'error') {
      issues.push('Status is "error" (should be "completed")');
    }
    
    if (!data.chunks_created || data.chunks_created === 0) {
      issues.push('No chunks were created');
    }
    
    if (!data.embeddings_generated) {
      issues.push('Embeddings were not generated');
    }

    if (issues.length > 0) {
      log('⚠️  Issues found:', 'warning');
      issues.forEach(issue => log(`   - ${issue}`, 'warning'));
    } else {
      log('✅ No issues found - processing successful!', 'success');
    }

    // Summary
    console.log(`
========================================================================================================================
📊 TEST SUMMARY
========================================================================================================================
PDF Download: ✅ PASS
FormData Preparation: ✅ PASS
MIVAA RAG Upload: ${response.ok ? '✅ PASS' : '❌ FAIL'}
Response Parsing: ✅ PASS
Issues Found: ${issues.length > 0 ? `⚠️  ${issues.length} issue(s)` : '✅ None'}

Overall: ${response.ok && issues.length === 0 ? '✅ FRONTEND WORKFLOW WORKS!' : '⚠️  WORKFLOW HAS ISSUES'}
========================================================================================================================

Full Response:
${JSON.stringify(data, null, 2)}
========================================================================================================================
`);

    return { success: response.ok, issues, data };

  } catch (error) {
    log(`❌ Fatal error: ${error.message}`, 'error');
    console.error(error);
    
    console.log(`
========================================================================================================================
📊 TEST SUMMARY
========================================================================================================================
Overall: ❌ FAIL
Error: ${error.message}
========================================================================================================================
`);
    
    return { success: false, error: error.message };
  }
}

// Run the test
testFrontendWorkflow().then(result => {
  process.exit(result.success ? 0 : 1);
});

