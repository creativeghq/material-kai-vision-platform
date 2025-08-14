export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      agent_ml_tasks: {
        Row: {
          agent_task_id: string | null
          confidence_scores: Json | null
          created_at: string | null
          id: string
          input_data: Json
          ml_operation_type: string
          ml_results: Json | null
          model_versions: Json | null
          processing_time_ms: number | null
        }
        Insert: {
          agent_task_id?: string | null
          confidence_scores?: Json | null
          created_at?: string | null
          id?: string
          input_data: Json
          ml_operation_type: string
          ml_results?: Json | null
          model_versions?: Json | null
          processing_time_ms?: number | null
        }
        Update: {
          agent_task_id?: string | null
          confidence_scores?: Json | null
          created_at?: string | null
          id?: string
          input_data?: Json
          ml_operation_type?: string
          ml_results?: Json | null
          model_versions?: Json | null
          processing_time_ms?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_ml_tasks_agent_task_id_fkey"
            columns: ["agent_task_id"]
            isOneToOne: false
            referencedRelation: "agent_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_tasks: {
        Row: {
          assigned_agents: string[] | null
          coordination_plan: Json | null
          created_at: string
          error_message: string | null
          execution_timeline: Json | null
          id: string
          input_data: Json
          priority: number | null
          processing_time_ms: number | null
          result_data: Json | null
          status: string | null
          task_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_agents?: string[] | null
          coordination_plan?: Json | null
          created_at?: string
          error_message?: string | null
          execution_timeline?: Json | null
          id?: string
          input_data: Json
          priority?: number | null
          processing_time_ms?: number | null
          result_data?: Json | null
          status?: string | null
          task_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_agents?: string[] | null
          coordination_plan?: Json | null
          created_at?: string
          error_message?: string | null
          execution_timeline?: Json | null
          id?: string
          input_data?: Json
          priority?: number | null
          processing_time_ms?: number | null
          result_data?: Json | null
          status?: string | null
          task_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          created_at: string | null
          event_data: Json | null
          event_type: string
          id: string
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      api_access_control: {
        Row: {
          created_at: string
          endpoint_id: string | null
          id: string
          is_enabled: boolean
          network_type: string
          rate_limit_override: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          endpoint_id?: string | null
          id?: string
          is_enabled?: boolean
          network_type: string
          rate_limit_override?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          endpoint_id?: string | null
          id?: string
          is_enabled?: boolean
          network_type?: string
          rate_limit_override?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_access_control_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "api_endpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      api_endpoints: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          is_internal: boolean
          is_public: boolean
          method: string
          path: string
          rate_limit_per_minute: number
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_internal?: boolean
          is_public?: boolean
          method: string
          path: string
          rate_limit_per_minute?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_internal?: boolean
          is_public?: boolean
          method?: string
          path?: string
          rate_limit_per_minute?: number
          updated_at?: string
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          allowed_endpoints: string[] | null
          api_key: string
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          key_name: string
          last_used_at: string | null
          rate_limit_override: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          allowed_endpoints?: string[] | null
          api_key: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_name: string
          last_used_at?: string | null
          rate_limit_override?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          allowed_endpoints?: string[] | null
          api_key?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_name?: string
          last_used_at?: string | null
          rate_limit_override?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      api_usage_logs: {
        Row: {
          created_at: string
          endpoint_id: string | null
          id: string
          ip_address: unknown
          is_internal_request: boolean
          rate_limit_exceeded: boolean
          request_method: string
          request_path: string
          response_status: number | null
          response_time_ms: number | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          endpoint_id?: string | null
          id?: string
          ip_address: unknown
          is_internal_request?: boolean
          rate_limit_exceeded?: boolean
          request_method: string
          request_path: string
          response_status?: number | null
          response_time_ms?: number | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          endpoint_id?: string | null
          id?: string
          ip_address?: unknown
          is_internal_request?: boolean
          rate_limit_exceeded?: boolean
          request_method?: string
          request_path?: string
          response_status?: number | null
          response_time_ms?: number | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_usage_logs_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "api_endpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      crewai_agents: {
        Row: {
          agent_name: string
          agent_type: string
          capabilities: Json | null
          created_at: string
          id: string
          learning_progress: Json | null
          memory_data: Json | null
          performance_metrics: Json | null
          specialization: string
          status: string | null
          updated_at: string
        }
        Insert: {
          agent_name: string
          agent_type: string
          capabilities?: Json | null
          created_at?: string
          id?: string
          learning_progress?: Json | null
          memory_data?: Json | null
          performance_metrics?: Json | null
          specialization: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          agent_name?: string
          agent_type?: string
          capabilities?: Json | null
          created_at?: string
          id?: string
          learning_progress?: Json | null
          memory_data?: Json | null
          performance_metrics?: Json | null
          specialization?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      document_chunks: {
        Row: {
          bbox: Json | null
          chunk_index: number
          chunk_type: string
          created_at: string | null
          document_id: string | null
          embedding: string | null
          embedding_1536: string | null
          hierarchy_level: number | null
          html_content: string | null
          id: string
          metadata: Json
          page_number: number | null
          parent_chunk_id: string | null
          text: string
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          bbox?: Json | null
          chunk_index: number
          chunk_type: string
          created_at?: string | null
          document_id?: string | null
          embedding?: string | null
          embedding_1536?: string | null
          hierarchy_level?: number | null
          html_content?: string | null
          id?: string
          metadata?: Json
          page_number?: number | null
          parent_chunk_id?: string | null
          text: string
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          bbox?: Json | null
          chunk_index?: number
          chunk_type?: string
          created_at?: string | null
          document_id?: string | null
          embedding?: string | null
          embedding_1536?: string | null
          hierarchy_level?: number | null
          html_content?: string | null
          id?: string
          metadata?: Json
          page_number?: number | null
          parent_chunk_id?: string | null
          text?: string
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "pdf_processing_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunks_parent_chunk_id_fkey"
            columns: ["parent_chunk_id"]
            isOneToOne: false
            referencedRelation: "document_chunks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      document_images: {
        Row: {
          alt_text: string | null
          bbox: Json | null
          caption: string | null
          chunk_id: string | null
          confidence: number | null
          created_at: string | null
          document_id: string | null
          id: string
          image_type: string | null
          image_url: string
          metadata: Json | null
          page_number: number | null
          proximity_score: number | null
          workspace_id: string | null
        }
        Insert: {
          alt_text?: string | null
          bbox?: Json | null
          caption?: string | null
          chunk_id?: string | null
          confidence?: number | null
          created_at?: string | null
          document_id?: string | null
          id?: string
          image_type?: string | null
          image_url: string
          metadata?: Json | null
          page_number?: number | null
          proximity_score?: number | null
          workspace_id?: string | null
        }
        Update: {
          alt_text?: string | null
          bbox?: Json | null
          caption?: string | null
          chunk_id?: string | null
          confidence?: number | null
          created_at?: string | null
          document_id?: string | null
          id?: string
          image_type?: string | null
          image_url?: string
          metadata?: Json | null
          page_number?: number | null
          proximity_score?: number | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_images_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "document_chunks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_images_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "pdf_processing_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_images_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      document_layout_analysis: {
        Row: {
          analysis_metadata: Json | null
          created_at: string | null
          document_id: string | null
          id: string
          layout_elements: Json
          page_number: number
          processing_version: string | null
          reading_order: Json | null
          structure_confidence: number | null
        }
        Insert: {
          analysis_metadata?: Json | null
          created_at?: string | null
          document_id?: string | null
          id?: string
          layout_elements?: Json
          page_number: number
          processing_version?: string | null
          reading_order?: Json | null
          structure_confidence?: number | null
        }
        Update: {
          analysis_metadata?: Json | null
          created_at?: string | null
          document_id?: string | null
          id?: string
          layout_elements?: Json
          page_number?: number
          processing_version?: string | null
          reading_order?: Json | null
          structure_confidence?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "document_layout_analysis_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "pdf_processing_results"
            referencedColumns: ["id"]
          },
        ]
      }
      document_processing_status: {
        Row: {
          created_at: string | null
          current_step: string | null
          document_id: string | null
          end_time: string | null
          error_message: string | null
          id: string
          metadata: Json | null
          processing_id: string
          progress: number | null
          start_time: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_step?: string | null
          document_id?: string | null
          end_time?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          processing_id: string
          progress?: number | null
          start_time?: string | null
          status: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_step?: string | null
          document_id?: string | null
          end_time?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          processing_id?: string
          progress?: number | null
          start_time?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_processing_status_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "pdf_processing_results"
            referencedColumns: ["id"]
          },
        ]
      }
      document_quality_metrics: {
        Row: {
          chunking_quality: number | null
          created_at: string | null
          document_id: string | null
          id: string
          image_mapping_accuracy: number | null
          layout_preservation: number | null
          overall_quality: number | null
          processing_time_ms: number | null
          statistics: Json | null
        }
        Insert: {
          chunking_quality?: number | null
          created_at?: string | null
          document_id?: string | null
          id?: string
          image_mapping_accuracy?: number | null
          layout_preservation?: number | null
          overall_quality?: number | null
          processing_time_ms?: number | null
          statistics?: Json | null
        }
        Update: {
          chunking_quality?: number | null
          created_at?: string | null
          document_id?: string | null
          id?: string
          image_mapping_accuracy?: number | null
          layout_preservation?: number | null
          overall_quality?: number | null
          processing_time_ms?: number | null
          statistics?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "document_quality_metrics_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "pdf_processing_results"
            referencedColumns: ["id"]
          },
        ]
      }
      enhanced_knowledge_base: {
        Row: {
          accuracy_score: number | null
          approved_at: string | null
          approved_by: string | null
          confidence_scores: Json | null
          content: string
          content_type: string
          created_at: string
          created_by: string | null
          custom_embedding: string | null
          embedding_1536: string | null
          freshness_score: number | null
          huggingface_embedding: string | null
          id: string
          language: string | null
          last_modified_by: string | null
          material_categories: string[] | null
          material_ids: string[] | null
          metadata: Json | null
          openai_embedding: string | null
          reading_level: number | null
          relevance_score: number | null
          search_keywords: string[] | null
          search_vector: unknown | null
          semantic_tags: string[] | null
          source_url: string | null
          status: string | null
          technical_complexity: number | null
          title: string
          updated_at: string
          version: number | null
        }
        Insert: {
          accuracy_score?: number | null
          approved_at?: string | null
          approved_by?: string | null
          confidence_scores?: Json | null
          content: string
          content_type?: string
          created_at?: string
          created_by?: string | null
          custom_embedding?: string | null
          embedding_1536?: string | null
          freshness_score?: number | null
          huggingface_embedding?: string | null
          id?: string
          language?: string | null
          last_modified_by?: string | null
          material_categories?: string[] | null
          material_ids?: string[] | null
          metadata?: Json | null
          openai_embedding?: string | null
          reading_level?: number | null
          relevance_score?: number | null
          search_keywords?: string[] | null
          search_vector?: unknown | null
          semantic_tags?: string[] | null
          source_url?: string | null
          status?: string | null
          technical_complexity?: number | null
          title: string
          updated_at?: string
          version?: number | null
        }
        Update: {
          accuracy_score?: number | null
          approved_at?: string | null
          approved_by?: string | null
          confidence_scores?: Json | null
          content?: string
          content_type?: string
          created_at?: string
          created_by?: string | null
          custom_embedding?: string | null
          embedding_1536?: string | null
          freshness_score?: number | null
          huggingface_embedding?: string | null
          id?: string
          language?: string | null
          last_modified_by?: string | null
          material_categories?: string[] | null
          material_ids?: string[] | null
          metadata?: Json | null
          openai_embedding?: string | null
          reading_level?: number | null
          relevance_score?: number | null
          search_keywords?: string[] | null
          search_vector?: unknown | null
          semantic_tags?: string[] | null
          source_url?: string | null
          status?: string | null
          technical_complexity?: number | null
          title?: string
          updated_at?: string
          version?: number | null
        }
        Relationships: []
      }
      generation_3d: {
        Row: {
          created_at: string
          error_message: string | null
          generation_status: string | null
          id: string
          image_urls: string[] | null
          material_ids: string[] | null
          materials_used: string[] | null
          model_used: string | null
          processing_time_ms: number | null
          prompt: string
          result_data: Json | null
          room_type: string | null
          style: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          generation_status?: string | null
          id?: string
          image_urls?: string[] | null
          material_ids?: string[] | null
          materials_used?: string[] | null
          model_used?: string | null
          processing_time_ms?: number | null
          prompt: string
          result_data?: Json | null
          room_type?: string | null
          style?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          generation_status?: string | null
          id?: string
          image_urls?: string[] | null
          material_ids?: string[] | null
          materials_used?: string[] | null
          model_used?: string | null
          processing_time_ms?: number | null
          prompt?: string
          result_data?: Json | null
          room_type?: string | null
          style?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      image_text_associations: {
        Row: {
          association_type: string
          chunk_ids: Json | null
          confidence: number | null
          created_at: string | null
          document_id: string | null
          id: string
          image_id: string | null
          metadata: Json | null
          proximity_score: number | null
          semantic_score: number | null
          spatial_relationship: Json | null
          text_block_ids: Json | null
        }
        Insert: {
          association_type: string
          chunk_ids?: Json | null
          confidence?: number | null
          created_at?: string | null
          document_id?: string | null
          id?: string
          image_id?: string | null
          metadata?: Json | null
          proximity_score?: number | null
          semantic_score?: number | null
          spatial_relationship?: Json | null
          text_block_ids?: Json | null
        }
        Update: {
          association_type?: string
          chunk_ids?: Json | null
          confidence?: number | null
          created_at?: string | null
          document_id?: string | null
          id?: string
          image_id?: string | null
          metadata?: Json | null
          proximity_score?: number | null
          semantic_score?: number | null
          spatial_relationship?: Json | null
          text_block_ids?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "image_text_associations_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "pdf_processing_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "image_text_associations_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "document_images"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_networks: {
        Row: {
          cidr_range: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          cidr_range: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          cidr_range?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      knowledge_base_entries: {
        Row: {
          content: string
          content_type: string
          created_at: string
          created_by: string | null
          embedding: string | null
          id: string
          material_ids: string[] | null
          metadata: Json | null
          relevance_score: number | null
          source_url: string | null
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          content_type: string
          created_at?: string
          created_by?: string | null
          embedding?: string | null
          id?: string
          material_ids?: string[] | null
          metadata?: Json | null
          relevance_score?: number | null
          source_url?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          content_type?: string
          created_at?: string
          created_by?: string | null
          embedding?: string | null
          id?: string
          material_ids?: string[] | null
          metadata?: Json | null
          relevance_score?: number | null
          source_url?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      knowledge_relationships: {
        Row: {
          bidirectional: boolean | null
          confidence_score: number | null
          created_at: string
          id: string
          relationship_context: string | null
          relationship_strength: number | null
          relationship_type: string
          source_id: string
          source_type: string | null
          target_id: string
          updated_at: string
          validated_by: string | null
          validation_status: string | null
        }
        Insert: {
          bidirectional?: boolean | null
          confidence_score?: number | null
          created_at?: string
          id?: string
          relationship_context?: string | null
          relationship_strength?: number | null
          relationship_type: string
          source_id: string
          source_type?: string | null
          target_id: string
          updated_at?: string
          validated_by?: string | null
          validation_status?: string | null
        }
        Update: {
          bidirectional?: boolean | null
          confidence_score?: number | null
          created_at?: string
          id?: string
          relationship_context?: string | null
          relationship_strength?: number | null
          relationship_type?: string
          source_id?: string
          source_type?: string | null
          target_id?: string
          updated_at?: string
          validated_by?: string | null
          validation_status?: string | null
        }
        Relationships: []
      }
      legacy_processed_documents: {
        Row: {
          created_at: string | null
          created_by: string | null
          document_summary: string | null
          extracted_text_length: number | null
          file_hash: string | null
          file_path: string | null
          file_size: number | null
          filename: string
          id: string
          keywords: string[] | null
          language: string | null
          mime_type: string | null
          original_filename: string
          processing_completed_at: string | null
          processing_error: string | null
          processing_started_at: string | null
          processing_status: string | null
          storage_bucket: string | null
          storage_path: string | null
          total_chunks: number | null
          total_images: number | null
          total_pages: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          document_summary?: string | null
          extracted_text_length?: number | null
          file_hash?: string | null
          file_path?: string | null
          file_size?: number | null
          filename: string
          id?: string
          keywords?: string[] | null
          language?: string | null
          mime_type?: string | null
          original_filename: string
          processing_completed_at?: string | null
          processing_error?: string | null
          processing_started_at?: string | null
          processing_status?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
          total_chunks?: number | null
          total_images?: number | null
          total_pages?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          document_summary?: string | null
          extracted_text_length?: number | null
          file_hash?: string | null
          file_path?: string | null
          file_size?: number | null
          filename?: string
          id?: string
          keywords?: string[] | null
          language?: string | null
          mime_type?: string | null
          original_filename?: string
          processing_completed_at?: string | null
          processing_error?: string | null
          processing_started_at?: string | null
          processing_status?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
          total_chunks?: number | null
          total_images?: number | null
          total_pages?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      material_knowledge: {
        Row: {
          content: string
          created_at: string | null
          created_by: string | null
          embedding: string | null
          id: string
          material_ids: string[] | null
          metadata: Json | null
          relevance_score: number | null
          source_type: string

        }
        Insert: {
          content: string
          created_at?: string | null
          created_by?: string | null
          embedding?: string | null
          id?: string
          material_ids?: string[] | null
          metadata?: Json | null
          relevance_score?: number | null
          source_type: string
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by?: string | null
          embedding?: string | null
          id?: string
          material_ids?: string[] | null
          metadata?: Json | null
          relevance_score?: number | null
          source_type?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (Database["public"]["Tables"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]] extends { Tables: any }
        ? Database[PublicTableNameOrOptions["schema"]]["Tables"]
        : never)
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]] extends { Tables: any }
      ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
          Database["public"]["Tables"])[TableName] extends {
        Row: infer R
      }
      ? R
      : never
      : never)
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
  ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]] extends { Tables: any }
        ? Database[PublicTableNameOrOptions["schema"]]["Tables"]
        : never)
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]] extends { Tables: any }
      ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
          Database["public"]["Tables"])[TableName] extends {
        Insert: infer I
      }
      ? I
      : never
      : never)
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
  ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]] extends { Tables: any }
        ? Database[PublicTableNameOrOptions["schema"]]["Tables"]
        : never)
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]] extends { Tables: any }
      ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
          Database["public"]["Tables"])[TableName] extends {
        Update: infer U
      }
      ? U
      : never
      : never)
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
  ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof Database["public"]["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicEnumNameOrOptions["schema"]] extends { Enums: any }
        ? Database[PublicEnumNameOrOptions["schema"]]["Enums"]
        : never)
    : never = never
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicEnumNameOrOptions["schema"]] extends { Enums: any }
      ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
      : never)
  : PublicEnumNameOrOptions extends keyof Database["public"]["Enums"]
  ? Database["public"]["Enums"][PublicEnumNameOrOptions]
  : never
