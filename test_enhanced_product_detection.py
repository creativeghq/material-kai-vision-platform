#!/usr/bin/env python3

"""
Test Enhanced Product Detection System

Tests the improved product detection with:
1. No 10-product limit (processes ALL chunks)
2. Content filtering (skips index/sustainability/technical content)
3. Enhanced pattern recognition (product names, dimensions, designers)
4. Better metadata extraction
"""

import asyncio
import sys
import os

# Add the app directory to Python path
sys.path.append('/var/www/mivaa-pdf-extractor')

from app.services.product_creation_service import ProductCreationService
from app.services.supabase_client import SupabaseClient

# HARMONY PDF document ID (from previous analysis)
DOCUMENT_ID = '69cba085-9c2d-405c-aff2-8a20caf0b568'
WORKSPACE_ID = 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e'

async def test_enhanced_product_detection():
    print('🧪 Testing Enhanced Product Detection System')
    print('=' * 60)
    
    try:
        # Initialize services
        print('\n1️⃣ Initializing services...')
        supabase_client = SupabaseClient()
        product_service = ProductCreationService(supabase_client)
        print('   ✅ Services initialized')

        # Check current products (should be 0 after deletion)
        print('\n2️⃣ Checking current products in database:')
        current_products_response = supabase_client.client.table('products').select('id, name, metadata').eq('source_document_id', DOCUMENT_ID).execute()
        current_products = current_products_response.data if current_products_response.data else []
        
        print(f'   📊 Found {len(current_products)} existing products')
        if current_products:
            for i, product in enumerate(current_products):
                print(f'   {i + 1}. {product["name"]}')

        # Check total chunks available
        print('\n3️⃣ Checking available chunks:')
        chunks_response = supabase_client.client.table('document_chunks').select('id, chunk_index, content').eq('document_id', DOCUMENT_ID).order('chunk_index').execute()
        chunks = chunks_response.data if chunks_response.data else []
        
        print(f'   📊 Total chunks available: {len(chunks)}')
        print(f'   📄 Chunk range: {chunks[0]["chunk_index"]} - {chunks[-1]["chunk_index"]}')

        # Test enhanced product creation
        print('\n4️⃣ Testing enhanced product creation...')
        print('   🔄 Calling create_products_from_chunks with NO LIMIT...')
        
        result = await product_service.create_products_from_chunks(
            document_id=DOCUMENT_ID,
            workspace_id=WORKSPACE_ID,
            max_products=None,  # ✅ NO LIMIT - process ALL chunks
            min_chunk_length=100
        )
        
        print(f'   ✅ Product creation completed: {result}')

        # Check new products created
        print('\n5️⃣ Checking newly created products:')
        
        # Wait a moment for database to update
        await asyncio.sleep(2)
        
        new_products_response = supabase_client.client.table('products').select('id, name, description, metadata, created_at').eq('source_document_id', DOCUMENT_ID).order('created_at').execute()
        new_products = new_products_response.data if new_products_response.data else []
        
        print(f'   📊 New products created: {len(new_products)}')
        
        # Analyze product quality
        print('\n6️⃣ Product Quality Analysis:')
        
        expected_products = ['FOLD', 'BEAT', 'VALENOVA', 'PIQUÉ', 'ONA', 'MARE', 'LOG', 'BOW', 'LINS', 'MAISON']
        found_products = []
        real_products = []
        fake_products = []

        for i, product in enumerate(new_products):
            print(f'\n   {i + 1}. {product["name"]}')
            print(f'      📝 Description: {product["description"][:100]}...')
            
            if product.get('metadata'):
                if product['metadata'].get('dimensions'):
                    print(f'      📏 Dimensions: {product["metadata"]["dimensions"]}')
                if product['metadata'].get('designer'):
                    print(f'      👨‍🎨 Designer: {product["metadata"]["designer"]}')
                if product['metadata'].get('colors'):
                    print(f'      🎨 Colors: {", ".join(product["metadata"]["colors"])}')
                if product['metadata'].get('material_type'):
                    print(f'      🧱 Material: {product["metadata"]["material_type"]}')

            # Check if this is a real product
            is_expected_product = any(expected in product['name'] or expected in product['description'] 
                                    for expected in expected_products)
            
            has_product_indicators = (
                (product.get('metadata', {}).get('dimensions') or '×' in product['description']) and
                (product.get('metadata', {}).get('designer') or 'designer' in product['description'].lower())
            )

            if is_expected_product or has_product_indicators:
                real_products.append(product['name'])
                if is_expected_product:
                    found_product = next((expected for expected in expected_products 
                                        if expected in product['name'] or expected in product['description']), None)
                    if found_product:
                        found_products.append(found_product)
                print(f'      ✅ REAL PRODUCT')
            else:
                fake_products.append(product['name'])
                print(f'      ❌ LIKELY NOT A REAL PRODUCT')

        # Final Results
        print('\n7️⃣ FINAL RESULTS:')
        print('=' * 60)
        print(f'📊 Total products created: {len(new_products)}')
        print(f'✅ Real products: {len(real_products)} ({round(len(real_products) / len(new_products) * 100) if new_products else 0}%)')
        print(f'❌ Fake products: {len(fake_products)} ({round(len(fake_products) / len(new_products) * 100) if new_products else 0}%)')
        print(f'🎯 Expected products found: {len(found_products)}/10 ({round(len(found_products) / 10 * 100)}%)')
        
        print('\n📋 Expected vs Found:')
        for expected in expected_products:
            found = expected in found_products
            print(f'   {"✅" if found else "❌"} {expected}: {"FOUND" if found else "NOT FOUND"}')

        if len(found_products) < 10:
            print('\n🔍 Missing products analysis:')
            missing = [p for p in expected_products if p not in found_products]
            print(f'   Missing: {", ".join(missing)}')
            print('   💡 These products may appear in later chunks that were previously skipped')

        # Performance comparison
        print('\n8️⃣ IMPROVEMENT ANALYSIS:')
        print('=' * 60)
        print('📈 Before Enhancement:')
        print('   - Products created: 10 (limited)')
        print('   - Real products: 5/10 (50%)')
        print('   - Expected products found: 5/10 (50%)')
        print('   - Issues: Index pages, sustainability content, technical tables')
        
        print('\n📈 After Enhancement:')
        print(f'   - Products created: {len(new_products)} (unlimited)')
        print(f'   - Real products: {len(real_products)}/{len(new_products)} ({round(len(real_products) / len(new_products) * 100) if new_products else 0}%)')
        print(f'   - Expected products found: {len(found_products)}/10 ({round(len(found_products) / 10 * 100)}%)')
        print('   - Improvements: Content filtering, pattern recognition, metadata extraction')

        improvement = len(found_products) - 5
        if improvement > 0:
            print(f'\n🎉 SUCCESS: Found {improvement} additional products!')
        elif improvement == 0:
            print(f'\n⚠️ SAME RESULT: Need further improvements')
        else:
            print(f'\n❌ REGRESSION: Lost {abs(improvement)} products')

    except Exception as error:
        print(f'❌ Test failed: {error}')
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    asyncio.run(test_enhanced_product_detection())
