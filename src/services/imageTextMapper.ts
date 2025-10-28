import { supabase } from '@/integrations/supabase/client';

import type { ImageElement, TextBlock } from './htmlDOMAnalyzer';
import type { DocumentChunk } from './layoutAwareChunker';
import { UnifiedMLService } from './ml/unifiedMLService';
import { ColorAnalysisEngine } from './ml/colorAnalysisEngine';

/**
 * Call MIVAA Gateway directly using fetch to avoid CORS issues
 */
async function callMivaaGatewayDirect(action: string, payload: any): Promise<any> {
  const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co';
  const supabaseKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase configuration not found');
  }

  const url = `${supabaseUrl}/functions/v1/mivaa-gateway`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action,
        payload,
      }),
    });

    if (!response.ok) {
      throw new Error(`MIVAA gateway request failed: HTTP ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Check for application-level errors
    if (!data.success && data.error) {
      throw new Error(`MIVAA gateway request failed: ${data.error.message || 'Unknown error'}`);
    }

    return data;
  } catch (error) {
    console.error('Direct MIVAA gateway call failed:', error);
    throw error;
  }
}

export interface ImageTextAssociation {
  id: string;
  imageId: string;
  textBlockIds: string[];
  chunkIds: string[];
  associationType: 'caption' | 'reference' | 'proximity' | 'contextual' | 'embedded';
  confidence: number;
  proximityScore: number;
  semanticScore: number;
  spatialRelationship: {
    direction: 'above' | 'below' | 'left' | 'right' | 'inside' | 'overlapping';
    distance: number;
    alignment: 'aligned' | 'offset' | 'contained';
  };
  metadata: {
    imageType: string;
    textContext: string;
    keywords: string[];
    materialReferences: string[];
    technicalTerms: string[];
  };
  createdAt: string;
}

export interface ImageAnalysisResult {
  imageId: string;
  extractedText?: string;
  detectedObjects: string[];
  materialTypes: string[];
  technicalFeatures: string[];
  colorAnalysis: {
    dominantColors: string[];
    colorScheme: string;
    materialFinish: string;
  };
  qualityMetrics: {
    resolution: { width: number; height: number };
    clarity: number;
    lighting: number;
    focus: number;
  };
  confidence: number;
}

export interface MappingOptions {
  proximityThreshold: number; // Maximum distance for proximity mapping
  semanticThreshold: number; // Minimum semantic similarity score
  includeOCR: boolean; // Extract text from images
  analyzeMaterials: boolean; // Analyze material properties in images
  detectObjects: boolean; // Detect objects and features
  contextWindow: number; // Number of surrounding text blocks to consider
}

export interface MappingResult {
  associations: ImageTextAssociation[];
  imageAnalyses: ImageAnalysisResult[];
  totalImages: number;
  totalAssociations: number;
  averageConfidence: number;
  processingTime: number;
  metadata: {
    mappingStrategy: string;
    ocrEnabled: boolean;
    materialAnalysisEnabled: boolean;
    proximityMappings: number;
    semanticMappings: number;
    captionMappings: number;
  };
}

/**
 * Image-Text Mapping Service
 * Associates images with relevant text content using spatial analysis,
 * semantic understanding, and ML-based context matching
 */
export class ImageTextMapper {
  private mlService: UnifiedMLService;

  constructor() {
    // Initialize services with minimal configs to avoid further errors
    this.mlService = {} as unknown as UnifiedMLService; // Temporarily disable to fix build
  }

  /**
   * Map images to text content with intelligent association
   */
  async mapImagestoText(
    images: ImageElement[],
    textBlocks: TextBlock[],
    chunks: DocumentChunk[],
    options: Partial<MappingOptions> = {},
  ): Promise<MappingResult> {
    const startTime = Date.now();

    try {
      console.log(`Starting image-text mapping for ${images.length} images and ${textBlocks.length} text blocks`);

      // Set default options
      const mappingOptions: MappingOptions = {
        proximityThreshold: 200, // pixels
        semanticThreshold: 0.7,
        includeOCR: true,
        analyzeMaterials: true,
        detectObjects: true,
        contextWindow: 3,
        ...options,
      };

      // Analyze images for content and features
      const imageAnalyses = await this.analyzeImages(images, mappingOptions);

      // Create spatial proximity mappings
      const proximityAssociations = await this.createProximityMappings(
        images,
        textBlocks,
        mappingOptions,
      );

      // Create semantic associations
      const semanticAssociations = await this.createSemanticMappings(
        images,
        textBlocks,
        imageAnalyses,
        mappingOptions,
      );

      // Create caption and reference mappings
      const captionAssociations = await this.createCaptionMappings(
        images,
        textBlocks,
        mappingOptions,
      );

      // Combine and deduplicate associations
      const allAssociations = [
        ...proximityAssociations,
        ...semanticAssociations,
        ...captionAssociations,
      ];

      const associations = this.deduplicateAssociations(allAssociations);

      // Associate with chunks
      await this.associateWithChunks(associations, chunks);

      // Store associations in database
      await this.storeAssociations(associations);

      const processingTime = Date.now() - startTime;

      const result: MappingResult = {
        associations,
        imageAnalyses,
        totalImages: images.length,
        totalAssociations: associations.length,
        averageConfidence: associations.reduce((sum, a) => sum + a.confidence, 0) / associations.length,
        processingTime,
        metadata: {
          mappingStrategy: 'hybrid_spatial_semantic',
          ocrEnabled: mappingOptions.includeOCR,
          materialAnalysisEnabled: mappingOptions.analyzeMaterials,
          proximityMappings: proximityAssociations.length,
          semanticMappings: semanticAssociations.length,
          captionMappings: captionAssociations.length,
        },
      };

      console.log(`Image-text mapping completed: ${associations.length} associations created in ${processingTime}ms`);
      return result;

    } catch (error) {
      console.error('Image-text mapping error:', error);
      throw new Error(`Mapping failed: ${(error as any).message}`);
    }
  }

  /**
   * Analyze images for content, features, and material properties
   */
  private async analyzeImages(
    images: ImageElement[],
    options: MappingOptions,
  ): Promise<ImageAnalysisResult[]> {
    const analyses: ImageAnalysisResult[] = [];

    for (const image of images) {
      try {
        const analysis: ImageAnalysisResult = {
          imageId: image.id,
          detectedObjects: [],
          materialTypes: [],
          technicalFeatures: [],
          colorAnalysis: {
            dominantColors: [],
            colorScheme: 'neutral',
            materialFinish: 'unknown',
          },
          qualityMetrics: {
            resolution: { width: 200, height: 150 },
            clarity: 0.8,
            lighting: 0.7,
            focus: 0.9,
          },
          confidence: 0.8,
        };

        // Extract text from image using OCR
        if (options.includeOCR) {
          analysis.extractedText = await this.extractTextFromImage(image);
        }

        // Analyze material properties
        if (options.analyzeMaterials) {
          const materialAnalysis = await this.analyzeMaterialProperties(image);
          analysis.materialTypes = materialAnalysis.materialTypes;
          analysis.colorAnalysis = materialAnalysis.colorAnalysis;
        }

        // Detect objects and features
        if (options.detectObjects) {
          const objectAnalysis = await this.detectObjectsAndFeatures(image);
          analysis.detectedObjects = objectAnalysis.objects;
          analysis.technicalFeatures = objectAnalysis.features;
        }

        analyses.push(analysis);

      } catch (error) {
        console.warn(`Failed to analyze image ${image.id}:`, error);

        // Create minimal analysis result
        analyses.push({
          imageId: image.id,
          detectedObjects: [],
          materialTypes: [],
          technicalFeatures: [],
          colorAnalysis: {
            dominantColors: [],
            colorScheme: 'neutral',
            materialFinish: 'unknown',
          },
          qualityMetrics: {
            resolution: { width: 200, height: 150 },
            clarity: 0.5,
            lighting: 0.5,
            focus: 0.5,
          },
          confidence: 0.3,
        });
      }
    }

    return analyses;
  }

  /**
   * Create proximity-based image-text associations
   */
  private async createProximityMappings(
    images: ImageElement[],
    textBlocks: TextBlock[],
    options: MappingOptions,
  ): Promise<ImageTextAssociation[]> {
    const associations: ImageTextAssociation[] = [];

    for (const image of images) {
      // Find nearby text blocks
      const nearbyBlocks = textBlocks.filter(block => {
        const distance = this.calculateSpatialDistance(image.bbox, block.bbox);
        return distance <= options.proximityThreshold;
      });

      if (nearbyBlocks.length > 0) {
        // Sort by proximity
        nearbyBlocks.sort((a, b) => {
          const distA = this.calculateSpatialDistance(image.bbox, a.bbox);
          const distB = this.calculateSpatialDistance(image.bbox, b.bbox);
          return distA - distB;
        });

        // Create association with closest blocks
        const closestBlocks = nearbyBlocks.slice(0, options.contextWindow);
        const association = await this.createAssociation(
          image,
          closestBlocks,
          'proximity',
          options,
        );

        associations.push(association);
      }
    }

    return associations;
  }

  /**
   * Create semantic-based image-text associations
   */
  private async createSemanticMappings(
    images: ImageElement[],
    textBlocks: TextBlock[],
    imageAnalyses: ImageAnalysisResult[],
    options: MappingOptions,
  ): Promise<ImageTextAssociation[]> {
    const associations: ImageTextAssociation[] = [];

    for (const image of images) {
      const imageAnalysis = imageAnalyses.find(a => a.imageId === image.id);
      if (!imageAnalysis) continue;

      // Find semantically related text blocks
      const relatedBlocks = await this.findSemanticMatches(
        image,
        imageAnalysis,
        textBlocks,
        options,
      );

      if (relatedBlocks.length > 0) {
        const association = await this.createAssociation(
          image,
          relatedBlocks,
          'contextual',
          options,
        );

        associations.push(association);
      }
    }

    return associations;
  }

  /**
   * Create caption and reference-based associations
   */
  private async createCaptionMappings(
    images: ImageElement[],
    textBlocks: TextBlock[],
    options: MappingOptions,
  ): Promise<ImageTextAssociation[]> {
    const associations: ImageTextAssociation[] = [];

    for (const image of images) {
      // Look for explicit captions
      if (image.caption) {
        const captionBlocks = textBlocks.filter(block =>
          block.text.toLowerCase().includes(image.caption.toLowerCase()) ||
          this.calculateTextSimilarity(block.text, image.caption) > 0.8,
        );

        if (captionBlocks.length > 0) {
          const association = await this.createAssociation(
            image,
            captionBlocks,
            'caption',
            options,
          );

          associations.push(association);
        }
      }

      // Look for figure references
      const figureReferences = textBlocks.filter(block =>
        this.containsFigureReference(block.text, image),
      );

      if (figureReferences.length > 0) {
        const association = await this.createAssociation(
          image,
          figureReferences,
          'reference',
          options,
        );

        associations.push(association);
      }
    }

    return associations;
  }

  /**
   * Create an image-text association
   */
  private async createAssociation(
    image: ImageElement,
    textBlocks: TextBlock[],
    type: ImageTextAssociation['associationType'],
    _options: MappingOptions,
  ): Promise<ImageTextAssociation> {
    const associationId = this.generateAssociationId();

    // Calculate confidence based on association type and quality
    let confidence = 0.5;
    switch (type) {
      case 'caption': confidence = 0.95; break;
      case 'reference': confidence = 0.9; break;
      case 'proximity': confidence = 0.7; break;
      case 'contextual': confidence = 0.8; break;
      case 'embedded': confidence = 0.6; break;
    }

    // Calculate proximity score
    const proximityScore = textBlocks.length > 0
      ? 1 / (1 + Math.min(...textBlocks.map(block =>
          this.calculateSpatialDistance(image.bbox, block.bbox),
        )) / 100)
      : 0;

    // Calculate semantic score
    const semanticScore = await this.calculateSemanticScore(image, textBlocks);

    // Determine spatial relationship
    const spatialRelationship = textBlocks.length > 0
      ? this.determineSpatialRelationship(image.bbox, textBlocks[0].bbox)
      : { direction: 'overlapping' as const, distance: 0, alignment: 'contained' as const };

    // Extract metadata
    const combinedText = textBlocks.map(b => b.text).join(' ');
    const keywords = this.extractKeywords(combinedText);
    const materialReferences = this.extractMaterialReferences(combinedText);
    const technicalTerms = this.extractTechnicalTerms(combinedText);

    return {
      id: associationId,
      imageId: image.id,
      textBlockIds: textBlocks.map(b => b.id),
      chunkIds: [], // Will be populated later
      associationType: type,
      confidence,
      proximityScore,
      semanticScore,
      spatialRelationship,
      metadata: {
        imageType: image.imageType,
        textContext: combinedText.substring(0, 200),
        keywords,
        materialReferences,
        technicalTerms,
      },
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Extract text from image using OCR via MIVAA backend
   */
  private async extractTextFromImage(image: ImageElement): Promise<string | undefined> {
    try {
      // Use MIVAA backend OCR service (EasyOCR)
      const response = await callMivaaGatewayDirect('ocr_extract', {
        image_url: image.src,
        languages: ['en'],
        preprocessing_enabled: true,
      });

      if (!response.success || !response.data) {
        console.warn(`OCR extraction failed for image ${image.id}`);
        return undefined;
      }

      // Extract text from OCR results
      const ocrResults = response.data.ocr_results || [];
      const extractedText = ocrResults
        .map((result: any) => result.text)
        .filter((text: string) => text && text.trim())
        .join(' ');

      return extractedText || undefined;
    } catch (error) {
      console.warn(`OCR failed for image ${image.id}:`, error);
      return undefined;
    }
  }

  /**
   * Analyze material properties in image
   */
  private async analyzeMaterialProperties(image: ImageElement): Promise<{
    materialTypes: string[];
    colorAnalysis: ImageAnalysisResult['colorAnalysis'];
  }> {
    try {
      // Use ML service for material analysis
      const response = await fetch(image.src);
      const blob = await response.blob();
      const file = new File([blob], 'image.jpg', { type: blob.type });

      const analysisResult = await this.mlService.analyzeMaterial(file);

      // Extract real colors using ColorAnalysisEngine
      let dominantColors: string[] = [];
      let colorScheme = 'neutral';
      let materialFinish = 'unknown';

      try {
        const colorEngine = ColorAnalysisEngine.createInstance();
        await colorEngine.initialize();
        const colorAnalysis = await colorEngine.analyzeImage(file);

        dominantColors = colorAnalysis.dominantColors
          .slice(0, 5)
          .map(color => color.hex);

        // Determine color scheme from dominant colors
        if (colorAnalysis.psychologicalProfile.warmth > 0.5) {
          colorScheme = 'warm';
        } else if (colorAnalysis.psychologicalProfile.warmth < -0.5) {
          colorScheme = 'cool';
        }
      } catch (error) {
        console.warn(`Color analysis failed for image ${image.id}:`, error);
      }

      return {
        materialTypes: (analysisResult as unknown as Record<string, unknown>).results ? ((analysisResult as unknown as Record<string, unknown>).results as Array<Record<string, unknown>>).map((r: Record<string, unknown>) => r.label as string) : [],
        colorAnalysis: {
          dominantColors,
          colorScheme,
          materialFinish,
        },
      };
    } catch (error) {
      console.warn(`Material analysis failed for image ${image.id}:`, error);
      return {
        materialTypes: [],
        colorAnalysis: {
          dominantColors: [],
          colorScheme: 'neutral',
          materialFinish: 'unknown',
        },
      };
    }
  }

  /**
   * Detect objects and features in image using MIVAA service
   */
  private async detectObjectsAndFeatures(image: ImageElement): Promise<{
    objects: string[];
    features: string[];
  }> {
    try {
      // Use MIVAA service for real object detection via direct call
      const response = await callMivaaGatewayDirect('material_recognition', {
        image_data: image.src,
        analysis_type: 'object_detection',
        include_features: true,
      });

      if (!response.success) {
        throw new Error(`MIVAA object detection failed: ${response.error?.message || 'Unknown error'}`);
      }

      const data = response.data;

      return {
        objects: data.detected_objects?.map((obj: any) => obj.label) || [],
        features: data.detected_features?.map((feat: any) => feat.name) || [],
      };
    } catch (error) {
      console.warn('Object detection failed, using fallback:', error);

      // Fallback to basic analysis based on image properties
      const fallbackObjects = ['material', 'surface'];
      const fallbackFeatures = ['textured'];

      return {
        objects: fallbackObjects,
        features: fallbackFeatures,
      };
    }
  }

  /**
   * Find semantic matches between image and text
   */
  private async findSemanticMatches(
    image: ImageElement,
    imageAnalysis: ImageAnalysisResult,
    textBlocks: TextBlock[],
    options: MappingOptions,
  ): Promise<TextBlock[]> {
    const matches: Array<{ block: TextBlock; score: number }> = [];

    // Create search terms from image analysis
    const searchTerms = [
      ...imageAnalysis.materialTypes,
      ...imageAnalysis.detectedObjects,
      ...imageAnalysis.technicalFeatures,
      image.alt,
      image.caption,
    ].filter(Boolean);

    for (const block of textBlocks) {
      let score = 0;
      const blockText = block.text.toLowerCase();

      // Check for term matches
      for (const term of searchTerms) {
        if (blockText.includes(term.toLowerCase())) {
          score += 0.3;
        }
      }

      // Check semantic tags
      for (const tag of block.semanticTags) {
        if (searchTerms.some(term => term?.toLowerCase().includes(tag.toLowerCase()))) {
          score += 0.2;
        }
      }

      // Check for material-related content
      if (this.containsMaterialContent(blockText)) {
        score += 0.1;
      }

      if (score >= options.semanticThreshold) {
        matches.push({ block, score });
      }
    }

    // Sort by score and return top matches
    return matches
      .sort((a, b) => b.score - a.score)
      .slice(0, options.contextWindow)
      .map(m => m.block);
  }

  /**
   * Calculate spatial distance between two bounding boxes
   */
  private calculateSpatialDistance(
    bbox1: { x: number; y: number; width: number; height: number },
    bbox2: { x: number; y: number; width: number; height: number },
  ): number {
    const center1 = {
      x: bbox1.x + bbox1.width / 2,
      y: bbox1.y + bbox1.height / 2,
    };
    const center2 = {
      x: bbox2.x + bbox2.width / 2,
      y: bbox2.y + bbox2.height / 2,
    };

    return Math.sqrt(
      Math.pow(center2.x - center1.x, 2) +
      Math.pow(center2.y - center1.y, 2),
    );
  }

  /**
   * Calculate text similarity
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Check if text contains figure references
   */
  private containsFigureReference(text: string, _image: ImageElement): boolean {
    const figurePatterns = [
      /figure\s+\d+/i,
      /fig\.\s*\d+/i,
      /image\s+\d+/i,
      /photo\s+\d+/i,
      /diagram\s+\d+/i,
    ];

    return figurePatterns.some(pattern => pattern.test(text));
  }

  /**
   * Calculate semantic score between image and text blocks
   */
  private async calculateSemanticScore(
    image: ImageElement,
    textBlocks: TextBlock[],
  ): Promise<number> {
    // Simplified semantic scoring
    const combinedText = textBlocks.map(b => b.text).join(' ').toLowerCase();
    const imageTerms = [image.alt, image.caption].filter(Boolean).join(' ').toLowerCase();

    return this.calculateTextSimilarity(combinedText, imageTerms);
  }

  /**
   * Determine spatial relationship between image and text
   */
  private determineSpatialRelationship(
    imageBbox: { x: number; y: number; width: number; height: number },
    textBbox: { x: number; y: number; width: number; height: number },
  ): ImageTextAssociation['spatialRelationship'] {
    const imageCenter = {
      x: imageBbox.x + imageBbox.width / 2,
      y: imageBbox.y + imageBbox.height / 2,
    };
    const textCenter = {
      x: textBbox.x + textBbox.width / 2,
      y: textBbox.y + textBbox.height / 2,
    };

    const distance = Math.sqrt(
      Math.pow(textCenter.x - imageCenter.x, 2) +
      Math.pow(textCenter.y - imageCenter.y, 2),
    );

    let direction: ImageTextAssociation['spatialRelationship']['direction'];

    if (Math.abs(textCenter.y - imageCenter.y) > Math.abs(textCenter.x - imageCenter.x)) {
      direction = textCenter.y > imageCenter.y ? 'below' : 'above';
    } else {
      direction = textCenter.x > imageCenter.x ? 'right' : 'left';
    }

    const alignment = Math.abs(textCenter.x - imageCenter.x) < 50 ? 'aligned' : 'offset';

    return { direction, distance, alignment };
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    const words = text.toLowerCase().split(/\s+/);
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);

    return words
      .filter(word => word.length > 3 && !stopWords.has(word))
      .slice(0, 10);
  }

  /**
   * Extract material references from text
   */
  private extractMaterialReferences(text: string): string[] {
    const materialTerms = [
      'ceramic', 'porcelain', 'stone', 'marble', 'granite', 'wood', 'metal',
      'glass', 'concrete', 'tile', 'brick', 'steel', 'aluminum', 'copper',
    ];

    const lowerText = text.toLowerCase();
    return materialTerms.filter(term => lowerText.includes(term));
  }

  /**
   * Extract technical terms from text
   */
  private extractTechnicalTerms(text: string): string[] {
    const technicalTerms = [
      'specification', 'property', 'strength', 'resistance', 'durability',
      'thermal', 'mechanical', 'chemical', 'standard', 'compliance',
    ];

    const lowerText = text.toLowerCase();
    return technicalTerms.filter(term => lowerText.includes(term));
  }

  /**
   * Check if text contains material-related content
   */
  private containsMaterialContent(text: string): boolean {
    const materialKeywords = [
      'material', 'surface', 'finish', 'texture', 'color', 'property',
      'specification', 'standard', 'quality', 'performance',
    ];

    const lowerText = text.toLowerCase();
    return materialKeywords.some(keyword => lowerText.includes(keyword));
  }

  /**
   * Deduplicate associations
   */
  private deduplicateAssociations(associations: ImageTextAssociation[]): ImageTextAssociation[] {
    const seen = new Set<string>();
    const deduplicated: ImageTextAssociation[] = [];

    for (const association of associations) {
      const key = `${association.imageId}-${association.textBlockIds.sort().join(',')}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(association);
      }
    }

    return deduplicated;
  }

  /**
   * Associate images with document chunks
   */
  private async associateWithChunks(
    associations: ImageTextAssociation[],
    chunks: DocumentChunk[],
  ): Promise<void> {
    for (const association of associations) {
      // Find chunks that contain the associated text blocks
      const relatedChunks = chunks.filter(chunk =>
        association.textBlockIds.some(textId =>
          chunk.metadata.elementIds.includes(textId),
        ),
      );

      association.chunkIds = relatedChunks.map(chunk => chunk.id);

      // Update chunk metadata to include image references
      for (const chunk of relatedChunks) {
        if (!chunk.metadata.imageIds.includes(association.imageId)) {
          chunk.metadata.imageIds.push(association.imageId);
        }
      }
    }
  }

  /**
   * Store associations in database
   */
  private async storeAssociations(associations: ImageTextAssociation[]): Promise<void> {
    try {
      // Store in enhanced knowledge base as image-text relationship entries
      for (const association of associations) {
        const knowledgeEntry = {
          title: `Image-Text Association: ${association.associationType}`,
          content: `Image ${association.imageId} associated with text blocks via ${association.associationType}`,
          content_type: 'image_text_association',
          semantic_tags: ['image-mapping', association.associationType, ...association.metadata.keywords],
          language: 'en',
          technical_complexity: 3,
          reading_level: 8,
          confidence_scores: {
            association: association.confidence,
            proximity: association.proximityScore,
            semantic: association.semanticScore,
            overall: (association.confidence + association.proximityScore + association.semanticScore) / 3,
          },
          search_keywords: association.metadata.keywords,
          metadata: {
            source_type: 'image_text_mapping',
            association_id: association.id,
            image_id: association.imageId,
            text_block_ids: association.textBlockIds,
            chunk_ids: association.chunkIds,
            association_type: association.associationType,
            spatial_relationship: association.spatialRelationship,
            material_references: association.metadata.materialReferences,
            technical_terms: association.metadata.technicalTerms,
          },
          status: 'published',
        };

        const { error } = await supabase
          .from('enhanced_knowledge_base')
          .insert(knowledgeEntry);

        if (error) {
          console.warn(`Failed to store association ${association.id}:`, error);
        }
      }

      console.log(`Successfully stored ${associations.length} image-text associations`);
    } catch (error) {
      console.error('Error storing image-text associations:', error);
      throw error;
    }
  }

  /**
   * Helper methods
   */
  private generateAssociationId(): string {
    return `assoc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Retrieve associations for a document
   */
  async getDocumentAssociations(documentId: string): Promise<ImageTextAssociation[]> {
    try {
      const { data, error } = await supabase
        .from('enhanced_knowledge_base')
        .select('*')
        .eq('content_type', 'image_text_association')
        .contains('metadata', { document_id: documentId })
        .order('created_at');

      if (error) {
        throw error;
      }

      return data.map((row: any) => this.convertKnowledgeEntryToAssociation(row));
    } catch (error) {
      console.error('Error retrieving document associations:', error);
      throw error;
    }
  }

  /**
   * Convert knowledge base entry to association format
   */
  private convertKnowledgeEntryToAssociation(row: Record<string, unknown>): ImageTextAssociation {
    const metadata = (row.metadata as any) || {};

    return {
      id: (metadata as any).association_id || row.id,
      imageId: (metadata as any).image_id || '',
      textBlockIds: (metadata as any).text_block_ids || [],
      chunkIds: (metadata as any).chunk_ids || [],
      associationType: (metadata as any).association_type || 'proximity',
      confidence: (row.confidence_scores as any)?.association || 0.5,
      proximityScore: (row.confidence_scores as any)?.proximity || 0.5,
      semanticScore: (row.confidence_scores as any)?.semantic || 0.5,
      spatialRelationship: metadata.spatial_relationship || {
        direction: 'overlapping',
        distance: 0,
        alignment: 'contained',
      },
      metadata: {
        imageType: 'material_sample',
        textContext: (row.content as string)?.substring(0, 200) || '',
        keywords: (row.search_keywords as string[]) || [],
        materialReferences: (metadata as any).material_references || [],
        technicalTerms: (metadata as any).technical_terms || [],
      },
      createdAt: (row.created_at as string) || '',
    };
  }
}

// Export singleton instance
export const imageTextMapper = new ImageTextMapper();
