/**
 * Category Extraction Service
 * 
 * Handles AI-powered extraction of material and product categories
 * from document content using MIVAA and other AI services
 */

import { supabase } from '@/integrations/supabase/client';
import { dynamicCategoryManagementService, CategoryExtractionResult } from './dynamicCategoryManagementService';

export interface CategoryExtractionOptions {
  includeProductCategories?: boolean;
  includeMaterialCategories?: boolean;
  confidenceThreshold?: number;
  maxCategories?: number;
  extractionMethods?: ('ai' | 'keyword' | 'pattern')[];
}

export interface ExtractedCategoryData {
  categories: CategoryExtractionResult[];
  metadata: {
    extractionMethod: string;
    processingTime: number;
    documentId: string;
    timestamp: string;
  };
}

class CategoryExtractionService {
  private static instance: CategoryExtractionService;
  
  private readonly PRODUCT_KEYWORDS = {
    tiles: ['tile', 'tiles', 'flooring', 'floor tile', 'wall tile', 'ceramic tile', 'porcelain tile'],
    decor: ['decor', 'decoration', 'decorative', 'ornament', 'art', 'sculpture', 'vase', 'planter'],
    lighting: ['light', 'lighting', 'lamp', 'fixture', 'chandelier', 'sconce', 'pendant', 'led'],
    furniture: ['furniture', 'chair', 'table', 'desk', 'cabinet', 'shelf', 'sofa', 'bed']
  };

  private readonly MATERIAL_KEYWORDS = {
    wood: ['wood', 'timber', 'oak', 'pine', 'maple', 'cherry', 'walnut', 'bamboo'],
    metals: ['metal', 'steel', 'aluminum', 'brass', 'copper', 'iron', 'bronze'],
    ceramics: ['ceramic', 'porcelain', 'clay', 'earthenware', 'stoneware'],
    glass: ['glass', 'crystal', 'tempered glass', 'laminated glass'],
    concrete: ['concrete', 'cement', 'mortar', 'aggregate'],
    plastics: ['plastic', 'polymer', 'vinyl', 'acrylic', 'polycarbonate'],
    textiles: ['fabric', 'textile', 'cotton', 'wool', 'silk', 'linen', 'polyester'],
    stone: ['stone', 'marble', 'granite', 'limestone', 'slate', 'travertine', 'quartzite']
  };

  private constructor() {}

  public static getInstance(): CategoryExtractionService {
    if (!CategoryExtractionService.instance) {
      CategoryExtractionService.instance = new CategoryExtractionService();
    }
    return CategoryExtractionService.instance;
  }

  /**
   * Extract categories from document content
   */
  public async extractCategories(
    content: string,
    documentId: string,
    options: CategoryExtractionOptions = {}
  ): Promise<ExtractedCategoryData> {
    const startTime = Date.now();
    const {
      includeProductCategories = true,
      includeMaterialCategories = true,
      confidenceThreshold = 0.6,
      maxCategories = 10,
      extractionMethods = ['ai', 'keyword', 'pattern']
    } = options;

    const extractedCategories: CategoryExtractionResult[] = [];

    try {
      // Method 1: AI-powered extraction using MIVAA
      if (extractionMethods.includes('ai')) {
        const aiCategories = await this.extractCategoriesWithAI(content, documentId);
        extractedCategories.push(...aiCategories);
      }

      // Method 2: Keyword-based extraction
      if (extractionMethods.includes('keyword')) {
        const keywordCategories = await this.extractCategoriesWithKeywords(content, {
          includeProductCategories,
          includeMaterialCategories
        });
        extractedCategories.push(...keywordCategories);
      }

      // Method 3: Pattern-based extraction
      if (extractionMethods.includes('pattern')) {
        const patternCategories = await this.extractCategoriesWithPatterns(content);
        extractedCategories.push(...patternCategories);
      }

      // Merge and deduplicate results
      const mergedCategories = this.mergeAndDeduplicateCategories(extractedCategories);
      
      // Filter by confidence threshold and limit
      const filteredCategories = mergedCategories
        .filter(cat => cat.confidence >= confidenceThreshold)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, maxCategories);

      const processingTime = Date.now() - startTime;

      return {
        categories: filteredCategories,
        metadata: {
          extractionMethod: extractionMethods.join(', '),
          processingTime,
          documentId,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('Category extraction failed:', error);
      return {
        categories: [],
        metadata: {
          extractionMethod: 'error',
          processingTime: Date.now() - startTime,
          documentId,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * AI-powered category extraction using MIVAA service
   */
  private async extractCategoriesWithAI(content: string, documentId: string): Promise<CategoryExtractionResult[]> {
    try {
      const response = await fetch('/api/mivaa/extract-categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          documentId,
          extractionTypes: ['material_category', 'product_category'],
          options: {
            includeContext: true,
            confidenceThreshold: 0.5
          }
        })
      });

      if (!response.ok) {
        throw new Error(`MIVAA category extraction failed: ${response.statusText}`);
      }

      const result = await response.json();
      return (result.categories || []).map((cat: any) => ({
        categoryKey: cat.category_key,
        confidence: cat.confidence,
        extractedFrom: 'ai',
        context: cat.context || ''
      }));
    } catch (error) {
      console.error('AI category extraction failed:', error);
      return [];
    }
  }

  /**
   * Keyword-based category extraction
   */
  private async extractCategoriesWithKeywords(
    content: string,
    options: { includeProductCategories: boolean; includeMaterialCategories: boolean }
  ): Promise<CategoryExtractionResult[]> {
    const results: CategoryExtractionResult[] = [];
    const contentLower = content.toLowerCase();

    // Extract product categories
    if (options.includeProductCategories) {
      for (const [categoryKey, keywords] of Object.entries(this.PRODUCT_KEYWORDS)) {
        const matches = keywords.filter(keyword => contentLower.includes(keyword.toLowerCase()));
        if (matches.length > 0) {
          const confidence = Math.min(0.9, 0.5 + (matches.length * 0.1));
          results.push({
            categoryKey,
            confidence,
            extractedFrom: 'keyword',
            context: `Found keywords: ${matches.join(', ')}`
          });
        }
      }
    }

    // Extract material categories
    if (options.includeMaterialCategories) {
      for (const [categoryKey, keywords] of Object.entries(this.MATERIAL_KEYWORDS)) {
        const matches = keywords.filter(keyword => contentLower.includes(keyword.toLowerCase()));
        if (matches.length > 0) {
          const confidence = Math.min(0.9, 0.5 + (matches.length * 0.1));
          results.push({
            categoryKey,
            confidence,
            extractedFrom: 'keyword',
            context: `Found keywords: ${matches.join(', ')}`
          });
        }
      }
    }

    return results;
  }

  /**
   * Pattern-based category extraction using regex patterns
   */
  private async extractCategoriesWithPatterns(content: string): Promise<CategoryExtractionResult[]> {
    const results: CategoryExtractionResult[] = [];

    const patterns = [
      // Product category patterns
      { pattern: /(?:ceramic|porcelain|stone)\s+tiles?/gi, category: 'tiles', confidence: 0.8 },
      { pattern: /(?:wall|floor)\s+tiles?/gi, category: 'tiles', confidence: 0.7 },
      { pattern: /decorative\s+(?:panel|element|item)/gi, category: 'decor', confidence: 0.7 },
      { pattern: /(?:ceiling|pendant|table)\s+(?:light|lamp)/gi, category: 'lighting', confidence: 0.8 },
      { pattern: /led\s+(?:light|lighting|fixture)/gi, category: 'lighting', confidence: 0.8 },
      
      // Material category patterns
      { pattern: /(?:solid|engineered)\s+wood/gi, category: 'wood', confidence: 0.8 },
      { pattern: /stainless\s+steel/gi, category: 'metals', confidence: 0.9 },
      { pattern: /tempered\s+glass/gi, category: 'glass', confidence: 0.9 },
      { pattern: /natural\s+stone/gi, category: 'stone', confidence: 0.8 },
    ];

    for (const { pattern, category, confidence } of patterns) {
      const matches = content.match(pattern);
      if (matches && matches.length > 0) {
        results.push({
          categoryKey: category,
          confidence,
          extractedFrom: 'pattern',
          context: `Pattern matches: ${matches.slice(0, 3).join(', ')}`
        });
      }
    }

    return results;
  }

  /**
   * Merge and deduplicate category results
   */
  private mergeAndDeduplicateCategories(categories: CategoryExtractionResult[]): CategoryExtractionResult[] {
    const categoryMap = new Map<string, CategoryExtractionResult>();

    for (const category of categories) {
      const existing = categoryMap.get(category.categoryKey);
      
      if (!existing) {
        categoryMap.set(category.categoryKey, category);
      } else {
        // Merge with higher confidence and combined context
        const mergedConfidence = Math.max(existing.confidence, category.confidence);
        const mergedContext = `${existing.context}; ${category.context}`;
        const mergedExtractedFrom = existing.extractedFrom === category.extractedFrom 
          ? existing.extractedFrom 
          : `${existing.extractedFrom}, ${category.extractedFrom}`;

        categoryMap.set(category.categoryKey, {
          categoryKey: category.categoryKey,
          confidence: mergedConfidence,
          extractedFrom: mergedExtractedFrom,
          context: mergedContext
        });
      }
    }

    return Array.from(categoryMap.values());
  }

  /**
   * Update document with extracted categories
   */
  public async updateDocumentCategories(
    documentId: string,
    extractedData: ExtractedCategoryData
  ): Promise<void> {
    try {
      // Store extraction results in document metadata
      const { error } = await supabase
        .from('documents')
        .update({
          metadata: {
            extracted_categories: extractedData.categories,
            category_extraction_metadata: extractedData.metadata,
            last_category_update: new Date().toISOString()
          }
        })
        .eq('id', documentId);

      if (error) throw error;

      // Auto-update global categories if high confidence
      for (const category of extractedData.categories) {
        if (category.confidence > 0.8) {
          await dynamicCategoryManagementService.autoUpdateCategoriesFromDocument(
            documentId,
            { content: category.context }
          );
        }
      }
    } catch (error) {
      console.error('Failed to update document categories:', error);
    }
  }

  /**
   * Get category suggestions for a document
   */
  public async getCategorySuggestions(documentId: string): Promise<CategoryExtractionResult[]> {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('content, metadata')
        .eq('id', documentId)
        .single();

      if (error) throw error;

      if (!data?.content) {
        return [];
      }

      const extractedData = await this.extractCategories(data.content, documentId, {
        confidenceThreshold: 0.5,
        maxCategories: 5
      });

      return extractedData.categories;
    } catch (error) {
      console.error('Failed to get category suggestions:', error);
      return [];
    }
  }
}

// Export singleton instance
export const categoryExtractionService = CategoryExtractionService.getInstance();

// Convenience functions
export async function extractCategoriesFromContent(
  content: string,
  documentId: string,
  options?: CategoryExtractionOptions
): Promise<ExtractedCategoryData> {
  return await categoryExtractionService.extractCategories(content, documentId, options);
}

export async function getCategorySuggestions(documentId: string): Promise<CategoryExtractionResult[]> {
  return await categoryExtractionService.getCategorySuggestions(documentId);
}

export async function updateDocumentCategories(
  documentId: string,
  extractedData: ExtractedCategoryData
): Promise<void> {
  return await categoryExtractionService.updateDocumentCategories(documentId, extractedData);
}
