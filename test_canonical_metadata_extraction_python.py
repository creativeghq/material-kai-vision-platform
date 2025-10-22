"""
Test Canonical Metadata Extraction (Python)

Tests the canonical metadata schema service with sample product content
to validate extraction accuracy and schema organization.
"""

import asyncio
import sys
import os

# Add the mivaa-pdf-extractor app to the path
sys.path.append(os.path.join(os.path.dirname(__file__), 'mivaa-pdf-extractor', 'app'))

from services.canonical_metadata_schema_service import CanonicalMetadataSchemaService, MetadataExtractionOptions

# Sample product content for testing
SAMPLE_PRODUCT_CONTENT = """
VALENOVA Collection
Manufacturer: HARMONY CERAMICS
Brand: HARMONY
Designer: ESTUDI{H}AC
Product Code: VAL-001
Year: 2024

Material: Porcelain Stoneware
Dimensions: 15×38 cm
Thickness: 8.5 mm
Weight: 1.2 kg/m²

Colors: White, Beige, Grey, Charcoal
Surface Finish: Matte
Surface Treatment: Rectified
Pattern: Linear veining

Water Absorption: <0.5% (Group BIa)
Slip Resistance: R10
PEI Rating: PEI-4
Frost Resistance: Yes
Chemical Resistance: Excellent

Application: Indoor/Outdoor
Usage: Residential, Commercial
Environment: Bathroom, Kitchen, Living areas

Price Range: Premium
Warranty: 10 years
Certifications: ISO 13006, CE marking

Installation: Adhesive method
Joint Width: 2-3 mm
Maintenance: Low maintenance
Cleaning: Mild detergent

Sustainability: High
Recycled Content: 15%
VOC Level: Low
Energy Efficiency: A+
"""

async def test_canonical_metadata_extraction():
    """Test canonical metadata extraction functionality"""
    print('🧪 Canonical Metadata Extraction Test (Python)')
    print('==============================================\n')

    try:
        # Initialize service
        service = CanonicalMetadataSchemaService()

        # Test 1: Basic metadata extraction
        print('📊 Test 1: Basic Metadata Extraction')
        print('------------------------------------')
        
        options = MetadataExtractionOptions(
            confidence_threshold=0.6,
            extraction_method='ai_extraction',
            validate_required=True
        )
        
        extraction_result = await service.extract_canonical_metadata(
            SAMPLE_PRODUCT_CONTENT,
            product_id=None,  # No product ID for testing
            options=options
        )

        print(f"✅ Extraction completed in {extraction_result.processing_time:.0f}ms")
        print(f"📈 Confidence: {extraction_result.confidence * 100:.1f}%")
        print(f"📊 Fields extracted: {extraction_result.extracted_fields}/{extraction_result.total_fields}")
        print('')

        # Test 2: Schema organization validation
        print('📊 Test 2: Schema Organization Validation')
        print('----------------------------------------')
        
        metadata = extraction_result.metadata
        categories = list(metadata.keys())
        
        print(f"📂 Categories found: {len(categories)}")
        for category in categories:
            fields = list(metadata.get(category, {}).keys())
            print(f"  - {category}: {len(fields)} fields")
            if fields:
                field_preview = ', '.join(fields[:3])
                if len(fields) > 3:
                    field_preview += '...'
                print(f"    Fields: {field_preview}")
        print('')

        # Test 3: Critical fields validation
        print('📊 Test 3: Critical Fields Validation')
        print('------------------------------------')
        
        critical_fields = {
            'core_identity': ['manufacturer', 'brand', 'collection'],
            'physical_properties': ['materialCategory', 'length', 'width'],
            'visual_properties': ['primaryColor', 'surfaceFinish'],
            'technical_specifications': ['waterAbsorption', 'slipResistance'],
            'commercial_information': ['applicationArea', 'priceRange'],
        }

        critical_fields_found = 0
        total_critical_fields = 0

        for category, fields in critical_fields.items():
            category_data = metadata.get(category, {})
            for field in fields:
                total_critical_fields += 1
                if category_data.get(field):
                    critical_fields_found += 1
                    print(f"  ✅ {category}.{field}: {category_data[field]}")
                else:
                    print(f"  ❌ {category}.{field}: Missing")

        critical_fields_score = (critical_fields_found / total_critical_fields * 100) if total_critical_fields > 0 else 0
        print(f"📊 Critical fields score: {critical_fields_score:.1f}% ({critical_fields_found}/{total_critical_fields})")
        print('')

        # Test 4: Metadata completeness validation
        print('📊 Test 4: Metadata Completeness Validation')
        print('------------------------------------------')
        
        completeness_result = service.validate_metadata_completeness(metadata)
        
        print(f"📈 Completion score: {completeness_result['completion_score'] * 100:.1f}%")
        print(f"✅ Is complete: {completeness_result['is_complete']}")
        
        if completeness_result['missing_critical_fields']:
            print('❌ Missing critical fields:')
            for field in completeness_result['missing_critical_fields']:
                print(f"  - {field}")
        
        if completeness_result['recommendations']:
            print('💡 Recommendations:')
            for rec in completeness_result['recommendations']:
                print(f"  - {rec}")
        print('')

        # Test 5: Schema statistics
        print('📊 Test 5: Schema Statistics')
        print('---------------------------')
        
        schema_stats = service.get_schema_statistics()
        
        print(f"📂 Total categories: {schema_stats['total_categories']}")
        print(f"📊 Total fields: {schema_stats['total_fields']}")
        print('📈 Fields by category:')
        for category, count in schema_stats['fields_by_category'].items():
            print(f"  - {category}: {count} fields")
        print(f"🎯 Critical fields: {', '.join(schema_stats['critical_fields'])}")
        print('')

        # Test 6: Category-specific extraction
        print('📊 Test 6: Category-Specific Extraction')
        print('--------------------------------------')
        
        limited_options = MetadataExtractionOptions(
            include_categories=['core_identity', 'physical_properties'],
            confidence_threshold=0.6
        )
        
        limited_result = await service.extract_canonical_metadata(
            SAMPLE_PRODUCT_CONTENT,
            product_id=None,
            options=limited_options
        )

        limited_categories = list(limited_result.metadata.keys())
        print(f"📂 Limited extraction categories: {', '.join(limited_categories)}")
        print(f"📊 Limited extraction fields: {limited_result.extracted_fields}")
        print('')

        # Summary
        print('🎯 Test Results Summary')
        print('======================')
        print(f"✅ Basic extraction: {'PASS' if extraction_result.confidence >= 0.6 else 'FAIL'}")
        print(f"✅ Schema organization: {'PASS' if len(categories) >= 4 else 'FAIL'}")
        print(f"✅ Critical fields: {'PASS' if critical_fields_found >= total_critical_fields * 0.6 else 'FAIL'}")
        print(f"✅ Completeness validation: {'PASS' if completeness_result['completion_score'] >= 0.6 else 'FAIL'}")
        print(f"✅ Schema statistics: {'PASS' if schema_stats['total_fields'] > 100 else 'FAIL'}")
        print(f"✅ Category-specific extraction: {'PASS' if len(limited_categories) <= 2 else 'FAIL'}")
        
        all_tests_passed = (
            extraction_result.confidence >= 0.6 and
            len(categories) >= 4 and
            critical_fields_found >= total_critical_fields * 0.6 and
            completeness_result['completion_score'] >= 0.6 and
            schema_stats['total_fields'] > 100 and
            len(limited_categories) <= 2
        )

        print('')
        print(f"🏆 Overall Result: {'✅ ALL TESTS PASSED' if all_tests_passed else '❌ SOME TESTS FAILED'}")
        
        if all_tests_passed:
            print('🎉 Canonical metadata extraction is working correctly!')
            print('📋 The system successfully organizes 120+ metadata fields into logical categories')
            print('🔍 AI extraction provides comprehensive product metadata with high confidence')
            print('✨ Ready for production use with PDF processing workflow')

    except Exception as error:
        print(f'❌ Test failed: {error}')
        print('')
        print('🔧 Troubleshooting:')
        print('- Ensure Supabase connection is working')
        print('- Check that material_metadata_fields table exists')
        print('- Verify AI service configuration')
        print('- Test with simpler content first')
        print(f'- Error details: {str(error)}')

async def test_field_mappings():
    """Test field mappings and schema structure"""
    print('\n🔧 Testing Field Mappings')
    print('========================')
    
    service = CanonicalMetadataSchemaService()
    
    # Test field mappings
    total_mappings = len(service.FIELD_MAPPINGS)
    print(f"📊 Total field mappings: {total_mappings}")
    
    # Count mappings by category
    category_counts = {}
    for field, category in service.FIELD_MAPPINGS.items():
        category_counts[category] = category_counts.get(category, 0) + 1
    
    print('📈 Mappings by category:')
    for category, count in sorted(category_counts.items()):
        print(f"  - {category}: {count} fields")
    
    # Test critical field coverage
    critical_fields = ['manufacturer', 'brand', 'collection', 'materialCategory', 'primaryColor', 'applicationArea']
    mapped_critical = [field for field in critical_fields if field in service.FIELD_MAPPINGS]
    
    print(f"🎯 Critical fields mapped: {len(mapped_critical)}/{len(critical_fields)}")
    for field in critical_fields:
        if field in service.FIELD_MAPPINGS:
            print(f"  ✅ {field} → {service.FIELD_MAPPINGS[field]}")
        else:
            print(f"  ❌ {field} → Not mapped")

if __name__ == '__main__':
    # Run the tests
    asyncio.run(test_canonical_metadata_extraction())
    asyncio.run(test_field_mappings())
