#!/usr/bin/env node

/**
 * TEST MIVAA RAG UPLOAD ENDPOINT
 * 
 * Tests the /api/v1/rag/documents/upload endpoint that the frontend actually uses
 */

import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MIVAA_SERVICE_URL = 'https://v1api.materialshub.gr';
const MIVAA_API_KEY = process.env.MIVAA_API_KEY || '';
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

async function testRagUpload() {
  log('Testing MIVAA RAG Upload Endpoint', 'step');
  
  try {
    // Download the PDF first
    log('Downloading test PDF...', 'info');
    const pdfResponse = await fetch(TEST_PDF_URL);
    if (!pdfResponse.ok) {
      throw new Error(`Failed to download PDF: ${pdfResponse.statusText}`);
    }
    const pdfBuffer = await pdfResponse.buffer();
    log(`✅ PDF downloaded: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB`, 'success');

    // Create FormData
    const formData = new FormData();
    formData.append('file', pdfBuffer, {
      filename: 'test-harmony-signature-book.pdf',
      contentType: 'application/pdf',
    });
    formData.append('title', 'Test Harmony Signature Book');
    formData.append('enable_embedding', 'true');
    formData.append('chunk_size', '1000');
    formData.append('chunk_overlap', '200');

    log('Uploading to MIVAA RAG endpoint...', 'info');
    log(`URL: ${MIVAA_SERVICE_URL}/api/rag/documents/upload`, 'info');
    log(`API Key present: ${!!MIVAA_API_KEY}`, 'info');
    if (MIVAA_API_KEY) {
      log(`API Key length: ${MIVAA_API_KEY.length} characters`, 'info');
    }

    const headers = {};
    if (MIVAA_API_KEY) {
      headers['Authorization'] = `Bearer ${MIVAA_API_KEY}`;
    }

    const response = await fetch(`${MIVAA_SERVICE_URL}/api/rag/documents/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });

    log(`Response status: ${response.status} ${response.statusText}`, response.ok ? 'success' : 'error');

    const responseText = await response.text();
    log(`Response text (first 500 chars): ${responseText.substring(0, 500)}`, 'info');

    if (response.ok) {
      try {
        const data = JSON.parse(responseText);
        log(`✅ RAG Upload successful!`, 'success');
        log(`Response data: ${JSON.stringify(data, null, 2)}`, 'info');
        return { success: true, data };
      } catch (parseError) {
        log(`⚠️ Response is not JSON: ${responseText}`, 'warning');
        return { success: true, data: responseText };
      }
    } else {
      log(`❌ RAG Upload failed: ${response.status} - ${responseText}`, 'error');
      return { success: false, status: response.status, error: responseText };
    }
  } catch (error) {
    log(`❌ RAG Upload error: ${error.message}`, 'error');
    console.error(error);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log(`
========================================================================================================================
🔍 MIVAA RAG UPLOAD ENDPOINT TEST
========================================================================================================================
`);

  const result = await testRagUpload();

  console.log(`
========================================================================================================================
📊 TEST SUMMARY
========================================================================================================================
RAG Upload: ${result.success ? '✅ PASS' : '❌ FAIL'}
${result.error ? `Error: ${result.error}` : ''}
========================================================================================================================
`);

  process.exit(result.success ? 0 : 1);
}

main();

