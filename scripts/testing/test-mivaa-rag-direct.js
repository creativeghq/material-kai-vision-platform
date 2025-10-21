#!/usr/bin/env node

import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';

const MIVAA_SERVICE_URL = 'https://v1api.materialshub.gr';
const MIVAA_API_KEY = process.env.MIVAA_API_KEY || 'your-mivaa-api-key';

function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = level === 'error' ? '❌' : level === 'success' ? '✅' : level === 'step' ? '🔄' : '📋';
  console.log(`${prefix} [${timestamp}] ${message}`);
}

async function testMivaaRagDirect() {
  console.log('\n' + '='.repeat(120));
  console.log('🔍 MIVAA RAG UPLOAD DIRECT TEST');
  console.log('='.repeat(120) + '\n');

  try {
    // Step 1: Download test PDF
    log('STEP 1: Downloading test PDF', 'step');
    const pdfUrl = 'https://www.harmonyceramictiles.com/wp-content/uploads/2024/08/harmony-signature-book-24-25.pdf';
    const pdfResponse = await fetch(pdfUrl);
    const pdfBuffer = await pdfResponse.buffer();
    log(`✅ PDF downloaded: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB`, 'success');

    // Step 2: Prepare FormData
    log('STEP 2: Preparing FormData for MIVAA RAG upload', 'step');
    const formData = new FormData();
    formData.append('file', pdfBuffer, {
      filename: 'harmony-signature-book-24-25.pdf',
      contentType: 'application/pdf',
    });
    formData.append('title', 'harmony-signature-book-24-25.pdf');
    formData.append('enable_embedding', 'true');
    formData.append('chunk_size', '512');
    formData.append('chunk_overlap', '50');
    log('✅ FormData prepared', 'success');

    // Step 3: Call MIVAA RAG upload endpoint directly
    log('STEP 3: Calling MIVAA RAG upload endpoint DIRECTLY', 'step');
    const url = `${MIVAA_SERVICE_URL}/api/rag/documents/upload`;
    log(`   URL: ${url}`);
    log(`   API Key: ${MIVAA_API_KEY.substring(0, 10)}...`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MIVAA_API_KEY}`,
      },
      body: formData,
    });

    log(`   Response status: ${response.status} ${response.statusText}`, response.ok ? 'success' : 'error');

    // Step 4: Parse response
    log('STEP 4: Parsing response', 'step');
    const text = await response.text();
    
    let data;
    try {
      data = JSON.parse(text);
      log('✅ Response is valid JSON', 'success');
    } catch (e) {
      log(`❌ Response is not valid JSON: ${text.substring(0, 200)}`, 'error');
      throw new Error('Invalid JSON response');
    }

    // Step 5: Display results
    log('STEP 5: Analyzing response', 'step');
    console.log('\n📊 RESPONSE DATA:');
    console.log(JSON.stringify(data, null, 2));

    // Step 6: Check for issues
    log('\nSTEP 6: Checking for issues', 'step');
    const issues = [];
    
    if (data.status === 'error') {
      issues.push('Status is "error"');
    }
    
    if (data.chunks_created === 0) {
      issues.push('No chunks were created');
    }
    
    if (!data.embeddings_generated) {
      issues.push('Embeddings were not generated');
    }
    
    if (data.processing_time < 0.1) {
      issues.push(`Processing time suspiciously low: ${data.processing_time}s`);
    }

    if (issues.length > 0) {
      log(`⚠️  Issues found:`, 'error');
      issues.forEach(issue => log(`   - ${issue}`, 'error'));
    } else {
      log('✅ No issues found!', 'success');
    }

    // Summary
    console.log('\n' + '='.repeat(120));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(120));
    console.log(`PDF Download: ✅ PASS`);
    console.log(`FormData Preparation: ✅ PASS`);
    console.log(`MIVAA RAG Upload: ${response.ok ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Response Parsing: ✅ PASS`);
    console.log(`Issues Found: ${issues.length > 0 ? `⚠️  ${issues.length} issue(s)` : '✅ NONE'}`);
    console.log('\n' + '='.repeat(120) + '\n');

    return issues.length === 0;

  } catch (error) {
    log(`❌ Fatal error: ${error.message}`, 'error');
    console.error(error);
    
    console.log('\n' + '='.repeat(120));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(120));
    console.log(`Overall: ❌ FAIL`);
    console.log(`Error: ${error.message}`);
    console.log('='.repeat(120) + '\n');
    
    return false;
  }
}

testMivaaRagDirect();

