/**
 * Dynamic Category Management Service
 *
 * Manages dynamic material and product categories with automatic updates
 * from document processing and AI extraction
 */

import { supabase } from '@/integrations/supabase/client';

export interface CategoryHierarchy {
  id: string;
  categoryKey: string;
  name: string;
  displayName: string;
  description?: string;
  parentCategoryId?: string;
  hierarchyLevel: number;
  sortOrder: number;
  displayGroup: string;
  isActive: boolean;
  isPrimaryCategory: boolean;
  aiExtractionEnabled: boolean;
  aiConfidenceThreshold: number;
  processingPriority: number;
  children?: CategoryHierarchy[];
  metaFields?: string[];
}

export interface CategoryUpdateRequest {
  categoryKey: string;
  name?: string;
  displayName?: string;
  description?: string;
  parentCategoryId?: string;
  isActive?: boolean;
  aiExtractionEnabled?: boolean;
  aiConfidenceThreshold?: number;
}

export interface CategoryCreationRequest {
  categoryKey: string;
  name: string;
  displayName: string;
  description?: string;
  parentCategoryId?: string;
  hierarchyLevel: number;
  sortOrder: number;
  displayGroup: string;
  isActive?: boolean;
  isPrimaryCategory?: boolean;
  aiExtractionEnabled?: boolean;
  aiConfidenceThreshold?: number;
  processingPriority?: number;
}

export interface CategoryExtractionResult {
  categoryKey: string;
  confidence: number;
  extractedFrom: string;
  context: string;
}

class DynamicCategoryManagementService {
  private static instance: DynamicCategoryManagementService;
  private categoriesCache: CategoryHierarchy[] | null = null;
  private cacheTimestamp: number | null = null;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  public static getInstance(): DynamicCategoryManagementService {
    if (!DynamicCategoryManagementService.instance) {
      DynamicCategoryManagementService.instance = new DynamicCategoryManagementService();
    }
    return DynamicCategoryManagementService.instance;
  }

  /**
   * Get all categories with hierarchical structure
   */
  public async getCategoriesHierarchy(): Promise<CategoryHierarchy[]> {
    if (this.isCacheValid() && this.categoriesCache) {
      return this.categoriesCache;
    }

    try {
      const { data, error } = await supabase
        .from('material_categories')
        .select('*')
        .eq('is_active', true)
        .order('hierarchy_level')
        .order('sort_order');

      if (error) throw error;

      const hierarchicalData = this.buildHierarchy(data || []);
      this.categoriesCache = hierarchicalData;
      this.cacheTimestamp = Date.now();

      return hierarchicalData;
    } catch (error) {
      console.error('Failed to fetch categories hierarchy:', error);
      return [];
    }
  }

  /**
   * Get categories by display group (products, core_materials, etc.)
   */
  public async getCategoriesByGroup(displayGroup: string): Promise<CategoryHierarchy[]> {
    const allCategories = await this.getCategoriesHierarchy();
    return allCategories.filter(cat => cat.displayGroup === displayGroup);
  }

  /**
   * Get product categories (Tiles, Decor, Lighting, Furniture)
   */
  public async getProductCategories(): Promise<CategoryHierarchy[]> {
    return await this.getCategoriesByGroup('products');
  }

  /**
   * Get material categories (Wood, Metal, Ceramic, etc.)
   */
  public async getMaterialCategories(): Promise<CategoryHierarchy[]> {
    return await this.getCategoriesByGroup('core_materials');
  }

  /**
   * Create a new category
   */
  public async createCategory(request: CategoryCreationRequest): Promise<CategoryHierarchy | null> {
    try {
      const { data, error } = await supabase
        .from('material_categories')
        .insert({
          category_key: request.categoryKey,
          name: request.name,
          display_name: request.displayName,
          description: request.description,
          parent_category_id: request.parentCategoryId,
          hierarchy_level: request.hierarchyLevel,
          sort_order: request.sortOrder,
          display_group: request.displayGroup,
          is_active: request.isActive ?? true,
          is_primary_category: request.isPrimaryCategory ?? false,
          ai_extraction_enabled: request.aiExtractionEnabled ?? true,
          ai_confidence_threshold: request.aiConfidenceThreshold ?? 0.7,
          processing_priority: request.processingPriority ?? 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      // Clear cache to force refresh
      this.clearCache();

      return this.mapToHierarchy(data);
    } catch (error) {
      console.error('Failed to create category:', error);
      return null;
    }
  }

  /**
   * Update an existing category
   */
  public async updateCategory(categoryKey: string, updates: CategoryUpdateRequest): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('material_categories')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('category_key', categoryKey);

      if (error) throw error;

      // Clear cache to force refresh
      this.clearCache();

      return true;
    } catch (error) {
      console.error('Failed to update category:', error);
      return false;
    }
  }

  /**
   * Extract categories from document content using AI
   */
  public async extractCategoriesFromContent(
    content: string,
    documentId: string,
  ): Promise<CategoryExtractionResult[]> {
    try {
      // Call MIVAA service for category extraction
      const response = await fetch('/api/mivaa/extract-categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          documentId,
          extractionTypes: ['material_category', 'product_category'],
        }),
      });

      if (!response.ok) {
        throw new Error(`Category extraction failed: ${response.statusText}`);
      }

      const result = await response.json();
      return result.categories || [];
    } catch (error) {
      console.error('Failed to extract categories from content:', error);
      return [];
    }
  }

  /**
   * Auto-update categories based on document processing
   */
  public async autoUpdateCategoriesFromDocument(
    documentId: string,
    extractedData: any,
  ): Promise<void> {
    try {
      const extractedCategories = await this.extractCategoriesFromContent(
        extractedData.content || '',
        documentId,
      );

      // Process high-confidence category extractions
      for (const extraction of extractedCategories) {
        if (extraction.confidence > 0.8) {
          await this.ensureCategoryExists(extraction);
        }
      }

      // Update document with detected categories
      await this.updateDocumentCategories(documentId, extractedCategories);
    } catch (error) {
      console.error('Failed to auto-update categories:', error);
    }
  }

  /**
   * Ensure a category exists, create if not found
   */
  private async ensureCategoryExists(extraction: CategoryExtractionResult): Promise<void> {
    const existingCategory = await this.getCategoryByKey(extraction.categoryKey);

    if (!existingCategory) {
      // Auto-create category based on extraction
      await this.createCategory({
        categoryKey: extraction.categoryKey,
        name: this.formatCategoryName(extraction.categoryKey),
        displayName: this.formatCategoryDisplayName(extraction.categoryKey),
        description: `Auto-generated category from document processing: ${extraction.context}`,
        hierarchyLevel: 0,
        sortOrder: 999, // Put auto-generated at end
        displayGroup: this.determineCategoryGroup(extraction.categoryKey),
        aiExtractionEnabled: true,
        aiConfidenceThreshold: 0.7,
        processingPriority: 5,
      });
    }
  }

  /**
   * Get category by key
   */
  public async getCategoryByKey(categoryKey: string): Promise<CategoryHierarchy | null> {
    const categories = await this.getCategoriesHierarchy();
    return this.findCategoryInHierarchy(categories, categoryKey);
  }

  // Private helper methods
  private isCacheValid(): boolean {
    return this.cacheTimestamp !== null &&
           (Date.now() - this.cacheTimestamp) < this.CACHE_DURATION;
  }

  private clearCache(): void {
    this.categoriesCache = null;
    this.cacheTimestamp = null;
  }

  private buildHierarchy(categories: unknown[]): CategoryHierarchy[] {
    const categoryMap = new Map<string, CategoryHierarchy>();
    const rootCategories: CategoryHierarchy[] = [];

    // First pass: create all category objects
    categories.forEach(cat => {
      const hierarchy = this.mapToHierarchy(cat);
      categoryMap.set((cat as any).id, hierarchy);
    });

    // Second pass: build parent-child relationships
    categories.forEach(cat => {
      const hierarchy = categoryMap.get((cat as any).id)!;

      if ((cat as any).parent_category_id) {
        const parent = categoryMap.get((cat as any).parent_category_id);
        if (parent) {
          if (!parent.children) parent.children = [];
          parent.children.push(hierarchy);
        }
      } else {
        rootCategories.push(hierarchy);
      }
    });

    return rootCategories;
  }

  private mapToHierarchy(data: unknown): CategoryHierarchy {
    return {
      id: (data as any).id,
      categoryKey: (data as any).category_key,
      name: (data as any).name,
      displayName: (data as any).display_name,
      description: (data as any).description,
      parentCategoryId: (data as any).parent_category_id,
      hierarchyLevel: (data as any).hierarchy_level,
      sortOrder: (data as any).sort_order,
      displayGroup: (data as any).display_group,
      isActive: (data as any).is_active,
      isPrimaryCategory: (data as any).is_primary_category,
      aiExtractionEnabled: (data as any).ai_extraction_enabled,
      aiConfidenceThreshold: (data as any).ai_confidence_threshold,
      processingPriority: (data as any).processing_priority,
      children: [],
    };
  }

  private findCategoryInHierarchy(categories: CategoryHierarchy[], categoryKey: string): CategoryHierarchy | null {
    for (const category of categories) {
      if (category.categoryKey === categoryKey) {
        return category;
      }
      if (category.children) {
        const found = this.findCategoryInHierarchy(category.children, categoryKey);
        if (found) return found;
      }
    }
    return null;
  }

  private formatCategoryName(categoryKey: string): string {
    return categoryKey.split('_').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1),
    ).join(' ');
  }

  private formatCategoryDisplayName(categoryKey: string): string {
    return this.formatCategoryName(categoryKey);
  }

  private determineCategoryGroup(categoryKey: string): string {
    const productKeywords = ['tile', 'decor', 'lighting', 'furniture', 'fixture'];
    const materialKeywords = ['wood', 'metal', 'ceramic', 'glass', 'plastic'];

    const key = categoryKey.toLowerCase();

    if (productKeywords.some(keyword => key.includes(keyword))) {
      return 'products';
    } else if (materialKeywords.some(keyword => key.includes(keyword))) {
      return 'core_materials';
    }

    return 'other';
  }

  private async updateDocumentCategories(documentId: string, categories: CategoryExtractionResult[]): Promise<void> {
    try {
      const categoryData = categories.map(cat => ({
        category_key: cat.categoryKey,
        confidence: cat.confidence,
        extracted_from: cat.extractedFrom,
        context: cat.context,
      }));

      await supabase
        .from('documents')
        .update({
          metadata: {
            extracted_categories: categoryData,
            last_category_update: new Date().toISOString(),
          },
        })
        .eq('id', documentId);
    } catch (error) {
      console.error('Failed to update document categories:', error);
    }
  }
}

// Export singleton instance
export const dynamicCategoryManagementService = DynamicCategoryManagementService.getInstance();

// Convenience functions
export async function getCategoriesHierarchy(): Promise<CategoryHierarchy[]> {
  return await dynamicCategoryManagementService.getCategoriesHierarchy();
}

export async function getProductCategories(): Promise<CategoryHierarchy[]> {
  return await dynamicCategoryManagementService.getProductCategories();
}

export async function getMaterialCategories(): Promise<CategoryHierarchy[]> {
  return await dynamicCategoryManagementService.getMaterialCategories();
}

export async function createCategory(request: CategoryCreationRequest): Promise<CategoryHierarchy | null> {
  return await dynamicCategoryManagementService.createCategory(request);
}

export async function autoUpdateCategoriesFromDocument(documentId: string, extractedData: any): Promise<void> {
  return await dynamicCategoryManagementService.autoUpdateCategoriesFromDocument(documentId, extractedData);
}
