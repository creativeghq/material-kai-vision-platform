#!/usr/bin/env node

/**
 * QUICK HEALTH CHECK
 * Quick test to see if service is up and embedding service is working
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

async function quickHealthCheck() {
    console.log('🔍 QUICK HEALTH CHECK');
    console.log('==================================================');
    
    try {
        console.log('Checking RAG health...');
        const ragHealthResponse = await makeRequest(`${BASE_URL}/api/rag/health`);
        
        console.log(`RAG Health Status: ${ragHealthResponse.status}`);
        
        if (ragHealthResponse.status === 200) {
            const embeddingService = ragHealthResponse.data.services?.embedding;
            if (embeddingService) {
                console.log(`✅ Embedding service: ${embeddingService.status}`);
                console.log(`📊 Model: ${embeddingService.model?.name}`);
                console.log(`📈 Embeddings generated: ${embeddingService.metrics?.total_embeddings_generated || 0}`);
                
                if (embeddingService.status === 'healthy') {
                    console.log(`🎉 EMBEDDING SERVICE IS WORKING!`);
                } else {
                    console.log(`❌ Embedding service issue: ${embeddingService.message}`);
                }
            } else {
                console.log(`❌ No embedding service data found`);
            }
        } else {
            console.log(`❌ RAG health check failed`);
        }
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }
}

quickHealthCheck().catch(console.error);
