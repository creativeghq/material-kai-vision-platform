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
            foreignKeyName: "scraped_materials_temp_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "scraping_sessions"
            referencedColumns: ["id"]
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
            foreignKeyName: "scraping_pages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "scraping_sessions"
            referencedColumns: ["id"]
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
          name: string
          properties: Json | null
          safety_data: Json | null
          standards: string[] | null
          thumbnail_url: string | null
          updated_at: string | null
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
          name: string
          properties?: Json | null
          safety_data?: Json | null
          standards?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string | null
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
          name?: string
          properties?: Json | null
          safety_data?: Json | null
          standards?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string | null
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
    | keyof (Database["public"]["Tables"] & Database["public"]["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (Database["public"]["Tables"] &
        Database["public"]["Views"])
    ? (Database["public"]["Tables"] &
        Database["public"]["Views"])[PublicTableNameOrOptions] extends {
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
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
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
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
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
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof Database["public"]["Enums"]
    ? Database["public"]["Enums"][PublicEnumNameOrOptions]
    : never
