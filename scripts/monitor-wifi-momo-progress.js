#!/usr/bin/env node

/**
 * Real-time progress monitoring for WIFI MOMO PDF processing
 * 
 * This script demonstrates the polling mechanism you requested:
 * - Shows current processing stage
 * - Tracks page-by-page progress
 * - Monitors OCR status and confidence
 * - Reports database integration status
 * - Shows errors and warnings in real-time
 * - Displays performance metrics
 */

const axios = require('axios');

const MIVAA_BASE_URL = 'http://localhost:8000';
const JOB_ID = 'bulk_20251012_090005'; // Current WIFI MOMO job

async function getJobProgress(jobId) {
    try {
        const response = await axios.get(`${MIVAA_BASE_URL}/api/admin/jobs/${jobId}/progress`);
        return response.data;
    } catch (error) {
        if (error.response?.status === 404) {
            return null; // Progress tracking not available yet
        }
        throw error;
    }
}

async function getBasicJobStatus(jobId) {
    try {
        const response = await axios.get(`${MIVAA_BASE_URL}/api/jobs`);
        const jobs = response.data.jobs || [];
        return jobs.find(job => job.job_id === jobId);
    } catch (error) {
        console.error('Error getting basic job status:', error.message);
        return null;
    }
}

async function getPageProgress(jobId) {
    try {
        const response = await axios.get(`${MIVAA_BASE_URL}/api/admin/jobs/${jobId}/progress/pages`);
        return response.data;
    } catch (error) {
        if (error.response?.status === 404) {
            return null;
        }
        throw error;
    }
}

function formatProgress(progress) {
    if (!progress) return "Progress tracking not available";
    
    const {
        current_stage,
        progress_percentage,
        pages_completed,
        total_pages,
        current_page,
        errors,
        warnings,
        database_records_created,
        knowledge_base_entries,
        images_stored,
        ocr_pages_processed,
        total_text_extracted,
        total_images_extracted,
        average_page_processing_time
    } = progress;
    
    return `
📊 DETAILED PROGRESS REPORT
==========================
🔄 Current Stage: ${current_stage}
📈 Progress: ${progress_percentage.toFixed(1)}%
📄 Pages: ${pages_completed}/${total_pages} completed
🔄 Current Page: ${current_page || 'N/A'}
⚡ Avg Time/Page: ${average_page_processing_time ? `${average_page_processing_time.toFixed(1)}s` : 'N/A'}

📊 OCR PROCESSING
================
🔍 OCR Pages Processed: ${ocr_pages_processed}
📝 Total Text Extracted: ${total_text_extracted} characters
🖼️ Total Images Extracted: ${total_images_extracted}

💾 DATABASE INTEGRATION
======================
📋 DB Records Created: ${database_records_created}
📚 Knowledge Base Entries: ${knowledge_base_entries}
🖼️ Images Stored: ${images_stored}

⚠️ ISSUES TRACKING
==================
❌ Errors: ${errors?.length || 0}
⚠️ Warnings: ${warnings?.length || 0}
`;
}

function formatPageDetails(pageProgress) {
    if (!pageProgress) return "Page details not available";
    
    const { summary, current_page, current_stage } = pageProgress.data;
    
    return `
📄 PAGE-BY-PAGE STATUS
=====================
📊 Summary:
   ✅ Success: ${summary.success}
   🔄 Processing: ${summary.processing}
   ⏳ Pending: ${summary.pending}
   ❌ Failed: ${summary.failed}
   ⏭️ Skipped: ${summary.skipped}

🔄 Current: Page ${current_page} (${current_stage})
`;
}

async function monitorProgress() {
    console.log('🚀 WIFI MOMO PDF PROGRESS MONITORING');
    console.log('====================================');
    console.log(`📋 Job ID: ${JOB_ID}`);
    console.log(`⏰ Started: ${new Date().toLocaleTimeString()}`);
    console.log('');
    
    let checkCount = 0;
    const maxChecks = 40; // 10 minutes of monitoring
    
    while (checkCount < maxChecks) {
        checkCount++;
        console.log(`\n⏰ Check ${checkCount}/${maxChecks} (${new Date().toLocaleTimeString()})`);
        console.log('='.repeat(50));
        
        try {
            // Try to get detailed progress first
            const progress = await getJobProgress(JOB_ID);
            
            if (progress) {
                console.log(formatProgress(progress));
                
                // Get page details
                const pageProgress = await getPageProgress(JOB_ID);
                if (pageProgress) {
                    console.log(formatPageDetails(pageProgress));
                }
                
                // Check if completed
                if (progress.current_stage === 'completed' || progress.current_stage === 'failed') {
                    console.log(`\n🎉 PROCESSING COMPLETED!`);
                    console.log(`📊 Final Status: ${progress.current_stage}`);
                    
                    // Show final results
                    console.log(`\n📋 FINAL RESULTS:`);
                    console.log(`   📝 Text Chunks: ${progress.knowledge_base_entries}`);
                    console.log(`   🖼️ Images: ${progress.images_stored}`);
                    console.log(`   📄 Pages Processed: ${progress.pages_completed}/${progress.total_pages}`);
                    console.log(`   💾 Database Records: ${progress.database_records_created}`);
                    break;
                }
            } else {
                // Fallback to basic status
                const basicStatus = await getBasicJobStatus(JOB_ID);
                if (basicStatus) {
                    console.log(`📊 Basic Status: ${basicStatus.status}`);
                    console.log(`📈 Progress: ${basicStatus.progress_percentage}%`);
                    
                    if (basicStatus.status === 'completed' || basicStatus.status === 'failed') {
                        console.log(`\n🎉 PROCESSING COMPLETED!`);
                        console.log(`📊 Final Status: ${basicStatus.status}`);
                        break;
                    }
                } else {
                    console.log('⚠️ Could not retrieve job status');
                }
            }
            
        } catch (error) {
            console.error(`❌ Error during monitoring: ${error.message}`);
        }
        
        // Wait 15 seconds before next check
        await new Promise(resolve => setTimeout(resolve, 15000));
    }
    
    console.log('\n📊 Monitoring completed');
}

// Start monitoring
monitorProgress().catch(console.error);
