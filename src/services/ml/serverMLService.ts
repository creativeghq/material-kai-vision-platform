import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { BaseService, ServiceConfig } from '../base/BaseService';

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
  data?: any;
  processingTime?: number;
  provider?: string;
  modelVersion?: string;
}

interface ServerMLServiceConfig extends ServiceConfig {
  defaultConfidenceThreshold: number;
  maxFileSize: number;
  maxFilesPerRequest: number;
  defaultTimeout: number;
  enableJobPolling: boolean;
  pollInterval: number;
  enableFileUploadRetry: boolean;
  maxRetryAttempts: number;
  enableCaching: boolean;
  cacheExpirationMs: number;
  enableBatchProcessing: boolean;
  maxBatchSize: number;
  enableAdvancedAnalysis: boolean;
  storageBasePath: string;
  supportedFileTypes: string[];
}

/**
 * Service for server-side ML processing via Supabase Edge Functions
 */
export class ServerMLService extends BaseService<ServerMLServiceConfig> {
  private jobCache: Map<string, any> = new Map();
  private uploadCache: Map<string, string> = new Map();

  protected constructor(config: ServerMLServiceConfig) {
    super(config);
  }

  protected async doInitialize(): Promise<void> {
    // Verify Supabase connection
    await this.executeOperation(
      () => this.verifySupabaseConnection(),
      'verify-supabase-connection'
    );

    // Test edge function availability
    await this.executeOperation(
      () => this.testEdgeFunctionAvailability(),
      'test-edge-function-availability'
    );

    // Initialize storage bucket access
    await this.executeOperation(
      () => this.verifyStorageAccess(),
      'verify-storage-access'
    );
  }

  protected async doHealthCheck(): Promise<void> {
    // Check Supabase connection
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) {
      throw new Error(`Supabase authentication failed: ${userError.message}`);
    }

    // Test storage access
    try {
      const { data, error } = await supabase.storage.from('material-images').list('', { limit: 1 });
      if (error) {
        throw new Error(`Storage access failed: ${error.message}`);
      }
    } catch (error) {
      throw new Error(`Storage health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Test edge function availability
    try {
      const { error } = await supabase.functions.invoke('material-recognition', {
        body: { action: 'health_check' }
      });
      if (error && !error.message.includes('health_check')) {
        throw new Error(`Edge function health check failed: ${error.message}`);
      }
    } catch (error) {
      // Edge function might not support health check, which is acceptable
    }
  }

  private async verifySupabaseConnection(): Promise<void> {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) {
      throw new Error(`Supabase connection failed: ${error.message}`);
    }
  }

  private async testEdgeFunctionAvailability(): Promise<void> {
    try {
      // Test with a minimal request to check if functions are available
      await supabase.functions.invoke('material-recognition', {
        body: { action: 'test' }
      });
    } catch (error) {
      console.warn('Edge function test failed (may be expected):', error);
    }
  }

  private async verifyStorageAccess(): Promise<void> {
    const { data, error } = await supabase.storage.from('material-images').list('', { limit: 1 });
    if (error) {
      throw new Error(`Storage access verification failed: ${error.message}`);
    }
  }

  /**
   * Submit files for server-side material recognition
   */
  async recognizeMaterials(
    files: File[], 
    options: Partial<ServerMLRequest['options']> = {}
  ): Promise<ServerMLResult> {
    return this.executeOperation(async () => {
      // Validate input
      if (files.length === 0) {
        throw new Error('No files provided for recognition');
      }

      if (files.length > this.config.maxFilesPerRequest) {
        throw new Error(`Too many files. Maximum allowed: ${this.config.maxFilesPerRequest}`);
      }

      // Validate file sizes and types
      for (const file of files) {
        if (file.size > this.config.maxFileSize) {
          throw new Error(`File ${file.name} exceeds maximum size of ${this.config.maxFileSize} bytes`);
        }

        const fileType = file.type.toLowerCase();
        if (!this.config.supportedFileTypes.some(type => fileType.includes(type))) {
          throw new Error(`File type ${file.type} is not supported`);
        }
      }

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

      // Prepare options with defaults
      const finalOptions = {
        detection_methods: ['visual'],
        confidence_threshold: this.config.defaultConfidenceThreshold,
        include_similar_materials: true,
        extract_properties: true,
        use_ai_vision: true,
        ...options
      };

      // Create processing job
      const { data: job, error: jobError } = await supabase
        .from('processing_queue')
        .insert({
          user_id: user.id,
          job_type: 'material_recognition',
          input_data: {
            file_ids: fileIds,
            options: finalOptions
          },
          status: 'pending',
          priority: 5
        })
        .select()
        .single();

      if (jobError) {
        throw new Error(`Failed to create processing job: ${jobError.message}`);
      }

      // Cache job for tracking
      if (this.config.enableCaching) {
        this.jobCache.set(job.id, {
          ...job,
          timestamp: Date.now()
        });
      }

      // Call the edge function
      const { data, error } = await supabase.functions.invoke('material-recognition', {
        body: {
          job_id: job.id,
          file_ids: fileIds,
          options: finalOptions
        }
      });

      if (error) {
        throw new Error(`Recognition failed: ${error.message}`);
      }

      return {
        success: true,
        job_id: job.id,
        results: data.results,
        processing_time_ms: data.processing_time_ms,
        provider: 'supabase-edge',
        modelVersion: 'gpt-4o-mini'
      };
    }, 'recognize-materials');
  }

  /**
   * Upload files to storage
   */
  private async uploadFiles(files: File[]): Promise<string[]> {
    return this.executeOperation(async () => {
      const fileIds: string[] = [];

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        try {
          // Check cache first
          const cacheKey = `${file.name}-${file.size}-${file.lastModified}`;
          if (this.config.enableCaching && this.uploadCache.has(cacheKey)) {
            const cachedFileId = this.uploadCache.get(cacheKey);
            if (cachedFileId) {
              fileIds.push(cachedFileId);
              continue;
            }
          }

          // Generate unique file path
          const timestamp = Date.now();
          const randomId = Math.random().toString(36).substring(2);
          const fileExtension = file.name.split('.').pop();
          const fileName = `material_${timestamp}_${randomId}.${fileExtension}`;
          const filePath = `${this.config.storageBasePath}/${fileName}`;

          // Upload to storage with retry logic
          let uploadData;
          let uploadError;
          let attempts = 0;

          do {
            attempts++;
            const result = await supabase.storage
              .from('material-images')
              .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false
              });
            
            uploadData = result.data;
            uploadError = result.error;

            if (uploadError && this.config.enableFileUploadRetry && attempts < this.config.maxRetryAttempts) {
              await new Promise(resolve => setTimeout(resolve, 1000 * attempts)); // Exponential backoff
            }
          } while (uploadError && this.config.enableFileUploadRetry && attempts < this.config.maxRetryAttempts);

          if (uploadError) {
            console.error(`Failed to upload file ${file.name} after ${attempts} attempts:`, uploadError);
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
              storage_path: uploadData!.path,
              upload_status: 'completed',
              metadata: {
                original_name: file.name,
                upload_source: 'material_recognition',
                upload_timestamp: timestamp
              }
            })
            .select()
            .single();

          if (recordError) {
            console.error(`Failed to record file ${file.name}:`, recordError);
            continue;
          }

          fileIds.push(fileRecord.id);

          // Cache successful upload
          if (this.config.enableCaching) {
            this.uploadCache.set(cacheKey, fileRecord.id);
          }

        } catch (error) {
          console.error(`Error processing file ${file.name}:`, error);
          continue;
        }
      }

      return fileIds;
    }, 'upload-files');
  }

  /**
   * Get recognition results by job ID
   */
  async getRecognitionResults(jobId: string) {
    return this.executeOperation(async () => {
      // Check cache first
      if (this.config.enableCaching && this.jobCache.has(jobId)) {
        const cachedJob = this.jobCache.get(jobId);
        if (Date.now() - cachedJob.timestamp < this.config.cacheExpirationMs) {
          if (cachedJob.status === 'completed') {
            return cachedJob;
          }
        }
      }

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

          const finalResult = {
            status: job.status,
            results,
            processing_time_ms: job.processing_time_ms
          };

          // Update cache
          if (this.config.enableCaching) {
            this.jobCache.set(jobId, {
              ...finalResult,
              timestamp: Date.now()
            });
          }

          return finalResult;
        }
      }

      const result = {
        status: job.status,
        error_message: job.error_message,
        results: []
      };

      // Update cache for non-completed jobs too
      if (this.config.enableCaching) {
        this.jobCache.set(jobId, {
          ...result,
          timestamp: Date.now()
        });
      }

      return result;
    }, 'get-recognition-results');
  }

  /**
   * Poll for job completion
   */
  async waitForCompletion(
    jobId: string, 
    onProgress?: (status: string) => void,
    timeoutMs: number = this.config.defaultTimeout
  ): Promise<any> {
    return this.executeOperation(async () => {
      if (!this.config.enableJobPolling) {
        throw new Error('Job polling is disabled');
      }

      const startTime = Date.now();

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
              setTimeout(poll, this.config.pollInterval);
            }

          } catch (error) {
            reject(error);
          }
        };

        poll();
      });
    }, 'wait-for-completion');
  }

  /**
   * Process OCR on an image file
   */
  async processOCR(
    imageFile: File,
    options: {
      language?: string;
      extractStructuredData?: boolean;
      documentType?: 'certificate' | 'label' | 'specification' | 'general';
      materialContext?: string;
    } = {}
  ): Promise<ServerMLResult> {
    return this.executeOperation(async () => {
      console.log('ServerML: Starting OCR processing');
      
      const { imageUrl } = await this.uploadImage(imageFile);
      
      const response = await supabase.functions.invoke('ocr-processing', {
        body: {
          imageUrl,
          options,
          userId: (await supabase.auth.getUser()).data.user?.id
        }
      });

      if (response.error) {
        throw new Error(response.error.message || 'OCR processing failed');
      }

      return {
        success: true,
        data: response.data,
        processingTime: response.data?.processingTime || 0,
        provider: 'supabase-edge',
        modelVersion: 'gpt-4o-mini'
      };
    }, 'process-ocr');
  }

  /**
   * Upload image and get public URL
   */
  private async uploadImage(file: File): Promise<{ imageUrl: string }> {
    return this.executeOperation(async () => {
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2);
      const fileExtension = file.name.split('.').pop();
      const fileName = `ocr_${timestamp}_${randomId}.${fileExtension}`;
      const filePath = `ocr/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('material-images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      const { data: { publicUrl } } = supabase.storage
        .from('material-images')
        .getPublicUrl(uploadData.path);

      return { imageUrl: publicUrl };
    }, 'upload-image');
  }

  /**
   * Analyze advanced material properties using server-side AI
   */
  async analyzeAdvancedMaterialProperties(
    imageFile: File,
    options: any = {}
  ): Promise<any> {
    return this.executeOperation(async () => {
      console.log('ServerML: Starting advanced material properties analysis');
      
      const { imageUrl } = await this.uploadImage(imageFile);
      
      const response = await supabase.functions.invoke('material-properties-analysis', {
        body: {
          imageUrl,
          options,
          userId: (await supabase.auth.getUser()).data.user?.id
        }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Material properties analysis failed');
      }

      return {
        success: true,
        data: response.data,
        processingTime: response.data?.processingTime || 0,
        provider: 'supabase-edge',
        modelVersion: 'gpt-4o-mini'
      };
    }, 'analyze-advanced-material-properties');
  }

  /**
   * Generate embeddings for text using the server
   */
  async generateTextEmbedding(text: string): Promise<{ embedding: number[] | null; error?: string }> {
    return this.executeOperation(async () => {
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
    }, 'generate-text-embedding');
  }

  /**
   * Get service status
   */
  getStatus(): { available: boolean; features: string[] } {
    return {
      available: this.isInitialized,
      features: [
        'Material Recognition',
        'OCR Processing',
        'AI-Powered Analysis',
        'Structured Data Extraction',
        'Embedding Generation',
        'Batch Processing',
        'Job Polling',
        'File Upload Retry',
        'Result Caching'
      ]
    };
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.jobCache.clear();
    this.uploadCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { jobCache: number; uploadCache: number } {
    return {
      jobCache: this.jobCache.size,
      uploadCache: this.uploadCache.size
    };
  }

  // Static factory method for standardized instantiation
  public static createInstance(config?: Partial<ServerMLServiceConfig>): ServerMLService {
    const defaultConfig: ServerMLServiceConfig = {
      name: 'ServerMLService',
      version: '1.0.0',
      environment: 'development',
      enabled: true,
      defaultConfidenceThreshold: 0.5,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxFilesPerRequest: 10,
      defaultTimeout: 60000, // 60 seconds
      enableJobPolling: true,
      pollInterval: 2000, // 2 seconds
      enableFileUploadRetry: true,
      maxRetryAttempts: 3,
      enableCaching: true,
      cacheExpirationMs: 5 * 60 * 1000, // 5 minutes
      enableBatchProcessing: true,
      maxBatchSize: 5,
      enableAdvancedAnalysis: true,
      storageBasePath: 'recognition',
      supportedFileTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    };

    const finalConfig = { ...defaultConfig, ...config };
    return new ServerMLService(finalConfig);
  }
}

export const serverMLService = ServerMLService.createInstance();