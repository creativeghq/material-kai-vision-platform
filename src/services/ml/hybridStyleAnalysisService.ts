import { supabase } from '@/integrations/supabase/client';
import { styleAnalysisService, StyleAnalysisResult, StyleAnalysisOptions } from './styleAnalysisService';
import { huggingFaceService } from './huggingFaceService';

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

/**
 * Hybrid style analysis service that combines client-side processing with AI insights
 */
export class HybridStyleAnalysisService {
  
  /**
   * Perform comprehensive style analysis using optimal processing method
   */
  async analyzeStyle(
    imageSource: string | File | Blob,
    options: HybridStyleAnalysisOptions = {},
    materialId?: string
  ): Promise<HybridStyleResult> {
    const startTime = performance.now();

    try {
      const useServerAnalysis = options.preferServerAnalysis || options.includeAIInsights;

      if (useServerAnalysis) {
        return await this.performServerAnalysis(imageSource, options, materialId);
      } else {
        return await this.performClientAnalysis(imageSource, options);
      }

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
        processingTime: Math.round(processingTime)
      };
    }
  }

  /**
   * Perform server-side AI analysis
   */
  private async performServerAnalysis(
    imageSource: string | File | Blob,
    options: HybridStyleAnalysisOptions,
    materialId?: string
  ): Promise<HybridStyleResult> {
    const startTime = performance.now();

    try {
      // Upload image if it's a file/blob
      let imageUrl: string;
      
      if (typeof imageSource === 'string') {
        imageUrl = imageSource;
      } else {
        imageUrl = await this.uploadImageForAnalysis(imageSource);
      }

      // Call style analysis edge function
      const { data, error } = await supabase.functions.invoke('style-analysis', {
        body: {
          material_id: materialId,
          image_url: imageUrl,
          analysis_type: 'full',
          target_rooms: options.targetRooms,
          style_preferences: []
        }
      });

      if (error) {
        throw new Error(`Server analysis failed: ${error.message}`);
      }

      const processingTime = performance.now() - startTime;

      // Transform server response to match client format
      const serverAnalysis = data.analysis;
      const clientFormatAnalysis: StyleAnalysisResult = {
        primaryStyle: serverAnalysis.primaryStyle,
        styleConfidence: serverAnalysis.styleConfidence,
        colorPalette: serverAnalysis.colorPalette,
        roomSuitability: serverAnalysis.roomSuitability,
        aestheticProperties: serverAnalysis.aestheticProperties,
        trendScore: serverAnalysis.trendScore,
        designTags: serverAnalysis.designTags
      };

      return {
        success: true,
        analysis: {
          ...clientFormatAnalysis,
          aiInsights: {
            marketingDescription: serverAnalysis.marketingDescription,
            designerNotes: serverAnalysis.designerNotes,
            luxuryLevel: serverAnalysis.aestheticProperties.luxuryLevel
          }
        },
        processingMethod: 'server',
        processingTime: Math.round(processingTime)
      };

    } catch (error) {
      console.error('Server style analysis error:', error);
      throw error;
    }
  }

  /**
   * Perform client-side analysis
   */
  private async performClientAnalysis(
    imageSource: string | File | Blob,
    options: StyleAnalysisOptions
  ): Promise<HybridStyleResult> {
    const startTime = performance.now();

    try {
      // Try client-side analysis first
      const result = await styleAnalysisService.analyzeStyle(imageSource, options);
      
      if (result.success && (result.confidence || 0) > 0.7) {
        const processingTime = performance.now() - startTime;
        return {
          success: true,
          analysis: result.data,
          processingMethod: 'client',
          processingTime: Math.round(processingTime)
        };
      }
      
      console.log('Client style analysis confidence low, trying HuggingFace...');
      
      // Try HuggingFace style analysis as fallback
      try {
        await huggingFaceService.initialize();
        const styleResults = await huggingFaceService.analyzeImageStyle(imageSource as string | File);
        
        if (styleResults.length > 0) {
          const topResult = styleResults[0];
          const processingTime = performance.now() - startTime;
          
          return {
            success: true,
            analysis: {
              primaryStyle: topResult.label,
              styleConfidence: topResult.score,
              colorPalette: { dominantColors: [], colorHarmony: 'unknown', warmthScore: 0 },
              roomSuitability: {},
              aestheticProperties: { 
                texture: 'smooth' as const, 
                finish: 'matte' as const, 
                pattern: 'solid' as const, 
                modernityScore: 0.5 
              },
              trendScore: topResult.score,
              designTags: [topResult.label]
            },
            processingMethod: 'client',
            processingTime: Math.round(processingTime)
          };
        }
      } catch (hfError) {
        console.log('HuggingFace style analysis failed:', hfError);
      }
      
      // Return original client result even if confidence is low
      const processingTime = performance.now() - startTime;
      return {
        success: result.success,
        analysis: result.data,
        processingMethod: 'client', 
        processingTime: Math.round(processingTime),
        error: result.error
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
          upsert: false
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
   */
  async getStoredStyleAnalysis(materialId: string): Promise<HybridStyleResult | null> {
    try {
      const { data, error } = await supabase
        .from('material_style_analysis')
        .select('*')
        .eq('material_id', materialId)
        .single();

      if (error || !data) {
        return null;
      }

      // Transform stored data to expected format
      const styleConfidence = data.style_confidence as any;
      const colorPalette = data.color_palette as any;
      const textureAnalysis = data.texture_analysis as any;
      
      const analysis: StyleAnalysisResult = {
        primaryStyle: styleConfidence?.primary_style || 'contemporary',
        styleConfidence: styleConfidence?.confidence || 0.7,
        colorPalette: {
          dominantColors: colorPalette?.dominant_colors || [],
          colorHarmony: colorPalette?.color_harmony || 'monochromatic',
          warmthScore: colorPalette?.warmth_score || 0
        },
        roomSuitability: (data.room_suitability as any) || {},
        aestheticProperties: {
          texture: textureAnalysis?.texture || 'smooth',
          finish: textureAnalysis?.finish || 'matte',
          pattern: textureAnalysis?.pattern || 'solid',
          modernityScore: styleConfidence?.modernity_score || 0.5
        },
        trendScore: data.trend_score as number || 0.5,
        designTags: (data.style_tags as string[]) || []
      };

      return {
        success: true,
        analysis: {
          ...analysis,
          aiInsights: {
            luxuryLevel: styleConfidence?.luxury_level
          }
        },
        processingMethod: 'server'
      };

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
    options: HybridStyleAnalysisOptions = {}
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
            processingMethod: 'client'
          }
        });
      }
    }

    return results;
  }

  /**
   * Get style recommendations based on room type
   */
  async getStyleRecommendations(roomType: string, stylePreferences?: string[]): Promise<{
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
          materialTypes: ['wood', 'metals', 'textiles']
        }
      ],
      bedroom: [
        {
          style: 'minimalist',
          description: 'Calm, uncluttered space for rest and relaxation',
          colorSuggestions: ['#FFFFFF', '#F8F8F8', '#D4D4D4'],
          materialTypes: ['wood', 'textiles', 'ceramics']
        }
      ]
    };

    return {
      recommendations: roomRecommendations[roomType as keyof typeof roomRecommendations] || []
    };
  }
}

export const hybridStyleAnalysisService = new HybridStyleAnalysisService();