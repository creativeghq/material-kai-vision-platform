#!/usr/bin/env node

/**
 * CHECK MIVAA AVAILABLE ENDPOINTS
 */

import fetch from 'node-fetch';

const MIVAA_SERVICE_URL = 'https://v1api.materialshub.gr';

async function main() {
  console.log('Fetching MIVAA OpenAPI spec...\n');
  
  const response = await fetch(`${MIVAA_SERVICE_URL}/openapi.json`);
  const spec = await response.json();
  
  console.log('Available endpoints:\n');
  console.log('='.repeat(100));
  
  Object.entries(spec.paths).forEach(([path, methods]) => {
    Object.entries(methods).forEach(([method, details]) => {
      console.log(`${method.toUpperCase().padEnd(7)} ${path}`);
      if (details.summary) {
        console.log(`        ${details.summary}`);
      }
      console.log('');
    });
  });
  
  console.log('='.repeat(100));
  console.log(`\nTotal endpoints: ${Object.keys(spec.paths).length}`);
  
  // Check for RAG-related endpoints
  console.log('\n\nRAG-related endpoints:');
  console.log('='.repeat(100));
  Object.entries(spec.paths).forEach(([path, methods]) => {
    if (path.toLowerCase().includes('rag') || path.toLowerCase().includes('upload')) {
      Object.entries(methods).forEach(([method, details]) => {
        console.log(`${method.toUpperCase().padEnd(7)} ${path}`);
        if (details.summary) {
          console.log(`        ${details.summary}`);
        }
        console.log('');
      });
    }
  });
}

main();

