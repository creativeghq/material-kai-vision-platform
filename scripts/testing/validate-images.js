#!/usr/bin/env node

/**
 * Image Validation Script
 * 
 * Validates images extracted from a PDF document
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable not set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function validateImages(documentId) {
  console.log('\n' + '='.repeat(80));
  console.log('IMAGE VALIDATION REPORT');
  console.log('='.repeat(80));
  console.log(`Document ID: ${documentId}\n`);
  
  // Query images
  const { data: images, error } = await supabase
    .from('document_images')
    .select('id, page_number, image_path, visual_clip_embedding_512, color_embedding_256, texture_embedding_256, application_embedding_512')
    .eq('document_id', documentId);
  
  if (error) {
    console.error('❌ Error querying images:', error);
    return;
  }
  
  console.log(`Total Images: ${images.length}`);
  console.log('='.repeat(80) + '\n');
  
  // Count embeddings
  const clipCount = images.filter(img => img.visual_clip_embedding_512).length;
  const colorCount = images.filter(img => img.color_embedding_256).length;
  const textureCount = images.filter(img => img.texture_embedding_256).length;
  const applicationCount = images.filter(img => img.application_embedding_512).length;
  
  console.log(`CLIP Embeddings (512D):        ${clipCount}/${images.length} (${(clipCount/images.length*100).toFixed(1)}%)`);
  console.log(`Color Embeddings (256D):       ${colorCount}/${images.length} (${(colorCount/images.length*100).toFixed(1)}%)`);
  console.log(`Texture Embeddings (256D):     ${textureCount}/${images.length} (${(textureCount/images.length*100).toFixed(1)}%)`);
  console.log(`Application Embeddings (512D): ${applicationCount}/${images.length} (${(applicationCount/images.length*100).toFixed(1)}%)`);
  
  // Group by page
  const pages = {};
  images.forEach(img => {
    pages[img.page_number] = (pages[img.page_number] || 0) + 1;
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('IMAGES PER PAGE (First 20)');
  console.log('='.repeat(80));
  Object.keys(pages).sort((a, b) => parseInt(a) - parseInt(b)).slice(0, 20).forEach(page => {
    console.log(`Page ${page.toString().padStart(3)}: ${pages[page].toString().padStart(4)} images`);
  });
  
  if (Object.keys(pages).length > 20) {
    console.log(`... and ${Object.keys(pages).length - 20} more pages`);
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Pages with Images: ${Object.keys(pages).length}`);
  console.log(`Average Images per Page: ${(images.length / Object.keys(pages).length).toFixed(1)}`);
  console.log(`Max Images on a Page:    ${Math.max(...Object.values(pages))}`);
  console.log(`Min Images on a Page:    ${Math.min(...Object.values(pages))}`);
  console.log('='.repeat(80) + '\n');
}

// Get document ID from command line
const documentId = process.argv[2];

if (!documentId) {
  console.error('Usage: node validate-images.js <document_id>');
  process.exit(1);
}

validateImages(documentId).catch(console.error);

