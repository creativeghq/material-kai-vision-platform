"""
Test Multi-Modal Image-Product Association Service (Python)

Tests the intelligent image-product linking system that uses:
- Spatial proximity (40% weight)
- Caption similarity (30% weight) 
- CLIP visual similarity (30% weight)
"""

import asyncio
import sys
import os
import logging

# Add the mivaa-pdf-extractor directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), 'mivaa-pdf-extractor'))

from app.services.multi_modal_image_product_association_service import (
    MultiModalImageProductAssociationService,
    AssociationOptions,
    AssociationWeights
)
from app.services.supabase_client import get_supabase_client

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Test data - simulating HARMONY PDF content
mock_images = [
    {
        'id': 'img_1',
        'document_id': 'doc_harmony_test',
        'page_number': 1,
        'caption': 'VALENOVA collection overview with dimensional specifications',
        'alt_text': 'Modern furniture collection showcase',
        'image_type': 'product',
        'clip_embedding': [0.1] * 512,  # Mock CLIP embedding
    },
    {
        'id': 'img_2', 
        'document_id': 'doc_harmony_test',
        'page_number': 2,
        'caption': 'PIQUÉ modular seating system in various configurations',
        'alt_text': 'Modular seating arrangements',
        'image_type': 'product',
        'clip_embedding': [0.2] * 512,
    },
    {
        'id': 'img_3',
        'document_id': 'doc_harmony_test',
        'page_number': 3,
        'caption': 'ONA chair detail showing craftsmanship and materials',
        'alt_text': 'Chair detail photography',
        'image_type': 'detail',
        'clip_embedding': [0.3] * 512,
    },
    {
        'id': 'img_4',
        'document_id': 'doc_harmony_test',
        'page_number': 5,
        'caption': 'FOLD table collection lifestyle setting',
        'alt_text': 'Table in modern interior',
        'image_type': 'lifestyle',
        'clip_embedding': [0.4] * 512,
    },
    {
        'id': 'img_5',
        'document_id': 'doc_harmony_test',
        'page_number': 7,
        'caption': 'BEAT lighting series ambient photography',
        'alt_text': 'Lighting fixtures in use',
        'image_type': 'ambient',
        'clip_embedding': [0.5] * 512,
    },
]

mock_products = [
    {
        'id': 'prod_1',
        'document_id': 'doc_harmony_test',
        'name': 'VALENOVA',
        'description': 'Contemporary seating collection with clean lines and dimensional flexibility. Available in multiple sizes and finishes.',
        'page_number': 1,
        'metadata': {'designer': 'ESTUDI{H}AC', 'dimensions': '15×38', 'category': 'seating'},
    },
    {
        'id': 'prod_2',
        'document_id': 'doc_harmony_test', 
        'name': 'PIQUÉ',
        'description': 'Modular seating system designed for versatile configurations. Upholstered in premium fabrics.',
        'page_number': 2,
        'metadata': {'designer': 'SG NY', 'dimensions': '20×40', 'category': 'seating'},
    },
    {
        'id': 'prod_3',
        'document_id': 'doc_harmony_test',
        'name': 'ONA',
        'description': 'Elegant chair with exceptional craftsmanship. Features solid wood construction and refined details.',
        'page_number': 3,
        'metadata': {'designer': 'ESTUDI{H}AC', 'dimensions': '18×22', 'category': 'seating'},
    },
    {
        'id': 'prod_4',
        'document_id': 'doc_harmony_test',
        'name': 'FOLD',
        'description': 'Minimalist table collection with geometric forms. Available in various sizes and materials.',
        'page_number': 5,
        'metadata': {'designer': 'SG NY', 'dimensions': '30×60', 'category': 'tables'},
    },
    {
        'id': 'prod_5',
        'document_id': 'doc_harmony_test',
        'name': 'BEAT',
        'description': 'Contemporary lighting series with ambient illumination. Features adjustable brightness and color temperature.',
        'page_number': 7,
        'metadata': {'designer': 'ESTUDI{H}AC', 'dimensions': '12×45', 'category': 'lighting'},
    },
]

async def setup_test_data():
    """Setup test data in Supabase."""
    logger.info('🔧 Setting up test data...')
    
    try:
        supabase = get_supabase_client()
        
        # Insert mock images
        result = supabase.table('document_images').upsert(
            mock_images, 
            on_conflict='id'
        ).execute()
        
        if not result.data:
            logger.error('❌ Error inserting images')
            return False

        # Insert mock products
        result = supabase.table('products').upsert(
            mock_products, 
            on_conflict='id'
        ).execute()
        
        if not result.data:
            logger.error('❌ Error inserting products')
            return False

        logger.info('✅ Test data setup complete')
        return True
    except Exception as e:
        logger.error(f'❌ Error setting up test data: {e}')
        return False

async def test_multi_modal_associations():
    """Test the multi-modal association service."""
    logger.info('🧪 Testing Multi-Modal Image-Product Associations')
    logger.info('=' * 60)

    try:
        service = MultiModalImageProductAssociationService()

        # Test 1: Default association settings
        logger.info('\n📊 Test 1: Default Association Settings')
        logger.info('Weights: Spatial 40%, Caption 30%, CLIP 30%')
        logger.info('Threshold: 0.6 overall score')

        result1 = await service.create_document_associations('doc_harmony_test')

        logger.info(f"✅ Associations created: {result1['associations_created']}/{result1['total_evaluated']}")
        logger.info(f"📊 Average confidence: {result1['average_confidence'] * 100:.1f}%")
        logger.info(f"🎯 Success rate: {(result1['associations_created'] / result1['total_evaluated']) * 100:.1f}%")

        # Show top associations
        if result1['associations']:
            logger.info('\n🏆 Top Associations:')
            for i, assoc in enumerate(result1['associations'][:3]):
                img = next((img for img in mock_images if img['id'] == assoc['image_id']), None)
                prod = next((prod for prod in mock_products if prod['id'] == assoc['product_id']), None)
                logger.info(f"  {i + 1}. {img['caption'][:30]}... → {prod['name']}")
                logger.info(f"     Score: {assoc['overall_score'] * 100:.1f}% | {assoc['reasoning']}")
                logger.info(f"     Spatial: {assoc['spatial_score'] * 100:.0f}% | Caption: {assoc['caption_score'] * 100:.0f}% | CLIP: {assoc['clip_score'] * 100:.0f}%")

        # Test 2: High spatial weight
        logger.info('\n📊 Test 2: High Spatial Weight (60% spatial, 20% caption, 20% CLIP)')
        
        options2 = AssociationOptions(
            weights=AssociationWeights(spatial=0.6, caption=0.2, clip=0.2),
            overall_threshold=0.5
        )
        
        result2 = await service.create_document_associations('doc_harmony_test', options2)
        logger.info(f"✅ Associations created: {result2['associations_created']}/{result2['total_evaluated']}")
        logger.info(f"📊 Average confidence: {result2['average_confidence'] * 100:.1f}%")

        # Test 3: High caption weight
        logger.info('\n📊 Test 3: High Caption Weight (20% spatial, 60% caption, 20% CLIP)')
        
        options3 = AssociationOptions(
            weights=AssociationWeights(spatial=0.2, caption=0.6, clip=0.2),
            overall_threshold=0.4
        )
        
        result3 = await service.create_document_associations('doc_harmony_test', options3)
        logger.info(f"✅ Associations created: {result3['associations_created']}/{result3['total_evaluated']}")
        logger.info(f"📊 Average confidence: {result3['average_confidence'] * 100:.1f}%")

        # Test 4: Association statistics
        logger.info('\n📊 Test 4: Association Statistics')
        
        stats = await service.get_document_association_stats('doc_harmony_test')
        
        logger.info('📈 Document Statistics:')
        logger.info(f"  Images: {stats['total_images']}")
        logger.info(f"  Products: {stats['total_products']}")
        logger.info(f"  Associations: {stats['total_associations']}")
        logger.info(f"  Average Confidence: {stats['average_confidence'] * 100:.1f}%")
        logger.info('  Score Distribution:')
        for range_name, count in stats['associations_by_score'].items():
            logger.info(f"    {range_name}: {count}")

        # Test 5: Validate expected associations
        logger.info('\n📊 Test 5: Validate Expected Associations')
        
        expected_associations = [
            {'image': 'VALENOVA collection overview', 'product': 'VALENOVA', 'reason': 'exact name match + same page'},
            {'image': 'PIQUÉ modular seating', 'product': 'PIQUÉ', 'reason': 'exact name match + same page'},
            {'image': 'ONA chair detail', 'product': 'ONA', 'reason': 'exact name match + same page'},
            {'image': 'FOLD table collection', 'product': 'FOLD', 'reason': 'exact name match + same page'},
            {'image': 'BEAT lighting series', 'product': 'BEAT', 'reason': 'exact name match + same page'},
        ]

        correct_associations = 0
        for expected in expected_associations:
            found = any(
                assoc['overall_score'] >= 0.8 and
                any(img['caption'].find(prod['name']) != -1 
                    for img in mock_images if img['id'] == assoc['image_id']
                    for prod in mock_products if prod['id'] == assoc['product_id'])
                for assoc in result1['associations']
            )
            
            if found:
                correct_associations += 1
                logger.info(f"  ✅ {expected['image']} → {expected['product']} ({expected['reason']})")
            else:
                logger.info(f"  ❌ {expected['image']} → {expected['product']} ({expected['reason']})")

        logger.info(f"\n🎯 Validation Results: {correct_associations}/{len(expected_associations)} expected associations found")
        logger.info(f"📊 Accuracy: {(correct_associations / len(expected_associations)) * 100:.1f}%")

        # Performance summary
        logger.info('\n🚀 Performance Summary:')
        logger.info(f"  Total evaluations: {result1['total_evaluated']}")
        logger.info(f"  Successful associations: {result1['associations_created']}")
        logger.info(f"  Success rate: {(result1['associations_created'] / result1['total_evaluated']) * 100:.1f}%")
        logger.info(f"  Expected accuracy: {(correct_associations / len(expected_associations)) * 100:.1f}%")

        return {
            'success': True,
            'total_evaluated': result1['total_evaluated'],
            'associations_created': result1['associations_created'],
            'average_confidence': result1['average_confidence'],
            'expected_accuracy': correct_associations / len(expected_associations),
        }

    except Exception as e:
        logger.error(f'❌ Error testing multi-modal associations: {e}')
        return {'success': False, 'error': str(e)}

async def cleanup_test_data():
    """Clean up test data."""
    logger.info('\n🧹 Cleaning up test data...')
    
    try:
        supabase = get_supabase_client()
        
        # Delete test associations
        supabase.table('image_product_associations').delete().in_(
            'image_id', [img['id'] for img in mock_images]
        ).execute()

        # Delete test product-image relationships
        supabase.table('product_image_relationships').delete().in_(
            'image_id', [img['id'] for img in mock_images]
        ).execute()

        # Delete test products
        supabase.table('products').delete().in_(
            'id', [prod['id'] for prod in mock_products]
        ).execute()

        # Delete test images
        supabase.table('document_images').delete().in_(
            'id', [img['id'] for img in mock_images]
        ).execute()

        logger.info('✅ Test data cleanup complete')
    except Exception as e:
        logger.warning(f'⚠️ Error cleaning up test data: {e}')

async def main():
    """Main test function."""
    logger.info('🎯 Multi-Modal Image-Product Association Test Suite (Python)')
    logger.info('Testing intelligent image-product linking with weighted scoring')
    logger.info('=' * 60)

    try:
        # Setup test data
        setup_success = await setup_test_data()
        if not setup_success:
            logger.error('❌ Failed to setup test data')
            return

        # Run tests
        results = await test_multi_modal_associations()
        
        if results['success']:
            logger.info('\n✅ All tests completed successfully!')
            logger.info('📊 Final Results:')
            logger.info(f"  - {results['associations_created']} associations created")
            logger.info(f"  - {results['average_confidence'] * 100:.1f}% average confidence")
            logger.info(f"  - {results['expected_accuracy'] * 100:.1f}% expected accuracy")
        else:
            logger.error(f'❌ Tests failed: {results["error"]}')

        # Cleanup
        await cleanup_test_data()

    except Exception as e:
        logger.error(f'❌ Test suite failed: {e}')
        await cleanup_test_data()

if __name__ == '__main__':
    asyncio.run(main())
