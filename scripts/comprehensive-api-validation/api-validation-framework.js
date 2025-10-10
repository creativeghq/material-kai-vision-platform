#!/usr/bin/env node

/**
 * COMPREHENSIVE API VALIDATION FRAMEWORK
 * 
 * Validates all 58 MIVAA API endpoints for:
 * - Proper frontend-backend connection
 * - No mock data in responses
 * - Correct JSON format
 * - Proper data flow
 * - Authentication working
 * - Error handling
 */

const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  MIVAA_BASE_URL: 'http://104.248.68.3:8000',
  SUPABASE_URL: 'https://bgbavxtjlbvgplozizxu.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg',
  TEST_AUTH_TOKEN: 'test-key',
  FRONTEND_URL: 'http://localhost:8081',
  TIMEOUT: 30000,
  MAX_RETRIES: 3
};

// All 58 MIVAA API Endpoints with validation criteria
const API_ENDPOINTS = [
  // Health & System Endpoints
  { path: '/health', method: 'GET', category: 'health', critical: true, auth: false },
  { path: '/api/health', method: 'GET', category: 'health', critical: true, auth: true },
  { path: '/api/system/health', method: 'GET', category: 'health', critical: true, auth: true },
  { path: '/metrics', method: 'GET', category: 'monitoring', critical: false, auth: false },
  { path: '/performance/summary', method: 'GET', category: 'monitoring', critical: false, auth: false },
  { path: '/api/system/metrics', method: 'GET', category: 'monitoring', critical: false, auth: true },

  // PDF Processing Endpoints (multipart/form-data)
  { path: '/api/pdf/extract/markdown', method: 'POST', category: 'pdf', critical: true, auth: false,
    multipart: true, file_field: 'file' },
  { path: '/api/pdf/extract/tables', method: 'POST', category: 'pdf', critical: true, auth: false,
    multipart: true, file_field: 'file' },
  { path: '/api/pdf/extract/images', method: 'POST', category: 'pdf', critical: true, auth: false,
    multipart: true, file_field: 'file' },
  { path: '/api/documents/process-url', method: 'POST', category: 'pdf', critical: true, auth: true,
    payload: { url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', extractionType: 'all', outputFormat: 'json' } },

  // Document Processing Endpoints
  { path: '/api/documents/analyze', method: 'POST', category: 'documents', critical: true, auth: false,
    multipart: true, file_field: 'file' },
  { path: '/api/documents/process', method: 'POST', category: 'documents', critical: true, auth: false,
    multipart: true, file_field: 'file' },
  { path: '/api/documents/batch-process-fixed', method: 'POST', category: 'documents', critical: false, auth: false,
    payload: { urls: ['https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'] } },
  { path: '/api/documents/documents', method: 'GET', category: 'documents', critical: false, auth: false },
  { path: '/api/documents/health', method: 'GET', category: 'documents', critical: false, auth: false },

  // Image Analysis Endpoints
  { path: '/api/images/analyze', method: 'POST', category: 'images', critical: true, auth: false,
    payload: { image_url: 'https://example.com/test.jpg', analysis_types: ['description'] } },
  { path: '/api/images/analyze/batch', method: 'POST', category: 'images', critical: false, auth: false,
    payload: { image_ids: ['img_123', 'img_456'], analysis_types: ['description', 'ocr'] } },
  { path: '/api/images/search', method: 'POST', category: 'images', critical: true, auth: false,
    payload: { query_description: 'carbon fiber material', limit: 5, similarity_threshold: 0.7 } },
  { path: '/api/images/health', method: 'GET', category: 'images', critical: false, auth: false },
  { path: '/api/images/upload-and-analyze', method: 'POST', category: 'images', critical: false, auth: false,
    multipart: true, file_field: 'file' },

  // Material Analysis Endpoints
  { path: '/api/analyze/materials/image', method: 'POST', category: 'materials', critical: true, auth: true,
    payload: { image_data: 'https://example.com/material.jpg', analysis_type: 'comprehensive' } },
  { path: '/api/search/materials/visual', method: 'POST', category: 'materials', critical: true, auth: true,
    payload: { query_image: 'https://example.com/material.jpg', limit: 10 } },
  { path: '/api/embeddings/materials/generate', method: 'POST', category: 'materials', critical: true, auth: true,
    payload: { image_data: 'https://example.com/material.jpg', embedding_types: ['clip'] } },
  { path: '/api/search/materials/health', method: 'GET', category: 'materials', critical: false, auth: true },

  // Search Endpoints
  { path: '/api/search/semantic', method: 'POST', category: 'search', critical: true, auth: true,
    payload: { query: 'sustainable materials', limit: 10, similarity_threshold: 0.7 } },
  { path: '/api/search/similarity', method: 'POST', category: 'search', critical: true, auth: true,
    payload: { reference_text: 'carbon fiber composite materials', limit: 5, similarity_threshold: 0.7 } },
  { path: '/api/search/multimodal', method: 'POST', category: 'search', critical: true, auth: true,
    payload: { query: 'metal alloys', include_image_context: true, limit: 10, similarity_threshold: 0.7 } },
  { path: '/api/search/images', method: 'POST', category: 'search', critical: true, auth: true,
    payload: { query: 'composite materials', limit: 10, similarity_threshold: 0.7, include_ocr_text: true } },
  { path: '/api/search/health', method: 'GET', category: 'search', critical: false, auth: true },

  // RAG System Endpoints
  { path: '/api/rag/query', method: 'POST', category: 'rag', critical: true, auth: true,
    payload: { query: 'What are the properties of carbon fiber?', limit: 5 } },
  { path: '/api/rag/search', method: 'POST', category: 'rag', critical: true, auth: true,
    payload: { query: 'material properties', limit: 10 } },
  { path: '/api/rag/chat', method: 'POST', category: 'rag', critical: true, auth: true,
    payload: { message: 'Tell me about sustainable materials', conversation_id: 'test-123' } },
  { path: '/api/rag/documents/upload', method: 'POST', category: 'rag', critical: false, auth: false,
    multipart: true, file_field: 'file' },
  { path: '/api/rag/documents', method: 'GET', category: 'rag', critical: false, auth: true },
  { path: '/api/rag/health', method: 'GET', category: 'rag', critical: false, auth: true },
  { path: '/api/rag/stats', method: 'GET', category: 'rag', critical: false, auth: true },

  // AI Analysis Endpoints
  { path: '/api/semantic-analysis', method: 'POST', category: 'ai', critical: true, auth: true,
    payload: { image_data: 'https://example.com/material.jpg', analysis_type: 'material_identification' } },
  { path: '/api/analyze/multimodal', method: 'POST', category: 'ai', critical: true, auth: true,
    payload: { document_id: 'test_doc_123', analysis_types: ['text_analysis', 'image_analysis'], include_text_analysis: true, include_image_analysis: true } },
  { path: '/api/query/multimodal', method: 'POST', category: 'ai', critical: true, auth: true,
    payload: { question: 'What type of material is this?', max_context_chunks: 5, temperature: 0.7, max_tokens: 500 } },

  // Jobs & Processing Endpoints
  { path: '/api/jobs', method: 'GET', category: 'jobs', critical: false, auth: true },
  { path: '/api/jobs/statistics', method: 'GET', category: 'jobs', critical: false, auth: true },
  { path: '/api/bulk/process', method: 'POST', category: 'jobs', critical: false, auth: true,
    payload: { urls: ['https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'], batch_size: 5 } },

  // Data Management Endpoints
  { path: '/api/data/export', method: 'GET', category: 'data', critical: false, auth: true },
  { path: '/api/data/backup', method: 'POST', category: 'data', critical: false, auth: true },
  { path: '/api/data/cleanup', method: 'DELETE', category: 'data', critical: false, auth: true },

  // Models & Packages
  { path: '/api/models', method: 'GET', category: 'system', critical: false, auth: true },
  { path: '/api/packages/status', method: 'GET', category: 'system', critical: false, auth: true },

  // Root endpoint
  { path: '/', method: 'GET', category: 'root', critical: true, auth: false }
];

// MIVAA Gateway Actions (27+ actions)
const GATEWAY_ACTIONS = [
  { action: 'health_check', critical: true, payload: {} },
  { action: 'pdf_process_document', critical: true, payload: { documentId: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', extractionType: 'all' } },
  { action: 'material_recognition', critical: true, payload: { image_data: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64', analysis_type: 'comprehensive' } },
  { action: 'semantic_search', critical: true, payload: { query: 'carbon fiber materials', limit: 10 } },
  { action: 'generate_embedding', critical: true, payload: { image_data: 'https://images.unsplash.com/photo-1567789884554-0b844b597180', embedding_types: ['clip'] } },
  { action: 'llama_vision_analysis', critical: true, payload: { document_id: 'test-doc-456', analysis_types: ['image', 'material'], enable_llama_vision: true, enable_material_analysis: true } },
  { action: 'chat_completion', critical: true, payload: { message: 'What are carbon fiber properties?', conversation_id: 'test-123' } },
  { action: 'vector_search', critical: true, payload: { reference_text: 'carbon fiber composite materials', limit: 5, similarity_threshold: 0.5 } },
  { action: 'multimodal_analysis', critical: true, payload: { document_id: 'test-doc-123', analysis_types: ['text', 'image'], include_text_analysis: true, include_image_analysis: true } },
  { action: 'clip_embedding_generation', critical: false, payload: { image_data: 'https://images.unsplash.com/photo-1567789884554-0b844b597180', embedding_types: ['clip'] } }
];

// Validation Results Storage
const validationResults = {
  timestamp: new Date().toISOString(),
  summary: {
    total_endpoints: API_ENDPOINTS.length,
    total_gateway_actions: GATEWAY_ACTIONS.length,
    passed: 0,
    failed: 0,
    critical_passed: 0,
    critical_failed: 0,
    categories: {}
  },
  endpoints: [],
  gateway_actions: [],
  issues: [],
  recommendations: []
};

console.log('🚀 COMPREHENSIVE API VALIDATION FRAMEWORK');
console.log('==========================================');
console.log(`📊 Total Endpoints to Validate: ${API_ENDPOINTS.length}`);
console.log(`🔗 Total Gateway Actions to Validate: ${GATEWAY_ACTIONS.length}`);
console.log(`🎯 MIVAA Service: ${CONFIG.MIVAA_BASE_URL}`);
console.log(`🌐 Supabase: ${CONFIG.SUPABASE_URL}`);
console.log('==========================================\n');

// Export for use by validation scripts
module.exports = {
  CONFIG,
  API_ENDPOINTS,
  GATEWAY_ACTIONS,
  validationResults
};
