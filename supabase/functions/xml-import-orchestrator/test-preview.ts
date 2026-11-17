/**
 * Test script for XML Import Orchestrator - Preview Mode
 * 
 * This demonstrates the new dynamic field detection and AI-assisted mapping
 * 
 * Usage:
 * deno run --allow-net --allow-read --allow-env test-preview.ts
 */

import { readFileSync } from 'https://deno.land/std@0.208.0/fs/mod.ts';

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key-here'; // Replace with actual key
const WORKSPACE_ID = 'your-workspace-id-here'; // Replace with actual workspace ID

async function testPreviewMode() {
  console.log('🧪 Testing XML Import Orchestrator - Preview Mode\n');

  // Read sample XML file
  const xmlContent = readFileSync('./test-sample.xml', 'utf-8');
  console.log('✅ Loaded test-sample.xml');
  console.log(`   File size: ${xmlContent.length} characters\n`);

  // Encode to base64
  const xmlBase64 = btoa(xmlContent);

  // Call Edge Function in preview mode
  console.log('📡 Calling Edge Function (preview_only: true)...\n');

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/xml-import-orchestrator`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workspace_id: WORKSPACE_ID,
        xml_content: xmlBase64,
        preview_only: true, // This triggers field detection mode
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('❌ Error:', error);
    return;
  }

  const result = await response.json();

  console.log('✅ Preview Mode Response:\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`📊 Detected ${result.detected_fields.length} unique fields:\n`);

  // Display detected fields in a table format
  console.log('┌─────────────────────────┬──────────────────────┬────────────┬────────────┐');
  console.log('│ XML Field               │ Suggested Mapping    │ Confidence │ Data Type  │');
  console.log('├─────────────────────────┼──────────────────────┼────────────┼────────────┤');

  for (const field of result.detected_fields) {
    const xmlField = field.xml_field.padEnd(23);
    const mapping = field.suggested_mapping.padEnd(20);
    const confidence = (field.confidence * 100).toFixed(0).padStart(3) + '%';
    const dataType = field.data_type.padEnd(10);

    console.log(`│ ${xmlField} │ ${mapping} │ ${confidence.padEnd(10)} │ ${dataType} │`);
  }

  console.log('└─────────────────────────┴──────────────────────┴────────────┴────────────┘\n');

  // Display sample values for each field
  console.log('📝 Sample Values:\n');
  for (const field of result.detected_fields) {
    console.log(`   ${field.xml_field}:`);
    field.sample_values.forEach((value: string, index: number) => {
      const truncated = value.length > 60 ? value.substring(0, 57) + '...' : value;
      console.log(`      ${index + 1}. ${truncated}`);
    });
    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Display suggested mappings as JSON
  console.log('🤖 AI-Suggested Mappings (JSON):\n');
  console.log(JSON.stringify(result.suggested_mappings, null, 2));
  console.log('\n');

  // Display high-confidence mappings
  const highConfidence = result.detected_fields.filter((f: any) => f.confidence >= 0.9);
  console.log(`✨ High Confidence Mappings (≥90%): ${highConfidence.length}\n`);
  for (const field of highConfidence) {
    console.log(`   ✓ ${field.xml_field} → ${field.suggested_mapping} (${(field.confidence * 100).toFixed(0)}%)`);
  }
  console.log('\n');

  // Display low-confidence mappings that need review
  const lowConfidence = result.detected_fields.filter((f: any) => f.confidence < 0.7);
  if (lowConfidence.length > 0) {
    console.log(`⚠️  Low Confidence Mappings (<70%) - Review Required: ${lowConfidence.length}\n`);
    for (const field of lowConfidence) {
      console.log(`   ⚠ ${field.xml_field} → ${field.suggested_mapping} (${(field.confidence * 100).toFixed(0)}%)`);
    }
    console.log('\n');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Next steps
  console.log('📋 Next Steps:\n');
  console.log('   1. Review the suggested mappings above');
  console.log('   2. Adjust any low-confidence mappings in the UI');
  console.log('   3. Save as a mapping template for future imports');
  console.log('   4. Call the import endpoint with confirmed mappings\n');

  console.log('💡 Example Import Call:\n');
  console.log(`   POST ${SUPABASE_URL}/functions/v1/xml-import-orchestrator`);
  console.log('   Body: {');
  console.log('     "workspace_id": "...",');
  console.log('     "category": "materials",');
  console.log('     "xml_content": "...",');
  console.log('     "field_mappings": { /* your confirmed mappings */ }');
  console.log('   }\n');
}

// Run the test
if (import.meta.main) {
  testPreviewMode().catch(console.error);
}

