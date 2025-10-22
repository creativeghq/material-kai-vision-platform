#!/usr/bin/env python3

"""
Test Two-Stage Product Classification System

Tests the new two-stage classification system:
- Stage 1: Fast classification with Claude Haiku
- Stage 2: Deep enrichment with Claude Sonnet

Validates performance improvements and accuracy.
"""

import requests
import time
import json
from supabase import create_client, Client

# Configuration
SUPABASE_URL = "https://bgbavxtjlbvgplozizxu.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjY1NzU5NzQsImV4cCI6MjA0MjE1MTk3NH0.Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8"

HARMONY_DOCUMENT_ID = "69cba085-9c2d-405c-aff2-8a20caf0b568"
WORKSPACE_ID = "ffafc28b-1b8b-4b0d-b226-9f9a6154004e"
MIVAA_API_URL = "https://v1api.materialshub.gr"

def test_two_stage_classification():
    """Test the two-stage product classification system."""
    print("🧪 Testing Two-Stage Product Classification System")
    print("=" * 60)
    
    try:
        # Initialize Supabase client
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        
        # Step 1: Clear existing products for clean test
        print("\n📋 Step 1: Clearing existing products...")
        existing_products = supabase.table('products').select('id, name').eq('source_document_id', HARMONY_DOCUMENT_ID).execute()
        
        if existing_products.data:
            print(f"🗑️ Found {len(existing_products.data)} existing products, deleting...")
            supabase.table('products').delete().eq('source_document_id', HARMONY_DOCUMENT_ID).execute()
            print("✅ Existing products cleared")
        else:
            print("✅ No existing products found")
        
        # Step 2: Get baseline metrics
        print("\n📊 Step 2: Getting baseline metrics...")
        chunks = supabase.table('document_chunks').select('id, chunk_index, content').eq('document_id', HARMONY_DOCUMENT_ID).order('chunk_index').execute()
        
        print(f"📦 Found {len(chunks.data)} chunks to process")
        
        # Analyze chunk types
        chunk_analysis = analyze_chunk_types(chunks.data)
        print("📋 Chunk Analysis:")
        print(f"   - Total chunks: {len(chunks.data)}")
        print(f"   - Index/TOC chunks: {chunk_analysis['index']}")
        print(f"   - Sustainability chunks: {chunk_analysis['sustainability']}")
        print(f"   - Product-like chunks: {chunk_analysis['product_like']}")
        print(f"   - Other chunks: {chunk_analysis['other']}")
        
        # Step 3: Test two-stage classification
        print("\n🚀 Step 3: Testing two-stage classification...")
        start_time = time.time()
        
        # Call the MIVAA service
        response = requests.post(
            f"{MIVAA_API_URL}/api/products/create-from-chunks",
            json={
                "document_id": HARMONY_DOCUMENT_ID,
                "workspace_id": WORKSPACE_ID,
                "max_products": None,  # No limit
                "min_chunk_length": 100
            },
            timeout=300  # 5 minutes timeout
        )
        
        if response.status_code != 200:
            print(f"❌ API call failed: {response.status_code}")
            print(f"Error: {response.text}")
            return
        
        result = response.json()
        total_time = time.time() - start_time
        
        print("\n🎉 Two-Stage Classification Results:")
        print("=" * 50)
        print(f"✅ Success: {result.get('success', False)}")
        print(f"📊 Products created: {result.get('products_created', 0)}")
        print(f"❌ Products failed: {result.get('products_failed', 0)}")
        print(f"📦 Chunks processed: {result.get('chunks_processed', 0)}")
        print(f"📋 Total chunks: {result.get('total_chunks', 0)}")
        print(f"🎯 Stage 1 candidates: {result.get('stage1_candidates', 0)}")
        
        if 'stage1_time' in result:
            print(f"⚡ Stage 1 time (Haiku): {result['stage1_time']:.2f}s")
        if 'stage2_time' in result:
            print(f"🎯 Stage 2 time (Sonnet): {result['stage2_time']:.2f}s")
        if 'total_time' in result:
            print(f"⏱️ Total AI time: {result['total_time']:.2f}s")
        print(f"🕐 Total request time: {total_time:.2f}s")
        
        # Step 4: Analyze created products
        print("\n📋 Step 4: Analyzing created products...")
        new_products = supabase.table('products').select('id, name, description, metadata, properties').eq('source_document_id', HARMONY_DOCUMENT_ID).order('created_at').execute()
        
        print(f"\n🎯 Created Products ({len(new_products.data)}):")
        print("-" * 40)
        
        enriched_products = 0
        expected_products = 0
        expected_names = ['FOLD', 'BEAT', 'VALENOVA', 'PIQUÉ', 'ONA', 'MARE', 'LOG', 'BOW', 'LINS', 'MAISON']
        
        for i, product in enumerate(new_products.data):
            print(f"{i + 1}. {product['name']}")
            
            # Check if it's an enriched product
            metadata = product.get('metadata', {})
            is_enriched = metadata.get('extracted_from') == 'two_stage_classification'
            
            if is_enriched:
                enriched_products += 1
                print(f"   🎯 Enriched by two-stage system")
                print(f"   📊 Confidence: {metadata.get('classification_confidence', 'N/A')}")
                print(f"   🏆 Quality: {metadata.get('quality_assessment', 'N/A')}")
                
                if metadata.get('designer'):
                    print(f"   👨‍🎨 Designer: {metadata['designer']}")
                if metadata.get('dimensions'):
                    print(f"   📏 Dimensions: {metadata['dimensions']}")
                if metadata.get('colors'):
                    print(f"   🎨 Colors: {metadata['colors']}")
            
            # Check if it's an expected product
            is_expected = any(name in product['name'].upper() or product['name'].upper() in name for name in expected_names)
            if is_expected:
                expected_products += 1
                print(f"   ✅ Expected product found!")
            
            print(f"   📝 Description: {product['description'][:100]}...")
            print()
        
        # Step 5: Performance analysis
        print("\n📊 Performance Analysis:")
        print("=" * 50)
        
        eligible_chunks = result.get('eligible_chunks', len(chunks.data))
        stage1_candidates = result.get('stage1_candidates', 0)
        products_created = result.get('products_created', 0)
        
        if eligible_chunks > 0:
            stage1_efficiency = stage1_candidates / eligible_chunks
            print(f"🚀 Stage 1 Efficiency: {stage1_efficiency * 100:.1f}% ({stage1_candidates}/{eligible_chunks} candidates)")
        
        if stage1_candidates > 0:
            stage2_success = products_created / stage1_candidates
            print(f"🎯 Stage 2 Success Rate: {stage2_success * 100:.1f}% ({products_created}/{stage1_candidates} products)")
        
        if len(new_products.data) > 0:
            enrichment_rate = enriched_products / len(new_products.data)
            print(f"🏆 Enriched Products: {enriched_products}/{len(new_products.data)} ({enrichment_rate * 100:.1f}%)")
        
        print(f"✅ Expected Products Found: {expected_products}/10 ({expected_products / 10 * 100:.1f}%)")
        
        # Performance metrics
        if 'total_time' in result and eligible_chunks > 0:
            avg_time_per_chunk = result['total_time'] / eligible_chunks
            print(f"⚡ Avg time per chunk: {avg_time_per_chunk * 1000:.0f}ms")
        
        if 'total_time' in result and products_created > 0:
            avg_time_per_product = result['total_time'] / products_created
            print(f"⚡ Avg time per product: {avg_time_per_product:.2f}s")
        
        # Step 6: Quality assessment
        print("\n🏆 Quality Assessment:")
        print("=" * 50)
        
        quality_score = calculate_quality_score({
            'expected_products_found': expected_products,
            'total_expected_products': 10,
            'enriched_products': enriched_products,
            'total_products': len(new_products.data),
            'stage1_efficiency': stage1_efficiency if eligible_chunks > 0 else 0,
            'stage2_success': stage2_success if stage1_candidates > 0 else 0
        })
        
        print(f"📊 Overall Quality Score: {quality_score:.1f}/100")
        
        if quality_score >= 90:
            print("🏆 EXCELLENT: Two-stage system performing exceptionally well!")
        elif quality_score >= 75:
            print("✅ GOOD: Two-stage system working well with room for improvement")
        elif quality_score >= 60:
            print("⚠️ FAIR: Two-stage system needs optimization")
        else:
            print("❌ POOR: Two-stage system requires significant improvements")
        
        print("\n🎉 Two-Stage Classification Test Complete!")
        
    except Exception as e:
        print(f"❌ Test failed: {str(e)}")
        import traceback
        traceback.print_exc()

def analyze_chunk_types(chunks):
    """Analyze chunk content types."""
    analysis = {
        'index': 0,
        'sustainability': 0,
        'product_like': 0,
        'other': 0
    }
    
    for chunk in chunks:
        content = chunk['content'].lower()
        
        if any(keyword in content for keyword in ['index', 'table of contents', 'signature book']):
            analysis['index'] += 1
        elif any(keyword in content for keyword in ['sustainability', 'environmental', 'sostenibilidad']):
            analysis['sustainability'] += 1
        elif has_product_indicators(content):
            analysis['product_like'] += 1
        else:
            analysis['other'] += 1
    
    return analysis

def has_product_indicators(content):
    """Check if content has product indicators."""
    import re
    
    has_uppercase = bool(re.search(r'\b[A-Z]{3,}\b', content))
    has_dimensions = bool(re.search(r'\d+[×x]\d+|cm|mm', content))
    has_designer = bool(re.search(r'designer|by |estudi|dsignio|yonoh|stacy garcia', content, re.IGNORECASE))
    
    return (has_uppercase and has_dimensions) or (has_uppercase and has_designer)

def calculate_quality_score(metrics):
    """Calculate overall quality score."""
    expected_products_score = (metrics['expected_products_found'] / metrics['total_expected_products']) * 40
    enrichment_score = (metrics['enriched_products'] / max(metrics['total_products'], 1)) * 25
    efficiency_score = metrics['stage1_efficiency'] * 20
    success_score = metrics['stage2_success'] * 15
    
    return expected_products_score + enrichment_score + efficiency_score + success_score

if __name__ == '__main__':
    test_two_stage_classification()
