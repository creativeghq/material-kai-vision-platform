#!/usr/bin/env node

/**
 * FIND HARMONY SIGNATURE BOOK PDF
 * Search for harmony-signature-book-24-25.pdf and analyze its content
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

async function findHarmonyPDF() {
    console.log('🔍 SEARCHING FOR HARMONY SIGNATURE BOOK PDF');
    console.log('==================================================');
    
    try {
        console.log('\n1. Getting list of all documents...');
        
        // Get documents list
        const docsResponse = await makeRequest(`${BASE_URL}/api/documents/list?limit=50`);
        
        if (docsResponse.status === 200) {
            const documents = docsResponse.data.documents || [];
            console.log(`   ✅ Found ${documents.length} total documents`);
            
            // Look for harmony PDF
            const harmonyDocs = documents.filter(doc => 
                doc.filename && doc.filename.toLowerCase().includes('harmony')
            );
            
            console.log(`\n2. Harmony-related documents:`);
            if (harmonyDocs.length > 0) {
                harmonyDocs.forEach((doc, idx) => {
                    console.log(`   ${idx + 1}. 📄 ${doc.filename}`);
                    console.log(`      📋 ID: ${doc.id}`);
                    console.log(`      📊 Status: ${doc.processing_status}`);
                    console.log(`      📅 Created: ${new Date(doc.created_at).toLocaleString()}`);
                    if (doc.file_size) console.log(`      💾 Size: ${(doc.file_size / 1024 / 1024).toFixed(2)} MB`);
                    console.log('');
                });
            } else {
                console.log('   ⚠️ No harmony-related documents found');
                
                console.log('\n   📋 All available documents:');
                documents.forEach((doc, idx) => {
                    console.log(`   ${idx + 1}. ${doc.filename} (${doc.processing_status})`);
                });
            }
            
            // Search for VALENOVA in all documents
            console.log('\n3. Searching for "VALENOVA" across all documents...');
            
            const valenovaSearch = await makeRequest(`${BASE_URL}/api/search/semantic`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query: "VALENOVA",
                    max_results: 10,
                    similarity_threshold: 0.1
                })
            });
            
            if (valenovaSearch.status === 200) {
                const results = valenovaSearch.data.results || [];
                console.log(`   ✅ Found ${results.length} results for "VALENOVA"`);
                
                if (results.length > 0) {
                    console.log('\n4. VALENOVA search results:');
                    results.forEach((result, idx) => {
                        console.log(`\n   📄 RESULT ${idx + 1}:`);
                        console.log(`      🎯 Score: ${result.score?.toFixed(4)} (${(result.score * 100).toFixed(1)}%)`);
                        console.log(`      📋 Document ID: ${result.document_id}`);
                        
                        if (result.metadata?.original_filename) {
                            console.log(`      📁 File: ${result.metadata.original_filename}`);
                        }
                        
                        console.log(`      📝 Content:`);
                        const content = result.content || '';
                        const lines = content.split('\n').filter(line => line.trim());
                        lines.slice(0, 8).forEach(line => {
                            console.log(`         ${line.trim()}`);
                        });
                        if (lines.length > 8) {
                            console.log(`         ... (${lines.length - 8} more lines)`);
                        }
                    });
                }
            }
            
            // Search for "SG NY" 
            console.log('\n5. Searching for "SG NY"...');
            
            const sgnySearch = await makeRequest(`${BASE_URL}/api/search/semantic`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query: "SG NY",
                    max_results: 5,
                    similarity_threshold: 0.1
                })
            });
            
            if (sgnySearch.status === 200) {
                const results = sgnySearch.data.results || [];
                console.log(`   ✅ Found ${results.length} results for "SG NY"`);
                
                if (results.length > 0) {
                    results.forEach((result, idx) => {
                        console.log(`\n   📄 RESULT ${idx + 1}:`);
                        console.log(`      🎯 Score: ${result.score?.toFixed(4)}`);
                        if (result.metadata?.original_filename) {
                            console.log(`      📁 File: ${result.metadata.original_filename}`);
                        }
                        console.log(`      📝 Content: "${result.content?.substring(0, 100)}..."`);
                    });
                }
            }
            
        } else {
            console.log(`   ❌ Failed to get documents list: ${docsResponse.status}`);
        }
        
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }
    
    console.log('\n==================================================');
    console.log('🎉 HARMONY PDF SEARCH COMPLETED');
}

findHarmonyPDF().catch(console.error);
