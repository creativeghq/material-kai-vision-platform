#!/usr/bin/env node

/**
 * Check Database Images Script
 * 
 * Queries the database directly to check how many images exist for a document
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable not set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkDatabaseImages(documentId) {
  console.log('\n' + '='.repeat(80));
  console.log('DATABASE IMAGE CHECK');
  console.log('='.repeat(80));
  console.log(`Document ID: ${documentId}\n`);
  
  // Query total count
  const { count, error } = await supabase
    .from('document_images')
    .select('*', { count: 'exact', head: true })
    .eq('document_id', documentId);
  
  if (error) {
    console.error('❌ Error querying images:', error);
    return;
  }
  
  console.log(`Total Images in Database: ${count}`);
  
  // Query with embeddings
  const { data: images, error: queryError } = await supabase
    .from('document_images')
    .select('id, page_number, image_url, visual_clip_embedding_512, processing_status')
    .eq('document_id', documentId)
    .order('page_number');
  
  if (queryError) {
    console.error('❌ Error querying image details:', queryError);
    return;
  }
  
  const withClip = images.filter(img => img.visual_clip_embedding_512).length;
  const completed = images.filter(img => img.processing_status === 'completed').length;
  const pending = images.filter(img => img.processing_status === 'pending_analysis').length;
  
  console.log(`Images with CLIP embeddings: ${withClip}/${count}`);
  console.log(`Processing Status:`);
  console.log(`  - Completed: ${completed}`);
  console.log(`  - Pending: ${pending}`);
  
  // Group by page
  const pages = {};
  images.forEach(img => {
    pages[img.page_number] = (pages[img.page_number] || 0) + 1;
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('IMAGES PER PAGE');
  console.log('='.repeat(80));
  Object.keys(pages).sort((a, b) => parseInt(a) - parseInt(b)).forEach(page => {
    const pageImages = images.filter(img => img.page_number === parseInt(page));
    const withClipOnPage = pageImages.filter(img => img.visual_clip_embedding_512).length;
    console.log(`Page ${page.toString().padStart(3)}: ${pages[page].toString().padStart(2)} images (${withClipOnPage} with CLIP)`);
  });
  
  console.log('='.repeat(80) + '\n');
}

// Get document ID from command line
const documentId = process.argv[2];

if (!documentId) {
  console.error('Usage: node check-database-images.js <document_id>');
  process.exit(1);
}

checkDatabaseImages(documentId).catch(console.error);

