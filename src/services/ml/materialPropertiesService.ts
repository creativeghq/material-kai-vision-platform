/**
 * Material Properties Analysis Service
 * Connects to the material-properties-analysis edge function
 */

import { supabase } from '@/integrations/supabase/client';

import { BaseService, ServiceConfig } from '../base/BaseService';

export interface MaterialPropertiesServiceConfig extends ServiceConfig {
  defaultAnalysisType: 'thermal' | 'mechanical' | 'chemical' | 'optical' | 'comprehensive';
  maxImageSize: number; // in MB
  enableCaching: boolean;
  cacheExpirationMs: number;
  enableBatchProcessing: boolean;
  maxBatchSize: number;
  enableAdvancedAnalysis: boolean;
  confidenceThreshold: number;
}

export interface MaterialPropertiesRequest {
  image_url?: string;
  image_data?: string; // base64
  material_id?: string;
  analysis_type?: 'thermal' | 'mechanical' | 'chemical' | 'optical' | 'comprehensive';
  user_id?: string;
}

export interface MaterialProperty {
  name: string;
  value: number | string;
  unit: string;
  confidence: number;
  measurement_method: string;
}

export interface MaterialPropertiesResult {
  success: boolean;
  analysis_id: string;
  material_id?: string;
  properties: MaterialProperty[];
  thermal_properties?: any;
  mechanical_properties?: any;
  chemical_properties?: any;
  optical_properties?: any;
  confidence_score: number;
  processing_time_ms: number;
  recommendations?: string[];
}

class MaterialPropertiesService extends BaseService<MaterialPropertiesServiceConfig> {

  protected async doInitialize(): Promise<void> {
    // Validate Supabase connection
    try {
      const { data: { user } } = await supabase.auth.getUser();
      console.log('MaterialPropertiesService: Supabase connection validated');
    } catch (error) {
      console.warn('MaterialPropertiesService: Supabase connection issue:', error);
    }

    // Validate configuration
    if (!this.config) {
      throw new Error('MaterialPropertiesService configuration is required');
    }

    if (this.config.maxImageSize <= 0) {
      throw new Error('Invalid maxImageSize configuration');
    }

    if (this.config.confidenceThreshold < 0 || this.config.confidenceThreshold > 1) {
      throw new Error('Invalid confidenceThreshold configuration');
    }

    // Test edge function availability
    try {
      const { error } = await supabase.functions.invoke('material-properties-analysis', {
        body: { action: 'ping' },
      });
      if (error && !error.message.includes('ping')) {
        console.warn('MaterialPropertiesService: Edge function may not be available:', error);
      }
    } catch (error) {
      console.warn('MaterialPropertiesService: Edge function test failed:', error);
    }
  }

  protected async doHealthCheck(): Promise<void> {
    if (!this.config) {
      throw new Error('MaterialPropertiesService configuration not found');
    }

    // Check Supabase connection
    try {
      const { error } = await supabase.auth.getSession();
      if (error) {
        throw new Error(`Supabase session error: ${error.message}`);
      }
    } catch (error) {
      throw new Error(`Supabase connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Validate configuration parameters
    if (this.config.maxImageSize <= 0) {
      throw new Error('Invalid maxImageSize in configuration');
    }

    if (this.config.confidenceThreshold < 0 || this.config.confidenceThreshold > 1) {
      throw new Error('Invalid confidenceThreshold in configuration');
    }

    if (this.config.enableBatchProcessing && this.config.maxBatchSize <= 0) {
      throw new Error('Invalid maxBatchSize when batch processing is enabled');
    }
  }

  /**
   * Create a new MaterialPropertiesService instance with standardized configuration
   */
  static createInstance(config?: Partial<MaterialPropertiesServiceConfig>): MaterialPropertiesService {
    const defaultConfig: MaterialPropertiesServiceConfig = {
      name: 'MaterialPropertiesService',
      version: '1.0.0',
      environment: 'development',
      enabled: true,
      timeout: 30000, // 30 seconds for material analysis
      retries: 2,
      defaultAnalysisType: 'comprehensive',
      maxImageSize: 10, // 10MB
      enableCaching: true,
      cacheExpirationMs: 3600000, // 1 hour
      enableBatchProcessing: false,
      maxBatchSize: 5,
      enableAdvancedAnalysis: true,
      confidenceThreshold: 0.7,
    };

    const finalConfig = { ...defaultConfig, ...config };
    const instance = new MaterialPropertiesService(finalConfig);
    return instance;
  }

  /**
   * Analyze material properties from image or existing material
   */
  async analyzeProperties(request: MaterialPropertiesRequest): Promise<MaterialPropertiesResult> {
    return this.executeOperation(async () => {
      console.log('Starting material properties analysis:', request.analysis_type);

      const { data, error } = await supabase.functions.invoke('material-properties-analysis', {
        body: {
          user_id: (await supabase.auth.getUser()).data.user?.id,
          ...request,
        },
      });

      if (error) {
        console.error('Material properties analysis error:', error);
        throw new Error(`Analysis failed: ${error.message}`);
      }

      return data as MaterialPropertiesResult;
    }, 'analyzeProperties');
  }

  /**
   * Get properties analysis results by ID
   */
  async getAnalysisResults(analysisId: string): Promise<any> {
    return this.executeOperation(async () => {
      const { data, error } = await supabase
        .from('material_style_analysis')
        .select('*')
        .eq('id', analysisId)
        .single();

      if (error) throw error;
      return data;
    }, 'getAnalysisResults');
  }

  /**
   * List properties analyses for a user
   */
  async listUserAnalyses(userId?: string): Promise<any[]> {
    return this.executeOperation(async () => {
      let query = supabase
        .from('material_style_analysis')
        .select('*')
        .order('created_at', { ascending: false });

      if (userId) {
        // Filter by material creator if needed
        query = query.eq('material_id', userId);
      }

      const { data, error } = await query;
      if (error) throw error;

      return data || [];
    }, 'listUserAnalyses');
  }

  /**
   * Comprehensive material analysis
   */
  async comprehensiveAnalysis(imageData: string): Promise<MaterialPropertiesResult> {
    return this.analyzeProperties({
      image_data: imageData,
      analysis_type: 'comprehensive',
    });
  }

  /**
   * Quick thermal analysis
   */
  async thermalAnalysis(imageData: string): Promise<MaterialPropertiesResult> {
    return this.analyzeProperties({
      image_data: imageData,
      analysis_type: 'thermal',
    });
  }

  /**
   * Mechanical properties analysis
   */
  async mechanicalAnalysis(imageData: string): Promise<MaterialPropertiesResult> {
    return this.analyzeProperties({
      image_data: imageData,
      analysis_type: 'mechanical',
    });
  }
}

// Export singleton instance
export const materialPropertiesService = MaterialPropertiesService.createInstance();
export { MaterialPropertiesService };
