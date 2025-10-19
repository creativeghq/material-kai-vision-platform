/**
 * Agent File Upload Service
 * Handles file uploads and attachments for agent processing
 */

import { supabase } from '@/integrations/supabase/client';

export interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  storagePath: string;
  uploadedAt: string;
  userId: string;
  agentId: string;
  metadata?: Record<string, unknown>;
}

export interface FileUploadOptions {
  maxFileSize?: number; // in bytes
  allowedTypes?: string[];
  agentId: string;
  userId: string;
}

export interface FileUploadResult {
  success: boolean;
  file?: UploadedFile;
  error?: string;
}

export class AgentFileUploadService {
  private static instance: AgentFileUploadService;
  private readonly MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB default
  private readonly ALLOWED_TYPES = [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'text/plain',
    'application/json',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  private constructor() {}

  static getInstance(): AgentFileUploadService {
    if (!AgentFileUploadService.instance) {
      AgentFileUploadService.instance = new AgentFileUploadService();
    }
    return AgentFileUploadService.instance;
  }

  /**
   * Upload a file for agent processing
   */
  async uploadFile(file: File, options: FileUploadOptions): Promise<FileUploadResult> {
    try {
      // Validate file
      const validation = this.validateFile(file, options);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
        };
      }

      // Generate unique file path
      const timestamp = Date.now();
      const fileName = `${options.userId}/${options.agentId}/${timestamp}_${file.name}`;
      const storagePath = `agent-uploads/${fileName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('agent-files')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('agent-files')
        .getPublicUrl(storagePath);

      // Store file metadata in database
      const { data: fileRecord, error: dbError } = await supabase
        .from('agent_uploaded_files')
        .insert({
          user_id: options.userId,
          agent_id: options.agentId,
          file_name: file.name,
          file_type: file.type,
          file_size: file.size,
          storage_path: storagePath,
          public_url: urlData.publicUrl,
          metadata: {
            original_name: file.name,
            mime_type: file.type,
            uploaded_at: new Date().toISOString(),
          },
        })
        .select()
        .single();

      if (dbError) {
        throw new Error(`Database error: ${dbError.message}`);
      }

      return {
        success: true,
        file: {
          id: fileRecord.id,
          name: fileRecord.file_name,
          type: fileRecord.file_type,
          size: fileRecord.file_size,
          url: fileRecord.public_url,
          storagePath: fileRecord.storage_path,
          uploadedAt: fileRecord.created_at,
          userId: fileRecord.user_id,
          agentId: fileRecord.agent_id,
          metadata: fileRecord.metadata,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed',
      };
    }
  }

  /**
   * Upload multiple files
   */
  async uploadFiles(files: File[], options: FileUploadOptions): Promise<FileUploadResult[]> {
    return Promise.all(files.map(file => this.uploadFile(file, options)));
  }

  /**
   * Get uploaded files for an agent session
   */
  async getAgentFiles(userId: string, agentId: string): Promise<UploadedFile[]> {
    try {
      const { data, error } = await supabase
        .from('agent_uploaded_files')
        .select('*')
        .eq('user_id', userId)
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return (data || []).map((file: any) => ({
        id: file.id,
        name: file.file_name,
        type: file.file_type,
        size: file.file_size,
        url: file.public_url,
        storagePath: file.storage_path,
        uploadedAt: file.created_at,
        userId: file.user_id,
        agentId: file.agent_id,
        metadata: file.metadata,
      }));
    } catch (error) {
      console.error('Failed to get agent files:', error);
      return [];
    }
  }

  /**
   * Delete an uploaded file
   */
  async deleteFile(fileId: string, userId: string): Promise<boolean> {
    try {
      // Get file record
      const { data: fileRecord, error: fetchError } = await supabase
        .from('agent_uploaded_files')
        .select('storage_path')
        .eq('id', fileId)
        .eq('user_id', userId)
        .single();

      if (fetchError || !fileRecord) {
        throw new Error('File not found');
      }

      // Delete from storage
      const { error: deleteError } = await supabase.storage
        .from('agent-files')
        .remove([fileRecord.storage_path]);

      if (deleteError) {
        throw deleteError;
      }

      // Delete from database
      const { error: dbError } = await supabase
        .from('agent_uploaded_files')
        .delete()
        .eq('id', fileId)
        .eq('user_id', userId);

      if (dbError) {
        throw dbError;
      }

      return true;
    } catch (error) {
      console.error('Failed to delete file:', error);
      return false;
    }
  }

  /**
   * Validate file before upload
   */
  private validateFile(
    file: File,
    options: FileUploadOptions,
  ): { valid: boolean; error?: string } {
    const maxSize = options.maxFileSize || this.MAX_FILE_SIZE;
    const allowedTypes = options.allowedTypes || this.ALLOWED_TYPES;

    if (file.size > maxSize) {
      return {
        valid: false,
        error: `File size exceeds limit of ${maxSize / 1024 / 1024}MB`,
      };
    }

    if (!allowedTypes.includes(file.type)) {
      return {
        valid: false,
        error: `File type ${file.type} is not allowed`,
      };
    }

    return { valid: true };
  }
}

export const agentFileUploadService = AgentFileUploadService.getInstance();

