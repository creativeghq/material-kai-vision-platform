/**
 * Test script to validate AI image classification fix
 * Tests that images are properly classified and material images are saved to DB
 */

const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const https = require('https');

const API_URL = 'https://v1api.materialshub.gr/api/rag/upload-pdf-with-discovery';
const PDF_PATH = path.join(__dirname, '../../public/test-pdfs/Harmony Signature Book.pdf');

async function uploadPDF() {
    console.log('🚀 Starting PDF upload test...\n');
    
    const form = new FormData();
    form.append('file', fs.createReadStream(PDF_PATH));
    form.append('workspace_id', 'workspace_main_2024_basil_material_kai_vision');
    form.append('discovery_model', 'claude-sonnet-4');
    form.append('extraction_categories', 'products');
    
    return new Promise((resolve, reject) => {
        const req = https.request(API_URL, {
            method: 'POST',
            headers: form.getHeaders()
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    resolve(result);
                } catch (e) {
                    reject(new Error(`Failed to parse response: ${data}`));
                }
            });
        });
        
        req.on('error', reject);
        form.pipe(req);
    });
}

async function monitorJob(jobId) {
    const { createClient } = require('@supabase/supabase-js');
    
    const supabase = createClient(
        'https://bgbavxtjlbvgplozizxu.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg'
    );
    
    console.log(`\n📊 Monitoring job ${jobId}...\n`);
    
    let lastProgress = -1;
    const startTime = Date.now();
    
    while (true) {
        const { data: job, error } = await supabase
            .from('background_jobs')
            .select('*')
            .eq('id', jobId)
            .single();
        
        if (error) {
            console.error('❌ Error fetching job:', error.message);
            break;
        }
        
        if (job.progress !== lastProgress) {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            console.log(`[${elapsed}s] Progress: ${job.progress}% - Status: ${job.status}`);
            lastProgress = job.progress;
        }
        
        if (job.status === 'completed') {
            console.log('\n✅ Job completed successfully!\n');
            return job;
        }
        
        if (job.status === 'failed' || job.status === 'interrupted') {
            console.log(`\n❌ Job ${job.status}: ${job.error || 'Unknown error'}\n`);
            return job;
        }
        
        await new Promise(resolve => setTimeout(resolve, 5000)); // Check every 5 seconds
    }
}

async function validateResults(documentId) {
    const { createClient } = require('@supabase/supabase-js');
    
    const supabase = createClient(
        'https://bgbavxtjlbvgplozizxu.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg'
    );
    
    console.log('📈 Validating results...\n');
    
    // Count products
    const { data: products, error: productsError } = await supabase
        .from('products')
        .select('id, name')
        .limit(100);
    
    // Count images
    const { data: images, error: imagesError } = await supabase
        .from('images')
        .select('id')
        .limit(1000);
    
    // Count CLIP embeddings
    const { data: embeddings, error: embeddingsError } = await supabase
        .from('clip_embeddings')
        .select('id')
        .limit(5000);
    
    console.log('📊 VALIDATION RESULTS:');
    console.log('='.repeat(50));
    console.log(`✅ Products: ${products?.length || 0} (Expected: 11)`);
    console.log(`✅ Images: ${images?.length || 0} (Expected: ~94)`);
    console.log(`✅ CLIP Embeddings: ${embeddings?.length || 0} (Expected: ~470)`);
    console.log('='.repeat(50));
    
    if (products?.length === 11 && images?.length > 50 && embeddings?.length > 200) {
        console.log('\n🎉 SUCCESS! All metrics look good!\n');
        return true;
    } else {
        console.log('\n⚠️  WARNING: Some metrics are off. Check the logs.\n');
        return false;
    }
}

async function main() {
    try {
        // Upload PDF
        const uploadResult = await uploadPDF();
        console.log('✅ Upload initiated:');
        console.log(`   Job ID: ${uploadResult.job_id}`);
        console.log(`   Document ID: ${uploadResult.document_id}`);
        
        // Monitor job
        const job = await monitorJob(uploadResult.job_id);
        
        if (job.status === 'completed') {
            // Validate results
            await validateResults(uploadResult.document_id);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

main();

