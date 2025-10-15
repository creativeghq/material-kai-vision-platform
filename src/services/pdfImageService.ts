/**
 * PDF Image Service
 * 
 * Handles fetching, managing, and processing of images extracted from PDFs
 */

import { supabase } from '@/integrations/supabase/client';
import { PDFImage } from '@/components/PDF/PDFImageGallery';

export interface ImageSearchOptions {
  searchTerm?: string;
  imageType?: string;
  pageNumber?: number;
  minConfidence?: number;
  sortBy?: 'page' | 'confidence' | 'created';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface ImageAnalysisResult {
  id: string;
  analysis_type: string;
  confidence: number;
  result_data: any;
  metadata?: any;
}

export interface ImageWithAnalysis extends PDFImage {
  analysis_results?: ImageAnalysisResult[];
  related_chunks?: Array<{
    id: string;
    content: string;
    page_number: number;
  }>;
}

class PDFImageService {
  /**
   * Get all images for a document
   */
  async getDocumentImages(documentId: string, options: ImageSearchOptions = {}): Promise<PDFImage[]> {
    try {
      let query = supabase
        .from('document_images')
        .select('*')
        .eq('document_id', documentId);

      // Apply filters
      if (options.imageType) {
        query = query.eq('image_type', options.imageType);
      }

      if (options.pageNumber) {
        query = query.eq('page_number', options.pageNumber);
      }

      if (options.minConfidence) {
        query = query.gte('confidence', options.minConfidence);
      }

      // Apply search
      if (options.searchTerm) {
        query = query.or(`caption.ilike.%${options.searchTerm}%,alt_text.ilike.%${options.searchTerm}%`);
      }

      // Apply sorting
      const sortBy = options.sortBy || 'page_number';
      const sortOrder = options.sortOrder || 'asc';
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });

      // Apply pagination
      if (options.limit) {
        query = query.limit(options.limit);
      }
      if (options.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch images: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching document images:', error);
      throw error;
    }
  }

  /**
   * Get a specific image with detailed information
   */
  async getImageDetails(imageId: string): Promise<ImageWithAnalysis | null> {
    try {
      // Get image data
      const { data: imageData, error: imageError } = await supabase
        .from('document_images')
        .select('*')
        .eq('id', imageId)
        .single();

      if (imageError) {
        throw new Error(`Failed to fetch image: ${imageError.message}`);
      }

      if (!imageData) {
        return null;
      }

      // Get analysis results if available
      const { data: analysisData } = await supabase
        .from('image_analysis_results')
        .select('*')
        .eq('image_id', imageId);

      // Get related chunks if available
      const relatedChunks: any[] = [];
      if (imageData.metadata?.associated_chunks) {
        const { data: chunksData } = await supabase
          .from('document_chunks')
          .select('id, content, page_number')
          .in('id', imageData.metadata.associated_chunks);
        
        if (chunksData) {
          relatedChunks.push(...chunksData);
        }
      }

      return {
        ...imageData,
        analysis_results: analysisData || [],
        related_chunks: relatedChunks,
      };
    } catch (error) {
      console.error('Error fetching image details:', error);
      throw error;
    }
  }

  /**
   * Get image statistics for a document
   */
  async getImageStatistics(documentId: string): Promise<{
    total: number;
    byType: Record<string, number>;
    byPage: Record<number, number>;
    averageConfidence: number;
    totalSize: number;
  }> {
    try {
      const images = await this.getDocumentImages(documentId);

      const stats = {
        total: images.length,
        byType: {} as Record<string, number>,
        byPage: {} as Record<number, number>,
        averageConfidence: 0,
        totalSize: 0,
      };

      let totalConfidence = 0;

      images.forEach(image => {
        // Count by type
        stats.byType[image.image_type] = (stats.byType[image.image_type] || 0) + 1;

        // Count by page
        stats.byPage[image.page_number] = (stats.byPage[image.page_number] || 0) + 1;

        // Sum confidence
        totalConfidence += image.confidence;

        // Sum size
        if (image.metadata?.size_bytes) {
          stats.totalSize += image.metadata.size_bytes;
        }
      });

      stats.averageConfidence = images.length > 0 ? totalConfidence / images.length : 0;

      return stats;
    } catch (error) {
      console.error('Error calculating image statistics:', error);
      throw error;
    }
  }

  /**
   * Download image
   */
  async downloadImage(image: PDFImage): Promise<void> {
    try {
      const response = await fetch(image.image_url);
      if (!response.ok) {
        throw new Error('Failed to download image');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = image.metadata?.filename || `image_${image.id}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading image:', error);
      throw error;
    }
  }

  /**
   * Download all images for a document as ZIP
   */
  async downloadAllImages(documentId: string): Promise<void> {
    try {
      // Call MIVAA service to generate ZIP
      const { data, error } = await supabase.functions.invoke('mivaa-gateway', {
        body: {
          action: 'download_images',
          payload: { document_id: documentId }
        }
      });

      if (error) {
        throw new Error(`Failed to download images: ${error.message}`);
      }

      if (data?.download_url) {
        // Download the ZIP file
        const link = document.createElement('a');
        link.href = data.download_url;
        link.download = `document_${documentId}_images.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        throw new Error('No download URL provided');
      }
    } catch (error) {
      console.error('Error downloading all images:', error);
      throw error;
    }
  }

  /**
   * Update image metadata
   */
  async updateImageMetadata(
    imageId: string, 
    updates: Partial<Pick<PDFImage, 'caption' | 'alt_text' | 'image_type'>>
  ): Promise<PDFImage> {
    try {
      const { data, error } = await supabase
        .from('document_images')
        .update(updates)
        .eq('id', imageId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update image: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('Error updating image metadata:', error);
      throw error;
    }
  }

  /**
   * Delete image
   */
  async deleteImage(imageId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('document_images')
        .delete()
        .eq('id', imageId);

      if (error) {
        throw new Error(`Failed to delete image: ${error.message}`);
      }
    } catch (error) {
      console.error('Error deleting image:', error);
      throw error;
    }
  }

  /**
   * Get images by page number
   */
  async getImagesByPage(documentId: string, pageNumber: number): Promise<PDFImage[]> {
    return this.getDocumentImages(documentId, { pageNumber });
  }

  /**
   * Search images across all documents (for admin/global search)
   */
  async searchAllImages(options: ImageSearchOptions & { workspaceId?: string }): Promise<PDFImage[]> {
    try {
      let query = supabase
        .from('document_images')
        .select(`
          *,
          documents!inner(
            id,
            title,
            filename
          )
        `);

      // Apply workspace filter if provided
      if (options.workspaceId) {
        query = query.eq('documents.workspace_id', options.workspaceId);
      }

      // Apply other filters
      if (options.imageType) {
        query = query.eq('image_type', options.imageType);
      }

      if (options.minConfidence) {
        query = query.gte('confidence', options.minConfidence);
      }

      // Apply search
      if (options.searchTerm) {
        query = query.or(`caption.ilike.%${options.searchTerm}%,alt_text.ilike.%${options.searchTerm}%`);
      }

      // Apply sorting
      const sortBy = options.sortBy || 'created_at';
      const sortOrder = options.sortOrder || 'desc';
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });

      // Apply pagination
      if (options.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Failed to search images: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error('Error searching images:', error);
      throw error;
    }
  }

  /**
   * Get unique image types across all documents
   */
  async getImageTypes(documentId?: string): Promise<string[]> {
    try {
      let query = supabase
        .from('document_images')
        .select('image_type');

      if (documentId) {
        query = query.eq('document_id', documentId);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch image types: ${error.message}`);
      }

      const types = new Set(data?.map(item => item.image_type) || []);
      return Array.from(types).sort();
    } catch (error) {
      console.error('Error fetching image types:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const pdfImageService = new PDFImageService();
export default pdfImageService;
