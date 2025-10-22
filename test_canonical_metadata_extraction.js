/**
 * Test Canonical Metadata Extraction
 * 
 * Tests the canonical metadata schema service with sample product content
 * to validate extraction accuracy and schema organization.
 */

import { CanonicalMetadataSchemaService } from './src/services/canonicalMetadataSchemaService.js';

// Sample product content for testing
const sampleProductContent = `
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
`;

async function testCanonicalMetadataExtraction() {
  console.log('🧪 Canonical Metadata Extraction Test');
  console.log('=====================================\n');

  try {
    // Test 1: Basic metadata extraction
    console.log('📊 Test 1: Basic Metadata Extraction');
    console.log('------------------------------------');
    
    const extractionResult = await CanonicalMetadataSchemaService.extractCanonicalMetadata(
      sampleProductContent,
      undefined, // No product ID for testing
      {
        confidenceThreshold: 0.6,
        extractionMethod: 'ai_extraction',
        validateRequired: true,
      }
    );

    console.log(`✅ Extraction completed in ${extractionResult.processingTime}ms`);
    console.log(`📈 Confidence: ${(extractionResult.confidence * 100).toFixed(1)}%`);
    console.log(`📊 Fields extracted: ${extractionResult.extractedFields}/${extractionResult.totalFields}`);
    console.log('');

    // Test 2: Schema organization validation
    console.log('📊 Test 2: Schema Organization Validation');
    console.log('----------------------------------------');
    
    const metadata = extractionResult.metadata;
    const categories = Object.keys(metadata);
    
    console.log(`📂 Categories found: ${categories.length}`);
    categories.forEach(category => {
      const fields = Object.keys(metadata[category] || {});
      console.log(`  - ${category}: ${fields.length} fields`);
      if (fields.length > 0) {
        console.log(`    Fields: ${fields.slice(0, 3).join(', ')}${fields.length > 3 ? '...' : ''}`);
      }
    });
    console.log('');

    // Test 3: Critical fields validation
    console.log('📊 Test 3: Critical Fields Validation');
    console.log('------------------------------------');
    
    const criticalFields = {
      'coreIdentity': ['manufacturer', 'brand', 'collection'],
      'physicalProperties': ['materialCategory', 'length', 'width'],
      'visualProperties': ['primaryColor', 'surfaceFinish'],
      'technicalSpecifications': ['waterAbsorption', 'slipResistance'],
      'commercialInformation': ['applicationArea', 'priceRange'],
    };

    let criticalFieldsFound = 0;
    let totalCriticalFields = 0;

    Object.entries(criticalFields).forEach(([category, fields]) => {
      const categoryData = metadata[category] || {};
      fields.forEach(field => {
        totalCriticalFields++;
        if (categoryData[field]) {
          criticalFieldsFound++;
          console.log(`  ✅ ${category}.${field}: ${categoryData[field]}`);
        } else {
          console.log(`  ❌ ${category}.${field}: Missing`);
        }
      });
    });

    const criticalFieldsScore = (criticalFieldsFound / totalCriticalFields * 100).toFixed(1);
    console.log(`📊 Critical fields score: ${criticalFieldsScore}% (${criticalFieldsFound}/${totalCriticalFields})`);
    console.log('');

    // Test 4: Metadata completeness validation
    console.log('📊 Test 4: Metadata Completeness Validation');
    console.log('------------------------------------------');
    
    const completenessResult = CanonicalMetadataSchemaService.validateMetadataCompleteness(metadata);
    
    console.log(`📈 Completion score: ${(completenessResult.completionScore * 100).toFixed(1)}%`);
    console.log(`✅ Is complete: ${completenessResult.isComplete}`);
    
    if (completenessResult.missingCriticalFields.length > 0) {
      console.log('❌ Missing critical fields:');
      completenessResult.missingCriticalFields.forEach(field => {
        console.log(`  - ${field}`);
      });
    }
    
    if (completenessResult.recommendations.length > 0) {
      console.log('💡 Recommendations:');
      completenessResult.recommendations.forEach(rec => {
        console.log(`  - ${rec}`);
      });
    }
    console.log('');

    // Test 5: Schema statistics
    console.log('📊 Test 5: Schema Statistics');
    console.log('---------------------------');
    
    const schemaStats = CanonicalMetadataSchemaService.getSchemaStatistics();
    
    console.log(`📂 Total categories: ${schemaStats.totalCategories}`);
    console.log(`📊 Total fields: ${schemaStats.totalFields}`);
    console.log('📈 Fields by category:');
    Object.entries(schemaStats.fieldsByCategory).forEach(([category, count]) => {
      console.log(`  - ${category}: ${count} fields`);
    });
    console.log(`🎯 Critical fields: ${schemaStats.criticalFields.join(', ')}`);
    console.log('');

    // Test 6: Category-specific extraction
    console.log('📊 Test 6: Category-Specific Extraction');
    console.log('--------------------------------------');
    
    const coreIdentityResult = await CanonicalMetadataSchemaService.extractCanonicalMetadata(
      sampleProductContent,
      undefined,
      {
        includeCategories: ['coreIdentity', 'physicalProperties'],
        confidenceThreshold: 0.6,
      }
    );

    const limitedCategories = Object.keys(coreIdentityResult.metadata);
    console.log(`📂 Limited extraction categories: ${limitedCategories.join(', ')}`);
    console.log(`📊 Limited extraction fields: ${coreIdentityResult.extractedFields}`);
    console.log('');

    // Summary
    console.log('🎯 Test Results Summary');
    console.log('======================');
    console.log(`✅ Basic extraction: ${extractionResult.confidence >= 0.6 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Schema organization: ${categories.length >= 4 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Critical fields: ${criticalFieldsFound >= totalCriticalFields * 0.6 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Completeness validation: ${completenessResult.completionScore >= 0.6 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Schema statistics: ${schemaStats.totalFields > 100 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Category-specific extraction: ${limitedCategories.length <= 2 ? 'PASS' : 'FAIL'}`);
    
    const allTestsPassed = 
      extractionResult.confidence >= 0.6 &&
      categories.length >= 4 &&
      criticalFieldsFound >= totalCriticalFields * 0.6 &&
      completenessResult.completionScore >= 0.6 &&
      schemaStats.totalFields > 100 &&
      limitedCategories.length <= 2;

    console.log('');
    console.log(`🏆 Overall Result: ${allTestsPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
    
    if (allTestsPassed) {
      console.log('🎉 Canonical metadata extraction is working correctly!');
      console.log('📋 The system successfully organizes 120+ metadata fields into logical categories');
      console.log('🔍 AI extraction provides comprehensive product metadata with high confidence');
      console.log('✨ Ready for production use with PDF processing workflow');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.log('');
    console.log('🔧 Troubleshooting:');
    console.log('- Ensure Supabase connection is working');
    console.log('- Check that material_metadata_fields table exists');
    console.log('- Verify AI service configuration');
    console.log('- Test with simpler content first');
  }
}

// Run the test
testCanonicalMetadataExtraction().catch(console.error);
