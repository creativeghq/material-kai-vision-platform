/**
 * Dynamic Material Categories Service
 *
 * Global service for fetching material categories and properties from the database
 * Replaces all hardcoded MATERIAL_CATEGORIES constants
 */

export interface MaterialCategory {
  key: string;
  name: string;
  displayName: string;
  description?: string;
  hierarchyLevel: number;
  sortOrder: number;
  displayGroup?: string;
  isActive: boolean;
  isPrimaryCategory: boolean;
  aiExtractionEnabled: boolean;
  aiConfidenceThreshold: number;
  processingPriority: number;
  metaFields: string[];
}

export interface MaterialProperty {
  key: string;
  name: string;
  displayName: string;
  description?: string;
  dataType: string;
  validationRules?: unknown;
  defaultValue?: unknown;
  uiComponent?: string;
  uiProps?: unknown;
  displayOrder: number;
  isRequired: boolean;
  isSearchable: boolean;
  isFilterable: boolean;
  isAiExtractable: boolean;
}

export interface LegacyMaterialCategories {
  [key: string]: {
    name: string;
    metaFields: string[];
  };
}

export interface DynamicCategoriesResponse {
  success: boolean;
  data:
    | MaterialCategory[]
    | MaterialProperty[]
    | LegacyMaterialCategories
    | {
        categories: MaterialCategory[];
        properties: MaterialProperty[];
      };
  cached?: boolean;
  cacheAge?: number;
  error?: string;
}

class DynamicMaterialCategoriesService {
  private static instance: DynamicMaterialCategoriesService;
  private supabaseUrl: string;
  private supabaseKey: string;
  private baseUrl: string;

  // In-memory cache
  private categoriesCache: MaterialCategory[] | null = null;
  private propertiesCache: MaterialProperty[] | null = null;
  private legacyFormatCache: LegacyMaterialCategories | null = null;
  private cacheTimestamp: number | null = null;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  private constructor() {
    // Get environment variables
    this.supabaseUrl = process.env.SUPABASE_URL || '';
    this.supabaseKey = process.env.SUPABASE_ANON_KEY || '';
    this.baseUrl = `${this.supabaseUrl}/functions/v1/get-material-categories`;
  }

  public static getInstance(): DynamicMaterialCategoriesService {
    if (!DynamicMaterialCategoriesService.instance) {
      DynamicMaterialCategoriesService.instance =
        new DynamicMaterialCategoriesService();
    }
    return DynamicMaterialCategoriesService.instance;
  }

  private isCacheValid(): boolean {
    return (
      this.cacheTimestamp !== null &&
      Date.now() - this.cacheTimestamp < this.CACHE_DURATION
    );
  }

  private async makeRequest(
    endpoint: string = '',
  ): Promise<DynamicCategoriesResponse> {
    const url = endpoint ? `${this.baseUrl}/${endpoint}` : this.baseUrl;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.supabaseKey}`,
        apikey: this.supabaseKey,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Get all material categories with caching
   */
  public async getCategories(): Promise<MaterialCategory[]> {
    if (this.isCacheValid() && this.categoriesCache) {
      return this.categoriesCache;
    }

    try {
      const response = await this.makeRequest('categories');
      if (response.success && Array.isArray(response.data)) {
        this.categoriesCache = response.data as MaterialCategory[];
        this.cacheTimestamp = Date.now();
        return this.categoriesCache;
      } else {
        throw new Error(response.error || 'Invalid response format');
      }
    } catch (error) {
      console.error('Failed to fetch dynamic categories:', error);
      // Return empty array as fallback
      return [];
    }
  }

  /**
   * Get all material properties with caching
   */
  public async getProperties(): Promise<MaterialProperty[]> {
    if (this.isCacheValid() && this.propertiesCache) {
      return this.propertiesCache;
    }

    try {
      const response = await this.makeRequest('properties');
      if (response.success && Array.isArray(response.data)) {
        this.propertiesCache = response.data as MaterialProperty[];
        this.cacheTimestamp = Date.now();
        return this.propertiesCache;
      } else {
        throw new Error(response.error || 'Invalid response format');
      }
    } catch (error) {
      console.error('Failed to fetch dynamic properties:', error);
      // Return empty array as fallback
      return [];
    }
  }

  /**
   * Get categories in legacy MATERIAL_CATEGORIES format for backward compatibility
   */
  public async getLegacyFormat(): Promise<LegacyMaterialCategories> {
    if (this.isCacheValid() && this.legacyFormatCache) {
      return this.legacyFormatCache;
    }

    try {
      const response = await this.makeRequest('legacy-format');
      if (response.success && typeof response.data === 'object') {
        this.legacyFormatCache = response.data as LegacyMaterialCategories;
        this.cacheTimestamp = Date.now();
        return this.legacyFormatCache;
      } else {
        throw new Error(response.error || 'Invalid response format');
      }
    } catch (error) {
      console.error('Failed to fetch legacy format categories:', error);
      // Return empty object as fallback
      return {};
    }
  }

  /**
   * Get both categories and properties in one call
   */
  public async getCategoriesAndProperties(): Promise<{
    categories: MaterialCategory[];
    properties: MaterialProperty[];
  }> {
    if (this.isCacheValid() && this.categoriesCache && this.propertiesCache) {
      return {
        categories: this.categoriesCache,
        properties: this.propertiesCache,
      };
    }

    try {
      const response = await this.makeRequest();
      if (
        response.success &&
        typeof response.data === 'object' &&
        'categories' in response.data
      ) {
        const data = response.data as {
          categories: MaterialCategory[];
          properties: MaterialProperty[];
        };
        this.categoriesCache = data.categories;
        this.propertiesCache = data.properties;
        this.cacheTimestamp = Date.now();
        return data;
      } else {
        throw new Error(response.error || 'Invalid response format');
      }
    } catch (error) {
      console.error('Failed to fetch categories and properties:', error);
      // Return empty arrays as fallback
      return { categories: [], properties: [] };
    }
  }

  /**
   * Force refresh the cache
   */
  public async refreshCache(): Promise<boolean> {
    try {
      const response = await this.makeRequest('refresh');
      if (response.success) {
        // Clear local cache to force refetch
        this.categoriesCache = null;
        this.propertiesCache = null;
        this.legacyFormatCache = null;
        this.cacheTimestamp = null;
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to refresh cache:', error);
      return false;
    }
  }

  /**
   * Get category by key
   */
  public async getCategoryByKey(key: string): Promise<MaterialCategory | null> {
    const categories = await this.getCategories();
    return categories.find((cat) => cat.key === key) || null;
  }

  /**
   * Get property by key
   */
  public async getPropertyByKey(key: string): Promise<MaterialProperty | null> {
    const properties = await this.getProperties();
    return properties.find((prop) => prop.key === key) || null;
  }

  /**
   * Get extractable property keys
   */
  public async getExtractablePropertyKeys(): Promise<string[]> {
    const properties = await this.getProperties();
    return properties
      .filter((prop) => prop.isAiExtractable)
      .map((prop) => prop.key);
  }

  /**
   * Get categories by display group
   */
  public async getCategoriesByGroup(
    group: string,
  ): Promise<MaterialCategory[]> {
    const categories = await this.getCategories();
    return categories.filter((cat) => cat.displayGroup === group);
  }

  /**
   * Get primary categories only
   */
  public async getPrimaryCategories(): Promise<MaterialCategory[]> {
    const categories = await this.getCategories();
    return categories.filter((cat) => cat.isPrimaryCategory);
  }
}

// Export singleton instance
export const dynamicMaterialCategoriesService =
  DynamicMaterialCategoriesService.getInstance();

// Convenience functions for backward compatibility
export async function getMaterialCategories(): Promise<MaterialCategory[]> {
  return await dynamicMaterialCategoriesService.getCategories();
}

export async function getMaterialCategoriesLegacy(): Promise<LegacyMaterialCategories> {
  return await dynamicMaterialCategoriesService.getLegacyFormat();
}

export async function getMaterialProperties(): Promise<MaterialProperty[]> {
  return await dynamicMaterialCategoriesService.getProperties();
}

export async function refreshMaterialCategoriesCache(): Promise<boolean> {
  return await dynamicMaterialCategoriesService.refreshCache();
}
