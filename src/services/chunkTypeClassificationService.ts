import { createClient } from '@supabase/supabase-js';

/**
 * Chunk type enumeration for semantic classification
 */
export enum ChunkType {
  PRODUCT_DESCRIPTION = 'product_description',
  TECHNICAL_SPECS = 'technical_specs',
  VISUAL_SHOWCASE = 'visual_showcase',
  DESIGNER_STORY = 'designer_story',
  COLLECTION_OVERVIEW = 'collection_overview',
  SUPPORTING_CONTENT = 'supporting_content',
  INDEX_CONTENT = 'index_content',
  SUSTAINABILITY_INFO = 'sustainability_info',
  CERTIFICATION_INFO = 'certification_info',
  UNCLASSIFIED = 'unclassified'
}

/**
 * Classification result with confidence and metadata
 */
export interface ChunkClassificationResult {
  chunkType: ChunkType;
  confidence: number;
  metadata: ChunkTypeMetadata;
  reasoning: string;
}

/**
 * Structured metadata for different chunk types
 */
export interface ChunkTypeMetadata {
  // Product Description metadata
  productName?: string;
  productCategory?: string;
  keyFeatures?: string[];
  materials?: string[];
  dimensions?: string;
  colors?: string[];

  // Technical Specs metadata
  specifications?: Record<string, string>;
  measurements?: Record<string, string>;
  technicalDetails?: string[];
  certifications?: string[];

  // Visual Showcase metadata
  imageReferences?: string[];
  visualElements?: string[];
  styleDescription?: string;
  moodboardElements?: string[];

  // Designer Story metadata
  designerName?: string;
  studioName?: string;
  designPhilosophy?: string;
  inspirationSources?: string[];
  designProcess?: string[];

  // Collection Overview metadata
  collectionName?: string;
  collectionTheme?: string;
  productCount?: number;
  collectionDescription?: string;
  seasonYear?: string;

  // Supporting Content metadata
  contentType?: 'introduction' | 'conclusion' | 'navigation' | 'legal' | 'contact';
  purpose?: string;
  relatedSections?: string[];
}

/**
 * Chunk Type Classification Service
 *
 * Provides intelligent semantic classification of document chunks into predefined types
 * with structured metadata extraction for each type. Uses pattern recognition and
 * content analysis to determine the most appropriate classification.
 */
export class ChunkTypeClassificationService {
  private supabase;

  constructor() {
    this.supabase = (createClient as any)(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  }

  /**
   * Classify a single chunk and extract structured metadata
   */
  async classifyChunk(chunkId: string, content: string): Promise<ChunkClassificationResult> {
    console.log(`🎯 Classifying chunk: ${chunkId}`);

    try {
      // Analyze content patterns and structure
      const classification = this.analyzeContentPatterns(content);

      // Extract structured metadata based on classification
      const metadata = await this.extractStructuredMetadata(content, classification.chunkType);

      // Store classification in database
      await this.storeClassification(chunkId, classification.chunkType, classification.confidence, metadata);

      return {
        ...classification,
        metadata,
      };
    } catch (error) {
      console.error(`❌ Failed to classify chunk ${chunkId}:`, error);

      // Return default classification on error
      return {
        chunkType: ChunkType.UNCLASSIFIED,
        confidence: 0.0,
        metadata: {},
        reasoning: `Classification failed: ${error}`,
      };
    }
  }

  /**
   * Classify multiple chunks in batch
   */
  async classifyChunksBatch(chunks: Array<{id: string, content: string}>): Promise<ChunkClassificationResult[]> {
    console.log(`🎯 Batch classifying ${chunks.length} chunks`);

    const results: ChunkClassificationResult[] = [];

    // Process chunks in parallel batches of 10
    const batchSize = 10;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);

      const batchPromises = batch.map(chunk =>
        this.classifyChunk(chunk.id, chunk.content),
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Small delay between batches to avoid overwhelming the system
      if (i + batchSize < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`✅ Completed batch classification of ${chunks.length} chunks`);
    return results;
  }

  /**
   * Analyze content patterns to determine chunk type
   */
  private analyzeContentPatterns(content: string): { chunkType: ChunkType; confidence: number; reasoning: string } {
    const contentLower = content.toLowerCase();
    const contentLength = content.length;

    // Product Description patterns
    if (this.isProductDescription(content)) {
      return {
        chunkType: ChunkType.PRODUCT_DESCRIPTION,
        confidence: 0.85,
        reasoning: 'Contains product name, description, and key features',
      };
    }

    // Technical Specs patterns
    if (this.isTechnicalSpecs(content)) {
      return {
        chunkType: ChunkType.TECHNICAL_SPECS,
        confidence: 0.90,
        reasoning: 'Contains technical specifications, measurements, or detailed properties',
      };
    }

    // Visual Showcase patterns
    if (this.isVisualShowcase(content)) {
      return {
        chunkType: ChunkType.VISUAL_SHOWCASE,
        confidence: 0.80,
        reasoning: 'Contains visual descriptions, image references, or style elements',
      };
    }

    // Designer Story patterns
    if (this.isDesignerStory(content)) {
      return {
        chunkType: ChunkType.DESIGNER_STORY,
        confidence: 0.85,
        reasoning: 'Contains designer information, philosophy, or creative process',
      };
    }

    // Collection Overview patterns
    if (this.isCollectionOverview(content)) {
      return {
        chunkType: ChunkType.COLLECTION_OVERVIEW,
        confidence: 0.80,
        reasoning: 'Contains collection information, themes, or overview content',
      };
    }

    // Index Content patterns
    if (this.isIndexContent(content)) {
      return {
        chunkType: ChunkType.INDEX_CONTENT,
        confidence: 0.95,
        reasoning: 'Contains table of contents, index, or navigation elements',
      };
    }

    // Sustainability Info patterns
    if (this.isSustainabilityInfo(content)) {
      return {
        chunkType: ChunkType.SUSTAINABILITY_INFO,
        confidence: 0.90,
        reasoning: 'Contains sustainability, environmental, or eco-friendly information',
      };
    }

    // Certification Info patterns
    if (this.isCertificationInfo(content)) {
      return {
        chunkType: ChunkType.CERTIFICATION_INFO,
        confidence: 0.90,
        reasoning: 'Contains certification, compliance, or quality assurance information',
      };
    }

    // Supporting Content (default for other content)
    if (contentLength > 50) {
      return {
        chunkType: ChunkType.SUPPORTING_CONTENT,
        confidence: 0.60,
        reasoning: 'General content that supports the document but doesn\'t fit specific categories',
      };
    }

    // Unclassified (very short or unclear content)
    return {
      chunkType: ChunkType.UNCLASSIFIED,
      confidence: 0.30,
      reasoning: 'Content too short or unclear for classification',
    };
  }

  /**
   * Check if content represents a product description
   */
  private isProductDescription(content: string): boolean {
    const contentLower = content.toLowerCase();

    // Product name patterns (UPPERCASE words)
    const hasProductName = /\b[A-Z]{2,}\b/.test(content);

    // Product description keywords
    const productKeywords = [
      'product', 'design', 'collection', 'series', 'line',
      'available in', 'comes in', 'features', 'includes',
      'material', 'finish', 'color', 'size', 'dimension',
    ];

    const keywordMatches = productKeywords.filter(keyword =>
      contentLower.includes(keyword),
    ).length;

    // Dimension patterns (e.g., "15×38", "20×40")
    const hasDimensions = /\d+\s*[×x]\s*\d+/.test(content);

    return hasProductName && (keywordMatches >= 2 || hasDimensions);
  }

  /**
   * Check if content represents technical specifications
   */
  private isTechnicalSpecs(content: string): boolean {
    const contentLower = content.toLowerCase();

    // Technical specification keywords
    const techKeywords = [
      'specification', 'specs', 'technical', 'properties',
      'dimensions', 'weight', 'capacity', 'performance',
      'material composition', 'thickness', 'density',
      'resistance', 'durability', 'compliance',
    ];

    const keywordMatches = techKeywords.filter(keyword =>
      contentLower.includes(keyword),
    ).length;

    // Measurement patterns
    const hasMeasurements = /\d+\s*(mm|cm|m|kg|g|%|°C|°F)/.test(content);

    // Technical formatting (lists, specifications)
    const hasListFormat = content.includes('•') || content.includes('-') || content.includes(':');

    return keywordMatches >= 2 || (hasMeasurements && hasListFormat);
  }

  /**
   * Check if content represents visual showcase
   */
  private isVisualShowcase(content: string): boolean {
    const contentLower = content.toLowerCase();

    // Visual keywords
    const visualKeywords = [
      'image', 'photo', 'visual', 'showcase', 'gallery',
      'moodboard', 'style', 'aesthetic', 'look', 'appearance',
      'color palette', 'texture', 'pattern', 'finish',
    ];

    const keywordMatches = visualKeywords.filter(keyword =>
      contentLower.includes(keyword),
    ).length;

    // Image references
    const hasImageRefs = content.includes('![') || content.includes('<img') ||
                        contentLower.includes('see image') || contentLower.includes('shown in');

    return keywordMatches >= 2 || hasImageRefs;
  }

  /**
   * Check if content represents designer story
   */
  private isDesignerStory(content: string): boolean {
    const contentLower = content.toLowerCase();

    // Designer keywords
    const designerKeywords = [
      'designer', 'design', 'studio', 'architect', 'creative',
      'inspiration', 'philosophy', 'vision', 'concept',
      'process', 'approach', 'methodology', 'story',
    ];

    const keywordMatches = designerKeywords.filter(keyword =>
      contentLower.includes(keyword),
    ).length;

    // Designer name patterns (often in caps or with studio)
    const hasDesignerName = /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(content) ||
                           contentLower.includes('studio') ||
                           contentLower.includes('design by');

    return keywordMatches >= 3 || (keywordMatches >= 2 && hasDesignerName);
  }

  /**
   * Check if content represents collection overview
   */
  private isCollectionOverview(content: string): boolean {
    const contentLower = content.toLowerCase();

    // Collection keywords
    const collectionKeywords = [
      'collection', 'series', 'line', 'range', 'family',
      'overview', 'introduction', 'presents', 'featuring',
      'includes', 'comprises', 'consists of',
    ];

    const keywordMatches = collectionKeywords.filter(keyword =>
      contentLower.includes(keyword),
    ).length;

    // Collection structure indicators
    const hasStructure = content.includes('•') || content.includes('-') ||
                        /\d+\s+(products|items|pieces)/.test(contentLower);

    return keywordMatches >= 2 || (keywordMatches >= 1 && hasStructure);
  }

  /**
   * Check if content represents index/navigation content
   */
  private isIndexContent(content: string): boolean {
    const contentLower = content.toLowerCase();

    // Index keywords
    const indexKeywords = [
      'table of contents', 'index', 'contents', 'navigation',
      'page', 'section', 'chapter', 'part',
    ];

    const keywordMatches = indexKeywords.filter(keyword =>
      contentLower.includes(keyword),
    ).length;

    // Page number patterns
    const hasPageNumbers = /\.\.\.\s*\d+/.test(content) || /page\s+\d+/i.test(content);

    // List structure with numbers
    const hasNumberedList = /^\d+\./.test(content.trim()) || content.includes('...');

    return keywordMatches >= 1 || hasPageNumbers || hasNumberedList;
  }

  /**
   * Check if content represents sustainability information
   */
  private isSustainabilityInfo(content: string): boolean {
    const contentLower = content.toLowerCase();

    // Sustainability keywords
    const sustainabilityKeywords = [
      'sustainability', 'sustainable', 'eco', 'environmental',
      'green', 'renewable', 'recycled', 'recyclable',
      'carbon footprint', 'eco-friendly', 'biodegradable',
      'energy efficient', 'responsible sourcing',
    ];

    const keywordMatches = sustainabilityKeywords.filter(keyword =>
      contentLower.includes(keyword),
    ).length;

    return keywordMatches >= 2;
  }

  /**
   * Check if content represents certification information
   */
  private isCertificationInfo(content: string): boolean {
    const contentLower = content.toLowerCase();

    // Certification keywords
    const certificationKeywords = [
      'certification', 'certified', 'standard', 'compliance',
      'iso', 'ce mark', 'quality assurance', 'tested',
      'approved', 'meets standards', 'conforms to',
    ];

    const keywordMatches = certificationKeywords.filter(keyword =>
      contentLower.includes(keyword),
    ).length;

    // Certification codes (ISO, CE, etc.)
    const hasCertCodes = /\b(ISO|CE|EN|ASTM|ANSI)\s*\d+/.test(content);

    return keywordMatches >= 2 || hasCertCodes;
  }

  /**
   * Extract structured metadata based on chunk type
   */
  private async extractStructuredMetadata(content: string, chunkType: ChunkType): Promise<ChunkTypeMetadata> {
    const metadata: ChunkTypeMetadata = {};

    switch (chunkType) {
      case ChunkType.PRODUCT_DESCRIPTION:
        return this.extractProductMetadata(content);

      case ChunkType.TECHNICAL_SPECS:
        return this.extractTechnicalMetadata(content);

      case ChunkType.VISUAL_SHOWCASE:
        return this.extractVisualMetadata(content);

      case ChunkType.DESIGNER_STORY:
        return this.extractDesignerMetadata(content);

      case ChunkType.COLLECTION_OVERVIEW:
        return this.extractCollectionMetadata(content);

      default:
        return metadata;
    }
  }

  /**
   * Extract product-specific metadata
   */
  private extractProductMetadata(content: string): ChunkTypeMetadata {
    const metadata: ChunkTypeMetadata = {};

    // Extract product name (UPPERCASE words)
    const productNameMatch = content.match(/\b[A-Z]{2,}(?:\s+[A-Z]{2,})*\b/);
    if (productNameMatch) {
      metadata.productName = productNameMatch[0];
    }

    // Extract dimensions (e.g., "15×38", "20×40")
    const dimensionMatch = content.match(/\d+\s*[×x]\s*\d+(?:\s*[×x]\s*\d+)?/);
    if (dimensionMatch) {
      metadata.dimensions = dimensionMatch[0];
    }

    // Extract materials
    const materialKeywords = ['wood', 'metal', 'glass', 'ceramic', 'fabric', 'leather', 'plastic', 'stone', 'concrete'];
    const foundMaterials = materialKeywords.filter(material =>
      content.toLowerCase().includes(material),
    );
    if (foundMaterials.length > 0) {
      metadata.materials = foundMaterials;
    }

    // Extract colors
    const colorKeywords = ['white', 'black', 'red', 'blue', 'green', 'yellow', 'brown', 'gray', 'grey', 'beige', 'natural'];
    const foundColors = colorKeywords.filter(color =>
      content.toLowerCase().includes(color),
    );
    if (foundColors.length > 0) {
      metadata.colors = foundColors;
    }

    // Extract key features (bullet points or listed items)
    const features = this.extractListItems(content);
    if (features.length > 0) {
      metadata.keyFeatures = features;
    }

    return metadata;
  }

  /**
   * Extract technical specifications metadata
   */
  private extractTechnicalMetadata(content: string): ChunkTypeMetadata {
    const metadata: ChunkTypeMetadata = {};

    // Extract specifications (key: value pairs)
    const specifications: Record<string, string> = {};
    const specLines = content.split('\n').filter(line => line.includes(':'));

    specLines.forEach(line => {
      const [key, value] = line.split(':').map(s => s.trim());
      if (key && value) {
        specifications[key] = value;
      }
    });

    if (Object.keys(specifications).length > 0) {
      metadata.specifications = specifications;
    }

    // Extract measurements
    const measurements: Record<string, string> = {};
    const measurementMatches = content.match(/\d+\s*(mm|cm|m|kg|g|%|°C|°F)/g);
    if (measurementMatches) {
      measurementMatches.forEach((match, index) => {
        measurements[`measurement_${index + 1}`] = match;
      });
      metadata.measurements = measurements;
    }

    // Extract technical details
    const technicalDetails = this.extractListItems(content);
    if (technicalDetails.length > 0) {
      metadata.technicalDetails = technicalDetails;
    }

    return metadata;
  }

  /**
   * Extract visual showcase metadata
   */
  private extractVisualMetadata(content: string): ChunkTypeMetadata {
    const metadata: ChunkTypeMetadata = {};

    // Extract image references
    const imageRefs = [];
    const imgMatches = content.match(/!\[([^\]]*)\]/g);
    if (imgMatches) {
      imageRefs.push(...imgMatches);
    }

    if (content.toLowerCase().includes('image') || content.toLowerCase().includes('photo')) {
      imageRefs.push('Referenced in text');
    }

    if (imageRefs.length > 0) {
      metadata.imageReferences = imageRefs;
    }

    // Extract visual elements
    const visualKeywords = ['color', 'texture', 'pattern', 'finish', 'style', 'aesthetic'];
    const foundElements = visualKeywords.filter(element =>
      content.toLowerCase().includes(element),
    );
    if (foundElements.length > 0) {
      metadata.visualElements = foundElements;
    }

    // Extract style description
    const styleMatch = content.match(/style[:\s]+([^.!?]+)/i);
    if (styleMatch) {
      metadata.styleDescription = styleMatch[1].trim();
    }

    return metadata;
  }

  /**
   * Extract designer story metadata
   */
  private extractDesignerMetadata(content: string): ChunkTypeMetadata {
    const metadata: ChunkTypeMetadata = {};

    // Extract designer name
    const designerMatch = content.match(/(?:designer?|design by|created by)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
    if (designerMatch) {
      metadata.designerName = designerMatch[1];
    }

    // Extract studio name
    const studioMatch = content.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+studio/i);
    if (studioMatch) {
      metadata.studioName = studioMatch[1] + ' Studio';
    }

    // Extract design philosophy
    const philosophyMatch = content.match(/(?:philosophy|vision|approach)[:\s]+([^.!?]+)/i);
    if (philosophyMatch) {
      metadata.designPhilosophy = philosophyMatch[1].trim();
    }

    // Extract inspiration sources
    const inspirationKeywords = ['inspired by', 'inspiration', 'influenced by'];
    const inspirationSources = [];
    inspirationKeywords.forEach(keyword => {
      const match = content.match(new RegExp(`${keyword}[:\s]+([^.!?]+)`, 'i'));
      if (match) {
        inspirationSources.push(match[1].trim());
      }
    });
    if (inspirationSources.length > 0) {
      metadata.inspirationSources = inspirationSources;
    }

    return metadata;
  }

  /**
   * Extract collection overview metadata
   */
  private extractCollectionMetadata(content: string): ChunkTypeMetadata {
    const metadata: ChunkTypeMetadata = {};

    // Extract collection name
    const collectionMatch = content.match(/(?:collection|series|line)[:\s]+([A-Z][a-zA-Z\s]+)/i);
    if (collectionMatch) {
      metadata.collectionName = collectionMatch[1].trim();
    }

    // Extract collection theme
    const themeMatch = content.match(/(?:theme|concept)[:\s]+([^.!?]+)/i);
    if (themeMatch) {
      metadata.collectionTheme = themeMatch[1].trim();
    }

    // Extract product count
    const countMatch = content.match(/(\d+)\s+(?:products|items|pieces)/i);
    if (countMatch) {
      metadata.productCount = parseInt(countMatch[1]);
    }

    // Extract season/year
    const seasonMatch = content.match(/(spring|summer|fall|autumn|winter)\s+(\d{4})/i);
    if (seasonMatch) {
      metadata.seasonYear = `${seasonMatch[1]} ${seasonMatch[2]}`;
    }

    return metadata;
  }

  /**
   * Extract list items from content (bullet points, numbered lists, etc.)
   */
  private extractListItems(content: string): string[] {
    const items: string[] = [];

    // Extract bullet points
    const bulletMatches = content.match(/[•\-\*]\s*([^\n]+)/g);
    if (bulletMatches) {
      items.push(...bulletMatches.map(match => match.replace(/^[•\-\*]\s*/, '').trim()));
    }

    // Extract numbered lists
    const numberedMatches = content.match(/\d+\.\s*([^\n]+)/g);
    if (numberedMatches) {
      items.push(...numberedMatches.map(match => match.replace(/^\d+\.\s*/, '').trim()));
    }

    return items.filter(item => item.length > 0);
  }

  /**
   * Store classification results in database
   */
  private async storeClassification(
    chunkId: string,
    chunkType: ChunkType,
    confidence: number,
    metadata: ChunkTypeMetadata,
  ): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('document_chunks')
        .update({
          chunk_type: chunkType,
          chunk_type_confidence: confidence,
          chunk_type_metadata: metadata,
  })
        .eq('id', chunkId);

      if (error) {
        console.error(`❌ Failed to store classification for chunk ${chunkId}:`, error);
        throw error;
      }

      console.log(`✅ Stored classification for chunk ${chunkId}: ${chunkType} (${confidence})`);
    } catch (error) {
      console.error(`❌ Database error storing classification for chunk ${chunkId}:`, error);
      throw error;
    }
  }

  /**
   * Get classification statistics for a document
   */
  async getDocumentClassificationStats(documentId: string): Promise<Record<string, number>> {
    try {
      const { data, error } = await this.supabase
        .from('document_chunks')
        .select('chunk_type')
        .eq('document_id', documentId);

      if (error) {
        console.error(`❌ Failed to get classification stats for document ${documentId}:`, error);
        return {};
      }

      const stats: Record<string, number> = {};
      data.forEach(chunk => {
        const type = chunk.chunk_type || 'unclassified';
        stats[type] = (stats[type] || 0) + 1;
      });

      return stats;
    } catch (error) {
      console.error(`❌ Error getting classification stats for document ${documentId}:`, error);
      return {};
    }
  }

  /**
   * Reclassify all chunks for a document
   */
  async reclassifyDocument(documentId: string): Promise<{ success: boolean; classified: number; errors: number }> {
    console.log(`🎯 Reclassifying all chunks for document: ${documentId}`);

    try {
      // Get all chunks for the document
      const { data: chunks, error } = await this.supabase
        .from('document_chunks')
        .select('id, content')
        .eq('document_id', documentId);

      if (error) {
        console.error(`❌ Failed to fetch chunks for document ${documentId}:`, error);
        return { success: false, classified: 0, errors: 1 };
      }

      if (!chunks || chunks.length === 0) {
        console.log(`⚠️ No chunks found for document ${documentId}`);
        return { success: true, classified: 0, errors: 0 };
      }

      // Classify all chunks
      const results = await this.classifyChunksBatch(chunks);

      const classified = results.filter(r => r.chunkType !== ChunkType.UNCLASSIFIED).length;
      const errors = results.filter(r => r.confidence === 0.0).length;

      console.log(`✅ Reclassified document ${documentId}: ${classified} classified, ${errors} errors`);

      return { success: true, classified, errors };
    } catch (error) {
      console.error(`❌ Error reclassifying document ${documentId}:`, error);
      return { success: false, classified: 0, errors: 1 };
    }
  }
}
