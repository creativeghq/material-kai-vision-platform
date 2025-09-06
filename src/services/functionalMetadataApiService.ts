import { FunctionalMetadata } from '@/types/materials';
import { MivaaIntegrationService, type PdfExtractionRequest, type ExtractionResult } from './pdf/mivaaIntegrationService';

/**
 * Enhanced extraction request interface for functional metadata
 */
export interface FunctionalMetadataExtractionRequest {
  documentId: string;
  file: File | Buffer;
  options: {
    extractionType: 'images' | 'markdown' | 'tables' | 'all';
    pageRange?: {
      start?: number;
      end?: number;
    };
    outputFormat?: 'json' | 'zip';
    workspaceAware?: boolean;
    /** Include functional metadata extraction in the response */
    includeFunctionalMetadata?: boolean;
    /** Confidence threshold for functional property extraction (0-1) */
    confidenceThreshold?: number;
  };
  metadata?: Partial<import('./pdf/mivaaIntegrationService').DocumentMetadata>;
}

/**
 * API response structure for functional metadata extraction
 * Matches the enhanced MIVAA endpoint response format
 */
export interface FunctionalMetadataResponse {
  /** Standard image extraction data */
  images: Array<{
    page_number: number;
    image_data: string; // base64 encoded
    format: string;
    width: number;
    height: number;
    image_index: number;
  }>;
  /** Enhanced functional metadata extracted from document */
  functional_properties?: {
    slip_safety?: {
      display_name: string;
      highlights: string[];
      technical_details: string[];
      extraction_confidence: 'low' | 'medium' | 'high';
    };
    surface_gloss?: {
      display_name: string;
      highlights: string[];
      technical_details: string[];
      extraction_confidence: 'low' | 'medium' | 'high';
    };
    mechanical_properties?: {
      display_name: string;
      highlights: string[];
      technical_details: string[];
      extraction_confidence: 'low' | 'medium' | 'high';
    };
    thermal_properties?: {
      display_name: string;
      highlights: string[];
      technical_details: string[];
      extraction_confidence: 'low' | 'medium' | 'high';
    };
    water_moisture_resistance?: {
      display_name: string;
      highlights: string[];
      technical_details: string[];
      extraction_confidence: 'low' | 'medium' | 'high';
    };
    chemical_hygiene_resistance?: {
      display_name: string;
      highlights: string[];
      technical_details: string[];
      extraction_confidence: 'low' | 'medium' | 'high';
    };
    acoustic_electrical?: {
      display_name: string;
      highlights: string[];
      technical_details: string[];
      extraction_confidence: 'low' | 'medium' | 'high';
    };
    environmental_sustainability?: {
      display_name: string;
      highlights: string[];
      technical_details: string[];
      extraction_confidence: 'low' | 'medium' | 'high';
    };
    dimensional_aesthetic?: {
      display_name: string;
      highlights: string[];
      technical_details: string[];
      extraction_confidence: 'low' | 'medium' | 'high';
    };
  };
  /** Summary of extracted functional metadata */
  summary?: {
    categories_with_data: string[];
    key_properties_found: string[];
    suggested_applications: string[];
    overall_confidence: 'low' | 'medium' | 'high';
  };
  /** Processing metadata */
  metadata?: {
    total_images: number;
    processing_time: number;
    functional_extraction_time?: number;
  };
}

/**
 * Processing result combining images and functional metadata
 */
export interface FunctionalMetadataExtractionResult extends ExtractionResult {
  data: ExtractionResult['data'] & {
    /** Enhanced functional metadata */
    functionalMetadata?: FunctionalMetadata;
    /** Raw functional metadata response from MIVAA */
    rawFunctionalData?: FunctionalMetadataResponse['functional_properties'];
    /** Extraction summary */
    extractionSummary?: FunctionalMetadataResponse['summary'];
  };
}

/**
 * Functional Metadata API Service
 * 
 * Enhanced service that extends MivaaIntegrationService to support
 * functional metadata extraction with proper state management and error handling.
 */
export class FunctionalMetadataApiService {
  private mivaaService: MivaaIntegrationService;

  constructor(mivaaService: MivaaIntegrationService) {
    this.mivaaService = mivaaService;
  }

  /**
   * Extract images with functional metadata from PDF document
   */
  async extractWithFunctionalMetadata(
    request: FunctionalMetadataExtractionRequest
  ): Promise<FunctionalMetadataExtractionResult> {
    try {
      // Prepare the enhanced request with functional metadata parameter
      const enhancedRequest: PdfExtractionRequest = {
        documentId: request.documentId,
        file: request.file,
        options: {
          extractionType: 'images' as const,
        },
      };

      // Add optional fields only if they exist
      if (request.options.pageRange) {
        enhancedRequest.options.pageRange = request.options.pageRange;
      }
      if (request.options.outputFormat) {
        enhancedRequest.options.outputFormat = request.options.outputFormat;
      }
      if (request.options.workspaceAware !== undefined) {
        enhancedRequest.options.workspaceAware = request.options.workspaceAware;
      }
      if (request.metadata) {
        enhancedRequest.metadata = request.metadata;
      }

      // Call enhanced images endpoint with functional metadata
      const response = await this.callEnhancedImagesEndpoint(enhancedRequest, {
        includeFunctionalMetadata: request.options.includeFunctionalMetadata ?? true,
        confidenceThreshold: request.options.confidenceThreshold ?? 0.5,
      });

      // Transform response to standard format
      const transformedFunctionalMetadata = response.functional_properties
        ? this.transformFunctionalMetadata(response.functional_properties)
        : undefined;

      const result: FunctionalMetadataExtractionResult = {
        documentId: request.documentId,
        status: 'success',
        extractionType: 'images_with_functional_metadata',
        data: {
          images: this.transformImageData(response.images),
          ...(transformedFunctionalMetadata && { functionalMetadata: transformedFunctionalMetadata }),
          ...(response.functional_properties && { rawFunctionalData: response.functional_properties }),
          ...(response.summary && { extractionSummary: response.summary }),
        },
        processingTime: response.metadata?.processing_time || 0,
      };

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during functional metadata extraction';
      
      return {
        documentId: request.documentId,
        status: 'failed',
        extractionType: 'images_with_functional_metadata',
        data: {},
        processingTime: 0,
        errors: [errorMessage],
      };
    }
  }

  /**
   * Call the enhanced MIVAA images endpoint with functional metadata support
   */
  private async callEnhancedImagesEndpoint(
    request: PdfExtractionRequest,
    functionalOptions: {
      includeFunctionalMetadata: boolean;
      confidenceThreshold: number;
    }
  ): Promise<FunctionalMetadataResponse> {
    // Build query parameters
    const queryParams = new URLSearchParams();
    if (functionalOptions.includeFunctionalMetadata) {
      queryParams.set('include_functional_metadata', 'true');
    }
    if (functionalOptions.confidenceThreshold !== 0.5) {
      queryParams.set('confidence_threshold', functionalOptions.confidenceThreshold.toString());
    }

    const endpoint = `/extract/images${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

    // Use the existing makeRequest method through reflection/composition
    // Note: This requires accessing the private makeRequest method
    const response = await (this.mivaaService as any).makeRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify({
        file_path: request.documentId,
        options: request.options,
      }),
    });

    if (!response.ok) {
      throw new Error(`Enhanced images extraction failed: ${response.status} ${response.statusText}`);
    }

    return await response.json() as FunctionalMetadataResponse;
  }

  /**
   * Transform raw image data to standard format
   */
  private transformImageData(images: FunctionalMetadataResponse['images']) {
    return images.map(img => ({
      id: `img-${img.page_number}-${img.image_index}`,
      pageNumber: img.page_number,
      imageBuffer: Buffer.from(img.image_data, 'base64'),
      format: img.format,
      width: img.width,
      height: img.height,
      metadata: {
        imageIndex: img.image_index,
      },
    }));
  }

  /**
   * Transform raw functional metadata to typed FunctionalMetadata interface
   */
  private transformFunctionalMetadata(
    rawData?: FunctionalMetadataResponse['functional_properties']
  ): FunctionalMetadata | undefined {
    if (!rawData) return undefined;

    const functionalMetadata: FunctionalMetadata = {
      functionalMetadataSource: 'pdf_extraction',
      functionalMetadataUpdatedAt: new Date().toISOString(),
    };

    // Transform slip safety ratings
    if (rawData.slip_safety) {
      functionalMetadata.slipSafetyRatings = {
        // Parse technical details for structured data
        safetyCertifications: rawData.slip_safety.highlights || [],
      };
    }

    // Transform surface gloss
    if (rawData.surface_gloss) {
      const surfaceFinish = rawData.surface_gloss.highlights?.[0];
      if (surfaceFinish) {
        functionalMetadata.surfaceGlossReflectivity = {
          surfaceFinish,
        };
      }
    }

    // Transform mechanical properties
    if (rawData.mechanical_properties) {
      functionalMetadata.mechanicalPropertiesExtended = {
        mechanicalCertifications: rawData.mechanical_properties.highlights || [],
      };
    }

    // Transform thermal properties
    if (rawData.thermal_properties) {
      functionalMetadata.thermalProperties = {
        radiantHeatingCompatible: rawData.thermal_properties.highlights?.some(h => 
          h.toLowerCase().includes('radiant') || h.toLowerCase().includes('heating')
        ),
      };
    }

    // Transform water resistance
    if (rawData.water_moisture_resistance) {
      functionalMetadata.waterMoistureResistance = {
        moistureCertifications: rawData.water_moisture_resistance.highlights || [],
      };
    }

    // Transform chemical resistance
    if (rawData.chemical_hygiene_resistance) {
      functionalMetadata.chemicalHygieneResistance = {
        chemicalCertifications: rawData.chemical_hygiene_resistance.highlights || [],
        foodSafeCertified: rawData.chemical_hygiene_resistance.highlights?.some(h =>
          h.toLowerCase().includes('food') || h.toLowerCase().includes('safe')
        ),
      };
    }

    // Transform acoustic/electrical
    if (rawData.acoustic_electrical) {
      functionalMetadata.acousticElectricalProperties = {
        acousticCertifications: rawData.acoustic_electrical.highlights || [],
      };
    }

    // Transform environmental sustainability
    if (rawData.environmental_sustainability) {
      functionalMetadata.environmentalSustainability = {
        ecoLabels: {
          otherCertifications: rawData.environmental_sustainability.highlights || [],
        },
      };
    }

    // Transform dimensional aesthetic
    if (rawData.dimensional_aesthetic) {
      const textureType = rawData.dimensional_aesthetic.highlights?.[0];
      if (textureType) {
        functionalMetadata.dimensionalAesthetic = {
          textureProperties: {
            textureType,
          },
        };
      }
    }

    return functionalMetadata;
  }

  /**
   * Extract only functional metadata without images (lightweight operation)
   */
  async extractFunctionalMetadataOnly(
    request: FunctionalMetadataExtractionRequest
  ): Promise<{
    functionalMetadata?: FunctionalMetadata;
    extractionSummary?: FunctionalMetadataResponse['summary'];
    processingTime: number;
    errors?: string[];
  }> {
    try {
      const startTime = Date.now();
      
      // Use the full extraction but focus on metadata
      const result = await this.extractWithFunctionalMetadata(request);
      
      return {
        ...(result.data.functionalMetadata && { functionalMetadata: result.data.functionalMetadata }),
        ...(result.data.extractionSummary && { extractionSummary: result.data.extractionSummary }),
        processingTime: Date.now() - startTime,
        ...(result.errors && { errors: result.errors }),
      };
    } catch (error) {
      return {
        processingTime: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  /**
   * Check if functional metadata extraction is available for a document
   */
  async checkFunctionalMetadataAvailability(documentId: string): Promise<{
    available: boolean;
    reason?: string;
  }> {
    try {
      // Check if MIVAA service is healthy
      const healthCheck = await this.mivaaService.healthCheck();
      if (!healthCheck.isHealthy) {
        return {
          available: false,
          reason: `MIVAA service unavailable: ${healthCheck.error}`,
        };
      }

      // Additional checks could be added here (file format, size, etc.)
      return { available: true };
    } catch (error) {
      return {
        available: false,
        reason: error instanceof Error ? error.message : 'Unknown availability check error',
      };
    }
  }
}

/**
 * Factory function to create FunctionalMetadataApiService instance
 */
export function createFunctionalMetadataApiService(
  mivaaService: MivaaIntegrationService
): FunctionalMetadataApiService {
  return new FunctionalMetadataApiService(mivaaService);
}

// Export types for external usage - avoiding conflicts with interface declarations above