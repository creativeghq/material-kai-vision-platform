export interface MLResult {
  success: boolean;
  data?: any;
  error?: string;
  confidence?: number;
  processingTime?: number;
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