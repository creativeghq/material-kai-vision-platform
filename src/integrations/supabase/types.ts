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
      material_embeddings: {
        Row: {
          confidence_score: number | null
          created_at: string
          embedding: string
          embedding_type: string
          id: string
          material_id: string
          metadata: Json | null
          model_version: string
          updated_at: string
          vector_dimension: number
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          embedding: string
          embedding_type: string
          id?: string
          material_id: string
          metadata?: Json | null
          model_version: string
          updated_at?: string
          vector_dimension?: number
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          embedding?: string
          embedding_type?: string
          id?: string
          material_id?: string
          metadata?: Json | null
          model_version?: string
          updated_at?: string
          vector_dimension?: number
        }
        Relationships: [
          {
            foreignKeyName: "material_embeddings_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials_catalog"
            referencedColumns: ["id"]
          },
        ]
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
          title: string
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
          title: string
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
          title?: string
        }
        Relationships: []
      }
      material_knowledge_extraction: {
        Row: {
          confidence_score: number | null
          created_at: string
          embedding: string | null
          extracted_knowledge: string
          extraction_context: Json | null
          extraction_type: string
          id: string
          material_id: string | null
          source_fields: string[] | null
          updated_at: string
          validated_by: string | null
          validation_notes: string | null
          validation_status: string | null
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          embedding?: string | null
          extracted_knowledge: string
          extraction_context?: Json | null
          extraction_type: string
          id?: string
          material_id?: string | null
          source_fields?: string[] | null
          updated_at?: string
          validated_by?: string | null
          validation_notes?: string | null
          validation_status?: string | null
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          embedding?: string | null
          extracted_knowledge?: string
          extraction_context?: Json | null
          extraction_type?: string
          id?: string
          material_id?: string | null
          source_fields?: string[] | null
          updated_at?: string
          validated_by?: string | null
          validation_notes?: string | null
          validation_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_knowledge_extraction_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      material_metadata_fields: {
        Row: {
          applies_to_categories:
            | Database["public"]["Enums"]["material_category"][]
            | null
          created_at: string | null
          created_by: string | null
          description: string | null
          display_name: string
          dropdown_options: string[] | null
          extraction_hints: string | null
          field_name: string
          field_type: string
          id: string
          is_global: boolean | null
          is_required: boolean | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          applies_to_categories?:
            | Database["public"]["Enums"]["material_category"][]
            | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_name: string
          dropdown_options?: string[] | null
          extraction_hints?: string | null
          field_name: string
          field_type: string
          id?: string
          is_global?: boolean | null
          is_required?: boolean | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          applies_to_categories?:
            | Database["public"]["Enums"]["material_category"][]
            | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_name?: string
          dropdown_options?: string[] | null
          extraction_hints?: string | null
          field_name?: string
          field_type?: string
          id?: string
          is_global?: boolean | null
          is_required?: boolean | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      material_style_analysis: {
        Row: {
          color_palette: Json | null
          created_at: string | null
          id: string
          material_id: string | null
          ml_model_version: string | null
          room_suitability: Json | null
          style_confidence: Json | null
          style_tags: string[] | null
          texture_analysis: Json | null
          trend_score: number | null
          updated_at: string | null
        }
        Insert: {
          color_palette?: Json | null
          created_at?: string | null
          id?: string
          material_id?: string | null
          ml_model_version?: string | null
          room_suitability?: Json | null
          style_confidence?: Json | null
          style_tags?: string[] | null
          texture_analysis?: Json | null
          trend_score?: number | null
          updated_at?: string | null
        }
        Update: {
          color_palette?: Json | null
          created_at?: string | null
          id?: string
          material_id?: string | null
          ml_model_version?: string | null
          room_suitability?: Json | null
          style_confidence?: Json | null
          style_tags?: string[] | null
          texture_analysis?: Json | null
          trend_score?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_style_analysis_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      materials_catalog: {
        Row: {
          category: Database["public"]["Enums"]["material_category"]
          chemical_composition: Json | null
          created_at: string | null
          created_by: string | null
          description: string | null
          embedding: string | null
          id: string
          name: string
          properties: Json | null
          safety_data: Json | null
          standards: string[] | null
          thumbnail_url: string | null
          updated_at: string | null
        }
        Insert: {
          category: Database["public"]["Enums"]["material_category"]
          chemical_composition?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          embedding?: string | null
          id?: string
          name: string
          properties?: Json | null
          safety_data?: Json | null
          standards?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["material_category"]
          chemical_composition?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          embedding?: string | null
          id?: string
          name?: string
          properties?: Json | null
          safety_data?: Json | null
          standards?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ml_models: {
        Row: {
          confidence_threshold: number | null
          created_at: string | null
          id: string
          metadata: Json | null
          model_path: string | null
          model_type: string
          name: string
          performance_metrics: Json | null
          status: string | null
          updated_at: string | null
          version: string
        }
        Insert: {
          confidence_threshold?: number | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          model_path?: string | null
          model_type: string
          name: string
          performance_metrics?: Json | null
          status?: string | null
          updated_at?: string | null
          version: string
        }
        Update: {
          confidence_threshold?: number | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          model_path?: string | null
          model_type?: string
          name?: string
          performance_metrics?: Json | null
          status?: string | null
          updated_at?: string | null
          version?: string
        }
        Relationships: []
      }
      ml_processing_queue: {
        Row: {
          assigned_worker: string | null
          completed_at: string | null
          created_at: string | null
          error_details: string | null
          id: string
          input_data: Json
          priority: number | null
          progress_data: Json | null
          result_data: Json | null
          started_at: string | null
          status: string | null
          task_type: string
          user_id: string
        }
        Insert: {
          assigned_worker?: string | null
          completed_at?: string | null
          created_at?: string | null
          error_details?: string | null
          id?: string
          input_data: Json
          priority?: number | null
          progress_data?: Json | null
          result_data?: Json | null
          started_at?: string | null
          status?: string | null
          task_type: string
          user_id: string
        }
        Update: {
          assigned_worker?: string | null
          completed_at?: string | null
          created_at?: string | null
          error_details?: string | null
          id?: string
          input_data?: Json
          priority?: number | null
          progress_data?: Json | null
          result_data?: Json | null
          started_at?: string | null
          status?: string | null
          task_type?: string
          user_id?: string
        }
        Relationships: []
      }
      ml_training_jobs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          dataset_info: Json | null
          error_message: string | null
          id: string
          metrics: Json | null
          model_id: string | null
          progress_percentage: number | null
          started_at: string | null
          status: string | null
          training_config: Json
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          dataset_info?: Json | null
          error_message?: string | null
          id?: string
          metrics?: Json | null
          model_id?: string | null
          progress_percentage?: number | null
          started_at?: string | null
          status?: string | null
          training_config: Json
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          dataset_info?: Json | null
          error_message?: string | null
          id?: string
          metrics?: Json | null
          model_id?: string | null
          progress_percentage?: number | null
          started_at?: string | null
          status?: string | null
          training_config?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ml_training_jobs_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "ml_models"
            referencedColumns: ["id"]
          },
        ]
      }
      moodboard_items: {
        Row: {
          added_at: string
          id: string
          material_id: string
          moodboard_id: string
          notes: string | null
          position: number
        }
        Insert: {
          added_at?: string
          id?: string
          material_id: string
          moodboard_id: string
          notes?: string | null
          position?: number
        }
        Update: {
          added_at?: string
          id?: string
          material_id?: string
          moodboard_id?: string
          notes?: string | null
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "moodboard_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moodboard_items_moodboard_id_fkey"
            columns: ["moodboard_id"]
            isOneToOne: false
            referencedRelation: "moodboards"
            referencedColumns: ["id"]
          },
        ]
      }
      moodboards: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_public: boolean
          title: string
          updated_at: string
          user_id: string
          view_preference: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          title: string
          updated_at?: string
          user_id: string
          view_preference?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          title?: string
          updated_at?: string
          user_id?: string
          view_preference?: string
        }
        Relationships: []
      }
      nerf_reconstructions: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          mesh_file_url: string | null
          metadata: Json | null
          model_file_url: string | null
          point_cloud_url: string | null
          processing_time_ms: number | null
          quality_score: number | null
          reconstruction_status: string | null
          source_image_urls: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          mesh_file_url?: string | null
          metadata?: Json | null
          model_file_url?: string | null
          point_cloud_url?: string | null
          processing_time_ms?: number | null
          quality_score?: number | null
          reconstruction_status?: string | null
          source_image_urls: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          mesh_file_url?: string | null
          metadata?: Json | null
          model_file_url?: string | null
          point_cloud_url?: string | null
          processing_time_ms?: number | null
          quality_score?: number | null
          reconstruction_status?: string | null
          source_image_urls?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pdf_document_structure: {
        Row: {
          bounding_box: Json | null
          confidence_score: number | null
          content: string | null
          created_at: string | null
          hierarchy_level: number | null
          id: string
          metadata: Json | null
          page_number: number
          parent_element_id: string | null
          pdf_processing_id: string
          structure_type: string
        }
        Insert: {
          bounding_box?: Json | null
          confidence_score?: number | null
          content?: string | null
          created_at?: string | null
          hierarchy_level?: number | null
          id?: string
          metadata?: Json | null
          page_number: number
          parent_element_id?: string | null
          pdf_processing_id: string
          structure_type: string
        }
        Update: {
          bounding_box?: Json | null
          confidence_score?: number | null
          content?: string | null
          created_at?: string | null
          hierarchy_level?: number | null
          id?: string
          metadata?: Json | null
          page_number?: number
          parent_element_id?: string | null
          pdf_processing_id?: string
          structure_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdf_document_structure_parent_element_id_fkey"
            columns: ["parent_element_id"]
            isOneToOne: false
            referencedRelation: "pdf_document_structure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdf_document_structure_pdf_processing_id_fkey"
            columns: ["pdf_processing_id"]
            isOneToOne: false
            referencedRelation: "pdf_processing_results"
            referencedColumns: ["id"]
          },
        ]
      }
      pdf_extracted_images: {
        Row: {
          bounding_box: Json | null
          created_at: string | null
          dimensions: Json | null
          extracted_text: string | null
          id: string
          image_embedding: string | null
          image_index: number
          image_type: string | null
          image_url: string | null
          material_confidence: number | null
          material_detected: boolean | null
          metadata: Json | null
          page_number: number
          pdf_processing_id: string
          tile_id: string | null
          updated_at: string | null
        }
        Insert: {
          bounding_box?: Json | null
          created_at?: string | null
          dimensions?: Json | null
          extracted_text?: string | null
          id?: string
          image_embedding?: string | null
          image_index: number
          image_type?: string | null
          image_url?: string | null
          material_confidence?: number | null
          material_detected?: boolean | null
          metadata?: Json | null
          page_number: number
          pdf_processing_id: string
          tile_id?: string | null
          updated_at?: string | null
        }
        Update: {
          bounding_box?: Json | null
          created_at?: string | null
          dimensions?: Json | null
          extracted_text?: string | null
          id?: string
          image_embedding?: string | null
          image_index?: number
          image_type?: string | null
          image_url?: string | null
          material_confidence?: number | null
          material_detected?: boolean | null
          metadata?: Json | null
          page_number?: number
          pdf_processing_id?: string
          tile_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pdf_extracted_images_pdf_processing_id_fkey"
            columns: ["pdf_processing_id"]
            isOneToOne: false
            referencedRelation: "pdf_processing_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdf_extracted_images_tile_id_fkey"
            columns: ["tile_id"]
            isOneToOne: false
            referencedRelation: "pdf_processing_tiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pdf_material_correlations: {
        Row: {
          confidence_score: number
          correlation_data: Json | null
          correlation_type: string
          created_at: string | null
          id: string
          pdf_processing_id: string
          primary_tile_id: string
          related_tile_id: string
        }
        Insert: {
          confidence_score: number
          correlation_data?: Json | null
          correlation_type: string
          created_at?: string | null
          id?: string
          pdf_processing_id: string
          primary_tile_id: string
          related_tile_id: string
        }
        Update: {
          confidence_score?: number
          correlation_data?: Json | null
          correlation_type?: string
          created_at?: string | null
          id?: string
          pdf_processing_id?: string
          primary_tile_id?: string
          related_tile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdf_material_correlations_pdf_processing_id_fkey"
            columns: ["pdf_processing_id"]
            isOneToOne: false
            referencedRelation: "pdf_processing_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdf_material_correlations_primary_tile_id_fkey"
            columns: ["primary_tile_id"]
            isOneToOne: false
            referencedRelation: "pdf_processing_tiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdf_material_correlations_related_tile_id_fkey"
            columns: ["related_tile_id"]
            isOneToOne: false
            referencedRelation: "pdf_processing_tiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pdf_processing_results: {
        Row: {
          azure_confidence_score: number | null
          azure_model_used: string | null
          confidence_score_avg: number | null
          created_at: string
          cross_page_references: Json | null
          document_author: string | null
          document_classification: Json | null
          document_keywords: string | null
          document_structure: Json | null
          document_subject: string | null
          document_title: string | null
          error_message: string | null
          extracted_images: Json | null
          extracted_tables: Json | null
          extraction_options: Json | null
          file_size: number | null
          file_url: string
          form_fields: Json | null
          id: string
          layout_analysis_version: string | null
          material_recognition_model_version: string | null
          materials_identified_count: number | null
          ocr_model_version: string | null
          original_filename: string
          overlap_percentage: number | null
          processing_completed_at: string | null
          processing_started_at: string | null
          processing_status: string
          processing_time_ms: number | null
          python_processor_version: string | null
          tile_size_pixels: number | null
          total_pages: number | null
          total_tiles_extracted: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          azure_confidence_score?: number | null
          azure_model_used?: string | null
          confidence_score_avg?: number | null
          created_at?: string
          cross_page_references?: Json | null
          document_author?: string | null
          document_classification?: Json | null
          document_keywords?: string | null
          document_structure?: Json | null
          document_subject?: string | null
          document_title?: string | null
          error_message?: string | null
          extracted_images?: Json | null
          extracted_tables?: Json | null
          extraction_options?: Json | null
          file_size?: number | null
          file_url: string
          form_fields?: Json | null
          id?: string
          layout_analysis_version?: string | null
          material_recognition_model_version?: string | null
          materials_identified_count?: number | null
          ocr_model_version?: string | null
          original_filename: string
          overlap_percentage?: number | null
          processing_completed_at?: string | null
          processing_started_at?: string | null
          processing_status?: string
          processing_time_ms?: number | null
          python_processor_version?: string | null
          tile_size_pixels?: number | null
          total_pages?: number | null
          total_tiles_extracted?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          azure_confidence_score?: number | null
          azure_model_used?: string | null
          confidence_score_avg?: number | null
          created_at?: string
          cross_page_references?: Json | null
          document_author?: string | null
          document_classification?: Json | null
          document_keywords?: string | null
          document_structure?: Json | null
          document_subject?: string | null
          document_title?: string | null
          error_message?: string | null
          extracted_images?: Json | null
          extracted_tables?: Json | null
          extraction_options?: Json | null
          file_size?: number | null
          file_url?: string
          form_fields?: Json | null
          id?: string
          layout_analysis_version?: string | null
          material_recognition_model_version?: string | null
          materials_identified_count?: number | null
          ocr_model_version?: string | null
          original_filename?: string
          overlap_percentage?: number | null
          processing_completed_at?: string | null
          processing_started_at?: string | null
          processing_status?: string
          processing_time_ms?: number | null
          python_processor_version?: string | null
          tile_size_pixels?: number | null
          total_pages?: number | null
          total_tiles_extracted?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pdf_processing_tiles: {
        Row: {
          azure_confidence: number | null
          azure_element_type: string | null
          bounding_polygon: Json | null
          created_at: string
          cross_references: Json | null
          document_element_type: string | null
          extracted_images: Json | null
          extracted_text: string | null
          form_field_info: Json | null
          height: number
          id: string
          image_embedding: string | null
          image_embeddings: Json | null
          image_url: string | null
          layout_confidence: number | null
          material_confidence: number | null
          material_detected: boolean | null
          material_type: string | null
          metadata_extracted: Json | null
          ocr_confidence: number | null
          page_number: number
          pdf_processing_id: string
          pymupdf_data: Json | null
          related_material_id: string | null
          structured_data: Json | null
          table_cell_info: Json | null
          text_embedding: string | null
          tile_index: number
          updated_at: string
          width: number
          x_coordinate: number
          y_coordinate: number
        }
        Insert: {
          azure_confidence?: number | null
          azure_element_type?: string | null
          bounding_polygon?: Json | null
          created_at?: string
          cross_references?: Json | null
          document_element_type?: string | null
          extracted_images?: Json | null
          extracted_text?: string | null
          form_field_info?: Json | null
          height: number
          id?: string
          image_embedding?: string | null
          image_embeddings?: Json | null
          image_url?: string | null
          layout_confidence?: number | null
          material_confidence?: number | null
          material_detected?: boolean | null
          material_type?: string | null
          metadata_extracted?: Json | null
          ocr_confidence?: number | null
          page_number: number
          pdf_processing_id: string
          pymupdf_data?: Json | null
          related_material_id?: string | null
          structured_data?: Json | null
          table_cell_info?: Json | null
          text_embedding?: string | null
          tile_index: number
          updated_at?: string
          width: number
          x_coordinate: number
          y_coordinate: number
        }
        Update: {
          azure_confidence?: number | null
          azure_element_type?: string | null
          bounding_polygon?: Json | null
          created_at?: string
          cross_references?: Json | null
          document_element_type?: string | null
          extracted_images?: Json | null
          extracted_text?: string | null
          form_field_info?: Json | null
          height?: number
          id?: string
          image_embedding?: string | null
          image_embeddings?: Json | null
          image_url?: string | null
          layout_confidence?: number | null
          material_confidence?: number | null
          material_detected?: boolean | null
          material_type?: string | null
          metadata_extracted?: Json | null
          ocr_confidence?: number | null
          page_number?: number
          pdf_processing_id?: string
          pymupdf_data?: Json | null
          related_material_id?: string | null
          structured_data?: Json | null
          table_cell_info?: Json | null
          text_embedding?: string | null
          tile_index?: number
          updated_at?: string
          width?: number
          x_coordinate?: number
          y_coordinate?: number
        }
        Relationships: [
          {
            foreignKeyName: "pdf_processing_tiles_pdf_processing_id_fkey"
            columns: ["pdf_processing_id"]
            isOneToOne: false
            referencedRelation: "pdf_processing_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdf_processing_tiles_related_material_id_fkey"
            columns: ["related_material_id"]
            isOneToOne: false
            referencedRelation: "materials_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      processing_queue: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          input_data: Json
          job_type: string
          priority: number | null
          processing_time_ms: number | null
          result: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["processing_status"] | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          input_data: Json
          job_type: string
          priority?: number | null
          processing_time_ms?: number | null
          result?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["processing_status"] | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          input_data?: Json
          job_type?: string
          priority?: number | null
          processing_time_ms?: number | null
          result?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["processing_status"] | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      query_intelligence: {
        Row: {
          clicked_results: string[] | null
          created_at: string
          entities_detected: Json | null
          id: string
          original_query: string
          processed_query: string
          project_context: Json | null
          query_embedding: string | null
          query_intent: string | null
          query_type: string | null
          results_returned: number | null
          session_context: Json | null
          user_context: Json | null
          user_id: string | null
          user_satisfaction: number | null
        }
        Insert: {
          clicked_results?: string[] | null
          created_at?: string
          entities_detected?: Json | null
          id?: string
          original_query: string
          processed_query: string
          project_context?: Json | null
          query_embedding?: string | null
          query_intent?: string | null
          query_type?: string | null
          results_returned?: number | null
          session_context?: Json | null
          user_context?: Json | null
          user_id?: string | null
          user_satisfaction?: number | null
        }
        Update: {
          clicked_results?: string[] | null
          created_at?: string
          entities_detected?: Json | null
          id?: string
          original_query?: string
          processed_query?: string
          project_context?: Json | null
          query_embedding?: string | null
          query_intent?: string | null
          query_type?: string | null
          results_returned?: number | null
          session_context?: Json | null
          user_context?: Json | null
          user_id?: string | null
          user_satisfaction?: number | null
        }
        Relationships: []
      }
      rate_limit_rules: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          requests_per_minute: number
          target_type: string
          target_value: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          requests_per_minute: number
          target_type: string
          target_value: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          requests_per_minute?: number
          target_type?: string
          target_value?: string
          updated_at?: string
        }
        Relationships: []
      }
      recognition_results: {
        Row: {
          ai_model_version: string | null
          confidence_score: number | null
          created_at: string | null
          detection_method: Database["public"]["Enums"]["detection_method"]
          embedding: string | null
          file_id: string
          id: string
          material_id: string | null
          processing_time_ms: number | null
          properties_detected: Json | null
          user_verified: boolean | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          ai_model_version?: string | null
          confidence_score?: number | null
          created_at?: string | null
          detection_method: Database["public"]["Enums"]["detection_method"]
          embedding?: string | null
          file_id: string
          id?: string
          material_id?: string | null
          processing_time_ms?: number | null
          properties_detected?: Json | null
          user_verified?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          ai_model_version?: string | null
          confidence_score?: number | null
          created_at?: string | null
          detection_method?: Database["public"]["Enums"]["detection_method"]
          embedding?: string | null
          file_id?: string
          id?: string
          material_id?: string | null
          processing_time_ms?: number | null
          properties_detected?: Json | null
          user_verified?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recognition_results_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "uploaded_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recognition_results_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      search_analytics: {
        Row: {
          avg_relevance_score: number | null
          clicks_count: number | null
          created_at: string
          follow_up_queries: string[] | null
          id: string
          query_embedding: string | null
          query_processing_time_ms: number | null
          query_text: string
          refinements_count: number | null
          response_time_ms: number | null
          results_shown: number | null
          satisfaction_rating: number | null
          session_id: string | null
          time_on_results: number | null
          total_results: number | null
          user_id: string | null
        }
        Insert: {
          avg_relevance_score?: number | null
          clicks_count?: number | null
          created_at?: string
          follow_up_queries?: string[] | null
          id?: string
          query_embedding?: string | null
          query_processing_time_ms?: number | null
          query_text: string
          refinements_count?: number | null
          response_time_ms?: number | null
          results_shown?: number | null
          satisfaction_rating?: number | null
          session_id?: string | null
          time_on_results?: number | null
          total_results?: number | null
          user_id?: string | null
        }
        Update: {
          avg_relevance_score?: number | null
          clicks_count?: number | null
          created_at?: string
          follow_up_queries?: string[] | null
          id?: string
          query_embedding?: string | null
          query_processing_time_ms?: number | null
          query_text?: string
          refinements_count?: number | null
          response_time_ms?: number | null
          results_shown?: number | null
          satisfaction_rating?: number | null
          session_id?: string | null
          time_on_results?: number | null
          total_results?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      semantic_similarity_cache: {
        Row: {
          created_at: string
          expires_at: string | null
          hit_count: number | null
          id: string
          last_accessed: string | null
          query_embedding: string | null
          query_hash: string
          results: Json
          similarity_threshold: number | null
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          hit_count?: number | null
          id?: string
          last_accessed?: string | null
          query_embedding?: string | null
          query_hash: string
          results: Json
          similarity_threshold?: number | null
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          hit_count?: number | null
          id?: string
          last_accessed?: string | null
          query_embedding?: string | null
          query_hash?: string
          results?: Json
          similarity_threshold?: number | null
        }
        Relationships: []
      }
      spatial_analysis: {
        Row: {
          accessibility_analysis: Json | null
          confidence_score: number | null
          created_at: string
          error_message: string | null
          flow_optimization: Json | null
          id: string
          layout_suggestions: Json | null
          material_placements: Json | null
          nerf_reconstruction_id: string | null
          processing_time_ms: number | null
          reasoning_explanation: string | null
          room_dimensions: Json | null
          room_type: string
          spatial_features: Json | null
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accessibility_analysis?: Json | null
          confidence_score?: number | null
          created_at?: string
          error_message?: string | null
          flow_optimization?: Json | null
          id?: string
          layout_suggestions?: Json | null
          material_placements?: Json | null
          nerf_reconstruction_id?: string | null
          processing_time_ms?: number | null
          reasoning_explanation?: string | null
          room_dimensions?: Json | null
          room_type: string
          spatial_features?: Json | null
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accessibility_analysis?: Json | null
          confidence_score?: number | null
          created_at?: string
          error_message?: string | null
          flow_optimization?: Json | null
          id?: string
          layout_suggestions?: Json | null
          material_placements?: Json | null
          nerf_reconstruction_id?: string | null
          processing_time_ms?: number | null
          reasoning_explanation?: string | null
          room_dimensions?: Json | null
          room_type?: string
          spatial_features?: Json | null
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      svbrdf_extractions: {
        Row: {
          albedo_map_url: string | null
          confidence_score: number | null
          created_at: string
          error_message: string | null
          extracted_properties: Json | null
          extraction_status: string | null
          height_map_url: string | null
          id: string
          material_id: string | null
          metadata: Json | null
          metallic_map_url: string | null
          normal_map_url: string | null
          processing_time_ms: number | null
          roughness_map_url: string | null
          source_image_url: string
          updated_at: string
          user_id: string
        }
        Insert: {
          albedo_map_url?: string | null
          confidence_score?: number | null
          created_at?: string
          error_message?: string | null
          extracted_properties?: Json | null
          extraction_status?: string | null
          height_map_url?: string | null
          id?: string
          material_id?: string | null
          metadata?: Json | null
          metallic_map_url?: string | null
          normal_map_url?: string | null
          processing_time_ms?: number | null
          roughness_map_url?: string | null
          source_image_url: string
          updated_at?: string
          user_id: string
        }
        Update: {
          albedo_map_url?: string | null
          confidence_score?: number | null
          created_at?: string
          error_message?: string | null
          extracted_properties?: Json | null
          extraction_status?: string | null
          height_map_url?: string | null
          id?: string
          material_id?: string | null
          metadata?: Json | null
          metallic_map_url?: string | null
          normal_map_url?: string | null
          processing_time_ms?: number | null
          roughness_map_url?: string | null
          source_image_url?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      uploaded_files: {
        Row: {
          created_at: string | null
          file_name: string
          file_size: number | null
          file_type: string
          id: string
          metadata: Json | null
          storage_path: string
          upload_status: Database["public"]["Enums"]["processing_status"] | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_size?: number | null
          file_type: string
          id?: string
          metadata?: Json | null
          storage_path: string
          upload_status?:
            | Database["public"]["Enums"]["processing_status"]
            | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string
          id?: string
          metadata?: Json | null
          storage_path?: string
          upload_status?:
            | Database["public"]["Enums"]["processing_status"]
            | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      binary_quantize: {
        Args: { "": string } | { "": unknown }
        Returns: unknown
      }
      enhanced_vector_search: {
        Args: {
          query_embedding: string
          search_type?: string
          embedding_types?: string[]
          match_threshold?: number
          match_count?: number
        }
        Returns: {
          result_type: string
          id: string
          similarity_score: number
          title: string
          content: string
          metadata: Json
        }[]
      }
      get_current_user_roles: {
        Args: Record<PropertyKey, never>
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      get_rate_limit: {
        Args: {
          endpoint_path: string
          ip_addr: unknown
          user_id_param?: string
        }
        Returns: number
      }
      halfvec_avg: {
        Args: { "": number[] }
        Returns: unknown
      }
      halfvec_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      halfvec_send: {
        Args: { "": unknown }
        Returns: string
      }
      halfvec_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      has_role: {
        Args: {
          _user_id: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      hnsw_bit_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnsw_halfvec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnsw_sparsevec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnswhandler: {
        Args: { "": unknown }
        Returns: unknown
      }
      is_internal_ip: {
        Args: { ip_addr: unknown }
        Returns: boolean
      }
      ivfflat_bit_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflat_halfvec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflathandler: {
        Args: { "": unknown }
        Returns: unknown
      }
      l2_norm: {
        Args: { "": unknown } | { "": unknown }
        Returns: number
      }
      l2_normalize: {
        Args: { "": string } | { "": unknown } | { "": unknown }
        Returns: string
      }
      sparsevec_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      sparsevec_send: {
        Args: { "": unknown }
        Returns: string
      }
      sparsevec_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      vector_avg: {
        Args: { "": number[] }
        Returns: string
      }
      vector_dims: {
        Args: { "": string } | { "": unknown }
        Returns: number
      }
      vector_norm: {
        Args: { "": string }
        Returns: number
      }
      vector_out: {
        Args: { "": string }
        Returns: unknown
      }
      vector_send: {
        Args: { "": string }
        Returns: string
      }
      vector_similarity_search: {
        Args: {
          query_embedding: string
          image_embedding?: string
          match_threshold?: number
          match_count?: number
        }
        Returns: {
          material_id: string
          similarity_score: number
          material_name: string
          properties: Json
          category: Database["public"]["Enums"]["material_category"]
        }[]
      }
      vector_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "analyst" | "factory"
      detection_method:
        | "visual"
        | "spectral"
        | "thermal"
        | "ocr"
        | "voice"
        | "combined"
      material_category:
        | "metals"
        | "plastics"
        | "ceramics"
        | "composites"
        | "textiles"
        | "wood"
        | "glass"
        | "rubber"
        | "concrete"
        | "other"
      processing_status:
        | "pending"
        | "processing"
        | "completed"
        | "failed"
        | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "analyst", "factory"],
      detection_method: [
        "visual",
        "spectral",
        "thermal",
        "ocr",
        "voice",
        "combined",
      ],
      material_category: [
        "metals",
        "plastics",
        "ceramics",
        "composites",
        "textiles",
        "wood",
        "glass",
        "rubber",
        "concrete",
        "other",
      ],
      processing_status: [
        "pending",
        "processing",
        "completed",
        "failed",
        "cancelled",
      ],
    },
  },
} as const
