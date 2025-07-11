export interface Material {
  id: string;
  name: string;
  category: MaterialCategory;
  description?: string;
  imageUrl?: string;
  metadata: MaterialMetadata;
  vectorEmbedding?: number[];
  createdAt: Date;
  updatedAt: Date;
}

export interface MaterialMetadata {
  color?: string;
  finish?: string;
  size?: string;
  brand?: string;
  properties?: SVBRDFProperties;
}

export interface SVBRDFProperties {
  diffuse?: string;
  normal?: string;
  roughness?: number;
  specular?: string;
  metallic?: number;
}

export interface RecognitionResult {
  materialId: string;
  name: string;
  confidence: number;
  imageUrl: string;
  metadata: MaterialMetadata;
  processingTime: number;
}

export enum MaterialCategory {
  STONE = 'stone',
  WOOD = 'wood',
  METAL = 'metal',
  CERAMIC = 'ceramic',
  FABRIC = 'fabric',
  PLASTIC = 'plastic',
  GLASS = 'glass',
  CONCRETE = 'concrete'
}

export interface MoodBoard {
  id: string;
  userId: string;
  title: string;
  description?: string;
  isPublic: boolean;
  items: Material[];
  createdAt: Date;
  updatedAt: Date;
}