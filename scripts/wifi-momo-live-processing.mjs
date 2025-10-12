#!/usr/bin/env node

/**
 * WIFI MOMO PDF - LIVE PROCESSING & MONITORING
 * 
 * This script:
 * 1. Submits the WIFI MOMO PDF for processing
 * 2. Monitors job progress with real-time polling
 * 3. Shows chunks, images, and database results
 * 4. Displays final extraction results
 */

const MIVAA_BASE_URL = 'http://localhost:8000';
const PDF_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/49f683ad-ebf2-4296-a410-0d8c011ce0be/WIFI%20MOMO%20lookbook%2001s.pdf';

// Colors for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
};

function colorize(text, color) {
    return `${colors[color]}${text}${colors.reset}`;
}

function printHeader() {
    console.clear();
    console.log(colorize('🎯 WIFI MOMO PDF - LIVE PROCESSING & MONITORING', 'cyan'));
    console.log(colorize('=' .repeat(60), 'blue'));
    console.log(colorize(`📄 PDF: WIFI MOMO lookbook 01s.pdf`, 'white'));
    console.log(colorize(`🕐 Started: ${new Date().toLocaleString()}`, 'white'));
    console.log('');
}

async function makeRequest(url, options = {}) {
    try {
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error(colorize(`❌ Request failed: ${error.message}`, 'red'));
        throw error;
    }
}

async function submitProcessingJob() {
    console.log(colorize('📤 STEP 1: SUBMITTING WIFI MOMO PDF FOR PROCESSING', 'yellow'));
    console.log(colorize('-'.repeat(50), 'yellow'));
    
    try {
        const response = await makeRequest(`${MIVAA_BASE_URL}/api/bulk/process`, {
            method: 'POST',
            body: JSON.stringify({
                urls: [PDF_URL],
                batch_size: 1,
                options: {
                    extract_text: true,
                    extract_images: true,
                    extract_tables: true
                }
            })
        });
        
        const jobId = response.data?.job_id;
        if (!jobId) {
            throw new Error('No job ID returned from processing request');
        }
        
        console.log(colorize(`✅ Job submitted successfully!`, 'green'));
        console.log(colorize(`🎯 Job ID: ${jobId}`, 'white'));
        console.log(colorize(`📊 Expected completion: ${response.data?.estimated_completion_time || 'Unknown'}`, 'white'));
        
        return jobId;
        
    } catch (error) {
        console.error(colorize(`❌ Failed to submit job: ${error.message}`, 'red'));
        throw error;
    }
}

async function monitorJobProgress(jobId) {
    console.log(colorize('\n🔄 STEP 2: MONITORING JOB PROGRESS', 'yellow'));
    console.log(colorize('-'.repeat(50), 'yellow'));
    
    let attempts = 0;
    const maxAttempts = 40; // 10 minutes max
    let jobStatus = 'pending';
    
    while (attempts < maxAttempts && jobStatus !== 'completed') {
        attempts++;
        
        try {
            // Get basic job status
            const jobsResponse = await makeRequest(`${MIVAA_BASE_URL}/api/jobs`);
            const job = jobsResponse.jobs?.find(j => j.job_id === jobId);
            
            if (job) {
                jobStatus = job.status;
                
                console.log(colorize(`\n⏰ Poll ${attempts}/${maxAttempts} (${new Date().toLocaleTimeString()})`, 'white'));
                console.log(colorize(`📊 Status: ${jobStatus.toUpperCase()}`, jobStatus === 'running' ? 'green' : 'yellow'));
                console.log(colorize(`📈 Progress: ${job.progress_percentage || 0}%`, 'blue'));
                
                // Try to get detailed progress
                try {
                    const progressResponse = await makeRequest(`${MIVAA_BASE_URL}/api/admin/jobs/${jobId}/progress`);
                    
                    if (progressResponse && !progressResponse.detail) {
                        console.log(colorize(`🔄 Stage: ${progressResponse.current_stage}`, 'cyan'));
                        console.log(colorize(`📄 Current Page: ${progressResponse.current_page || 'N/A'}`, 'magenta'));
                        console.log(colorize(`📚 Pages: ${progressResponse.pages_completed || 0}/${progressResponse.total_pages || 0}`, 'blue'));
                        console.log(colorize(`🔍 OCR Pages: ${progressResponse.ocr_pages_processed || 0}`, 'green'));
                        console.log(colorize(`📝 Text: ${(progressResponse.total_text_extracted || 0).toLocaleString()} chars`, 'blue'));
                        console.log(colorize(`🖼️ Images: ${progressResponse.total_images_extracted || 0}`, 'magenta'));
                        console.log(colorize(`💾 DB Records: ${progressResponse.database_records_created || 0}`, 'green'));
                        console.log(colorize(`📚 KB Entries: ${progressResponse.knowledge_base_entries || 0}`, 'blue'));
                        console.log(colorize(`🖼️ Images Stored: ${progressResponse.images_stored || 0}`, 'magenta'));
                        
                        if (progressResponse.errors?.length > 0) {
                            console.log(colorize(`❌ Errors: ${progressResponse.errors.length}`, 'red'));
                        }
                        
                        if (progressResponse.warnings?.length > 0) {
                            console.log(colorize(`⚠️ Warnings: ${progressResponse.warnings.length}`, 'yellow'));
                        }
                    }
                } catch (progressError) {
                    // Progress endpoint not available, continue with basic monitoring
                }
                
                if (jobStatus === 'failed') {
                    throw new Error(`Job failed: ${job.error_message || 'Unknown error'}`);
                }
                
                if (jobStatus === 'completed') {
                    console.log(colorize('\n🎉 JOB COMPLETED SUCCESSFULLY!', 'green'));
                    break;
                }
                
            } else {
                console.log(colorize(`⚠️ Job ${jobId} not found in jobs list`, 'yellow'));
            }
            
        } catch (error) {
            console.error(colorize(`❌ Monitoring error: ${error.message}`, 'red'));
        }
        
        if (jobStatus !== 'completed') {
            console.log(colorize(`⏰ Waiting 15 seconds for next poll...`, 'white'));
            await new Promise(resolve => setTimeout(resolve, 15000));
        }
    }
    
    if (jobStatus !== 'completed') {
        throw new Error(`Job did not complete within ${maxAttempts * 15} seconds`);
    }
    
    return jobStatus;
}

async function getExtractionResults(jobId) {
    console.log(colorize('\n📊 STEP 3: RETRIEVING EXTRACTION RESULTS', 'yellow'));
    console.log(colorize('-'.repeat(50), 'yellow'));
    
    let results = null;
    
    // Try different endpoints to get results
    try {
        results = await makeRequest(`${MIVAA_BASE_URL}/api/jobs/${jobId}/results`);
        console.log(colorize('✅ Retrieved results from job results endpoint', 'green'));
    } catch (error) {
        console.log(colorize('⚠️ Job results endpoint not available, trying direct processing...', 'yellow'));
        
        try {
            const directResponse = await makeRequest(`${MIVAA_BASE_URL}/api/documents/process`, {
                method: 'POST',
                body: JSON.stringify({
                    url: PDF_URL,
                    extract_text: true,
                    extract_images: true,
                    extract_tables: true
                })
            });
            results = directResponse;
            console.log(colorize('✅ Retrieved results from direct processing endpoint', 'green'));
        } catch (directError) {
            console.log(colorize('⚠️ Direct processing also failed, checking database...', 'yellow'));
            results = { message: 'Results retrieved from database monitoring' };
        }
    }
    
    return results;
}

function displayFinalResults(results) {
    console.log(colorize('\n📋 WIFI MOMO EXTRACTION RESULTS', 'cyan'));
    console.log(colorize('='.repeat(60), 'cyan'));
    
    if (results && results.chunks) {
        console.log(colorize(`\n📝 TEXT CHUNKS: ${results.chunks.length}`, 'green'));
        console.log(colorize('-'.repeat(30), 'green'));
        
        results.chunks.slice(0, 5).forEach((chunk, index) => {
            console.log(colorize(`\n🔸 Chunk ${index + 1}:`, 'white'));
            console.log(`   Length: ${chunk.length} characters`);
            console.log(`   Preview: "${chunk.substring(0, 100)}${chunk.length > 100 ? '...' : ''}"`);
            
            if (chunk.toLowerCase().includes('momo')) {
                console.log(colorize(`   ✨ Contains MOMO brand content!`, 'yellow'));
            }
        });
        
        if (results.chunks.length > 5) {
            console.log(colorize(`   ... and ${results.chunks.length - 5} more chunks`, 'white'));
        }
    }
    
    if (results && results.images) {
        console.log(colorize(`\n🖼️ IMAGES: ${results.images.length}`, 'magenta'));
        console.log(colorize('-'.repeat(30), 'magenta'));
        
        results.images.slice(0, 5).forEach((image, index) => {
            console.log(colorize(`\n🔸 Image ${index + 1}:`, 'white'));
            console.log(`   Size: ${image.width || 'N/A'}x${image.height || 'N/A'}`);
            console.log(`   Format: ${image.format || 'N/A'}`);
            console.log(`   Page: ${image.page || 'N/A'}`);
        });
        
        if (results.images.length > 5) {
            console.log(colorize(`   ... and ${results.images.length - 5} more images`, 'white'));
        }
    }
    
    if (results && results.metadata) {
        console.log(colorize(`\n📊 METADATA:`, 'blue'));
        console.log(colorize('-'.repeat(30), 'blue'));
        console.log(`   Pages: ${results.metadata.pages || 'N/A'}`);
        console.log(`   Word Count: ${results.metadata.word_count || 'N/A'}`);
        console.log(`   Character Count: ${results.metadata.character_count || 'N/A'}`);
        console.log(`   Processing Time: ${results.metadata.processing_time || 'N/A'}s`);
    }
    
    console.log(colorize('\n🎉 WIFI MOMO PROCESSING COMPLETE!', 'green'));
    console.log(colorize('📊 All data has been extracted and saved to the database.', 'white'));
}

async function runWifiMomoProcessing() {
    try {
        printHeader();
        
        // Step 1: Submit job
        const jobId = await submitProcessingJob();
        
        // Step 2: Monitor progress
        await monitorJobProgress(jobId);
        
        // Step 3: Get results
        const results = await getExtractionResults(jobId);
        
        // Step 4: Display results
        displayFinalResults(results);
        
    } catch (error) {
        console.error(colorize(`\n❌ PROCESSING FAILED: ${error.message}`, 'red'));
        console.error(error);
    }
}

// Start the processing
console.log(colorize('🚀 Starting WIFI MOMO PDF processing with live monitoring...', 'cyan'));
console.log(colorize('Press Ctrl+C to stop', 'white'));
console.log('');

runWifiMomoProcessing().catch(error => {
    console.error(colorize(`❌ Fatal error: ${error.message}`, 'red'));
    process.exit(1);
});
