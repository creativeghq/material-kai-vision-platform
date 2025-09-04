export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      agent_ml_tasks: {
        Row: {
          agent_task_id: string | null
          confidence_scores: Json
          created_at: string | null
          id: string
          input_data: Json
          ml_operation_type: string
          ml_results: Json
          model_versions: Json
          processing_time_ms: number | null
        }
        Insert: {
          agent_task_id?: string | null
          confidence_scores: Json
          created_at?: string | null
          id?: string
          input_data: Json
          ml_operation_type: string
          ml_results: Json
          model_versions: Json
          processing_time_ms?: number | null
        }
        Update: {
          agent_task_id?: string | null
          confidence_scores?: Json
          created_at?: string | null
          id?: string
          input_data?: Json
          ml_operation_type?: string
          ml_results?: Json
          model_versions?: Json
          processing_time_ms?: number | null
        }
        Relationships: []
      }
      agent_tasks: {
        Row: {
          id: string
          user_id: string | null
          workspace_id: string | null
          task_name: string
          task_type: string
          task_status: string
          priority: string
          description: string | null
          input_data: Json
          output_data: Json
          task_config: Json
          progress_percentage: number
          error_message: string | null
          processing_time_ms: number | null
          estimated_completion_time: string | null
          dependencies: Json
          parent_task_id: string | null
          assigned_agent: string | null
          tags: Json
          metadata: Json
          created_at: string | null
          updated_at: string | null
          started_at: string | null
          completed_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          workspace_id?: string | null
          task_name: string
          task_type: string
          task_status?: string
          priority?: string
          description?: string | null
          input_data?: Json
          output_data?: Json
          task_config?: Json
          progress_percentage?: number
          error_message?: string | null
          processing_time_ms?: number | null
          estimated_completion_time?: string | null
          dependencies?: Json
          parent_task_id?: string | null
          assigned_agent?: string | null
          tags?: Json
          metadata?: Json
          created_at?: string | null
          updated_at?: string | null
          started_at?: string | null
          completed_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          workspace_id?: string | null
          task_name?: string
          task_type?: string
          task_status?: string
          priority?: string
          description?: string | null
          input_data?: Json
          output_data?: Json
          task_config?: Json
          progress_percentage?: number
          error_message?: string | null
          processing_time_ms?: number | null
          estimated_completion_time?: string | null
          dependencies?: Json
          parent_task_id?: string | null
          assigned_agent?: string | null
          tags?: Json
          metadata?: Json
          created_at?: string | null
          updated_at?: string | null
          started_at?: string | null
          completed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'agent_tasks_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'agent_tasks_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'agent_tasks_parent_task_id_fkey'
            columns: ['parent_task_id']
            isOneToOne: false
            referencedRelation: 'agent_tasks'
            referencedColumns: ['id']
          }
        ]
      }
      analytics_events: {
        Row: {
          id: string
          user_id: string | null
          event_type: string
          event_data: Json
          session_id: string | null
          ip_address: string | null
          user_agent: string | null
          page_url: string | null
          referrer: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          event_type: string
          event_data?: Json
          session_id?: string | null
          ip_address?: string | null
          user_agent?: string | null
          page_url?: string | null
          referrer?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          event_type?: string
          event_data?: Json
          session_id?: string | null
          ip_address?: string | null
          user_agent?: string | null
          page_url?: string | null
          referrer?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'analytics_events_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
      api_keys: {
        Row: {
          id: string
          api_key: string
          user_id: string | null
          name: string
          is_active: boolean
          allowed_endpoints: Json
          expires_at: string | null
          last_used_at: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          api_key: string
          user_id?: string | null
          name: string
          is_active?: boolean
          allowed_endpoints?: Json
          expires_at?: string | null
          last_used_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          api_key?: string
          user_id?: string | null
          name?: string
          is_active?: boolean
          allowed_endpoints?: Json
          expires_at?: string | null
          last_used_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'api_keys_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
      api_usage_logs: {
        Row: {
          id: string
          api_key_id: string
          endpoint: string
          method: string
          status_code: number
          response_time_ms: number | null
          request_size_bytes: number | null
          response_size_bytes: number | null
          ip_address: string | null
          user_agent: string | null
          error_message: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          api_key_id: string
          endpoint: string
          method: string
          status_code: number
          response_time_ms?: number | null
          request_size_bytes?: number | null
          response_size_bytes?: number | null
          ip_address?: string | null
          user_agent?: string | null
          error_message?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          api_key_id?: string
          endpoint?: string
          method?: string
          status_code?: number
          response_time_ms?: number | null
          request_size_bytes?: number | null
          response_size_bytes?: number | null
          ip_address?: string | null
          user_agent?: string | null
          error_message?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'api_usage_logs_api_key_id_fkey'
            columns: ['api_key_id']
            isOneToOne: false
            referencedRelation: 'api_keys'
            referencedColumns: ['id']
          }
        ]
      }
      generation_3d: {
        Row: {
          id: string
          user_id: string | null
          workspace_id: string | null
          generation_name: string
          generation_type: string
          generation_status: string
          input_data: Json
          output_data: Json
          generation_config: Json
          progress_percentage: number
          error_message: string | null
          processing_time_ms: number | null
          estimated_completion_time: string | null
          file_urls: Json
          preview_url: string | null
          download_url: string | null
          file_size_bytes: number | null
          quality_score: number | null
          tags: Json
          metadata: Json
          created_at: string | null
          updated_at: string | null
          started_at: string | null
          completed_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          workspace_id?: string | null
          generation_name: string
          generation_type: string
          generation_status?: string
          input_data?: Json
          output_data?: Json
          generation_config?: Json
          progress_percentage?: number
          error_message?: string | null
          processing_time_ms?: number | null
          estimated_completion_time?: string | null
          file_urls?: Json
          preview_url?: string | null
          download_url?: string | null
          file_size_bytes?: number | null
          quality_score?: number | null
          tags?: Json
          metadata?: Json
          created_at?: string | null
          updated_at?: string | null
          started_at?: string | null
          completed_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          workspace_id?: string | null
          generation_name?: string
          generation_type?: string
          generation_status?: string
          input_data?: Json
          output_data?: Json
          generation_config?: Json
          progress_percentage?: number
          error_message?: string | null
          processing_time_ms?: number | null
          estimated_completion_time?: string | null
          file_urls?: Json
          preview_url?: string | null
          download_url?: string | null
          file_size_bytes?: number | null
          quality_score?: number | null
          tags?: Json
          metadata?: Json
          created_at?: string | null
          updated_at?: string | null
          started_at?: string | null
          completed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'generation_3d_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'generation_3d_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          }
        ]
      }
      scraped_materials_temp: {
        Row: {
          id: string
          session_id: string
          url: string
          title: string | null
          description: string | null
          image_url: string | null
          price: string | null
          availability: string | null
          material_type: string | null
          brand: string | null
          specifications: Json | null
          scraped_at: string
          processing_status: string | null
          confidence_score: number | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          session_id: string
          url: string
          title?: string | null
          description?: string | null
          image_url?: string | null
          price?: string | null
          availability?: string | null
          material_type?: string | null
          brand?: string | null
          specifications?: Json | null
          scraped_at?: string
          processing_status?: string | null
          confidence_score?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          session_id?: string
          url?: string
          title?: string | null
          description?: string | null
          image_url?: string | null
          price?: string | null
          availability?: string | null
          material_type?: string | null
          brand?: string | null
          specifications?: Json | null
          scraped_at?: string
          processing_status?: string | null
          confidence_score?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'scraped_materials_temp_session_id_fkey'
            columns: ['session_id']
            isOneToOne: false
            referencedRelation: 'scraping_sessions'
            referencedColumns: ['id']
          }
        ]
      }
      scraping_sessions: {
        Row: {
          id: string
          session_id: string
          user_id: string | null
          source_url: string
          status: string
          scraping_config: Json | null
          progress_percentage: number | null
          total_pages: number | null
          completed_pages: number | null
          failed_pages: number | null
          materials_processed: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          session_id: string
          user_id?: string | null
          source_url: string
          status?: string
          scraping_config?: Json | null
          progress_percentage?: number | null
          total_pages?: number | null
          completed_pages?: number | null
          failed_pages?: number | null
          materials_processed?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          user_id?: string | null
          source_url?: string
          status?: string
          scraping_config?: Json | null
          progress_percentage?: number | null
          total_pages?: number | null
          completed_pages?: number | null
          failed_pages?: number | null
          materials_processed?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      scraping_pages: {
        Row: {
          id: string
          session_id: string
          url: string
          status: string
          page_index: number | null
          materials_found: number | null
          processing_time_ms: number | null
          error_message: string | null
          started_at: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          session_id: string
          url: string
          status?: string
          page_index?: number | null
          materials_found?: number | null
          processing_time_ms?: number | null
          error_message?: string | null
          started_at?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          url?: string
          status?: string
          page_index?: number | null
          materials_found?: number | null
          processing_time_ms?: number | null
          error_message?: string | null
          started_at?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'scraping_pages_session_id_fkey'
            columns: ['session_id']
            isOneToOne: false
            referencedRelation: 'scraping_sessions'
            referencedColumns: ['id']
          }
        ]
      }
      materials_catalog: {
        Row: {
          category: string
          chemical_composition: Json | null
          created_at: string | null
          created_by: string | null
          description: string | null
          embedding: string | null
          embedding_1536: string | null
          id: string
          llama_analysis: Json | null
          name: string
          properties: Json | null
          safety_data: Json | null
          standards: string[] | null
          thumbnail_url: string | null
          updated_at: string | null
          visual_analysis_confidence: number | null
          visual_embedding_1536: string | null
          visual_embedding_512: string | null
        }
        Insert: {
          category: string
          chemical_composition?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          embedding?: string | null
          embedding_1536?: string | null
          id?: string
          llama_analysis?: Json | null
          name: string
          properties?: Json | null
          safety_data?: Json | null
          standards?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string | null
          visual_analysis_confidence?: number | null
          visual_embedding_1536?: string | null
          visual_embedding_512?: string | null
        }
        Update: {
          category?: string
          chemical_composition?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          embedding?: string | null
          embedding_1536?: string | null
          id?: string
          llama_analysis?: Json | null
          name?: string
          properties?: Json | null
          safety_data?: Json | null
          standards?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string | null
          visual_analysis_confidence?: number | null
          visual_embedding_1536?: string | null
          visual_embedding_512?: string | null
        }
        Relationships: []
      }
      material_visual_analysis: {
        Row: {
          analysis_confidence: number | null
          clip_embedding: string | null
          clip_model_version: string | null
          color_description: string | null
          created_at: string | null
          created_by: string | null
          description_embedding: string | null
          error_message: string | null
          finish_type: string | null
          id: string
          image_dimensions: Json | null
          llama_analysis_prompt_hash: string | null
          llama_confidence_score: number | null
          llama_model_version: string
          llama_processing_time_ms: number | null
          material_id: string
          material_type: string
          material_type_embedding: string | null
          pattern_grain: string | null
          processing_status: string | null
          reflectivity: string | null
          source_image_hash: string | null
          source_image_url: string | null
          structural_properties: Json | null
          surface_texture: string | null
          updated_at: string | null
          visual_characteristics: string | null
        }
        Insert: {
          analysis_confidence?: number | null
          clip_embedding?: string | null
          clip_model_version?: string | null
          color_description?: string | null
          created_at?: string | null
          created_by?: string | null
          description_embedding?: string | null
          error_message?: string | null
          finish_type?: string | null
          id?: string
          image_dimensions?: Json | null
          llama_analysis_prompt_hash?: string | null
          llama_confidence_score?: number | null
          llama_model_version?: string
          llama_processing_time_ms?: number | null
          material_id: string
          material_type: string
          material_type_embedding?: string | null
          pattern_grain?: string | null
          processing_status?: string | null
          reflectivity?: string | null
          source_image_hash?: string | null
          source_image_url?: string | null
          structural_properties?: Json | null
          surface_texture?: string | null
          updated_at?: string | null
          visual_characteristics?: string | null
        }
        Update: {
          analysis_confidence?: number | null
          clip_embedding?: string | null
          clip_model_version?: string | null
          color_description?: string | null
          created_at?: string | null
          created_by?: string | null
          description_embedding?: string | null
          error_message?: string | null
          finish_type?: string | null
          id?: string
          image_dimensions?: Json | null
          llama_analysis_prompt_hash?: string | null
          llama_confidence_score?: number | null
          llama_model_version?: string
          llama_processing_time_ms?: number | null
          material_id?: string
          material_type?: string
          material_type_embedding?: string | null
          pattern_grain?: string | null
          processing_status?: string | null
          reflectivity?: string | null
          source_image_hash?: string | null
          source_image_url?: string | null
          structural_properties?: Json | null
          surface_texture?: string | null
          updated_at?: string | null
          visual_characteristics?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_visual_analysis_material_id_fkey"
            columns: ["material_id"]
            referencedRelation: "materials_catalog"
            referencedColumns: ["id"]
          }
        ]
      }
      visual_analysis_queue: {
        Row: {
          analysis_type: string[] | null
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          image_hash: string | null
          image_url: string
          material_id: string | null
          priority: number | null
          processing_options: Json | null
          processing_time_ms: number | null
          result_analysis_id: string | null
          started_at: string | null
          status: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          analysis_type?: string[] | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          image_hash?: string | null
          image_url: string
          material_id?: string | null
          priority?: number | null
          processing_options?: Json | null
          processing_time_ms?: number | null
          result_analysis_id?: string | null
          started_at?: string | null
          status?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          analysis_type?: string[] | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          image_hash?: string | null
          image_url?: string
          material_id?: string | null
          priority?: number | null
          processing_options?: Json | null
          processing_time_ms?: number | null
          result_analysis_id?: string | null
          started_at?: string | null
          status?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visual_analysis_queue_material_id_fkey"
            columns: ["material_id"]
            referencedRelation: "materials_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visual_analysis_queue_result_analysis_id_fkey"
            columns: ["result_analysis_id"]
            referencedRelation: "material_visual_analysis"
            referencedColumns: ["id"]
          }
        ]
      }
      visual_search_history: {
        Row: {
          average_similarity_score: number | null
          created_at: string | null
          id: string
          max_results: number | null
          query_clip_embedding: string | null
          query_description_embedding: string | null
          query_image_hash: string | null
          query_image_url: string | null
          query_llama_analysis: Json | null
          result_count: number | null
          search_execution_time_ms: number | null
          search_filters: Json | null
          search_type: string
          session_id: string | null
          similarity_threshold: number | null
          top_similarity_score: number | null
          user_id: string | null
        }
        Insert: {
          average_similarity_score?: number | null
          created_at?: string | null
          id?: string
          max_results?: number | null
          query_clip_embedding?: string | null
          query_description_embedding?: string | null
          query_image_hash?: string | null
          query_image_url?: string | null
          query_llama_analysis?: Json | null
          result_count?: number | null
          search_execution_time_ms?: number | null
          search_filters?: Json | null
          search_type: string
          session_id?: string | null
          similarity_threshold?: number | null
          top_similarity_score?: number | null
          user_id?: string | null
        }
        Update: {
          average_similarity_score?: number | null
          created_at?: string | null
          id?: string
          max_results?: number | null
          query_clip_embedding?: string | null
          query_description_embedding?: string | null
          query_image_hash?: string | null
          query_image_url?: string | null
          query_llama_analysis?: Json | null
          result_count?: number | null
          search_execution_time_ms?: number | null
          search_filters?: Json | null
          search_type?: string
          session_id?: string | null
          similarity_threshold?: number | null
          top_similarity_score?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      processing_results: {
        Row: {
          batch_id: string | null
          completed_at: string | null
          created_at: string | null
          document_id: string
          error_message: string | null
          extraction_type: string
          file_size_bytes: number | null
          id: string
          page_count: number | null
          priority: string | null
          processing_options: Json | null
          processing_time_ms: number | null
          results: Json | null
          started_at: string | null
          status: string
          updated_at: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          batch_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          document_id: string
          error_message?: string | null
          extraction_type: string
          file_size_bytes?: number | null
          id?: string
          page_count?: number | null
          priority?: string | null
          processing_options?: Json | null
          processing_time_ms?: number | null
          results?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          batch_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          document_id?: string
          error_message?: string | null
          extraction_type?: string
          file_size_bytes?: number | null
          id?: string
          page_count?: number | null
          priority?: string | null
          processing_options?: Json | null
          processing_time_ms?: number | null
          results?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      workspaces: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          settings: Json | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          settings?: Json | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          settings?: Json | null
          updated_at?: string | null
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
    | keyof (Database['public']['Tables'] & Database['public']['Views'])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions['schema']]['Tables'] &
        Database[PublicTableNameOrOptions['schema']]['Views'])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions['schema']]['Tables'] &
      Database[PublicTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (Database['public']['Tables'] &
        Database['public']['Views'])
    ? (Database['public']['Tables'] &
        Database['public']['Views'])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof Database['public']['Tables']
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions['schema']]['Tables']
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof Database['public']['Tables']
    ? Database['public']['Tables'][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof Database['public']['Tables']
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions['schema']]['Tables']
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof Database['public']['Tables']
    ? Database['public']['Tables'][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof Database['public']['Enums']
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions['schema']]['Enums'][EnumName]
  : PublicEnumNameOrOptions extends keyof Database['public']['Enums']
    ? Database['public']['Enums'][PublicEnumNameOrOptions]
    : never
