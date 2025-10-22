#!/usr/bin/env node

/**
 * Debug test for Edge Function to see why products aren't being scored
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';

async function debugEdgeFunction() {
  console.log('🔍 DEBUG: Edge Function Product Scoring');
  console.log('=' .repeat(50));

  const documentId = '69cba085-9c2d-405c-aff2-8a20caf0b568'; // HARMONY PDF

  try {
    // Call Edge Function with detailed logging
    console.log('\n🚀 Calling Edge Function with debug...');
    
    const response = await fetch(`${supabaseUrl}/functions/v1/apply-quality-scoring`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        document_id: documentId,
        include_products: true,
        include_images: false,
        comprehensive: true
      }),
    });

    console.log(`📊 Response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Error response:`, errorText);
      return;
    }

    const result = await response.json();
    console.log('\n📋 Full Response:');
    console.log(JSON.stringify(result, null, 2));

    // Check if products were actually scored
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    console.log('\n🔍 Checking database after Edge Function call...');
    
    const { data: products, error } = await supabase
      .from('products')
      .select('id, name, quality_score, confidence_score, completeness_score, quality_assessment, quality_metrics')
      .eq('source_document_id', documentId);

    if (error) {
      console.error('❌ Error fetching products:', error);
      return;
    }

    console.log(`\n📊 Products in database: ${products.length}`);
    
    products.forEach((product, i) => {
      console.log(`\n${i + 1}. Product: "${product.name.substring(0, 50)}..."`);
      console.log(`   Quality Score: ${product.quality_score || 'NULL'}`);
      console.log(`   Confidence: ${product.confidence_score || 'NULL'}`);
      console.log(`   Completeness: ${product.completeness_score || 'NULL'}`);
      console.log(`   Assessment: ${product.quality_assessment || 'NULL'}`);
      console.log(`   Metrics: ${product.quality_metrics ? 'Present' : 'NULL'}`);
    });

    // Summary
    const scoredProducts = products.filter(p => p.quality_score !== null);
    console.log(`\n📈 Summary:`);
    console.log(`   Total products: ${products.length}`);
    console.log(`   Products with quality scores: ${scoredProducts.length}`);
    console.log(`   Success rate: ${((scoredProducts.length / products.length) * 100).toFixed(1)}%`);

  } catch (error) {
    console.error('❌ Debug test failed:', error);
  }
}

debugEdgeFunction();
