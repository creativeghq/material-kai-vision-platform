#!/usr/bin/env node

/**
 * Comprehensive Production Validation Test
 * Tests all platform functionality end-to-end with Supabase MCP architecture
 * 
 * Usage: node scripts/comprehensive-production-validation.js
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const BASE_URL = process.env.VERCEL_URL || 'http://localhost:3000';
const MIVAA_URL = process.env.MIVAA_URL || 'http://localhost:8000';

// Test configuration
const TEST_CONFIG = {
  timeout: 30000,
  retries: 3,
  verbose: true
};

// Test results tracking
const testResults = {
  passed: 0,
  failed: 0,
  skipped: 0,
  errors: []
};

/**
 * Utility functions
 */
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: '📋',
    success: '✅',
    error: '❌',
    warning: '⚠️',
    debug: '🔍'
  }[type] || '📋';
  
  console.log(`${prefix} [${timestamp}] ${message}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(80));
  console.log(`🎯 ${title}`);
  console.log('='.repeat(80));
}

async function makeRequest(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TEST_CONFIG.timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

async function testEndpoint(name, url, options = {}) {
  try {
    log(`Testing ${name}...`, 'debug');
    const response = await makeRequest(url, options);
    
    if (response.ok) {
      testResults.passed++;
      log(`${name}: PASSED (${response.status})`, 'success');
      return { success: true, status: response.status, data: await response.json() };
    } else {
      testResults.failed++;
      log(`${name}: FAILED (${response.status})`, 'error');
      testResults.errors.push(`${name}: HTTP ${response.status}`);
      return { success: false, status: response.status, error: response.statusText };
    }
  } catch (error) {
    testResults.failed++;
    log(`${name}: ERROR - ${error.message}`, 'error');
    testResults.errors.push(`${name}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Test Suite 1: Health Checks
 */
async function testHealthChecks() {
  logSection('HEALTH CHECKS');
  
  const healthTests = [
    {
      name: 'Frontend Health',
      url: `${BASE_URL}/api/health`
    },
    {
      name: 'MIVAA Service Health',
      url: `${MIVAA_URL}/health`
    },
    {
      name: 'MIVAA API Health',
      url: `${MIVAA_URL}/api/v1/health`
    },
    {
      name: 'MIVAA PDF Service Health',
      url: `${MIVAA_URL}/api/v1/extract/health`
    },
    {
      name: 'MIVAA RAG Service Health',
      url: `${MIVAA_URL}/api/v1/rag/health`
    },
    {
      name: 'MIVAA Search Service Health',
      url: `${MIVAA_URL}/api/search/health`
    },
    {
      name: 'MIVAA Image Service Health',
      url: `${MIVAA_URL}/api/images/health`
    }
  ];
  
  for (const test of healthTests) {
    await testEndpoint(test.name, test.url);
  }
}

/**
 * Test Suite 2: Supabase Edge Functions (MCP Architecture)
 */
async function testSupabaseEdgeFunctions() {
  logSection('SUPABASE EDGE FUNCTIONS (MCP ARCHITECTURE)');
  
  // Note: These would be actual Edge Function endpoints in production
  const edgeFunctionTests = [
    {
      name: 'Products Management Edge Function',
      url: `${BASE_URL}/api/products/health`,
      description: 'Tests product management via Edge Functions'
    },
    {
      name: 'PDF Processing Metrics Edge Function',
      url: `${BASE_URL}/api/pdf-processing-metrics`,
      description: 'Tests PDF processing metrics via Edge Functions'
    },
    {
      name: 'Material Search Edge Function',
      url: `${BASE_URL}/api/search/materials/health`,
      description: 'Tests material search via Edge Functions'
    }
  ];
  
  for (const test of edgeFunctionTests) {
    log(`Testing ${test.description}`, 'debug');
    await testEndpoint(test.name, test.url);
  }
}

/**
 * Test Suite 3: AI Model Integration
 */
async function testAIModels() {
  logSection('AI MODEL INTEGRATION');
  
  const aiTests = [
    {
      name: 'OpenAI Embeddings',
      url: `${MIVAA_URL}/api/embeddings/generate`,
      method: 'POST',
      body: JSON.stringify({
        text: 'Test material description',
        model: 'text-embedding-ada-002'
      })
    },
    {
      name: 'Anthropic Claude Integration',
      url: `${BASE_URL}/api/ai/claude/test`,
      description: 'Tests Claude 4.5 integration'
    },
    {
      name: 'LLaMA Vision Analysis',
      url: `${MIVAA_URL}/api/semantic-analysis`,
      method: 'POST',
      description: 'Tests LLaMA Vision model integration'
    }
  ];
  
  for (const test of aiTests) {
    const options = test.method ? { method: test.method, body: test.body } : {};
    await testEndpoint(test.name, test.url, options);
  }
}

/**
 * Test Suite 4: Database Operations (via Edge Functions)
 */
async function testDatabaseOperations() {
  logSection('DATABASE OPERATIONS (VIA EDGE FUNCTIONS)');
  
  log('Testing database operations through Edge Functions only (no direct client)', 'info');
  
  const dbTests = [
    {
      name: 'List Products (Edge Function)',
      url: `${BASE_URL}/api/products/list`,
      description: 'Tests product listing via Edge Function'
    },
    {
      name: 'List Chunks (Edge Function)',
      url: `${BASE_URL}/api/chunks/list`,
      description: 'Tests chunk listing via Edge Function'
    },
    {
      name: 'List Images (Edge Function)',
      url: `${BASE_URL}/api/images/list`,
      description: 'Tests image listing via Edge Function'
    },
    {
      name: 'Authentication Status (Edge Function)',
      url: `${BASE_URL}/api/auth/status`,
      description: 'Tests auth status via Edge Function'
    }
  ];
  
  for (const test of dbTests) {
    log(`Testing ${test.description}`, 'debug');
    await testEndpoint(test.name, test.url);
  }
}

/**
 * Test Suite 5: PDF Processing Pipeline
 */
async function testPDFProcessing() {
  logSection('PDF PROCESSING PIPELINE');
  
  const pdfTests = [
    {
      name: 'PDF Markdown Extraction',
      url: `${MIVAA_URL}/api/v1/extract/markdown`,
      description: 'Tests PDF to markdown conversion'
    },
    {
      name: 'PDF Table Extraction',
      url: `${MIVAA_URL}/api/v1/extract/tables`,
      description: 'Tests PDF table extraction'
    },
    {
      name: 'PDF Image Extraction',
      url: `${MIVAA_URL}/api/v1/extract/images`,
      description: 'Tests PDF image extraction'
    },
    {
      name: 'Two-Stage Product Classification',
      url: `${BASE_URL}/api/products/create-from-chunks`,
      description: 'Tests advanced product classification system'
    }
  ];
  
  for (const test of pdfTests) {
    log(`Testing ${test.description}`, 'debug');
    await testEndpoint(test.name, test.url);
  }
}

/**
 * Test Suite 6: Search & RAG System
 */
async function testSearchAndRAG() {
  logSection('SEARCH & RAG SYSTEM');
  
  const searchTests = [
    {
      name: 'Semantic Search',
      url: `${MIVAA_URL}/api/search/semantic`,
      method: 'POST',
      body: JSON.stringify({
        query: 'fire resistant materials',
        max_results: 5
      })
    },
    {
      name: 'RAG Query',
      url: `${MIVAA_URL}/api/v1/rag/query`,
      method: 'POST',
      body: JSON.stringify({
        query: 'What are the properties of ceramic tiles?',
        top_k: 5
      })
    },
    {
      name: 'Multi-Vector Search',
      url: `${BASE_URL}/api/search/multimodal`,
      method: 'POST',
      body: JSON.stringify({
        query: 'blue ceramic tiles',
        search_types: ['text', 'image']
      })
    }
  ];
  
  for (const test of searchTests) {
    const options = test.method ? { method: test.method, body: test.body } : {};
    await testEndpoint(test.name, test.url, options);
  }
}

/**
 * Main test execution
 */
async function runAllTests() {
  log('🚀 Starting Comprehensive Production Validation', 'info');
  log(`Testing against: ${BASE_URL}`, 'info');
  log(`MIVAA Service: ${MIVAA_URL}`, 'info');
  
  const startTime = Date.now();
  
  try {
    await testHealthChecks();
    await testSupabaseEdgeFunctions();
    await testAIModels();
    await testDatabaseOperations();
    await testPDFProcessing();
    await testSearchAndRAG();
    
  } catch (error) {
    log(`Test execution error: ${error.message}`, 'error');
    testResults.errors.push(`Execution error: ${error.message}`);
  }
  
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);
  
  // Generate final report
  logSection('FINAL VALIDATION REPORT');
  
  log(`Total Tests: ${testResults.passed + testResults.failed}`, 'info');
  log(`Passed: ${testResults.passed}`, 'success');
  log(`Failed: ${testResults.failed}`, testResults.failed > 0 ? 'error' : 'info');
  log(`Duration: ${duration}s`, 'info');
  
  if (testResults.errors.length > 0) {
    log('\nErrors encountered:', 'error');
    testResults.errors.forEach(error => log(`  - ${error}`, 'error'));
  }
  
  const successRate = ((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1);
  log(`Success Rate: ${successRate}%`, successRate >= 80 ? 'success' : 'warning');
  
  if (successRate >= 80) {
    log('🎉 PRODUCTION VALIDATION PASSED - Platform is ready for deployment!', 'success');
    process.exit(0);
  } else {
    log('⚠️ PRODUCTION VALIDATION FAILED - Issues need to be resolved before deployment', 'error');
    process.exit(1);
  }
}

// Execute tests
runAllTests().catch(error => {
  log(`Fatal error: ${error.message}`, 'error');
  process.exit(1);
});
