#!/usr/bin/env node

/**
 * OPTIMIZED WORKFLOW BASELINE TEST
 * 
 * This script establishes a baseline for PDF processing performance
 * and identifies specific failure points in the current workflow.
 * 
 * Tests:
 * 1. Edge function response time (should be < 5 seconds)
 * 2. Job status polling reliability
 * 3. Sub-job completion tracking
 * 4. Final result validation
 * 5. Error recovery mechanisms
 * 
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/testing/optimized-workflow-baseline-test.js
 */

import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  console.error('   Usage: SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/testing/optimized-workflow-baseline-test.js');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Test PDF (small file for quick testing)
const TEST_PDF_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/49f683ad-ebf2-4296-a410-0d8c011ce0be/harmony-signature-book-24-25.pdf';
const WORKSPACE_ID = 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e';

// Test results
const testResults = {
  timestamp: new Date().toISOString(),
  tests: [],
  metrics: {},
  issues: [],
  recommendations: []
};

function log(message, type = 'info') {
  const icons = {
    'info': '📋',
    'success': '✅',
    'error': '❌',
    'warning': '⚠️',
    'metric': '📊',
    'issue': '🔴'
  };
  
  const icon = icons[type] || '📋';
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`${icon} [${timestamp}] ${message}`);
}

function recordTest(name, passed, duration, details = {}) {
  testResults.tests.push({
    name,
    passed,
    duration,
    details,
    timestamp: new Date().toISOString()
  });
  
  const status = passed ? '✅ PASS' : '❌ FAIL';
  log(`${name}: ${status} (${duration}ms)`, passed ? 'success' : 'error');
}

function recordMetric(name, value, unit = '') {
  testResults.metrics[name] = { value, unit, timestamp: new Date().toISOString() };
  log(`${name}: ${value}${unit}`, 'metric');
}

function recordIssue(severity, description, recommendation) {
  testResults.issues.push({ severity, description, recommendation });
  log(`${severity.toUpperCase()}: ${description}`, 'issue');
  if (recommendation) {
    testResults.recommendations.push(recommendation);
  }
}

// ============================================================================
// TEST 1: Edge Function Response Time
// ============================================================================

async function testEdgeFunctionResponseTime() {
  log('\n' + '='.repeat(80));
  log('TEST 1: Edge Function Response Time');
  log('='.repeat(80));
  
  const startTime = Date.now();
  
  try {
    // Download PDF
    const pdfResponse = await fetch(TEST_PDF_URL);
    const pdfBuffer = await pdfResponse.buffer();
    
    // Create form data
    const FormData = (await import('form-data')).default;
    const formData = new FormData();
    formData.append('file', pdfBuffer, {
      filename: 'baseline-test.pdf',
      contentType: 'application/pdf'
    });
    formData.append('workspace_id', WORKSPACE_ID);
    formData.append('title', 'Baseline Test PDF');
    
    // Call edge function
    const uploadStart = Date.now();
    const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        ...formData.getHeaders()
      },
      body: formData
    });
    
    const uploadDuration = Date.now() - uploadStart;
    const result = await response.json();
    
    // Validate response
    const passed = response.status === 202 && result.data?.job_id;
    recordTest('Edge Function Response', passed, uploadDuration, {
      status: response.status,
      hasJobId: !!result.data?.job_id,
      responseTime: uploadDuration
    });
    
    recordMetric('Edge Function Response Time', uploadDuration, 'ms');
    
    // Check if response time is acceptable (< 5 seconds)
    if (uploadDuration > 5000) {
      recordIssue(
        'warning',
        `Edge function took ${uploadDuration}ms to respond (> 5000ms threshold)`,
        'Optimize edge function to return 202 immediately without waiting for MIVAA'
      );
    }
    
    if (!passed) {
      recordIssue(
        'critical',
        'Edge function did not return 202 with job_id',
        'Fix edge function to always return 202 Accepted with job_id'
      );
      return { success: false };
    }
    
    return {
      success: true,
      jobId: result.data.job_id,
      documentId: result.data.document_id
    };
    
  } catch (error) {
    recordTest('Edge Function Response', false, Date.now() - startTime, {
      error: error.message
    });
    recordIssue('critical', `Edge function error: ${error.message}`, 'Fix edge function error handling');
    return { success: false };
  }
}

// ============================================================================
// TEST 2: Job Status Polling Reliability
// ============================================================================

async function testJobStatusPolling(jobId) {
  log('\n' + '='.repeat(80));
  log('TEST 2: Job Status Polling Reliability');
  log('='.repeat(80));
  
  const startTime = Date.now();
  const maxAttempts = 120; // 10 minutes
  const pollInterval = 5000; // 5 seconds
  
  let pollCount = 0;
  let failedPolls = 0;
  let lastProgress = 0;
  let progressUpdates = [];
  let statusChanges = [];
  let lastStatus = 'pending';
  
  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      pollCount++;
      
      try {
        // Check database directly
        const { data: jobData, error: dbError } = await supabase
          .from('background_jobs')
          .select('*')
          .eq('id', jobId)
          .single();
        
        if (dbError) {
          failedPolls++;
          log(`Poll ${attempt}: Database error - ${dbError.message}`, 'warning');
          continue;
        }
        
        if (!jobData) {
          failedPolls++;
          log(`Poll ${attempt}: Job not found in database`, 'warning');
          continue;
        }
        
        // Track progress changes
        if (jobData.progress_percentage !== lastProgress) {
          progressUpdates.push({
            attempt,
            progress: jobData.progress_percentage,
            timestamp: new Date().toISOString()
          });
          lastProgress = jobData.progress_percentage;
        }
        
        // Track status changes
        if (jobData.status !== lastStatus) {
          statusChanges.push({
            attempt,
            from: lastStatus,
            to: jobData.status,
            timestamp: new Date().toISOString()
          });
          lastStatus = jobData.status;
        }
        
        log(`Poll ${attempt}/${maxAttempts}: ${jobData.status} (${jobData.progress_percentage}%)`, 'info');
        
        if (jobData.metadata?.current_stage) {
          log(`   Stage: ${jobData.metadata.current_stage}`, 'info');
        }
        
        if (jobData.status === 'completed') {
          const duration = Date.now() - startTime;
          recordTest('Job Status Polling', true, duration, {
            pollCount,
            failedPolls,
            progressUpdates: progressUpdates.length,
            statusChanges: statusChanges.length,
            finalProgress: jobData.progress_percentage
          });
          
          recordMetric('Total Processing Time', duration, 'ms');
          recordMetric('Poll Success Rate', ((pollCount - failedPolls) / pollCount * 100).toFixed(1), '%');
          recordMetric('Progress Updates', progressUpdates.length);
          
          return {
            success: true,
            documentId: jobData.document_id,
            duration,
            jobData
          };
        }
        
        if (jobData.status === 'failed') {
          recordTest('Job Status Polling', false, Date.now() - startTime, {
            error: jobData.error_message,
            pollCount,
            failedPolls
          });
          recordIssue('critical', `Job failed: ${jobData.error_message}`, 'Investigate job failure cause');
          return { success: false, error: jobData.error_message };
        }
        
      } catch (pollError) {
        failedPolls++;
        log(`Poll ${attempt}: Error - ${pollError.message}`, 'error');
      }
    }
    
    // Timeout
    recordTest('Job Status Polling', false, Date.now() - startTime, {
      error: 'Timeout after 10 minutes',
      pollCount,
      failedPolls,
      lastStatus,
      lastProgress
    });
    recordIssue('critical', 'Job did not complete within 10 minutes', 'Optimize processing pipeline or increase timeout');
    return { success: false, error: 'Timeout' };
    
  } catch (error) {
    recordTest('Job Status Polling', false, Date.now() - startTime, {
      error: error.message
    });
    recordIssue('critical', `Polling error: ${error.message}`, 'Fix polling mechanism');
    return { success: false, error: error.message };
  }
}

// ============================================================================
// TEST 3: Sub-Job Tracking
// ============================================================================

async function testSubJobTracking(jobId) {
  log('\n' + '='.repeat(80));
  log('TEST 3: Sub-Job Tracking');
  log('='.repeat(80));
  
  const startTime = Date.now();
  
  try {
    // Check for sub-jobs
    const { data: subJobs, error } = await supabase
      .from('background_jobs')
      .select('*')
      .eq('parent_job_id', jobId);
    
    if (error) {
      recordTest('Sub-Job Tracking', false, Date.now() - startTime, {
        error: error.message
      });
      return { success: false };
    }
    
    const hasSubJobs = subJobs && subJobs.length > 0;
    recordTest('Sub-Job Tracking', hasSubJobs, Date.now() - startTime, {
      subJobCount: subJobs?.length || 0,
      subJobs: subJobs?.map(j => ({ id: j.id, type: j.job_type, status: j.status }))
    });
    
    if (!hasSubJobs) {
      recordIssue('warning', 'No sub-jobs found for main job', 'Implement sub-job tracking for product creation and image analysis');
    } else {
      recordMetric('Sub-Jobs Created', subJobs.length);
      
      // Check sub-job statuses
      const completedSubJobs = subJobs.filter(j => j.status === 'completed').length;
      const failedSubJobs = subJobs.filter(j => j.status === 'failed').length;
      
      recordMetric('Sub-Jobs Completed', completedSubJobs);
      recordMetric('Sub-Jobs Failed', failedSubJobs);
    }
    
    return { success: true, subJobs };
    
  } catch (error) {
    recordTest('Sub-Job Tracking', false, Date.now() - startTime, {
      error: error.message
    });
    return { success: false };
  }
}

// ============================================================================
// TEST 4: Result Validation
// ============================================================================

async function testResultValidation(documentId) {
  log('\n' + '='.repeat(80));
  log('TEST 4: Result Validation');
  log('='.repeat(80));
  
  const startTime = Date.now();
  
  try {
    // Check chunks
    const { data: chunks } = await supabase
      .from('document_chunks')
      .select('id')
      .eq('document_id', documentId);
    
    // Check embeddings
    const { data: embeddings } = await supabase
      .from('embeddings')
      .select('id')
      .in('chunk_id', chunks?.map(c => c.id) || []);
    
    // Check images
    const { data: images } = await supabase
      .from('document_images')
      .select('id')
      .eq('document_id', documentId);
    
    // Check products
    const { data: products } = await supabase
      .from('products')
      .select('id')
      .eq('document_id', documentId);
    
    const chunkCount = chunks?.length || 0;
    const embeddingCount = embeddings?.length || 0;
    const imageCount = images?.length || 0;
    const productCount = products?.length || 0;
    
    const passed = chunkCount > 0 && embeddingCount > 0;
    
    recordTest('Result Validation', passed, Date.now() - startTime, {
      chunks: chunkCount,
      embeddings: embeddingCount,
      images: imageCount,
      products: productCount,
      embeddingCoverage: chunkCount > 0 ? (embeddingCount / chunkCount * 100).toFixed(1) + '%' : '0%'
    });
    
    recordMetric('Chunks Created', chunkCount);
    recordMetric('Embeddings Generated', embeddingCount);
    recordMetric('Images Extracted', imageCount);
    recordMetric('Products Created', productCount);
    
    if (chunkCount === 0) {
      recordIssue('critical', 'No chunks created', 'Fix chunking process');
    }
    
    if (embeddingCount === 0) {
      recordIssue('critical', 'No embeddings generated', 'Fix embedding generation');
    }
    
    if (embeddingCount < chunkCount) {
      recordIssue('warning', `Only ${embeddingCount}/${chunkCount} chunks have embeddings`, 'Ensure all chunks get embeddings');
    }
    
    return { success: passed };
    
  } catch (error) {
    recordTest('Result Validation', false, Date.now() - startTime, {
      error: error.message
    });
    return { success: false };
  }
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

async function runBaselineTests() {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 PDF PROCESSING WORKFLOW - BASELINE TEST');
  console.log('='.repeat(80));
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('='.repeat(80));
  
  const overallStart = Date.now();
  
  // Test 1: Edge Function Response Time
  const uploadResult = await testEdgeFunctionResponseTime();
  if (!uploadResult.success) {
    log('\n❌ Upload failed. Cannot continue with remaining tests.', 'error');
    await generateReport();
    process.exit(1);
  }
  
  // Test 2: Job Status Polling
  const pollingResult = await testJobStatusPolling(uploadResult.jobId);
  if (!pollingResult.success) {
    log('\n❌ Job processing failed. Continuing with partial validation...', 'error');
  }
  
  // Test 3: Sub-Job Tracking
  if (uploadResult.jobId) {
    await testSubJobTracking(uploadResult.jobId);
  }
  
  // Test 4: Result Validation
  if (pollingResult.documentId) {
    await testResultValidation(pollingResult.documentId);
  }
  
  const overallDuration = Date.now() - overallStart;
  recordMetric('Total Test Duration', overallDuration, 'ms');
  
  // Generate report
  await generateReport();
  
  // Exit with appropriate code
  const allPassed = testResults.tests.every(t => t.passed);
  process.exit(allPassed ? 0 : 1);
}

async function generateReport() {
  log('\n' + '='.repeat(80));
  log('📊 TEST REPORT');
  log('='.repeat(80));
  
  // Summary
  const totalTests = testResults.tests.length;
  const passedTests = testResults.tests.filter(t => t.passed).length;
  const failedTests = totalTests - passedTests;
  
  log(`\nTests: ${passedTests}/${totalTests} passed (${(passedTests/totalTests*100).toFixed(1)}%)`, 
      passedTests === totalTests ? 'success' : 'warning');
  
  // Metrics
  log('\nKey Metrics:', 'metric');
  Object.entries(testResults.metrics).forEach(([name, data]) => {
    log(`  ${name}: ${data.value}${data.unit}`, 'metric');
  });
  
  // Issues
  if (testResults.issues.length > 0) {
    log('\nIssues Found:', 'issue');
    testResults.issues.forEach((issue, i) => {
      log(`  ${i + 1}. [${issue.severity.toUpperCase()}] ${issue.description}`, 'issue');
    });
  }
  
  // Recommendations
  if (testResults.recommendations.length > 0) {
    log('\nRecommendations:', 'warning');
    testResults.recommendations.forEach((rec, i) => {
      log(`  ${i + 1}. ${rec}`, 'warning');
    });
  }
  
  // Save report to file
  const reportPath = path.join(__dirname, `baseline-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(testResults, null, 2));
  log(`\n📄 Full report saved to: ${reportPath}`, 'success');
}

// Run tests
runBaselineTests().catch(error => {
  console.error('❌ Test runner error:', error);
  process.exit(1);
});

