#!/usr/bin/env python3
"""
Test Script: Python Chunk Type Classification Service

Tests the Python chunk type classification service that categorizes chunks into:
- product_description
- technical_specs  
- visual_showcase
- designer_story
- collection_overview
- supporting_content
- index_content
- sustainability_info
- certification_info
- unclassified
"""

import sys
import os
import asyncio
import logging

# Add the app directory to the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), 'mivaa-pdf-extractor', 'app'))

from services.chunk_type_classification_service import ChunkTypeClassificationService, ChunkType

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Test sample chunks with different types
test_chunks = [
    {
        'content': "VALENOVA is a sophisticated modular seating system available in multiple configurations. Features premium leather upholstery in black, brown, and natural finishes. Dimensions: 180×90×75 cm. Designed for modern living spaces.",
        'expected_type': ChunkType.PRODUCT_DESCRIPTION,
        'description': 'Product with name, materials, colors, and dimensions'
    },
    {
        'content': "Technical Specifications:\n• Material: High-grade aluminum alloy\n• Weight capacity: 150 kg\n• Dimensions: 200×100×80 mm\n• Resistance: IP65 rated\n• Compliance: ISO 9001 certified",
        'expected_type': ChunkType.TECHNICAL_SPECS,
        'description': 'Technical specifications with measurements and certifications'
    },
    {
        'content': "The visual showcase presents a stunning moodboard featuring warm earth tones and natural textures. See image gallery for detailed product photography showcasing the aesthetic appeal and finish quality.",
        'expected_type': ChunkType.VISUAL_SHOWCASE,
        'description': 'Visual content with image references and aesthetic descriptions'
    },
    {
        'content': "Designer Maria Santos from ESTUDI{H}AC brings her minimalist philosophy to this collection. Inspired by Scandinavian design principles and sustainable living, the creative process focused on functionality and timeless appeal.",
        'expected_type': ChunkType.DESIGNER_STORY,
        'description': 'Designer information with philosophy and inspiration'
    },
    {
        'content': "The HARMONY Collection presents 15 innovative products featuring contemporary design elements. This comprehensive line includes seating, tables, and storage solutions unified by clean lines and premium materials.",
        'expected_type': ChunkType.COLLECTION_OVERVIEW,
        'description': 'Collection overview with product count and theme'
    },
    {
        'content': "Table of Contents\n1. Introduction ........................... 3\n2. Product Overview ...................... 5\n3. Technical Specifications .............. 12\n4. Installation Guide .................... 18",
        'expected_type': ChunkType.INDEX_CONTENT,
        'description': 'Table of contents with page numbers'
    },
    {
        'content': "Our commitment to sustainability includes using 100% recycled materials, carbon-neutral manufacturing processes, and biodegradable packaging. All products are certified eco-friendly and support responsible sourcing.",
        'expected_type': ChunkType.SUSTAINABILITY_INFO,
        'description': 'Sustainability and environmental information'
    },
    {
        'content': "Quality Assurance: All products meet ISO 9001 standards and are CE marked for European compliance. Tested according to ANSI/BIFMA standards for commercial furniture applications.",
        'expected_type': ChunkType.CERTIFICATION_INFO,
        'description': 'Certification and compliance information'
    },
    {
        'content': "Welcome to our comprehensive catalog showcasing innovative design solutions for modern workspaces. This document provides detailed information about our product offerings and services.",
        'expected_type': ChunkType.SUPPORTING_CONTENT,
        'description': 'General supporting content'
    },
    {
        'content': "Short text",
        'expected_type': ChunkType.UNCLASSIFIED,
        'description': 'Very short content that should be unclassified'
    }
]

async def test_individual_classification():
    """Test individual chunk classification"""
    print('\n🧪 Testing Individual Chunk Classification...\n')
    
    try:
        classifier = ChunkTypeClassificationService()
        
        correct_predictions = 0
        total_predictions = len(test_chunks)
        
        for i, test_chunk in enumerate(test_chunks):
            print(f"\n{i + 1}. Testing: {test_chunk['description']}")
            print(f"   Content: \"{test_chunk['content'][:80]}...\"")
            print(f"   Expected: {test_chunk['expected_type'].value}")
            
            try:
                result = await classifier.classify_chunk(test_chunk['content'])
                
                is_correct = result.chunk_type == test_chunk['expected_type']
                status = '✅' if is_correct else '❌'
                
                if is_correct:
                    correct_predictions += 1
                
                print(f"   {status} Result: {result.chunk_type.value} (confidence: {result.confidence:.2f})")
                print(f"   Reasoning: {result.reasoning}")
                
                if result.metadata:
                    print(f"   Metadata: {result.metadata}")
                    
            except Exception as error:
                print(f"   ❌ Error: {error}")
        
        accuracy = (correct_predictions / total_predictions) * 100
        print(f"\n📊 Classification Accuracy: {correct_predictions}/{total_predictions} ({accuracy:.1f}%)")
        
        return accuracy >= 80  # 80% accuracy threshold
        
    except Exception as error:
        logger.error(f"❌ Error in individual classification test: {error}")
        return False

async def test_batch_classification():
    """Test batch chunk classification"""
    print('\n🧪 Testing Batch Chunk Classification...\n')
    
    try:
        classifier = ChunkTypeClassificationService()
        
        # Prepare batch data
        batch_chunks = [
            {'id': f'test_chunk_{i}', 'content': chunk['content']}
            for i, chunk in enumerate(test_chunks)
        ]
        
        print(f"📦 Processing batch of {len(batch_chunks)} chunks...")
        
        results = await classifier.classify_chunks_batch(batch_chunks)
        
        if len(results) != len(test_chunks):
            print(f"❌ Expected {len(test_chunks)} results, got {len(results)}")
            return False
        
        correct_predictions = 0
        
        for i, (result, expected) in enumerate(zip(results, test_chunks)):
            is_correct = result.chunk_type == expected['expected_type']
            status = '✅' if is_correct else '❌'
            
            if is_correct:
                correct_predictions += 1
            
            print(f"   {i + 1}. {status} {result.chunk_type.value} (confidence: {result.confidence:.2f})")
        
        accuracy = (correct_predictions / len(test_chunks)) * 100
        print(f"\n📊 Batch Classification Accuracy: {correct_predictions}/{len(test_chunks)} ({accuracy:.1f}%)")
        
        return accuracy >= 80  # 80% accuracy threshold
        
    except Exception as error:
        logger.error(f"❌ Error in batch classification test: {error}")
        return False

async def test_metadata_extraction():
    """Test metadata extraction for different chunk types"""
    print('\n🧪 Testing Metadata Extraction...\n')
    
    try:
        classifier = ChunkTypeClassificationService()
        
        # Test specific chunks that should have rich metadata
        metadata_test_chunks = [
            {
                'content': "VALENOVA modular seating system. Available in black leather, brown fabric, and natural wood finishes. Dimensions: 180×90×75 cm. Designer: Maria Santos Studio.",
                'expected_metadata_keys': ['productName', 'dimensions', 'materials', 'colors']
            },
            {
                'content': "Technical Specifications:\n• Material: Aluminum alloy\n• Weight: 15 kg\n• Dimensions: 200×100×80 mm\n• Temperature range: -20°C to 60°C",
                'expected_metadata_keys': ['specifications', 'measurements']
            },
            {
                'content': "Designer John Smith from Creative Studio brings his minimalist philosophy to this collection. Inspired by Japanese design principles and natural materials.",
                'expected_metadata_keys': ['designerName', 'studioName', 'designPhilosophy', 'inspirationSources']
            }
        ]
        
        metadata_tests_passed = 0
        
        for i, test_chunk in enumerate(metadata_test_chunks):
            print(f"\n{i + 1}. Testing metadata extraction:")
            print(f"   Content: \"{test_chunk['content'][:60]}...\"")
            
            result = await classifier.classify_chunk(test_chunk['content'])
            
            print(f"   Type: {result.chunk_type.value}")
            print(f"   Metadata: {result.metadata}")
            
            # Check if expected metadata keys are present
            found_keys = [key for key in test_chunk['expected_metadata_keys'] if key in result.metadata]
            
            if found_keys:
                print(f"   ✅ Found expected metadata keys: {found_keys}")
                metadata_tests_passed += 1
            else:
                print(f"   ❌ Missing expected metadata keys: {test_chunk['expected_metadata_keys']}")
        
        success_rate = (metadata_tests_passed / len(metadata_test_chunks)) * 100
        print(f"\n📊 Metadata Extraction Success Rate: {metadata_tests_passed}/{len(metadata_test_chunks)} ({success_rate:.1f}%)")
        
        return success_rate >= 60  # 60% success rate threshold for metadata
        
    except Exception as error:
        logger.error(f"❌ Error in metadata extraction test: {error}")
        return False

async def main():
    """Main test execution"""
    print('🎯 Python Chunk Type Classification Service Test')
    print('=================================================')
    
    try:
        # Test 1: Individual classification
        test1_passed = await test_individual_classification()
        
        # Test 2: Batch classification
        test2_passed = await test_batch_classification()
        
        # Test 3: Metadata extraction
        test3_passed = await test_metadata_extraction()
        
        # Summary
        print('\n📋 Test Summary:')
        print(f'   Individual Classification: {"✅ PASSED" if test1_passed else "❌ FAILED"}')
        print(f'   Batch Classification: {"✅ PASSED" if test2_passed else "❌ FAILED"}')
        print(f'   Metadata Extraction: {"✅ PASSED" if test3_passed else "❌ FAILED"}')
        
        all_tests_passed = test1_passed and test2_passed and test3_passed
        
        if all_tests_passed:
            print('\n✅ All tests PASSED! Chunk type classification service is working correctly.')
        else:
            print('\n❌ Some tests FAILED. Please review the implementation.')
        
        return all_tests_passed
        
    except Exception as error:
        logger.error(f'❌ Test execution failed: {error}')
        return False

if __name__ == '__main__':
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
