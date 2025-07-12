import { supabase } from '@/integrations/supabase/client';
import { hybridMLService } from './ml/hybridMLService';
import type { RecognitionResult } from '@/types/materials';

export interface WorkflowEnhancement {
  ocrExtraction?: {
    extractedText: string;
    specifications: string[];
    confidence: number;
  };
  svbrdfMaps?: {
    albedoMapUrl: string;
    normalMapUrl: string;
    roughnessMapUrl: string;
    metallicMapUrl: string;
    extractionQuality: number;
  };
  nerfReconstruction?: {
    reconstructionId: string;
    modelFileUrl: string;
    meshFileUrl: string;
    qualityScore: number;
  };
  ragKnowledge?: {
    relatedKnowledge: Array<{
      title: string;
      content: string;
      relevanceScore: number;
    }>;
    aiContext?: string;
  };
}

/**
 * Integrated Workflow Service - Connects all AI/ML services in a unified workflow
 */
export class IntegratedWorkflowService {
  
  /**
   * Enhanced Material Recognition Workflow
   * Combines recognition, OCR, SVBRDF extraction, and knowledge search
   */
  async enhancedMaterialRecognition(files: File[]): Promise<{
    recognitionResults: RecognitionResult[];
    enhancements: Record<string, WorkflowEnhancement>;
  }> {
    // Step 1: Primary recognition using hybrid ML
    const recognitionResults = await this.performHybridRecognition(files);
    
    // Step 2: Parallel enhancement processing
    const enhancements: Record<string, WorkflowEnhancement> = {};
    
    const enhancementPromises = recognitionResults.map(async (result, index) => {
      const file = files[index];
      const resultId = result.id;
      
      // Initialize enhancement object
      enhancements[resultId] = {};
      
      // OCR extraction for all materials
      const ocrPromise = this.performOCRExtraction(file, result.name)
        .then(ocr => { if (ocr) enhancements[resultId].ocrExtraction = ocr; })
        .catch(err => console.warn('OCR failed:', err));
      
      // SVBRDF extraction for high-confidence materials
      const svbrdfPromise = result.confidence > 0.8 
        ? this.performSVBRDFExtraction(file, result.name)
          .then(svbrdf => { if (svbrdf) enhancements[resultId].svbrdfMaps = svbrdf; })
          .catch(err => console.warn('SVBRDF failed:', err))
        : Promise.resolve();
      
      // Knowledge search for material context
      const knowledgePromise = this.searchMaterialKnowledge(result.name)
        .then(knowledge => { if (knowledge) enhancements[resultId].ragKnowledge = knowledge; })
        .catch(err => console.warn('Knowledge search failed:', err));
      
      return Promise.allSettled([ocrPromise, svbrdfPromise, knowledgePromise]);
    });
    
    await Promise.allSettled(enhancementPromises);
    
    return { recognitionResults, enhancements };
  }
  
  /**
   * Enhanced 3D Generation Workflow
   * Combines 3D generation with NeRF reconstruction and material mapping
   */
  async enhanced3DGeneration(prompt: string, options: {
    roomType?: string;
    style?: string;
    materialIds?: string[];
  }): Promise<{
    generationResult: any;
    enhancements: WorkflowEnhancement;
  }> {
    // Step 1: Generate 3D design
    const { data: generationResult, error } = await supabase.functions.invoke('crewai-3d-generation', {
      body: {
        prompt,
        room_type: options.roomType,
        style: options.style,
        material_ids: options.materialIds
      }
    });
    
    if (error) throw error;
    
    // Step 2: NeRF reconstruction if images are generated
    const enhancements: WorkflowEnhancement = {};
    
    if (generationResult.image_urls && generationResult.image_urls.length > 0) {
      try {
        const nerfResult = await this.performNeRFReconstruction(
          generationResult.image_urls,
          generationResult.matched_materials || []
        );
        if (nerfResult) {
          enhancements.nerfReconstruction = nerfResult;
        }
      } catch (error) {
        console.warn('NeRF reconstruction failed:', error);
      }
    }
    
    return { generationResult, enhancements };
  }
  
  /**
   * Enhanced Knowledge Search with Multi-Modal RAG
   */
  async enhancedKnowledgeSearch(query: string, context?: {
    materials?: string[];
    images?: File[];
    includeContext?: boolean;
  }): Promise<{
    searchResults: any[];
    aiContext?: string;
    visualAnalysis?: any[];
  }> {
    const searchPromises = [];
    
    // Text-based RAG search
    const textSearchPromise = supabase.functions.invoke('enhanced-rag-search', {
      body: {
        query,
        search_type: 'hybrid',
        match_count: 10,
        include_context: context?.includeContext || false,
        material_filter: context?.materials
      }
    });
    
    searchPromises.push(textSearchPromise);
    
    // Visual analysis if images provided
    let visualAnalysisPromise = Promise.resolve({ data: null });
    if (context?.images && context.images.length > 0) {
      visualAnalysisPromise = this.analyzeImagesForKnowledge(context.images, query);
    }
    
    searchPromises.push(visualAnalysisPromise);
    
    const [textSearchResult, visualAnalysisResult] = await Promise.allSettled(searchPromises);
    
    const searchResults = textSearchResult.status === 'fulfilled' 
      ? textSearchResult.value.data?.results || []
      : [];
    
    const aiContext = textSearchResult.status === 'fulfilled'
      ? textSearchResult.value.data?.context
      : undefined;
    
    const visualAnalysis = visualAnalysisResult.status === 'fulfilled'
      ? visualAnalysisResult.value.data
      : [];
    
    return { searchResults, aiContext, visualAnalysis };
  }
  
  // Private helper methods
  
  private async performHybridRecognition(files: File[]): Promise<RecognitionResult[]> {
    const mlResult = await hybridMLService.analyzeMaterials(files);
    
    if (!mlResult.success || !mlResult.data) {
      throw new Error('Material recognition failed');
    }
    
    // Convert ML results to RecognitionResult format
    return files.map((file, i) => {
      const analysisData = Array.isArray(mlResult.data) ? mlResult.data[i] : mlResult.data;
      const materialData = analysisData?.combined || analysisData || {};
      
      return {
        id: `hybrid-${Date.now()}-${i}`,
        file_id: `file-${Date.now()}-${i}`,
        material_id: materialData.materialType || 'unknown',
        confidence_score: materialData.confidence || 0,
        detection_method: 'combined' as const,
        ai_model_version: `${mlResult.processingMethod}-v1.0`,
        properties_detected: materialData,
        processing_time_ms: mlResult.processingTime || 0,
        user_verified: false,
        created_at: new Date().toISOString(),
        
        // Legacy properties
        materialId: materialData.materialType || 'unknown',
        name: materialData.classification || 'Unknown Material',
        confidence: materialData.confidence || 0,
        imageUrl: URL.createObjectURL(file),
        metadata: { properties: materialData },
        processingTime: mlResult.processingTime || 0
      };
    });
  }
  
  private async performOCRExtraction(file: File, materialContext: string): Promise<WorkflowEnhancement['ocrExtraction'] | null> {
    try {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      
      const { data, error } = await supabase.functions.invoke('ocr-processing', {
        body: {
          image: base64.split(',')[1],
          documentType: 'label',
          materialContext,
          extractStructuredData: true
        }
      });
      
      if (error || !data?.success) return null;
      
      return {
        extractedText: data.extractedText || '',
        specifications: data.structuredData?.specifications || [],
        confidence: data.confidence || 0
      };
    } catch (error) {
      console.error('OCR extraction failed:', error);
      return null;
    }
  }
  
  private async performSVBRDFExtraction(file: File, materialType: string): Promise<WorkflowEnhancement['svbrdfMaps'] | null> {
    try {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      
      const { data, error } = await supabase.functions.invoke('svbrdf-extractor', {
        body: {
          sourceImage: base64.split(',')[1],
          materialType,
          extractionQuality: 'high',
          generateMaps: ['albedo', 'normal', 'roughness', 'metallic']
        }
      });
      
      if (error || !data?.success) return null;
      
      return {
        albedoMapUrl: data.extractedMaps?.albedo || '',
        normalMapUrl: data.extractedMaps?.normal || '',
        roughnessMapUrl: data.extractedMaps?.roughness || '',
        metallicMapUrl: data.extractedMaps?.metallic || '',
        extractionQuality: data.qualityScore || 0
      };
    } catch (error) {
      console.error('SVBRDF extraction failed:', error);
      return null;
    }
  }
  
  private async performNeRFReconstruction(
    imageUrls: string[], 
    materialMapping: any[]
  ): Promise<WorkflowEnhancement['nerfReconstruction'] | null> {
    try {
      const { data, error } = await supabase.functions.invoke('nerf-processor', {
        body: {
          sourceImageUrls: imageUrls,
          reconstructionQuality: 'medium',
          generateMesh: true,
          materialMapping
        }
      });
      
      if (error || !data?.success) return null;
      
      return {
        reconstructionId: data.reconstructionId,
        modelFileUrl: data.modelFileUrl || '',
        meshFileUrl: data.meshFileUrl || '',
        qualityScore: data.qualityScore || 0
      };
    } catch (error) {
      console.error('NeRF reconstruction failed:', error);
      return null;
    }
  }
  
  private async searchMaterialKnowledge(materialName: string): Promise<WorkflowEnhancement['ragKnowledge'] | null> {
    try {
      const { data, error } = await supabase.functions.invoke('enhanced-rag-search', {
        body: {
          query: `Material properties and information about ${materialName}`,
          search_type: 'hybrid',
          match_count: 5,
          include_context: true
        }
      });
      
      if (error || !data?.success) return null;
      
      return {
        relatedKnowledge: (data.results || []).map((result: any) => ({
          title: result.title,
          content: result.content,
          relevanceScore: result.similarity_score
        })),
        aiContext: data.context
      };
    } catch (error) {
      console.error('Knowledge search failed:', error);
      return null;
    }
  }
  
  private async analyzeImagesForKnowledge(images: File[], query: string): Promise<{ data: any[] }> {
    try {
      const analysisPromises = images.map(async (image) => {
        const result = await hybridMLService.analyzeImage(image, {
          analysisType: 'comprehensive',
          includeContext: true
        });
        
        return {
          imageAnalysis: result.data,
          relevanceToQuery: this.calculateRelevance(result.data, query)
        };
      });
      
      const results = await Promise.allSettled(analysisPromises);
      return {
        data: results
          .filter(r => r.status === 'fulfilled')
          .map(r => (r as PromiseFulfilledResult<any>).value)
      };
    } catch (error) {
      console.error('Visual analysis failed:', error);
      return { data: [] };
    }
  }
  
  private calculateRelevance(analysisData: any, query: string): number {
    // Simple relevance calculation - can be enhanced with embeddings
    const queryWords = query.toLowerCase().split(' ');
    const analysisText = JSON.stringify(analysisData).toLowerCase();
    
    const matches = queryWords.filter(word => analysisText.includes(word));
    return matches.length / queryWords.length;
  }
}

export const integratedWorkflowService = new IntegratedWorkflowService();