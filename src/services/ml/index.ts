// Main ML services exports - CONSOLIDATED
// All ML/AI services now use MIVAA API directly via mivaaApiClient

// Types
export type * from './types';

// Convenience exports for common use cases
export { type MLResult, type DeviceType } from './types';

// Style, texture, embedding and material analysis all go through the MIVAA API:
// - Style analysis: mivaaApiClient.analyzeMaterial()
// - Embeddings: mivaaApiClient.generateEmbedding()
// - Material analysis: mivaaApiClient.analyzeMaterial()
