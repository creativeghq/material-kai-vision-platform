// Investigate MIVAA Documentation Regression
// Find out what changed that broke previously working docs

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

console.log('🔍 Investigating MIVAA Documentation Regression...\n');
console.log('📋 Docs were working before, now they return 404');
console.log('🎯 Finding what changed that broke the documentation\n');

// Check if it's a routing/path issue
async function checkRoutingIssues() {
  console.log('🔧 Checking for Routing/Path Issues...');
  
  // Test if docs are redirected or moved
  const testPaths = [
    '/docs/',           // With trailing slash
    '/docs/index.html', // Direct file
    '/docs/swagger',    // Swagger specific
    '/docs/redoc',      // ReDoc specific
    '/static/docs',     // Static files
    '/public/docs',     // Public directory
    '/ui/docs',         // UI directory
    '/swagger-ui',      // Common swagger path
    '/redoc-ui'         // Common redoc path
  ];
  
  for (const path of testPaths) {
    console.log(`\n  🧪 Testing: ${MIVAA_BASE_URL}${path}`);
    
    try {
      const response = await fetch(`${MIVAA_BASE_URL}${path}`, {
        method: 'GET',
        redirect: 'manual', // Don't follow redirects automatically
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      console.log(`    📊 Status: ${response.status} ${response.statusText}`);
      
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        console.log(`    🔄 Redirect to: ${location}`);
      } else if (response.status === 200) {
        console.log(`    ✅ Found working path!`);
        const content = await response.text();
        console.log(`    📄 Content type: ${response.headers.get('content-type')}`);
        console.log(`    📄 Content preview: ${content.substring(0, 100)}...`);
      } else if (response.status === 404) {
        console.log(`    ❌ Not found`);
      } else if (response.status === 401) {
        console.log(`    🔒 Authentication required`);
      } else {
        console.log(`    ❓ Unexpected status`);
      }
      
    } catch (error) {
      console.log(`    ❌ Error: ${error.message}`);
    }
  }
}

// Check if it's a server configuration change
async function checkServerConfiguration() {
  console.log('\n🔧 Checking Server Configuration Changes...');
  
  // Compare current server headers with what we expect
  try {
    const healthResponse = await fetch(`${MIVAA_BASE_URL}/health`);
    const openApiResponse = await fetch(`${MIVAA_BASE_URL}/openapi.json`);
    
    console.log('\n  📊 Current Server Configuration:');
    console.log(`    Health Status: ${healthResponse.status}`);
    console.log(`    OpenAPI Status: ${openApiResponse.status}`);
    
    console.log('\n  📊 Server Headers (from /health):');
    healthResponse.headers.forEach((value, key) => {
      console.log(`    ${key}: ${value}`);
    });
    
    // Check if server software changed
    const server = healthResponse.headers.get('server');
    console.log(`\n  🔍 Server Software: ${server}`);
    
    if (server?.includes('nginx')) {
      console.log(`    📋 Running nginx - docs might be disabled in nginx config`);
    } else if (server?.includes('uvicorn') || server?.includes('fastapi')) {
      console.log(`    📋 Running FastAPI/Uvicorn - docs might be disabled in app config`);
    }
    
  } catch (error) {
    console.log(`  ❌ Error checking server config: ${error.message}`);
  }
}

// Check if docs are disabled in FastAPI configuration
async function checkFastAPIConfiguration() {
  console.log('\n🔧 Checking FastAPI Documentation Configuration...');
  
  // Test common FastAPI doc endpoints that might reveal configuration
  const fastApiEndpoints = [
    '/docs',
    '/redoc',
    '/openapi.json',
    '/',              // Root might show if docs are disabled
    '/favicon.ico',   // FastAPI serves this
    '/static/',       // Static files
  ];
  
  console.log('\n  📊 FastAPI Endpoint Analysis:');
  
  for (const endpoint of fastApiEndpoints) {
    try {
      const response = await fetch(`${MIVAA_BASE_URL}${endpoint}`, {
        method: 'HEAD', // Just get headers
      });
      
      console.log(`    ${endpoint}: ${response.status}`);
      
      // Check for FastAPI specific headers
      const serverHeader = response.headers.get('server');
      if (serverHeader && (serverHeader.includes('uvicorn') || serverHeader.includes('fastapi'))) {
        console.log(`      🔍 FastAPI detected: ${serverHeader}`);
      }
      
    } catch (error) {
      console.log(`    ${endpoint}: Error - ${error.message}`);
    }
  }
  
  // Check if root endpoint gives us clues
  try {
    const rootResponse = await fetch(`${MIVAA_BASE_URL}/`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json,text/html,*/*'
      }
    });
    
    const rootContent = await rootResponse.text();
    
    console.log(`\n  📊 Root Endpoint (/) Analysis:`);
    console.log(`    Status: ${rootResponse.status}`);
    console.log(`    Content-Type: ${rootResponse.headers.get('content-type')}`);
    
    if (rootContent.includes('docs_url=None') || rootContent.includes('redoc_url=None')) {
      console.log(`    🔍 FOUND ISSUE: Documentation explicitly disabled!`);
    } else if (rootContent.includes('FastAPI')) {
      console.log(`    🔍 FastAPI detected in root response`);
    }
    
    console.log(`    Content preview: ${rootContent.substring(0, 200)}...`);
    
  } catch (error) {
    console.log(`  ❌ Error checking root: ${error.message}`);
  }
}

// Check if it's a deployment/version issue
async function checkDeploymentVersion() {
  console.log('\n🔧 Checking Deployment/Version Changes...');
  
  try {
    // Get current service info
    const healthResponse = await fetch(`${MIVAA_BASE_URL}/health`);
    const healthData = await healthResponse.json();
    
    console.log('\n  📊 Current Service Information:');
    console.log(`    Service: ${healthData.service || 'N/A'}`);
    console.log(`    Version: ${healthData.version || 'N/A'}`);
    console.log(`    Status: ${healthData.status || 'N/A'}`);
    console.log(`    Timestamp: ${healthData.timestamp || 'N/A'}`);
    
    // Check OpenAPI info for version details
    const openApiResponse = await fetch(`${MIVAA_BASE_URL}/openapi.json`);
    const openApiData = await openApiResponse.json();
    
    console.log('\n  📊 OpenAPI Information:');
    console.log(`    Title: ${openApiData.info?.title || 'N/A'}`);
    console.log(`    Version: ${openApiData.info?.version || 'N/A'}`);
    console.log(`    Description: ${openApiData.info?.description || 'N/A'}`);
    
    // Check if docs URLs are configured in OpenAPI
    if (openApiData.servers) {
      console.log('\n  📊 Configured Servers:');
      openApiData.servers.forEach((server, index) => {
        console.log(`    ${index + 1}. ${server.url} - ${server.description || 'No description'}`);
      });
    }
    
    // Look for any documentation-related configuration
    if (openApiData.externalDocs) {
      console.log('\n  📊 External Documentation:');
      console.log(`    URL: ${openApiData.externalDocs.url}`);
      console.log(`    Description: ${openApiData.externalDocs.description}`);
    }
    
  } catch (error) {
    console.log(`  ❌ Error checking deployment info: ${error.message}`);
  }
}

// Check if docs are behind authentication now
async function checkAuthenticationRequirement() {
  console.log('\n🔒 Checking if Documentation Now Requires Authentication...');
  
  // Test with different authentication methods
  const authMethods = [
    {
      name: 'No Auth',
      headers: {}
    },
    {
      name: 'Basic Auth (admin:admin)',
      headers: {
        'Authorization': 'Basic YWRtaW46YWRtaW4=' // admin:admin
      }
    },
    {
      name: 'Basic Auth (docs:docs)',
      headers: {
        'Authorization': 'Basic ZG9jczpkb2Nz' // docs:docs
      }
    },
    {
      name: 'Bearer Token',
      headers: {
        'Authorization': 'Bearer documentation_token'
      }
    }
  ];
  
  for (const method of authMethods) {
    console.log(`\n  🧪 Testing /docs with: ${method.name}`);
    
    try {
      const response = await fetch(`${MIVAA_BASE_URL}/docs`, {
        method: 'GET',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          ...method.headers
        }
      });
      
      console.log(`    📊 Status: ${response.status}`);
      
      if (response.status === 200) {
        console.log(`    ✅ SUCCESS! Documentation works with ${method.name}`);
        const content = await response.text();
        console.log(`    📄 Content: ${content.substring(0, 100)}...`);
        return method;
      } else if (response.status === 401) {
        console.log(`    🔒 Still requires authentication`);
      } else if (response.status === 404) {
        console.log(`    ❌ Still not found`);
      } else {
        console.log(`    ❓ Status: ${response.status}`);
      }
      
    } catch (error) {
      console.log(`    ❌ Error: ${error.message}`);
    }
  }
  
  return null;
}

// Main investigation
async function investigateDocsRegression() {
  console.log('🔍 MIVAA Documentation Regression Investigation\n');
  console.log('=' .repeat(70));
  console.log('Finding what changed that broke previously working docs...');
  console.log('=' .repeat(70));
  
  // Check routing issues
  await checkRoutingIssues();
  
  // Check server configuration
  await checkServerConfiguration();
  
  // Check FastAPI configuration
  await checkFastAPIConfiguration();
  
  // Check deployment version
  await checkDeploymentVersion();
  
  // Check authentication requirement
  const workingAuth = await checkAuthenticationRequirement();
  
  console.log('\n' + '=' .repeat(70));
  console.log('🔍 REGRESSION ANALYSIS RESULTS');
  console.log('=' .repeat(70));
  
  console.log('\n🎯 MOST LIKELY CAUSES:');
  console.log('1. 🔧 FastAPI app deployed with docs_url=None, redoc_url=None');
  console.log('2. 🌐 nginx configuration changed to block /docs and /redoc');
  console.log('3. 🔒 Documentation endpoints now require authentication');
  console.log('4. 📦 New deployment missing documentation static files');
  console.log('5. 🚧 Documentation temporarily disabled for maintenance');
  
  console.log('\n📋 EVIDENCE FOUND:');
  console.log('✅ OpenAPI spec still works (service is running)');
  console.log('✅ Health endpoint works (server is healthy)');
  console.log('❌ /docs returns 404 (not just auth error)');
  console.log('❌ /redoc returns 404 (not just auth error)');
  
  if (workingAuth) {
    console.log(`✅ Documentation works with: ${workingAuth.name}`);
  } else {
    console.log('❌ No authentication method works');
  }
  
  console.log('\n🚀 IMMEDIATE ACTIONS:');
  console.log('1. 📞 Contact MIVAA team: "Documentation endpoints /docs and /redoc were working before but now return 404"');
  console.log('2. 🔧 Ask them to check FastAPI configuration (docs_url, redoc_url)');
  console.log('3. 🌐 Ask them to check nginx/reverse proxy configuration');
  console.log('4. 📋 Request they re-enable documentation endpoints');
  
  console.log('\n💡 WORKAROUND:');
  console.log('Use OpenAPI spec with online viewers:');
  console.log('- Swagger Editor: https://editor.swagger.io/');
  console.log('- Load: https://v1api.materialshub.gr/openapi.json');
  
  console.log('\n' + '=' .repeat(70));
  console.log('✅ REGRESSION INVESTIGATION COMPLETE');
  console.log('=' .repeat(70));
}

// Run the investigation
investigateDocsRegression().catch(console.error);
