import { MLResult, MaterialAnalysisResult, ImageClassificationResult } from './types';
import { ImageClassifierService } from './imageClassifier';
import { TextEmbedderService } from './textEmbedder';

export interface MaterialProperties {
  // Physical Properties
  physicalProperties: {
    density: number;
    hardness: number;
    elasticity: number;
    thermalConductivity: number;
    electricalConductivity: number;
    magneticProperties: string;
    porosity: number;
    surfaceRoughness: number;
  };
  
  // Mechanical Properties
  mechanicalProperties: {
    tensileStrength: number;
    compressiveStrength: number;
    flexuralStrength: number;
    fatigueResistance: number;
    impactResistance: number;
    wearResistance: number;
    creepResistance: number;
  };
  
  // Chemical Properties
  chemicalProperties: {
    composition: { [element: string]: number };
    corrosionResistance: number;
    chemicalStability: number;
    oxidationResistance: number;
    acidResistance: number;
    alkalineResistance: number;
    solventResistance: number;
  };
  
  // Environmental Properties
  environmentalProperties: {
    weatherResistance: number;
    uvResistance: number;
    moistureResistance: number;
    temperatureRange: { min: number; max: number };
    fireResistance: number;
    recyclability: number;
    carbonFootprint: number;
    toxicity: string;
  };
  
  // Performance Characteristics
  performanceCharacteristics: {
    durability: number;
    lifecycle: number; // years
    maintenanceRequirements: string;
    performanceGrade: string;
    qualityRating: number;
    costEffectiveness: number;
    availabilityScore: number;
  };
  
  // Standards & Compliance
  compliance: {
    standards: string[];
    certifications: string[];
    regulatoryCompliance: string[];
    safetyRatings: string[];
    industryGrades: string[];
  };
}

export interface AdvancedMaterialAnalysisResult {
  materialType: string;
  confidence: number;
  properties: MaterialProperties;
  recommendations: {
    applications: string[];
    suitableEnvironments: string[];
    incompatibleMaterials: string[];
    maintenanceGuidelines: string[];
    safetyPrecautions: string[];
  };
  qualityAssessment: {
    overallGrade: string;
    strengthAreas: string[];
    weaknessAreas: string[];
    improvementSuggestions: string[];
  };
  processingTime: number;
}

export interface MaterialAnalysisOptions {
  analysisDepth: 'basic' | 'standard' | 'comprehensive';
  focusAreas: string[];
  comparisonMaterials?: string[];
  environmentalConditions?: {
    temperature: number;
    humidity: number;
    exposure: string;
  };
  applicationContext?: string;
}

export class MaterialAnalyzerService {
  private imageClassifier = new ImageClassifierService();
  private textEmbedder = new TextEmbedderService();
  private static knowledgeBase = new Map<string, Partial<MaterialProperties>>();
  
  static {
    // Initialize with basic material property templates
    MaterialAnalyzerService.initializeKnowledgeBase();
  }

  async analyzeMaterial(imageSource: string | File | Blob, description?: string): Promise<MLResult> {
    const startTime = performance.now();
    
    try {
      const imageAnalysis = await this.imageClassifier.classify(imageSource);
      let textAnalysis = null;

      if (description) {
        textAnalysis = await this.textEmbedder.generateEmbedding(description);
      }

      const processingTime = performance.now() - startTime;

      const result: MaterialAnalysisResult = {
        image: imageAnalysis.data,
        text: textAnalysis?.data,
        combined: {
          materialType: this.extractMaterialType(imageAnalysis.data),
          confidence: imageAnalysis.confidence || 0,
          features: imageAnalysis.data?.slice(0, 3) || []
        }
      };

      return {
        success: imageAnalysis.success && (!description || textAnalysis?.success),
        data: result,
        confidence: imageAnalysis.confidence,
        processingTime: Math.round(processingTime)
      };
    } catch (error) {
      const processingTime = performance.now() - startTime;
      console.error('Material analysis failed:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Material analysis failed',
        processingTime: Math.round(processingTime)
      };
    }
  }

  async analyzeAdvancedProperties(
    imageFile: File,
    options: MaterialAnalysisOptions = { analysisDepth: 'standard', focusAreas: [] }
  ): Promise<MLResult> {
    const startTime = performance.now();

    try {
      // Create image bitmap for analysis
      const imageBitmap = await createImageBitmap(imageFile);
      
      // Perform visual analysis
      const visualAnalysis = await this.performVisualAnalysis(imageBitmap);
      
      // Get material properties from knowledge base
      const baseProperties = MaterialAnalyzerService.knowledgeBase.get(visualAnalysis.materialType.toLowerCase()) || 
                           this.getDefaultProperties();
      
      // Enhance properties based on visual analysis
      const enhancedProperties = this.enhancePropertiesFromVisual(baseProperties, visualAnalysis);
      
      // Apply analysis depth and focus areas
      const finalProperties = this.applyAnalysisOptions(enhancedProperties, options);
      
      // Generate recommendations
      const recommendations = this.generateRecommendations(visualAnalysis.materialType, finalProperties);
      
      // Assess quality
      const qualityAssessment = this.assessQuality(finalProperties, visualAnalysis);

      const result: AdvancedMaterialAnalysisResult = {
        materialType: visualAnalysis.materialType,
        confidence: visualAnalysis.confidence,
        properties: finalProperties,
        recommendations,
        qualityAssessment,
        processingTime: performance.now() - startTime
      };

      return {
        success: true,
        data: result,
        processingTime: performance.now() - startTime
      };

    } catch (error) {
      console.error('Advanced Material Analysis Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Advanced material analysis failed',
        processingTime: performance.now() - startTime
      };
    }
  }

  private extractMaterialType(classificationResults: ImageClassificationResult[]): string {
    if (!classificationResults || classificationResults.length === 0) {
      return 'unknown';
    }

    const topResult = classificationResults[0];
    const label = topResult.label.toLowerCase();

    // Map common labels to material categories
    const materialMappings: Record<string, string> = {
      'wood': 'wood',
      'metal': 'metals',
      'plastic': 'plastics',
      'fabric': 'textiles',
      'ceramic': 'ceramics',
      'glass': 'glass',
      'concrete': 'concrete',
      'rubber': 'rubber',
      'stone': 'ceramics',
      'leather': 'textiles'
    };

    for (const [key, category] of Object.entries(materialMappings)) {
      if (label.includes(key)) {
        return category;
      }
    }

    return 'other';
  }

  async preloadModels(): Promise<void> {
    try {
      await Promise.all([
        this.imageClassifier.initialize(),
        this.textEmbedder.initialize()
      ]);
      console.log('Material analyzer models preloaded successfully');
    } catch (error) {
      console.error('Failed to preload material analyzer models:', error);
      throw error;
    }
  }

  private static initializeKnowledgeBase() {
    // Steel properties template
    this.knowledgeBase.set('steel', {
      physicalProperties: {
        density: 7850,
        hardness: 250,
        elasticity: 200000,
        thermalConductivity: 50,
        electricalConductivity: 6,
        magneticProperties: 'ferromagnetic',
        porosity: 0,
        surfaceRoughness: 1.6
      },
      mechanicalProperties: {
        tensileStrength: 400,
        compressiveStrength: 400,
        flexuralStrength: 400,
        fatigueResistance: 8,
        impactResistance: 9,
        wearResistance: 8,
        creepResistance: 7
      },
      environmentalProperties: {
        weatherResistance: 4,
        uvResistance: 9,
        moistureResistance: 3,
        temperatureRange: { min: -40, max: 500 },
        fireResistance: 9,
        recyclability: 10,
        carbonFootprint: 6,
        toxicity: 'low'
      }
    });

    // Concrete properties template
    this.knowledgeBase.set('concrete', {
      physicalProperties: {
        density: 2400,
        hardness: 150,
        elasticity: 30000,
        thermalConductivity: 1.7,
        electricalConductivity: 0,
        magneticProperties: 'non-magnetic',
        porosity: 15,
        surfaceRoughness: 50
      },
      mechanicalProperties: {
        tensileStrength: 4,
        compressiveStrength: 30,
        flexuralStrength: 5,
        fatigueResistance: 6,
        impactResistance: 4,
        wearResistance: 7,
        creepResistance: 8
      },
      environmentalProperties: {
        weatherResistance: 8,
        uvResistance: 10,
        moistureResistance: 6,
        temperatureRange: { min: -20, max: 200 },
        fireResistance: 10,
        recyclability: 8,
        carbonFootprint: 4,
        toxicity: 'very low'
      }
    });

    // Plastic (PVC) properties template
    this.knowledgeBase.set('plastic', {
      physicalProperties: {
        density: 1400,
        hardness: 80,
        elasticity: 3000,
        thermalConductivity: 0.2,
        electricalConductivity: 0,
        magneticProperties: 'non-magnetic',
        porosity: 0,
        surfaceRoughness: 0.8
      },
      mechanicalProperties: {
        tensileStrength: 50,
        compressiveStrength: 60,
        flexuralStrength: 80,
        fatigueResistance: 6,
        impactResistance: 5,
        wearResistance: 6,
        creepResistance: 5
      },
      environmentalProperties: {
        weatherResistance: 7,
        uvResistance: 5,
        moistureResistance: 9,
        temperatureRange: { min: -20, max: 60 },
        fireResistance: 3,
        recyclability: 6,
        carbonFootprint: 3,
        toxicity: 'low'
      }
    });
  }

  private async performVisualAnalysis(imageBitmap: ImageBitmap): Promise<{
    materialType: string;
    confidence: number;
    visualFeatures: any;
  }> {
    const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context not available');

    ctx.drawImage(imageBitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Analyze color patterns
    const colorAnalysis = this.analyzeColors(imageData);
    
    // Analyze texture patterns
    const textureAnalysis = this.analyzeTexture(imageData);
    
    // Analyze surface features
    const surfaceAnalysis = this.analyzeSurface(imageData);
    
    // Determine material type based on visual features
    const materialType = this.classifyMaterial(colorAnalysis, textureAnalysis, surfaceAnalysis);
    
    return {
      materialType: materialType.type,
      confidence: materialType.confidence,
      visualFeatures: {
        color: colorAnalysis,
        texture: textureAnalysis,
        surface: surfaceAnalysis
      }
    };
  }

  private analyzeColors(imageData: ImageData): any {
    const { data, width, height } = imageData;
    const colorStats = {
      brightness: 0,
      contrast: 0,
      dominantColors: [] as string[],
      metallic: 0,
      matte: 0
    };

    let totalBrightness = 0;
    const colorMap = new Map<string, number>();

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      const brightness = (r + g + b) / 3;
      totalBrightness += brightness;
      
      // Quantize color for dominant color detection
      const quantizedColor = `${Math.floor(r / 32) * 32},${Math.floor(g / 32) * 32},${Math.floor(b / 32) * 32}`;
      colorMap.set(quantizedColor, (colorMap.get(quantizedColor) || 0) + 1);
      
      // Detect metallic properties (high contrast, specific color ranges)
      if (brightness > 200 && Math.abs(r - g) < 30 && Math.abs(g - b) < 30) {
        colorStats.metallic++;
      }
    }

    colorStats.brightness = totalBrightness / (data.length / 4);
    
    // Get dominant colors
    const sortedColors = Array.from(colorMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([color]) => color);
    
    colorStats.dominantColors = sortedColors;
    colorStats.metallic = colorStats.metallic / (data.length / 4);
    colorStats.matte = 1 - colorStats.metallic;

    return colorStats;
  }

  private analyzeTexture(imageData: ImageData): any {
    const { data, width, height } = imageData;
    
    // Simple texture analysis using local binary patterns
    let roughness = 0;
    let uniformity = 0;
    let edgeCount = 0;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const centerIdx = (y * width + x) * 4;
        const center = (data[centerIdx] + data[centerIdx + 1] + data[centerIdx + 2]) / 3;
        
        let pattern = 0;
        let variance = 0;
        
        // Check 8 neighbors
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            
            const neighborIdx = ((y + dy) * width + (x + dx)) * 4;
            const neighbor = (data[neighborIdx] + data[neighborIdx + 1] + data[neighborIdx + 2]) / 3;
            
            if (neighbor > center) pattern++;
            variance += Math.abs(neighbor - center);
          }
        }
        
        roughness += variance / 8;
        if (pattern > 4) edgeCount++;
      }
    }

    const pixelCount = (width - 2) * (height - 2);
    
    return {
      roughness: roughness / pixelCount,
      edgeDensity: edgeCount / pixelCount,
      uniformity: 1 - (edgeCount / pixelCount)
    };
  }

  private analyzeSurface(imageData: ImageData): any {
    const { data } = imageData;
    
    let reflection = 0;
    let glossiness = 0;
    let porosity = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      const brightness = (r + g + b) / 3;
      const saturation = Math.max(r, g, b) - Math.min(r, g, b);
      
      // High brightness with low saturation indicates reflection
      if (brightness > 200 && saturation < 30) {
        reflection++;
        glossiness += brightness / 255;
      }
      
      // Dark spots might indicate porosity
      if (brightness < 50) {
        porosity++;
      }
    }

    const pixelCount = data.length / 4;
    
    return {
      reflection: reflection / pixelCount,
      glossiness: glossiness / Math.max(reflection, 1),
      porosity: porosity / pixelCount,
      smoothness: 1 - (porosity / pixelCount)
    };
  }

  private classifyMaterial(colorAnalysis: any, textureAnalysis: any, surfaceAnalysis: any): {
    type: string;
    confidence: number;
  } {
    const features = {
      metallic: surfaceAnalysis.reflection > 0.1 && surfaceAnalysis.glossiness > 0.7,
      rough: textureAnalysis.roughness > 100,
      smooth: surfaceAnalysis.smoothness > 0.8,
      dark: colorAnalysis.brightness < 100,
      bright: colorAnalysis.brightness > 180,
      porous: surfaceAnalysis.porosity > 0.2
    };

    // Classification logic
    if (features.metallic && features.smooth) {
      return { type: 'Steel', confidence: 0.85 };
    } else if (features.rough && features.porous && !features.metallic) {
      return { type: 'Concrete', confidence: 0.80 };
    } else if (features.smooth && !features.metallic && colorAnalysis.brightness > 80) {
      return { type: 'Plastic', confidence: 0.75 };
    } else if (features.rough && features.dark) {
      return { type: 'Wood', confidence: 0.70 };
    } else {
      return { type: 'Unknown', confidence: 0.50 };
    }
  }

  private getDefaultProperties(): Partial<MaterialProperties> {
    return {
      physicalProperties: {
        density: 1500,
        hardness: 100,
        elasticity: 5000,
        thermalConductivity: 0.5,
        electricalConductivity: 0,
        magneticProperties: 'non-magnetic',
        porosity: 10,
        surfaceRoughness: 20
      }
    };
  }

  private enhancePropertiesFromVisual(
    baseProperties: Partial<MaterialProperties>,
    visualAnalysis: any
  ): MaterialProperties {
    const enhanced = JSON.parse(JSON.stringify(baseProperties)) as MaterialProperties;
    
    // Enhance based on visual features
    if (visualAnalysis.visualFeatures.surface.roughness > 100) {
      if (enhanced.physicalProperties) {
        enhanced.physicalProperties.surfaceRoughness *= 1.5;
      }
    }
    
    if (visualAnalysis.visualFeatures.surface.porosity > 0.2) {
      if (enhanced.physicalProperties) {
        enhanced.physicalProperties.porosity = Math.max(
          enhanced.physicalProperties.porosity, 
          visualAnalysis.visualFeatures.surface.porosity * 100
        );
      }
    }

    return this.fillMissingProperties(enhanced);
  }

  private fillMissingProperties(properties: Partial<MaterialProperties>): MaterialProperties {
    return {
      physicalProperties: {
        density: 2000,
        hardness: 150,
        elasticity: 10000,
        thermalConductivity: 1,
        electricalConductivity: 0,
        magneticProperties: 'non-magnetic',
        porosity: 5,
        surfaceRoughness: 10,
        ...properties.physicalProperties
      },
      mechanicalProperties: {
        tensileStrength: 100,
        compressiveStrength: 100,
        flexuralStrength: 100,
        fatigueResistance: 5,
        impactResistance: 5,
        wearResistance: 5,
        creepResistance: 5,
        ...properties.mechanicalProperties
      },
      chemicalProperties: {
        composition: {},
        corrosionResistance: 5,
        chemicalStability: 5,
        oxidationResistance: 5,
        acidResistance: 5,
        alkalineResistance: 5,
        solventResistance: 5,
        ...properties.chemicalProperties
      },
      environmentalProperties: {
        weatherResistance: 5,
        uvResistance: 5,
        moistureResistance: 5,
        temperatureRange: { min: 0, max: 100 },
        fireResistance: 5,
        recyclability: 5,
        carbonFootprint: 5,
        toxicity: 'unknown',
        ...properties.environmentalProperties
      },
      performanceCharacteristics: {
        durability: 5,
        lifecycle: 20,
        maintenanceRequirements: 'standard',
        performanceGrade: 'standard',
        qualityRating: 5,
        costEffectiveness: 5,
        availabilityScore: 5,
        ...properties.performanceCharacteristics
      },
      compliance: {
        standards: [],
        certifications: [],
        regulatoryCompliance: [],
        safetyRatings: [],
        industryGrades: [],
        ...properties.compliance
      }
    };
  }

  private applyAnalysisOptions(
    properties: MaterialProperties,
    options: MaterialAnalysisOptions
  ): MaterialProperties {
    // Apply analysis depth filtering
    if (options.analysisDepth === 'basic') {
      // Only return essential properties
      return {
        ...properties,
        chemicalProperties: {
          ...properties.chemicalProperties,
          composition: {} // Remove detailed composition for basic analysis
        }
      };
    }
    
    return properties;
  }

  private generateRecommendations(
    materialType: string,
    properties: MaterialProperties
  ): AdvancedMaterialAnalysisResult['recommendations'] {
    const recommendations = {
      applications: [] as string[],
      suitableEnvironments: [] as string[],
      incompatibleMaterials: [] as string[],
      maintenanceGuidelines: [] as string[],
      safetyPrecautions: [] as string[]
    };

    // Generate based on material type and properties
    switch (materialType.toLowerCase()) {
      case 'steel':
        recommendations.applications = ['Structural framework', 'Reinforcement', 'Industrial equipment'];
        recommendations.suitableEnvironments = ['Indoor', 'Covered outdoor', 'Industrial'];
        recommendations.incompatibleMaterials = ['Aluminum (galvanic corrosion)', 'Copper'];
        recommendations.maintenanceGuidelines = ['Regular corrosion inspection', 'Protective coating renewal'];
        recommendations.safetyPrecautions = ['Fire safety compliance', 'Proper grounding'];
        break;
        
      case 'concrete':
        recommendations.applications = ['Foundations', 'Structural elements', 'Pavements'];
        recommendations.suitableEnvironments = ['All weather conditions', 'Underground', 'Marine (with treatment)'];
        recommendations.incompatibleMaterials = ['Reactive aggregates', 'Chloride-containing materials'];
        recommendations.maintenanceGuidelines = ['Crack monitoring', 'Surface sealing', 'Freeze-thaw protection'];
        recommendations.safetyPrecautions = ['Proper curing', 'Load capacity adherence'];
        break;
        
      default:
        recommendations.applications = ['General construction', 'Non-critical applications'];
        recommendations.suitableEnvironments = ['Standard indoor conditions'];
        recommendations.maintenanceGuidelines = ['Regular inspection recommended'];
    }

    return recommendations;
  }

  private assessQuality(
    properties: MaterialProperties,
    visualAnalysis: any
  ): AdvancedMaterialAnalysisResult['qualityAssessment'] {
    const scores = {
      mechanical: (properties.mechanicalProperties.tensileStrength / 500) * 10,
      environmental: (properties.environmentalProperties.weatherResistance / 10) * 10,
      durability: (properties.performanceCharacteristics.durability / 10) * 10,
      visual: visualAnalysis.confidence * 10
    };

    const overallScore = Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length;
    
    let grade = 'F';
    if (overallScore >= 9) grade = 'A+';
    else if (overallScore >= 8) grade = 'A';
    else if (overallScore >= 7) grade = 'B';
    else if (overallScore >= 6) grade = 'C';
    else if (overallScore >= 5) grade = 'D';

    return {
      overallGrade: grade,
      strengthAreas: this.identifyStrengths(properties),
      weaknessAreas: this.identifyWeaknesses(properties),
      improvementSuggestions: this.generateImprovementSuggestions(properties, grade)
    };
  }

  private identifyStrengths(properties: MaterialProperties): string[] {
    const strengths = [];
    
    if (properties.mechanicalProperties.tensileStrength > 300) {
      strengths.push('High tensile strength');
    }
    if (properties.chemicalProperties.corrosionResistance > 7) {
      strengths.push('Excellent corrosion resistance');
    }
    if (properties.performanceCharacteristics.durability > 8) {
      strengths.push('Superior durability');
    }
    if (properties.environmentalProperties.recyclability > 8) {
      strengths.push('Highly recyclable');
    }

    return strengths.length > 0 ? strengths : ['Standard performance characteristics'];
  }

  private identifyWeaknesses(properties: MaterialProperties): string[] {
    const weaknesses = [];
    
    if (properties.mechanicalProperties.tensileStrength < 100) {
      weaknesses.push('Low tensile strength');
    }
    if (properties.chemicalProperties.corrosionResistance < 4) {
      weaknesses.push('Poor corrosion resistance');
    }
    if (properties.environmentalProperties.fireResistance < 4) {
      weaknesses.push('Limited fire resistance');
    }
    if (properties.performanceCharacteristics.costEffectiveness < 4) {
      weaknesses.push('High cost relative to performance');
    }

    return weaknesses.length > 0 ? weaknesses : ['No significant weaknesses identified'];
  }

  private generateImprovementSuggestions(
    properties: MaterialProperties,
    grade: string
  ): string[] {
    const suggestions = [];
    
    if (grade < 'B') {
      suggestions.push('Consider material treatment or coating for enhanced performance');
      suggestions.push('Evaluate alternative materials with better properties');
    }
    
    if (properties.chemicalProperties.corrosionResistance < 6) {
      suggestions.push('Apply protective coating to improve corrosion resistance');
    }
    
    if (properties.performanceCharacteristics.lifecycle < 15) {
      suggestions.push('Implement preventive maintenance program to extend lifecycle');
    }

    return suggestions.length > 0 ? suggestions : ['Material meets current requirements'];
  }

  getStatus(): { 
    initialized: boolean; 
    models: Array<{ name: string; initialized: boolean }>;
  } {
    return {
      initialized: this.imageClassifier.isInitialized() && this.textEmbedder.isInitialized(),
      models: [
        this.imageClassifier.getModelInfo(),
        this.textEmbedder.getModelInfo()
      ]
    };
  }
}