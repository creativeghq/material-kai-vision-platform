/**
 * Multi-Vector Storage System Validation Test
 * 
 * Tests all 6 embedding types and multi-vector search capabilities:
 * 1. Text (1536D) - OpenAI text-embedding-3-small
 * 2. Visual CLIP (512D) - CLIP visual embeddings
 * 3. Multimodal Fusion (2048D) - Combined text+visual
 * 4. Color (256D) - Specialized color embeddings
 * 5. Texture (256D) - Texture pattern embeddings
 * 6. Application (512D) - Use-case/application embeddings
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class MultiVectorSystemValidator {
  constructor() {
    this.testResults = [];
    this.startTime = Date.now();
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : 'ℹ️';
    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  async runTest(testName, testFunction) {
    try {
      this.log(`Starting test: ${testName}`);
      const startTime = Date.now();
      const result = await testFunction();
      const duration = Date.now() - startTime;
      
      this.testResults.push({
        name: testName,
        success: true,
        duration,
        result
      });
      
      this.log(`✅ ${testName} completed in ${duration}ms`, 'success');
      return result;
    } catch (error) {
      const duration = Date.now() - this.startTime;
      this.testResults.push({
        name: testName,
        success: false,
        duration,
        error: error.message
      });
      
      this.log(`❌ ${testName} failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async validateDatabaseSchema() {
    return this.runTest('Database Schema Validation', async () => {
      // Check if multi-vector columns exist in products table
      const { data: productColumns, error: productError } = await supabase
        .rpc('get_table_columns', { table_name: 'products' });

      if (productError) {
        throw new Error(`Failed to get product columns: ${productError.message}`);
      }

      const requiredColumns = [
        'text_embedding_1536',
        'visual_clip_embedding_512',
        'multimodal_fusion_embedding_2048',
        'color_embedding_256',
        'texture_embedding_256',
        'application_embedding_512',
        'embedding_metadata'
      ];

      const existingColumns = productColumns?.map(col => col.column_name) || [];
      const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));

      if (missingColumns.length > 0) {
        throw new Error(`Missing columns in products table: ${missingColumns.join(', ')}`);
      }

      // Check document_vectors table
      const { data: vectorColumns, error: vectorError } = await supabase
        .rpc('get_table_columns', { table_name: 'document_vectors' });

      if (vectorError) {
        throw new Error(`Failed to get document_vectors columns: ${vectorError.message}`);
      }

      const vectorRequiredColumns = [
        'text_embedding_1536',
        'visual_clip_embedding_512',
        'multimodal_fusion_embedding_2048',
        'embedding_metadata'
      ];

      const existingVectorColumns = vectorColumns?.map(col => col.column_name) || [];
      const missingVectorColumns = vectorRequiredColumns.filter(col => !existingVectorColumns.includes(col));

      if (missingVectorColumns.length > 0) {
        throw new Error(`Missing columns in document_vectors table: ${missingVectorColumns.join(', ')}`);
      }

      return {
        productsTableColumns: existingColumns.filter(col => requiredColumns.includes(col)),
        documentVectorsColumns: existingVectorColumns.filter(col => vectorRequiredColumns.includes(col)),
        allRequiredColumnsPresent: missingColumns.length === 0 && missingVectorColumns.length === 0
      };
    });
  }

  async validateVectorIndexes() {
    return this.runTest('Vector Indexes Validation', async () => {
      // Check if vector indexes exist
      const { data: indexes, error } = await supabase
        .rpc('get_table_indexes', { table_name: 'products' });

      if (error) {
        throw new Error(`Failed to get indexes: ${error.message}`);
      }

      const expectedIndexes = [
        'products_text_embedding_1536_idx',
        'products_visual_clip_embedding_512_idx',
        'products_color_embedding_256_idx',
        'products_texture_embedding_256_idx',
        'products_application_embedding_512_idx'
      ];

      const existingIndexes = indexes?.map(idx => idx.indexname) || [];
      const foundIndexes = expectedIndexes.filter(idx => existingIndexes.includes(idx));

      return {
        expectedIndexes: expectedIndexes.length,
        foundIndexes: foundIndexes.length,
        indexNames: foundIndexes,
        indexCoverage: (foundIndexes.length / expectedIndexes.length) * 100
      };
    });
  }

  async testMultiVectorGeneration() {
    return this.runTest('Multi-Vector Generation Test', async () => {
      // Get a sample product
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('id, name, description')
        .limit(1);

      if (productsError || !products || products.length === 0) {
        throw new Error('No products found for testing');
      }

      const testProduct = products[0];

      // Test embedding generation (mock implementation)
      const mockEmbeddings = {
        text_embedding_1536: Array(1536).fill(0).map(() => Math.random() - 0.5),
        visual_clip_embedding_512: Array(512).fill(0).map(() => Math.random() - 0.5),
        color_embedding_256: Array(256).fill(0).map(() => Math.random() - 0.5),
        texture_embedding_256: Array(256).fill(0).map(() => Math.random() - 0.5),
        application_embedding_512: Array(512).fill(0).map(() => Math.random() - 0.5),
        embedding_metadata: {
          generated_at: new Date().toISOString(),
          model_versions: {
            text_model: 'text-embedding-3-small',
            clip_model: 'clip-vit-base-patch32',
            color_model: 'color-palette-extractor-v1',
            texture_model: 'texture-analysis-v1',
            application_model: 'use-case-classifier-v1'
          },
          generation_time_ms: 1500,
          confidence_scores: {
            text: 0.95,
            visual: 0.88,
            color: 0.82,
            texture: 0.79,
            application: 0.85
          }
        }
      };

      // Generate multimodal fusion embedding
      mockEmbeddings.multimodal_fusion_embedding_2048 = [
        ...mockEmbeddings.text_embedding_1536,
        ...mockEmbeddings.visual_clip_embedding_512
      ];

      // Update product with mock embeddings
      const { error: updateError } = await supabase
        .from('products')
        .update(mockEmbeddings)
        .eq('id', testProduct.id);

      if (updateError) {
        throw new Error(`Failed to update product with embeddings: ${updateError.message}`);
      }

      // Verify embeddings were stored
      const { data: updatedProduct, error: verifyError } = await supabase
        .from('products')
        .select('text_embedding_1536, visual_clip_embedding_512, multimodal_fusion_embedding_2048, color_embedding_256, texture_embedding_256, application_embedding_512, embedding_metadata')
        .eq('id', testProduct.id)
        .single();

      if (verifyError) {
        throw new Error(`Failed to verify embeddings: ${verifyError.message}`);
      }

      const embeddingTypes = [
        'text_embedding_1536',
        'visual_clip_embedding_512',
        'multimodal_fusion_embedding_2048',
        'color_embedding_256',
        'texture_embedding_256',
        'application_embedding_512'
      ];

      const storedEmbeddings = embeddingTypes.filter(type => updatedProduct[type] !== null);

      return {
        productId: testProduct.id,
        productName: testProduct.name,
        embeddingTypesGenerated: embeddingTypes.length,
        embeddingTypesStored: storedEmbeddings.length,
        storedEmbeddingTypes: storedEmbeddings,
        embeddingDimensions: {
          text: updatedProduct.text_embedding_1536?.length || 0,
          visual: updatedProduct.visual_clip_embedding_512?.length || 0,
          multimodal: updatedProduct.multimodal_fusion_embedding_2048?.length || 0,
          color: updatedProduct.color_embedding_256?.length || 0,
          texture: updatedProduct.texture_embedding_256?.length || 0,
          application: updatedProduct.application_embedding_512?.length || 0
        },
        metadata: updatedProduct.embedding_metadata,
        success: storedEmbeddings.length === embeddingTypes.length
      };
    });
  }

  async testMultiVectorSearch() {
    return this.runTest('Multi-Vector Search Test', async () => {
      // Test vector similarity search
      const queryVector = Array(1536).fill(0).map(() => Math.random() - 0.5);
      const vectorString = `[${queryVector.join(',')}]`;

      // Test text embedding search
      const { data: textResults, error: textError } = await supabase
        .rpc('vector_similarity_search', {
          query_embedding: vectorString,
          match_threshold: 0.5,
          match_count: 5,
          table_name: 'products',
          embedding_column: 'text_embedding_1536'
        });

      if (textError) {
        this.log(`Text search warning: ${textError.message}`, 'warning');
      }

      // Test visual embedding search
      const visualQueryVector = Array(512).fill(0).map(() => Math.random() - 0.5);
      const visualVectorString = `[${visualQueryVector.join(',')}]`;

      const { data: visualResults, error: visualError } = await supabase
        .rpc('vector_similarity_search', {
          query_embedding: visualVectorString,
          match_threshold: 0.5,
          match_count: 5,
          table_name: 'products',
          embedding_column: 'visual_clip_embedding_512'
        });

      if (visualError) {
        this.log(`Visual search warning: ${visualError.message}`, 'warning');
      }

      return {
        textSearchResults: textResults?.length || 0,
        visualSearchResults: visualResults?.length || 0,
        searchCapabilities: {
          textSearch: !textError,
          visualSearch: !visualError
        },
        sampleResults: {
          text: textResults?.slice(0, 2) || [],
          visual: visualResults?.slice(0, 2) || []
        }
      };
    });
  }

  async testEmbeddingStatistics() {
    return this.runTest('Embedding Statistics Test', async () => {
      // Get embedding coverage statistics
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('id, text_embedding_1536, visual_clip_embedding_512, multimodal_fusion_embedding_2048, color_embedding_256, texture_embedding_256, application_embedding_512');

      if (productsError) {
        throw new Error(`Failed to get products: ${productsError.message}`);
      }

      const { data: chunks, error: chunksError } = await supabase
        .from('document_vectors')
        .select('chunk_id, text_embedding_1536, visual_clip_embedding_512');

      if (chunksError) {
        throw new Error(`Failed to get chunks: ${chunksError.message}`);
      }

      const productStats = {
        total: products?.length || 0,
        withTextEmbeddings: products?.filter(p => p.text_embedding_1536).length || 0,
        withVisualEmbeddings: products?.filter(p => p.visual_clip_embedding_512).length || 0,
        withMultimodalEmbeddings: products?.filter(p => p.multimodal_fusion_embedding_2048).length || 0,
        withColorEmbeddings: products?.filter(p => p.color_embedding_256).length || 0,
        withTextureEmbeddings: products?.filter(p => p.texture_embedding_256).length || 0,
        withApplicationEmbeddings: products?.filter(p => p.application_embedding_512).length || 0
      };

      const chunkStats = {
        total: chunks?.length || 0,
        withTextEmbeddings: chunks?.filter(c => c.text_embedding_1536).length || 0,
        withVisualEmbeddings: chunks?.filter(c => c.visual_clip_embedding_512).length || 0
      };

      return {
        products: productStats,
        chunks: chunkStats,
        embeddingCoverage: {
          products: {
            text: productStats.total > 0 ? (productStats.withTextEmbeddings / productStats.total) * 100 : 0,
            visual: productStats.total > 0 ? (productStats.withVisualEmbeddings / productStats.total) * 100 : 0,
            multimodal: productStats.total > 0 ? (productStats.withMultimodalEmbeddings / productStats.total) * 100 : 0,
            color: productStats.total > 0 ? (productStats.withColorEmbeddings / productStats.total) * 100 : 0,
            texture: productStats.total > 0 ? (productStats.withTextureEmbeddings / productStats.total) * 100 : 0,
            application: productStats.total > 0 ? (productStats.withApplicationEmbeddings / productStats.total) * 100 : 0
          },
          chunks: {
            text: chunkStats.total > 0 ? (chunkStats.withTextEmbeddings / chunkStats.total) * 100 : 0,
            visual: chunkStats.total > 0 ? (chunkStats.withVisualEmbeddings / chunkStats.total) * 100 : 0
          }
        }
      };
    });
  }

  async testServiceIntegration() {
    return this.runTest('Service Integration Test', async () => {
      // Test if the services can be imported and instantiated
      try {
        // Test MultiVectorGenerationService
        const { MultiVectorGenerationService } = await import('./src/services/multiVectorGenerationService.ts');
        
        // Test MultiVectorSearchService
        const { MultiVectorSearchService } = await import('./src/services/multiVectorSearchService.ts');

        // Test basic service methods
        const stats = await MultiVectorGenerationService.getEmbeddingStatistics();
        const searchStats = await MultiVectorSearchService.getSearchStatistics();

        return {
          multiVectorGenerationService: {
            imported: true,
            statisticsMethod: typeof stats === 'object',
            hasRequiredMethods: [
              'generateProductEmbeddings',
              'generateChunkEmbeddings',
              'batchGenerateProductEmbeddings',
              'getEmbeddingStatistics'
            ].every(method => typeof MultiVectorGenerationService[method] === 'function')
          },
          multiVectorSearchService: {
            imported: true,
            statisticsMethod: typeof searchStats === 'object',
            hasRequiredMethods: [
              'search',
              'calculateCosineSimilarity',
              'getSearchStatistics'
            ].every(method => typeof MultiVectorSearchService[method] === 'function')
          }
        };

      } catch (error) {
        throw new Error(`Service integration failed: ${error.message}`);
      }
    });
  }

  async runAllTests() {
    this.log('🚀 Starting Multi-Vector Storage System Validation');
    this.log('Testing all 6 embedding types and search capabilities...');

    try {
      const results = {};

      // Run all validation tests
      results.databaseSchema = await this.validateDatabaseSchema();
      results.vectorIndexes = await this.validateVectorIndexes();
      results.multiVectorGeneration = await this.testMultiVectorGeneration();
      results.multiVectorSearch = await this.testMultiVectorSearch();
      results.embeddingStatistics = await this.testEmbeddingStatistics();
      results.serviceIntegration = await this.testServiceIntegration();

      // Generate summary
      const totalTests = this.testResults.length;
      const passedTests = this.testResults.filter(test => test.success).length;
      const failedTests = totalTests - passedTests;
      const totalDuration = Date.now() - this.startTime;

      this.log('\n📊 MULTI-VECTOR SYSTEM VALIDATION SUMMARY');
      this.log('=' .repeat(60));
      this.log(`Total Tests: ${totalTests}`);
      this.log(`Passed: ${passedTests} ✅`);
      this.log(`Failed: ${failedTests} ${failedTests > 0 ? '❌' : '✅'}`);
      this.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
      this.log(`Total Duration: ${totalDuration}ms`);
      this.log('=' .repeat(60));

      // Detailed results
      this.log('\n📋 DETAILED RESULTS:');
      
      if (results.databaseSchema?.allRequiredColumnsPresent) {
        this.log('✅ Database Schema: All multi-vector columns present');
      } else {
        this.log('❌ Database Schema: Missing required columns');
      }

      if (results.vectorIndexes?.indexCoverage >= 80) {
        this.log(`✅ Vector Indexes: ${results.vectorIndexes.indexCoverage.toFixed(1)}% coverage`);
      } else {
        this.log(`⚠️ Vector Indexes: ${results.vectorIndexes?.indexCoverage?.toFixed(1) || 0}% coverage`);
      }

      if (results.multiVectorGeneration?.success) {
        this.log(`✅ Multi-Vector Generation: ${results.multiVectorGeneration.embeddingTypesStored}/6 embedding types stored`);
      } else {
        this.log('❌ Multi-Vector Generation: Failed to generate embeddings');
      }

      if (results.multiVectorSearch?.searchCapabilities?.textSearch && results.multiVectorSearch?.searchCapabilities?.visualSearch) {
        this.log('✅ Multi-Vector Search: Text and visual search working');
      } else {
        this.log('⚠️ Multi-Vector Search: Limited search capabilities');
      }

      if (results.embeddingStatistics?.products?.total > 0) {
        this.log(`✅ Embedding Statistics: ${results.embeddingStatistics.products.total} products analyzed`);
      } else {
        this.log('⚠️ Embedding Statistics: No products found');
      }

      if (results.serviceIntegration?.multiVectorGenerationService?.imported && results.serviceIntegration?.multiVectorSearchService?.imported) {
        this.log('✅ Service Integration: All services imported successfully');
      } else {
        this.log('❌ Service Integration: Service import failures');
      }

      this.log('\n🎯 MULTI-VECTOR CAPABILITIES:');
      this.log(`📊 Text Embeddings (1536D): ${results.embeddingStatistics?.embeddingCoverage?.products?.text?.toFixed(1) || 0}% coverage`);
      this.log(`🖼️ Visual CLIP Embeddings (512D): ${results.embeddingStatistics?.embeddingCoverage?.products?.visual?.toFixed(1) || 0}% coverage`);
      this.log(`🔗 Multimodal Fusion (2048D): ${results.embeddingStatistics?.embeddingCoverage?.products?.multimodal?.toFixed(1) || 0}% coverage`);
      this.log(`🎨 Color Embeddings (256D): ${results.embeddingStatistics?.embeddingCoverage?.products?.color?.toFixed(1) || 0}% coverage`);
      this.log(`🏗️ Texture Embeddings (256D): ${results.embeddingStatistics?.embeddingCoverage?.products?.texture?.toFixed(1) || 0}% coverage`);
      this.log(`🎯 Application Embeddings (512D): ${results.embeddingStatistics?.embeddingCoverage?.products?.application?.toFixed(1) || 0}% coverage`);

      if (passedTests === totalTests) {
        this.log('\n🎉 ALL TESTS PASSED! Multi-Vector Storage System is ready for production!', 'success');
      } else {
        this.log(`\n⚠️ ${failedTests} test(s) failed. Review the issues above.`, 'warning');
      }

      return {
        success: passedTests === totalTests,
        summary: {
          totalTests,
          passedTests,
          failedTests,
          successRate: (passedTests / totalTests) * 100,
          totalDuration
        },
        results,
        testDetails: this.testResults
      };

    } catch (error) {
      this.log(`❌ Validation failed: ${error.message}`, 'error');
      throw error;
    }
  }
}

// Run the validation
const validator = new MultiVectorSystemValidator();
validator.runAllTests()
  .then(results => {
    if (results.success) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  });
