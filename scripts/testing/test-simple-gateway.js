#!/usr/bin/env node

import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';

async function testSimpleGateway() {
  console.log('Testing simple gateway function...\n');
  
  // Create a small test file
  const testContent = Buffer.from('Hello, this is a test PDF file!');
  
  const formData = new FormData();
  formData.append('file', testContent, {
    filename: 'test.pdf',
    contentType: 'application/pdf',
  });
  formData.append('title', 'Test PDF');
  formData.append('enable_embedding', 'true');
  
  const url = `${SUPABASE_URL}/functions/v1/mivaa-gateway-test`;
  console.log(`URL: ${url}\n`);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: formData,
    });
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    
    const text = await response.text();
    console.log(`Response: ${text}\n`);
    
    if (response.ok) {
      console.log('✅ Test function works!');
      return true;
    } else {
      console.log('❌ Test function failed');
      return false;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

testSimpleGateway();

