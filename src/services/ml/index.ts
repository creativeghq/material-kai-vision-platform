// Main ML services exports - CONSOLIDATED
// Note: unifiedMLService removed - use MIVAA API directly via mivaaApiClient

// Style analysis services (client-side)
export { styleAnalysisService, StyleAnalysisService } from './styleAnalysisService';
export { hybridStyleAnalysisService, HybridStyleAnalysisService } from './hybridStyleAnalysisService';

// Utility services
export { DeviceDetector } from './deviceDetector';

// Types
export type * from './types';

// Convenience exports for common use cases
export {
  type MLResult,
  type DeviceType,
} from './types';



export {
  type HybridStyleAnalysisOptions,
  type HybridStyleResult,
} from './hybridStyleAnalysisService';

export {
  type StyleAnalysisResult,
  type StyleAnalysisOptions,
} from './styleAnalysisService';
