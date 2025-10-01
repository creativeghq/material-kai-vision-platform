import { BaseService, ServiceConfig } from '../base/BaseService';

import { MLResult } from './types';

export interface OCRResult {
  text: string;
  confidence: number;
  blocks?: TextBlock[];
  language?: string;
  processingTime?: number;
}

export interface TextBlock {
  text: string;
  confidence: number;
  bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface OCROptions {
  language?: string;
  extractStructuredData?: boolean;
  includeConfidence?: boolean;
  detectLanguage?: boolean;
}

interface OCRServiceConfig extends ServiceConfig {
  defaultLanguage?: string;
  enableStructuredData?: boolean;
  fallbackToCanvas?: boolean;
}

export class OCRService extends BaseService<OCRServiceConfig> {
  private isSupported: boolean = false;

  constructor(config: OCRServiceConfig) {
    super(config);
  }

  protected async doInitialize(): Promise<void> {
    // Check browser support for OCR capabilities
    this.isSupported = this.checkBrowserSupport();

    if (!this.isSupported) {
      console.warn('OCR capabilities limited in this browser environment');
    }
  }

  protected async doHealthCheck(): Promise<void> {
    if (!this.isSupported) {
      throw new Error('OCR not supported in this browser environment');
    }

    // Test basic canvas functionality
    try {
      if (typeof window !== 'undefined') {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Canvas context not available');
        }
      }
    } catch (_error) {
      throw new Error('Canvas functionality not available for OCR processing');
    }
  }

  private checkBrowserSupport(): boolean {
    if (typeof window === 'undefined') {
      return false; // Server-side environment
    }

    return 'createImageBitmap' in window && 'OffscreenCanvas' in window;
  }

  /**
   * Extract text from image file
   */
  async extractText(
    imageFile: File,
    options: OCROptions = {},
  ): Promise<MLResult> {
    return this.executeOperation(async () => {
      const startTime = performance.now();

      if (!this.isSupported) {
        throw new Error('OCR not supported in this browser');
      }

      // Create image bitmap for processing
      const imageBitmap = await createImageBitmap(imageFile);

      // Use browser's built-in text detection if available
      if ('TextDetector' in window) {
        const textDetector = new (window as Record<string, unknown>).TextDetector();
        const textResults = await (textDetector as Record<string, unknown>).detect(imageBitmap);

        const blocks: TextBlock[] = (textResults as unknown[]).map((result: Record<string, unknown>) => ({
          text: result.rawValue,
          confidence: result.confidence || 0.8,
          bbox: result.boundingBox ? {
            x: result.boundingBox.x,
            y: result.boundingBox.y,
            width: result.boundingBox.width,
            height: result.boundingBox.height,
          } : undefined,
        }));

        const fullText = blocks.map(block => block.text).join(' ');

        const ocrResult: OCRResult = {
          text: fullText,
          confidence: blocks.reduce((avg, block) => avg + block.confidence, 0) / blocks.length,
          blocks,
          language: options.language || this.config.defaultLanguage || 'en',
          processingTime: performance.now() - startTime,
        };

        return {
          success: true,
          data: ocrResult,
          processingTime: performance.now() - startTime,
        };
      }

      // Fallback to basic canvas-based text extraction
      if (this.config.fallbackToCanvas !== false) {
        const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas context not available');

        ctx.drawImage(imageBitmap, 0, 0);

        // Simple text detection using image analysis
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const extractedText = this.analyzeImageForText(imageData);

        const ocrResult: OCRResult = {
          text: extractedText,
          confidence: 0.7, // Lower confidence for fallback method
          language: options.language || this.config.defaultLanguage || 'en',
          processingTime: performance.now() - startTime,
        };

        return {
          success: true,
          data: ocrResult,
          processingTime: performance.now() - startTime,
        };
      }

      throw new Error('No OCR method available');
    }, 'extractText');
  }

  /**
   * Detect language from text
   */
  async detectLanguage(text: string): Promise<string> {
    return this.executeOperation(async () => {
      // Simple language detection based on character patterns
      const patterns = {
        en: /^[a-zA-Z\s\d\.,!?;:'"()-]+$/,
        es: /[ñáéíóúü]/i,
        fr: /[àâäéèêëïîôöùûüÿç]/i,
        de: /[äöüß]/i,
        it: /[àèéìíîòóù]/i,
      };

      for (const [lang, pattern] of Object.entries(patterns)) {
        if (pattern.test(text)) {
          return lang;
        }
      }

      return this.config.defaultLanguage || 'en'; // Default to configured language or English
    }, 'detectLanguage');
  }

  /**
   * Extract structured data from OCR result
   */
  async extractStructuredData(ocrResult: OCRResult): Promise<Record<string, unknown>> {
    return this.executeOperation(async () => {
      const { text } = ocrResult;

      // Extract common material document patterns
      const patterns = {
        materialId: /(?:Material\s+ID|Product\s+Code|SKU)[:\s]+([A-Z0-9-]+)/i,
        certification: /(?:Certificate|Certification|Standard)[:\s]+([A-Z0-9-\s]+)/i,
        composition: /(?:Composition|Material)[:\s]+([^,\n]+)/i,
        thickness: /(?:Thickness|Thick)[:\s]+([\d.]+\s*(?:mm|cm|inches?))/i,
        dimensions: /(?:Dimensions|Size)[:\s]+([\d.\s]+(?:x|×)\s*[\d.\s]+(?:\s*(?:mm|cm|inches?))?)/i,
        manufacturer: /(?:Manufacturer|Made\s+by|Brand)[:\s]+([^,\n]+)/i,
        dateCode: /(?:Date|Manufactured|Prod\.?\s+Date)[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
      };

      const extractedData: Record<string, unknown> = {};

      for (const [key, pattern] of Object.entries(patterns)) {
        const match = text.match(pattern);
        if (match && match[1]) {
          extractedData[key] = match[1].trim();
        }
      }

      return extractedData;
    }, 'extractStructuredData');
  }

  /**
   * Get OCR service status and capabilities
   */
  getStatus(): { supported: boolean; features: string[] } {
    const features = [];

    if (typeof window !== 'undefined') {
      if ('TextDetector' in window) {
        features.push('Native Text Detection');
      }
      if ('createImageBitmap' in window) {
        features.push('Image Processing');
      }
      if ('OffscreenCanvas' in window) {
        features.push('Canvas Processing');
      }
    } else {
      features.push('Server-side Environment');
    }

    return {
      supported: this.isSupported,
      features,
    };
  }

  // Private helper methods

  private analyzeImageForText(imageData: ImageData): string {
    // Basic text detection heuristics
    // This is a simplified approach - in production you'd use more sophisticated algorithms
    const { data, width, height } = imageData;

    // Look for text-like patterns (high contrast edges, horizontal/vertical lines)
    let textConfidence = 0;
    const sampleSize = Math.min(width * height, 10000); // Sample for performance

    for (let i = 0; i < sampleSize * 4; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const brightness = (r + g + b) / 3;

      // Look for high contrast areas that might contain text
      if (brightness < 50 || brightness > 200) {
        textConfidence++;
      }
    }

    // Return placeholder text if text-like patterns detected
    if (textConfidence > sampleSize * 0.3) {
      return 'Text detected but requires server-side OCR for accurate extraction';
    }

    return '';
  }

  /**
   * Create a standardized service instance
   */
  static createInstance(config: Partial<OCRServiceConfig> = {}): OCRService {
    const defaultConfig: OCRServiceConfig = {
      name: 'ocr-service',
      version: '1.0.0',
      environment: 'development',
      enabled: true,
      timeout: 30000,
      retries: 2,
      rateLimit: {
        requestsPerMinute: 30,
      },
      healthCheck: {
        enabled: true,
        interval: 300000, // 5 minutes
        timeout: 10000,
      },
      defaultLanguage: 'en',
      enableStructuredData: true,
      fallbackToCanvas: true,
      ...config,
    };

    return new OCRService(defaultConfig);
  }
}

// Export singleton instance for backward compatibility
export const ocrService = OCRService.createInstance();

export default OCRService;
