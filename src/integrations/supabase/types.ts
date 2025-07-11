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
