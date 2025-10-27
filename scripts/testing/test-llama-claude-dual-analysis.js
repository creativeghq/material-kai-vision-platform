/**
 * Test Script: Llama 4 Scout + Claude 4.5 Dual-Model Image Analysis
 * 
 * This script validates that the Llama Integration Plan has been successfully implemented:
 * 1. Both Llama and Claude analyses are being performed
 * 2. Both analyses are saved to the database
 * 3. Material properties are properly extracted
 * 4. Quality and confidence scores are calculated
 * 
 * Usage: node scripts/testing/test-llama-claude-dual-analysis.js
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Supabase configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// MIVAA API configuration
const MIVAA_API_URL = process.env.MIVAA_API_URL || 'https://v1api.materialshub.gr';

/**
 * Upload a test PDF and wait for processing to complete
 */
async function uploadAndProcessPDF(pdfPath, catalogName) {
    console.log(`\n📤 Uploading PDF: ${catalogName}`);
    
    const formData = new FormData();
    const pdfBuffer = fs.readFileSync(pdfPath);
    const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
    formData.append('file', blob, path.basename(pdfPath));
    formData.append('catalog_name', catalogName);
    formData.append('category', 'test-llama-integration');
    
    const response = await fetch(`${MIVAA_API_URL}/api/v1/pdf/upload`, {
        method: 'POST',
        body: formData
    });
    
    if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log(`✅ Upload successful. Document ID: ${result.document_id}`);
    
    return result.document_id;
}

/**
 * Wait for PDF processing to complete
 */
async function waitForProcessing(documentId, maxWaitSeconds = 300) {
    console.log(`\n⏳ Waiting for processing to complete (max ${maxWaitSeconds}s)...`);
    
    const startTime = Date.now();
    let lastStatus = '';
    
    while ((Date.now() - startTime) / 1000 < maxWaitSeconds) {
        const { data: doc, error } = await supabase
            .from('documents')
            .select('processing_status, processing_stage')
            .eq('id', documentId)
            .single();
        
        if (error) {
            throw new Error(`Failed to check status: ${error.message}`);
        }
        
        const currentStatus = `${doc.processing_status} - ${doc.processing_stage}`;
        if (currentStatus !== lastStatus) {
            console.log(`   Status: ${currentStatus}`);
            lastStatus = currentStatus;
        }
        
        if (doc.processing_status === 'completed') {
            console.log(`✅ Processing completed!`);
            return true;
        }
        
        if (doc.processing_status === 'failed') {
            throw new Error('Processing failed');
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    throw new Error('Processing timeout');
}

/**
 * Validate that images have both Llama and Claude analyses
 */
async function validateDualAnalysis(documentId) {
    console.log(`\n🔍 Validating dual-model analysis...`);
    
    const { data: images, error } = await supabase
        .from('document_images')
        .select('*')
        .eq('document_id', documentId);
    
    if (error) {
        throw new Error(`Failed to fetch images: ${error.message}`);
    }
    
    console.log(`\n📊 Found ${images.length} images`);
    
    const results = {
        total_images: images.length,
        with_llama_analysis: 0,
        with_claude_validation: 0,
        with_both_analyses: 0,
        with_material_properties: 0,
        with_quality_scores: 0,
        with_confidence_scores: 0,
        analysis_methods: {},
        avg_quality_score: 0,
        avg_confidence_score: 0,
        processing_times: []
    };
    
    let totalQuality = 0;
    let totalConfidence = 0;
    
    for (const image of images) {
        // Check for Llama analysis
        if (image.llama_analysis && Object.keys(image.llama_analysis).length > 0) {
            results.with_llama_analysis++;
        }
        
        // Check for Claude validation
        if (image.claude_validation && Object.keys(image.claude_validation).length > 0) {
            results.with_claude_validation++;
        }
        
        // Check for both
        if (image.llama_analysis && image.claude_validation) {
            results.with_both_analyses++;
        }
        
        // Check analysis metadata
        if (image.analysis_metadata) {
            const metadata = image.analysis_metadata;
            
            // Track analysis method
            const method = metadata.analysis_method || 'unknown';
            results.analysis_methods[method] = (results.analysis_methods[method] || 0) + 1;
            
            // Check for material properties
            if (metadata.material_analysis && Object.keys(metadata.material_analysis).length > 0) {
                results.with_material_properties++;
            }
            
            // Check for quality score
            if (metadata.quality_score !== undefined && metadata.quality_score !== null) {
                results.with_quality_scores++;
                totalQuality += metadata.quality_score;
            }
            
            // Check for confidence score
            if (metadata.confidence_score !== undefined && metadata.confidence_score !== null) {
                results.with_confidence_scores++;
                totalConfidence += metadata.confidence_score;
            }
            
            // Track processing time
            if (metadata.llama_processing_time_ms) {
                results.processing_times.push(metadata.llama_processing_time_ms);
            }
        }
    }
    
    // Calculate averages
    if (results.with_quality_scores > 0) {
        results.avg_quality_score = totalQuality / results.with_quality_scores;
    }
    
    if (results.with_confidence_scores > 0) {
        results.avg_confidence_score = totalConfidence / results.with_confidence_scores;
    }
    
    return results;
}

/**
 * Display validation results
 */
function displayResults(results) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 LLAMA + CLAUDE DUAL-MODEL ANALYSIS VALIDATION RESULTS`);
    console.log(`${'='.repeat(80)}\n`);
    
    console.log(`📸 Total Images: ${results.total_images}`);
    console.log(`\n🤖 AI Model Coverage:`);
    console.log(`   ✅ With Llama Analysis: ${results.with_llama_analysis} (${(results.with_llama_analysis / results.total_images * 100).toFixed(1)}%)`);
    console.log(`   ✅ With Claude Validation: ${results.with_claude_validation} (${(results.with_claude_validation / results.total_images * 100).toFixed(1)}%)`);
    console.log(`   ✅ With BOTH Analyses: ${results.with_both_analyses} (${(results.with_both_analyses / results.total_images * 100).toFixed(1)}%)`);
    
    console.log(`\n📋 Data Quality:`);
    console.log(`   ✅ With Material Properties: ${results.with_material_properties} (${(results.with_material_properties / results.total_images * 100).toFixed(1)}%)`);
    console.log(`   ✅ With Quality Scores: ${results.with_quality_scores} (${(results.with_quality_scores / results.total_images * 100).toFixed(1)}%)`);
    console.log(`   ✅ With Confidence Scores: ${results.with_confidence_scores} (${(results.with_confidence_scores / results.total_images * 100).toFixed(1)}%)`);
    
    console.log(`\n📈 Average Scores:`);
    console.log(`   Quality Score: ${results.avg_quality_score.toFixed(3)}`);
    console.log(`   Confidence Score: ${results.avg_confidence_score.toFixed(3)}`);
    
    console.log(`\n⚙️ Analysis Methods:`);
    for (const [method, count] of Object.entries(results.analysis_methods)) {
        console.log(`   ${method}: ${count} images`);
    }
    
    if (results.processing_times.length > 0) {
        const avgTime = results.processing_times.reduce((a, b) => a + b, 0) / results.processing_times.length;
        console.log(`\n⏱️ Average Processing Time: ${avgTime.toFixed(0)}ms`);
    }
    
    console.log(`\n${'='.repeat(80)}`);
    
    // Validation checks
    const checks = [
        { name: 'All images have Llama analysis', passed: results.with_llama_analysis === results.total_images },
        { name: 'All images have Claude validation', passed: results.with_claude_validation === results.total_images },
        { name: 'All images have both analyses', passed: results.with_both_analyses === results.total_images },
        { name: 'All images have material properties', passed: results.with_material_properties === results.total_images },
        { name: 'All images have quality scores', passed: results.with_quality_scores === results.total_images },
        { name: 'All images have confidence scores', passed: results.with_confidence_scores === results.total_images },
        { name: 'Using dual-model analysis method', passed: results.analysis_methods['llama_claude_dual_vision'] > 0 }
    ];
    
    console.log(`\n✅ VALIDATION CHECKS:\n`);
    let allPassed = true;
    for (const check of checks) {
        const icon = check.passed ? '✅' : '❌';
        console.log(`${icon} ${check.name}`);
        if (!check.passed) allPassed = false;
    }
    
    console.log(`\n${'='.repeat(80)}\n`);
    
    if (allPassed) {
        console.log(`🎉 ALL CHECKS PASSED! Llama + Claude dual-model integration is working correctly!\n`);
    } else {
        console.log(`⚠️ SOME CHECKS FAILED. Please review the implementation.\n`);
    }
    
    return allPassed;
}

/**
 * Main test function
 */
async function main() {
    try {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`🧪 LLAMA + CLAUDE DUAL-MODEL ANALYSIS TEST`);
        console.log(`${'='.repeat(80)}\n`);
        
        // For now, we'll test with an existing document
        // You can uncomment the upload section to test with a new PDF
        
        console.log(`📋 Please provide a document ID to test, or press Enter to use the latest document:`);
        
        // Get latest document
        const { data: latestDoc, error } = await supabase
            .from('documents')
            .select('id, file_name, processing_status')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
        
        if (error || !latestDoc) {
            console.error(`❌ No documents found in database`);
            process.exit(1);
        }
        
        console.log(`\n📄 Using latest document: ${latestDoc.file_name} (ID: ${latestDoc.id})`);
        
        // Validate dual analysis
        const results = await validateDualAnalysis(latestDoc.id);
        
        // Display results
        const allPassed = displayResults(results);
        
        process.exit(allPassed ? 0 : 1);
        
    } catch (error) {
        console.error(`\n❌ Test failed:`, error);
        process.exit(1);
    }
}

main();

