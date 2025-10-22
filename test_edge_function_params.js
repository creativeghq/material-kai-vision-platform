#!/usr/bin/env node

/**
 * Test to verify Edge Function is receiving the enhanced parameters
 */

const supabaseUrl = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';

async function testEdgeFunctionParams() {
  console.log('🔍 Testing Edge Function Parameter Reception');
  console.log('=' .repeat(50));

  const documentId = '69cba085-9c2d-405c-aff2-8a20caf0b568'; // HARMONY PDF

  try {
    console.log('\n🚀 Test 1: Call with enhanced parameters...');
    
    const requestBody = {
      document_id: documentId,
      include_products: true,
      include_images: true,
      comprehensive: true
    };

    console.log('📋 Sending request body:', JSON.stringify(requestBody, null, 2));

    const response = await fetch(`${supabaseUrl}/functions/v1/apply-quality-scoring`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log(`📊 Response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Error response:`, errorText);
      return;
    }

    const result = await response.json();
    console.log('\n📋 Response received:');
    console.log(JSON.stringify(result, null, 2));

    // Check if the response has the enhanced fields
    const hasEnhancedFields = result.hasOwnProperty('total_products') && 
                             result.hasOwnProperty('scored_products') && 
                             result.hasOwnProperty('document_quality_score');

    console.log('\n🔍 Analysis:');
    console.log(`   Has enhanced fields: ${hasEnhancedFields}`);
    console.log(`   Response keys: ${Object.keys(result).join(', ')}`);

    if (hasEnhancedFields) {
      console.log('✅ Edge Function is using enhanced version');
      console.log(`   Products: ${result.scored_products}/${result.total_products}`);
      console.log(`   Document quality: ${result.document_quality_score}`);
    } else {
      console.log('❌ Edge Function is using old version');
      console.log('   Missing: total_products, scored_products, document_quality_score');
    }

    // Test 2: Call with minimal parameters (old style)
    console.log('\n🚀 Test 2: Call with minimal parameters (old style)...');
    
    const minimalRequestBody = {
      document_id: documentId
    };

    console.log('📋 Sending minimal request body:', JSON.stringify(minimalRequestBody, null, 2));

    const response2 = await fetch(`${supabaseUrl}/functions/v1/apply-quality-scoring`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(minimalRequestBody),
    });

    console.log(`📊 Response status: ${response2.status}`);
    
    if (response2.ok) {
      const result2 = await response2.json();
      console.log('\n📋 Minimal response received:');
      console.log(JSON.stringify(result2, null, 2));
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testEdgeFunctionParams();
