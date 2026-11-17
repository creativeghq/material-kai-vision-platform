export interface MLResult {
  success: boolean;
  data?: unknown;
  error?: string;
  confidence?: number;
  processingTime?: number;
  modelVersion?: string;
  provider?: string;
}

export interface ImageClassificationResult {
  label: string;
  score: number;
}

export interface TextEmbeddingResult {
  embedding: number[];
  dimensions: number;
}

export interface FeatureExtractionOptions {
  pooling?: 'mean' | 'cls';
  normalize?: boolean;
}

export interface MaterialAnalysisResult {
  image: ImageClassificationResult[];
  text?: TextEmbeddingResult;
  combined: {
    materialType: string;
    confidence: number;
    features: ImageClassificationResult[];
  };
}

export type DeviceType = 'webgpu' | 'cpu';

export interface MaterialAnalysisOptions {
  analysisDepth?: 'basic' | 'standard' | 'comprehensive';
  focusAreas?: string[];
  includeChemical?: boolean;
  includeMechanical?: boolean;
  includeEnvironmental?: boolean;
}
