import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PDFUploadOptions {
  extractMaterials?: boolean;
  language?: string;
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
   * Upload and process PDF file with simplified extraction
   */
  static async uploadAndProcess(
    file: File, 
    options: PDFUploadOptions = {}
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
      
      const { data: uploadData, error: uploadError } = await supabase.storage
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

      // Process PDF using simplified processor
      const { data: processingData, error: processingError } = await supabase.functions.invoke('pdf-processor', {
        body: {
          fileUrl: publicUrl,
          originalFilename: file.name,
          fileSize: file.size,
          userId: user.id,
          options
        }
      });

      if (processingError) {
        throw new Error(`Processing failed: ${processingError.message}`);
      }

      toast.success('PDF processed successfully!');
      return processingData as PDFProcessingResult;

    } catch (error) {
      console.error('PDF upload and processing error:', error);
      toast.error(`Processing failed: ${error.message}`);
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
        .from('pdf_processing_results')
        .select(`
          id,
          original_filename,
          processing_status,
          document_classification,
          materials_identified_count,
          confidence_score_avg,
          created_at
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return (data || []).map(item => ({
        id: item.id,
        originalFilename: item.original_filename,
        processingStatus: item.processing_status,
        materialCategories: (item.document_classification as any)?.material_categories || [],
        materialsDetected: item.materials_identified_count || 0,
        confidence: item.confidence_score_avg || 0,
        createdAt: item.created_at
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
        .from('pdf_processing_results')
        .select('*')
        .eq('id', processingId)
        .eq('user_id', user.id)
        .single();

      if (error) {
        throw error;
      }

      // Also get the associated knowledge base entry
      const { data: knowledgeData, error: knowledgeError } = await supabase
        .from('enhanced_knowledge_base')
        .select('*')
        .ilike('title', `%${data.original_filename}%`)
        .eq('created_by', user.id)
        .single();

      return {
        processing: data,
        knowledge: knowledgeData || null
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
        .from('pdf_processing_results')
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
        .from('pdf_processing_results')
        .select('*')
        .eq('user_id', user.id);

      if (error) {
        throw error;
      }

      const totalPDFs = data.length;
      const successfulProcessing = data.filter(p => p.processing_status === 'completed').length;
      const averageConfidence = data.reduce((sum, p) => sum + (p.confidence_score_avg || 0), 0) / totalPDFs || 0;
      const totalMaterials = data.reduce((sum, p) => sum + (p.materials_identified_count || 0), 0);
      const recentActivity = data
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5);

      return {
        totalPDFs,
        successfulProcessing,
        averageConfidence: Math.round(averageConfidence * 100) / 100,
        totalMaterials,
        recentActivity
      };

    } catch (error) {
      console.error('Error fetching processing stats:', error);
      throw error;
    }
  }
}

export const pdfContentService = PDFContentService;