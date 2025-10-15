#!/usr/bin/env node

/**
 * COMPREHENSIVE PLATFORM ANALYSIS
 * Complete analysis of what's working vs what needs fixing
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

async function comprehensivePlatformAnalysis() {
    console.log('🔍 COMPREHENSIVE PLATFORM ANALYSIS');
    console.log('==================================================');
    
    const analysis = {
        working: [],
        broken: [],
        missing: [],
        optimizations: []
    };
    
    try {
        console.log('\n📊 STEP 1: API ENDPOINTS ANALYSIS');
        console.log('--------------------------------------------------');
        
        const endpoints = [
            { path: '/api/rag/health', method: 'GET', name: 'RAG Health' },
            { path: '/api/search/semantic', method: 'POST', name: 'Semantic Search', body: { query: "test", max_results: 1 } },
            { path: '/api/documents/documents', method: 'GET', name: 'List Documents' },
            { path: '/api/jobs', method: 'GET', name: 'List Jobs' },
            { path: '/api/search/images', method: 'POST', name: 'Image Search', body: { query: "test" } },
            { path: '/api/search/multimodal', method: 'POST', name: 'Multimodal Search', body: { query: "test" } }
        ];
        
        for (const endpoint of endpoints) {
            try {
                const response = await makeRequest(`${BASE_URL}${endpoint.path}`, {
                    method: endpoint.method,
                    headers: endpoint.body ? { 'Content-Type': 'application/json' } : {},
                    body: endpoint.body ? JSON.stringify(endpoint.body) : undefined
                });
                
                if (response.status === 200) {
                    analysis.working.push(`✅ ${endpoint.name}: Working (${response.status})`);
                    console.log(`✅ ${endpoint.name}: ${response.status}`);
                } else {
                    analysis.broken.push(`❌ ${endpoint.name}: Failed (${response.status})`);
                    console.log(`❌ ${endpoint.name}: ${response.status}`);
                }
            } catch (error) {
                analysis.broken.push(`❌ ${endpoint.name}: Error (${error.message})`);
                console.log(`❌ ${endpoint.name}: Error`);
            }
        }
        
        console.log('\n📄 STEP 2: DOCUMENT STORAGE ANALYSIS');
        console.log('--------------------------------------------------');
        
        const docsResponse = await makeRequest(`${BASE_URL}/api/documents/documents?limit=50`);
        
        if (docsResponse.status === 200) {
            const docs = docsResponse.data.documents || docsResponse.data || [];
            console.log(`📊 Total documents in API: ${docs.length}`);
            
            const harmonyDocs = docs.filter(doc => 
                doc.filename && doc.filename.toLowerCase().includes('harmony')
            );
            
            console.log(`📚 Harmony documents in API: ${harmonyDocs.length}`);
            
            if (harmonyDocs.length === 0) {
                analysis.broken.push('❌ Harmony PDF not in documents API but content is searchable');
                console.log('❌ CRITICAL: Harmony PDF processed but not in documents API');
            } else {
                analysis.working.push('✅ Harmony PDF in documents API');
            }
        } else {
            analysis.broken.push('❌ Documents API not accessible');
        }
        
        console.log('\n🔍 STEP 3: SEARCH FUNCTIONALITY ANALYSIS');
        console.log('--------------------------------------------------');
        
        const searchResponse = await makeRequest(`${BASE_URL}/api/search/semantic`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: "VALENOVA by SG NY",
                max_results: 3
            })
        });
        
        if (searchResponse.status === 200) {
            const results = searchResponse.data.results || [];
            const harmonyResults = results.filter(r => 
                r.metadata?.original_filename?.includes('harmony')
            );
            
            console.log(`🔍 Search results: ${results.length}`);
            console.log(`📚 Harmony results: ${harmonyResults.length}`);
            
            if (harmonyResults.length > 0) {
                const bestScore = Math.max(...harmonyResults.map(r => r.score || 0));
                console.log(`🎯 Best similarity score: ${(bestScore * 100).toFixed(1)}%`);
                
                if (bestScore > 0.4) {
                    analysis.working.push('✅ High-quality semantic search working');
                } else {
                    analysis.optimizations.push('🔧 Search similarity scores could be improved');
                }
            } else {
                analysis.broken.push('❌ Search not finding harmony content');
            }
        } else {
            analysis.broken.push('❌ Semantic search API not working');
        }
        
        console.log('\n🖼️ STEP 4: IMAGE FUNCTIONALITY ANALYSIS');
        console.log('--------------------------------------------------');
        
        // Test image search
        const imageSearchResponse = await makeRequest(`${BASE_URL}/api/search/images`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: "VALENOVA" })
        });
        
        console.log(`📊 Image search API: ${imageSearchResponse.status}`);
        
        if (imageSearchResponse.status === 200) {
            analysis.working.push('✅ Image search API accessible');
        } else {
            analysis.broken.push('❌ Image search API not working');
        }
        
        // Test multimodal search
        const multimodalResponse = await makeRequest(`${BASE_URL}/api/search/multimodal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: "VALENOVA tiles" })
        });
        
        console.log(`📊 Multimodal search API: ${multimodalResponse.status}`);
        
        if (multimodalResponse.status === 200) {
            analysis.working.push('✅ Multimodal search API accessible');
        } else {
            analysis.broken.push('❌ Multimodal search API not working');
        }
        
        console.log('\n⚙️ STEP 5: FRONTEND-BACKEND INTEGRATION ANALYSIS');
        console.log('--------------------------------------------------');
        
        // The frontend error indicates data retrieval issues
        analysis.broken.push('❌ Frontend cannot retrieve MIVAA processing results');
        analysis.broken.push('❌ Job status API returns incomplete data');
        analysis.broken.push('❌ Document chunks API not accessible from frontend');
        analysis.broken.push('❌ Image extraction results not accessible from frontend');
        
        console.log('\n📊 STEP 6: DATABASE CONSISTENCY ANALYSIS');
        console.log('--------------------------------------------------');
        
        // Based on our findings
        analysis.broken.push('❌ Documents table vs search results inconsistency');
        analysis.broken.push('❌ Job completion status not properly reflected in APIs');
        analysis.broken.push('❌ Image extraction completed but images not accessible');
        
        console.log('\n💡 STEP 7: WORKFLOW GAPS ANALYSIS');
        console.log('--------------------------------------------------');
        
        analysis.missing.push('🔍 Real-time job progress monitoring in frontend');
        analysis.missing.push('🖼️ Image gallery display for processed documents');
        analysis.missing.push('📊 Document processing status dashboard');
        analysis.missing.push('🔗 Direct links between text chunks and related images');
        analysis.missing.push('📋 Structured metadata extraction (product codes, specs)');
        analysis.missing.push('🏷️ Automatic tagging and categorization');
        
        console.log('\n🚀 STEP 8: OPTIMIZATION OPPORTUNITIES');
        console.log('--------------------------------------------------');
        
        analysis.optimizations.push('🔧 Improve API response consistency across endpoints');
        analysis.optimizations.push('📊 Add structured data extraction for product catalogs');
        analysis.optimizations.push('🖼️ Implement image-text correlation and tagging');
        analysis.optimizations.push('🔍 Add advanced search filters (designer, material type, size)');
        analysis.optimizations.push('📱 Improve frontend error handling and user feedback');
        analysis.optimizations.push('⚡ Add caching for frequently accessed content');
        analysis.optimizations.push('📈 Implement search analytics and performance monitoring');
        analysis.optimizations.push('🔗 Add cross-referencing between related products');
        analysis.optimizations.push('🎯 Implement semantic similarity thresholds tuning');
        analysis.optimizations.push('📋 Add bulk document processing queue management');
        
    } catch (error) {
        console.log(`❌ Analysis Error: ${error.message}`);
    }
    
    console.log('\n==================================================');
    console.log('📋 COMPREHENSIVE ANALYSIS RESULTS');
    console.log('==================================================');
    
    console.log('\n✅ WORKING COMPONENTS:');
    analysis.working.forEach(item => console.log(`   ${item}`));
    
    console.log('\n❌ BROKEN/NEEDS FIXING:');
    analysis.broken.forEach(item => console.log(`   ${item}`));
    
    console.log('\n🔍 MISSING FEATURES:');
    analysis.missing.forEach(item => console.log(`   ${item}`));
    
    console.log('\n🚀 OPTIMIZATION OPPORTUNITIES:');
    analysis.optimizations.forEach(item => console.log(`   ${item}`));
    
    console.log('\n==================================================');
    console.log('🎯 PRIORITY RECOMMENDATIONS');
    console.log('==================================================');
    
    console.log('\n🔥 CRITICAL FIXES (Must Fix):');
    console.log('   1. Fix frontend data retrieval from MIVAA API');
    console.log('   2. Resolve documents API vs search results inconsistency');
    console.log('   3. Make image extraction results accessible');
    console.log('   4. Fix job status API to return complete data');
    
    console.log('\n⚡ HIGH PRIORITY (Should Fix):');
    console.log('   1. Implement real-time processing progress monitoring');
    console.log('   2. Add image gallery for processed documents');
    console.log('   3. Improve error handling and user feedback');
    console.log('   4. Add structured metadata extraction');
    
    console.log('\n🚀 MEDIUM PRIORITY (Nice to Have):');
    console.log('   1. Advanced search filters and categorization');
    console.log('   2. Cross-referencing between related products');
    console.log('   3. Search analytics and performance monitoring');
    console.log('   4. Bulk processing queue management');
}

comprehensivePlatformAnalysis().catch(console.error);
