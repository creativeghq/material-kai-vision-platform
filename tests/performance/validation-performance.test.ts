import { performance } from 'perf_hooks';
import { ValidationIntegrationService } from '../../src/services/validationIntegrationService.js';
import { sanitizeMarkdown } from '../../src/utils/contentSanitizer.js';
import { ErrorReporter } from '../../src/utils/errorReporting.js';

describe('Validation Performance Tests', () => {
  let validationService: ValidationIntegrationService;
  
  beforeEach(() => {
    validationService = ValidationIntegrationService.getInstance();
    validationService.resetPerformanceMetrics();
  });

  // Sample test data
  const sampleMivaaDocument = {
    id: 'test-doc-123',
    filename: 'test-document.pdf',
    markdown: '# Test Document\n\nThis is a test document with some content.',
    metadata: {
      title: 'Test Document',
      author: 'Test Author',
      createdAt: '2024-08-02T10:00:00Z',
      pageCount: 5,
      language: 'en',
      extractionMethod: 'ocr',
      confidence: 0.95
    },
    tables: [
      {
        id: 'table-1',
        caption: 'Test Table',
        headers: ['Column 1', 'Column 2'],
        rows: [
          ['Value 1', 'Value 2'],
          ['Value 3', 'Value 4']
        ],
        position: { page: 1, x: 100, y: 200, width: 300, height: 150 }
      }
    ],
    images: [
      {
        id: 'image-1',
        filename: 'test-image.jpg',
        caption: 'Test Image',
        position: { page: 1, x: 50, y: 50, width: 200, height: 100 },
        metadata: {
          format: 'jpeg',
          size: 15000,
          dimensions: { width: 200, height: 100 },
          extractedText: 'Some text from image'
        }
      }
    ]
  };

  const sampleTransformationConfig = {
    chunkSize: {
      maxTokens: 1000,
      overlap: 100,
      strategy: 'semantic'
    },
    embedding: {
      model: 'text-embedding-ada-002',
      dimensions: 1536,
      batchSize: 100
    },
    outputFormat: {
      includeMetadata: true,
      includeImages: true,
      includeTables: true,
      format: 'json'
    },
    processing: {
      enableOCR: true,
      enableNER: false,
      enableSummarization: true,
      qualityThreshold: 0.8
    }
  };

  const sampleTransformationJobRequest = {
    documentId: 'test-doc-123',
    config: sampleTransformationConfig,
    priority: 'normal',
    callbackUrl: 'https://example.com/callback',
    metadata: {
      userId: 'user-123',
      projectId: 'project-456'
    }
  };

  describe('Individual Validation Performance', () => {
    test('MivaaDocument validation should complete within 50ms', async () => {
      const iterations = 100;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        
        await validationService.validateMivaaDocument(sampleMivaaDocument, {
          trackPerformance: true
        });
        
        const endTime = performance.now();
        times.push(endTime - startTime);
      }

      const averageTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      const p95Time = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];

      console.log(`MivaaDocument Validation Performance:
        Average: ${averageTime.toFixed(2)}ms
        Max: ${maxTime.toFixed(2)}ms
        P95: ${p95Time.toFixed(2)}ms`);

      expect(averageTime).toBeLessThan(50);
      expect(p95Time).toBeLessThan(100); // Allow P95 to be up to 100ms
    });

    test('TransformationConfig validation should complete within 50ms', async () => {
      const iterations = 100;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        
        await validationService.validateTransformationConfig(sampleTransformationConfig, {
          trackPerformance: true
        });
        
        const endTime = performance.now();
        times.push(endTime - startTime);
      }

      const averageTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      const p95Time = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];

      console.log(`TransformationConfig Validation Performance:
        Average: ${averageTime.toFixed(2)}ms
        Max: ${maxTime.toFixed(2)}ms
        P95: ${p95Time.toFixed(2)}ms`);

      expect(averageTime).toBeLessThan(50);
      expect(p95Time).toBeLessThan(100);
    });

    test('TransformationJobRequest validation should complete within 50ms', async () => {
      const iterations = 100;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        
        await validationService.validateTransformationJobRequest(sampleTransformationJobRequest, {
          trackPerformance: true
        });
        
        const endTime = performance.now();
        times.push(endTime - startTime);
      }

      const averageTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      const p95Time = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];

      console.log(`TransformationJobRequest Validation Performance:
        Average: ${averageTime.toFixed(2)}ms
        Max: ${maxTime.toFixed(2)}ms
        P95: ${p95Time.toFixed(2)}ms`);

      expect(averageTime).toBeLessThan(50);
      expect(p95Time).toBeLessThan(100);
    });
  });

  describe('Content Sanitization Performance', () => {
    test('Markdown sanitization should complete within 25ms', () => {
      const largeMarkdown = `
# Large Document

This is a test document with **bold text**, *italic text*, and [links](https://example.com).

## Code Blocks

\`\`\`javascript
function test() {
  console.log("Hello, world!");
  return true;
}
\`\`\`

## Lists

- Item 1
- Item 2
- Item 3

### Nested Lists

1. First item
   - Sub item 1
   - Sub item 2
2. Second item

## Tables

| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Value 1  | Value 2  | Value 3  |
| Value 4  | Value 5  | Value 6  |

## Potentially Dangerous Content

<script>alert('xss')</script>
<iframe src="javascript:alert('xss')"></iframe>
<img src="x" onerror="alert('xss')">

## More Content

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
`.repeat(10); // Make it larger

      const iterations = 50;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        
        sanitizeMarkdown(largeMarkdown);
        
        const endTime = performance.now();
        times.push(endTime - startTime);
      }

      const averageTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      const p95Time = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];

      console.log(`Markdown Sanitization Performance:
        Average: ${averageTime.toFixed(2)}ms
        Max: ${maxTime.toFixed(2)}ms
        P95: ${p95Time.toFixed(2)}ms`);

      expect(averageTime).toBeLessThan(25);
      expect(p95Time).toBeLessThan(50);
    });
  });

  describe('Error Reporting Performance', () => {
    test('Error reporting should complete within 10ms', () => {
      const iterations = 100;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        
        const errorReporter = new ErrorReporter('performance-test');
        errorReporter.addError({
          code: 'TEST_ERROR',
          message: 'This is a test error',
          field: 'testField'
        });
        errorReporter.addError({
          code: 'ANOTHER_ERROR',
          message: 'This is another test error',
          field: 'anotherField'
        });
        errorReporter.generateReport();
        
        const endTime = performance.now();
        times.push(endTime - startTime);
      }

      const averageTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      const p95Time = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];

      console.log(`Error Reporting Performance:
        Average: ${averageTime.toFixed(2)}ms
        Max: ${maxTime.toFixed(2)}ms
        P95: ${p95Time.toFixed(2)}ms`);

      expect(averageTime).toBeLessThan(10);
      expect(p95Time).toBeLessThan(20);
    });
  });

  describe('Combined Validation Performance', () => {
    test('Full validation pipeline should complete within 75ms', async () => {
      const iterations = 50;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        
        // Simulate a full validation pipeline
        await validationService.validateMivaaDocument(sampleMivaaDocument, {
          sanitize: true,
          trackPerformance: true
        });
        
        await validationService.validateTransformationConfig(sampleTransformationConfig, {
          trackPerformance: true
        });
        
        await validationService.validateTransformationJobRequest(sampleTransformationJobRequest, {
          trackPerformance: true
        });
        
        const endTime = performance.now();
        times.push(endTime - startTime);
      }

      const averageTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      const p95Time = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];

      console.log(`Combined Validation Pipeline Performance:
        Average: ${averageTime.toFixed(2)}ms
        Max: ${maxTime.toFixed(2)}ms
        P95: ${p95Time.toFixed(2)}ms`);

      expect(averageTime).toBeLessThan(75);
      expect(p95Time).toBeLessThan(150);
    });
  });

  describe('Performance Requirements Validation', () => {
    test('ValidationIntegrationService should meet performance requirements', async () => {
      // Run multiple validations to populate metrics
      for (let i = 0; i < 20; i++) {
        await validationService.validateMivaaDocument(sampleMivaaDocument, {
          trackPerformance: true
        });
        await validationService.validateTransformationConfig(sampleTransformationConfig, {
          trackPerformance: true
        });
        await validationService.validateTransformationJobRequest(sampleTransformationJobRequest, {
          trackPerformance: true
        });
      }

      const performanceCheck = validationService.checkPerformanceRequirements();
      
      console.log('Performance Requirements Check:', JSON.stringify(performanceCheck, null, 2));

      expect(performanceCheck.meetsRequirements).toBe(true);
      expect(performanceCheck.violations).toHaveLength(0);
    });
  });

  describe('Memory Usage', () => {
    test('Validation should not cause significant memory leaks', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Run many validations
      for (let i = 0; i < 1000; i++) {
        await validationService.validateMivaaDocument(sampleMivaaDocument, {
          trackPerformance: true
        });
        
        // Force garbage collection every 100 iterations if available
        if (i % 100 === 0 && global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      const memoryIncreasePercent = (memoryIncrease / initialMemory) * 100;

      console.log(`Memory Usage:
        Initial: ${(initialMemory / 1024 / 1024).toFixed(2)} MB
        Final: ${(finalMemory / 1024 / 1024).toFixed(2)} MB
        Increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB (${memoryIncreasePercent.toFixed(2)}%)`);

      // Memory increase should be less than 10% as specified in requirements
      expect(memoryIncreasePercent).toBeLessThan(10);
    });
  });
});