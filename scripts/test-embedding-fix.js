#!/usr/bin/env node

/**
 * TEST EMBEDDING FIX
 * Test if embeddings are now being returned in chunks API
 */

import https from 'https';

const BASE_URL = 'https://v1api.materialshub.gr';

function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, data: parsed, headers: res.headers });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data, headers: res.headers });
                }
            });
        });
        
        req.on('error', reject);
        req.end();
    });
}

async function testEmbeddingFix() {
    console.log('🔧 TESTING EMBEDDING FIX');
    console.log('==================================================');
    
    // Get recent documents
    console.log('\n1. Getting recent documents...');
    try {
        const docsResponse = await makeRequest(`${BASE_URL}/api/documents/documents`);
        
        if (docsResponse.status === 200 && docsResponse.data.documents) {
            const docs = docsResponse.data.documents;
            const sortedDocs = docs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            
            console.log(`📊 Total documents: ${docs.length}`);
            
            if (sortedDocs.length > 0) {
                const latestDoc = sortedDocs[0];
                console.log(`📄 Testing latest document: ${latestDoc.document_id}`);
                console.log(`   📅 Created: ${latestDoc.created_at}`);
                
                // Test chunks endpoint
                console.log('\n2. Testing chunks endpoint with embedding fix...');
                
                const chunksResponse = await makeRequest(`${BASE_URL}/api/documents/documents/${latestDoc.document_id}/chunks`);
                
                if (chunksResponse.status === 200 && chunksResponse.data.data) {
                    const chunks = chunksResponse.data.data;
                    console.log(`📄 Retrieved ${chunks.length} chunks`);
                    
                    if (chunks.length > 0) {
                        const firstChunk = chunks[0];
                        console.log(`\n📄 First chunk analysis:`);
                        console.log(`   - Chunk ID: ${firstChunk.chunk_id || firstChunk.id || 'N/A'}`);
                        console.log(`   - Content length: ${firstChunk.content ? firstChunk.content.length : 0} chars`);
                        console.log(`   - Content preview: "${(firstChunk.content || '').substring(0, 50)}..."`);
                        console.log(`   - Has embedding field: ${firstChunk.hasOwnProperty('embedding') ? 'YES' : 'NO'}`);
                        console.log(`   - Embedding value: ${firstChunk.embedding ? 'PRESENT' : 'NULL/MISSING'}`);
                        console.log(`   - Embedding type: ${typeof firstChunk.embedding}`);
                        
                        if (firstChunk.embedding && Array.isArray(firstChunk.embedding)) {
                            console.log(`   - Embedding dimensions: ${firstChunk.embedding.length}`);
                            console.log(`   - Embedding sample: [${firstChunk.embedding.slice(0, 3).join(', ')}...]`);
                            console.log(`   ✅ EMBEDDING FIX SUCCESSFUL!`);
                        } else if (firstChunk.embedding === null) {
                            console.log(`   ⚠️ Embedding is null - may not be generated yet`);
                        } else {
                            console.log(`   ❌ Embedding is missing or invalid`);
                        }
                        
                        // Check all chunks
                        const chunksWithEmbeddings = chunks.filter(chunk => 
                            chunk.embedding && Array.isArray(chunk.embedding) && chunk.embedding.length > 0
                        );
                        
                        console.log(`\n📊 Embedding statistics:`);
                        console.log(`   - Total chunks: ${chunks.length}`);
                        console.log(`   - Chunks with embeddings: ${chunksWithEmbeddings.length}`);
                        console.log(`   - Embedding success rate: ${((chunksWithEmbeddings.length / chunks.length) * 100).toFixed(1)}%`);
                        
                        if (chunksWithEmbeddings.length > 0) {
                            console.log(`   ✅ EMBEDDINGS ARE WORKING!`);
                            
                            // Test search functionality
                            console.log('\n3. Testing search with embeddings...');
                            
                            const searchPayload = {
                                query: "page",
                                document_ids: [latestDoc.document_id],
                                limit: 5,
                                similarity_threshold: 0.1,
                                search_type: "semantic"
                            };
                            
                            const searchResponse = await makeRequest(`${BASE_URL}/api/search/semantic`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify(searchPayload)
                            });
                            
                            console.log(`🔍 Search test: ${searchResponse.status}`);
                            
                            if (searchResponse.status === 200) {
                                const results = searchResponse.data.results || [];
                                console.log(`📄 Search results: ${results.length}`);
                                
                                if (results.length > 0) {
                                    console.log(`✅ SEARCH FUNCTIONALITY WORKING!`);
                                    console.log(`📄 Sample result: ${JSON.stringify(results[0]).substring(0, 100)}...`);
                                } else {
                                    console.log(`⚠️ Search working but no results (may need indexing time)`);
                                }
                            } else {
                                console.log(`❌ Search error: ${searchResponse.status}`);
                                console.log(`📄 Error details: ${JSON.stringify(searchResponse.data)}`);
                            }
                        } else {
                            console.log(`   ❌ NO EMBEDDINGS FOUND - Issue not resolved`);
                        }
                    }
                } else {
                    console.log(`❌ Failed to retrieve chunks: ${chunksResponse.status}`);
                    console.log(`📄 Error: ${JSON.stringify(chunksResponse.data)}`);
                }
            }
        } else {
            console.log(`❌ Failed to retrieve documents: ${docsResponse.status}`);
        }
    } catch (error) {
        console.log(`❌ Test error: ${error.message}`);
    }
    
    console.log('\n🎯 EMBEDDING FIX TEST SUMMARY');
    console.log('==================================================');
    console.log('✅ EXPECTED RESULTS:');
    console.log('   - Chunks API returns embedding arrays instead of null');
    console.log('   - Embeddings have 1536 dimensions');
    console.log('   - Search functionality works with embeddings');
    console.log('   - Platform ready for semantic search');
}

testEmbeddingFix().catch(console.error);
