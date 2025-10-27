#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function getLatestDocument() {
  console.log('🔍 Fetching latest document...\n');
  
  // Get latest document
  const { data: docs, error } = await supabase
    .from('documents')
    .select('id, title, created_at, metadata')
    .order('created_at', { ascending: false })
    .limit(5);
  
  if (error) {
    console.error('❌ Error fetching documents:', error);
    return;
  }
  
  console.log('📄 Latest 5 documents:');
  docs.forEach((doc, i) => {
    console.log(`${i + 1}. ${doc.id} - ${doc.title} (${new Date(doc.created_at).toLocaleString()})`);
  });
  
  if (docs.length === 0) {
    console.log('No documents found');
    return;
  }
  
  const latestDoc = docs[0];
  console.log(`\n✅ Latest document: ${latestDoc.id}`);
  console.log(`   Title: ${latestDoc.title}`);
  console.log(`   Created: ${new Date(latestDoc.created_at).toLocaleString()}`);
  
  // Get chunks count
  const { count: chunksCount } = await supabase
    .from('document_chunks')
    .select('*', { count: 'exact', head: true })
    .eq('document_id', latestDoc.id);
  
  // Get images count
  const { count: imagesCount } = await supabase
    .from('document_images')
    .select('*', { count: 'exact', head: true })
    .eq('document_id', latestDoc.id);
  
  // Get products count
  const { count: productsCount } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('source_document_id', latestDoc.id);
  
  // Get embeddings count
  const { data: chunks } = await supabase
    .from('document_chunks')
    .select('id')
    .eq('document_id', latestDoc.id);
  
  let embeddingsCount = 0;
  if (chunks && chunks.length > 0) {
    const chunkIds = chunks.map(c => c.id);
    const { count } = await supabase
      .from('embeddings')
      .select('*', { count: 'exact', head: true })
      .in('chunk_id', chunkIds);
    embeddingsCount = count || 0;
  }
  
  console.log(`\n📊 STATS:`);
  console.log(`   Chunks: ${chunksCount || 0}`);
  console.log(`   Images: ${imagesCount || 0}`);
  console.log(`   Products: ${productsCount || 0}`);
  console.log(`   Text Embeddings: ${embeddingsCount}`);
  
  return latestDoc.id;
}

getLatestDocument().catch(console.error);

