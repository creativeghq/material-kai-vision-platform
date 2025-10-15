#!/usr/bin/env node

/**
 * SEARCH EXAMPLE: VALENOVA by SG NY
 * Demonstrate detailed search functionality with real query
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

async function searchValenovaExample() {
    console.log('🔍 SEARCH EXAMPLE: VALENOVA by SG NY');
    console.log('==================================================');
    
    try {
        console.log('\n1. Health check...');
        const healthResponse = await makeRequest(`${BASE_URL}/api/rag/health`);
        
        if (healthResponse.status !== 200) {
            console.log(`   ❌ Service health check failed: ${healthResponse.status}`);
            return;
        }
        
        console.log('   ✅ Service is healthy');
        console.log(`   Embedding model: ${healthResponse.data.services.embedding.model.name}`);
        console.log(`   Embedding dimensions: ${healthResponse.data.services.embedding.model.dimension}`);
        
        console.log('\n2. Searching for "VALENOVA by SG NY"...');
        
        const searchPayload = {
            query: "VALENOVA by SG NY",
            max_results: 10,
            similarity_threshold: 0.1  // Lower threshold to find more results
        };
        
        console.log(`   Query: "${searchPayload.query}"`);
        console.log(`   Max results: ${searchPayload.max_results}`);
        console.log(`   Similarity threshold: ${searchPayload.similarity_threshold}`);
        
        const searchResponse = await makeRequest(`${BASE_URL}/api/search/semantic`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(searchPayload)
        });
        
        console.log(`\n3. Search Results:`);
        console.log(`   Status: ${searchResponse.status}`);
        
        if (searchResponse.status === 200) {
            const results = searchResponse.data.results || [];
            const metadata = searchResponse.data.metadata || {};
            
            console.log(`   ✅ Search completed successfully`);
            console.log(`   Results found: ${results.length}`);
            console.log(`   Total results: ${searchResponse.data.total_results}`);
            console.log(`   Documents searched: ${metadata.searched_documents}`);
            console.log(`   Query processed: "${searchResponse.data.query}"`);
            console.log(`   Timestamp: ${searchResponse.data.timestamp}`);
            
            if (results.length > 0) {
                console.log('\n4. Detailed Results:');
                console.log('==================================================');
                
                results.forEach((result, idx) => {
                    console.log(`\n📄 RESULT ${idx + 1}:`);
                    console.log(`   🎯 Similarity Score: ${result.score?.toFixed(4)} (${(result.score * 100).toFixed(1)}% match)`);
                    console.log(`   📋 Document ID: ${result.document_id}`);
                    
                    console.log(`\n   📝 Content Preview:`);
                    const content = result.content || '';
                    const lines = content.split('\n').filter(line => line.trim());
                    lines.slice(0, 5).forEach(line => {
                        console.log(`      ${line.trim()}`);
                    });
                    if (lines.length > 5) {
                        console.log(`      ... (${lines.length - 5} more lines)`);
                    }
                    
                    if (result.metadata) {
                        console.log(`\n   📊 Metadata:`);
                        const meta = result.metadata;
                        if (meta.original_filename) console.log(`      📁 Original File: ${meta.original_filename}`);
                        if (meta.file_format) console.log(`      📄 Format: ${meta.file_format}`);
                        if (meta.page_count) console.log(`      📖 Pages: ${meta.page_count}`);
                        if (meta.chunk_index !== undefined) console.log(`      🧩 Chunk: ${meta.chunk_index + 1}/${meta.total_chunks}`);
                        if (meta.file_size) console.log(`      💾 Size: ${(meta.file_size / 1024).toFixed(1)} KB`);
                        if (meta.processed_at) console.log(`      ⏰ Processed: ${new Date(meta.processed_at).toLocaleString()}`);
                        if (meta.embedding_model) console.log(`      🤖 Embedding Model: ${meta.embedding_model}`);
                        if (meta.source_url) console.log(`      🔗 Source: ${meta.source_url}`);
                    }
                    
                    console.log('   ' + '─'.repeat(60));
                });
                
                console.log('\n5. Search Summary:');
                console.log('==================================================');
                console.log(`   🎯 Best match: ${results[0].score?.toFixed(4)} similarity`);
                console.log(`   📊 Average score: ${(results.reduce((sum, r) => sum + (r.score || 0), 0) / results.length).toFixed(4)}`);
                console.log(`   📈 Score range: ${Math.min(...results.map(r => r.score || 0)).toFixed(4)} - ${Math.max(...results.map(r => r.score || 0)).toFixed(4)}`);
                
                const uniqueDocuments = new Set(results.map(r => r.document_id)).size;
                console.log(`   📚 Unique documents: ${uniqueDocuments}`);
                
            } else {
                console.log('\n   ⚠️ No results found for "VALENOVA by SG NY"');
                console.log('   This could mean:');
                console.log('   - No documents contain this specific product name');
                console.log('   - The similarity threshold is too high');
                console.log('   - The content might use different terminology');
                
                console.log('\n   💡 Suggestions:');
                console.log('   - Try searching for just "VALENOVA"');
                console.log('   - Try searching for "SG NY"');
                console.log('   - Try broader terms like "ceramic" or "tile"');
            }
            
        } else {
            console.log(`   ❌ Search failed with status: ${searchResponse.status}`);
            if (searchResponse.data) {
                console.log(`   Error details: ${JSON.stringify(searchResponse.data, null, 2)}`);
            }
        }
        
    } catch (error) {
        console.log(`❌ Search error: ${error.message}`);
    }
    
    console.log('\n==================================================');
    console.log('🎉 SEARCH EXAMPLE COMPLETED');
}

searchValenovaExample().catch(console.error);
