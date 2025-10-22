/**
 * Test Script: Chunk Type Classification System
 * 
 * Tests the new semantic chunk classification system that categorizes chunks into:
 * - product_description
 * - technical_specs  
 * - visual_showcase
 * - designer_story
 * - collection_overview
 * - supporting_content
 * - index_content
 * - sustainability_info
 * - certification_info
 * - unclassified
 */

import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing required environment variables');
    console.error('   NEXT_PUBLIC_SUPABASE_URL:', !!SUPABASE_URL);
    console.error('   SUPABASE_SERVICE_ROLE_KEY:', !!SUPABASE_SERVICE_KEY);
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * Test sample chunks with different types
 */
const testChunks = [
    {
        content: "VALENOVA is a sophisticated modular seating system available in multiple configurations. Features premium leather upholstery in black, brown, and natural finishes. Dimensions: 180×90×75 cm. Designed for modern living spaces.",
        expectedType: 'product_description',
        description: 'Product with name, materials, colors, and dimensions'
    },
    {
        content: "Technical Specifications:\n• Material: High-grade aluminum alloy\n• Weight capacity: 150 kg\n• Dimensions: 200×100×80 mm\n• Resistance: IP65 rated\n• Compliance: ISO 9001 certified",
        expectedType: 'technical_specs',
        description: 'Technical specifications with measurements and certifications'
    },
    {
        content: "The visual showcase presents a stunning moodboard featuring warm earth tones and natural textures. See image gallery for detailed product photography showcasing the aesthetic appeal and finish quality.",
        expectedType: 'visual_showcase',
        description: 'Visual content with image references and aesthetic descriptions'
    },
    {
        content: "Designer Maria Santos from ESTUDI{H}AC brings her minimalist philosophy to this collection. Inspired by Scandinavian design principles and sustainable living, the creative process focused on functionality and timeless appeal.",
        expectedType: 'designer_story',
        description: 'Designer information with philosophy and inspiration'
    },
    {
        content: "The HARMONY Collection presents 15 innovative products featuring contemporary design elements. This comprehensive line includes seating, tables, and storage solutions unified by clean lines and premium materials.",
        expectedType: 'collection_overview',
        description: 'Collection overview with product count and theme'
    },
    {
        content: "Table of Contents\n1. Introduction ........................... 3\n2. Product Overview ...................... 5\n3. Technical Specifications .............. 12\n4. Installation Guide .................... 18",
        expectedType: 'index_content',
        description: 'Table of contents with page numbers'
    },
    {
        content: "Our commitment to sustainability includes using 100% recycled materials, carbon-neutral manufacturing processes, and biodegradable packaging. All products are certified eco-friendly and support responsible sourcing.",
        expectedType: 'sustainability_info',
        description: 'Sustainability and environmental information'
    },
    {
        content: "Quality Assurance: All products meet ISO 9001 standards and are CE marked for European compliance. Tested according to ANSI/BIFMA standards for commercial furniture applications.",
        expectedType: 'certification_info',
        description: 'Certification and compliance information'
    },
    {
        content: "Welcome to our comprehensive catalog showcasing innovative design solutions for modern workspaces. This document provides detailed information about our product offerings and services.",
        expectedType: 'supporting_content',
        description: 'General supporting content'
    },
    {
        content: "Short text",
        expectedType: 'unclassified',
        description: 'Very short content that should be unclassified'
    }
];

/**
 * Test the Edge Function directly
 */
async function testEdgeFunction() {
    console.log('\n🧪 Testing Edge Function Classification...\n');
    
    try {
        // First, get a real document with chunks to test
        const { data: documents, error: docError } = await supabase
            .from('documents')
            .select('id, filename')
            .limit(1);
            
        if (docError || !documents || documents.length === 0) {
            console.log('⚠️ No documents found for testing. Creating test chunks...');
            return await testWithSampleChunks();
        }
        
        const documentId = documents[0].id;
        console.log(`📄 Testing with document: ${documents[0].filename} (${documentId})`);
        
        // Get existing chunks for this document
        const { data: chunks, error: chunkError } = await supabase
            .from('document_chunks')
            .select('id, content, chunk_type, chunk_type_confidence')
            .eq('document_id', documentId)
            .limit(5);
            
        if (chunkError || !chunks || chunks.length === 0) {
            console.log('⚠️ No chunks found for this document');
            return;
        }
        
        console.log(`📊 Found ${chunks.length} chunks to classify`);
        
        // Test classification via Edge Function
        const response = await fetch(`${SUPABASE_URL}/functions/v1/chunk-type-classification`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                document_id: documentId,
                reclassify_all: true
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Edge Function error: ${response.status} - ${errorText}`);
            return;
        }
        
        const result = await response.json();
        console.log('\n✅ Edge Function Response:');
        console.log(`   Success: ${result.success}`);
        console.log(`   Message: ${result.message}`);
        console.log(`   Stats: ${JSON.stringify(result.stats)}`);
        
        if (result.results && result.results.length > 0) {
            console.log('\n📋 Classification Results:');
            result.results.slice(0, 5).forEach((res, index) => {
                console.log(`   ${index + 1}. Type: ${res.chunk_type} (${(res.confidence * 100).toFixed(1)}%)`);
                console.log(`      Reasoning: ${res.reasoning}`);
                if (Object.keys(res.metadata).length > 0) {
                    console.log(`      Metadata: ${JSON.stringify(res.metadata, null, 2).substring(0, 100)}...`);
                }
                console.log('');
            });
        }
        
        // Verify database updates
        const { data: updatedChunks, error: updateError } = await supabase
            .from('document_chunks')
            .select('id, chunk_type, chunk_type_confidence, chunk_type_metadata')
            .eq('document_id', documentId)
            .not('chunk_type', 'is', null)
            .limit(5);
            
        if (updateError) {
            console.error('❌ Error fetching updated chunks:', updateError);
            return;
        }
        
        console.log(`\n🔍 Database Verification: ${updatedChunks?.length || 0} chunks classified`);
        if (updatedChunks && updatedChunks.length > 0) {
            const typeStats = {};
            updatedChunks.forEach(chunk => {
                typeStats[chunk.chunk_type] = (typeStats[chunk.chunk_type] || 0) + 1;
            });
            
            console.log('📊 Type Distribution:');
            Object.entries(typeStats).forEach(([type, count]) => {
                console.log(`   ${type}: ${count}`);
            });
        }
        
    } catch (error) {
        console.error('❌ Error testing Edge Function:', error);
    }
}

/**
 * Test with sample chunks
 */
async function testWithSampleChunks() {
    console.log('\n🧪 Testing with Sample Chunks...\n');
    
    for (let i = 0; i < testChunks.length; i++) {
        const testChunk = testChunks[i];
        console.log(`\n${i + 1}. Testing: ${testChunk.description}`);
        console.log(`   Content: "${testChunk.content.substring(0, 80)}..."`);
        console.log(`   Expected: ${testChunk.expectedType}`);
        
        try {
            const response = await fetch(`${SUPABASE_URL}/functions/v1/chunk-type-classification`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    chunk_ids: [], // Empty array to test individual classification
                    test_content: testChunk.content // Custom field for testing
                })
            });
            
            if (!response.ok) {
                console.log(`   ❌ Error: ${response.status}`);
                continue;
            }
            
            const result = await response.json();
            if (result.results && result.results.length > 0) {
                const classification = result.results[0];
                const isCorrect = classification.chunk_type === testChunk.expectedType;
                const status = isCorrect ? '✅' : '❌';
                
                console.log(`   ${status} Result: ${classification.chunk_type} (${(classification.confidence * 100).toFixed(1)}%)`);
                console.log(`   Reasoning: ${classification.reasoning}`);
                
                if (Object.keys(classification.metadata).length > 0) {
                    console.log(`   Metadata: ${JSON.stringify(classification.metadata)}`);
                }
            }
            
        } catch (error) {
            console.log(`   ❌ Error: ${error.message}`);
        }
    }
}

/**
 * Get classification statistics for all documents
 */
async function getClassificationStats() {
    console.log('\n📊 Getting Classification Statistics...\n');
    
    try {
        const { data: stats, error } = await supabase
            .from('document_chunks')
            .select('chunk_type, document_id')
            .not('chunk_type', 'is', null);
            
        if (error) {
            console.error('❌ Error fetching stats:', error);
            return;
        }
        
        if (!stats || stats.length === 0) {
            console.log('⚠️ No classified chunks found');
            return;
        }
        
        // Overall type distribution
        const typeStats = {};
        const documentStats = {};
        
        stats.forEach(chunk => {
            typeStats[chunk.chunk_type] = (typeStats[chunk.chunk_type] || 0) + 1;
            if (!documentStats[chunk.document_id]) {
                documentStats[chunk.document_id] = {};
            }
            documentStats[chunk.document_id][chunk.chunk_type] = 
                (documentStats[chunk.document_id][chunk.chunk_type] || 0) + 1;
        });
        
        console.log(`📈 Overall Classification Stats (${stats.length} total chunks):`);
        Object.entries(typeStats)
            .sort(([,a], [,b]) => b - a)
            .forEach(([type, count]) => {
                const percentage = ((count / stats.length) * 100).toFixed(1);
                console.log(`   ${type}: ${count} (${percentage}%)`);
            });
        
        console.log(`\n📄 Documents with Classifications: ${Object.keys(documentStats).length}`);
        
        // Show top document classifications
        const topDocs = Object.entries(documentStats)
            .map(([docId, types]) => ({
                docId,
                totalChunks: Object.values(types).reduce((a, b) => a + b, 0),
                types
            }))
            .sort((a, b) => b.totalChunks - a.totalChunks)
            .slice(0, 3);
            
        console.log('\n🏆 Top Documents by Classified Chunks:');
        topDocs.forEach((doc, index) => {
            console.log(`   ${index + 1}. Document ${doc.docId}: ${doc.totalChunks} chunks`);
            Object.entries(doc.types).forEach(([type, count]) => {
                console.log(`      ${type}: ${count}`);
            });
        });
        
    } catch (error) {
        console.error('❌ Error getting classification stats:', error);
    }
}

/**
 * Main test execution
 */
async function main() {
    console.log('🎯 Chunk Type Classification System Test');
    console.log('==========================================');
    
    try {
        // Test 1: Edge Function with real document
        await testEdgeFunction();
        
        // Test 2: Classification statistics
        await getClassificationStats();
        
        console.log('\n✅ All tests completed!');
        
    } catch (error) {
        console.error('❌ Test execution failed:', error);
        process.exit(1);
    }
}

// Run the tests
main().catch(console.error);
