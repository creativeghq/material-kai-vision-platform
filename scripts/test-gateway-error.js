#!/usr/bin/env node

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQ1MzE1NzQsImV4cCI6MjA1MDEwNzU3NH0.Ej_Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8';

async function testGatewayError() {
  console.log('🔍 Testing MIVAA Gateway Error Details...');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'get_document_chunks',
        payload: { document_id: 'test-doc-id' }
      })
    });

    const result = await response.text();
    console.log('Status:', response.status);
    console.log('Response:', result);
    
    // Try to parse as JSON
    try {
      const jsonResult = JSON.parse(result);
      console.log('Parsed JSON:', JSON.stringify(jsonResult, null, 2));
    } catch (e) {
      console.log('Response is not valid JSON');
    }
    
  } catch (error) {
    console.log('Error:', error.message);
  }
}

testGatewayError();
