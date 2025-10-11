#!/usr/bin/env node

/**
 * ANALYZE MISSING API ENDPOINTS
 * 
 * Compares validation framework endpoints against current API documentation
 * to identify missing endpoints that need to be documented.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the validation framework
const frameworkPath = path.join(__dirname, 'comprehensive-api-validation/api-validation-framework.js');
const frameworkContent = fs.readFileSync(frameworkPath, 'utf8');

// Read the API documentation
const docsPath = path.join(__dirname, '../docs/api-documentation.md');
const docsContent = fs.readFileSync(docsPath, 'utf8');

// Extract API_ENDPOINTS array
const endpointsMatch = frameworkContent.match(/const API_ENDPOINTS = \[([\s\S]*?)\];/);
if (!endpointsMatch) {
  console.log('❌ Could not find API_ENDPOINTS in framework');
  process.exit(1);
}

// Parse endpoints (simplified parsing)
const endpointsText = endpointsMatch[1];
const endpointLines = endpointsText.split('\n').filter(line => line.trim().includes('path:'));

console.log('📊 ENDPOINTS FROM VALIDATION FRAMEWORK');
console.log('=====================================');

const endpoints = [];
endpointLines.forEach(line => {
  const pathMatch = line.match(/path: '([^']+)'/);
  const methodMatch = line.match(/method: '([^']+)'/);
  const categoryMatch = line.match(/category: '([^']+)'/);
  const criticalMatch = line.match(/critical: (true|false)/);
  
  if (pathMatch && methodMatch && categoryMatch) {
    const endpoint = {
      path: pathMatch[1],
      method: methodMatch[1],
      category: categoryMatch[1],
      critical: criticalMatch ? criticalMatch[1] === 'true' : false
    };
    endpoints.push(endpoint);
    console.log(`${endpoint.method} ${endpoint.path} (${endpoint.category})${endpoint.critical ? ' [CRITICAL]' : ''}`);
  }
});

console.log(`\n📈 Total endpoints found: ${endpoints.length}`);

// Check which endpoints are missing from documentation
console.log('\n🔍 CHECKING DOCUMENTATION COVERAGE');
console.log('==================================');

const missingEndpoints = [];
const documentedEndpoints = [];

endpoints.forEach(endpoint => {
  const searchPattern = new RegExp(`${endpoint.method}\\s+${endpoint.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
  
  if (docsContent.match(searchPattern)) {
    documentedEndpoints.push(endpoint);
  } else {
    missingEndpoints.push(endpoint);
  }
});

console.log(`✅ Documented endpoints: ${documentedEndpoints.length}`);
console.log(`❌ Missing endpoints: ${missingEndpoints.length}`);

// Group missing endpoints by category
const missingByCategory = {};
missingEndpoints.forEach(ep => {
  if (!missingByCategory[ep.category]) missingByCategory[ep.category] = [];
  missingByCategory[ep.category].push(ep);
});

console.log('\n❌ MISSING ENDPOINTS BY CATEGORY');
console.log('================================');
Object.entries(missingByCategory).forEach(([category, eps]) => {
  console.log(`\n${category.toUpperCase()} (${eps.length} missing):`);
  eps.forEach(ep => {
    console.log(`  ${ep.method} ${ep.path}${ep.critical ? ' [CRITICAL]' : ''}`);
  });
});

// Identify job-related endpoints specifically
const jobEndpoints = endpoints.filter(ep => 
  ep.path.includes('/job') || 
  ep.path.includes('/bulk') || 
  ep.category === 'jobs'
);

console.log('\n🔧 JOB-RELATED ENDPOINTS');
console.log('========================');
if (jobEndpoints.length > 0) {
  jobEndpoints.forEach(ep => {
    const isDocumented = documentedEndpoints.some(doc => doc.path === ep.path && doc.method === ep.method);
    console.log(`${ep.method} ${ep.path} (${ep.category}) ${isDocumented ? '✅' : '❌'}`);
  });
} else {
  console.log('❌ No job-related endpoints found in validation framework!');
}

// Check for additional job endpoints from OpenAPI spec
console.log('\n🔍 CHECKING OPENAPI SPEC FOR ADDITIONAL JOB ENDPOINTS');
console.log('=====================================================');

const openApiPath = path.join(__dirname, 'mivaa-tests/mivaa-openapi-spec.json');
if (fs.existsSync(openApiPath)) {
  const openApiContent = fs.readFileSync(openApiPath, 'utf8');
  const openApiSpec = JSON.parse(openApiContent);
  
  const jobPaths = Object.keys(openApiSpec.paths || {}).filter(path => 
    path.includes('/job') || path.includes('/bulk')
  );
  
  console.log(`Found ${jobPaths.length} job-related paths in OpenAPI spec:`);
  jobPaths.forEach(path => {
    const methods = Object.keys(openApiSpec.paths[path]);
    methods.forEach(method => {
      const endpoint = `${method.toUpperCase()} ${path}`;
      const isInFramework = endpoints.some(ep => ep.path === path && ep.method.toUpperCase() === method.toUpperCase());
      const isDocumented = docsContent.includes(path);
      
      console.log(`  ${endpoint} - Framework: ${isInFramework ? '✅' : '❌'} - Docs: ${isDocumented ? '✅' : '❌'}`);
    });
  });
} else {
  console.log('❌ OpenAPI spec not found');
}

// Generate summary report
console.log('\n📋 SUMMARY REPORT');
console.log('================');
console.log(`Total endpoints in validation framework: ${endpoints.length}`);
console.log(`Documented endpoints: ${documentedEndpoints.length}`);
console.log(`Missing from documentation: ${missingEndpoints.length}`);
console.log(`Documentation coverage: ${((documentedEndpoints.length / endpoints.length) * 100).toFixed(1)}%`);

if (missingEndpoints.length > 0) {
  console.log('\n🚨 PRIORITY MISSING ENDPOINTS (Critical):');
  const criticalMissing = missingEndpoints.filter(ep => ep.critical);
  if (criticalMissing.length > 0) {
    criticalMissing.forEach(ep => {
      console.log(`  ${ep.method} ${ep.path} (${ep.category})`);
    });
  } else {
    console.log('  None - all critical endpoints are documented');
  }
}
