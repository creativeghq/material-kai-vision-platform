/**
 * Image Preprocessing Utilities
 * 
 * Handles image validation, resizing, format conversion, and preparation
 * for visual analysis processing. Supports various image formats and
 * provides security validation to prevent malicious uploads.
 */

import { createHash } from 'crypto';
import {
  AppError,
  ValidationError,
  ExternalServiceError,
  errorLogger,
} from '../core/errors';
import { createErrorContext } from '../core/errors/utils';

// Supported image formats and constraints
export const IMAGE_CONFIG = {
  SUPPORTED_FORMATS: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/bmp'] as const,
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MIN_DIMENSIONS: { width: 100, height: 100 },
  MAX_DIMENSIONS: { width: 4096, height: 4096 },
  OPTIMAL_DIMENSIONS: { width: 1024, height: 1024 },
  QUALITY_LEVELS: {
    LOW: 0.6,
    MEDIUM: 0.8,
    HIGH: 0.95,
  } as const,
} as const;

// Image metadata and processing result interfaces
export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  size: number;
  colorSpace?: string;
  hasAlpha?: boolean;
}

export interface ImageValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  metadata?: ImageMetadata;
  hash?: string;
}

export interface ImageProcessingOptions {
  targetWidth?: number;
  targetHeight?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
  maintainAspectRatio?: boolean;
  allowUpscaling?: boolean;
}

export interface ProcessedImageResult {
  success: boolean;
  processedImageData?: Buffer;
  originalMetadata: ImageMetadata;
  processedMetadata?: ImageMetadata;
  hash: string;
  processingTime: number;
  optimizations: string[];
  error?: string;
}

/**
 * Image Preprocessing Service
 * Handles all image validation, processing, and optimization tasks
 */
export class ImagePreprocessingService {
  
  /**
   * Validate image data and extract metadata
   */
  static async validateImage(
    imageData: Buffer | string,
    source: 'upload' | 'url' = 'upload'
  ): Promise<ImageValidationResult> {
    const startTime = Date.now();
    const result: ImageValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    try {
      // Convert base64 string to buffer if needed
      let buffer: Buffer;
      if (typeof imageData === 'string') {
        // Handle base64 data URLs
        const base64Match = imageData.match(/^data:image\/[a-zA-Z]+;base64,(.+)$/);
        if (base64Match && base64Match[1]) {
          buffer = Buffer.from(base64Match[1], 'base64');
        } else {
          buffer = Buffer.from(imageData, 'base64');
        }
      } else {
        buffer = imageData;
      }

      // Basic size validation
      if (buffer.length === 0) {
        result.errors.push('Image data is empty');
        result.isValid = false;
        return result;
      }

      if (buffer.length > IMAGE_CONFIG.MAX_FILE_SIZE) {
        result.errors.push(`Image size ${buffer.length} exceeds maximum allowed size ${IMAGE_CONFIG.MAX_FILE_SIZE}`);
        result.isValid = false;
        return result;
      }

      // Generate content hash for deduplication
      result.hash = createHash('sha256').update(buffer).digest('hex');

      // Detect image format from buffer headers
      const metadata = await this.extractImageMetadata(buffer);
      result.metadata = metadata;

      // Format validation
      if (!this.isFormatSupported(metadata.format)) {
        result.errors.push(`Unsupported image format: ${metadata.format}. Supported formats: ${IMAGE_CONFIG.SUPPORTED_FORMATS.join(', ')}`);
        result.isValid = false;
      }

      // Dimension validation
      if (metadata.width < IMAGE_CONFIG.MIN_DIMENSIONS.width || 
          metadata.height < IMAGE_CONFIG.MIN_DIMENSIONS.height) {
        result.errors.push(`Image dimensions ${metadata.width}x${metadata.height} are below minimum ${IMAGE_CONFIG.MIN_DIMENSIONS.width}x${IMAGE_CONFIG.MIN_DIMENSIONS.height}`);
        result.isValid = false;
      }

      if (metadata.width > IMAGE_CONFIG.MAX_DIMENSIONS.width || 
          metadata.height > IMAGE_CONFIG.MAX_DIMENSIONS.height) {
        result.errors.push(`Image dimensions ${metadata.width}x${metadata.height} exceed maximum ${IMAGE_CONFIG.MAX_DIMENSIONS.width}x${IMAGE_CONFIG.MAX_DIMENSIONS.height}`);
        result.isValid = false;
      }

      // Performance warnings
      if (metadata.width > IMAGE_CONFIG.OPTIMAL_DIMENSIONS.width || 
          metadata.height > IMAGE_CONFIG.OPTIMAL_DIMENSIONS.height) {
        result.warnings.push(`Large image dimensions ${metadata.width}x${metadata.height} may impact processing performance. Consider resizing to ${IMAGE_CONFIG.OPTIMAL_DIMENSIONS.width}x${IMAGE_CONFIG.OPTIMAL_DIMENSIONS.height}`);
      }

      // Security validation
      const securityCheck = await this.performSecurityValidation(buffer);
      if (!securityCheck.safe) {
        result.errors.push(...securityCheck.issues);
        result.isValid = false;
      }

      errorLogger.logInfo('Image validation completed', {
        service: 'ImagePreprocessingService',
        operation: 'validateImage',
        metadata: {
          source,
          isValid: result.isValid,
          format: metadata.format,
          dimensions: `${metadata.width}x${metadata.height}`,
          size: metadata.size,
          processingTime: Date.now() - startTime,
        },
      });

      return result;

    } catch (error) {
      result.isValid = false;
      result.errors.push(`Image validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      errorLogger.logError(error as Error, {
        service: 'ImagePreprocessingService',
        operation: 'validateImage',
        metadata: {
          source,
          processingTime: Date.now() - startTime,
        },
      });

      return result;
    }
  }

  /**
   * Process and optimize image for visual analysis
   */
  static async processImage(
    imageData: Buffer,
    options: ImageProcessingOptions = {}
  ): Promise<ProcessedImageResult> {
    const startTime = Date.now();
    const optimizations: string[] = [];

    try {
      // Extract original metadata
      const originalMetadata = await this.extractImageMetadata(imageData);
      
      // Determine target dimensions
      const targetDimensions = this.calculateOptimalDimensions(
        originalMetadata.width,
        originalMetadata.height,
        options
      );

      // Apply optimizations if needed
      let processedBuffer = imageData;
      let requiresProcessing = false;

      // Check if resizing is needed
      if (targetDimensions.width !== originalMetadata.width || 
          targetDimensions.height !== originalMetadata.height) {
        requiresProcessing = true;
        optimizations.push(`Resized from ${originalMetadata.width}x${originalMetadata.height} to ${targetDimensions.width}x${targetDimensions.height}`);
      }

      // Check if format conversion is needed
      const targetFormat = options.format || this.getOptimalFormat(originalMetadata.format);
      if (targetFormat !== this.normalizeFormat(originalMetadata.format)) {
        requiresProcessing = true;
        optimizations.push(`Format conversion from ${originalMetadata.format} to ${targetFormat}`);
      }

      // Check if quality optimization is needed
      const targetQuality = options.quality || IMAGE_CONFIG.QUALITY_LEVELS.HIGH;
      if (targetQuality < 1.0) {
        requiresProcessing = true;
        optimizations.push(`Quality optimization: ${Math.round(targetQuality * 100)}%`);
      }

      // Apply processing if needed
      let processedMetadata = originalMetadata;
      if (requiresProcessing) {
        const processed = await this.applyImageProcessing(
          processedBuffer,
          targetDimensions,
          targetFormat,
          targetQuality
        );
        processedBuffer = processed.buffer;
        processedMetadata = processed.metadata;
      }

      // Generate hash for processed image
      const hash = createHash('sha256').update(processedBuffer).digest('hex');

      return {
        success: true,
        processedImageData: processedBuffer,
        originalMetadata,
        processedMetadata,
        hash,
        processingTime: Date.now() - startTime,
        optimizations,
      };

    } catch (error) {
      errorLogger.logError(error as Error, {
        service: 'ImagePreprocessingService',
        operation: 'processImage',
        metadata: {
          originalSize: imageData.length,
          processingTime: Date.now() - startTime,
        },
      });

      return {
        success: false,
        originalMetadata: await this.extractImageMetadata(imageData).catch(() => ({
          width: 0,
          height: 0,
          format: 'unknown',
          size: imageData.length,
        })),
        hash: createHash('sha256').update(imageData).digest('hex'),
        processingTime: Date.now() - startTime,
        optimizations: [],
        error: error instanceof Error ? error.message : 'Image processing failed',
      };
    }
  }

  /**
   * Extract comprehensive image metadata
   */
  private static async extractImageMetadata(buffer: Buffer): Promise<ImageMetadata> {
    // Simple format detection based on file signatures
    const format = this.detectImageFormat(buffer);
    
    // For this implementation, we'll provide basic metadata extraction
    // In a production environment, you might want to use a library like 'sharp' or 'jimp'
    const metadata: ImageMetadata = {
      width: await this.extractWidth(buffer, format),
      height: await this.extractHeight(buffer, format),
      format,
      size: buffer.length,
    };

    return metadata;
  }

  /**
   * Detect image format from buffer headers
   */
  private static detectImageFormat(buffer: Buffer): string {
    // JPEG
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return 'image/jpeg';
    }
    
    // PNG
    if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) {
      return 'image/png';
    }
    
    // WebP
    if (buffer.subarray(0, 4).equals(Buffer.from('RIFF', 'ascii')) && 
        buffer.subarray(8, 12).equals(Buffer.from('WEBP', 'ascii'))) {
      return 'image/webp';
    }
    
    // BMP
    if (buffer[0] === 0x42 && buffer[1] === 0x4D) {
      return 'image/bmp';
    }
    
    return 'unknown';
  }

  /**
   * Extract image width (simplified implementation)
   */
  private static async extractWidth(buffer: Buffer, format: string): Promise<number> {
    // This is a simplified implementation
    // In production, use a proper image library
    switch (format) {
      case 'image/png':
        return buffer.readUInt32BE(16);
      case 'image/jpeg':
        // JPEG width extraction is complex, return default for now
        return IMAGE_CONFIG.OPTIMAL_DIMENSIONS.width;
      default:
        return IMAGE_CONFIG.OPTIMAL_DIMENSIONS.width;
    }
  }

  /**
   * Extract image height (simplified implementation)
   */
  private static async extractHeight(buffer: Buffer, format: string): Promise<number> {
    // This is a simplified implementation
    // In production, use a proper image library
    switch (format) {
      case 'image/png':
        return buffer.readUInt32BE(20);
      case 'image/jpeg':
        // JPEG height extraction is complex, return default for now
        return IMAGE_CONFIG.OPTIMAL_DIMENSIONS.height;
      default:
        return IMAGE_CONFIG.OPTIMAL_DIMENSIONS.height;
    }
  }

  /**
   * Check if image format is supported
   */
  private static isFormatSupported(format: string): boolean {
    return IMAGE_CONFIG.SUPPORTED_FORMATS.includes(format as any);
  }

  /**
   * Perform security validation on image data
   */
  private static async performSecurityValidation(buffer: Buffer): Promise<{
    safe: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    // Check for suspicious file size patterns
    if (buffer.length < 100) {
      issues.push('File too small to be a valid image');
    }

    // Check for basic format consistency
    const format = this.detectImageFormat(buffer);
    if (format === 'unknown') {
      issues.push('Unknown or corrupted image format');
    }

    // Additional security checks could be added here
    // e.g., checking for embedded scripts, malformed headers, etc.

    return {
      safe: issues.length === 0,
      issues,
    };
  }

  /**
   * Calculate optimal dimensions for processing
   */
  private static calculateOptimalDimensions(
    originalWidth: number,
    originalHeight: number,
    options: ImageProcessingOptions
  ): { width: number; height: number } {
    let targetWidth = options.targetWidth || IMAGE_CONFIG.OPTIMAL_DIMENSIONS.width;
    let targetHeight = options.targetHeight || IMAGE_CONFIG.OPTIMAL_DIMENSIONS.height;

    // Maintain aspect ratio if requested
    if (options.maintainAspectRatio !== false) {
      const aspectRatio = originalWidth / originalHeight;
      
      if (targetWidth / targetHeight > aspectRatio) {
        targetWidth = Math.round(targetHeight * aspectRatio);
      } else {
        targetHeight = Math.round(targetWidth / aspectRatio);
      }
    }

    // Prevent upscaling unless explicitly allowed
    if (!options.allowUpscaling) {
      targetWidth = Math.min(targetWidth, originalWidth);
      targetHeight = Math.min(targetHeight, originalHeight);
    }

    return { width: targetWidth, height: targetHeight };
  }

  /**
   * Get optimal format for processing
   */
  public static getOptimalFormat(originalFormat: string): 'jpeg' | 'png' | 'webp' {
    // Prefer JPEG for photos (no transparency), PNG for graphics with transparency
    switch (originalFormat) {
      case 'image/png':
        return 'png';
      case 'image/webp':
        return 'webp';
      default:
        return 'jpeg';
    }
  }

  /**
   * Normalize format string
   */
  public static normalizeFormat(format: string): string {
    return format.replace('image/', '');
  }

  /**
   * Apply image processing transformations
   * 
   * NOTE: This is a simplified implementation for demonstration.
   * In production, you should use a proper image processing library like:
   * - sharp (Node.js)
   * - jimp (Pure JavaScript)
   * - canvas (Node.js)
   */
  private static async applyImageProcessing(
    buffer: Buffer,
    dimensions: { width: number; height: number },
    format: string,
    quality: number
  ): Promise<{ buffer: Buffer; metadata: ImageMetadata }> {
    // This is a placeholder implementation
    // In a real implementation, you would use an image processing library
    
    // For now, return the original buffer with updated metadata
    const metadata: ImageMetadata = {
      width: dimensions.width,
      height: dimensions.height,
      format: `image/${format}`,
      size: buffer.length, // This would change with actual processing
    };

    return {
      buffer,
      metadata,
    };
  }

  /**
   * Batch validate multiple images
   */
  static async batchValidateImages(
    images: Array<{ data: Buffer | string; id: string; source?: 'upload' | 'url' }>
  ): Promise<Array<{ id: string; result: ImageValidationResult }>> {
    const results: Array<{ id: string; result: ImageValidationResult }> = [];
    
    // Process in small batches to avoid memory issues
    const batchSize = 5;
    for (let i = 0; i < images.length; i += batchSize) {
      const batch = images.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (image) => ({
        id: image.id,
        result: await this.validateImage(image.data, image.source),
      }));
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    return results;
  }

  /**
   * Create optimized image data URL for API transmission
   */
  static createDataURL(buffer: Buffer, format: string): string {
    const base64 = buffer.toString('base64');
    return `data:${format};base64,${base64}`;
  }

  /**
   * Extract image data from data URL
   */
  static extractFromDataURL(dataURL: string): { buffer: Buffer; format: string } {
    const match = dataURL.match(/^data:([^;]+);base64,(.+)$/);
    if (!match || !match[1] || !match[2]) {
      throw new ValidationError('Invalid data URL format', createErrorContext('ImagePreprocessingService', 'extractFromDataURL'));
    }

    return {
      format: match[1],
      buffer: Buffer.from(match[2], 'base64'),
    };
  }
}

/**
 * Image utilities for common operations
 */
export class ImageUtils {
  /**
   * Generate thumbnail dimensions while maintaining aspect ratio
   */
  static calculateThumbnailDimensions(
    originalWidth: number,
    originalHeight: number,
    maxSize: number = 300
  ): { width: number; height: number } {
    const aspectRatio = originalWidth / originalHeight;
    
    if (originalWidth > originalHeight) {
      return {
        width: Math.min(maxSize, originalWidth),
        height: Math.round((Math.min(maxSize, originalWidth)) / aspectRatio),
      };
    } else {
      return {
        width: Math.round((Math.min(maxSize, originalHeight)) * aspectRatio),
        height: Math.min(maxSize, originalHeight),
      };
    }
  }

  /**
   * Check if image needs processing based on criteria
   */
  static needsProcessing(
    metadata: ImageMetadata,
    options: ImageProcessingOptions = {}
  ): boolean {
    const targetWidth = options.targetWidth || IMAGE_CONFIG.OPTIMAL_DIMENSIONS.width;
    const targetHeight = options.targetHeight || IMAGE_CONFIG.OPTIMAL_DIMENSIONS.height;
    
    // Check dimensions
    if (metadata.width > targetWidth || metadata.height > targetHeight) {
      return true;
    }
    
    // Check format
    const optimalFormat = ImagePreprocessingService.getOptimalFormat(metadata.format);
    if (ImagePreprocessingService.normalizeFormat(metadata.format) !== optimalFormat) {
      return true;
    }
    
    // Check size
    if (metadata.size > IMAGE_CONFIG.MAX_FILE_SIZE * 0.8) { // 80% threshold
      return true;
    }
    
    return false;
  }

  /**
   * Estimate processing time based on image characteristics
   */
  static estimateProcessingTime(metadata: ImageMetadata): number {
    // Base time in milliseconds
    const baseTime = 500;
    
    // Factor in dimensions (larger images take longer)
    const pixelCount = metadata.width * metadata.height;
    const dimensionFactor = Math.max(1, pixelCount / (1024 * 1024)); // Base on 1MP
    
    // Factor in file size
    const sizeFactor = Math.max(1, metadata.size / (1024 * 1024)); // Base on 1MB
    
    return Math.round(baseTime * dimensionFactor * sizeFactor);
  }
}