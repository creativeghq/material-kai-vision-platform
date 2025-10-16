/**
 * Phase 3: Test Chunk Relationship Graph
 * 
 * Tests the chunk relationship graph building functionality
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testRelationshipGraph() {
  try {
    console.log('🔗 Phase 3: Testing Chunk Relationship Graph\n');

    // Get latest document
    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('id, filename')
      .order('created_at', { ascending: false })
      .limit(1);

    if (docsError || !documents || documents.length === 0) {
      console.error('❌ No documents found');
      return;
    }

    const documentId = documents[0].id;
    const filename = documents[0].filename;

    console.log(`📄 Testing with document: ${filename}`);
    console.log(`📊 Document ID: ${documentId}\n`);

    // Call the build-chunk-relationships Edge Function
    console.log('🔗 Building chunk relationships...');
    const { data: relationshipData, error: relationshipError } = await supabase.functions.invoke(
      'build-chunk-relationships',
      {
        body: { document_id: documentId },
      }
    );

    if (relationshipError) {
      console.error('❌ Error building relationships:', relationshipError);
      return;
    }

    console.log('✅ Relationships built successfully!\n');
    console.log('📊 Relationship Statistics:');
    console.log(`   Sequential Relationships: ${relationshipData.sequential_relationships}`);
    console.log(`   Semantic Relationships: ${relationshipData.semantic_relationships}`);
    console.log(`   Hierarchical Relationships: ${relationshipData.hierarchical_relationships}`);
    console.log(`   Total Relationships: ${relationshipData.total_relationships}`);
    console.log(`   Total Chunks: ${relationshipData.total_chunks}\n`);

    // Get relationship statistics
    console.log('📈 Fetching relationship statistics...');
    const { data: stats, error: statsError } = await supabase
      .from('knowledge_relationships')
      .select('relationship_type, confidence_score')
      .eq('source_type', 'chunk');

    if (!statsError && stats) {
      const byType = {};
      let totalConfidence = 0;

      for (const rel of stats) {
        byType[rel.relationship_type] = (byType[rel.relationship_type] || 0) + 1;
        totalConfidence += rel.confidence_score || 0;
      }

      console.log('\n📊 Relationship Type Distribution:');
      for (const [type, count] of Object.entries(byType)) {
        console.log(`   ${type}: ${count}`);
      }

      const avgConfidence = stats.length > 0 ? totalConfidence / stats.length : 0;
      console.log(`\n📊 Average Confidence Score: ${(avgConfidence * 100).toFixed(1)}%`);
    }

    // Get sample relationships
    console.log('\n📋 Sample Relationships:');
    const { data: sampleRels, error: sampleError } = await supabase
      .from('knowledge_relationships')
      .select('relationship_type, confidence_score, relationship_context')
      .eq('source_type', 'chunk')
      .limit(5);

    if (!sampleError && sampleRels) {
      for (let i = 0; i < sampleRels.length; i++) {
        const rel = sampleRels[i];
        console.log(`\n   ${i + 1}. Type: ${rel.relationship_type}`);
        console.log(`      Confidence: ${(rel.confidence_score * 100).toFixed(1)}%`);
        console.log(`      Context: ${rel.relationship_context}`);
      }
    }

    console.log('\n✅ Phase 3 Relationship Graph Test Complete!');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testRelationshipGraph();

