#!/usr/bin/env node

import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';

const MIVAA_SERVICE_URL = 'https://v1api.materialshub.gr';
const MIVAA_API_KEY = process.env.MIVAA_API_KEY || 'your-mivaa-api-key';

async function testMivaaRagSimple() {
  console.log('Testing MIVAA RAG upload with small file...\n');

  try {
    // Create a small test PDF content
    const testContent = Buffer.from('This is a test PDF content for MIVAA RAG upload.');
    
    const formData = new FormData();
    formData.append('file', testContent, {
      filename: 'test.pdf',
      contentType: 'application/pdf',
    });
    formData.append('title', 'test.pdf');
    formData.append('enable_embedding', 'true');
    formData.append('chunk_size', '512');
    formData.append('chunk_overlap', '50');

    const url = `${MIVAA_SERVICE_URL}/api/rag/documents/upload`;
    console.log(`Calling: ${url}`);
    console.log(`API Key: ${MIVAA_API_KEY.substring(0, 10)}...\n`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MIVAA_API_KEY}`,
      },
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    console.log(`Status: ${response.status} ${response.statusText}`);

    const text = await response.text();
    console.log(`Response: ${text}\n`);

    if (response.ok) {
      const data = JSON.parse(text);
      console.log('✅ Success!');
      console.log(JSON.stringify(data, null, 2));
      
      if (data.chunks_created === 0) {
        console.log('\n⚠️  WARNING: No chunks were created!');
      }
    } else {
      console.log('❌ Failed!');
    }

  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('❌ Request timed out after 30 seconds');
    } else {
      console.error('❌ Error:', error.message);
    }
  }
}

testMivaaRagSimple();

