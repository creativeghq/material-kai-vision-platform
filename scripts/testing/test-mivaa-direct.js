#!/usr/bin/env node

/**
 * TEST MIVAA SERVICE DIRECTLY
 * 
 * Tests direct connection to MIVAA service without going through Supabase gateway
 * This helps identify if the issue is with the gateway or the MIVAA service itself
 */

import fetch from 'node-fetch';

const MIVAA_SERVICE_URL = 'https://v1api.materialshub.gr';
const TEST_PDF_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/harmony-signature-book-24-25.pdf';

// Try different possible API keys
const POSSIBLE_KEYS = [
  process.env.MIVAA_API_KEY || '',
  'your-mivaa-api-key',
  '', // Try without key
];

function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = {
    'info': '📋',
    'success': '✅',
    'error': '❌',
    'warning': '⚠️',
    'step': '🔄',
    'metric': '📊',
  }[type] || '📋';
  console.log(`${prefix} [${timestamp}] ${message}`);
}

async function testHealthCheck() {
  log('Testing MIVAA Health Check', 'step');
  
  try {
    const response = await fetch(`${MIVAA_SERVICE_URL}/api/health`);
    const data = await response.json();
    
    if (response.ok) {
      log(`✅ MIVAA Health Check: ${JSON.stringify(data)}`, 'success');
      return true;
    } else {
      log(`❌ MIVAA Health Check failed: ${response.status}`, 'error');
      return false;
    }
  } catch (error) {
    log(`❌ MIVAA Health Check error: ${error.message}`, 'error');
    return false;
  }
}

async function testBulkProcess(apiKey) {
  log(`Testing MIVAA Bulk Process (with key: ${apiKey ? apiKey.substring(0, 5) + '...' : 'none'})`, 'step');
  
  try {
    const payload = {
      urls: [TEST_PDF_URL],
      batch_size: 1,
      options: {
        extract_images: true,
        extract_text: true,
        extract_tables: true,
        timeout_seconds: 900
      }
    };

    const headers = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${MIVAA_SERVICE_URL}/api/bulk/process`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    
    if (response.ok) {
      log(`✅ MIVAA Bulk Process: ${JSON.stringify(data).substring(0, 100)}...`, 'success');
      return { success: true, data };
    } else {
      log(`❌ MIVAA Bulk Process failed: ${response.status} - ${JSON.stringify(data).substring(0, 100)}`, 'error');
      return { success: false, status: response.status, data };
    }
  } catch (error) {
    log(`❌ MIVAA Bulk Process error: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
}

async function testDocs() {
  log('Testing MIVAA OpenAPI Docs', 'step');
  
  try {
    const response = await fetch(`${MIVAA_SERVICE_URL}/openapi.json`);
    
    if (response.ok) {
      const data = await response.json();
      log(`✅ MIVAA OpenAPI available - ${data.info?.title || 'Unknown'}`, 'success');
      return true;
    } else {
      log(`❌ MIVAA OpenAPI failed: ${response.status}`, 'error');
      return false;
    }
  } catch (error) {
    log(`❌ MIVAA OpenAPI error: ${error.message}`, 'error');
    return false;
  }
}

async function main() {
  console.log(`
========================================================================================================================
🔍 MIVAA SERVICE DIRECT TEST
========================================================================================================================
`);

  try {
    // Test 1: Health check
    const healthOk = await testHealthCheck();
    console.log('');

    // Test 2: OpenAPI docs
    const docsOk = await testDocs();
    console.log('');

    // Test 3: Bulk process with different keys
    log('Testing Bulk Process with different API keys', 'step');
    let processSuccess = false;
    
    for (const key of POSSIBLE_KEYS) {
      const result = await testBulkProcess(key);
      if (result.success) {
        processSuccess = true;
        break;
      }
      console.log('');
    }

    // Summary
    console.log(`
========================================================================================================================
📊 TEST SUMMARY
========================================================================================================================
Health Check: ${healthOk ? '✅ PASS' : '❌ FAIL'}
OpenAPI Docs: ${docsOk ? '✅ PASS' : '❌ FAIL'}
Bulk Process: ${processSuccess ? '✅ PASS' : '❌ FAIL'}

Overall: ${healthOk && docsOk ? '✅ MIVAA SERVICE IS RESPONDING' : '❌ MIVAA SERVICE HAS ISSUES'}
========================================================================================================================
`);

    process.exit(healthOk && docsOk ? 0 : 1);
  } catch (error) {
    log(`Fatal error: ${error.message}`, 'error');
    process.exit(1);
  }
}

main();

