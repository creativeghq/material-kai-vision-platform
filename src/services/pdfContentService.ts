import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';

import { ConsolidatedPDFWorkflowService, ConsolidatedProcessingOptions } from './consolidatedPDFWorkflowService';

export interface PDFUploadOptions {
  extractMaterials?: boolean;
  language?: string;
  useMivaaProcessing?: boolean; // New flag to enable MIVAA processing
  chunkSize?: number;
  overlap?: number;
  preserveLayout?: boolean;
  includeImages?: boolean;
  generateEmbeddings?: boolean;
  enableSemanticAnalysis?: boolean;
}

export interface PDFProcessingResult {
  success: boolean;
  processingId: string;
  knowledgeEntryId?: string;
  materialCategories: string[];
  materialsDetected: number;
  processingTimeMs: number;
  confidence: number;
  extractedContent: {
    textLength: number;
    categories: string[];
    keyMaterials: string[];
    applications: string[];
    standards: string[];
  };
  message: string;
  // Enhanced MIVAA-specific fields
  workflowJobId?: string;
  mivaaProcessingResult?: any;
  embeddingsGenerated?: number;
  chunksCreated?: number;
}

export interface PDFContentEntry {
  id: string;
  originalFilename: string;
  processingStatus: string;
  materialCategories: string[];
  materialsDetected: number;
  confidence: number;
  createdAt: string;
  knowledgeEntryId?: string;
}

export class PDFContentService {
  /**
   * Upload and process PDF file with MIVAA integration
   */
  static async uploadAndProcess(
    file: File,
    options: PDFUploadOptions = {},
  ): Promise<PDFProcessingResult> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User must be authenticated to upload PDFs');
      }

      toast.info('Uploading PDF file...');

      // Upload file to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('pdf-documents')
        .upload(fileName, file);

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('pdf-documents')
        .getPublicUrl(fileName);

      toast.info('Processing PDF content...');

      // Use MIVAA processing by default or when explicitly enabled
      const useMivaaProcessing = options.useMivaaProcessing !== false; // Default to true

      if (useMivaaProcessing) {
        // Use consolidated MIVAA workflow service
        const consolidatedOptions: ConsolidatedProcessingOptions = {
          extractMaterials: options.extractMaterials ?? true,
          language: options.language ?? 'en',
          chunkSize: options.chunkSize ?? 1000,
          overlap: options.overlap ?? 200,
          preserveLayout: options.preserveLayout ?? true,
          includeImages: options.includeImages ?? true,
          generateEmbeddings: options.generateEmbeddings ?? true,
          enableSemanticAnalysis: options.enableSemanticAnalysis ?? true,
          useMivaaProcessing: true, // Always use MIVAA for processing


        };

        const workflowService = new ConsolidatedPDFWorkflowService();
        const jobId = await workflowService.startPDFProcessing(file, consolidatedOptions);

        toast.success('PDF processing started with MIVAA!');

        return {
          success: true,
          processingId: jobId,
          knowledgeEntryId: jobId, // Use jobId as temporary identifier
          materialCategories: [],
          materialsDetected: 0,
          processingTimeMs: 0,
          confidence: 0,
          extractedContent: {
            textLength: 0,
            categories: [],
            keyMaterials: [],
            applications: [],
            standards: [],
          },
          message: 'PDF processing started successfully with MIVAA workflow',
          workflowJobId: jobId,
          mivaaProcessingResult: null,
          embeddingsGenerated: 0,
          chunksCreated: 0,
        };
      } else {
        // Fallback to basic processing for legacy support
        const { data: processingData, error: processingError } = await supabase.functions.invoke('pdf-processor', {
          body: {
            fileUrl: publicUrl,
            originalFilename: file.name,
            fileSize: file.size,
            userId: user.id,
            options,
          },
        });

        if (processingError) {
          throw new Error(`Processing failed: ${processingError.message}`);
        }

        toast.success('PDF processed successfully!');
        return processingData as PDFProcessingResult;
      }

    } catch (error) {
      console.error('PDF upload and processing error:', error);
      toast.error(`Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Get all processed PDFs for current user
   */
  static async getUserPDFs(): Promise<PDFContentEntry[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('document_processing_status')
        .select(`
          id,
          document_id,
          status,
          metadata,
          created_at,
          updated_at
        `)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return (data || []).map(item => ({
        id: item.id,
        originalFilename: (item.metadata as any)?.original_filename || 'Unknown',
        processingStatus: item.status || 'unknown',
        materialCategories: (item.metadata as any)?.material_categories || [],
        materialsDetected: (item.metadata as any)?.materials_identified_count || 0,
        confidence: (item.metadata as any)?.confidence_score_avg || 0,
        createdAt: item.created_at || new Date().toISOString(),
      }));

    } catch (error) {
      console.error('Error fetching user PDFs:', error);
      throw error;
    }
  }

  /**
   * Get detailed information about a specific PDF
   */
  static async getPDFDetails(processingId: string): Promise<any> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('document_processing_status')
        .select('*')
        .eq('id', processingId)
        .eq('user_id', user.id)
        .single();

      if (error) {
        throw error;
      }

      // Also get the associated knowledge base entry
      const { data: knowledgeData } = await supabase
        .from('enhanced_knowledge_base')
        .select('*')
        .ilike('title', `%${(data.metadata as any)?.original_filename || 'Unknown'}%`)
        .eq('created_by', user.id)
        .single();

      return {
        processing: data,
        knowledge: knowledgeData || null,
      };

    } catch (error) {
      console.error('Error fetching PDF details:', error);
      throw error;
    }
  }

  /**
   * Delete a processed PDF and its knowledge base entry
   */
  static async deletePDF(processingId: string): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Get PDF details first
      const details = await this.getPDFDetails(processingId);

      // Delete from knowledge base if exists
      if (details.knowledge) {
        const { error: kbDeleteError } = await supabase
          .from('enhanced_knowledge_base')
          .delete()
          .eq('id', details.knowledge.id);

        if (kbDeleteError) {
          console.error('Error deleting knowledge base entry:', kbDeleteError);
        }
      }

      // Delete processing record
      const { error: processDeleteError } = await supabase
        .from('document_processing_status')
        .delete()
        .eq('id', processingId)
        .eq('user_id', user.id);

      if (processDeleteError) {
        throw processDeleteError;
      }

      // Delete file from storage
      if (details.processing.file_url) {
        const fileName = details.processing.file_url.split('/').pop();
        if (fileName) {
          await supabase.storage
            .from('pdf-documents')
            .remove([fileName]);
        }
      }

      toast.success('PDF deleted successfully');

    } catch (error) {
      console.error('Error deleting PDF:', error);
      toast.error('Failed to delete PDF');
      throw error;
    }
  }

  /**
   * Search within processed PDFs
   */
  static async searchPDFContent(query: string, limit = 10): Promise<any[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Search in enhanced knowledge base for PDF content
      const { data, error } = await supabase
        .from('enhanced_knowledge_base')
        .select('*')
        .eq('created_by', user.id)
        .eq('content_type', 'pdf_document')
        .or(`title.ilike.%${query}%,content.ilike.%${query}%,search_keywords.cs.{${query}}`)
        .limit(limit);

      if (error) {
        throw error;
      }

      return data || [];

    } catch (error) {
      console.error('Error searching PDF content:', error);
      throw error;
    }
  }

  /**
   * Get processing statistics
   */
  static async getProcessingStats(): Promise<{
    totalPDFs: number;
    successfulProcessing: number;
    averageConfidence: number;
    totalMaterials: number;
    recentActivity: any[];
  }> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('document_processing_status')
        .select('*')
        .eq('user_id', user.id);

      if (error) {
        throw error;
      }

      const totalPDFs = data.length;
      const successfulProcessing = data.filter(p => p.status === 'completed').length;
      const averageConfidence = data.reduce((sum, p) => sum + ((p.metadata as any)?.confidence_score_avg || 0), 0) / totalPDFs || 0;
      const totalMaterials = data.reduce((sum, p) => sum + ((p.metadata as any)?.materials_identified_count || 0), 0);
      const recentActivity = data
        .sort((a, b) => new Date(b.created_at || new Date().toISOString()).getTime() - new Date(a.created_at || new Date().toISOString()).getTime())
        .slice(0, 5);

      return {
        totalPDFs,
        successfulProcessing,
        averageConfidence: Math.round(averageConfidence * 100) / 100,
        totalMaterials,
        recentActivity,
      };

    } catch (error) {
      console.error('Error fetching processing stats:', error);
      throw error;
    }
  }
}

export const pdfContentService = PDFContentService;
