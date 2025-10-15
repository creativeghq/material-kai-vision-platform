#!/usr/bin/env node

/**
 * CHECK DOCUMENTS
 * Check what documents exist in the system
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

async function checkDocuments() {
    console.log('📄 CHECK DOCUMENTS');
    console.log('==================================================');
    
    try {
        console.log('\n1. Getting list of documents...');
        
        const documentsResponse = await makeRequest(`${BASE_URL}/api/documents`);
        
        console.log(`   Status: ${documentsResponse.status}`);
        
        if (documentsResponse.status === 200) {
            const documents = documentsResponse.data.documents || documentsResponse.data;
            console.log(`   Found ${documents.length} documents`);
            
            for (let i = 0; i < Math.min(documents.length, 5); i++) {
                const doc = documents[i];
                console.log(`\n   Document ${i + 1}:`);
                console.log(`     - ID: ${doc.id}`);
                console.log(`     - Title: ${doc.title || doc.name || 'N/A'}`);
                console.log(`     - Status: ${doc.status || 'N/A'}`);
                console.log(`     - Created: ${doc.created_at || 'N/A'}`);
            }
            
            if (documents.length > 0) {
                const testDocId = documents[0].id;
                console.log(`\n2. Testing chunks endpoint with document ID: ${testDocId}`);
                
                const chunksResponse = await makeRequest(`${BASE_URL}/api/documents/${testDocId}/chunks`);
                console.log(`   Chunks status: ${chunksResponse.status}`);
                
                if (chunksResponse.status === 200) {
                    const chunks = chunksResponse.data.chunks || chunksResponse.data;
                    console.log(`   Found ${chunks.length} chunks`);
                    
                    if (chunks.length > 0) {
                        const chunk = chunks[0];
                        console.log(`   First chunk:`);
                        console.log(`     - ID: ${chunk.id}`);
                        console.log(`     - Content: "${chunk.content?.substring(0, 50) || 'N/A'}..."`);
                        console.log(`     - Has embedding: ${chunk.embedding ? 'YES' : 'NO'}`);
                    }
                } else {
                    console.log(`   Chunks error: ${JSON.stringify(chunksResponse.data)}`);
                }
            }
        } else {
            console.log(`   Failed to get documents: ${JSON.stringify(documentsResponse.data)}`);
        }
        
    } catch (error) {
        console.log(`❌ Test error: ${error.message}`);
    }
}

checkDocuments().catch(console.error);
