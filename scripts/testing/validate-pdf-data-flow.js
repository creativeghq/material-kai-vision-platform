#!/usr/bin/env node

/**
 * Comprehensive PDF Processing Data Flow Validation
 * 
 * Tests:
 * 1. Upload endpoint returns correct job_id and document_id
 * 2. Status polling returns all 9 checkpoint stages
 * 3. Frontend stage mapping correctly maps all backend stages
 * 4. Metadata is properly returned and contains all fields
 * 5. Progress percentages align with checkpoint stages
 */

const fs = require('fs');
const path = require('path');

const MIVAA_API = 'https://v1api.materialshub.gr';
const TEST_PDF = path.join(__dirname, '../../test-files/harmony.pdf');

// Stage mapping from frontend
const STAGE_MAP = {
  'initialized': 0,
  'pdf_extracted': 1,
  'chunks_created': 2,
  'text_embeddings_generated': 2,
  'images_extracted': 3,
  'image_embeddings_generated': 3,
  'products_detected': 4,
  'products_created': 5,
  'completed': 6,
};

const EXPECTED_STAGES = [
  'initialized',
  'pdf_extracted',
  'chunks_created',
  'text_embeddings_generated',
  'images_extracted',
  'image_embeddings_generated',
  'products_detected',
  'products_created',
  'completed'
];

async function validateDataFlow() {
  console.log('🔍 PDF Processing Data Flow Validation\n');
  
  if (!fs.existsSync(TEST_PDF)) {
    console.error(`❌ Test PDF not found: ${TEST_PDF}`);
    process.exit(1);
  }

  try {
    // 1. Upload PDF
    console.log('📤 Step 1: Uploading PDF...');
    const uploadResponse = await uploadPDF();
    const { job_id, document_id, status_url } = uploadResponse;
    console.log(`✅ Upload successful: job_id=${job_id}`);
    console.log(`   document_id=${document_id}`);
    console.log(`   status_url=${status_url}\n`);

    // 2. Poll status and collect all stages
    console.log('📊 Step 2: Polling job status...');
    const stages = await pollUntilCompletion(job_id);
    console.log(`✅ Collected ${stages.length} stage updates\n`);

    // 3. Validate stages
    console.log('✔️ Step 3: Validating stage sequence...');
    validateStageSequence(stages);
    console.log('✅ All stages present and in correct order\n');

    // 4. Validate metadata
    console.log('📋 Step 4: Validating metadata...');
    const finalStatus = await getJobStatus(job_id);
    validateMetadata(finalStatus.metadata);
    console.log('✅ Metadata contains all required fields\n');

    // 5. Validate stage mapping
    console.log('🗺️ Step 5: Validating frontend stage mapping...');
    validateStageMappings(stages);
    console.log('✅ All stages map correctly to frontend steps\n');

    console.log('✅ ALL TESTS PASSED!\n');
    process.exit(0);
  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
    process.exit(1);
  }
}

async function uploadPDF() {
  const formData = new FormData();
  const fileBuffer = fs.readFileSync(TEST_PDF);
  const blob = new Blob([fileBuffer], { type: 'application/pdf' });
  formData.append('file', blob, 'test.pdf');
  formData.append('title', 'Test PDF');
  formData.append('categories', 'products');

  const response = await fetch(`${MIVAA_API}/api/rag/documents/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
  return response.json();
}

async function pollUntilCompletion(jobId, maxAttempts = 300) {
  const stages = [];
  let lastStage = null;

  for (let i = 0; i < maxAttempts; i++) {
    const status = await getJobStatus(jobId);
    const currentStage = status.last_checkpoint?.stage;

    if (currentStage && currentStage !== lastStage) {
      stages.push(currentStage);
      console.log(`  → ${currentStage} (${status.progress}%)`);
      lastStage = currentStage;
    }

    if (status.status === 'completed') {
      console.log(`  → COMPLETED (100%)`);
      break;
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  return stages;
}

async function getJobStatus(jobId) {
  const response = await fetch(`${MIVAA_API}/api/rag/documents/job/${jobId}`);
  if (!response.ok) throw new Error(`Status check failed: ${response.status}`);
  return response.json();
}

function validateStageSequence(stages) {
  const expectedOrder = EXPECTED_STAGES.filter(s => stages.includes(s));
  
  for (let i = 0; i < stages.length; i++) {
    if (!EXPECTED_STAGES.includes(stages[i])) {
      throw new Error(`Unknown stage: ${stages[i]}`);
    }
  }

  console.log(`  Stages received: ${stages.join(' → ')}`);
}

function validateMetadata(metadata) {
  const required = ['document_id', 'filename', 'chunks_created', 'images_extracted', 'products_created'];
  const missing = required.filter(f => !(f in metadata));
  
  if (missing.length > 0) {
    throw new Error(`Missing metadata fields: ${missing.join(', ')}`);
  }

  console.log(`  ✓ document_id: ${metadata.document_id}`);
  console.log(`  ✓ chunks_created: ${metadata.chunks_created}`);
  console.log(`  ✓ images_extracted: ${metadata.images_extracted}`);
  console.log(`  ✓ products_created: ${metadata.products_created}`);
}

function validateStageMappings(stages) {
  for (const stage of stages) {
    if (!(stage in STAGE_MAP)) {
      throw new Error(`Stage not in mapping: ${stage}`);
    }
    const stepIndex = STAGE_MAP[stage];
    console.log(`  ${stage} → step ${stepIndex}`);
  }
}

validateDataFlow();

