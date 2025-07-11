// Main ML services exports
export { clientMLService, ClientMLService } from './clientMLService';
export { serverMLService, ServerMLService } from './serverMLService';
export { hybridMLService, HybridMLService } from './hybridMLService';

// Individual service components
export { ImageClassifierService } from './imageClassifier';
export { TextEmbedderService } from './textEmbedder';
export { MaterialAnalyzerService } from './materialAnalyzer';
export { DeviceDetector } from './deviceDetector';

// Types
export type * from './types';

// Convenience exports for common use cases
export {
  type MLResult,
  type ImageClassificationResult,
  type TextEmbeddingResult,
  type MaterialAnalysisResult,
  type FeatureExtractionOptions,
  type DeviceType
} from './types';

export {
  type HybridMLOptions,
  type HybridMLResult
} from './hybridMLService';

export {
  type ServerMLRequest,
  type ServerMLResult
} from './serverMLService';

// Import for utility functions
import { hybridMLService } from './hybridMLService';

/**
 * Quick access to the recommended ML service for most use cases
 * This intelligently chooses between client and server processing
 */
export const mlService = hybridMLService;

/**
 * Utility function to get ML service recommendations
 */
export function getMLRecommendation(files: File[]) {
  return hybridMLService.getProcessingRecommendation(files);
}

/**
 * Utility function to check all ML services status
 */
export function getMLStatus() {
  return hybridMLService.getStatus();
}