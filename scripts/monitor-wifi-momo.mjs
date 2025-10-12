#!/usr/bin/env node

/**
 * LIVE MONITORING: WIFI MOMO PDF Processing
 * 
 * Real-time terminal monitoring with polling using built-in Node.js modules
 */

import { createRequire } from 'module';
import https from 'https';
import http from 'http';

const require = createRequire(import.meta.url);

const MIVAA_BASE_URL = 'http://localhost:8000';
const JOB_ID = 'bulk_20251012_093129';

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

function httpGet(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        client.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(data);
                }
            });
        }).on('error', reject);
    });
}

function printHeader() {
    console.clear();
    console.log(colorize('🚀 WIFI MOMO PDF PROCESSING - LIVE MONITORING', 'cyan'));
    console.log(colorize('=' .repeat(60), 'blue'));
    console.log(colorize(`📋 Job ID: ${JOB_ID}`, 'white'));
    console.log(colorize(`🕐 Started: ${new Date().toLocaleString()}`, 'white'));
    console.log('');
}

function printProgressBar(percentage, width = 40) {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `[${bar}] ${percentage.toFixed(1)}%`;
}

async function getJobStatus() {
    try {
        const data = await httpGet(`${MIVAA_BASE_URL}/api/jobs`);
        return data.jobs?.find(job => job.job_id === JOB_ID);
    } catch (error) {
        return null;
    }
}

async function getDetailedProgress() {
    try {
        const data = await httpGet(`${MIVAA_BASE_URL}/api/admin/jobs/${JOB_ID}/progress`);
        return data;
    } catch (error) {
        return null;
    }
}

function displayStatus(jobStatus, progress) {
    console.log(colorize('📊 CURRENT STATUS', 'yellow'));
    console.log(colorize('-'.repeat(20), 'yellow'));
    
    if (jobStatus) {
        console.log(`${colorize('Status:', 'white')} ${colorize(jobStatus.status.toUpperCase(), jobStatus.status === 'running' ? 'green' : 'red')}`);
        console.log(`${colorize('Created:', 'white')} ${new Date(jobStatus.created_at).toLocaleTimeString()}`);
        console.log(`${colorize('Progress:', 'white')} ${colorize(printProgressBar(jobStatus.progress_percentage || 0), 'green')}`);
    }
    
    if (progress && !progress.detail) {
        console.log(`${colorize('Stage:', 'white')} ${colorize(progress.current_stage, 'cyan')}`);
        console.log(`${colorize('Current Page:', 'white')} ${colorize(progress.current_page || 'N/A', 'magenta')}`);
        console.log(`${colorize('Pages Done:', 'white')} ${colorize(`${progress.pages_completed}/${progress.total_pages}`, 'blue')}`);
        
        if (progress.average_page_processing_time) {
            console.log(`${colorize('Avg Time/Page:', 'white')} ${colorize(`${progress.average_page_processing_time.toFixed(1)}s`, 'cyan')}`);
        }
    }
    
    console.log('');
}

function displayOCRProgress(progress) {
    if (!progress || progress.detail) return;
    
    console.log(colorize('🔍 OCR & EXTRACTION PROGRESS', 'yellow'));
    console.log(colorize('-'.repeat(30), 'yellow'));
    console.log(`${colorize('OCR Pages:', 'white')} ${colorize(progress.ocr_pages_processed || 0, 'green')}`);
    console.log(`${colorize('Text Extracted:', 'white')} ${colorize(`${(progress.total_text_extracted || 0).toLocaleString()} chars`, 'blue')}`);
    console.log(`${colorize('Images Found:', 'white')} ${colorize(progress.total_images_extracted || 0, 'magenta')}`);
    console.log('');
}

function displayDatabaseStatus(progress) {
    if (!progress || progress.detail) return;
    
    console.log(colorize('💾 DATABASE INTEGRATION', 'yellow'));
    console.log(colorize('-'.repeat(25), 'yellow'));
    console.log(`${colorize('DB Records:', 'white')} ${colorize(progress.database_records_created || 0, 'green')}`);
    console.log(`${colorize('KB Entries:', 'white')} ${colorize(progress.knowledge_base_entries || 0, 'blue')}`);
    console.log(`${colorize('Images Stored:', 'white')} ${colorize(progress.images_stored || 0, 'magenta')}`);
    console.log('');
}

function displayFinalResults(progress) {
    console.clear();
    console.log(colorize('🎉 WIFI MOMO PDF PROCESSING COMPLETED!', 'green'));
    console.log(colorize('=' .repeat(50), 'green'));
    console.log('');
    
    console.log(colorize('📋 FINAL EXTRACTION RESULTS:', 'cyan'));
    console.log(colorize('-'.repeat(30), 'cyan'));
    console.log(`${colorize('📝 Text Chunks:', 'white')} ${colorize(progress.knowledge_base_entries || 0, 'green')}`);
    console.log(`${colorize('🖼️ Images:', 'white')} ${colorize(progress.images_stored || 0, 'green')}`);
    console.log(`${colorize('📄 Pages Processed:', 'white')} ${colorize(`${progress.pages_completed || 0}/${progress.total_pages || 0}`, 'green')}`);
    console.log(`${colorize('💾 Database Records:', 'white')} ${colorize(progress.database_records_created || 0, 'green')}`);
    console.log('');
    
    console.log(colorize('📊 PROCESSING STATISTICS:', 'cyan'));
    console.log(colorize('-'.repeat(25), 'cyan'));
    console.log(`${colorize('OCR Pages:', 'white')} ${colorize(progress.ocr_pages_processed || 0, 'blue')}`);
    console.log(`${colorize('Text Extracted:', 'white')} ${colorize(`${(progress.total_text_extracted || 0).toLocaleString()} characters`, 'blue')}`);
    console.log(`${colorize('Images Extracted:', 'white')} ${colorize(progress.total_images_extracted || 0, 'blue')}`);
    console.log(`${colorize('Processing Time:', 'white')} ${colorize(`${progress.average_page_processing_time?.toFixed(1) || 'N/A'}s per page`, 'blue')}`);
    console.log('');
    
    if ((progress.pages_failed || 0) > 0 || (progress.pages_skipped || 0) > 0) {
        console.log(colorize('⚠️ ISSUES SUMMARY:', 'yellow'));
        console.log(colorize('-'.repeat(17), 'yellow'));
        console.log(`${colorize('Failed Pages:', 'red')} ${progress.pages_failed || 0}`);
        console.log(`${colorize('Skipped Pages:', 'yellow')} ${progress.pages_skipped || 0}`);
        console.log('');
    }
    
    console.log(colorize('✅ Processing completed successfully!', 'green'));
    console.log(colorize('📊 All data has been saved to the database and is ready for search.', 'white'));
}

async function monitorJob() {
    let pollCount = 0;
    const maxPolls = 60; // 30 minutes max
    
    while (pollCount < maxPolls) {
        pollCount++;
        
        try {
            const [jobStatus, progress] = await Promise.all([
                getJobStatus(),
                getDetailedProgress()
            ]);
            
            printHeader();
            console.log(colorize(`🔄 Poll #${pollCount} - ${new Date().toLocaleTimeString()}`, 'white'));
            console.log('');
            
            displayStatus(jobStatus, progress);
            displayOCRProgress(progress);
            displayDatabaseStatus(progress);
            
            if (progress && progress.errors?.length > 0) {
                console.log(colorize('❌ ERRORS:', 'red'));
                progress.errors.forEach((error, i) => {
                    console.log(`   ${i + 1}. ${error.title}: ${error.message}`);
                });
                console.log('');
            }
            
            // Check if completed
            if (progress?.current_stage === 'completed') {
                displayFinalResults(progress);
                break;
            } else if (progress?.current_stage === 'failed' || jobStatus?.status === 'failed') {
                console.log(colorize('❌ PROCESSING FAILED!', 'red'));
                break;
            } else if (jobStatus?.status === 'completed') {
                console.log(colorize('✅ JOB COMPLETED!', 'green'));
                if (progress && !progress.detail) {
                    displayFinalResults(progress);
                } else {
                    console.log(colorize('📊 Final results will be available in the database.', 'white'));
                }
                break;
            }
            
            console.log(colorize(`⏰ Next update in 30 seconds... (Poll ${pollCount}/${maxPolls})`, 'white'));
            
        } catch (error) {
            console.log(colorize(`❌ Monitoring error: ${error.message}`, 'red'));
        }
        
        // Wait 30 seconds before next poll
        await new Promise(resolve => setTimeout(resolve, 30000));
    }
    
    if (pollCount >= maxPolls) {
        console.log(colorize('⏰ Maximum polling time reached', 'yellow'));
    }
}

// Start monitoring
console.log(colorize('🚀 Starting live monitoring for WIFI MOMO PDF processing...', 'cyan'));
console.log(colorize('Press Ctrl+C to stop monitoring', 'white'));
console.log('');

monitorJob().catch(error => {
    console.error(colorize(`❌ Fatal error: ${error.message}`, 'red'));
    process.exit(1);
});
