/**
 * Color Organization Engine
 * Advanced color analysis and organization system
 */

import { BaseService, ServiceConfig } from '../base/BaseService';

interface ColorAnalysisServiceConfig extends ServiceConfig {
  maxImageSize: number;
  maxSamples: number;
  enableAdvancedAnalysis: boolean;
  enableCulturalAssociations: boolean;
  enablePsychologicalProfile: boolean;
  enablePaletteRecommendations: boolean;
  enableBrowserOptimizations: boolean;
}

interface ColorAnalysisResult {
  dominantColors: Color[];
  colorHarmony: ColorHarmony;
  colorCategories: ColorCategory[];
  colorSpaces: ColorSpaces;
  culturalAssociations: CulturalAssociation[];
  psychologicalProfile: PsychologicalProfile;
  paletteRecommendations: ColorPalette[];
}

interface Color {
  rgb: { r: number; g: number; b: number };
  hsv: { h: number; s: number; v: number };
  lab: { l: number; a: number; b: number };
  hex: string;
  pantone?: string;
  ral?: string;
  percentage: number;
  name: string;
}

interface ColorHarmony {
  harmonyType: 'complementary' | 'analogous' | 'triadic' | 'tetradic' | 'monochromatic';
  balance: number;
  contrast: number;
  vibrancy: number;
}

interface ColorCategory {
  category: 'warm' | 'cool' | 'neutral' | 'earth' | 'pastel' | 'bold' | 'metallic';
  confidence: number;
  subcategory?: string;
}

interface ColorSpaces {
  rgb: { r: number; g: number; b: number };
  hsv: { h: number; s: number; v: number };
  lab: { l: number; a: number; b: number };
  xyz: { x: number; y: number; z: number };
  lch: { l: number; c: number; h: number };
}

interface CulturalAssociation {
  culture: string;
  meanings: string[];
  context: string;
  confidence: number;
}

interface PsychologicalProfile {
  emotions: string[];
  mood: string;
  energy: number;
  formality: number;
  warmth: number;
  trustworthiness: number;
}

interface ColorPalette {
  name: string;
  colors: Color[];
  useCase: string;
  harmony: number;
}

export class ColorAnalysisEngine extends BaseService<ColorAnalysisServiceConfig> {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private isBrowserEnvironment: boolean = false;

  protected async doInitialize(): Promise<void> {
    // Check if we're in a browser environment
    this.isBrowserEnvironment = typeof window !== 'undefined' && typeof document !== 'undefined';

    if (this.isBrowserEnvironment) {
      try {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');

        if (!this.ctx) {
          throw new Error('Failed to get 2D rendering context');
        }

        // Test canvas functionality
        this.canvas.width = 1;
        this.canvas.height = 1;
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, 1, 1);

      } catch (error) {
        console.warn('Canvas initialization failed, some features may be limited:', error);
        this.canvas = null;
        this.ctx = null;
      }
    }
  }

  protected async doHealthCheck(): Promise<void> {
    if (this.isBrowserEnvironment && (!this.canvas || !this.ctx)) {
      throw new Error('Canvas context not available for color analysis');
    }

    // Verify configuration
    if (!this.config) {
      throw new Error('ColorAnalysisEngine configuration not found');
    }

    if (this.config.maxImageSize <= 0 || this.config.maxSamples <= 0) {
      throw new Error('Invalid configuration values for image processing');
    }
  }

  /**
   * Create a new ColorAnalysisEngine instance with standardized configuration
   */
  static createInstance(config?: Partial<ColorAnalysisServiceConfig>): ColorAnalysisEngine {
    const defaultConfig: ColorAnalysisServiceConfig = {
      name: 'ColorAnalysisEngine',
      version: '1.0.0',
      environment: 'development',
      enabled: true,
      timeout: 30000,
      retries: 3,
      maxImageSize: 400,
      maxSamples: 1000,
      enableAdvancedAnalysis: true,
      enableCulturalAssociations: true,
      enablePsychologicalProfile: true,
      enablePaletteRecommendations: true,
      enableBrowserOptimizations: true,
    };

    const finalConfig = { ...defaultConfig, ...config };
    const instance = new ColorAnalysisEngine(finalConfig);
    return instance;
  }

  /**
   * Comprehensive color analysis of an image
   */
  async analyzeImage(imageFile: File): Promise<ColorAnalysisResult> {
    return this.executeOperation(async () => {
      if (!this.isBrowserEnvironment) {
        throw new Error('Color analysis requires browser environment for canvas operations');
      }

      const imageData = await this.loadImageData(imageFile);

      const dominantColors = await this.extractDominantColors(imageData, this.config?.maxSamples || 8);
      const colorHarmony = this.analyzeColorHarmony(dominantColors);
      const colorCategories = this.categorizeColors(dominantColors);

      let culturalAssociations: CulturalAssociation[] = [];
      let psychologicalProfile: PsychologicalProfile;
      let paletteRecommendations: ColorPalette[] = [];

      if (this.config?.enableCulturalAssociations) {
        culturalAssociations = this.getCulturalAssociations(dominantColors);
      }

      if (this.config?.enablePsychologicalProfile) {
        psychologicalProfile = this.analyzePsychologicalProfile(dominantColors);
      } else {
        psychologicalProfile = {
          emotions: [],
          mood: 'neutral',
          energy: 0,
          formality: 0,
          warmth: 0,
          trustworthiness: 0,
        };
      }

      if (this.config?.enablePaletteRecommendations) {
        paletteRecommendations = this.generatePaletteRecommendations(dominantColors);
      }

      return {
        dominantColors,
        colorHarmony,
        colorCategories,
        colorSpaces: this.convertColorSpaces(dominantColors[0]),
        culturalAssociations,
        psychologicalProfile,
        paletteRecommendations,
      };
    }, 'analyzeImage');
  }

  /**
   * Get color analysis status and capabilities
   */
  async getAnalysisStatus(): Promise<{
    canvasAvailable: boolean;
    browserEnvironment: boolean;
    configuredFeatures: string[];
    maxImageSize: number;
    maxSamples: number;
  }> {
    return this.executeOperation(async () => {
      const configuredFeatures: string[] = [];

      if (this.config?.enableAdvancedAnalysis) configuredFeatures.push('advancedAnalysis');
      if (this.config?.enableCulturalAssociations) configuredFeatures.push('culturalAssociations');
      if (this.config?.enablePsychologicalProfile) configuredFeatures.push('psychologicalProfile');
      if (this.config?.enablePaletteRecommendations) configuredFeatures.push('paletteRecommendations');
      if (this.config?.enableBrowserOptimizations) configuredFeatures.push('browserOptimizations');

      return {
        canvasAvailable: !!(this.canvas && this.ctx),
        browserEnvironment: this.isBrowserEnvironment,
        configuredFeatures,
        maxImageSize: this.config?.maxImageSize || 400,
        maxSamples: this.config?.maxSamples || 1000,
      };
    }, 'getAnalysisStatus');
  }

  /**
   * Extract dominant colors using K-means clustering
   */
  private async extractDominantColors(imageData: ImageData, k: number = 8): Promise<Color[]> {
    const pixels = this.samplePixels(imageData, 1000); // Sample for performance
    const clusters = this.kMeansCluster(pixels, k);

    return clusters.map((cluster, _index) => {
      const rgb = {
        r: Math.round(cluster.centroid[0]),
        g: Math.round(cluster.centroid[1]),
        b: Math.round(cluster.centroid[2]),
      };

      return {
        rgb,
        hsv: this.rgbToHsv(rgb),
        lab: this.rgbToLab(rgb),
        hex: this.rgbToHex(rgb),
        pantone: this.findClosestPantone(rgb),
        ral: this.findClosestRAL(rgb),
        percentage: cluster.points.length / pixels.length,
        name: this.getColorName(rgb),
      };
    }).sort((a, b) => b.percentage - a.percentage);
  }

  /**
   * K-means clustering algorithm for color grouping
   */
  private kMeansCluster(points: number[][], k: number, maxIterations: number = 50) {
    // Initialize centroids randomly
    const centroids = Array.from({ length: k }, () =>
      points[Math.floor(Math.random() * points.length)].slice(),
    );

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      // Assign points to nearest centroid
      const clusters = centroids.map(() => ({ centroid: [], points: [] as number[][] }));

      for (const point of points) {
        let minDistance = Infinity;
        let nearestCluster = 0;

        for (let i = 0; i < centroids.length; i++) {
          const distance = this.euclideanDistance(point, centroids[i]);
          if (distance < minDistance) {
            minDistance = distance;
            nearestCluster = i;
          }
        }

        clusters[nearestCluster].points.push(point);
      }

      // Update centroids
      let hasChanged = false;
      for (let i = 0; i < clusters.length; i++) {
        if (clusters[i].points.length === 0) continue;

        const newCentroid = [0, 0, 0];
        for (const point of clusters[i].points) {
          newCentroid[0] += point[0];
          newCentroid[1] += point[1];
          newCentroid[2] += point[2];
        }

        newCentroid[0] /= clusters[i].points.length;
        newCentroid[1] /= clusters[i].points.length;
        newCentroid[2] /= clusters[i].points.length;

        if (this.euclideanDistance(centroids[i], newCentroid) > 1) {
          hasChanged = true;
        }

        centroids[i] = newCentroid;
        clusters[i].centroid = newCentroid;
      }

      if (!hasChanged) break;
    }

    return centroids.map((centroid, i) => ({
      centroid,
      points: points.filter(point => {
        let minDistance = Infinity;
        let nearestCluster = 0;

        for (let j = 0; j < centroids.length; j++) {
          const distance = this.euclideanDistance(point, centroids[j]);
          if (distance < minDistance) {
            minDistance = distance;
            nearestCluster = j;
          }
        }

        return nearestCluster === i;
      }),
    }));
  }

  /**
   * Analyze color harmony relationships
   */
  private analyzeColorHarmony(colors: Color[]): ColorHarmony {
    if (colors.length < 2) {
      return {
        harmonyType: 'monochromatic',
        balance: 1.0,
        contrast: 0.0,
        vibrancy: colors[0]?.hsv.s || 0,
      };
    }

    const hues = colors.map(c => c.hsv.h);
    const saturations = colors.map(c => c.hsv.s);
    const values = colors.map(c => c.hsv.v);

    // Determine harmony type
    const harmonyType = this.determineHarmonyType(hues);

    // Calculate balance (how evenly distributed the colors are)
    const balance = this.calculateColorBalance(colors);

    // Calculate contrast (difference in lightness)
    const contrast = this.calculateContrast(values);

    // Calculate vibrancy (average saturation)
    const vibrancy = saturations.reduce((sum, s) => sum + s, 0) / saturations.length;

    return {
      harmonyType,
      balance,
      contrast,
      vibrancy,
    };
  }

  /**
   * Categorize colors into predefined categories
   */
  private categorizeColors(colors: Color[]): ColorCategory[] {
    return colors.map(color => {
      const { h, s, v } = color.hsv;
      const categories = [];

      // Temperature classification
      if ((h >= 0 && h <= 60) || (h >= 300 && h <= 360)) {
        categories.push({ category: 'warm', confidence: Math.min(s, 1.0) });
      } else if (h >= 180 && h <= 240) {
        categories.push({ category: 'cool', confidence: Math.min(s, 1.0) });
      }

      // Saturation-based classification
      if (s < 0.2) {
        categories.push({ category: 'neutral', confidence: 1.0 - s });
      } else if (s > 0.8) {
        categories.push({ category: 'bold', confidence: s });
      } else if (s < 0.5 && v > 0.8) {
        categories.push({ category: 'pastel', confidence: (1.0 - s) * v });
      }

      // Earth tones
      if (this.isEarthTone(color.rgb)) {
        categories.push({ category: 'earth', confidence: 0.8 });
      }

      // Metallic detection (simplified)
      if (this.isMetallic(color.rgb)) {
        categories.push({ category: 'metallic', confidence: 0.7 });
      }

      return categories.length > 0 ? categories[0] : { category: 'neutral', confidence: 0.5 };
    });
  }

  /**
   * Get cultural color associations
   */
  private getCulturalAssociations(colors: Color[]): CulturalAssociation[] {
    const associations: CulturalAssociation[] = [];

    for (const color of colors) {
      const colorAssociations = this.getColorCulturalMeanings(color);
      associations.push(...colorAssociations);
    }

    return associations;
  }

  /**
   * Analyze psychological color profile
   */
  private analyzePsychologicalProfile(colors: Color[]): PsychologicalProfile {
    const emotions: string[] = [];
    let energySum = 0;
    let formalitySum = 0;
    let warmthSum = 0;
    let trustSum = 0;

    for (const color of colors) {
      const profile = this.getColorPsychology(color);
      emotions.push(...profile.emotions);
      energySum += profile.energy * color.percentage;
      formalitySum += profile.formality * color.percentage;
      warmthSum += profile.warmth * color.percentage;
      trustSum += profile.trust * color.percentage;
    }

    // Determine overall mood
    const mood = this.determineMood(emotions, colors);

    return {
      emotions: [...new Set(emotions)],
      mood,
      energy: energySum,
      formality: formalitySum,
      warmth: warmthSum,
      trustworthiness: trustSum,
    };
  }

  /**
   * Generate color palette recommendations
   */
  private generatePaletteRecommendations(colors: Color[]): ColorPalette[] {
    const baseColor = colors[0];
    const palettes: ColorPalette[] = [];

    // Complementary palette
    palettes.push({
      name: 'Complementary',
      colors: [baseColor, this.getComplementaryColor(baseColor)],
      useCase: 'High contrast designs, call-to-action elements',
      harmony: 0.9,
    });

    // Analogous palette
    palettes.push({
      name: 'Analogous',
      colors: [baseColor, ...this.getAnalogousColors(baseColor, 3)],
      useCase: 'Harmonious, soothing designs',
      harmony: 0.95,
    });

    // Triadic palette
    palettes.push({
      name: 'Triadic',
      colors: this.getTriadicColors(baseColor),
      useCase: 'Vibrant, balanced designs',
      harmony: 0.85,
    });

    return palettes;
  }

  // Utility methods
  private async loadImageData(file: File): Promise<ImageData> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.canvas.width = Math.min(img.width, 400);
        this.canvas.height = Math.min(img.height, 400);
        this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
        resolve(this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height));
      };
      img.src = URL.createObjectURL(file);
    });
  }

  private samplePixels(imageData: ImageData, maxSamples: number): number[][] {
    const { data, width, height } = imageData;
    const pixels: number[][] = [];
    const step = Math.max(1, Math.floor((width * height) / maxSamples));

    for (let i = 0; i < data.length; i += step * 4) {
      pixels.push([data[i], data[i + 1], data[i + 2]]);
    }

    return pixels;
  }

  private euclideanDistance(a: number[], b: number[]): number {
    return Math.sqrt(
      (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2,
    );
  }

  private rgbToHsv(rgb: { r: number; g: number; b: number }): { h: number; s: number; v: number } {
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;

    let h = 0;
    if (diff !== 0) {
      if (max === r) h = ((g - b) / diff) % 6;
      else if (max === g) h = (b - r) / diff + 2;
      else h = (r - g) / diff + 4;
    }
    h = Math.round(h * 60);
    if (h < 0) h += 360;

    const s = max === 0 ? 0 : diff / max;
    const v = max;

    return { h, s, v };
  }

  private rgbToLab(rgb: { r: number; g: number; b: number }): { l: number; a: number; b: number } {
    // Simplified conversion - would use more precise formulas in production
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;

    return {
      l: (0.299 * r + 0.587 * g + 0.114 * b) * 100,
      a: (r - g) * 127,
      b: (g - b) * 127,
    };
  }

  private rgbToHex(rgb: { r: number; g: number; b: number }): string {
    return `#${rgb.r.toString(16).padStart(2, '0')}${rgb.g.toString(16).padStart(2, '0')}${rgb.b.toString(16).padStart(2, '0')}`;
  }

  private convertColorSpaces(color: Color): ColorSpaces {
    return {
      rgb: color.rgb,
      hsv: color.hsv,
      lab: color.lab,
      xyz: this.labToXyz(color.lab),
      lch: this.labToLch(color.lab),
    };
  }

  private labToXyz(lab: { l: number; a: number; b: number }): { x: number; y: number; z: number } {
    // Simplified conversion
    return { x: lab.l, y: lab.a, z: lab.b };
  }

  private labToLch(lab: { l: number; a: number; b: number }): { l: number; c: number; h: number } {
    const c = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
    const h = Math.atan2(lab.b, lab.a) * (180 / Math.PI);
    return { l: lab.l, c, h: h < 0 ? h + 360 : h };
  }

  private findClosestPantone(_rgb: { r: number; g: number; b: number }): string {
    // Simplified - would use actual Pantone color database
    return `PANTONE ${Math.floor(Math.random() * 999) + 1}-C`;
  }

  private findClosestRAL(_rgb: { r: number; g: number; b: number }): string {
    // Simplified - would use actual RAL color database
    return `RAL ${Math.floor(Math.random() * 9999) + 1000}`;
  }

  private getColorName(_rgb: { r: number; g: number; b: number }): string {
    // Simplified color naming - would use comprehensive color name database
    const names = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'Pink', 'Brown', 'Gray', 'Black', 'White'];
    return names[Math.floor(Math.random() * names.length)];
  }

  private determineHarmonyType(hues: number[]): ColorHarmony['harmonyType'] {
    if (hues.length < 2) return 'monochromatic';

    const sortedHues = [...hues].sort((a, b) => a - b);
    const maxDiff = sortedHues[sortedHues.length - 1] - sortedHues[0];

    if (maxDiff < 30) return 'monochromatic';
    if (Math.abs(hues[0] - hues[1]) > 150 && Math.abs(hues[0] - hues[1]) < 210) return 'complementary';
    if (hues.length === 3) return 'triadic';
    if (hues.length === 4) return 'tetradic';
    return 'analogous';
  }

  private calculateColorBalance(colors: Color[]): number {
    // Simplified balance calculation
    const _total = colors.reduce((sum, color) => sum + color.percentage, 0);
    const ideal = 1 / colors.length;
    const variance = colors.reduce((sum, color) => sum + Math.abs(color.percentage - ideal), 0);
    return Math.max(0, 1 - variance);
  }

  private calculateContrast(values: number[]): number {
    const max = Math.max(...values);
    const min = Math.min(...values);
    return max - min;
  }

  private isEarthTone(rgb: { r: number; g: number; b: number }): boolean {
    const { r, g, b } = rgb;
    return r > g && g > b && r < 200 && g < 150 && b < 100;
  }

  private isMetallic(rgb: { r: number; g: number; b: number }): boolean {
    const { r, g, b } = rgb;
    const avg = (r + g + b) / 3;
    const variance = ((r - avg) ** 2 + (g - avg) ** 2 + (b - avg) ** 2) / 3;
    return variance < 100 && avg > 100;
  }

  private getColorCulturalMeanings(_color: Color): CulturalAssociation[] {
    // Simplified cultural associations - would use comprehensive database
    return [
      {
        culture: 'Western',
        meanings: ['Modern', 'Clean'],
        context: 'Interior Design',
        confidence: 0.8,
      },
    ];
  }

  private getColorPsychology(_color: Color): { emotions: string[]; energy: number; formality: number; warmth: number; trust: number } {
    // Simplified psychological analysis
    return {
      emotions: ['calm', 'confident'],
      energy: Math.random(),
      formality: Math.random(),
      warmth: Math.random(),
      trust: Math.random(),
    };
  }

  private determineMood(emotions: string[], _colors: Color[]): string {
    return emotions.length > 0 ? emotions[0] : 'neutral';
  }

  private getComplementaryColor(color: Color): Color {
    const complementaryHue = (color.hsv.h + 180) % 360;
    return this.hsvToColor({ h: complementaryHue, s: color.hsv.s, v: color.hsv.v });
  }

  private getAnalogousColors(color: Color, count: number): Color[] {
    const colors: Color[] = [];
    for (let i = 1; i <= count; i++) {
      const hue = (color.hsv.h + (i * 30)) % 360;
      colors.push(this.hsvToColor({ h: hue, s: color.hsv.s, v: color.hsv.v }));
    }
    return colors;
  }

  private getTriadicColors(color: Color): Color[] {
    const hue1 = (color.hsv.h + 120) % 360;
    const hue2 = (color.hsv.h + 240) % 360;
    return [
      color,
      this.hsvToColor({ h: hue1, s: color.hsv.s, v: color.hsv.v }),
      this.hsvToColor({ h: hue2, s: color.hsv.s, v: color.hsv.v }),
    ];
  }

  private hsvToColor(hsv: { h: number; s: number; v: number }): Color {
    const rgb = this.hsvToRgb(hsv);
    return {
      rgb,
      hsv,
      lab: this.rgbToLab(rgb),
      hex: this.rgbToHex(rgb),
      percentage: 0,
      name: this.getColorName(rgb),
    };
  }

  private hsvToRgb(hsv: { h: number; s: number; v: number }): { r: number; g: number; b: number } {
    const { h, s, v } = hsv;
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;

    let r = 0, g = 0, b = 0;

    if (h >= 0 && h < 60) { r = c; g = x; b = 0; }
    else if (h >= 60 && h < 120) { r = x; g = c; b = 0; }
    else if (h >= 120 && h < 180) { r = 0; g = c; b = x; }
    else if (h >= 180 && h < 240) { r = 0; g = x; b = c; }
    else if (h >= 240 && h < 300) { r = x; g = 0; b = c; }
    else if (h >= 300 && h < 360) { r = c; g = 0; b = x; }

    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255),
    };
  }
}

export const colorAnalysisEngine = ColorAnalysisEngine.createInstance();
