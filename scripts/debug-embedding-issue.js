#!/usr/bin/env node

/**
 * DEBUG EMBEDDING ISSUE
 * Check why embeddings are not being generated
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
        
        if (options.body) {
            req.write(options.body);
        }
        
        req.end();
    });
}

async function debugEmbeddingIssue() {
    console.log('🔍 DEBUGGING EMBEDDING ISSUE');
    console.log('==================================================');
    
    // Check health endpoint
    console.log('\n1. Checking service health...');
    try {
        const healthResponse = await makeRequest(`${BASE_URL}/health`);
        console.log(`📊 Health check: ${healthResponse.status}`);
        if (healthResponse.status === 200) {
            console.log(`✅ Service is healthy`);
        }
    } catch (error) {
        console.log(`❌ Health check failed: ${error.message}`);
    }
    
    // Check if there's an embedding service endpoint
    console.log('\n2. Checking embedding service availability...');
    try {
        const embeddingHealthResponse = await makeRequest(`${BASE_URL}/api/rag/embedding/health`);
        console.log(`📊 Embedding health: ${embeddingHealthResponse.status}`);
        if (embeddingHealthResponse.status === 200) {
            console.log(`✅ Embedding service available`);
            console.log(`📄 Response: ${JSON.stringify(embeddingHealthResponse.data, null, 2)}`);
        } else {
            console.log(`❌ Embedding service not available: ${embeddingHealthResponse.status}`);
        }
    } catch (error) {
        console.log(`❌ Embedding service check failed: ${error.message}`);
    }
    
    // Check recent documents and their chunks
    console.log('\n3. Checking recent documents...');
    try {
        const docsResponse = await makeRequest(`${BASE_URL}/api/documents/documents`);
        
        if (docsResponse.status === 200 && docsResponse.data.documents) {
            const docs = docsResponse.data.documents;
            const sortedDocs = docs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            
            console.log(`📊 Total documents: ${docs.length}`);
            
            if (sortedDocs.length > 0) {
                const latestDoc = sortedDocs[0];
                console.log(`📄 Latest document: ${latestDoc.document_id}`);
                console.log(`   📅 Created: ${latestDoc.created_at}`);
                console.log(`   📝 Title: ${latestDoc.title || 'No title'}`);
                
                // Check chunks in detail
                const chunksResponse = await makeRequest(`${BASE_URL}/api/documents/documents/${latestDoc.document_id}/chunks`);
                
                if (chunksResponse.status === 200 && chunksResponse.data.data) {
                    const chunks = chunksResponse.data.data;
                    console.log(`   📄 Chunks: ${chunks.length}`);
                    
                    if (chunks.length > 0) {
                        const firstChunk = chunks[0];
                        console.log(`   📄 First chunk details:`);
                        console.log(`      - ID: ${firstChunk.id}`);
                        console.log(`      - Content length: ${firstChunk.content ? firstChunk.content.length : 0} chars`);
                        console.log(`      - Content preview: "${(firstChunk.content || '').substring(0, 100)}..."`);
                        console.log(`      - Has embedding: ${firstChunk.embedding ? 'YES' : 'NO'}`);
                        console.log(`      - Embedding type: ${typeof firstChunk.embedding}`);
                        console.log(`      - Embedding length: ${Array.isArray(firstChunk.embedding) ? firstChunk.embedding.length : 'N/A'}`);
                        
                        if (firstChunk.embedding && Array.isArray(firstChunk.embedding) && firstChunk.embedding.length > 0) {
                            console.log(`      - Embedding sample: [${firstChunk.embedding.slice(0, 3).join(', ')}...]`);
                        }
                        
                        // Check all chunks
                        const chunksWithEmbeddings = chunks.filter(chunk => 
                            chunk.embedding && Array.isArray(chunk.embedding) && chunk.embedding.length > 0
                        );
                        
                        console.log(`   🔧 Chunks with embeddings: ${chunksWithEmbeddings.length}/${chunks.length}`);
                        
                        if (chunksWithEmbeddings.length === 0) {
                            console.log(`   ❌ NO EMBEDDINGS FOUND - This is the issue!`);
                            
                            // Check if chunks have any embedding field at all
                            const chunksWithEmbeddingField = chunks.filter(chunk => 'embedding' in chunk);
                            console.log(`   📊 Chunks with embedding field: ${chunksWithEmbeddingField.length}/${chunks.length}`);
                            
                            if (chunksWithEmbeddingField.length > 0) {
                                const embeddingValues = chunksWithEmbeddingField.map(chunk => ({
                                    id: chunk.id,
                                    embedding: chunk.embedding,
                                    type: typeof chunk.embedding,
                                    isArray: Array.isArray(chunk.embedding),
                                    length: Array.isArray(chunk.embedding) ? chunk.embedding.length : 'N/A'
                                }));
                                console.log(`   📄 Embedding field analysis:`, JSON.stringify(embeddingValues, null, 2));
                            }
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.log(`❌ Error checking documents: ${error.message}`);
    }
    
    // Test direct embedding generation
    console.log('\n4. Testing direct embedding generation...');
    try {
        const embeddingTestPayload = {
            text: "This is a test text for embedding generation",
            model: "text-embedding-3-small"
        };
        
        const embeddingTestResponse = await makeRequest(`${BASE_URL}/api/rag/embedding/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(embeddingTestPayload)
        });
        
        console.log(`📊 Direct embedding test: ${embeddingTestResponse.status}`);
        
        if (embeddingTestResponse.status === 200) {
            console.log(`✅ Direct embedding generation works!`);
            console.log(`📄 Response: ${JSON.stringify(embeddingTestResponse.data).substring(0, 200)}...`);
        } else {
            console.log(`❌ Direct embedding generation failed: ${embeddingTestResponse.status}`);
            console.log(`📄 Error: ${JSON.stringify(embeddingTestResponse.data)}`);
        }
    } catch (error) {
        console.log(`❌ Direct embedding test failed: ${error.message}`);
    }
    
    console.log('\n🎯 EMBEDDING DEBUG SUMMARY');
    console.log('==================================================');
    console.log('🔍 INVESTIGATION RESULTS:');
    console.log('   - Service health status');
    console.log('   - Embedding service availability');
    console.log('   - Document chunk analysis');
    console.log('   - Direct embedding generation test');
    
    console.log('\n🔧 NEXT STEPS:');
    console.log('   - Check if OpenAI API key is configured');
    console.log('   - Verify embedding service dependencies');
    console.log('   - Check server logs for embedding errors');
    console.log('   - Test embedding generation during processing');
}

debugEmbeddingIssue().catch(console.error);
