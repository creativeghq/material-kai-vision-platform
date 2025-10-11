#!/usr/bin/env node

/**
 * Complete PDF Processing Flow Test
 * Tests the exact flow that the frontend uses for PDF processing
 * Including authentication, CORS, and the specific PDF URL provided
 */

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';

// Test PDF URL provided by user
const TEST_PDF_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/49f683ad-ebf2-4296-a410-0d8c011ce0be/1759818982564-harmony-signature-book-24-25.pdf';

console.log('🚀 Complete PDF Processing Flow Test');
console.log('=' .repeat(70));
console.log(`📄 Test PDF: ${TEST_PDF_URL}`);
console.log(`🔗 Supabase URL: ${SUPABASE_URL}`);
console.log('=' .repeat(70));

/**
 * Step 1: Test PDF URL accessibility
 */
async function testPDFAccessibility() {
  console.log('\n📋 Step 1: Testing PDF URL Accessibility...');
  
  try {
    const response = await fetch(TEST_PDF_URL, { method: 'HEAD' });
    
    if (response.ok) {
      const contentType = response.headers.get('content-type') || 'unknown';
      const contentLength = response.headers.get('content-length');
      const size = contentLength ? `${(parseInt(contentLength) / 1024 / 1024).toFixed(2)} MB` : 'Unknown size';
      
      console.log(`  ✅ PDF is accessible`);
      console.log(`  📊 Content-Type: ${contentType}`);
      console.log(`  📏 Size: ${size}`);
      
      return true;
    } else {
      console.log(`  ❌ PDF not accessible: ${response.status} ${response.statusText}`);
      return false;
    }
  } catch (error) {
    console.log(`  ❌ Error accessing PDF: ${error.message}`);
    return false;
  }
}

/**
 * Step 2: Test MIVAA Gateway Function Availability
 */
async function testMivaaGatewayAvailability() {
  console.log('\n🔧 Step 2: Testing MIVAA Gateway Function...');
  
  try {
    // Test OPTIONS request (CORS preflight)
    const optionsResponse = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://app.materialshub.gr',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization, content-type'
      }
    });
    
    console.log(`  🔍 OPTIONS request: ${optionsResponse.status}`);
    console.log(`  🔍 CORS headers:`, Object.fromEntries(optionsResponse.headers.entries()));
    
    // Test health check
    const healthResponse = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'health_check',
        payload: {}
      })
    });
    
    const healthData = await healthResponse.json();
    
    if (healthResponse.ok && healthData.success) {
      console.log(`  ✅ MIVAA Gateway is available`);
      console.log(`  📊 Health check response:`, healthData);
      return true;
    } else {
      console.log(`  ❌ MIVAA Gateway health check failed:`, healthData);
      return false;
    }
  } catch (error) {
    console.log(`  ❌ Error testing MIVAA Gateway: ${error.message}`);
    return false;
  }
}

/**
 * Step 2.5: Test Direct MIVAA Service
 */
async function testDirectMivaaService() {
  console.log('\n🔧 Step 2.5: Testing Direct MIVAA Service...');

  try {
    // Test direct MIVAA health endpoint
    const healthResponse = await fetch('https://v1api.materialshub.gr/health', {
      method: 'GET',
      headers: {
        'User-Agent': 'Material-Kai-Vision-Platform-Test/1.0'
      }
    });

    console.log(`  🔍 Direct MIVAA health: ${healthResponse.status} ${healthResponse.statusText}`);

    if (healthResponse.ok) {
      const healthData = await healthResponse.json();
      console.log(`  ✅ MIVAA service is healthy`);
      console.log(`  📊 Health data:`, healthData);

      // Test PDF processing endpoint availability
      try {
        const processResponse = await fetch('https://v1api.materialshub.gr/api/documents/process-url', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Material-Kai-Vision-Platform-Test/1.0'
          },
          body: JSON.stringify({
            fileUrl: 'https://example.com/test.pdf',
            options: { extract_text: true }
          })
        });

        console.log(`  🔍 PDF processing endpoint: ${processResponse.status} ${processResponse.statusText}`);

        if (processResponse.status === 422 || processResponse.status === 400) {
          console.log(`  ✅ PDF processing endpoint is available (validation error expected)`);
          return true;
        } else if (processResponse.ok) {
          console.log(`  ✅ PDF processing endpoint is working`);
          return true;
        } else {
          console.log(`  ⚠️ PDF processing endpoint returned: ${processResponse.status}`);
          return false;
        }
      } catch (error) {
        console.log(`  ❌ Error testing PDF processing endpoint: ${error.message}`);
        return false;
      }
    } else {
      console.log(`  ❌ MIVAA service health check failed`);
      return false;
    }
  } catch (error) {
    console.log(`  ❌ Error testing direct MIVAA service: ${error.message}`);
    return false;
  }
}

/**
 * Step 3: Test PDF Processing Request (Async Flow)
 */
async function testPDFProcessingFlow() {
  console.log('\n📄 Step 3: Testing PDF Processing Flow (Async)...');

  try {
    // This mimics exactly what the frontend does
    const processingRequest = {
      action: 'pdf_process_document',
      payload: {
        fileUrl: TEST_PDF_URL,
        filename: '1759818982564-harmony-signature-book-24-25.pdf',
        options: {
          extract_images: true,
          extract_text: true,
          extract_tables: true,
          include_metadata: true
        }
      }
    };

    console.log(`  🔍 Sending processing request:`, {
      action: processingRequest.action,
      fileUrl: processingRequest.payload.fileUrl,
      filename: processingRequest.payload.filename,
      options: processingRequest.payload.options
    });

    // Use shorter timeout for the initial request (should return job ID quickly)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log('  ⚠️ Initial request timeout after 30 seconds');
      controller.abort();
    }, 30000); // 30 second timeout for job creation

    const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(processingRequest),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    console.log(`  🔍 Response status: ${response.status} ${response.statusText}`);
    console.log(`  🔍 Response headers:`, Object.fromEntries(response.headers.entries()));

    if (response.status === 504) {
      console.log(`  ⚠️ Gateway timeout detected - this is expected for large PDFs`);
      console.log(`  🔧 The issue is that PDF processing takes longer than Supabase Edge Function timeout`);
      console.log(`  💡 Solution: Implement proper async processing with job polling`);
      return false;
    }

    const data = await response.json();

    if (response.ok && data.success) {
      console.log(`  ✅ PDF processing request successful`);
      console.log(`  📊 Response data:`, data);

      // If we got a job ID, test job status polling
      if (data.data && (data.data.job_id || data.data.id)) {
        const jobId = data.data.job_id || data.data.id;
        console.log(`  🔍 Got job ID: ${jobId}, starting polling...`);
        await testJobStatusPolling(jobId);
      } else {
        console.log(`  ⚠️ No job ID returned, processing might be synchronous`);
      }

      return true;
    } else {
      console.log(`  ❌ PDF processing request failed:`, data);
      return false;
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log(`  ⚠️ Request aborted due to timeout`);
      console.log(`  🔧 This indicates the PDF processing is taking too long`);
      return false;
    }
    console.log(`  ❌ Error in PDF processing flow: ${error.message}`);
    console.log(`  🔍 Error details:`, error);
    return false;
  }
}

/**
 * Step 4: Test Job Status Polling
 */
async function testJobStatusPolling(jobId) {
  console.log(`\n⏱️ Step 4: Testing Job Status Polling for job: ${jobId}...`);

  let attempts = 0;
  const maxAttempts = 60; // 5 minutes max (5 second intervals)

  while (attempts < maxAttempts) {
    try {
      console.log(`  🔍 Polling attempt ${attempts + 1}/${maxAttempts}...`);

      const statusResponse = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'get_job_status',
          payload: { job_id: jobId }
        })
      });

      console.log(`  🔍 Status response: ${statusResponse.status} ${statusResponse.statusText}`);

      if (statusResponse.status === 504) {
        console.log(`  ⚠️ Status polling also timing out - MIVAA service might be slow`);
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait longer on timeout
        continue;
      }

      const statusData = await statusResponse.json();

      if (statusResponse.ok && statusData.success) {
        const status = statusData.data?.status || 'unknown';
        const progress = statusData.data?.progress || 0;
        console.log(`  � Job status: ${status} (${progress}% complete)`);

        if (statusData.data?.message) {
          console.log(`  💬 Message: ${statusData.data.message}`);
        }

        if (status === 'completed') {
          console.log(`  ✅ Job completed successfully!`);
          if (statusData.data?.result) {
            console.log(`  📊 Result summary:`, {
              sources: statusData.data.result.sources?.length || 0,
              chunks: statusData.data.result.chunks?.length || 0,
              images: statusData.data.result.images?.length || 0,
              confidence: statusData.data.result.confidence || 0
            });
          }
          return true;
        } else if (status === 'failed' || status === 'error') {
          console.log(`  ❌ Job failed with status: ${status}`);
          if (statusData.data?.error) {
            console.log(`  � Error details: ${statusData.data.error}`);
          }
          return false;
        } else if (status === 'processing' || status === 'pending' || status === 'running') {
          console.log(`  ⏳ Job still ${status}...`);
        } else {
          console.log(`  ⚠️ Unknown status: ${status}`);
        }

        // Wait 5 seconds before next poll
        await new Promise(resolve => setTimeout(resolve, 5000));
      } else {
        console.log(`  ❌ Job status polling failed:`, statusData);
        if (statusData.error) {
          console.log(`  🔍 Error: ${statusData.error.message || statusData.error}`);
        }

        // Continue polling even on errors (might be temporary)
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } catch (error) {
      console.log(`  ❌ Error polling job status: ${error.message}`);

      // Continue polling on network errors
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    attempts++;
  }

  console.log(`  ⚠️ Job status polling timed out after ${maxAttempts} attempts (${maxAttempts * 5} seconds)`);
  return false;
}

/**
 * Step 5: Test Authentication and Headers
 */
async function testAuthenticationAndHeaders() {
  console.log('\n🔐 Step 5: Testing Authentication and Headers...');
  
  // Test with missing auth
  try {
    const noAuthResponse = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'health_check',
        payload: {}
      })
    });
    
    console.log(`  🔍 No auth request: ${noAuthResponse.status}`);
  } catch (error) {
    console.log(`  🔍 No auth request failed: ${error.message}`);
  }
  
  // Test with invalid auth
  try {
    const invalidAuthResponse = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer invalid-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'health_check',
        payload: {}
      })
    });
    
    console.log(`  🔍 Invalid auth request: ${invalidAuthResponse.status}`);
  } catch (error) {
    console.log(`  🔍 Invalid auth request failed: ${error.message}`);
  }
  
  // Test with valid auth (should work)
  try {
    const validAuthResponse = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'health_check',
        payload: {}
      })
    });
    
    const validAuthData = await validAuthResponse.json();
    console.log(`  ✅ Valid auth request: ${validAuthResponse.status} - ${validAuthData.success ? 'Success' : 'Failed'}`);
  } catch (error) {
    console.log(`  ❌ Valid auth request failed: ${error.message}`);
  }
}

/**
 * Main test execution
 */
async function runCompleteTest() {
  console.log('\n🎯 Starting Complete PDF Processing Flow Test...\n');

  const results = {
    pdfAccessible: false,
    gatewayAvailable: false,
    mivaaServiceAvailable: false,
    processingFlow: false,
    authenticationWorking: false
  };

  // Run all tests
  results.pdfAccessible = await testPDFAccessibility();
  results.gatewayAvailable = await testMivaaGatewayAvailability();
  results.mivaaServiceAvailable = await testDirectMivaaService();

  if (results.gatewayAvailable) {
    results.processingFlow = await testPDFProcessingFlow();
  }

  await testAuthenticationAndHeaders();
  
  // Summary
  console.log('\n' + '=' .repeat(70));
  console.log('📋 TEST SUMMARY');
  console.log('=' .repeat(70));
  console.log(`📄 PDF Accessibility: ${results.pdfAccessible ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`🔧 MIVAA Gateway: ${results.gatewayAvailable ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`🔧 Direct MIVAA Service: ${results.mivaaServiceAvailable ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`📄 PDF Processing Flow: ${results.processingFlow ? '✅ PASS' : '❌ FAIL'}`);

  if (results.pdfAccessible && results.gatewayAvailable && results.mivaaServiceAvailable && results.processingFlow) {
    console.log('\n🎉 ALL TESTS PASSED! The PDF processing flow is working correctly.');
  } else {
    console.log('\n⚠️ SOME TESTS FAILED. Check the details above for issues.');

    if (!results.pdfAccessible) {
      console.log('   - PDF URL is not accessible');
    }
    if (!results.gatewayAvailable) {
      console.log('   - MIVAA Gateway function is not available or has issues');
    }
    if (!results.mivaaServiceAvailable) {
      console.log('   - Direct MIVAA service is not responding properly');
    }
    if (!results.processingFlow) {
      console.log('   - PDF processing flow failed (likely due to timeout issues)');
    }
  }

  console.log('\n🔧 Next Steps:');
  console.log('   1. If MIVAA Gateway failed, check Supabase function deployment');
  console.log('   2. If Direct MIVAA failed, check MIVAA service status at v1api.materialshub.gr');
  console.log('   3. If PDF processing failed with 504 timeout, implement async job polling');
  console.log('   4. If authentication failed, check Supabase keys');
  console.log('   5. Consider upgrading Supabase plan for longer Edge Function timeouts');
}

// Run the test
runCompleteTest().catch(console.error);
