/**
 * Canonical Metadata Schema Service
 * 
 * Implements comprehensive metadata extraction for products including:
 * - Core Identity (name, collection, designer, brand)
 * - Physical Properties (dimensions, material, weight)
 * - Visual Properties (colors, finishes, patterns, textures)
 * - Technical Specifications (performance, ratings, certifications)
 * - Commercial Information (pricing, availability, warranty)
 * - Sustainability & Compliance (certifications, environmental impact)
 * 
 * Organizes existing 120+ metafields into logical categories for intelligent extraction.
 */

import { supabase } from '@/lib/supabase';
import { MetafieldService } from './metafieldService';

export interface CanonicalMetadataSchema {
  coreIdentity: CoreIdentityMetadata;
  physicalProperties: PhysicalPropertiesMetadata;
  visualProperties: VisualPropertiesMetadata;
  technicalSpecifications: TechnicalSpecificationsMetadata;
  commercialInformation: CommercialInformationMetadata;
  sustainabilityCompliance: SustainabilityComplianceMetadata;
  installationMaintenance: InstallationMaintenanceMetadata;
}

export interface CoreIdentityMetadata {
  // Primary identification
  name: string;
  productCode?: string;
  sku?: string;
  model?: string;
  
  // Brand & manufacturer
  manufacturer?: string;
  brand?: string;
  factory?: string;
  groupOfCompanies?: string;
  
  // Collection & design
  collection?: string;
  designer?: string;
  year?: number;
  
  // Origin
  countryOfOrigin?: string;
  quarryName?: string; // For stone products
}

export interface PhysicalPropertiesMetadata {
  // Dimensions
  length?: number;
  width?: number;
  thickness?: number;
  dimensionUnit?: 'mm' | 'cm' | 'm' | 'in' | 'ft';
  
  // Weight
  weightValue?: number;
  weightUnit?: 'g' | 'kg' | 'lb' | 'oz';
  
  // Shape & form
  shape?: 'rectangular' | 'square' | 'hexagonal' | 'round' | 'irregular' | 'custom';
  edgeType?: 'straight' | 'beveled' | 'rounded' | 'chamfered';
  rectified?: boolean;
  
  // Material composition
  materialCategory?: 'ceramic' | 'stone' | 'wood' | 'metal' | 'composite' | 'glass' | 'fabric';
  materialType?: string;
  woodSpecies?: string; // For wood products
  stoneType?: 'marble' | 'granite' | 'limestone' | 'travertine' | 'slate' | 'quartzite';
  
  // Physical characteristics
  density?: number;
  porosity?: number;
  moistureContent?: number;
}

export interface VisualPropertiesMetadata {
  // Colors
  primaryColor?: string;
  secondaryColor?: string;
  colorFamily?: 'neutral' | 'warm' | 'cool' | 'earth' | 'bold' | 'pastel';
  colorVariation?: 'none' | 'low' | 'medium' | 'high' | 'dramatic';
  
  // Surface characteristics
  surfaceFinish?: 'matte' | 'satin' | 'gloss' | 'high-gloss' | 'textured' | 'natural';
  surfacePattern?: string;
  surfaceTexture?: string;
  surfaceTreatment?: 'polished' | 'honed' | 'brushed' | 'sandblasted' | 'flamed' | 'tumbled';
  
  // Visual patterns
  grainPattern?: string; // For wood
  veiningPattern?: 'none' | 'light' | 'medium' | 'heavy' | 'dramatic'; // For stone
  movementPattern?: 'linear' | 'circular' | 'random' | 'bookmatched';
  
  // Shade variation
  vRating?: 'V1' | 'V2' | 'V3' | 'V4'; // Shade variation rating
}

export interface TechnicalSpecificationsMetadata {
  // Strength & durability
  breakingStrength?: number;
  modulusOfRupture?: number;
  compressiveStrength?: number;
  flexuralStrength?: number;
  
  // Hardness
  mohsHardness?: '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10';
  jankaHardness?: number; // For wood
  stoneHardness?: number;
  
  // Resistance properties
  waterAbsorption?: 'very-low' | 'low' | 'medium' | 'high';
  slipResistance?: 'R9' | 'R10' | 'R11' | 'R12' | 'R13';
  frostResistance?: boolean;
  heatResistance?: boolean;
  chemicalResistance?: 'excellent' | 'good' | 'fair' | 'poor';
  stainResistance?: 'excellent' | 'good' | 'fair' | 'poor';
  fadeResistance?: 'excellent' | 'good' | 'fair' | 'poor';
  abrasionResistance?: number;
  wearResistance?: 'excellent' | 'good' | 'fair' | 'poor';
  
  // Performance ratings
  peiRating?: 'PEI-0' | 'PEI-1' | 'PEI-2' | 'PEI-3' | 'PEI-4' | 'PEI-5';
  trafficRating?: 'light' | 'moderate' | 'heavy' | 'commercial';
  fireRating?: 'A1' | 'A2' | 'B' | 'C' | 'D' | 'E' | 'F';
  
  // Thermal properties
  thermalExpansion?: number;
  thermalConductivity?: number;
  thermalShock?: boolean;
  
  // Other properties
  antimicrobial?: boolean;
  soundInsulation?: string;
  dimensionalStability?: number;
}

export interface CommercialInformationMetadata {
  // Pricing
  priceRange?: 'budget' | 'mid-range' | 'premium' | 'luxury';
  priceCurrency?: 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD';
  priceUnit?: 'per-sqft' | 'per-sqm' | 'per-piece' | 'per-box' | 'per-linear-ft';
  
  // Availability
  stockStatus?: 'in-stock' | 'limited' | 'out-of-stock' | 'discontinued' | 'special-order';
  leadTimeDays?: number;
  minimumOrder?: number;
  
  // Warranty & support
  warranty?: string;
  certifications?: string[];
  
  // Application areas
  applicationArea?: ('indoor' | 'outdoor' | 'bathroom' | 'kitchen' | 'commercial' | 'residential' | 'industrial')[];
  usageType?: string[];
  environments?: string[];
}

export interface SustainabilityComplianceMetadata {
  // Environmental impact
  sustainability?: 'low' | 'medium' | 'high' | 'excellent';
  recycledContentPercent?: number;
  recyclable?: boolean;
  vocLevel?: 'zero' | 'low' | 'medium' | 'high';
  energyEfficiency?: string;
  carbonFootprint?: string;
  
  // Certifications
  certifications?: string[];
  
  // Health & safety
  antimicrobial?: boolean;
}

export interface InstallationMaintenanceMetadata {
  // Installation
  installationMethod?: 'adhesive' | 'mechanical' | 'floating' | 'nail-down' | 'glue-down';
  installationFormat?: 'straight' | 'diagonal' | 'herringbone' | 'chevron' | 'random';
  installationPattern?: string;
  difficultyLevel?: 'easy' | 'moderate' | 'difficult' | 'professional';
  toolsRequired?: string[];
  preparationNeeded?: string;
  installationTime?: string;
  
  // Subfloor & underlayment
  subfloorRequirements?: string;
  underlaymentRequired?: boolean;
  jointWidth?: number;
  
  // Maintenance
  cleaningMethod?: string[];
  sealingRequired?: boolean;
  maintenanceFrequency?: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'as-needed';
  repairability?: 'easy' | 'moderate' | 'difficult' | 'replacement-only';
}

export interface MetadataExtractionOptions {
  includeCategories?: (keyof CanonicalMetadataSchema)[];
  confidenceThreshold?: number;
  extractionMethod?: 'ai_extraction' | 'pattern_matching' | 'hybrid';
  validateRequired?: boolean;
}

export interface MetadataExtractionResult {
  metadata: Partial<CanonicalMetadataSchema>;
  confidence: number;
  extractedFields: number;
  totalFields: number;
  extractionMethod: string;
  processingTime: number;
  issues?: Array<{
    field: string;
    issue: string;
    severity: 'low' | 'medium' | 'high';
  }>;
}

export class CanonicalMetadataSchemaService {
  private static readonly FIELD_MAPPINGS = new Map<string, keyof CanonicalMetadataSchema>([
    // Core Identity mappings
    ['manufacturer', 'coreIdentity'],
    ['brand', 'coreIdentity'],
    ['collection', 'coreIdentity'],
    ['productCode', 'coreIdentity'],
    ['sku', 'coreIdentity'],
    ['model', 'coreIdentity'],
    ['year', 'coreIdentity'],
    ['countryOfOrigin', 'coreIdentity'],
    ['factory', 'coreIdentity'],
    ['groupOfCompanies', 'coreIdentity'],
    ['quarryName', 'coreIdentity'],
    
    // Physical Properties mappings
    ['length', 'physicalProperties'],
    ['width', 'physicalProperties'],
    ['thickness', 'physicalProperties'],
    ['dimensionUnit', 'physicalProperties'],
    ['weightValue', 'physicalProperties'],
    ['weightUnit', 'physicalProperties'],
    ['tileShape', 'physicalProperties'],
    ['edgeType', 'physicalProperties'],
    ['rectified', 'physicalProperties'],
    ['materialCategory', 'physicalProperties'],
    ['tileType', 'physicalProperties'],
    ['woodSpecies', 'physicalProperties'],
    ['stoneType', 'physicalProperties'],
    ['stoneDensity', 'physicalProperties'],
    ['porosity', 'physicalProperties'],
    ['moistureContent', 'physicalProperties'],
    
    // Visual Properties mappings
    ['primaryColor', 'visualProperties'],
    ['secondaryColor', 'visualProperties'],
    ['colorFamily', 'visualProperties'],
    ['colorVariation', 'visualProperties'],
    ['surfaceFinish', 'visualProperties'],
    ['surfacePattern', 'visualProperties'],
    ['surfaceTexture', 'visualProperties'],
    ['surfaceTreatment', 'visualProperties'],
    ['grainPattern', 'visualProperties'],
    ['veiningPattern', 'visualProperties'],
    ['movementPattern', 'visualProperties'],
    ['vRating', 'visualProperties'],
    
    // Technical Specifications mappings
    ['breakingStrength', 'technicalSpecifications'],
    ['modulusOfRupture', 'technicalSpecifications'],
    ['compressiveStrength', 'technicalSpecifications'],
    ['flexuralStrength', 'technicalSpecifications'],
    ['mohsHardness', 'technicalSpecifications'],
    ['jankaHardness', 'technicalSpecifications'],
    ['stoneHardness', 'technicalSpecifications'],
    ['waterAbsorption', 'technicalSpecifications'],
    ['slipResistance', 'technicalSpecifications'],
    ['frostResistance', 'technicalSpecifications'],
    ['heatResistance', 'technicalSpecifications'],
    ['chemicalResistance', 'technicalSpecifications'],
    ['stainResistance', 'technicalSpecifications'],
    ['fadeResistance', 'technicalSpecifications'],
    ['abrasionResistance', 'technicalSpecifications'],
    ['wearResistance', 'technicalSpecifications'],
    ['peiRating', 'technicalSpecifications'],
    ['trafficRating', 'technicalSpecifications'],
    ['fireRating', 'technicalSpecifications'],
    ['thermalExpansion', 'technicalSpecifications'],
    ['thermalConductivity', 'technicalSpecifications'],
    ['thermalShock', 'technicalSpecifications'],
    ['antimicrobial', 'technicalSpecifications'],
    ['soundInsulation', 'technicalSpecifications'],
    ['dimensionalStability', 'technicalSpecifications'],
    
    // Commercial Information mappings
    ['priceRange', 'commercialInformation'],
    ['priceCurrency', 'commercialInformation'],
    ['priceUnit', 'commercialInformation'],
    ['stockStatus', 'commercialInformation'],
    ['leadTimeDays', 'commercialInformation'],
    ['minimumOrder', 'commercialInformation'],
    ['warranty', 'commercialInformation'],
    ['certifications', 'commercialInformation'],
    ['applicationArea', 'commercialInformation'],
    ['usageType', 'commercialInformation'],
    ['environments', 'commercialInformation'],
    
    // Sustainability & Compliance mappings
    ['sustainability', 'sustainabilityCompliance'],
    ['recycledContentPercent', 'sustainabilityCompliance'],
    ['recyclable', 'sustainabilityCompliance'],
    ['vocLevel', 'sustainabilityCompliance'],
    ['energyEfficiency', 'sustainabilityCompliance'],
    ['carbonFootprint', 'sustainabilityCompliance'],
    
    // Installation & Maintenance mappings
    ['installationMethod', 'installationMaintenance'],
    ['installationFormat', 'installationMaintenance'],
    ['installationPattern', 'installationMaintenance'],
    ['difficultyLevel', 'installationMaintenance'],
    ['toolsRequired', 'installationMaintenance'],
    ['preparationNeeded', 'installationMaintenance'],
    ['installationTime', 'installationMaintenance'],
    ['subfloorRequirements', 'installationMaintenance'],
    ['underlaymentRequired', 'installationMaintenance'],
    ['jointWidth', 'installationMaintenance'],
    ['cleaningMethod', 'installationMaintenance'],
    ['sealingRequired', 'installationMaintenance'],
    ['maintenanceFrequency', 'installationMaintenance'],
    ['repairability', 'installationMaintenance'],
  ]);

  /**
   * Extract comprehensive metadata from product content using canonical schema
   */
  static async extractCanonicalMetadata(
    content: string,
    productId?: string,
    options: MetadataExtractionOptions = {},
  ): Promise<MetadataExtractionResult> {
    const startTime = Date.now();
    
    console.log('🔍 Extracting canonical metadata using comprehensive schema...');
    
    try {
      // Get all metafield definitions
      const { data: metafieldDefs, error } = await supabase
        .from('material_metadata_fields')
        .select('*')
        .eq('is_global', true);

      if (error) throw error;

      // Extract metadata using AI
      const extractedMetadata = await MetafieldService.extractMetafieldsFromText(
        content,
        metafieldDefs || []
      );

      // Organize into canonical schema
      const canonicalMetadata = this.organizeIntoCanonicalSchema(
        extractedMetadata,
        options.includeCategories
      );

      // Calculate metrics
      const extractedFields = Object.keys(extractedMetadata).length;
      const totalFields = metafieldDefs?.length || 0;
      const confidence = this.calculateOverallConfidence(extractedMetadata, extractedFields, totalFields);
      const processingTime = Date.now() - startTime;

      // Save to database if productId provided
      if (productId) {
        await this.saveCanonicalMetadata(productId, canonicalMetadata, extractedMetadata);
      }

      console.log(`✅ Extracted ${extractedFields}/${totalFields} metadata fields`);
      console.log(`📊 Overall confidence: ${(confidence * 100).toFixed(1)}%`);

      return {
        metadata: canonicalMetadata,
        confidence,
        extractedFields,
        totalFields,
        extractionMethod: options.extractionMethod || 'ai_extraction',
        processingTime,
      };

    } catch (error) {
      console.error('❌ Error extracting canonical metadata:', error);
      throw new Error(`Failed to extract metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Organize extracted metadata into canonical schema categories
   */
  private static organizeIntoCanonicalSchema(
    extractedMetadata: Record<string, unknown>,
    includeCategories?: (keyof CanonicalMetadataSchema)[]
  ): Partial<CanonicalMetadataSchema> {
    const canonicalMetadata: Partial<CanonicalMetadataSchema> = {
      coreIdentity: {},
      physicalProperties: {},
      visualProperties: {},
      technicalSpecifications: {},
      commercialInformation: {},
      sustainabilityCompliance: {},
      installationMaintenance: {},
    };

    // Organize fields by category
    for (const [fieldName, value] of Object.entries(extractedMetadata)) {
      const category = this.FIELD_MAPPINGS.get(fieldName);

      if (category && (!includeCategories || includeCategories.includes(category))) {
        if (!canonicalMetadata[category]) {
          canonicalMetadata[category] = {};
        }
        (canonicalMetadata[category] as any)[fieldName] = value;
      }
    }

    // Remove empty categories
    Object.keys(canonicalMetadata).forEach(key => {
      const categoryKey = key as keyof CanonicalMetadataSchema;
      if (Object.keys(canonicalMetadata[categoryKey] || {}).length === 0) {
        delete canonicalMetadata[categoryKey];
      }
    });

    return canonicalMetadata;
  }

  /**
   * Calculate overall confidence score based on extraction results
   */
  private static calculateOverallConfidence(
    extractedMetadata: Record<string, unknown>,
    extractedFields: number,
    totalFields: number
  ): number {
    // Base confidence from extraction coverage
    const coverageScore = totalFields > 0 ? extractedFields / totalFields : 0;

    // Bonus for critical fields
    const criticalFields = ['manufacturer', 'brand', 'collection', 'materialCategory', 'primaryColor'];
    const criticalFieldsFound = criticalFields.filter(field => extractedMetadata[field]).length;
    const criticalBonus = criticalFieldsFound / criticalFields.length * 0.2;

    // Quality bonus for non-empty values
    const nonEmptyValues = Object.values(extractedMetadata).filter(value =>
      value !== null && value !== undefined && value !== ''
    ).length;
    const qualityBonus = extractedFields > 0 ? (nonEmptyValues / extractedFields) * 0.1 : 0;

    return Math.min(1.0, coverageScore + criticalBonus + qualityBonus);
  }

  /**
   * Save canonical metadata to database
   */
  private static async saveCanonicalMetadata(
    productId: string,
    canonicalMetadata: Partial<CanonicalMetadataSchema>,
    rawMetadata: Record<string, unknown>
  ): Promise<void> {
    try {
      // Update product with canonical metadata in properties field
      const { error: updateError } = await supabase
        .from('products')
        .update({
          properties: {
            ...canonicalMetadata,
            extractionTimestamp: new Date().toISOString(),
            extractionMethod: 'canonical_schema',
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', productId);

      if (updateError) throw updateError;

      // Save individual metafield values
      const { data: metafieldDefs } = await supabase
        .from('material_metadata_fields')
        .select('*')
        .eq('is_global', true);

      if (metafieldDefs) {
        const fieldDefinitions = new Map(
          metafieldDefs.map(def => [def.field_name, def])
        );

        await MetafieldService.saveProductMetafields(
          productId,
          rawMetadata,
          fieldDefinitions,
          'canonical_schema_extraction'
        );
      }

      console.log(`✅ Saved canonical metadata for product ${productId}`);

    } catch (error) {
      console.error('❌ Error saving canonical metadata:', error);
      throw error;
    }
  }

  /**
   * Get canonical metadata for a product
   */
  static async getProductCanonicalMetadata(productId: string): Promise<Partial<CanonicalMetadataSchema> | null> {
    try {
      const { data: product, error } = await supabase
        .from('products')
        .select('properties, metadata')
        .eq('id', productId)
        .single();

      if (error) throw error;
      if (!product) return null;

      // Return canonical metadata from properties field
      const { extractionTimestamp, extractionMethod, ...canonicalMetadata } = product.properties || {};

      return canonicalMetadata as Partial<CanonicalMetadataSchema>;

    } catch (error) {
      console.error('❌ Error getting canonical metadata:', error);
      return null;
    }
  }

  /**
   * Search products by canonical metadata criteria
   */
  static async searchProductsByCanonicalMetadata(
    criteria: Partial<CanonicalMetadataSchema>,
    limit: number = 50
  ): Promise<Array<{ id: string; name: string; metadata: Partial<CanonicalMetadataSchema> }>> {
    try {
      // Build search conditions for each category
      const searchConditions: string[] = [];

      Object.entries(criteria).forEach(([category, categoryData]) => {
        if (categoryData && typeof categoryData === 'object') {
          Object.entries(categoryData).forEach(([field, value]) => {
            if (value !== undefined && value !== null) {
              searchConditions.push(`properties->'${category}'->'${field}' = '"${value}"'`);
            }
          });
        }
      });

      if (searchConditions.length === 0) {
        return [];
      }

      const whereClause = searchConditions.join(' AND ');

      const { data: products, error } = await supabase
        .from('products')
        .select('id, name, properties')
        .limit(limit);

      if (error) throw error;

      // Filter products that match criteria (simplified for now)
      const matchingProducts = (products || [])
        .filter(product => product.properties && typeof product.properties === 'object')
        .map(product => ({
          id: product.id,
          name: product.name,
          metadata: product.properties as Partial<CanonicalMetadataSchema>,
        }));

      return matchingProducts;

    } catch (error) {
      console.error('❌ Error searching by canonical metadata:', error);
      return [];
    }
  }

  /**
   * Validate canonical metadata completeness
   */
  static validateMetadataCompleteness(metadata: Partial<CanonicalMetadataSchema>): {
    isComplete: boolean;
    completionScore: number;
    missingCriticalFields: string[];
    recommendations: string[];
  } {
    const criticalFields = {
      coreIdentity: ['name', 'manufacturer', 'brand'],
      physicalProperties: ['materialCategory', 'length', 'width'],
      visualProperties: ['primaryColor', 'surfaceFinish'],
      technicalSpecifications: ['waterAbsorption', 'slipResistance'],
      commercialInformation: ['applicationArea', 'priceRange'],
    };

    const missingCriticalFields: string[] = [];
    const recommendations: string[] = [];
    let totalCriticalFields = 0;
    let foundCriticalFields = 0;

    Object.entries(criticalFields).forEach(([category, fields]) => {
      const categoryData = metadata[category as keyof CanonicalMetadataSchema] as any;

      fields.forEach(field => {
        totalCriticalFields++;
        if (categoryData && categoryData[field]) {
          foundCriticalFields++;
        } else {
          missingCriticalFields.push(`${category}.${field}`);
        }
      });
    });

    const completionScore = totalCriticalFields > 0 ? foundCriticalFields / totalCriticalFields : 0;
    const isComplete = completionScore >= 0.8; // 80% threshold

    // Generate recommendations
    if (missingCriticalFields.includes('coreIdentity.manufacturer')) {
      recommendations.push('Add manufacturer information for better product identification');
    }
    if (missingCriticalFields.includes('physicalProperties.materialCategory')) {
      recommendations.push('Specify material category for proper classification');
    }
    if (missingCriticalFields.includes('visualProperties.primaryColor')) {
      recommendations.push('Include primary color for visual search capabilities');
    }
    if (missingCriticalFields.includes('commercialInformation.applicationArea')) {
      recommendations.push('Define application areas for better product matching');
    }

    return {
      isComplete,
      completionScore,
      missingCriticalFields,
      recommendations,
    };
  }

  /**
   * Get metadata schema statistics
   */
  static getSchemaStatistics(): {
    totalCategories: number;
    totalFields: number;
    fieldsByCategory: Record<string, number>;
    criticalFields: string[];
  } {
    const fieldsByCategory: Record<string, number> = {};

    // Count fields by category
    this.FIELD_MAPPINGS.forEach((category) => {
      fieldsByCategory[category] = (fieldsByCategory[category] || 0) + 1;
    });

    return {
      totalCategories: Object.keys(fieldsByCategory).length,
      totalFields: this.FIELD_MAPPINGS.size,
      fieldsByCategory,
      criticalFields: ['manufacturer', 'brand', 'collection', 'materialCategory', 'primaryColor', 'applicationArea'],
    };
  }
}
