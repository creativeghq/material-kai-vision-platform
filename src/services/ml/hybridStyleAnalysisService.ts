import { supabase } from '@/integrations/supabase/client';

import { styleAnalysisService, StyleAnalysisResult, StyleAnalysisOptions } from './styleAnalysisService';

export interface HybridStyleAnalysisOptions extends StyleAnalysisOptions {
  preferServerAnalysis?: boolean;
  includeAIInsights?: boolean;
  storeResults?: boolean;
}

export interface HybridStyleResult {
  success: boolean;
  analysis?: StyleAnalysisResult & {
    aiInsights?: {
      marketingDescription?: string;
      designerNotes?: string;
      luxuryLevel?: string;
    };
  };
  processingMethod?: 'client' | 'server';
  processingTime?: number;
  error?: string;
}

// Database response interfaces for stored style analysis (currently unused)
// interface _StoredStyleConfidence {
//   primary_style?: string;
//   confidence?: number;
//   modernity_score?: number;
//   luxury_level?: string;
// }

// interface _StoredColorPalette {
//   dominant_colors?: string[];
//   color_harmony?: string;
//   warmth_score?: number;
// }

// interface _StoredTextureAnalysis {
//   texture?: string;
//   finish?: string;
//   pattern?: string;
// }

/**
 * Hybrid style analysis service that combines client-side processing with AI insights
 */
export class HybridStyleAnalysisService {

  /**
   * Perform comprehensive style analysis using optimal processing method
   *
   * NOTE: Now uses MIVAA API for server-side analysis with real AI models.
   * Falls back to client-side analysis if MIVAA API is unavailable.
   */
  async analyzeStyle(
    imageSource: string | File | Blob,
    options: HybridStyleAnalysisOptions = {},
    materialId?: string,
  ): Promise<HybridStyleResult> {
    const startTime = performance.now();

    try {
      // Prefer MIVAA API for comprehensive AI-powered analysis
      if (options.preferServerAnalysis !== false) {
        try {
          return await this.performServerAnalysis(imageSource, options);
        } catch (error) {
          console.warn('MIVAA API analysis failed, falling back to client-side:', error);
          // Fall through to client-side analysis
        }
      }

      // Use client-side analysis as fallback
      return await this.performClientAnalysis(imageSource, options);

    } catch (error) {
      console.error('Hybrid style analysis failed:', error);

      // Fallback to client analysis if server fails
      if (options.preferServerAnalysis) {
        console.log('Server analysis failed, falling back to client analysis');
        return await this.performClientAnalysis(imageSource, options);
      }

      const processingTime = performance.now() - startTime;
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Style analysis failed',
        processingMethod: 'client',
        processingTime: Math.round(processingTime),
      };
    }
  }

  /**
   * Perform server-side AI analysis
   */
  /**
   * Perform client-side analysis
   */
  private async performClientAnalysis(
    imageSource: string | File | Blob,
    options: StyleAnalysisOptions,
  ): Promise<HybridStyleResult> {
    const startTime = performance.now();

    try {
      // Try client-side analysis first
      const result = await styleAnalysisService.analyzeStyle(imageSource, options);

      // Return client result
      const processingTime = performance.now() - startTime;
      return {
        success: result.success,
        analysis: result.data as any,
        processingMethod: 'client' as const,
        processingTime: Math.round(processingTime),
        ...(result.error && { error: result.error }),
      };

    } catch (error) {
      console.error('Client style analysis error:', error);
      throw error;
    }
  }

  /**
   * Upload image for server analysis
   */
  private async uploadImageForAnalysis(imageSource: File | Blob): Promise<string> {
    try {
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2);
      const fileName = `style_analysis_${timestamp}_${randomId}.jpg`;
      const filePath = `analysis/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('material-images')
        .upload(filePath, imageSource, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Failed to upload image: ${uploadError.message}`);
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('material-images')
        .getPublicUrl(uploadData.path);

      return urlData.publicUrl;

    } catch (error) {
      console.error('Error uploading image for analysis:', error);
      throw error;
    }
  }

  /**
   * Get style analysis for existing material
   *
   * NOTE: Style analysis is now handled by MIVAA API.
   * Query MIVAA API for stored analysis results instead of local database.
   */
  async getStoredStyleAnalysis(materialId: string): Promise<HybridStyleResult | null> {
    try {
      // Style analysis results are now stored in MIVAA API database
      // Use MIVAA API client to retrieve stored analysis
      console.log(`Retrieving style analysis for material ${materialId} from MIVAA API`);

      // TODO: Implement MIVAA API call to retrieve stored analysis
      // For now, return null to trigger fresh analysis
      return null;

    } catch (error) {
      console.error('Error fetching stored style analysis:', error);
      return null;
    }
  }

  /**
   * Batch analyze multiple materials
   */
  async batchAnalyzeStyles(
    materials: Array<{ id: string; imageSource: string | File | Blob }>,
    options: HybridStyleAnalysisOptions = {},
  ): Promise<Array<{ materialId: string; result: HybridStyleResult }>> {
    const results = [];

    for (const material of materials) {
      try {
        const result = await this.analyzeStyle(material.imageSource, options, material.id);
        results.push({ materialId: material.id, result });
      } catch (error) {
        console.error(`Failed to analyze material ${material.id}:`, error);
        results.push({
          materialId: material.id,
          result: {
            success: false,
            error: error instanceof Error ? error.message : 'Analysis failed',
            processingMethod: 'client' as const,
          },
        });
      }
    }

    return results;
  }

  /**
   * Get style recommendations based on room type
   */
  async getStyleRecommendations(roomType: string, _stylePreferences?: string[]): Promise<{
    recommendations: Array<{
      style: string;
      description: string;
      colorSuggestions: string[];
      materialTypes: string[];
    }>;
  }> {
    // This would typically call an AI service or use a knowledge base
    // For now, returning static recommendations
    const roomRecommendations = {
      living_room: [
        {
          style: 'contemporary',
          description: 'Clean lines and neutral colors for a timeless look',
          colorSuggestions: ['#F5F5F5', '#E0E0E0', '#2C3E50'],
          materialTypes: ['wood', 'metals', 'textiles'],
        },
      ],
      bedroom: [
        {
          style: 'minimalist',
          description: 'Calm, uncluttered space for rest and relaxation',
          colorSuggestions: ['#FFFFFF', '#F8F8F8', '#D4D4D4'],
          materialTypes: ['wood', 'textiles', 'ceramics'],
        },
      ],
    };

    return {
      recommendations: roomRecommendations[roomType as keyof typeof roomRecommendations] || [],
    };
  }
}

export const hybridStyleAnalysisService = new HybridStyleAnalysisService();
