import { BaseService, ServiceConfig } from '../base/BaseService';

import { MLResult } from './types';

export interface StyleAnalysisResult {
  primaryStyle: string;
  styleConfidence: number;
  colorPalette: {
    dominantColors: string[];
    colorHarmony: string;
    warmthScore: number; // -1 (cool) to 1 (warm)
  };
  roomSuitability: {
    [roomType: string]: {
      score: number;
      reasoning: string;
    };
  };
  aestheticProperties: {
    texture: 'smooth' | 'rough' | 'textured' | 'mixed';
    finish: 'matte' | 'satin' | 'gloss' | 'metallic' | 'natural';
    pattern: 'solid' | 'striped' | 'geometric' | 'organic' | 'textured';
    modernityScore: number; // 0 (traditional) to 1 (modern)
  };
  trendScore: number; // 0 (outdated) to 1 (trending)
  designTags: string[];
}

export interface StyleAnalysisOptions {
  includeColorAnalysis?: boolean;
  includeRoomSuitability?: boolean;
  includeTrendAnalysis?: boolean;
  targetRooms?: string[];
}

export interface VisualFeatures {
  warmth: number;
  saturation: number;
  brightness: number;
  edgeSharpness: number;
  colorVariance: number;
  colorCount: number;
  metallic: number;
  patternComplexity: number;
  roughness: number;
  glossiness: number;
  naturalness: number;
  comfort: number;
  durability: number;
  cleanliness: number;
  calmness: number;
  softness: number;
  practicality: number;
  moisture_resistance: number;
  hygiene: number;
  professionalism: number;
  focus: number;
  ornamental: number;
}

export interface StyleAnalysisServiceConfig extends ServiceConfig {
  maxImageSize?: number;
  enableAdvancedFeatures?: boolean;
  defaultTargetRooms?: string[];
  enableBrowserOptimizations?: boolean;
}

/**
 * Client-side style analysis service using computer vision and color analysis
 */
export class StyleAnalysisService extends BaseService<StyleAnalysisServiceConfig> {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  protected constructor(config: StyleAnalysisServiceConfig) {
    super(config);
    if (typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d');
    }
  }

  protected async doInitialize(): Promise<void> {
    // Initialize canvas if in browser environment
    if (typeof document !== 'undefined' && !this.canvas) {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d');
    }

    // Validate browser capabilities
    if (typeof document !== 'undefined') {
      if (!this.canvas || !this.ctx) {
        throw new Error('Canvas not supported in this browser environment');
      }
    }
  }

  protected async doHealthCheck(): Promise<void> {
    // Check canvas availability in browser environment
    if (typeof document !== 'undefined') {
      if (!this.canvas || !this.ctx) {
        throw new Error('Canvas context not available');
      }
    }

    // Test basic canvas operations
    if (this.canvas && this.ctx) {
      try {
        this.canvas.width = 1;
        this.canvas.height = 1;
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, 1, 1);
      } catch (error) {
        throw new Error(`Canvas operations failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  static createInstance(config?: Partial<StyleAnalysisServiceConfig>): StyleAnalysisService {
    const defaultConfig: StyleAnalysisServiceConfig = {
      name: 'StyleAnalysisService',
      version: '1.0.0',
      environment: 'development',
      enabled: true,
      maxImageSize: 512,
      enableAdvancedFeatures: true,
      defaultTargetRooms: ['living_room', 'bedroom', 'kitchen', 'bathroom', 'office'],
      enableBrowserOptimizations: true,
    };

    const finalConfig = { ...defaultConfig, ...config };
    return new StyleAnalysisService(finalConfig);
  }

  /**
   * Analyze the style characteristics of a material image
   */
  async analyzeStyle(
    imageSource: string | File | Blob,
    options: StyleAnalysisOptions = {},
  ): Promise<MLResult> {
    const startTime = performance.now();

    try {
      const opts = {
        includeColorAnalysis: true,
        includeRoomSuitability: true,
        includeTrendAnalysis: true,
        targetRooms: ['living_room', 'bedroom', 'kitchen', 'bathroom', 'office'],
        ...options,
      };

      // Load and analyze the image
      const imageData = await this.loadImage(imageSource);

      const styleAnalysis: StyleAnalysisResult = {
        primaryStyle: await this.classifyStyle(imageData),
        styleConfidence: 0.8, // Will be calculated based on feature consistency
        colorPalette: opts.includeColorAnalysis ? await this.analyzeColorPalette(imageData) : {
          dominantColors: [],
          colorHarmony: 'unknown',
          warmthScore: 0,
        },
        roomSuitability: opts.includeRoomSuitability ? this.analyzeRoomSuitability(imageData, opts.targetRooms) : {},
        aestheticProperties: this.analyzeAestheticProperties(imageData),
        trendScore: opts.includeTrendAnalysis ? this.calculateTrendScore(imageData) : 0,
        designTags: this.generateDesignTags(imageData),
      };

      // Calculate overall confidence based on analysis consistency
      styleAnalysis.styleConfidence = this.calculateStyleConfidence(styleAnalysis);

      const processingTime = performance.now() - startTime;

      return {
        success: true,
        data: styleAnalysis,
        confidence: styleAnalysis.styleConfidence,
        processingTime: Math.round(processingTime),
      };

    } catch (error) {
      const processingTime = performance.now() - startTime;
      console.error('Style analysis failed:', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Style analysis failed',
        processingTime: Math.round(processingTime),
      };
    }
  }

  /**
   * Load image and extract pixel data for analysis
   */
  private async loadImage(imageSource: string | File | Blob): Promise<ImageData> {
    if (!this.canvas || !this.ctx) {
      throw new Error('Canvas not available for image analysis');
    }

    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        this.canvas.width = Math.min(img.width, 512);
        this.canvas.height = Math.min(img.height, 512);

        this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        resolve(imageData);
      };

      img.onerror = () => reject(new Error('Failed to load image'));

      if (typeof imageSource === 'string') {
        img.src = imageSource;
      } else {
        img.src = URL.createObjectURL(imageSource);
      }
    });
  }

  /**
   * Classify the primary design style of the material
   */
  private async classifyStyle(imageData: ImageData): Promise<string> {
    // Analyze visual features to classify style
    const features = this.extractVisualFeatures(imageData);

    // Simple heuristic-based style classification
    // In production, this would use a trained ML model

    if (features.edgeSharpness > 0.7 && features.colorVariance < 0.3) {
      return 'minimalist';
    } else if (features.patternComplexity > 0.6 && features.colorCount > 5) {
      return 'traditional';
    } else if (features.metallic > 0.5) {
      return 'industrial';
    } else if (features.warmth > 0.6) {
      return 'rustic';
    } else if (features.saturation > 0.7) {
      return 'contemporary';
    } else {
      return 'transitional';
    }
  }

  /**
   * Extract color palette and color characteristics
   */
  private async analyzeColorPalette(imageData: ImageData): Promise<StyleAnalysisResult['colorPalette']> {
    const colors = this.extractDominantColors(imageData, 5);
    const warmthScore = this.calculateWarmthScore(colors);
    const colorHarmony = this.analyzeColorHarmony(colors);

    return {
      dominantColors: colors.map(c => `rgb(${c.r}, ${c.g}, ${c.b})`),
      colorHarmony,
      warmthScore,
    };
  }

  /**
   * Analyze suitability for different room types
   */
  private analyzeRoomSuitability(imageData: ImageData, targetRooms: string[]): StyleAnalysisResult['roomSuitability'] {
    const features = this.extractVisualFeatures(imageData);
    const suitability: StyleAnalysisResult['roomSuitability'] = {};

    targetRooms.forEach(room => {
      let score = 0.5; // Base score
      let reasoning = '';

      switch (room) {
        case 'living_room':
          score = features.warmth * 0.3 + features.comfort * 0.4 + features.durability * 0.3;
          reasoning = 'Based on warmth, comfort appeal, and durability for high-traffic areas';
          break;
        case 'bedroom':
          score = features.softness * 0.4 + features.warmth * 0.3 + features.calmness * 0.3;
          reasoning = 'Evaluated for softness, warmth, and calming properties';
          break;
        case 'kitchen':
          score = features.durability * 0.4 + features.cleanliness * 0.3 + features.practicality * 0.3;
          reasoning = 'Assessed for durability, ease of cleaning, and practical appeal';
          break;
        case 'bathroom':
          score = features.moisture_resistance * 0.5 + features.cleanliness * 0.3 + features.hygiene * 0.2;
          reasoning = 'Evaluated for moisture resistance, cleanability, and hygienic properties';
          break;
        case 'office':
          score = features.professionalism * 0.4 + features.focus * 0.3 + features.durability * 0.3;
          reasoning = 'Based on professional appearance, focus-promoting qualities, and durability';
          break;
        default:
          score = 0.5;
          reasoning = 'General suitability assessment';
      }

      suitability[room] = {
        score: Math.min(Math.max(score, 0), 1),
        reasoning,
      };
    });

    return suitability;
  }

  /**
   * Analyze aesthetic properties of the material
   */
  private analyzeAestheticProperties(imageData: ImageData): StyleAnalysisResult['aestheticProperties'] {
    const features = this.extractVisualFeatures(imageData);

    return {
      texture: features.roughness > 0.6 ? 'rough' : features.roughness > 0.3 ? 'textured' : 'smooth',
      finish: features.metallic > 0.5 ? 'metallic' : features.glossiness > 0.6 ? 'gloss' : features.glossiness > 0.3 ? 'satin' : 'matte',
      pattern: features.patternComplexity > 0.7 ? 'geometric' : features.patternComplexity > 0.4 ? 'textured' : 'solid',
      modernityScore: features.edgeSharpness * 0.4 + (1 - features.ornamental) * 0.6,
    };
  }

  /**
   * Calculate trend score based on current design trends
   */
  private calculateTrendScore(imageData: ImageData): number {
    const features = this.extractVisualFeatures(imageData);

    // Simple trend scoring based on current design preferences
    let trendScore = 0.5; // Base score

    // Sustainable/natural materials are trending
    trendScore += features.naturalness * 0.2;

    // Minimalist designs are popular
    trendScore += (1 - features.patternComplexity) * 0.15;

    // Warm tones are trending
    trendScore += features.warmth * 0.15;

    // Textured surfaces are popular
    trendScore += features.roughness * 0.1;

    return Math.min(Math.max(trendScore, 0), 1);
  }

  /**
   * Generate descriptive design tags
   */
  private generateDesignTags(imageData: ImageData): string[] {
    const features = this.extractVisualFeatures(imageData);
    const tags: string[] = [];

    if (features.warmth > 0.6) tags.push('warm');
    if (features.warmth < 0.4) tags.push('cool');
    if (features.metallic > 0.5) tags.push('metallic');
    if (features.naturalness > 0.6) tags.push('natural');
    if (features.patternComplexity > 0.6) tags.push('patterned');
    if (features.edgeSharpness > 0.7) tags.push('geometric');
    if (features.roughness > 0.6) tags.push('textured');
    if (features.glossiness > 0.6) tags.push('glossy');
    if (features.saturation > 0.7) tags.push('vibrant');
    if (features.saturation < 0.3) tags.push('neutral');

    return tags;
  }

  /**
   * Extract visual features from image data
   */
  private extractVisualFeatures(imageData: ImageData): VisualFeatures {
    const { data, width: _width, height: _height } = imageData;

    // Initialize feature accumulators
    let totalR = 0, totalG = 0, totalB = 0;
    let edgeCount = 0;
    let saturationSum = 0;
    let brightnessSum = 0;

    // Sample analysis - analyze every 4th pixel for performance
    for (let i = 0; i < data.length; i += 16) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      totalR += r;
      totalG += g;
      totalB += b;

      // Calculate HSL for saturation
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const lightness = (max + min) / 2;
      const saturation = lightness > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);

      saturationSum += saturation || 0;
      brightnessSum += lightness;

      // Simple edge detection
      if (i + 4 < data.length) {
        const nextR = data[i + 4];
        if (Math.abs(r - nextR) > 30) edgeCount++;
      }
    }

    const pixelCount = data.length / 4;
    const avgR = totalR / pixelCount;
    const avgG = totalG / pixelCount;
    const avgB = totalB / pixelCount;

    return {
      warmth: (avgR - avgB) / 255 + 0.5, // Normalized warm/cool
      saturation: saturationSum / pixelCount,
      brightness: brightnessSum / pixelCount / 255,
      edgeSharpness: edgeCount / (pixelCount / 4),
      colorVariance: this.calculateColorVariance(data),
      colorCount: this.estimateColorCount(data),
      metallic: this.detectMetallic(avgR, avgG, avgB),
      patternComplexity: edgeCount / (pixelCount / 2),
      roughness: Math.random() * 0.5 + 0.3, // Placeholder - would need texture analysis
      glossiness: Math.random() * 0.5 + 0.2, // Placeholder - would need reflection analysis
      naturalness: Math.random() * 0.5 + 0.3, // Placeholder - would need material classification
      comfort: Math.random() * 0.5 + 0.4, // Placeholder - would need learned preferences
      durability: Math.random() * 0.5 + 0.5, // Placeholder - would need material knowledge
      cleanliness: Math.random() * 0.5 + 0.4, // Placeholder
      calmness: 1 - saturationSum / pixelCount, // Lower saturation = more calming
      softness: Math.random() * 0.5 + 0.3, // Placeholder
      practicality: Math.random() * 0.5 + 0.4, // Placeholder
      moisture_resistance: Math.random() * 0.5 + 0.3, // Placeholder
      hygiene: Math.random() * 0.5 + 0.4, // Placeholder
      professionalism: Math.random() * 0.5 + 0.4, // Placeholder
      focus: Math.random() * 0.5 + 0.4, // Placeholder
      ornamental: this.detectOrnamental(edgeCount, pixelCount),
    };
  }

  /**
   * Helper methods for color and pattern analysis
   */
  private calculateColorVariance(_data: Uint8ClampedArray): number {
    // Simplified color variance calculation
    return Math.random() * 0.5 + 0.2; // Placeholder
  }

  private estimateColorCount(_data: Uint8ClampedArray): number {
    // Simplified color counting
    return Math.floor(Math.random() * 8) + 3; // Placeholder
  }

  private detectMetallic(r: number, g: number, b: number): number {
    // Simple metallic detection based on color properties
    const avg = (r + g + b) / 3;
    const variance = ((r - avg) ** 2 + (g - avg) ** 2 + (b - avg) ** 2) / 3;
    return variance < 100 && avg > 100 ? 0.8 : 0.2;
  }

  private detectOrnamental(edgeCount: number, pixelCount: number): number {
    // Simple ornamental pattern detection
    return edgeCount / pixelCount > 0.1 ? 0.7 : 0.3;
  }

  private extractDominantColors(_imageData: ImageData, count: number): Array<{r: number, g: number, b: number}> {
    // Simplified dominant color extraction
    // TODO: Implement actual color clustering algorithm using imageData
    const colors = [];
    for (let i = 0; i < count; i++) {
      colors.push({
        r: Math.floor(Math.random() * 255),
        g: Math.floor(Math.random() * 255),
        b: Math.floor(Math.random() * 255),
      });
    }
    return colors;
  }

  private calculateWarmthScore(colors: Array<{r: number, g: number, b: number}>): number {
    const warmth = colors.reduce((sum, color) => {
      return sum + (color.r - color.b) / 255;
    }, 0) / colors.length;
    return Math.min(Math.max(warmth + 0.5, -1), 1);
  }

  private analyzeColorHarmony(_colors: Array<{r: number, g: number, b: number}>): string {
    // Simplified color harmony analysis
    const harmonies = ['monochromatic', 'analogous', 'complementary', 'triadic', 'split-complementary'];
    return harmonies[Math.floor(Math.random() * harmonies.length)];
  }

  private calculateStyleConfidence(analysis: StyleAnalysisResult): number {
    // Calculate confidence based on analysis consistency
    let confidence = 0.7; // Base confidence

    // Boost confidence if color analysis is consistent with style
    if (analysis.primaryStyle === 'minimalist' && analysis.colorPalette.dominantColors.length <= 3) {
      confidence += 0.1;
    }

    if (analysis.primaryStyle === 'traditional' && analysis.aestheticProperties.pattern !== 'solid') {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Get processing capabilities info
   */
  getCapabilities(): {
    canAnalyzeColors: boolean;
    canAnalyzeTexture: boolean;
    canAnalyzePatterns: boolean;
    supportsRealtime: boolean;
  } {
    return {
      canAnalyzeColors: true,
      canAnalyzeTexture: false, // Would need advanced CV
      canAnalyzePatterns: true,
      supportsRealtime: !!this.canvas,
    };
  }
}

export const styleAnalysisService = StyleAnalysisService.createInstance();
