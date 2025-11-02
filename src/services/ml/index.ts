// Main ML services exports - CONSOLIDATED
// Note: All ML/AI services now use MIVAA API directly via mivaaApiClient
// Client-side ML services have been removed to eliminate duplicates

// Utility services
export { DeviceDetector } from './deviceDetector';

// Types
export type * from './types';

// Convenience exports for common use cases
export { type MLResult, type DeviceType } from './types';

// NOTE: Style analysis, texture analysis, and embedding services have been removed.
// Use MIVAA API instead:
// - Style analysis: mivaaApiClient.analyzeMaterial()
// - Embeddings: mivaaApiClient.generateEmbedding()
// - Material analysis: mivaaApiClient.analyzeMaterial()
