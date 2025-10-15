#!/usr/bin/env node

/**
 * TEST EMBEDDING FORMAT
 * Check what format embeddings are returned in from the API
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

async function testEmbeddingFormat() {
    console.log('🔍 TEST EMBEDDING FORMAT');
    console.log('==================================================');
    
    try {
        const documentId = '8a56997b-bcdb-4ad5-a240-08bf27e01a93';
        
        console.log('\n1. Getting document chunks with embeddings...');
        
        const chunksResponse = await makeRequest(`${BASE_URL}/api/documents/${documentId}/chunks`);
        
        console.log(`   Status: ${chunksResponse.status}`);
        
        if (chunksResponse.status === 200 && chunksResponse.data.chunks) {
            const chunks = chunksResponse.data.chunks;
            console.log(`   Found ${chunks.length} chunks`);
            
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                console.log(`\n   Chunk ${i + 1}:`);
                console.log(`     - ID: ${chunk.id}`);
                console.log(`     - Content: "${chunk.content?.substring(0, 50) || 'N/A'}..."`);
                console.log(`     - Has embedding: ${chunk.embedding ? 'YES' : 'NO'}`);
                
                if (chunk.embedding) {
                    console.log(`     - Embedding type: ${typeof chunk.embedding}`);
                    console.log(`     - Embedding is array: ${Array.isArray(chunk.embedding)}`);
                    
                    if (Array.isArray(chunk.embedding)) {
                        console.log(`     - Embedding length: ${chunk.embedding.length}`);
                        console.log(`     - First 3 values: [${chunk.embedding.slice(0, 3).join(', ')}]`);
                        console.log(`     - Last 3 values: [${chunk.embedding.slice(-3).join(', ')}]`);
                    } else if (typeof chunk.embedding === 'string') {
                        console.log(`     - Embedding string length: ${chunk.embedding.length}`);
                        console.log(`     - First 100 chars: "${chunk.embedding.substring(0, 100)}..."`);
                        
                        // Try to parse as JSON
                        try {
                            const parsed = JSON.parse(chunk.embedding);
                            if (Array.isArray(parsed)) {
                                console.log(`     - Parsed as array with length: ${parsed.length}`);
                                console.log(`     - First 3 parsed values: [${parsed.slice(0, 3).join(', ')}]`);
                            }
                        } catch (e) {
                            console.log(`     - Failed to parse as JSON: ${e.message}`);
                        }
                    }
                }
            }
        } else {
            console.log(`   Failed to get chunks: ${JSON.stringify(chunksResponse.data)}`);
        }
        
    } catch (error) {
        console.log(`❌ Test error: ${error.message}`);
    }
}

testEmbeddingFormat().catch(console.error);
