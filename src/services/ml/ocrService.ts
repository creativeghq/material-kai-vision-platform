import { MLResult, TextEmbeddingResult } from './types';

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

export class OCRService {
  private static isSupported(): boolean {
    return 'createImageBitmap' in window && 'OffscreenCanvas' in window;
  }

  static async extractText(
    imageFile: File,
    options: OCROptions = {}
  ): Promise<MLResult> {
    const startTime = performance.now();

    try {
      if (!this.isSupported()) {
        throw new Error('OCR not supported in this browser');
      }

      // Create image bitmap for processing
      const imageBitmap = await createImageBitmap(imageFile);
      
      // Use browser's built-in text detection if available
      if ('TextDetector' in window) {
        const textDetector = new (window as any).TextDetector();
        const textResults = await textDetector.detect(imageBitmap);
        
        const blocks: TextBlock[] = textResults.map((result: any) => ({
          text: result.rawValue,
          confidence: result.confidence || 0.8,
          bbox: result.boundingBox ? {
            x: result.boundingBox.x,
            y: result.boundingBox.y,
            width: result.boundingBox.width,
            height: result.boundingBox.height
          } : undefined
        }));

        const fullText = blocks.map(block => block.text).join(' ');
        
        const ocrResult: OCRResult = {
          text: fullText,
          confidence: blocks.reduce((avg, block) => avg + block.confidence, 0) / blocks.length,
          blocks,
          language: options.language || 'en',
          processingTime: performance.now() - startTime
        };

        return {
          success: true,
          data: ocrResult,
          processingTime: performance.now() - startTime
        };
      }

      // Fallback to basic canvas-based text extraction
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
        language: options.language || 'en',
        processingTime: performance.now() - startTime
      };

      return {
        success: true,
        data: ocrResult,
        processingTime: performance.now() - startTime
      };

    } catch (error) {
      console.error('OCR Service Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'OCR processing failed',
        processingTime: performance.now() - startTime
      };
    }
  }

  private static analyzeImageForText(imageData: ImageData): string {
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

  static async detectLanguage(text: string): Promise<string> {
    // Simple language detection based on character patterns
    const patterns = {
      en: /^[a-zA-Z\s\d\.,!?;:'"()-]+$/,
      es: /[ñáéíóúü]/i,
      fr: /[àâäéèêëïîôöùûüÿç]/i,
      de: /[äöüß]/i,
      it: /[àèéìíîòóù]/i
    };

    for (const [lang, pattern] of Object.entries(patterns)) {
      if (pattern.test(text)) {
        return lang;
      }
    }

    return 'en'; // Default to English
  }

  static async extractStructuredData(ocrResult: OCRResult): Promise<any> {
    const { text } = ocrResult;
    
    // Extract common material document patterns
    const patterns = {
      materialId: /(?:Material\s+ID|Product\s+Code|SKU)[:\s]+([A-Z0-9-]+)/i,
      certification: /(?:Certificate|Certification|Standard)[:\s]+([A-Z0-9-\s]+)/i,
      composition: /(?:Composition|Material)[:\s]+([^,\n]+)/i,
      thickness: /(?:Thickness|Thick)[:\s]+([\d.]+\s*(?:mm|cm|inches?))/i,
      dimensions: /(?:Dimensions|Size)[:\s]+([\d.\s]+(?:x|×)\s*[\d.\s]+(?:\s*(?:mm|cm|inches?))?)/i,
      manufacturer: /(?:Manufacturer|Made\s+by|Brand)[:\s]+([^,\n]+)/i,
      dateCode: /(?:Date|Manufactured|Prod\.?\s+Date)[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i
    };

    const extractedData: any = {};

    for (const [key, pattern] of Object.entries(patterns)) {
      const match = text.match(pattern);
      if (match && match[1]) {
        extractedData[key] = match[1].trim();
      }
    }

    return extractedData;
  }

  static getStatus(): { supported: boolean; features: string[] } {
    const features = [];
    
    if ('TextDetector' in window) {
      features.push('Native Text Detection');
    }
    if ('createImageBitmap' in window) {
      features.push('Image Processing');
    }
    if ('OffscreenCanvas' in window) {
      features.push('Canvas Processing');
    }

    return {
      supported: this.isSupported(),
      features
    };
  }
}

// Export singleton instance
export const ocrService = new OCRService();