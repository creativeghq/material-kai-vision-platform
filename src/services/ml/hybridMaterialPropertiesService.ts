import { MLResult } from './types';
import { MaterialAnalyzerService, MaterialAnalysisOptions, AdvancedMaterialAnalysisResult } from './materialAnalyzer';
import { ServerMLService } from './serverMLService';

export class HybridMaterialPropertiesService {
  private clientAnalyzer = new MaterialAnalyzerService();
  private serverML = new ServerMLService();

  async analyzeAdvancedProperties(
    imageFile: File,
    options: MaterialAnalysisOptions = { analysisDepth: 'standard', focusAreas: [] }
  ): Promise<MLResult> {
    const startTime = performance.now();

    try {
      // Determine processing strategy
      const useServer = this.shouldUseServerAnalysis(options, imageFile);
      
      if (useServer) {
        console.log('Using server-side advanced material properties analysis');
        return await this.serverML.analyzeAdvancedMaterialProperties(imageFile, options);
      } else {
        console.log('Using client-side advanced material properties analysis');
        return await this.clientAnalyzer.analyzeAdvancedProperties(imageFile, options);
      }

    } catch (error) {
      console.error('Hybrid material properties analysis failed:', error);
      
      // Fallback to basic client analysis
      try {
        console.log('Falling back to basic client analysis');
        return await this.clientAnalyzer.analyzeAdvancedProperties(imageFile, {
          ...options,
          analysisDepth: 'basic'
        });
      } catch (fallbackError) {
        return {
          success: false,
          error: 'All material properties analysis methods failed',
          processingTime: performance.now() - startTime
        };
      }
    }
  }

  private shouldUseServerAnalysis(options: MaterialAnalysisOptions, file: File): boolean {
    // Use server for comprehensive analysis
    if (options.analysisDepth === 'comprehensive') {
      return true;
    }

    // Use server for specialized focus areas
    if (options.focusAreas?.some(area => 
      ['chemical-composition', 'compliance-standards', 'environmental-impact'].includes(area)
    )) {
      return true;
    }

    // Use server for large files (better processing power)
    if (file.size > 5 * 1024 * 1024) { // 5MB
      return true;
    }

    // Default to client for standard analysis
    return false;
  }

  getStatus(): { clientSupported: boolean; serverAvailable: boolean; features: string[] } {
    const clientStatus = this.clientAnalyzer.getStatus();
    
    return {
      clientSupported: clientStatus.initialized,
      serverAvailable: true, // Assuming server is available
      features: [
        'Advanced Material Properties',
        'Physical Characteristics',
        'Mechanical Properties', 
        'Chemical Analysis',
        'Environmental Assessment',
        'Performance Evaluation',
        'Quality Grading',
        'Compliance Standards',
        'Hybrid Processing'
      ]
    };
  }
}

export const hybridMaterialPropertiesService = new HybridMaterialPropertiesService();