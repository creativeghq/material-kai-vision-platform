import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ServerMLRequest {
  file_ids: string[];
  options: {
    detection_methods: string[];
    confidence_threshold: number;
    include_similar_materials: boolean;
    extract_properties: boolean;
    use_ai_vision?: boolean;
  };
}

export interface ServerMLResult {
  success: boolean;
  job_id?: string;
  results?: any[];
  processing_time_ms?: number;
  error?: string;
}

/**
 * Service for server-side ML processing via Supabase Edge Functions
 */
export class ServerMLService {
  /**
   * Submit files for server-side material recognition
   */
  async recognizeMaterials(
    files: File[], 
    options: Partial<ServerMLRequest['options']> = {}
  ): Promise<ServerMLResult> {
    try {
      // Upload files first
      const fileIds = await this.uploadFiles(files);
      
      if (fileIds.length === 0) {
        throw new Error('No files were successfully uploaded');
      }

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      // Create processing job
      const { data: job, error: jobError } = await supabase
        .from('processing_queue')
        .insert({
          user_id: user.id,
          job_type: 'material_recognition',
          input_data: {
            file_ids: fileIds,
            options: {
              detection_methods: ['visual'],
              confidence_threshold: 0.5,
              include_similar_materials: true,
              extract_properties: true,
              use_ai_vision: true,
              ...options
            }
          },
          status: 'pending',
          priority: 5
        })
        .select()
        .single();

      if (jobError) {
        throw new Error(`Failed to create processing job: ${jobError.message}`);
      }

      // Call the edge function
      const { data, error } = await supabase.functions.invoke('material-recognition', {
        body: {
          job_id: job.id,
          file_ids: fileIds,
          options: {
            detection_methods: ['visual'],
            confidence_threshold: 0.5,
            include_similar_materials: true,
            extract_properties: true,
            use_ai_vision: true,
            ...options
          }
        }
      });

      if (error) {
        throw new Error(`Recognition failed: ${error.message}`);
      }

      return {
        success: true,
        job_id: job.id,
        results: data.results,
        processing_time_ms: data.processing_time_ms
      };

    } catch (error) {
      console.error('Server ML recognition error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Recognition failed'
      };
    }
  }

  /**
   * Upload files to storage
   */
  private async uploadFiles(files: File[]): Promise<string[]> {
    const fileIds: string[] = [];

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('User not authenticated');
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      try {
        // Generate unique file path
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2);
        const fileExtension = file.name.split('.').pop();
        const fileName = `material_${timestamp}_${randomId}.${fileExtension}`;
        const filePath = `recognition/${fileName}`;

        // Upload to storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('material-images')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error(`Failed to upload file ${file.name}:`, uploadError);
          continue;
        }

        // Record file in database
        const { data: fileRecord, error: recordError } = await supabase
          .from('uploaded_files')
          .insert({
            user_id: user.id,
            file_name: file.name,
            file_type: file.type,
            file_size: file.size,
            storage_path: uploadData.path,
            upload_status: 'completed',
            metadata: {
              original_name: file.name,
              upload_source: 'material_recognition'
            }
          })
          .select()
          .single();

        if (recordError) {
          console.error(`Failed to record file ${file.name}:`, recordError);
          continue;
        }

        fileIds.push(fileRecord.id);

      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
        continue;
      }
    }

    return fileIds;
  }

  /**
   * Get recognition results by job ID
   */
  async getRecognitionResults(jobId: string) {
    try {
      // Get job status
      const { data: job, error: jobError } = await supabase
        .from('processing_queue')
        .select('*')
        .eq('id', jobId)
        .single();

      if (jobError) {
        throw new Error(`Failed to get job status: ${jobError.message}`);
      }

      if (job.status === 'completed') {
        // Get recognition results
        const resultData = job.result as any;
        const fileIds = resultData?.results || [];
        
        if (fileIds.length > 0) {
          const { data: results, error: resultsError } = await supabase
            .from('recognition_results')
            .select(`
              *,
              uploaded_files (
                file_name,
                storage_path
              )
            `)
            .in('id', fileIds);

          if (resultsError) {
            throw new Error(`Failed to get results: ${resultsError.message}`);
          }

          return {
            status: job.status,
            results,
            processing_time_ms: job.processing_time_ms
          };
        }
      }

      return {
        status: job.status,
        error_message: job.error_message,
        results: []
      };

    } catch (error) {
      console.error('Error getting recognition results:', error);
      throw error;
    }
  }

  /**
   * Poll for job completion
   */
  async waitForCompletion(
    jobId: string, 
    onProgress?: (status: string) => void,
    timeoutMs: number = 60000
  ): Promise<any> {
    const startTime = Date.now();
    const pollInterval = 2000; // 2 seconds

    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          if (Date.now() - startTime > timeoutMs) {
            reject(new Error('Job processing timeout'));
            return;
          }

          const result = await this.getRecognitionResults(jobId);
          
          if (onProgress) {
            onProgress(result.status);
          }

          if (result.status === 'completed') {
            resolve(result);
          } else if (result.status === 'failed') {
            reject(new Error(result.error_message || 'Job failed'));
          } else {
            // Still processing, poll again
            setTimeout(poll, pollInterval);
          }

        } catch (error) {
          reject(error);
        }
      };

      poll();
    });
  }

  /**
   * Generate embeddings for text using the server
   */
  async generateTextEmbedding(text: string): Promise<{ embedding: number[] | null; error?: string }> {
    try {
      const { data, error } = await supabase.functions.invoke('material-recognition', {
        body: {
          action: 'generate_embedding',
          text: text
        }
      });

      if (error) {
        return { embedding: null, error: error.message };
      }

      return { embedding: data.embedding };

    } catch (error) {
      return { 
        embedding: null, 
        error: error instanceof Error ? error.message : 'Embedding generation failed' 
      };
    }
  }
}

export const serverMLService = new ServerMLService();