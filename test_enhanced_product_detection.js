#!/usr/bin/env node

/**
 * Test Enhanced Product Detection System
 * 
 * Tests the improved product detection with:
 * 1. No 10-product limit (processes ALL chunks)
 * 2. Content filtering (skips index/sustainability/technical content)
 * 3. Enhanced pattern recognition (product names, dimensions, designers)
 * 4. Better metadata extraction
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

// HARMONY PDF document ID (from previous analysis)
const DOCUMENT_ID = '69cba085-9c2d-405c-aff2-8a20caf0b568';

async function testEnhancedProductDetection() {
  console.log('🧪 Testing Enhanced Product Detection System');
  console.log('=' .repeat(60));
  
  try {
    // 1. Check current products (before enhancement)
    console.log('\n1️⃣ Current products in database:');
    const { data: currentProducts, error: currentError } = await supabase
      .from('products')
      .select('id, name, metadata')
      .eq('source_document_id', DOCUMENT_ID)
      .order('created_at');

    if (currentError) {
      console.error('❌ Error fetching current products:', currentError);
      return;
    }

    console.log(`   📊 Found ${currentProducts.length} existing products`);
    currentProducts.forEach((product, i) => {
      console.log(`   ${i + 1}. ${product.name}`);
      if (product.metadata?.dimensions) {
        console.log(`      📏 Dimensions: ${product.metadata.dimensions}`);
      }
      if (product.metadata?.designer) {
        console.log(`      👨‍🎨 Designer: ${product.metadata.designer}`);
      }
      if (product.metadata?.colors) {
        console.log(`      🎨 Colors: ${product.metadata.colors.join(', ')}`);
      }
    });

    // 2. Delete existing products to test fresh creation
    console.log('\n2️⃣ Clearing existing products for fresh test...');
    const { error: deleteError } = await supabase
      .from('products')
      .delete()
      .eq('source_document_id', DOCUMENT_ID);

    if (deleteError) {
      console.error('❌ Error deleting products:', deleteError);
      return;
    }
    console.log('   ✅ Existing products cleared');

    // 3. Check total chunks available
    console.log('\n3️⃣ Checking available chunks:');
    const { data: chunks, error: chunksError } = await supabase
      .from('document_chunks')
      .select('id, chunk_index, page_number, content')
      .eq('document_id', DOCUMENT_ID)
      .order('chunk_index');

    if (chunksError) {
      console.error('❌ Error fetching chunks:', chunksError);
      return;
    }

    console.log(`   📊 Total chunks available: ${chunks.length}`);
    console.log(`   📄 Page range: ${Math.min(...chunks.map(c => c.page_number))} - ${Math.max(...chunks.map(c => c.page_number))}`);

    // 4. Trigger enhanced product creation
    console.log('\n4️⃣ Triggering enhanced product creation...');
    
    const response = await fetch('http://localhost:8000/api/rag/create-products', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        document_id: DOCUMENT_ID,
        workspace_id: 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e'
      }),
    });

    if (!response.ok) {
      console.error('❌ Product creation failed:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('Error details:', errorText);
      return;
    }

    const result = await response.json();
    console.log('   ✅ Product creation response:', result);

    // 5. Check new products created
    console.log('\n5️⃣ Checking newly created products:');
    
    // Wait a moment for database to update
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const { data: newProducts, error: newError } = await supabase
      .from('products')
      .select('id, name, description, metadata, created_at')
      .eq('source_document_id', DOCUMENT_ID)
      .order('created_at');

    if (newError) {
      console.error('❌ Error fetching new products:', newError);
      return;
    }

    console.log(`   📊 New products created: ${newProducts.length}`);
    
    // 6. Analyze product quality
    console.log('\n6️⃣ Product Quality Analysis:');
    
    const expectedProducts = ['FOLD', 'BEAT', 'VALENOVA', 'PIQUÉ', 'ONA', 'MARE', 'LOG', 'BOW', 'LINS', 'MAISON'];
    const foundProducts = [];
    const realProducts = [];
    const fakeProducts = [];

    newProducts.forEach((product, i) => {
      console.log(`\n   ${i + 1}. ${product.name}`);
      console.log(`      📝 Description: ${product.description.substring(0, 100)}...`);
      
      if (product.metadata?.dimensions) {
        console.log(`      📏 Dimensions: ${product.metadata.dimensions}`);
      }
      if (product.metadata?.designer) {
        console.log(`      👨‍🎨 Designer: ${product.metadata.designer}`);
      }
      if (product.metadata?.colors) {
        console.log(`      🎨 Colors: ${product.metadata.colors.join(', ')}`);
      }
      if (product.metadata?.material_type) {
        console.log(`      🧱 Material: ${product.metadata.material_type}`);
      }

      // Check if this is a real product
      const isExpectedProduct = expectedProducts.some(expected => 
        product.name.includes(expected) || product.description.includes(expected)
      );
      
      const hasProductIndicators = (
        (product.metadata?.dimensions || product.description.includes('×')) &&
        (product.metadata?.designer || product.description.toLowerCase().includes('designer'))
      );

      if (isExpectedProduct || hasProductIndicators) {
        realProducts.push(product.name);
        if (isExpectedProduct) {
          const foundProduct = expectedProducts.find(expected => 
            product.name.includes(expected) || product.description.includes(expected)
          );
          foundProducts.push(foundProduct);
        }
        console.log(`      ✅ REAL PRODUCT`);
      } else {
        fakeProducts.push(product.name);
        console.log(`      ❌ LIKELY NOT A REAL PRODUCT`);
      }
    });

    // 7. Final Results
    console.log('\n7️⃣ FINAL RESULTS:');
    console.log('=' .repeat(60));
    console.log(`📊 Total products created: ${newProducts.length}`);
    console.log(`✅ Real products: ${realProducts.length} (${Math.round(realProducts.length / newProducts.length * 100)}%)`);
    console.log(`❌ Fake products: ${fakeProducts.length} (${Math.round(fakeProducts.length / newProducts.length * 100)}%)`);
    console.log(`🎯 Expected products found: ${foundProducts.length}/10 (${Math.round(foundProducts.length / 10 * 100)}%)`);
    
    console.log('\n📋 Expected vs Found:');
    expectedProducts.forEach(expected => {
      const found = foundProducts.includes(expected);
      console.log(`   ${found ? '✅' : '❌'} ${expected}: ${found ? 'FOUND' : 'NOT FOUND'}`);
    });

    if (foundProducts.length < 10) {
      console.log('\n🔍 Missing products analysis:');
      const missing = expectedProducts.filter(p => !foundProducts.includes(p));
      console.log(`   Missing: ${missing.join(', ')}`);
      console.log('   💡 These products may appear in later chunks that were previously skipped');
    }

    // 8. Performance comparison
    console.log('\n8️⃣ IMPROVEMENT ANALYSIS:');
    console.log('=' .repeat(60));
    console.log('📈 Before Enhancement:');
    console.log('   - Products created: 10 (limited)');
    console.log('   - Real products: 5/10 (50%)');
    console.log('   - Expected products found: 5/10 (50%)');
    console.log('   - Issues: Index pages, sustainability content, technical tables');
    
    console.log('\n📈 After Enhancement:');
    console.log(`   - Products created: ${newProducts.length} (unlimited)`);
    console.log(`   - Real products: ${realProducts.length}/${newProducts.length} (${Math.round(realProducts.length / newProducts.length * 100)}%)`);
    console.log(`   - Expected products found: ${foundProducts.length}/10 (${Math.round(foundProducts.length / 10 * 100)}%)`);
    console.log('   - Improvements: Content filtering, pattern recognition, metadata extraction');

    const improvement = foundProducts.length - 5;
    if (improvement > 0) {
      console.log(`\n🎉 SUCCESS: Found ${improvement} additional products!`);
    } else if (improvement === 0) {
      console.log(`\n⚠️ SAME RESULT: Need further improvements`);
    } else {
      console.log(`\n❌ REGRESSION: Lost ${Math.abs(improvement)} products`);
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testEnhancedProductDetection();
