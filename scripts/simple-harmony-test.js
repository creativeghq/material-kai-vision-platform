#!/usr/bin/env node

console.log('🚀 SIMPLE HARMONY TEST');

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
                    resolve({ status: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
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

async function simpleTest() {
    try {
        console.log('Testing health endpoint...');
        const health = await makeRequest(`${BASE_URL}/api/rag/health`);
        console.log(`Health: ${health.status}`);
        
        console.log('Testing process endpoint...');
        const supabaseUrl = "https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/49f683ad-ebf2-4296-a410-0d8c011ce0be/1760462185826-harmony-signature-book-24-25.pdf";
        
        const processPayload = {
            url: supabaseUrl,
            filename: "harmony-signature-book-24-25.pdf"
        };
        
        const processResponse = await makeRequest(`${BASE_URL}/api/documents/process-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(processPayload)
        });
        
        console.log(`Process response: ${processResponse.status}`);
        console.log(`Data: ${JSON.stringify(processResponse.data, null, 2)}`);
        
    } catch (error) {
        console.log(`Error: ${error.message}`);
    }
}

simpleTest();
