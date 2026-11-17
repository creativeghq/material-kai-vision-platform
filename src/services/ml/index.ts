// Main ML services exports - CONSOLIDATED
// All ML/AI services now use MIVAA API directly via mivaaApiClient

// Types
export type * from './types';

// Convenience exports for common use cases
export { type MLResult, type DeviceType } from './types';

// Embeddings go through the MIVAA API: mivaaApiClient.generateEmbedding().
