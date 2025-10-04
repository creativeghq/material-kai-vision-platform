// Main ML services exports - CONSOLIDATED
export { unifiedMLService, UnifiedMLService } from './unifiedMLService';
export type { UnifiedMLServiceConfig, UnifiedMLOptions, UnifiedMLResult } from './unifiedMLService';

// Legacy ML services exports (DEPRECATED - use UnifiedMLService instead)
export { clientMLService, ClientMLService } from './clientMLService';
export { serverMLService, ServerMLService } from './serverMLService';
export { hybridMLService, HybridMLService } from './hybridMLService';

// Style analysis services
export { styleAnalysisService, StyleAnalysisService } from './styleAnalysisService';
export { hybridStyleAnalysisService, HybridStyleAnalysisService } from './hybridStyleAnalysisService';

// OCR services
export { ocrService, OCRService } from './ocrService';
export type { OCRResult, OCROptions } from './ocrService';
export { hybridOCRService, HybridOCRService } from './hybridOCRService';
export type { HybridOCROptions, HybridOCRResult } from './hybridOCRService';

// Individual service components
export { ImageClassifierService } from './imageClassifier';
export { TextEmbedderService } from './textEmbedder';
export { MaterialAnalyzerService } from './materialAnalyzer';
export { DeviceDetector } from './deviceDetector';
export { huggingFaceService, HuggingFaceService } from './huggingFaceService';

// Types
export type * from './types';

// Convenience exports for common use cases
export {
  type MLResult,
  type ImageClassificationResult,
  type TextEmbeddingResult,
  type MaterialAnalysisResult,
  type FeatureExtractionOptions,
  type DeviceType,
} from './types';

export {
  type HybridMLOptions,
  type HybridMLResult,
} from './hybridMLService';

export {
  type HybridStyleAnalysisOptions,
  type HybridStyleResult,
} from './hybridStyleAnalysisService';

export {
  type StyleAnalysisResult,
  type StyleAnalysisOptions,
} from './styleAnalysisService';

export {
  type ServerMLRequest,
  type ServerMLResult,
} from './serverMLService';

// Import for utility functions
import { unifiedMLService } from './unifiedMLService';

/**
 * Quick access to the recommended ML service for most use cases
 * This intelligently chooses between client and server processing
 *
 * UPDATED: Now uses the new UnifiedMLService instead of hybridMLService
 */
export const mlService = unifiedMLService;

/**
 * Utility function to check all ML services status
 *
 * UPDATED: Now uses the new UnifiedMLService
 */
export function getMLStatus() {
  return unifiedMLService.getStatus();
}
