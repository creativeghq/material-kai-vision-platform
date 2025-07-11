import { supabase } from '@/integrations/supabase/client';
import type { 
  Material, 
  RecognitionResult, 
  RecognitionRequest, 
  RecognitionResponse,
  UploadedFile,
  ProcessingJob
} from '@/types/materials';

// Helper function to map database response to our types
function mapToMaterial(dbMaterial: any): Material {
  return {
    ...dbMaterial,
    metadata: {
      color: '',
      finish: '',
      brand: '',
      properties: dbMaterial.properties || {}
    },
    createdAt: new Date(dbMaterial.created_at),
    updatedAt: new Date(dbMaterial.updated_at)
  };
}

function mapToRecognitionResult(dbResult: any): RecognitionResult {
  return {
    ...dbResult,
    // Legacy properties for backward compatibility
    materialId: dbResult.material_id || '',
    name: dbResult.material?.name || 'Unknown Material',
    confidence: dbResult.confidence_score,
    imageUrl: '',
    metadata: {
      color: '',
      finish: '',
      brand: '',
      properties: dbResult.properties_detected || {}
    },
    processingTime: dbResult.processing_time_ms || 0,
  };
}

function mapToUploadedFile(dbFile: any): UploadedFile {
  return {
    ...dbFile,
    file_type: dbFile.file_type as 'image' | 'document' | '3d_model'
  };
}

function mapToProcessingJob(dbJob: any): ProcessingJob {
  return {
    ...dbJob,
    job_type: dbJob.job_type as 'recognition' | '3d_reconstruction' | 'batch_analysis'
  };
}

export class MaterialRecognitionAPI {
  // Upload files to storage
  static async uploadFiles(files: File[], userId: string): Promise<UploadedFile[]> {
    const uploadedFiles: UploadedFile[] = [];
    
    for (const file of files) {
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('material-images')
        .upload(fileName, file);

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Store file metadata in database
      const { data: fileRecord, error: dbError } = await supabase
        .from('uploaded_files')
        .insert({
          user_id: userId,
          file_name: file.name,
          file_type: file.type.startsWith('image/') ? 'image' : 'document',
          file_size: file.size,
          storage_path: uploadData.path,
          metadata: {
            original_name: file.name,
            mime_type: file.type,
            uploaded_at: new Date().toISOString()
          }
        })
        .select()
        .single();

      if (dbError) {
        throw new Error(`Database error: ${dbError.message}`);
      }

      uploadedFiles.push(mapToUploadedFile(fileRecord));
    }

    return uploadedFiles;
  }

  // Get public URL for uploaded file
  static getFileUrl(storagePath: string): string {
    const { data } = supabase.storage
      .from('material-images')
      .getPublicUrl(storagePath);
    
    return data.publicUrl;
  }

  // Start material recognition process
  static async recognizeMaterials(request: RecognitionRequest, userId: string): Promise<ProcessingJob> {
    try {
      // First upload the files
      const uploadedFiles = await this.uploadFiles(request.files, userId);
      
      // Create processing job
      const { data: job, error } = await supabase
        .from('processing_queue')
        .insert({
          user_id: userId,
          job_type: 'recognition',
          input_data: {
            file_ids: uploadedFiles.map(f => f.id),
            options: request.options
          },
          status: 'pending',
          priority: 5
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create recognition job: ${error.message}`);
      }

      // Trigger hybrid recognition process via edge function
      const { data: processResult, error: processError } = await supabase.functions
        .invoke('hybrid-material-analysis', {
          body: {
            file_id: uploadedFiles[0].id, // Use first file for single analysis
            analysis_type: request.options?.extract_properties ? 'properties_only' : 'comprehensive',
            include_similar: request.options?.include_similar_materials || false,
            minimum_score: 0.7,
            max_retries: 2
          }
        });

      if (processError) {
        console.error('Hybrid recognition process error:', processError);
        // Update job status to failed
        await supabase
          .from('processing_queue')
          .update({ 
            status: 'failed', 
            error_message: processError.message,
            completed_at: new Date().toISOString()
          })
          .eq('id', job.id);
        
        throw new Error(`Hybrid recognition failed: ${processError.message}`);
      }

      return mapToProcessingJob(job);
    } catch (error) {
      console.error('Material recognition error:', error);
      throw error;
    }
  }

  // Get recognition results for a job
  static async getRecognitionResults(jobId: string): Promise<RecognitionResult[]> {
    // First get the job to extract file IDs
    const { data: job, error: jobError } = await supabase
      .from('processing_queue')
      .select('input_data')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      throw new Error(`Failed to fetch job: ${jobError?.message}`);
    }

    const fileIds = (job.input_data as any)?.file_ids || [];
    
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return [];
    }

    const { data, error } = await supabase
      .from('recognition_results')
      .select(`
        *,
        material:materials_catalog(*)
      `)
      .in('file_id', fileIds);

    if (error) {
      throw new Error(`Failed to fetch results: ${error.message}`);
    }

    return (data || []).map(mapToRecognitionResult);
  }

  // Get all materials catalog
  static async getMaterialsCatalog(category?: string): Promise<Material[]> {
    let query = supabase
      .from('materials_catalog')
      .select('*')
      .order('name');

    if (category && category !== 'all') {
      query = query.eq('category', category as any);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch materials: ${error.message}`);
    }

    return (data || []).map(mapToMaterial);
  }

  // Search materials using vector similarity
  static async searchMaterials(query: string, limit = 10): Promise<Material[]> {
    // For now, use simple text search - will enhance with vector search later
    const { data, error } = await supabase
      .from('materials_catalog')
      .select('*')
      .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
      .limit(limit);

    if (error) {
      throw new Error(`Search failed: ${error.message}`);
    }

    return (data || []).map(mapToMaterial);
  }

  // Get processing job status
  static async getJobStatus(jobId: string): Promise<ProcessingJob> {
    const { data, error } = await supabase
      .from('processing_queue')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error) {
      throw new Error(`Failed to fetch job status: ${error.message}`);
    }

    return mapToProcessingJob(data);
  }

  // Verify recognition result
  static async verifyResult(resultId: string, isCorrect: boolean, userId: string): Promise<void> {
    const { error } = await supabase
      .from('recognition_results')
      .update({
        user_verified: isCorrect,
        verified_at: new Date().toISOString(),
        verified_by: userId
      })
      .eq('id', resultId);

    if (error) {
      throw new Error(`Failed to verify result: ${error.message}`);
    }

    // Log analytics event
    await supabase
      .from('analytics_events')
      .insert({
        user_id: userId,
        event_type: 'user_feedback',
        event_data: {
          result_id: resultId,
          feedback: isCorrect ? 'correct' : 'incorrect'
        }
      });
  }

  // Get user's recent results
  static async getUserResults(userId: string, limit = 20): Promise<RecognitionResult[]> {
    const { data, error } = await supabase
      .from('recognition_results')
      .select(`
        *,
        material:materials_catalog(*),
        uploaded_file:uploaded_files(*)
      `)
      .eq('uploaded_file.user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch user results: ${error.message}`);
    }

    return (data || []).map(mapToRecognitionResult);
  }
}