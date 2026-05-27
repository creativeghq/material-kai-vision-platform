export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agent_chat_conversations: {
        Row: {
          agent_id: string
          created_at: string | null
          description: string | null
          id: string
          is_archived: boolean | null
          last_message_at: string | null
          message_count: number | null
          messages: Json | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean | null
          last_message_at?: string | null
          message_count?: number | null
          messages?: Json | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean | null
          last_message_at?: string | null
          message_count?: number | null
          messages?: Json | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      agent_chat_messages: {
        Row: {
          attachment_ids: string[] | null
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          metadata: Json | null
          role: string
        }
        Insert: {
          attachment_ids?: string[] | null
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          role: string
        }
        Update: {
          attachment_ids?: string[] | null
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "agent_chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_checkpoints: {
        Row: {
          checkpoint_data: Json
          created_at: string
          id: string
          thread_id: string
          updated_at: string
        }
        Insert: {
          checkpoint_data?: Json
          created_at?: string
          id?: string
          thread_id: string
          updated_at?: string
        }
        Update: {
          checkpoint_data?: Json
          created_at?: string
          id?: string
          thread_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      agent_memories: {
        Row: {
          agent_id: string
          content: string
          conversation_id: string | null
          created_at: string
          id: string
          memory_type: string
          metadata: Json | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          agent_id: string
          content: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          memory_type: string
          metadata?: Json | null
          user_id: string
          workspace_id: string
        }
        Update: {
          agent_id?: string
          content?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          memory_type?: string
          metadata?: Json | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      agent_run_logs: {
        Row: {
          created_at: string
          data: Json | null
          id: string
          level: string
          message: string
          run_id: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          id?: string
          level?: string
          message: string
          run_id: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          id?: string
          level?: string
          message?: string
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_run_logs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          agent_id: string
          completed_at: string | null
          created_at: string
          credits_debited: number
          delegated_to_python: boolean
          duration_ms: number | null
          error_message: string | null
          id: string
          initiated_by_user: string | null
          input_data: Json
          input_tokens: number
          last_heartbeat: string | null
          last_recovery_at: string | null
          model_used: string | null
          output_data: Json | null
          output_tokens: number
          parent_run_id: string | null
          python_job_id: string | null
          recovery_attempts: number
          started_at: string | null
          status: string
          trigger_event_type: string | null
          triggered_by: string
          workspace_id: string | null
        }
        Insert: {
          agent_id: string
          completed_at?: string | null
          created_at?: string
          credits_debited?: number
          delegated_to_python?: boolean
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          initiated_by_user?: string | null
          input_data?: Json
          input_tokens?: number
          last_heartbeat?: string | null
          last_recovery_at?: string | null
          model_used?: string | null
          output_data?: Json | null
          output_tokens?: number
          parent_run_id?: string | null
          python_job_id?: string | null
          recovery_attempts?: number
          started_at?: string | null
          status?: string
          trigger_event_type?: string | null
          triggered_by?: string
          workspace_id?: string | null
        }
        Update: {
          agent_id?: string
          completed_at?: string | null
          created_at?: string
          credits_debited?: number
          delegated_to_python?: boolean
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          initiated_by_user?: string | null
          input_data?: Json
          input_tokens?: number
          last_heartbeat?: string | null
          last_recovery_at?: string | null
          model_used?: string | null
          output_data?: Json | null
          output_tokens?: number
          parent_run_id?: string | null
          python_job_id?: string | null
          recovery_attempts?: number
          started_at?: string | null
          status?: string
          trigger_event_type?: string | null
          triggered_by?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "background_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_parent_run_id_fkey"
            columns: ["parent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_tasks: {
        Row: {
          agent_name: string
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          input_data: Json | null
          metadata: Json | null
          output_data: Json | null
          priority: number | null
          started_at: string | null
          status: string
          task_name: string
          task_type: string
          updated_at: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          agent_name: string
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          input_data?: Json | null
          metadata?: Json | null
          output_data?: Json | null
          priority?: number | null
          started_at?: string | null
          status?: string
          task_name: string
          task_type: string
          updated_at?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          agent_name?: string
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          input_data?: Json | null
          metadata?: Json | null
          output_data?: Json | null
          priority?: number | null
          started_at?: string | null
          status?: string
          task_name?: string
          task_type?: string
          updated_at?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      agent_tool_call_logs: {
        Row: {
          agent_id: string | null
          conversation_id: string | null
          created_at: string | null
          duration_ms: number | null
          error_message: string | null
          id: string
          result_count: number | null
          result_summary: Json | null
          success: boolean | null
          tool_args: Json | null
          tool_name: string
          user_id: string | null
          workspace_id: string | null
          zero_result: boolean | null
        }
        Insert: {
          agent_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          result_count?: number | null
          result_summary?: Json | null
          success?: boolean | null
          tool_args?: Json | null
          tool_name: string
          user_id?: string | null
          workspace_id?: string | null
          zero_result?: boolean | null
        }
        Update: {
          agent_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          result_count?: number | null
          result_summary?: Json | null
          success?: boolean | null
          tool_args?: Json | null
          tool_name?: string
          user_id?: string | null
          workspace_id?: string | null
          zero_result?: boolean | null
        }
        Relationships: []
      }
      agent_uploaded_files: {
        Row: {
          agent_id: string
          created_at: string | null
          file_name: string
          file_size: number
          file_type: string
          id: string
          metadata: Json | null
          public_url: string
          storage_path: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string | null
          file_name: string
          file_size: number
          file_type: string
          id?: string
          metadata?: Json | null
          public_url: string
          storage_path: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string | null
          file_name?: string
          file_size?: number
          file_type?: string
          id?: string
          metadata?: Json | null
          public_url?: string
          storage_path?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      agent_usage_logs: {
        Row: {
          agent_type: string
          billed_cost_usd: number
          conversation_id: string | null
          created_at: string | null
          credits_debited: number
          error_message: string | null
          id: string
          input_tokens: number
          latency_ms: number | null
          markup_multiplier: number | null
          metadata: Json | null
          model_name: string
          output_tokens: number
          raw_cost_usd: number
          tool_costs_usd: number | null
          tools_called: Json | null
          turn_number: number
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          agent_type: string
          billed_cost_usd?: number
          conversation_id?: string | null
          created_at?: string | null
          credits_debited?: number
          error_message?: string | null
          id?: string
          input_tokens?: number
          latency_ms?: number | null
          markup_multiplier?: number | null
          metadata?: Json | null
          model_name: string
          output_tokens?: number
          raw_cost_usd?: number
          tool_costs_usd?: number | null
          tools_called?: Json | null
          turn_number?: number
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          agent_type?: string
          billed_cost_usd?: number
          conversation_id?: string | null
          created_at?: string | null
          credits_debited?: number
          error_message?: string | null
          id?: string
          input_tokens?: number
          latency_ms?: number | null
          markup_multiplier?: number | null
          metadata?: Json | null
          model_name?: string
          output_tokens?: number
          raw_cost_usd?: number
          tool_costs_usd?: number | null
          tools_called?: Json | null
          turn_number?: number
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      ai_analysis_queue: {
        Row: {
          analysis_type: string
          chunk_id: string | null
          completed_at: string | null
          created_at: string | null
          document_id: string
          error_message: string | null
          id: string
          priority: number | null
          result: Json | null
          retry_count: number | null
          started_at: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          analysis_type: string
          chunk_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          document_id: string
          error_message?: string | null
          id?: string
          priority?: number | null
          result?: Json | null
          retry_count?: number | null
          started_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          analysis_type?: string
          chunk_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          document_id?: string
          error_message?: string | null
          id?: string
          priority?: number | null
          result?: Json | null
          retry_count?: number | null
          started_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_analysis_queue_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "processed_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_call_logs: {
        Row: {
          action: string | null
          confidence_breakdown: Json | null
          confidence_score: number | null
          cost: number | null
          created_at: string | null
          error_message: string | null
          fallback_reason: string | null
          id: string
          input_tokens: number | null
          job_id: string | null
          latency_ms: number | null
          model: string
          output_tokens: number | null
          request_data: Json | null
          response_data: Json | null
          task: string
          timestamp: string
        }
        Insert: {
          action?: string | null
          confidence_breakdown?: Json | null
          confidence_score?: number | null
          cost?: number | null
          created_at?: string | null
          error_message?: string | null
          fallback_reason?: string | null
          id?: string
          input_tokens?: number | null
          job_id?: string | null
          latency_ms?: number | null
          model: string
          output_tokens?: number | null
          request_data?: Json | null
          response_data?: Json | null
          task: string
          timestamp?: string
        }
        Update: {
          action?: string | null
          confidence_breakdown?: Json | null
          confidence_score?: number | null
          cost?: number | null
          created_at?: string | null
          error_message?: string | null
          fallback_reason?: string | null
          id?: string
          input_tokens?: number | null
          job_id?: string | null
          latency_ms?: number | null
          model?: string
          output_tokens?: number | null
          request_data?: Json | null
          response_data?: Json | null
          task?: string
          timestamp?: string
        }
        Relationships: []
      }
      ai_model_pricing: {
        Row: {
          auto_update_enabled: boolean | null
          auto_update_source_url: string | null
          billing_type: string
          category: string | null
          cost_per_generation: number | null
          cost_per_unit: number | null
          created_at: string | null
          gpu_type: string | null
          hourly_rate_usd: number | null
          id: string
          input_price_per_million: number | null
          is_active: boolean | null
          last_auto_updated_at: string | null
          last_verified_at: string | null
          markup_multiplier: number | null
          model_key: string
          model_name: string
          notes: string | null
          output_price_per_million: number | null
          provider: string
          source_url: string | null
          unit_label: string | null
          updated_at: string | null
        }
        Insert: {
          auto_update_enabled?: boolean | null
          auto_update_source_url?: string | null
          billing_type?: string
          category?: string | null
          cost_per_generation?: number | null
          cost_per_unit?: number | null
          created_at?: string | null
          gpu_type?: string | null
          hourly_rate_usd?: number | null
          id?: string
          input_price_per_million?: number | null
          is_active?: boolean | null
          last_auto_updated_at?: string | null
          last_verified_at?: string | null
          markup_multiplier?: number | null
          model_key: string
          model_name: string
          notes?: string | null
          output_price_per_million?: number | null
          provider: string
          source_url?: string | null
          unit_label?: string | null
          updated_at?: string | null
        }
        Update: {
          auto_update_enabled?: boolean | null
          auto_update_source_url?: string | null
          billing_type?: string
          category?: string | null
          cost_per_generation?: number | null
          cost_per_unit?: number | null
          created_at?: string | null
          gpu_type?: string | null
          hourly_rate_usd?: number | null
          id?: string
          input_price_per_million?: number | null
          is_active?: boolean | null
          last_auto_updated_at?: string | null
          last_verified_at?: string | null
          markup_multiplier?: number | null
          model_key?: string
          model_name?: string
          notes?: string | null
          output_price_per_million?: number | null
          provider?: string
          source_url?: string | null
          unit_label?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_pricing_update_logs: {
        Row: {
          created_at: string | null
          id: string
          model_key: string
          model_pricing_id: string | null
          new_input_price: number | null
          new_output_price: number | null
          old_input_price: number | null
          old_output_price: number | null
          provider: string
          update_reason: string | null
          update_source: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          model_key: string
          model_pricing_id?: string | null
          new_input_price?: number | null
          new_output_price?: number | null
          old_input_price?: number | null
          old_output_price?: number | null
          provider: string
          update_reason?: string | null
          update_source: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          model_key?: string
          model_pricing_id?: string | null
          new_input_price?: number | null
          new_output_price?: number | null
          old_input_price?: number | null
          old_output_price?: number | null
          provider?: string
          update_reason?: string | null
          update_source?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_pricing_update_logs_model_pricing_id_fkey"
            columns: ["model_pricing_id"]
            isOneToOne: false
            referencedRelation: "ai_model_pricing"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_logs: {
        Row: {
          billed_cost_usd: number | null
          created_at: string | null
          credits_debited: number
          id: string
          image_id: string | null
          input_cost_usd: number
          input_tokens: number
          job_id: string | null
          markup_multiplier: number | null
          metadata: Json | null
          model_name: string
          module_slug: string | null
          operation_type: string
          output_cost_usd: number
          output_tokens: number
          product_id: string | null
          raw_cost_usd: number | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          billed_cost_usd?: number | null
          created_at?: string | null
          credits_debited?: number
          id?: string
          image_id?: string | null
          input_cost_usd?: number
          input_tokens?: number
          job_id?: string | null
          markup_multiplier?: number | null
          metadata?: Json | null
          model_name: string
          module_slug?: string | null
          operation_type: string
          output_cost_usd?: number
          output_tokens?: number
          product_id?: string | null
          raw_cost_usd?: number | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          billed_cost_usd?: number | null
          created_at?: string | null
          credits_debited?: number
          id?: string
          image_id?: string | null
          input_cost_usd?: number
          input_tokens?: number
          job_id?: string | null
          markup_multiplier?: number | null
          metadata?: Json | null
          model_name?: string
          module_slug?: string | null
          operation_type?: string
          output_cost_usd?: number
          output_tokens?: number
          product_id?: string | null
          raw_cost_usd?: number | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_logs_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "document_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "background_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          created_at: string | null
          event_data: Json | null
          event_type: string
          id: string
          session_id: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          session_id?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          session_id?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: []
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
      appointment_availability: {
        Row: {
          available_date: string
          created_at: string | null
          id: string
          time_ranges: Json
          user_id: string
        }
        Insert: {
          available_date: string
          created_at?: string | null
          id?: string
          time_ranges?: Json
          user_id: string
        }
        Update: {
          available_date?: string
          created_at?: string | null
          id?: string
          time_ranges?: Json
          user_id?: string
        }
        Relationships: []
      }
      appointments: {
        Row: {
          appointment_date: string
          appointment_time: string
          client_email: string
          client_message: string | null
          client_name: string
          client_user_id: string | null
          created_at: string
          id: string
          inbox_conversation_id: string | null
          notes: string | null
          professional_user_id: string
          service_id: string | null
          service_name: string | null
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        Insert: {
          appointment_date: string
          appointment_time: string
          client_email: string
          client_message?: string | null
          client_name: string
          client_user_id?: string | null
          created_at?: string
          id?: string
          inbox_conversation_id?: string | null
          notes?: string | null
          professional_user_id: string
          service_id?: string | null
          service_name?: string | null
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Update: {
          appointment_date?: string
          appointment_time?: string
          client_email?: string
          client_message?: string | null
          client_name?: string
          client_user_id?: string | null
          created_at?: string
          id?: string
          inbox_conversation_id?: string | null
          notes?: string | null
          professional_user_id?: string
          service_id?: string | null
          service_name?: string | null
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Relationships: []
      }
      asset_categories: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      background_agents: {
        Row: {
          agent_type: string
          config: Json
          created_at: string
          created_by: string | null
          description: string | null
          enabled: boolean
          event_type: string | null
          id: string
          last_run_at: string | null
          last_run_status: string | null
          model: string
          name: string
          parent_agent_id: string | null
          run_count: number
          schedule: string | null
          system_prompt_override: string | null
          trigger_type: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          agent_type: string
          config?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          event_type?: string | null
          id?: string
          last_run_at?: string | null
          last_run_status?: string | null
          model?: string
          name: string
          parent_agent_id?: string | null
          run_count?: number
          schedule?: string | null
          system_prompt_override?: string | null
          trigger_type: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          agent_type?: string
          config?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          event_type?: string | null
          id?: string
          last_run_at?: string | null
          last_run_status?: string | null
          model?: string
          name?: string
          parent_agent_id?: string | null
          run_count?: number
          schedule?: string | null
          system_prompt_override?: string | null
          trigger_type?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "background_agents_parent_agent_id_fkey"
            columns: ["parent_agent_id"]
            isOneToOne: false
            referencedRelation: "background_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      background_jobs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          current_slow_operation: Json | null
          document_id: string | null
          error: string | null
          error_message: string | null
          failed_at: string | null
          filename: string
          id: string
          interrupted_at: string | null
          job_type: string | null
          last_checkpoint: Json | null
          last_heartbeat: string | null
          last_recovery_at: string | null
          metadata: Json | null
          parent_job_id: string | null
          progress: number | null
          recovery_attempts: number | null
          recovery_attempts_after_genuine_failure: number
          recovery_history: Json
          failure_summary: Json | null
          stage_history: Json
          started_at: string | null
          status: string
          total_ai_cost_usd: number | null
          total_credits_used: number | null
          updated_at: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          current_slow_operation?: Json | null
          document_id?: string | null
          error?: string | null
          error_message?: string | null
          failed_at?: string | null
          filename: string
          id: string
          interrupted_at?: string | null
          job_type?: string | null
          last_checkpoint?: Json | null
          last_heartbeat?: string | null
          last_recovery_at?: string | null
          metadata?: Json | null
          parent_job_id?: string | null
          progress?: number | null
          recovery_attempts?: number | null
          recovery_attempts_after_genuine_failure?: number
          recovery_history?: Json
          failure_summary?: Json | null
          stage_history?: Json
          started_at?: string | null
          status: string
          total_ai_cost_usd?: number | null
          total_credits_used?: number | null
          updated_at?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          current_slow_operation?: Json | null
          document_id?: string | null
          error?: string | null
          error_message?: string | null
          failed_at?: string | null
          filename?: string
          id?: string
          interrupted_at?: string | null
          job_type?: string | null
          last_checkpoint?: Json | null
          last_heartbeat?: string | null
          last_recovery_at?: string | null
          metadata?: Json | null
          parent_job_id?: string | null
          progress?: number | null
          recovery_attempts?: number | null
          recovery_attempts_after_genuine_failure?: number
          recovery_history?: Json
          failure_summary?: Json | null
          stage_history?: Json
          started_at?: string | null
          status?: string
          total_ai_cost_usd?: number | null
          total_credits_used?: number | null
          updated_at?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "background_jobs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "background_jobs_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "background_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_jobs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          data: Json
          error: string | null
          id: string
          priority: number | null
          status: string
          type: string
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          data: Json
          error?: string | null
          id: string
          priority?: number | null
          status: string
          type: string
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          data?: Json
          error?: string | null
          id?: string
          priority?: number | null
          status?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      brand_retailer_index: {
        Row: {
          brand: string
          country_code: string
          hit_count: number
          last_perplexity_refresh_at: string | null
          last_seen_at: string
          retailer_domain: string
        }
        Insert: {
          brand: string
          country_code?: string
          hit_count?: number
          last_perplexity_refresh_at?: string | null
          last_seen_at?: string
          retailer_domain: string
        }
        Update: {
          brand?: string
          country_code?: string
          hit_count?: number
          last_perplexity_refresh_at?: string | null
          last_seen_at?: string
          retailer_domain?: string
        }
        Relationships: []
      }
      campaign_recipients: {
        Row: {
          bounced_at: string | null
          campaign_id: string
          clicked_at: string | null
          complained_at: string | null
          contact_id: string | null
          created_at: string | null
          delivered_at: string | null
          email: string
          email_log_id: string | null
          error_message: string | null
          id: string
          opened_at: string | null
          retry_count: number | null
          sent_at: string | null
          status: string
          updated_at: string | null
          user_id: string | null
          variables: Json | null
        }
        Insert: {
          bounced_at?: string | null
          campaign_id: string
          clicked_at?: string | null
          complained_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          delivered_at?: string | null
          email: string
          email_log_id?: string | null
          error_message?: string | null
          id?: string
          opened_at?: string | null
          retry_count?: number | null
          sent_at?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string | null
          variables?: Json | null
        }
        Update: {
          bounced_at?: string | null
          campaign_id?: string
          clicked_at?: string | null
          complained_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          delivered_at?: string | null
          email?: string
          email_log_id?: string | null
          error_message?: string | null
          id?: string
          opened_at?: string | null
          retry_count?: number | null
          sent_at?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string | null
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_email_log_id_fkey"
            columns: ["email_log_id"]
            isOneToOne: false
            referencedRelation: "email_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          audience_filter: Json | null
          channel_type: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          from_email: string | null
          from_name: string | null
          id: string
          messaging_channel_id: string | null
          messaging_template_id: string | null
          metadata: Json | null
          name: string
          preview_text: string | null
          recipient_count: number | null
          reply_to: string | null
          scheduled_at: string | null
          sent_at: string | null
          status: string
          subject_line: string | null
          tags: string[] | null
          template_id: string | null
          track_clicks: boolean | null
          track_opens: boolean | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          audience_filter?: Json | null
          channel_type?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          messaging_channel_id?: string | null
          messaging_template_id?: string | null
          metadata?: Json | null
          name: string
          preview_text?: string | null
          recipient_count?: number | null
          reply_to?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          subject_line?: string | null
          tags?: string[] | null
          template_id?: string | null
          track_clicks?: boolean | null
          track_opens?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          audience_filter?: Json | null
          channel_type?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          messaging_channel_id?: string | null
          messaging_template_id?: string | null
          metadata?: Json | null
          name?: string
          preview_text?: string | null
          recipient_count?: number | null
          reply_to?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          subject_line?: string | null
          tags?: string[] | null
          template_id?: string | null
          track_clicks?: boolean | null
          track_opens?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_messaging_channel_id_fkey"
            columns: ["messaging_channel_id"]
            isOneToOne: false
            referencedRelation: "messaging_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_messaging_template_id_fkey"
            columns: ["messaging_template_id"]
            isOneToOne: false
            referencedRelation: "messaging_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          added_at: string | null
          cart_id: string
          id: string
          notes: string | null
          product_id: string
          quantity: number | null
          unit_price: number | null
        }
        Insert: {
          added_at?: string | null
          cart_id: string
          id?: string
          notes?: string | null
          product_id: string
          quantity?: number | null
          unit_price?: number | null
        }
        Update: {
          added_at?: string | null
          cart_id?: string
          id?: string
          notes?: string | null
          product_id?: string
          quantity?: number | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "shopping_carts"
            referencedColumns: ["id"]
          },
        ]
      }
      category_complement_rules: {
        Row: {
          boost_weight: number
          complement_category: string
          created_at: string | null
          id: string
          primary_category: string
          relationship_label: string
        }
        Insert: {
          boost_weight?: number
          complement_category: string
          created_at?: string | null
          id?: string
          primary_category: string
          relationship_label: string
        }
        Update: {
          boost_weight?: number
          complement_category?: string
          created_at?: string | null
          id?: string
          primary_category?: string
          relationship_label?: string
        }
        Relationships: []
      }
      category_extractions: {
        Row: {
          categories: Json
          confidence_scores: Json | null
          created_at: string | null
          extraction_method: string | null
          id: string
          source_data: string
          source_type: string
          user_id: string | null
        }
        Insert: {
          categories: Json
          confidence_scores?: Json | null
          created_at?: string | null
          extraction_method?: string | null
          id?: string
          source_data: string
          source_type: string
          user_id?: string | null
        }
        Update: {
          categories?: Json
          confidence_scores?: Json | null
          created_at?: string | null
          extraction_method?: string | null
          id?: string
          source_data?: string
          source_type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      category_validation_rules: {
        Row: {
          category_id: string
          created_at: string | null
          created_by: string | null
          display_order: number | null
          id: string
          is_inherited: boolean | null
          is_required: boolean | null
          is_visible: boolean | null
          property_id: string
          ui_props_override: Json | null
          updated_at: string | null
          updated_by: string | null
          validation_override: Json | null
        }
        Insert: {
          category_id: string
          created_at?: string | null
          created_by?: string | null
          display_order?: number | null
          id?: string
          is_inherited?: boolean | null
          is_required?: boolean | null
          is_visible?: boolean | null
          property_id: string
          ui_props_override?: Json | null
          updated_at?: string | null
          updated_by?: string | null
          validation_override?: Json | null
        }
        Update: {
          category_id?: string
          created_at?: string | null
          created_by?: string | null
          display_order?: number | null
          id?: string
          is_inherited?: boolean | null
          is_required?: boolean | null
          is_visible?: boolean | null
          property_id?: string
          ui_props_override?: Json | null
          updated_at?: string | null
          updated_by?: string | null
          validation_override?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "category_validation_rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "material_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_validation_rules_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "material_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      chandra_ocr_metrics: {
        Row: {
          attempt_number: number
          blocks_count: number | null
          caller: string
          chars_count: number | null
          cost_usd: number | null
          created_at: string
          document_id: string | null
          failure_mode_head: string | null
          id: string
          image_id: string | null
          job_id: string | null
          latency_ms: number
          outcome: string
          temperature: number
        }
        Insert: {
          attempt_number?: number
          blocks_count?: number | null
          caller: string
          chars_count?: number | null
          cost_usd?: number | null
          created_at?: string
          document_id?: string | null
          failure_mode_head?: string | null
          id?: string
          image_id?: string | null
          job_id?: string | null
          latency_ms: number
          outcome: string
          temperature: number
        }
        Update: {
          attempt_number?: number
          blocks_count?: number | null
          caller?: string
          chars_count?: number | null
          cost_usd?: number | null
          created_at?: string
          document_id?: string | null
          failure_mode_head?: string | null
          id?: string
          image_id?: string | null
          job_id?: string | null
          latency_ms?: number
          outcome?: string
          temperature?: number
        }
        Relationships: [
          {
            foreignKeyName: "chandra_ocr_metrics_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chandra_ocr_metrics_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "document_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chandra_ocr_metrics_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "background_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      changelog_entries: {
        Row: {
          body_md: string
          category: string | null
          created_at: string
          created_by: string | null
          id: string
          published_at: string | null
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          body_md: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          body_md?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      chunk_boundaries: {
        Row: {
          boundary_score: number
          boundary_type: string
          chunk_id: string
          created_at: string | null
          embedding_dimensions: number | null
          id: string
          is_product_boundary: boolean | null
          model_name: string | null
          model_version: string | null
          next_chunk_id: string | null
          processed_at: string | null
          processing_time_ms: number | null
          reasoning: string | null
          semantic_similarity: number | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          boundary_score: number
          boundary_type: string
          chunk_id: string
          created_at?: string | null
          embedding_dimensions?: number | null
          id?: string
          is_product_boundary?: boolean | null
          model_name?: string | null
          model_version?: string | null
          next_chunk_id?: string | null
          processed_at?: string | null
          processing_time_ms?: number | null
          reasoning?: string | null
          semantic_similarity?: number | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          boundary_score?: number
          boundary_type?: string
          chunk_id?: string
          created_at?: string | null
          embedding_dimensions?: number | null
          id?: string
          is_product_boundary?: boolean | null
          model_name?: string | null
          model_version?: string | null
          next_chunk_id?: string | null
          processed_at?: string | null
          processing_time_ms?: number | null
          reasoning?: string | null
          semantic_similarity?: number | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chunk_boundaries_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "document_chunks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chunk_boundaries_next_chunk_id_fkey"
            columns: ["next_chunk_id"]
            isOneToOne: false
            referencedRelation: "document_chunks"
            referencedColumns: ["id"]
          },
        ]
      }
      chunk_classifications: {
        Row: {
          chunk_id: string
          confidence: number
          content_type: string
          created_at: string | null
          id: string
          model_name: string | null
          model_version: string | null
          processed_at: string | null
          processing_time_ms: number | null
          reasoning: string | null
          sub_categories: Json | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          chunk_id: string
          confidence: number
          content_type: string
          created_at?: string | null
          id?: string
          model_name?: string | null
          model_version?: string | null
          processed_at?: string | null
          processing_time_ms?: number | null
          reasoning?: string | null
          sub_categories?: Json | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          chunk_id?: string
          confidence?: number
          content_type?: string
          created_at?: string | null
          id?: string
          model_name?: string | null
          model_version?: string | null
          processed_at?: string | null
          processing_time_ms?: number | null
          reasoning?: string | null
          sub_categories?: Json | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chunk_classifications_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "document_chunks"
            referencedColumns: ["id"]
          },
        ]
      }
      chunk_image_relationships: {
        Row: {
          chunk_id: string
          created_at: string | null
          id: string
          image_id: string
          relationship_type: string | null
          relevance_score: number | null
        }
        Insert: {
          chunk_id: string
          created_at?: string | null
          id?: string
          image_id: string
          relationship_type?: string | null
          relevance_score?: number | null
        }
        Update: {
          chunk_id?: string
          created_at?: string | null
          id?: string
          image_id?: string
          relationship_type?: string | null
          relevance_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chunk_image_relationships_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "document_chunks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chunk_image_relationships_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "document_images"
            referencedColumns: ["id"]
          },
        ]
      }
      chunk_product_relationships: {
        Row: {
          chunk_id: string
          created_at: string | null
          id: string
          product_id: string
          relationship_type: string | null
          relevance_score: number | null
        }
        Insert: {
          chunk_id: string
          created_at?: string | null
          id?: string
          product_id: string
          relationship_type?: string | null
          relevance_score?: number | null
        }
        Update: {
          chunk_id?: string
          created_at?: string | null
          id?: string
          product_id?: string
          relationship_type?: string | null
          relevance_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chunk_product_relationships_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "document_chunks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chunk_product_relationships_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      chunk_quality_flags: {
        Row: {
          chunk_id: string | null
          content_preview: string | null
          created_at: string | null
          document_id: string | null
          flag_reason: string | null
          flag_type: string
          flagged_at: string | null
          id: string
          quality_score: number | null
          review_action: string | null
          reviewed: boolean | null
          reviewed_at: string | null
          reviewed_by: string | null
          workspace_id: string | null
        }
        Insert: {
          chunk_id?: string | null
          content_preview?: string | null
          created_at?: string | null
          document_id?: string | null
          flag_reason?: string | null
          flag_type: string
          flagged_at?: string | null
          id?: string
          quality_score?: number | null
          review_action?: string | null
          reviewed?: boolean | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          workspace_id?: string | null
        }
        Update: {
          chunk_id?: string | null
          content_preview?: string | null
          created_at?: string | null
          document_id?: string | null
          flag_reason?: string | null
          flag_type?: string
          flagged_at?: string | null
          id?: string
          quality_score?: number | null
          review_action?: string | null
          reviewed?: boolean | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chunk_quality_flags_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "document_chunks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chunk_quality_flags_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      chunk_relationships: {
        Row: {
          created_at: string | null
          document_id: string
          id: string
          metadata: Json | null
          relationship_type: string
          similarity_score: number
          source_chunk_id: string
          target_chunk_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          document_id: string
          id?: string
          metadata?: Json | null
          relationship_type?: string
          similarity_score: number
          source_chunk_id: string
          target_chunk_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          document_id?: string
          id?: string
          metadata?: Json | null
          relationship_type?: string
          similarity_score?: number
          source_chunk_id?: string
          target_chunk_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chunk_relationships_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chunk_relationships_source_chunk_id_fkey"
            columns: ["source_chunk_id"]
            isOneToOne: false
            referencedRelation: "document_chunks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chunk_relationships_target_chunk_id_fkey"
            columns: ["target_chunk_id"]
            isOneToOne: false
            referencedRelation: "document_chunks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chunk_relationships_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      chunk_validation_scores: {
        Row: {
          boundary_quality_score: number | null
          chunk_id: string
          completeness_score: number | null
          content_quality_score: number | null
          created_at: string | null
          id: string
          issues: Json | null
          model_version: string | null
          overall_validation_score: number
          processing_time_ms: number | null
          recommendations: Json | null
          semantic_coherence_score: number | null
          updated_at: string | null
          validated_at: string | null
          validation_notes: string | null
          validation_status: string | null
          validator_model: string | null
          workspace_id: string | null
        }
        Insert: {
          boundary_quality_score?: number | null
          chunk_id: string
          completeness_score?: number | null
          content_quality_score?: number | null
          created_at?: string | null
          id?: string
          issues?: Json | null
          model_version?: string | null
          overall_validation_score: number
          processing_time_ms?: number | null
          recommendations?: Json | null
          semantic_coherence_score?: number | null
          updated_at?: string | null
          validated_at?: string | null
          validation_notes?: string | null
          validation_status?: string | null
          validator_model?: string | null
          workspace_id?: string | null
        }
        Update: {
          boundary_quality_score?: number | null
          chunk_id?: string
          completeness_score?: number | null
          content_quality_score?: number | null
          created_at?: string | null
          id?: string
          issues?: Json | null
          model_version?: string | null
          overall_validation_score?: number
          processing_time_ms?: number | null
          recommendations?: Json | null
          semantic_coherence_score?: number | null
          updated_at?: string | null
          validated_at?: string | null
          validation_notes?: string | null
          validation_status?: string | null
          validator_model?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chunk_validation_scores_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "document_chunks"
            referencedColumns: ["id"]
          },
        ]
      }
      classifier_verdict_cache: {
        Row: {
          created_at: string
          expires_at: string
          facets_hash: string
          match_kind: string
          match_note: string | null
          match_score: number | null
          product_url: string
          variant_diffs: Json | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          facets_hash: string
          match_kind: string
          match_note?: string | null
          match_score?: number | null
          product_url: string
          variant_diffs?: Json | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          facets_hash?: string
          match_kind?: string
          match_note?: string | null
          match_score?: number | null
          product_url?: string
          variant_diffs?: Json | null
        }
        Relationships: []
      }
      claude_validation_queue: {
        Row: {
          created_at: string
          document_id: string
          id: string
          image_id: string
          job_type: string
          max_retries: number
          metadata: Json | null
          priority: number
          retry_count: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          image_id: string
          job_type?: string
          max_retries?: number
          metadata?: Json | null
          priority?: number
          retry_count?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          image_id?: string
          job_type?: string
          max_retries?: number
          metadata?: Json | null
          priority?: number
          retry_count?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "claude_validation_queue_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claude_validation_queue_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "document_images"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_source_promoted_urls: {
        Row: {
          created_at: string
          created_by: string | null
          override_kind: string
          product_id: string
          product_url: string
          reason: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          override_kind: string
          product_id: string
          product_url: string
          reason?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          override_kind?: string
          product_id?: string
          product_url?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitor_source_promoted_urls_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_packages: {
        Row: {
          created_at: string | null
          credits: number
          currency: string | null
          id: string
          is_active: boolean | null
          name: string
          price_in_cents: number
          stripe_price_id: string | null
          stripe_product_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          credits: number
          currency?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          price_in_cents: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          credits?: number
          currency?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          price_in_cents?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          amount: number
          balance_after: number | null
          created_at: string | null
          description: string | null
          id: string
          metadata: Json | null
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
          transaction_type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          transaction_type: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          transaction_type?: string
          user_id?: string
        }
        Relationships: []
      }
      crm_companies: {
        Row: {
          address: string | null
          annual_revenue: string | null
          city: string | null
          country: string | null
          country_code: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          email: string | null
          employee_count: string | null
          facebook: string | null
          id: string
          industry: string | null
          linkedin: string | null
          name: string
          oxygen_contact_id: string | null
          phone: string | null
          postal_code: string | null
          profession: string | null
          state: string | null
          street: string | null
          street_number: string | null
          tax_office: string | null
          twitter: string | null
          updated_at: string | null
          vat_number: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          annual_revenue?: string | null
          city?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          email?: string | null
          employee_count?: string | null
          facebook?: string | null
          id?: string
          industry?: string | null
          linkedin?: string | null
          name: string
          oxygen_contact_id?: string | null
          phone?: string | null
          postal_code?: string | null
          profession?: string | null
          state?: string | null
          street?: string | null
          street_number?: string | null
          tax_office?: string | null
          twitter?: string | null
          updated_at?: string | null
          vat_number?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          annual_revenue?: string | null
          city?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          email?: string | null
          employee_count?: string | null
          facebook?: string | null
          id?: string
          industry?: string | null
          linkedin?: string | null
          name?: string
          oxygen_contact_id?: string | null
          phone?: string | null
          postal_code?: string | null
          profession?: string | null
          state?: string | null
          street?: string | null
          street_number?: string | null
          tax_office?: string | null
          twitter?: string | null
          updated_at?: string | null
          vat_number?: string | null
          website?: string | null
        }
        Relationships: []
      }
      crm_company_contacts: {
        Row: {
          company_id: string
          contact_id: string
          created_at: string | null
          id: string
          is_primary: boolean | null
          notes: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          company_id: string
          contact_id: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          notes?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          contact_id?: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          notes?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_company_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_company_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_contact_relationships: {
        Row: {
          contact_id: string
          created_at: string | null
          id: string
          relationship_type: string | null
          user_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string | null
          id?: string
          relationship_type?: string | null
          user_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string | null
          id?: string
          relationship_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_contact_relationships_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_contacts: {
        Row: {
          address: string | null
          annual_revenue: string | null
          city: string | null
          company: string | null
          contact_type: string | null
          country: string | null
          country_code: string | null
          created_at: string | null
          created_by: string
          department: string | null
          email: string | null
          employee_count: string | null
          facebook: string | null
          first_name: string | null
          id: string
          industry: string | null
          is_client: boolean | null
          last_name: string | null
          lead_source: string | null
          lead_status: string | null
          linked_at: string | null
          linked_by: string | null
          linkedin: string | null
          mobile: string | null
          name: string
          oxygen_contact_id: string | null
          phone: string | null
          position: string | null
          postal_code: string | null
          profession: string | null
          state: string | null
          status: string | null
          street: string | null
          street_number: string | null
          tags: Json | null
          tax_office: string | null
          twitter: string | null
          updated_at: string | null
          user_id: string | null
          vat_number: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          annual_revenue?: string | null
          city?: string | null
          company?: string | null
          contact_type?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string | null
          created_by: string
          department?: string | null
          email?: string | null
          employee_count?: string | null
          facebook?: string | null
          first_name?: string | null
          id?: string
          industry?: string | null
          is_client?: boolean | null
          last_name?: string | null
          lead_source?: string | null
          lead_status?: string | null
          linked_at?: string | null
          linked_by?: string | null
          linkedin?: string | null
          mobile?: string | null
          name: string
          oxygen_contact_id?: string | null
          phone?: string | null
          position?: string | null
          postal_code?: string | null
          profession?: string | null
          state?: string | null
          status?: string | null
          street?: string | null
          street_number?: string | null
          tags?: Json | null
          tax_office?: string | null
          twitter?: string | null
          updated_at?: string | null
          user_id?: string | null
          vat_number?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          annual_revenue?: string | null
          city?: string | null
          company?: string | null
          contact_type?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string | null
          created_by?: string
          department?: string | null
          email?: string | null
          employee_count?: string | null
          facebook?: string | null
          first_name?: string | null
          id?: string
          industry?: string | null
          is_client?: boolean | null
          last_name?: string | null
          lead_source?: string | null
          lead_status?: string | null
          linked_at?: string | null
          linked_by?: string | null
          linkedin?: string | null
          mobile?: string | null
          name?: string
          oxygen_contact_id?: string | null
          phone?: string | null
          position?: string | null
          postal_code?: string | null
          profession?: string | null
          state?: string | null
          status?: string | null
          street?: string | null
          street_number?: string | null
          tags?: Json | null
          tax_office?: string | null
          twitter?: string | null
          updated_at?: string | null
          user_id?: string | null
          vat_number?: string | null
          website?: string | null
        }
        Relationships: []
      }
      crm_notes: {
        Row: {
          id: string
          target_kind: Database["public"]["Enums"]["crm_note_target_kind"]
          target_id: string
          body: string
          created_at: string
          updated_at: string
          created_by: string | null
          edited_by: string | null
        }
        Insert: {
          id?: string
          target_kind: Database["public"]["Enums"]["crm_note_target_kind"]
          target_id: string
          body: string
          created_at?: string
          updated_at?: string
          created_by?: string | null
          edited_by?: string | null
        }
        Update: {
          id?: string
          target_kind?: Database["public"]["Enums"]["crm_note_target_kind"]
          target_id?: string
          body?: string
          created_at?: string
          updated_at?: string
          created_by?: string | null
          edited_by?: string | null
        }
        Relationships: []
      }
      data_import_history: {
        Row: {
          created_at: string | null
          error_details: string | null
          id: string
          job_id: string
          normalized_data: Json
          processed_at: string | null
          processing_status: string | null
          product_id: string | null
          source_data: Json
        }
        Insert: {
          created_at?: string | null
          error_details?: string | null
          id?: string
          job_id: string
          normalized_data: Json
          processed_at?: string | null
          processing_status?: string | null
          product_id?: string | null
          source_data: Json
        }
        Update: {
          created_at?: string | null
          error_details?: string | null
          id?: string
          job_id?: string
          normalized_data?: Json
          processed_at?: string | null
          processing_status?: string | null
          product_id?: string | null
          source_data?: Json
        }
        Relationships: [
          {
            foreignKeyName: "data_import_history_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "data_import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_import_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      data_import_job_products: {
        Row: {
          created_at: string
          id: string
          job_id: string
          product_data: Json
          product_index: number
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          product_data: Json
          product_index: number
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          product_data?: Json
          product_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "data_import_job_products_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "data_import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      data_import_jobs: {
        Row: {
          background_job_id: string | null
          completed_at: string | null
          created_at: string | null
          cron_schedule: string | null
          error_details: Json | null
          error_message: string | null
          failed_products: number | null
          id: string
          import_type: string
          is_scheduled: boolean | null
          last_heartbeat: string | null
          last_run_at: string | null
          mapping_template_id: string | null
          metadata: Json | null
          next_run_at: string | null
          original_xml_content: string | null
          parent_job_id: string | null
          processed_products: number | null
          source_name: string | null
          source_url: string | null
          started_at: string | null
          status: string
          total_products: number | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          background_job_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          cron_schedule?: string | null
          error_details?: Json | null
          error_message?: string | null
          failed_products?: number | null
          id?: string
          import_type: string
          is_scheduled?: boolean | null
          last_heartbeat?: string | null
          last_run_at?: string | null
          mapping_template_id?: string | null
          metadata?: Json | null
          next_run_at?: string | null
          original_xml_content?: string | null
          parent_job_id?: string | null
          processed_products?: number | null
          source_name?: string | null
          source_url?: string | null
          started_at?: string | null
          status?: string
          total_products?: number | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          background_job_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          cron_schedule?: string | null
          error_details?: Json | null
          error_message?: string | null
          failed_products?: number | null
          id?: string
          import_type?: string
          is_scheduled?: boolean | null
          last_heartbeat?: string | null
          last_run_at?: string | null
          mapping_template_id?: string | null
          metadata?: Json | null
          next_run_at?: string | null
          original_xml_content?: string | null
          parent_job_id?: string | null
          processed_products?: number | null
          source_name?: string | null
          source_url?: string | null
          started_at?: string | null
          status?: string
          total_products?: number | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_import_jobs_background_job_id_fkey"
            columns: ["background_job_id"]
            isOneToOne: false
            referencedRelation: "background_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_import_jobs_mapping_template_id_fkey"
            columns: ["mapping_template_id"]
            isOneToOne: false
            referencedRelation: "xml_mapping_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_import_jobs_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "data_import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_import_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      designer_assets: {
        Row: {
          category_id: string
          created_at: string | null
          description: string | null
          dimensions: Json | null
          download_count: number | null
          glb_url: string
          id: string
          is_active: boolean | null
          is_featured: boolean | null
          name: string
          tags: string[] | null
          thumbnail_url: string | null
          updated_at: string | null
        }
        Insert: {
          category_id: string
          created_at?: string | null
          description?: string | null
          dimensions?: Json | null
          download_count?: number | null
          glb_url: string
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          name: string
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string | null
        }
        Update: {
          category_id?: string
          created_at?: string | null
          description?: string | null
          dimensions?: Json | null
          download_count?: number | null
          glb_url?: string
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          name?: string
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "designer_assets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "asset_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      designer_materials: {
        Row: {
          color_hex: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          material_type: string
          name: string
          properties: Json | null
          texture_url: string
          thumbnail_url: string | null
          updated_at: string | null
        }
        Insert: {
          color_hex?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          material_type: string
          name: string
          properties?: Json | null
          texture_url: string
          thumbnail_url?: string | null
          updated_at?: string | null
        }
        Update: {
          color_hex?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          material_type?: string
          name?: string
          properties?: Json | null
          texture_url?: string
          thumbnail_url?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      designer_projects: {
        Row: {
          camera_position: Json | null
          camera_target: Json | null
          created_at: string | null
          description: string | null
          id: string
          is_public: boolean | null
          items: Json
          name: string
          room_config: Json
          share_token: string | null
          thumbnail_url: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          camera_position?: Json | null
          camera_target?: Json | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          items?: Json
          name: string
          room_config?: Json
          share_token?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          camera_position?: Json | null
          camera_target?: Json | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          items?: Json
          name?: string
          room_config?: Json
          share_token?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      document_chunks: {
        Row: {
          boundary_quality: number | null
          category: string | null
          chunk_index: number | null
          chunk_type: string | null
          chunk_type_confidence: number | null
          chunk_type_metadata: Json | null
          coherence_metrics: Json | null
          coherence_score: number | null
          confidence_score: number | null
          content: string
          content_hash: string | null
          content_tsv: unknown
          created_at: string | null
          document_id: string | null
          embedding_dimension: number | null
          embedding_generated_at: string | null
          embedding_model: string | null
          extraction_stage: string | null
          has_text_embedding: boolean
          id: string
          metadata: Json | null
          processing_metadata: Json | null
          product_id: string | null
          prompt_version: number | null
          quality_assessment: string | null
          quality_recommendations: string[] | null
          quality_score: number | null
          semantic_completeness: number | null
          source_job_id: string | null
          source_type: string | null
          text_embedding: unknown
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          boundary_quality?: number | null
          category?: string | null
          chunk_index?: number | null
          chunk_type?: string | null
          chunk_type_confidence?: number | null
          chunk_type_metadata?: Json | null
          coherence_metrics?: Json | null
          coherence_score?: number | null
          confidence_score?: number | null
          content: string
          content_hash?: string | null
          content_tsv?: unknown
          created_at?: string | null
          document_id?: string | null
          embedding_dimension?: number | null
          embedding_generated_at?: string | null
          embedding_model?: string | null
          extraction_stage?: string | null
          has_text_embedding?: boolean
          id?: string
          metadata?: Json | null
          processing_metadata?: Json | null
          product_id?: string | null
          prompt_version?: number | null
          quality_assessment?: string | null
          quality_recommendations?: string[] | null
          quality_score?: number | null
          semantic_completeness?: number | null
          source_job_id?: string | null
          source_type?: string | null
          text_embedding?: unknown
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          boundary_quality?: number | null
          category?: string | null
          chunk_index?: number | null
          chunk_type?: string | null
          chunk_type_confidence?: number | null
          chunk_type_metadata?: Json | null
          coherence_metrics?: Json | null
          coherence_score?: number | null
          confidence_score?: number | null
          content?: string
          content_hash?: string | null
          content_tsv?: unknown
          created_at?: string | null
          document_id?: string | null
          embedding_dimension?: number | null
          embedding_generated_at?: string | null
          embedding_model?: string | null
          extraction_stage?: string | null
          has_text_embedding?: boolean
          id?: string
          metadata?: Json | null
          processing_metadata?: Json | null
          product_id?: string | null
          prompt_version?: number | null
          quality_assessment?: string | null
          quality_recommendations?: string[] | null
          quality_score?: number | null
          semantic_completeness?: number | null
          source_job_id?: string | null
          source_type?: string | null
          text_embedding?: unknown
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      document_entities: {
        Row: {
          content: string | null
          created_at: string | null
          description: string | null
          entity_type: string
          factory_group: string | null
          factory_name: string | null
          id: string
          manufacturer: string | null
          metadata: Json | null
          name: string
          page_range: number[] | null
          source_document_id: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          description?: string | null
          entity_type: string
          factory_group?: string | null
          factory_name?: string | null
          id?: string
          manufacturer?: string | null
          metadata?: Json | null
          name: string
          page_range?: number[] | null
          source_document_id?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          description?: string | null
          entity_type?: string
          factory_group?: string | null
          factory_name?: string | null
          id?: string
          manufacturer?: string | null
          metadata?: Json | null
          name?: string
          page_range?: number[] | null
          source_document_id?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      document_images: {
        Row: {
          alt_text: string | null
          analysis_metadata: Json | null
          bbox: Json | null
          caption: string | null
          captures_vector_graphics: boolean | null
          category: string | null
          chunk_id: string | null
          claude_validation: Json | null
          confidence: number | null
          confidence_score: number | null
          contextual_name: string | null
          created_at: string | null
          detection_confidence: number | null
          detection_method: string | null
          document_id: string | null
          duplicate_of: string | null
          embedding_metadata: Json | null
          extracted_metadata: Json | null
          extraction_layer: string
          has_color_slig: boolean
          has_material_slig: boolean
          has_slig_embedding: boolean
          has_style_slig: boolean
          has_texture_slig: boolean
          has_understanding_embedding: boolean
          heading_distance: number | null
          heading_level: number | null
          id: string
          image_analysis_results: Json | null
          image_type: string | null
          image_url: string
          is_duplicate: boolean | null
          layer: number | null
          layout_region_id: string | null
          material_properties: Json | null
          metadata: Json | null
          multimodal_metadata: Json | null
          nearest_heading: string | null
          ocr_attempts: number | null
          ocr_blocks: Json | null
          ocr_confidence_score: number | null
          ocr_extracted_text: string | null
          ocr_failed: boolean | null
          ocr_skipped_reason: string | null
          ocr_text: string | null
          page_number: number | null
          perceptual_hash: string | null
          processing_status: string | null
          product_name: string | null
          proximity_score: number | null
          quality_metrics: Json | null
          quality_score: number | null
          related_chunks_count: number | null
          source_job_id: string | null
          source_type: string | null
          vision_analysis: Json | null
          vision_model: string | null
          vision_provider: string | null
          visual_features: Json | null
          visual_metadata_extraction: Json | null
          workspace_id: string | null
          yolo_confidence: number | null
          yolo_detected: boolean | null
          yolo_reading_order: number | null
          yolo_region_type: string | null
        }
        Insert: {
          alt_text?: string | null
          analysis_metadata?: Json | null
          bbox?: Json | null
          caption?: string | null
          captures_vector_graphics?: boolean | null
          category?: string | null
          chunk_id?: string | null
          claude_validation?: Json | null
          confidence?: number | null
          confidence_score?: number | null
          contextual_name?: string | null
          created_at?: string | null
          detection_confidence?: number | null
          detection_method?: string | null
          document_id?: string | null
          duplicate_of?: string | null
          embedding_metadata?: Json | null
          extracted_metadata?: Json | null
          extraction_layer?: string
          has_color_slig?: boolean
          has_material_slig?: boolean
          has_slig_embedding?: boolean
          has_style_slig?: boolean
          has_texture_slig?: boolean
          has_understanding_embedding?: boolean
          heading_distance?: number | null
          heading_level?: number | null
          id?: string
          image_analysis_results?: Json | null
          image_type?: string | null
          image_url: string
          is_duplicate?: boolean | null
          layer?: number | null
          layout_region_id?: string | null
          material_properties?: Json | null
          metadata?: Json | null
          multimodal_metadata?: Json | null
          nearest_heading?: string | null
          ocr_attempts?: number | null
          ocr_blocks?: Json | null
          ocr_confidence_score?: number | null
          ocr_extracted_text?: string | null
          ocr_failed?: boolean | null
          ocr_skipped_reason?: string | null
          ocr_text?: string | null
          page_number?: number | null
          perceptual_hash?: string | null
          processing_status?: string | null
          product_name?: string | null
          proximity_score?: number | null
          quality_metrics?: Json | null
          quality_score?: number | null
          related_chunks_count?: number | null
          source_job_id?: string | null
          source_type?: string | null
          vision_analysis?: Json | null
          vision_model?: string | null
          vision_provider?: string | null
          visual_features?: Json | null
          visual_metadata_extraction?: Json | null
          workspace_id?: string | null
          yolo_confidence?: number | null
          yolo_detected?: boolean | null
          yolo_reading_order?: number | null
          yolo_region_type?: string | null
        }
        Update: {
          alt_text?: string | null
          analysis_metadata?: Json | null
          bbox?: Json | null
          caption?: string | null
          captures_vector_graphics?: boolean | null
          category?: string | null
          chunk_id?: string | null
          claude_validation?: Json | null
          confidence?: number | null
          confidence_score?: number | null
          contextual_name?: string | null
          created_at?: string | null
          detection_confidence?: number | null
          detection_method?: string | null
          document_id?: string | null
          duplicate_of?: string | null
          embedding_metadata?: Json | null
          extracted_metadata?: Json | null
          extraction_layer?: string
          has_color_slig?: boolean
          has_material_slig?: boolean
          has_slig_embedding?: boolean
          has_style_slig?: boolean
          has_texture_slig?: boolean
          has_understanding_embedding?: boolean
          heading_distance?: number | null
          heading_level?: number | null
          id?: string
          image_analysis_results?: Json | null
          image_type?: string | null
          image_url?: string
          is_duplicate?: boolean | null
          layer?: number | null
          layout_region_id?: string | null
          material_properties?: Json | null
          metadata?: Json | null
          multimodal_metadata?: Json | null
          nearest_heading?: string | null
          ocr_attempts?: number | null
          ocr_blocks?: Json | null
          ocr_confidence_score?: number | null
          ocr_extracted_text?: string | null
          ocr_failed?: boolean | null
          ocr_skipped_reason?: string | null
          ocr_text?: string | null
          page_number?: number | null
          perceptual_hash?: string | null
          processing_status?: string | null
          product_name?: string | null
          proximity_score?: number | null
          quality_metrics?: Json | null
          quality_score?: number | null
          related_chunks_count?: number | null
          source_job_id?: string | null
          source_type?: string | null
          vision_analysis?: Json | null
          vision_model?: string | null
          vision_provider?: string | null
          visual_features?: Json | null
          visual_metadata_extraction?: Json | null
          workspace_id?: string | null
          yolo_confidence?: number | null
          yolo_detected?: boolean | null
          yolo_reading_order?: number | null
          yolo_region_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_images_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_images_layout_region_id_fkey"
            columns: ["layout_region_id"]
            isOneToOne: false
            referencedRelation: "product_layout_regions"
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
            referencedRelation: "documents"
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
          average_chunk_size: number | null
          average_coherence_score: number | null
          average_image_quality: number | null
          calculated_at: string | null
          chunks_with_high_coherence: number | null
          chunks_with_low_coherence: number | null
          document_id: string
          id: string
          images_with_high_quality: number | null
          images_with_low_quality: number | null
          overall_quality_score: number | null
          quality_assessment: string | null
          total_chunks: number | null
          total_images: number | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          average_chunk_size?: number | null
          average_coherence_score?: number | null
          average_image_quality?: number | null
          calculated_at?: string | null
          chunks_with_high_coherence?: number | null
          chunks_with_low_coherence?: number | null
          document_id: string
          id?: string
          images_with_high_quality?: number | null
          images_with_low_quality?: number | null
          overall_quality_score?: number | null
          quality_assessment?: string | null
          total_chunks?: number | null
          total_images?: number | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          average_chunk_size?: number | null
          average_coherence_score?: number | null
          average_image_quality?: number | null
          calculated_at?: string | null
          chunks_with_high_coherence?: number | null
          chunks_with_low_coherence?: number | null
          document_id?: string
          id?: string
          images_with_high_quality?: number | null
          images_with_low_quality?: number | null
          overall_quality_score?: number | null
          quality_assessment?: string | null
          total_chunks?: number | null
          total_images?: number | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_quality_metrics_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          content: string | null
          content_type: string | null
          created_at: string | null
          created_by: string | null
          file_path: string | null
          file_size: number | null
          filename: string
          id: string
          metadata: Json | null
          processing_status: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          content?: string | null
          content_type?: string | null
          created_at?: string | null
          created_by?: string | null
          file_path?: string | null
          file_size?: number | null
          filename: string
          id?: string
          metadata?: Json | null
          processing_status?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          content?: string | null
          content_type?: string | null
          created_at?: string | null
          created_by?: string | null
          file_path?: string | null
          file_size?: number | null
          filename?: string
          id?: string
          metadata?: Json | null
          processing_status?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      duplicate_detection_cache: {
        Row: {
          confidence_level: string | null
          description_similarity: number | null
          detected_at: string | null
          id: string
          is_duplicate: boolean | null
          metadata_similarity: number | null
          name_similarity: number | null
          overall_similarity_score: number
          product_id_1: string
          product_id_2: string
          reviewed_at: string | null
          reviewed_by: string | null
          similarity_breakdown: Json | null
          status: string | null
          updated_at: string | null
          visual_similarity: number | null
          workspace_id: string
        }
        Insert: {
          confidence_level?: string | null
          description_similarity?: number | null
          detected_at?: string | null
          id?: string
          is_duplicate?: boolean | null
          metadata_similarity?: number | null
          name_similarity?: number | null
          overall_similarity_score: number
          product_id_1: string
          product_id_2: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          similarity_breakdown?: Json | null
          status?: string | null
          updated_at?: string | null
          visual_similarity?: number | null
          workspace_id: string
        }
        Update: {
          confidence_level?: string | null
          description_similarity?: number | null
          detected_at?: string | null
          id?: string
          is_duplicate?: boolean | null
          metadata_similarity?: number | null
          name_similarity?: number | null
          overall_similarity_score?: number
          product_id_1?: string
          product_id_2?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          similarity_breakdown?: Json | null
          status?: string | null
          updated_at?: string | null
          visual_similarity?: number | null
          workspace_id?: string
        }
        Relationships: []
      }
      email_actions: {
        Row: {
          action_key: string
          action_name: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          template_id: string | null
          trigger_conditions: Json | null
          updated_at: string | null
        }
        Insert: {
          action_key: string
          action_name: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          template_id?: string | null
          trigger_conditions?: Json | null
          updated_at?: string | null
        }
        Update: {
          action_key?: string
          action_name?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          template_id?: string | null
          trigger_conditions?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_actions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_analytics: {
        Row: {
          bounce_rate: number | null
          click_rate: number | null
          complaint_rate: number | null
          created_at: string | null
          date: string
          delivery_rate: number | null
          email_type: string
          id: string
          open_rate: number | null
          total_bounced: number | null
          total_clicked: number | null
          total_complained: number | null
          total_delivered: number | null
          total_opened: number | null
          total_sent: number | null
          updated_at: string | null
        }
        Insert: {
          bounce_rate?: number | null
          click_rate?: number | null
          complaint_rate?: number | null
          created_at?: string | null
          date: string
          delivery_rate?: number | null
          email_type?: string
          id?: string
          open_rate?: number | null
          total_bounced?: number | null
          total_clicked?: number | null
          total_complained?: number | null
          total_delivered?: number | null
          total_opened?: number | null
          total_sent?: number | null
          updated_at?: string | null
        }
        Update: {
          bounce_rate?: number | null
          click_rate?: number | null
          complaint_rate?: number | null
          created_at?: string | null
          date?: string
          delivery_rate?: number | null
          email_type?: string
          id?: string
          open_rate?: number | null
          total_bounced?: number | null
          total_clicked?: number | null
          total_complained?: number | null
          total_delivered?: number | null
          total_opened?: number | null
          total_sent?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      email_domains: {
        Row: {
          bounce_rate: number | null
          complaint_rate: number | null
          created_at: string | null
          created_by: string | null
          dkim_tokens: string[] | null
          domain: string
          id: string
          is_default: boolean | null
          is_verified: boolean | null
          mail_from_domain: string | null
          reputation_score: number | null
          updated_at: string | null
          verification_status: string | null
          verification_token: string | null
          verified_at: string | null
        }
        Insert: {
          bounce_rate?: number | null
          complaint_rate?: number | null
          created_at?: string | null
          created_by?: string | null
          dkim_tokens?: string[] | null
          domain: string
          id?: string
          is_default?: boolean | null
          is_verified?: boolean | null
          mail_from_domain?: string | null
          reputation_score?: number | null
          updated_at?: string | null
          verification_status?: string | null
          verification_token?: string | null
          verified_at?: string | null
        }
        Update: {
          bounce_rate?: number | null
          complaint_rate?: number | null
          created_at?: string | null
          created_by?: string | null
          dkim_tokens?: string[] | null
          domain?: string
          id?: string
          is_default?: boolean | null
          is_verified?: boolean | null
          mail_from_domain?: string | null
          reputation_score?: number | null
          updated_at?: string | null
          verification_status?: string | null
          verification_token?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
      email_events: {
        Row: {
          bounce_subtype: string | null
          bounce_type: string | null
          complaint_feedback_type: string | null
          created_at: string | null
          diagnostic_code: string | null
          email_log_id: string | null
          event_subtype: string | null
          event_type: string
          id: string
          message_id: string
          raw_event: Json | null
          timestamp: string
        }
        Insert: {
          bounce_subtype?: string | null
          bounce_type?: string | null
          complaint_feedback_type?: string | null
          created_at?: string | null
          diagnostic_code?: string | null
          email_log_id?: string | null
          event_subtype?: string | null
          event_type: string
          id?: string
          message_id: string
          raw_event?: Json | null
          timestamp: string
        }
        Update: {
          bounce_subtype?: string | null
          bounce_type?: string | null
          complaint_feedback_type?: string | null
          created_at?: string | null
          diagnostic_code?: string | null
          email_log_id?: string | null
          event_subtype?: string | null
          event_type?: string
          id?: string
          message_id?: string
          raw_event?: Json | null
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_events_email_log_id_fkey"
            columns: ["email_log_id"]
            isOneToOne: false
            referencedRelation: "email_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          bcc_emails: string[] | null
          bounce_subtype: string | null
          bounce_type: string | null
          bounced_at: string | null
          cc_emails: string[] | null
          clicked_at: string | null
          complained_at: string | null
          complaint_feedback_type: string | null
          created_at: string | null
          created_by: string | null
          delivered_at: string | null
          domain_id: string | null
          email_type: string
          error_message: string | null
          from_email: string
          from_name: string | null
          html_body: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          opened_at: string | null
          reply_to: string | null
          sent_at: string | null
          status: string | null
          subject: string
          tags: Json | null
          template_id: string | null
          text_body: string | null
          to_email: string
          updated_at: string | null
          variables: Json | null
        }
        Insert: {
          bcc_emails?: string[] | null
          bounce_subtype?: string | null
          bounce_type?: string | null
          bounced_at?: string | null
          cc_emails?: string[] | null
          clicked_at?: string | null
          complained_at?: string | null
          complaint_feedback_type?: string | null
          created_at?: string | null
          created_by?: string | null
          delivered_at?: string | null
          domain_id?: string | null
          email_type?: string
          error_message?: string | null
          from_email: string
          from_name?: string | null
          html_body?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          opened_at?: string | null
          reply_to?: string | null
          sent_at?: string | null
          status?: string | null
          subject: string
          tags?: Json | null
          template_id?: string | null
          text_body?: string | null
          to_email: string
          updated_at?: string | null
          variables?: Json | null
        }
        Update: {
          bcc_emails?: string[] | null
          bounce_subtype?: string | null
          bounce_type?: string | null
          bounced_at?: string | null
          cc_emails?: string[] | null
          clicked_at?: string | null
          complained_at?: string | null
          complaint_feedback_type?: string | null
          created_at?: string | null
          created_by?: string | null
          delivered_at?: string | null
          domain_id?: string | null
          email_type?: string
          error_message?: string | null
          from_email?: string
          from_name?: string | null
          html_body?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          opened_at?: string | null
          reply_to?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string
          tags?: Json | null
          template_id?: string | null
          text_body?: string | null
          to_email?: string
          updated_at?: string | null
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "email_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_settings: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          setting_key: string
          setting_value: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          setting_key: string
          setting_value: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      email_template_versions: {
        Row: {
          created_at: string | null
          created_by: string | null
          html_template: string
          id: string
          subject_template: string
          template_id: string
          text_template: string | null
          variables: Json | null
          version: number
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          html_template: string
          id?: string
          subject_template: string
          template_id: string
          text_template?: string | null
          variables?: Json | null
          version: number
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          html_template?: string
          id?: string
          subject_template?: string
          template_id?: string
          text_template?: string | null
          variables?: Json | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "email_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          category: string
          created_at: string | null
          created_by: string | null
          description: string | null
          html_template: string | null
          id: string
          is_active: boolean | null
          is_system: boolean | null
          name: string
          preview_image: string | null
          preview_text: string | null
          react_code: string | null
          slug: string
          subject_template: string | null
          text_template: string | null
          unlayer_design: Json | null
          updated_at: string | null
          updated_by: string | null
          variables: string[] | null
          version: number | null
        }
        Insert: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          html_template?: string | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          name: string
          preview_image?: string | null
          preview_text?: string | null
          react_code?: string | null
          slug: string
          subject_template?: string | null
          text_template?: string | null
          unlayer_design?: Json | null
          updated_at?: string | null
          updated_by?: string | null
          variables?: string[] | null
          version?: number | null
        }
        Update: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          html_template?: string | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          name?: string
          preview_image?: string | null
          preview_text?: string | null
          react_code?: string | null
          slug?: string
          subject_template?: string | null
          text_template?: string | null
          unlayer_design?: Json | null
          updated_at?: string | null
          updated_by?: string | null
          variables?: string[] | null
          version?: number | null
        }
        Relationships: []
      }
      embedding_stability_metrics: {
        Row: {
          anomaly_detected: boolean | null
          batch_id: string | null
          chunk_id: string
          consistency_score: number | null
          created_at: string | null
          document_id: string
          embedding_vector: unknown
          id: string
          stability_score: number | null
          updated_at: string | null
          variance_score: number | null
        }
        Insert: {
          anomaly_detected?: boolean | null
          batch_id?: string | null
          chunk_id: string
          consistency_score?: number | null
          created_at?: string | null
          document_id: string
          embedding_vector?: unknown
          id?: string
          stability_score?: number | null
          updated_at?: string | null
          variance_score?: number | null
        }
        Update: {
          anomaly_detected?: boolean | null
          batch_id?: string | null
          chunk_id?: string
          consistency_score?: number | null
          created_at?: string | null
          document_id?: string
          embedding_vector?: unknown
          id?: string
          stability_score?: number | null
          updated_at?: string | null
          variance_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "embedding_stability_metrics_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: true
            referencedRelation: "document_chunks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "embedding_stability_metrics_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      extraction_config: {
        Row: {
          chunk_overlap: number | null
          chunk_size: number | null
          created_at: string | null
          default_categories: string[] | null
          discovery_model: string | null
          enable_prompt_enhancement: boolean | null
          enabled_categories: string[] | null
          id: string
          quality_threshold: number | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          chunk_overlap?: number | null
          chunk_size?: number | null
          created_at?: string | null
          default_categories?: string[] | null
          discovery_model?: string | null
          enable_prompt_enhancement?: boolean | null
          enabled_categories?: string[] | null
          id?: string
          quality_threshold?: number | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          chunk_overlap?: number | null
          chunk_size?: number | null
          created_at?: string | null
          default_categories?: string[] | null
          discovery_model?: string | null
          enable_prompt_enhancement?: boolean | null
          enabled_categories?: string[] | null
          id?: string
          quality_threshold?: number | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "extraction_config_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      extraction_prompts: {
        Row: {
          category: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_custom: boolean | null
          prompt_template: string
          stage: string
          updated_at: string | null
          version: number
          workspace_id: string
        }
        Insert: {
          category: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_custom?: boolean | null
          prompt_template: string
          stage: string
          updated_at?: string | null
          version: number
          workspace_id: string
        }
        Update: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_custom?: boolean | null
          prompt_template?: string
          stage?: string
          updated_at?: string | null
          version?: number
          workspace_id?: string
        }
        Relationships: []
      }
      factory_registration_requests: {
        Row: {
          company_name: string
          created_at: string | null
          factory_claimed_name: string
          id: string
          message: string | null
          professional_type: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          company_name: string
          created_at?: string | null
          factory_claimed_name: string
          id?: string
          message?: string | null
          professional_type: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          company_name?: string
          created_at?: string | null
          factory_claimed_name?: string
          id?: string
          message?: string | null
          professional_type?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      field_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          fields: Json
          id: string
          is_global: boolean | null
          name: string
          updated_at: string | null
          usage_count: number | null
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          fields?: Json
          id?: string
          is_global?: boolean | null
          name: string
          updated_at?: string | null
          usage_count?: number | null
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          fields?: Json
          id?: string
          is_global?: boolean | null
          name?: string
          updated_at?: string | null
          usage_count?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_run_steps: {
        Row: {
          branch_taken: string | null
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          execution_order: number
          flow_run_id: string
          id: string
          input_data: Json | null
          node_config: Json | null
          node_id: string
          node_label: string | null
          node_type: string
          output_data: Json | null
          retry_count: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["automation_step_status"]
        }
        Insert: {
          branch_taken?: string | null
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          execution_order?: number
          flow_run_id: string
          id?: string
          input_data?: Json | null
          node_config?: Json | null
          node_id: string
          node_label?: string | null
          node_type: string
          output_data?: Json | null
          retry_count?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["automation_step_status"]
        }
        Update: {
          branch_taken?: string | null
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          execution_order?: number
          flow_run_id?: string
          id?: string
          input_data?: Json | null
          node_config?: Json | null
          node_id?: string
          node_label?: string | null
          node_type?: string
          output_data?: Json | null
          retry_count?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["automation_step_status"]
        }
        Relationships: [
          {
            foreignKeyName: "flow_run_steps_flow_run_id_fkey"
            columns: ["flow_run_id"]
            isOneToOne: false
            referencedRelation: "flow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_runs: {
        Row: {
          completed_at: string | null
          context: Json | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          error_node_id: string | null
          flow_id: string
          flow_version: number
          id: string
          initiated_by: string | null
          is_test_run: boolean
          started_at: string | null
          status: Database["public"]["Enums"]["automation_run_status"]
          trigger_event_data: Json | null
          trigger_type: string
        }
        Insert: {
          completed_at?: string | null
          context?: Json | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          error_node_id?: string | null
          flow_id: string
          flow_version: number
          id?: string
          initiated_by?: string | null
          is_test_run?: boolean
          started_at?: string | null
          status?: Database["public"]["Enums"]["automation_run_status"]
          trigger_event_data?: Json | null
          trigger_type: string
        }
        Update: {
          completed_at?: string | null
          context?: Json | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          error_node_id?: string | null
          flow_id?: string
          flow_version?: number
          id?: string
          initiated_by?: string | null
          is_test_run?: boolean
          started_at?: string | null
          status?: Database["public"]["Enums"]["automation_run_status"]
          trigger_event_data?: Json | null
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_runs_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
        ]
      }
      flows: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          graph_definition: Json
          id: string
          last_run_at: string | null
          name: string
          run_count: number
          status: Database["public"]["Enums"]["automation_flow_status"]
          tags: string[] | null
          trigger_config: Json
          trigger_type: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          graph_definition?: Json
          id?: string
          last_run_at?: string | null
          name: string
          run_count?: number
          status?: Database["public"]["Enums"]["automation_flow_status"]
          tags?: string[] | null
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          graph_definition?: Json
          id?: string
          last_run_at?: string | null
          name?: string
          run_count?: number
          status?: Database["public"]["Enums"]["automation_flow_status"]
          tags?: string[] | null
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      generation_3d: {
        Row: {
          api_responses: Json | null
          completed_at: string | null
          created_at: string
          current_model_index: number | null
          current_step: string | null
          error_message: string | null
          estimated_completion_time: string | null
          final_results: Json | null
          generated_images: Json | null
          generation_status: string | null
          id: string
          image_urls: string[] | null
          input_images: Json | null
          material_ids: string[] | null
          materials_used: string[] | null
          model_processing_times: Json | null
          model_used: string | null
          models_errors: Json | null
          models_queue: Json | null
          models_results: Json | null
          processing_time_ms: number | null
          progress_percentage: number | null
          prompt: string
          request_type: string | null
          result_data: Json | null
          room_type: string | null
          saved_to_moodboard_at: string | null
          session_id: string | null
          style: string | null
          style_preferences: Json | null
          total_cost: number | null
          total_processing_time_ms: number | null
          updated_at: string
          user_id: string
          workflow_status: string | null
          workspace_id: string | null
        }
        Insert: {
          api_responses?: Json | null
          completed_at?: string | null
          created_at?: string
          current_model_index?: number | null
          current_step?: string | null
          error_message?: string | null
          estimated_completion_time?: string | null
          final_results?: Json | null
          generated_images?: Json | null
          generation_status?: string | null
          id?: string
          image_urls?: string[] | null
          input_images?: Json | null
          material_ids?: string[] | null
          materials_used?: string[] | null
          model_processing_times?: Json | null
          model_used?: string | null
          models_errors?: Json | null
          models_queue?: Json | null
          models_results?: Json | null
          processing_time_ms?: number | null
          progress_percentage?: number | null
          prompt: string
          request_type?: string | null
          result_data?: Json | null
          room_type?: string | null
          saved_to_moodboard_at?: string | null
          session_id?: string | null
          style?: string | null
          style_preferences?: Json | null
          total_cost?: number | null
          total_processing_time_ms?: number | null
          updated_at?: string
          user_id: string
          workflow_status?: string | null
          workspace_id?: string | null
        }
        Update: {
          api_responses?: Json | null
          completed_at?: string | null
          created_at?: string
          current_model_index?: number | null
          current_step?: string | null
          error_message?: string | null
          estimated_completion_time?: string | null
          final_results?: Json | null
          generated_images?: Json | null
          generation_status?: string | null
          id?: string
          image_urls?: string[] | null
          input_images?: Json | null
          material_ids?: string[] | null
          materials_used?: string[] | null
          model_processing_times?: Json | null
          model_used?: string | null
          models_errors?: Json | null
          models_queue?: Json | null
          models_results?: Json | null
          processing_time_ms?: number | null
          progress_percentage?: number | null
          prompt?: string
          request_type?: string | null
          result_data?: Json | null
          room_type?: string | null
          saved_to_moodboard_at?: string | null
          session_id?: string | null
          style?: string | null
          style_preferences?: Json | null
          total_cost?: number | null
          total_processing_time_ms?: number | null
          updated_at?: string
          user_id?: string
          workflow_status?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      generation_3d_segments: {
        Row: {
          bbox: Json
          confidence: number | null
          created_at: string | null
          crop_storage_url: string | null
          dominant_color: string | null
          finish: string | null
          generation_id: string
          id: string
          label: string | null
          material_type: string | null
          model_id: string
          search_query: string | null
          search_results: Json | null
          segment_index: number
          source_image_url: string
          zone_intent: string | null
        }
        Insert: {
          bbox: Json
          confidence?: number | null
          created_at?: string | null
          crop_storage_url?: string | null
          dominant_color?: string | null
          finish?: string | null
          generation_id: string
          id?: string
          label?: string | null
          material_type?: string | null
          model_id: string
          search_query?: string | null
          search_results?: Json | null
          segment_index: number
          source_image_url: string
          zone_intent?: string | null
        }
        Update: {
          bbox?: Json
          confidence?: number | null
          created_at?: string | null
          crop_storage_url?: string | null
          dominant_color?: string | null
          finish?: string | null
          generation_id?: string
          id?: string
          label?: string | null
          material_type?: string | null
          model_id?: string
          search_query?: string | null
          search_results?: Json | null
          segment_index?: number
          source_image_url?: string
          zone_intent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generation_3d_segments_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generation_3d"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_videos: {
        Row: {
          aspect_ratio: string
          completed_at: string | null
          created_at: string
          credits_used: number
          duration_s: number
          error_message: string | null
          id: string
          model: string
          model_version: string | null
          prompt: string | null
          replicate_prediction_id: string | null
          resolution: string
          source_image_url: string
          status: string
          user_id: string | null
          video_type: string | null
          video_url: string | null
          workspace_id: string | null
        }
        Insert: {
          aspect_ratio?: string
          completed_at?: string | null
          created_at?: string
          credits_used?: number
          duration_s?: number
          error_message?: string | null
          id?: string
          model?: string
          model_version?: string | null
          prompt?: string | null
          replicate_prediction_id?: string | null
          resolution?: string
          source_image_url: string
          status?: string
          user_id?: string | null
          video_type?: string | null
          video_url?: string | null
          workspace_id?: string | null
        }
        Update: {
          aspect_ratio?: string
          completed_at?: string | null
          created_at?: string
          credits_used?: number
          duration_s?: number
          error_message?: string | null
          id?: string
          model?: string
          model_version?: string | null
          prompt?: string | null
          replicate_prediction_id?: string | null
          resolution?: string
          source_image_url?: string
          status?: string
          user_id?: string | null
          video_type?: string | null
          video_url?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      health_check: {
        Row: {
          details: Json | null
          id: string
          service_name: string
          status: string
          timestamp: string | null
        }
        Insert: {
          details?: Json | null
          id?: string
          service_name: string
          status: string
          timestamp?: string | null
        }
        Update: {
          details?: Json | null
          id?: string
          service_name?: string
          status?: string
          timestamp?: string | null
        }
        Relationships: []
      }
      image_processing_queue: {
        Row: {
          completed_at: string | null
          created_at: string | null
          document_id: string
          error_message: string | null
          id: string
          image_id: string
          max_retries: number | null
          priority: number | null
          result: Json | null
          retry_count: number | null
          started_at: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          document_id: string
          error_message?: string | null
          id?: string
          image_id: string
          max_retries?: number | null
          priority?: number | null
          result?: Json | null
          retry_count?: number | null
          started_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          document_id?: string
          error_message?: string | null
          id?: string
          image_id?: string
          max_retries?: number | null
          priority?: number | null
          result?: Json | null
          retry_count?: number | null
          started_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "image_processing_queue_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "processed_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "image_processing_queue_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "document_images"
            referencedColumns: ["id"]
          },
        ]
      }
      image_product_associations: {
        Row: {
          caption_score: number
          clip_score: number
          confidence: number
          created_at: string | null
          id: string
          image_id: string
          metadata: Json | null
          overall_score: number
          product_id: string
          reasoning: string | null
          spatial_score: number
          updated_at: string | null
        }
        Insert: {
          caption_score?: number
          clip_score?: number
          confidence?: number
          created_at?: string | null
          id?: string
          image_id: string
          metadata?: Json | null
          overall_score?: number
          product_id: string
          reasoning?: string | null
          spatial_score?: number
          updated_at?: string | null
        }
        Update: {
          caption_score?: number
          clip_score?: number
          confidence?: number
          created_at?: string | null
          id?: string
          image_id?: string
          metadata?: Json | null
          overall_score?: number
          product_id?: string
          reasoning?: string | null
          spatial_score?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "image_product_associations_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "document_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "image_product_associations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
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
      jwt_tokens_log: {
        Row: {
          action: string
          created_at: string | null
          expires_at: string | null
          id: string
          metadata: Json | null
          service: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          service: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          service?: string
          user_id?: string | null
        }
        Relationships: []
      }
      kb_categories: {
        Row: {
          access_level: string
          color: string | null
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          name: string
          parent_category_id: string | null
          slug: string | null
          sort_order: number | null
          trigger_keyword: string | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          access_level?: string
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          parent_category_id?: string | null
          slug?: string | null
          sort_order?: number | null
          trigger_keyword?: string | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          access_level?: string
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          parent_category_id?: string | null
          slug?: string | null
          sort_order?: number | null
          trigger_keyword?: string | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kb_categories_parent_category_id_fkey"
            columns: ["parent_category_id"]
            isOneToOne: false
            referencedRelation: "kb_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kb_categories_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_doc_attachments: {
        Row: {
          created_at: string | null
          created_by: string | null
          document_id: string
          id: string
          product_id: string
          relationship_type: string | null
          relevance_score: number | null
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          document_id: string
          id?: string
          product_id: string
          relationship_type?: string | null
          relevance_score?: number | null
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          document_id?: string
          id?: string
          product_id?: string
          relationship_type?: string | null
          relevance_score?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kb_doc_attachments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "kb_docs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kb_doc_attachments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kb_doc_attachments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_doc_comments: {
        Row: {
          comment_type: string | null
          content: string
          created_at: string | null
          created_by: string
          document_id: string
          id: string
          mentioned_users: string[] | null
          parent_comment_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          section_id: string | null
          section_title: string | null
          status: string | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          comment_type?: string | null
          content: string
          created_at?: string | null
          created_by: string
          document_id: string
          id?: string
          mentioned_users?: string[] | null
          parent_comment_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          section_id?: string | null
          section_title?: string | null
          status?: string | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          comment_type?: string | null
          content?: string
          created_at?: string | null
          created_by?: string
          document_id?: string
          id?: string
          mentioned_users?: string[] | null
          parent_comment_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          section_id?: string | null
          section_title?: string | null
          status?: string | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kb_doc_comments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "kb_docs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kb_doc_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "kb_doc_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kb_doc_comments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_doc_versions: {
        Row: {
          change_description: string | null
          change_type: string | null
          changed_fields: string[] | null
          content: string
          content_markdown: string | null
          created_at: string | null
          created_by: string | null
          document_id: string
          id: string
          metadata: Json | null
          summary: string | null
          title: string
          workspace_id: string
        }
        Insert: {
          change_description?: string | null
          change_type?: string | null
          changed_fields?: string[] | null
          content: string
          content_markdown?: string | null
          created_at?: string | null
          created_by?: string | null
          document_id: string
          id?: string
          metadata?: Json | null
          summary?: string | null
          title: string
          workspace_id: string
        }
        Update: {
          change_description?: string | null
          change_type?: string | null
          changed_fields?: string[] | null
          content?: string
          content_markdown?: string | null
          created_at?: string | null
          created_by?: string | null
          document_id?: string
          id?: string
          metadata?: Json | null
          summary?: string | null
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kb_doc_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "kb_docs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kb_doc_versions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_docs: {
        Row: {
          agent_mention_count: number | null
          category_id: string | null
          content: string
          content_markdown: string | null
          created_at: string | null
          created_by: string | null
          embedding_dimension: number | null
          embedding_error_message: string | null
          embedding_generated_at: string | null
          embedding_generation_time_ms: number | null
          embedding_model: string | null
          embedding_status: string | null
          id: string
          last_viewed_at: string | null
          metadata: Json | null
          price_doc_type: string | null
          published_at: string | null
          reading_time_minutes: number | null
          seo_keywords: string[] | null
          slug: string | null
          status: string | null
          summary: string | null
          text_embedding: unknown
          title: string
          updated_at: string | null
          updated_by: string | null
          view_count: number | null
          visibility: string | null
          workspace_id: string
        }
        Insert: {
          agent_mention_count?: number | null
          category_id?: string | null
          content: string
          content_markdown?: string | null
          created_at?: string | null
          created_by?: string | null
          embedding_dimension?: number | null
          embedding_error_message?: string | null
          embedding_generated_at?: string | null
          embedding_generation_time_ms?: number | null
          embedding_model?: string | null
          embedding_status?: string | null
          id?: string
          last_viewed_at?: string | null
          metadata?: Json | null
          price_doc_type?: string | null
          published_at?: string | null
          reading_time_minutes?: number | null
          seo_keywords?: string[] | null
          slug?: string | null
          status?: string | null
          summary?: string | null
          text_embedding?: unknown
          title: string
          updated_at?: string | null
          updated_by?: string | null
          view_count?: number | null
          visibility?: string | null
          workspace_id: string
        }
        Update: {
          agent_mention_count?: number | null
          category_id?: string | null
          content?: string
          content_markdown?: string | null
          created_at?: string | null
          created_by?: string | null
          embedding_dimension?: number | null
          embedding_error_message?: string | null
          embedding_generated_at?: string | null
          embedding_generation_time_ms?: number | null
          embedding_model?: string | null
          embedding_status?: string | null
          id?: string
          last_viewed_at?: string | null
          metadata?: Json | null
          price_doc_type?: string | null
          published_at?: string | null
          reading_time_minutes?: number | null
          seo_keywords?: string[] | null
          slug?: string | null
          status?: string | null
          summary?: string | null
          text_embedding?: unknown
          title?: string
          updated_at?: string | null
          updated_by?: string | null
          view_count?: number | null
          visibility?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_kb_docs_category"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "kb_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_base_docs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_search_analytics: {
        Row: {
          click_position: number | null
          clicked_document_id: string | null
          created_at: string | null
          id: string
          query: string
          results_count: number | null
          search_time_ms: number | null
          search_type: string | null
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          click_position?: number | null
          clicked_document_id?: string | null
          created_at?: string | null
          id?: string
          query: string
          results_count?: number | null
          search_time_ms?: number | null
          search_type?: string | null
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          click_position?: number | null
          clicked_document_id?: string | null
          created_at?: string | null
          id?: string
          query?: string
          results_count?: number | null
          search_time_ms?: number | null
          search_type?: string | null
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kb_search_analytics_clicked_document_id_fkey"
            columns: ["clicked_document_id"]
            isOneToOne: false
            referencedRelation: "kb_docs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kb_search_analytics_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      manufacturer_analytics_events: {
        Row: {
          category: string | null
          created_at: string
          event_type: string
          id: string
          manufacturer_id: string | null
          material_type: string | null
          metadata: Json | null
          product_id: string
          session_id: string
          source_page: string | null
          user_city: string | null
          user_country: string | null
          user_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          event_type: string
          id?: string
          manufacturer_id?: string | null
          material_type?: string | null
          metadata?: Json | null
          product_id: string
          session_id: string
          source_page?: string | null
          user_city?: string | null
          user_country?: string | null
          user_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          event_type?: string
          id?: string
          manufacturer_id?: string | null
          material_type?: string | null
          metadata?: Json | null
          product_id?: string
          session_id?: string
          source_page?: string | null
          user_city?: string | null
          user_country?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      match_corrections: {
        Row: {
          competitor_source_id: string | null
          corrected_match_kind: string
          correction_note: string | null
          created_at: string
          created_by: string | null
          id: string
          original_match_kind: string | null
          page_facets: Json | null
          price_history_id: string | null
          product_id: string | null
          product_title: string | null
          product_url: string | null
          query_facets: Json | null
          retailer_name: string | null
          tracked_query_history_id: string | null
          tracked_query_id: string | null
        }
        Insert: {
          competitor_source_id?: string | null
          corrected_match_kind: string
          correction_note?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          original_match_kind?: string | null
          page_facets?: Json | null
          price_history_id?: string | null
          product_id?: string | null
          product_title?: string | null
          product_url?: string | null
          query_facets?: Json | null
          retailer_name?: string | null
          tracked_query_history_id?: string | null
          tracked_query_id?: string | null
        }
        Update: {
          competitor_source_id?: string | null
          corrected_match_kind?: string
          correction_note?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          original_match_kind?: string | null
          page_facets?: Json | null
          price_history_id?: string | null
          product_id?: string | null
          product_title?: string | null
          product_url?: string | null
          query_facets?: Json | null
          retailer_name?: string | null
          tracked_query_history_id?: string | null
          tracked_query_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_corrections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_corrections_tracked_query_id_fkey"
            columns: ["tracked_query_id"]
            isOneToOne: false
            referencedRelation: "tracked_queries"
            referencedColumns: ["id"]
          },
        ]
      }
      material_alerts: {
        Row: {
          created_at: string
          id: string
          product_id: string
          read_at: string | null
          saved_search_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          read_at?: string | null
          saved_search_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          read_at?: string | null
          saved_search_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_alerts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_alerts_saved_search_id_fkey"
            columns: ["saved_search_id"]
            isOneToOne: false
            referencedRelation: "saved_searches"
            referencedColumns: ["id"]
          },
        ]
      }
      material_categories: {
        Row: {
          ai_confidence_threshold: number | null
          ai_extraction_enabled: boolean | null
          category_key: string
          category_path: unknown
          created_at: string | null
          created_by: string | null
          default_unit: string
          description: string | null
          display_group: string | null
          display_name: string
          hierarchy_level: number | null
          id: string
          is_active: boolean | null
          is_composite: boolean | null
          is_primary_category: boolean | null
          name: string
          parent_category_id: string | null
          processing_priority: number | null
          prototype_descriptions: string[]
          prototype_updated_at: string | null
          search_vector: unknown
          sort_order: number | null
          text_embedding_1024: unknown
          updated_at: string | null
          updated_by: string | null
          version: number | null
        }
        Insert: {
          ai_confidence_threshold?: number | null
          ai_extraction_enabled?: boolean | null
          category_key: string
          category_path?: unknown
          created_at?: string | null
          created_by?: string | null
          default_unit?: string
          description?: string | null
          display_group?: string | null
          display_name: string
          hierarchy_level?: number | null
          id?: string
          is_active?: boolean | null
          is_composite?: boolean | null
          is_primary_category?: boolean | null
          name: string
          parent_category_id?: string | null
          processing_priority?: number | null
          prototype_descriptions?: string[]
          prototype_updated_at?: string | null
          search_vector?: unknown
          sort_order?: number | null
          text_embedding_1024?: unknown
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
        }
        Update: {
          ai_confidence_threshold?: number | null
          ai_extraction_enabled?: boolean | null
          category_key?: string
          category_path?: unknown
          created_at?: string | null
          created_by?: string | null
          default_unit?: string
          description?: string | null
          display_group?: string | null
          display_name?: string
          hierarchy_level?: number | null
          id?: string
          is_active?: boolean | null
          is_composite?: boolean | null
          is_primary_category?: boolean | null
          name?: string
          parent_category_id?: string | null
          processing_priority?: number | null
          prototype_descriptions?: string[]
          prototype_updated_at?: string | null
          search_vector?: unknown
          sort_order?: number | null
          text_embedding_1024?: unknown
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "material_categories_parent_category_id_fkey"
            columns: ["parent_category_id"]
            isOneToOne: false
            referencedRelation: "material_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      material_images: {
        Row: {
          alt_text: string | null
          analysis_data: Json | null
          color_palette: Json | null
          created_at: string | null
          created_by: string | null
          description: string | null
          display_order: number | null
          file_name: string | null
          file_size: number | null
          height: number | null
          id: string
          image_type: string | null
          image_url: string
          is_featured: boolean | null
          material_id: string
          metadata: Json | null
          mime_type: string | null
          source_url: string | null
          storage_bucket: string | null
          storage_path: string | null
          tags: string[] | null
          title: string | null
          updated_at: string | null
          variants: Json | null
          verified_at: string | null
          verified_by: string | null
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          analysis_data?: Json | null
          color_palette?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          file_name?: string | null
          file_size?: number | null
          height?: number | null
          id?: string
          image_type?: string | null
          image_url: string
          is_featured?: boolean | null
          material_id: string
          metadata?: Json | null
          mime_type?: string | null
          source_url?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
          variants?: Json | null
          verified_at?: string | null
          verified_by?: string | null
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          analysis_data?: Json | null
          color_palette?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          file_name?: string | null
          file_size?: number | null
          height?: number | null
          id?: string
          image_type?: string | null
          image_url?: string
          is_featured?: boolean | null
          material_id?: string
          metadata?: Json | null
          mime_type?: string | null
          source_url?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
          variants?: Json | null
          verified_at?: string | null
          verified_by?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "material_images_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      material_kai_keys: {
        Row: {
          allowed_origins: string[] | null
          api_key: string
          created_at: string | null
          description: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          key_name: string
          last_used_at: string | null
          metadata: Json | null
          rate_limit_per_minute: number | null
          updated_at: string | null
          usage_count: number | null
          workspace_id: string
        }
        Insert: {
          allowed_origins?: string[] | null
          api_key: string
          created_at?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_name: string
          last_used_at?: string | null
          metadata?: Json | null
          rate_limit_per_minute?: number | null
          updated_at?: string | null
          usage_count?: number | null
          workspace_id: string
        }
        Update: {
          allowed_origins?: string[] | null
          api_key?: string
          created_at?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_name?: string
          last_used_at?: string | null
          metadata?: Json | null
          rate_limit_per_minute?: number | null
          updated_at?: string | null
          usage_count?: number | null
          workspace_id?: string
        }
        Relationships: []
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
      material_properties: {
        Row: {
          category: string | null
          created_at: string | null
          created_by: string | null
          data_type: string
          default_value: Json | null
          description: string | null
          display_name: string
          display_order: number | null
          id: string
          is_ai_extractable: boolean | null
          is_filterable: boolean | null
          is_required: boolean | null
          is_searchable: boolean | null
          name: string
          property_key: string
          prototype_descriptions: Json | null
          prototype_updated_at: string | null
          text_embedding_1024: unknown
          ui_component: string | null
          ui_props: Json | null
          updated_at: string | null
          updated_by: string | null
          validation_rules: Json | null
          version: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          data_type: string
          default_value?: Json | null
          description?: string | null
          display_name: string
          display_order?: number | null
          id?: string
          is_ai_extractable?: boolean | null
          is_filterable?: boolean | null
          is_required?: boolean | null
          is_searchable?: boolean | null
          name: string
          property_key: string
          prototype_descriptions?: Json | null
          prototype_updated_at?: string | null
          text_embedding_1024?: unknown
          ui_component?: string | null
          ui_props?: Json | null
          updated_at?: string | null
          updated_by?: string | null
          validation_rules?: Json | null
          version?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          data_type?: string
          default_value?: Json | null
          description?: string | null
          display_name?: string
          display_order?: number | null
          id?: string
          is_ai_extractable?: boolean | null
          is_filterable?: boolean | null
          is_required?: boolean | null
          is_searchable?: boolean | null
          name?: string
          property_key?: string
          prototype_descriptions?: Json | null
          prototype_updated_at?: string | null
          text_embedding_1024?: unknown
          ui_component?: string | null
          ui_props?: Json | null
          updated_at?: string | null
          updated_by?: string | null
          validation_rules?: Json | null
          version?: number | null
        }
        Relationships: []
      }
      material_reviews: {
        Row: {
          created_at: string | null
          id: string
          product_id: string
          rating: number
          review_text: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          product_id: string
          rating: number
          review_text?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          product_id?: string
          rating?: number
          review_text?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      materials_catalog: {
        Row: {
          acoustic_electrical_properties: Json | null
          application: string[] | null
          categories: Json | null
          category: Database["public"]["Enums"]["material_category"]
          category_id: string | null
          chemical_composition: Json | null
          chemical_hygiene_resistance: Json | null
          confidence_scores: Json | null
          created_at: string | null
          created_by: string | null
          description: string | null
          dimensional_aesthetic: Json | null
          embedding: unknown
          embedding_1024: unknown
          environmental_sustainability: Json | null
          extracted_entities: Json | null
          extracted_properties: Json | null
          finish: string[] | null
          id: string
          installation_method: string[] | null
          last_ai_extraction_at: string | null
          llama_analysis: Json | null
          mechanical_properties: Json | null
          metal_types: string[] | null
          name: string
          properties: Json | null
          r11: string | null
          safety_data: Json | null
          size: string[] | null
          slip_safety_ratings: Json | null
          standards: string[] | null
          surface_gloss_reflectivity: Json | null
          thermal_properties: Json | null
          thumbnail_url: string | null
          updated_at: string | null
          visual_analysis_confidence: number | null
          visual_embedding_1536: unknown
          visual_embedding_512: unknown
          water_moisture_resistance: Json | null
        }
        Insert: {
          acoustic_electrical_properties?: Json | null
          application?: string[] | null
          categories?: Json | null
          category: Database["public"]["Enums"]["material_category"]
          category_id?: string | null
          chemical_composition?: Json | null
          chemical_hygiene_resistance?: Json | null
          confidence_scores?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          dimensional_aesthetic?: Json | null
          embedding?: unknown
          embedding_1024?: unknown
          environmental_sustainability?: Json | null
          extracted_entities?: Json | null
          extracted_properties?: Json | null
          finish?: string[] | null
          id?: string
          installation_method?: string[] | null
          last_ai_extraction_at?: string | null
          llama_analysis?: Json | null
          mechanical_properties?: Json | null
          metal_types?: string[] | null
          name: string
          properties?: Json | null
          r11?: string | null
          safety_data?: Json | null
          size?: string[] | null
          slip_safety_ratings?: Json | null
          standards?: string[] | null
          surface_gloss_reflectivity?: Json | null
          thermal_properties?: Json | null
          thumbnail_url?: string | null
          updated_at?: string | null
          visual_analysis_confidence?: number | null
          visual_embedding_1536?: unknown
          visual_embedding_512?: unknown
          water_moisture_resistance?: Json | null
        }
        Update: {
          acoustic_electrical_properties?: Json | null
          application?: string[] | null
          categories?: Json | null
          category?: Database["public"]["Enums"]["material_category"]
          category_id?: string | null
          chemical_composition?: Json | null
          chemical_hygiene_resistance?: Json | null
          confidence_scores?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          dimensional_aesthetic?: Json | null
          embedding?: unknown
          embedding_1024?: unknown
          environmental_sustainability?: Json | null
          extracted_entities?: Json | null
          extracted_properties?: Json | null
          finish?: string[] | null
          id?: string
          installation_method?: string[] | null
          last_ai_extraction_at?: string | null
          llama_analysis?: Json | null
          mechanical_properties?: Json | null
          metal_types?: string[] | null
          name?: string
          properties?: Json | null
          r11?: string | null
          safety_data?: Json | null
          size?: string[] | null
          slip_safety_ratings?: Json | null
          standards?: string[] | null
          surface_gloss_reflectivity?: Json | null
          thermal_properties?: Json | null
          thumbnail_url?: string | null
          updated_at?: string | null
          visual_analysis_confidence?: number | null
          visual_embedding_1536?: unknown
          visual_embedding_512?: unknown
          water_moisture_resistance?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "materials_catalog_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "material_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      messaging_analytics: {
        Row: {
          channel_type: string
          date: string
          id: string
          total_cost: number | null
          total_delivered: number | null
          total_failed: number | null
          total_read: number | null
          total_sent: number | null
        }
        Insert: {
          channel_type: string
          date: string
          id?: string
          total_cost?: number | null
          total_delivered?: number | null
          total_failed?: number | null
          total_read?: number | null
          total_sent?: number | null
        }
        Update: {
          channel_type?: string
          date?: string
          id?: string
          total_cost?: number | null
          total_delivered?: number | null
          total_failed?: number | null
          total_read?: number | null
          total_sent?: number | null
        }
        Relationships: []
      }
      messaging_campaign_recipients: {
        Row: {
          campaign_id: string
          contact_id: string | null
          contact_name: string | null
          created_at: string | null
          delivered_at: string | null
          error_message: string | null
          failed_at: string | null
          id: string
          message_log_id: string | null
          phone_number: string
          read_at: string | null
          retry_count: number | null
          sent_at: string | null
          status: string | null
          variables: Json | null
        }
        Insert: {
          campaign_id: string
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          message_log_id?: string | null
          phone_number: string
          read_at?: string | null
          retry_count?: number | null
          sent_at?: string | null
          status?: string | null
          variables?: Json | null
        }
        Update: {
          campaign_id?: string
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          message_log_id?: string | null
          phone_number?: string
          read_at?: string | null
          retry_count?: number | null
          sent_at?: string | null
          status?: string | null
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "messaging_campaign_recipients_message_log_id_fkey"
            columns: ["message_log_id"]
            isOneToOne: false
            referencedRelation: "messaging_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      messaging_channels: {
        Row: {
          channel_type: string
          config: Json | null
          created_at: string | null
          daily_quota: number | null
          display_name: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          max_send_rate: number | null
          provider: string | null
          sender_id: string
          updated_at: string | null
        }
        Insert: {
          channel_type: string
          config?: Json | null
          created_at?: string | null
          daily_quota?: number | null
          display_name?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          max_send_rate?: number | null
          provider?: string | null
          sender_id: string
          updated_at?: string | null
        }
        Update: {
          channel_type?: string
          config?: Json | null
          created_at?: string | null
          daily_quota?: number | null
          display_name?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          max_send_rate?: number | null
          provider?: string | null
          sender_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      messaging_logs: {
        Row: {
          bulk_id: string | null
          callback_data: string | null
          campaign_id: string | null
          channel_id: string | null
          channel_type: string
          content: string | null
          cost: number | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          delivered_at: string | null
          error_code: string | null
          error_message: string | null
          failed_at: string | null
          from_number: string
          id: string
          media_url: string | null
          message_type: string | null
          provider_message_id: string | null
          read_at: string | null
          segment_count: number | null
          sent_at: string | null
          status: string | null
          tags: Json | null
          template_id: string | null
          to_number: string
          variables: Json | null
        }
        Insert: {
          bulk_id?: string | null
          callback_data?: string | null
          campaign_id?: string | null
          channel_id?: string | null
          channel_type: string
          content?: string | null
          cost?: number | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          delivered_at?: string | null
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          from_number: string
          id?: string
          media_url?: string | null
          message_type?: string | null
          provider_message_id?: string | null
          read_at?: string | null
          segment_count?: number | null
          sent_at?: string | null
          status?: string | null
          tags?: Json | null
          template_id?: string | null
          to_number: string
          variables?: Json | null
        }
        Update: {
          bulk_id?: string | null
          callback_data?: string | null
          campaign_id?: string | null
          channel_id?: string | null
          channel_type?: string
          content?: string | null
          cost?: number | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          delivered_at?: string | null
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          from_number?: string
          id?: string
          media_url?: string | null
          message_type?: string | null
          provider_message_id?: string | null
          read_at?: string | null
          segment_count?: number | null
          sent_at?: string | null
          status?: string | null
          tags?: Json | null
          template_id?: string | null
          to_number?: string
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "messaging_logs_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "messaging_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messaging_logs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "messaging_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      messaging_optouts: {
        Row: {
          channel_type: string
          created_at: string | null
          id: string
          opted_out_at: string | null
          phone_number: string
          reason: string | null
          source: string | null
        }
        Insert: {
          channel_type: string
          created_at?: string | null
          id?: string
          opted_out_at?: string | null
          phone_number: string
          reason?: string | null
          source?: string | null
        }
        Update: {
          channel_type?: string
          created_at?: string | null
          id?: string
          opted_out_at?: string | null
          phone_number?: string
          reason?: string | null
          source?: string | null
        }
        Relationships: []
      }
      messaging_settings: {
        Row: {
          config: Json | null
          created_at: string | null
          id: string
          is_configured: boolean | null
          provider: string
          updated_at: string | null
          webhook_url: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          id?: string
          is_configured?: boolean | null
          provider?: string
          updated_at?: string | null
          webhook_url?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          id?: string
          is_configured?: boolean | null
          provider?: string
          updated_at?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      messaging_templates: {
        Row: {
          approval_status: string | null
          buttons: Json | null
          category: string | null
          channel_type: string
          content: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_approved: boolean | null
          media_type: string | null
          media_url: string | null
          name: string
          slug: string
          updated_at: string | null
          variables: string[] | null
          whatsapp_language_code: string | null
          whatsapp_template_name: string | null
          whatsapp_template_namespace: string | null
        }
        Insert: {
          approval_status?: string | null
          buttons?: Json | null
          category?: string | null
          channel_type: string
          content: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_approved?: boolean | null
          media_type?: string | null
          media_url?: string | null
          name: string
          slug: string
          updated_at?: string | null
          variables?: string[] | null
          whatsapp_language_code?: string | null
          whatsapp_template_name?: string | null
          whatsapp_template_namespace?: string | null
        }
        Update: {
          approval_status?: string | null
          buttons?: Json | null
          category?: string | null
          channel_type?: string
          content?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_approved?: boolean | null
          media_type?: string | null
          media_url?: string | null
          name?: string
          slug?: string
          updated_at?: string | null
          variables?: string[] | null
          whatsapp_language_code?: string | null
          whatsapp_template_name?: string | null
          whatsapp_template_namespace?: string | null
        }
        Relationships: []
      }
      mivaa_api_usage_logs: {
        Row: {
          api_key_id: string | null
          created_at: string | null
          endpoint_id: string | null
          endpoint_path: string | null
          error_message: string | null
          error_type: string | null
          id: string
          ip_address: unknown
          is_internal_request: boolean | null
          rate_limit_exceeded: boolean | null
          request_body_size: number | null
          request_headers: Json | null
          request_method: string
          response_body_size: number | null
          response_status: number
          response_time_ms: number
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string | null
          endpoint_id?: string | null
          endpoint_path?: string | null
          error_message?: string | null
          error_type?: string | null
          id?: string
          ip_address?: unknown
          is_internal_request?: boolean | null
          rate_limit_exceeded?: boolean | null
          request_body_size?: number | null
          request_headers?: Json | null
          request_method: string
          response_body_size?: number | null
          response_status: number
          response_time_ms: number
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          api_key_id?: string | null
          created_at?: string | null
          endpoint_id?: string | null
          endpoint_path?: string | null
          error_message?: string | null
          error_type?: string | null
          id?: string
          ip_address?: unknown
          is_internal_request?: boolean | null
          rate_limit_exceeded?: boolean | null
          request_body_size?: number | null
          request_headers?: Json | null
          request_method?: string
          response_body_size?: number | null
          response_status?: number
          response_time_ms?: number
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      modules: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          enabled: boolean
          icon: string | null
          name: string
          price_tier: string | null
          slug: string
          updated_at: string | null
          version: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          enabled?: boolean
          icon?: string | null
          name: string
          price_tier?: string | null
          slug: string
          updated_at?: string | null
          version?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          enabled?: boolean
          icon?: string | null
          name?: string
          price_tier?: string | null
          slug?: string
          updated_at?: string | null
          version?: string | null
        }
        Relationships: []
      }
      moodboard_comments: {
        Row: {
          content: string
          created_at: string | null
          id: string
          moodboard_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          moodboard_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          moodboard_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moodboard_comments_moodboard_id_fkey"
            columns: ["moodboard_id"]
            isOneToOne: false
            referencedRelation: "moodboards"
            referencedColumns: ["id"]
          },
        ]
      }
      moodboard_items: {
        Row: {
          added_at: string
          id: string
          material_id: string | null
          media_title: string | null
          media_type: string | null
          media_url: string | null
          moodboard_id: string
          notes: string | null
          position: number
        }
        Insert: {
          added_at?: string
          id?: string
          material_id?: string | null
          media_title?: string | null
          media_type?: string | null
          media_url?: string | null
          moodboard_id: string
          notes?: string | null
          position?: number
        }
        Update: {
          added_at?: string
          id?: string
          material_id?: string | null
          media_title?: string | null
          media_type?: string | null
          media_url?: string | null
          moodboard_id?: string
          notes?: string | null
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "moodboard_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "products"
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
      moodboard_products: {
        Row: {
          added_at: string | null
          id: string
          moodboard_id: string
          notes: string | null
          position_x: number | null
          position_y: number | null
          product_id: string
        }
        Insert: {
          added_at?: string | null
          id?: string
          moodboard_id: string
          notes?: string | null
          position_x?: number | null
          position_y?: number | null
          product_id: string
        }
        Update: {
          added_at?: string | null
          id?: string
          moodboard_id?: string
          notes?: string | null
          position_x?: number | null
          position_y?: number | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moodboard_products_moodboard_id_fkey"
            columns: ["moodboard_id"]
            isOneToOne: false
            referencedRelation: "moodboards"
            referencedColumns: ["id"]
          },
        ]
      }
      moodboard_quote_requests: {
        Row: {
          commission_amount: number | null
          commission_percentage: number | null
          created_at: string | null
          id: string
          moodboard_creator_id: string
          moodboard_id: string
          quote_request_id: string
          requester_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          commission_amount?: number | null
          commission_percentage?: number | null
          created_at?: string | null
          id?: string
          moodboard_creator_id: string
          moodboard_id: string
          quote_request_id: string
          requester_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          commission_amount?: number | null
          commission_percentage?: number | null
          created_at?: string | null
          id?: string
          moodboard_creator_id?: string
          moodboard_id?: string
          quote_request_id?: string
          requester_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moodboard_quote_requests_moodboard_id_fkey"
            columns: ["moodboard_id"]
            isOneToOne: false
            referencedRelation: "moodboards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moodboard_quote_requests_quote_request_id_fkey"
            columns: ["quote_request_id"]
            isOneToOne: false
            referencedRelation: "quote_requests"
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
          view_count: number
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
          view_count?: number
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
          view_count?: number
          view_preference?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          channel_type: string
          created_at: string | null
          data: Json | null
          error: string | null
          failed_at: string | null
          id: string
          message: string
          metadata: Json | null
          notification_type: string
          read_at: string | null
          sent_at: string | null
          status: string
          title: string
          user_id: string
        }
        Insert: {
          channel_type: string
          created_at?: string | null
          data?: Json | null
          error?: string | null
          failed_at?: string | null
          id?: string
          message: string
          metadata?: Json | null
          notification_type: string
          read_at?: string | null
          sent_at?: string | null
          status?: string
          title: string
          user_id: string
        }
        Update: {
          channel_type?: string
          created_at?: string | null
          data?: Json | null
          error?: string | null
          failed_at?: string | null
          id?: string
          message?: string
          metadata?: Json | null
          notification_type?: string
          read_at?: string | null
          sent_at?: string | null
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      ocr_results: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          extracted_text: string | null
          file_id: string | null
          id: string
          processing_time_ms: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          extracted_text?: string | null
          file_id?: string | null
          id?: string
          processing_time_ms?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          extracted_text?: string | null
          file_id?: string | null
          id?: string
          processing_time_ms?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      pdf_integration_health_results: {
        Row: {
          check_timestamp: string
          created_at: string | null
          error_message: string | null
          id: string
          metrics: Json | null
          status: string
        }
        Insert: {
          check_timestamp: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          metrics?: Json | null
          status: string
        }
        Update: {
          check_timestamp?: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          metrics?: Json | null
          status?: string
        }
        Relationships: []
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
          image_analysis_results: Json | null
          layout_analysis_version: string | null
          material_recognition_model_version: string | null
          materials_identified_count: number | null
          multimodal_enabled: boolean | null
          multimodal_llm_model: string | null
          multimodal_metadata: Json | null
          multimodal_processing_time_ms: number | null
          ocr_confidence_avg: number | null
          ocr_language_detected: string | null
          ocr_model_version: string | null
          ocr_text_content: string | null
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
          image_analysis_results?: Json | null
          layout_analysis_version?: string | null
          material_recognition_model_version?: string | null
          materials_identified_count?: number | null
          multimodal_enabled?: boolean | null
          multimodal_llm_model?: string | null
          multimodal_metadata?: Json | null
          multimodal_processing_time_ms?: number | null
          ocr_confidence_avg?: number | null
          ocr_language_detected?: string | null
          ocr_model_version?: string | null
          ocr_text_content?: string | null
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
          image_analysis_results?: Json | null
          layout_analysis_version?: string | null
          material_recognition_model_version?: string | null
          materials_identified_count?: number | null
          multimodal_enabled?: boolean | null
          multimodal_llm_model?: string | null
          multimodal_metadata?: Json | null
          multimodal_processing_time_ms?: number | null
          ocr_confidence_avg?: number | null
          ocr_language_detected?: string | null
          ocr_model_version?: string | null
          ocr_text_content?: string | null
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
      performance_alerts: {
        Row: {
          alert_type: string
          category: string
          created_at: string | null
          current_value: number
          id: string
          message: string
          metric: string
          resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
          threshold: number
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          alert_type: string
          category: string
          created_at?: string | null
          current_value: number
          id: string
          message: string
          metric: string
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          threshold: number
          updated_at?: string | null
          workspace_id?: string
        }
        Update: {
          alert_type?: string
          category?: string
          created_at?: string | null
          current_value?: number
          id?: string
          message?: string
          metric?: string
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          threshold?: number
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      performance_reports: {
        Row: {
          alerts: Json
          created_at: string | null
          generated_at: string | null
          id: string
          insights: Json
          metrics: Json
          period_end: string
          period_start: string
          report_type: string
          trends: Json
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          alerts?: Json
          created_at?: string | null
          generated_at?: string | null
          id: string
          insights?: Json
          metrics?: Json
          period_end: string
          period_start: string
          report_type: string
          trends?: Json
          updated_at?: string | null
          workspace_id?: string
        }
        Update: {
          alerts?: Json
          created_at?: string | null
          generated_at?: string | null
          id?: string
          insights?: Json
          metrics?: Json
          period_end?: string
          period_start?: string
          report_type?: string
          trends?: Json
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      pipeline_strategy_metrics: {
        Row: {
          created_at: string
          document_id: string | null
          id: string
          job_id: string | null
          metric_kind: string
          metric_value: string
          notes: Json | null
          page_number: number | null
          product_id: string | null
        }
        Insert: {
          created_at?: string
          document_id?: string | null
          id?: string
          job_id?: string | null
          metric_kind: string
          metric_value: string
          notes?: Json | null
          page_number?: number | null
          product_id?: string | null
        }
        Update: {
          created_at?: string
          document_id?: string | null
          id?: string
          job_id?: string | null
          metric_kind?: string
          metric_value?: string
          notes?: Json | null
          page_number?: number | null
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_strategy_metrics_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_strategy_metrics_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "background_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_strategy_metrics_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      price_alert_history: {
        Row: {
          alert_id: string
          alert_type: string
          id: string
          metadata: Json | null
          new_price: number | null
          notification_channels: string[] | null
          notification_sent: boolean | null
          notification_sent_at: string | null
          old_price: number | null
          price_change_amount: number | null
          price_change_percentage: number | null
          product_id: string
          source_name: string | null
          source_url: string | null
          triggered_at: string | null
          user_id: string
        }
        Insert: {
          alert_id: string
          alert_type: string
          id?: string
          metadata?: Json | null
          new_price?: number | null
          notification_channels?: string[] | null
          notification_sent?: boolean | null
          notification_sent_at?: string | null
          old_price?: number | null
          price_change_amount?: number | null
          price_change_percentage?: number | null
          product_id: string
          source_name?: string | null
          source_url?: string | null
          triggered_at?: string | null
          user_id: string
        }
        Update: {
          alert_id?: string
          alert_type?: string
          id?: string
          metadata?: Json | null
          new_price?: number | null
          notification_channels?: string[] | null
          notification_sent?: boolean | null
          notification_sent_at?: string | null
          old_price?: number | null
          price_change_amount?: number | null
          price_change_percentage?: number | null
          product_id?: string
          source_name?: string | null
          source_url?: string | null
          triggered_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_alert_history_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "price_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_alert_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      price_alert_log: {
        Row: {
          alert_type: string
          channels_fired: string[]
          channels_skipped: string[]
          created_at: string
          credits_charged: number
          id: string
          payload: Json
          product_id: string | null
          retailer_domain: string | null
          retailer_name: string | null
          tracked_query_id: string | null
          user_id: string | null
        }
        Insert: {
          alert_type: string
          channels_fired?: string[]
          channels_skipped?: string[]
          created_at?: string
          credits_charged?: number
          id?: string
          payload?: Json
          product_id?: string | null
          retailer_domain?: string | null
          retailer_name?: string | null
          tracked_query_id?: string | null
          user_id?: string | null
        }
        Update: {
          alert_type?: string
          channels_fired?: string[]
          channels_skipped?: string[]
          created_at?: string
          credits_charged?: number
          id?: string
          payload?: Json
          product_id?: string | null
          retailer_domain?: string | null
          retailer_name?: string | null
          tracked_query_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_alert_log_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_alert_log_tracked_query_id_fkey"
            columns: ["tracked_query_id"]
            isOneToOne: false
            referencedRelation: "tracked_queries"
            referencedColumns: ["id"]
          },
        ]
      }
      price_alerts: {
        Row: {
          alert_type: string
          created_at: string | null
          id: string
          is_active: boolean | null
          last_triggered_at: string | null
          notification_channels: string[] | null
          product_id: string
          threshold_amount: number | null
          threshold_percentage: number | null
          trigger_count: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          alert_type: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          notification_channels?: string[] | null
          product_id: string
          threshold_amount?: number | null
          threshold_percentage?: number | null
          trigger_count?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          alert_type?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          notification_channels?: string[] | null
          product_id?: string
          threshold_amount?: number | null
          threshold_percentage?: number | null
          trigger_count?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_alerts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      price_discrepancies: {
        Row: {
          created_at: string
          dataforseo_price: number | null
          decided_price: number | null
          decided_source: string | null
          delta_pct: number | null
          firecrawl_price: number | null
          id: string
          notes: string | null
          perplexity_price: number | null
          product_id: string | null
          retailer_domain: string | null
          retailer_name: string
          tracked_query_id: string | null
        }
        Insert: {
          created_at?: string
          dataforseo_price?: number | null
          decided_price?: number | null
          decided_source?: string | null
          delta_pct?: number | null
          firecrawl_price?: number | null
          id?: string
          notes?: string | null
          perplexity_price?: number | null
          product_id?: string | null
          retailer_domain?: string | null
          retailer_name: string
          tracked_query_id?: string | null
        }
        Update: {
          created_at?: string
          dataforseo_price?: number | null
          decided_price?: number | null
          decided_source?: string | null
          delta_pct?: number | null
          firecrawl_price?: number | null
          id?: string
          notes?: string | null
          perplexity_price?: number | null
          product_id?: string | null
          retailer_domain?: string | null
          retailer_name?: string
          tracked_query_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_discrepancies_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_discrepancies_tracked_query_id_fkey"
            columns: ["tracked_query_id"]
            isOneToOne: false
            referencedRelation: "tracked_queries"
            referencedColumns: ["id"]
          },
        ]
      }
      price_lookups: {
        Row: {
          api_key_id: string
          availability: string | null
          created_at: string
          credits_used: number
          currency: string | null
          error_message: string | null
          id: string
          latency_ms: number | null
          price: number | null
          product_name_extracted: string | null
          product_name_input: string | null
          raw_extract: Json | null
          search_query: string | null
          shipping_cost: string | null
          source: Database["public"]["Enums"]["competitor_source_type"]
          success: boolean
          url: string | null
          use_javascript_render: boolean
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          api_key_id: string
          availability?: string | null
          created_at?: string
          credits_used?: number
          currency?: string | null
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          price?: number | null
          product_name_extracted?: string | null
          product_name_input?: string | null
          raw_extract?: Json | null
          search_query?: string | null
          shipping_cost?: string | null
          source?: Database["public"]["Enums"]["competitor_source_type"]
          success: boolean
          url?: string | null
          use_javascript_render?: boolean
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          api_key_id?: string
          availability?: string | null
          created_at?: string
          credits_used?: number
          currency?: string | null
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          price?: number | null
          product_name_extracted?: string | null
          product_name_input?: string | null
          raw_extract?: Json | null
          search_query?: string | null
          shipping_cost?: string | null
          source?: Database["public"]["Enums"]["competitor_source_type"]
          success?: boolean
          url?: string | null
          use_javascript_render?: boolean
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_lookups_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      price_monitoring_jobs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          credits_consumed: number | null
          error_message: string | null
          id: string
          job_type: string
          prices_found: number | null
          product_id: string
          retry_count: number | null
          sources_checked: number | null
          started_at: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          credits_consumed?: number | null
          error_message?: string | null
          id?: string
          job_type: string
          prices_found?: number | null
          product_id: string
          retry_count?: number | null
          sources_checked?: number | null
          started_at?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          credits_consumed?: number | null
          error_message?: string | null
          id?: string
          job_type?: string
          prices_found?: number | null
          product_id?: string
          retry_count?: number | null
          sources_checked?: number | null
          started_at?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_monitoring_jobs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      processed_documents: {
        Row: {
          content: string
          content_embeddings: unknown
          created_at: string
          created_by: string | null
          id: string
          metadata: Json | null
          pdf_document_id: string
          processing_completed_at: string | null
          processing_error: string | null
          processing_started_at: string | null
          processing_status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          content: string
          content_embeddings?: unknown
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json | null
          pdf_document_id: string
          processing_completed_at?: string | null
          processing_error?: string | null
          processing_started_at?: string | null
          processing_status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          content?: string
          content_embeddings?: unknown
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json | null
          pdf_document_id?: string
          processing_completed_at?: string | null
          processing_error?: string | null
          processing_started_at?: string | null
          processing_status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "processed_documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      processing_metrics: {
        Row: {
          chunking_time_ms: number | null
          chunks_generated: number | null
          chunks_per_second: number | null
          completed_at: string | null
          document_id: string
          embedding_time_ms: number | null
          embeddings_generated: number | null
          error_message: string | null
          id: string
          images_extracted: number | null
          mivaa_processing_time_ms: number | null
          pages_per_second: number | null
          pages_processed: number | null
          started_at: string | null
          status: string | null
          storage_time_ms: number | null
          total_processing_time_ms: number | null
          workspace_id: string
        }
        Insert: {
          chunking_time_ms?: number | null
          chunks_generated?: number | null
          chunks_per_second?: number | null
          completed_at?: string | null
          document_id: string
          embedding_time_ms?: number | null
          embeddings_generated?: number | null
          error_message?: string | null
          id?: string
          images_extracted?: number | null
          mivaa_processing_time_ms?: number | null
          pages_per_second?: number | null
          pages_processed?: number | null
          started_at?: string | null
          status?: string | null
          storage_time_ms?: number | null
          total_processing_time_ms?: number | null
          workspace_id: string
        }
        Update: {
          chunking_time_ms?: number | null
          chunks_generated?: number | null
          chunks_per_second?: number | null
          completed_at?: string | null
          document_id?: string
          embedding_time_ms?: number | null
          embeddings_generated?: number | null
          error_message?: string | null
          id?: string
          images_extracted?: number | null
          mivaa_processing_time_ms?: number | null
          pages_per_second?: number | null
          pages_processed?: number | null
          started_at?: string | null
          status?: string | null
          storage_time_ms?: number | null
          total_processing_time_ms?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "processing_metrics_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
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
      processing_results: {
        Row: {
          completed_at: string | null
          created_at: string | null
          document_id: string
          error_message: string | null
          extracted_content: string | null
          extraction_type: string
          file_size_bytes: number | null
          id: string
          metadata: Json | null
          page_count: number | null
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
          completed_at?: string | null
          created_at?: string | null
          document_id: string
          error_message?: string | null
          extracted_content?: string | null
          extraction_type: string
          file_size_bytes?: number | null
          id?: string
          metadata?: Json | null
          page_count?: number | null
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
          completed_at?: string | null
          created_at?: string | null
          document_id?: string
          error_message?: string | null
          extracted_content?: string | null
          extraction_type?: string
          file_size_bytes?: number | null
          id?: string
          metadata?: Json | null
          page_count?: number | null
          processing_options?: Json | null
          processing_time_ms?: number | null
          results?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "processing_results_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      product_document_relationships: {
        Row: {
          created_at: string | null
          document_entity_id: string
          id: string
          metadata: Json | null
          product_id: string
          relationship_type: string
          relevance_score: number | null
        }
        Insert: {
          created_at?: string | null
          document_entity_id: string
          id?: string
          metadata?: Json | null
          product_id: string
          relationship_type: string
          relevance_score?: number | null
        }
        Update: {
          created_at?: string | null
          document_entity_id?: string
          id?: string
          metadata?: Json | null
          product_id?: string
          relationship_type?: string
          relevance_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_document_relationships_document_entity_id_fkey"
            columns: ["document_entity_id"]
            isOneToOne: false
            referencedRelation: "document_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_document_relationships_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_enrichments: {
        Row: {
          chunk_id: string
          confidence_score: number | null
          created_at: string
          enriched_at: string | null
          enrichment_score: number | null
          enrichment_status: string
          id: string
          image_references: Json | null
          issues: Json | null
          long_description: string | null
          metadata: Json | null
          product_category: string | null
          product_description: string | null
          product_name: string | null
          recommendations: Json | null
          related_products: string[] | null
          short_description: string | null
          specifications: Json | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          chunk_id: string
          confidence_score?: number | null
          created_at?: string
          enriched_at?: string | null
          enrichment_score?: number | null
          enrichment_status?: string
          id?: string
          image_references?: Json | null
          issues?: Json | null
          long_description?: string | null
          metadata?: Json | null
          product_category?: string | null
          product_description?: string | null
          product_name?: string | null
          recommendations?: Json | null
          related_products?: string[] | null
          short_description?: string | null
          specifications?: Json | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          chunk_id?: string
          confidence_score?: number | null
          created_at?: string
          enriched_at?: string | null
          enrichment_score?: number | null
          enrichment_status?: string
          id?: string
          image_references?: Json | null
          issues?: Json | null
          long_description?: string | null
          metadata?: Json | null
          product_category?: string | null
          product_description?: string | null
          product_name?: string | null
          recommendations?: Json | null
          related_products?: string[] | null
          short_description?: string | null
          specifications?: Json | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_enrichments_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "document_chunks"
            referencedColumns: ["id"]
          },
        ]
      }
      product_layout_regions: {
        Row: {
          bbox_height: number
          bbox_width: number
          bbox_x: number
          bbox_y: number
          confidence: number
          created_at: string | null
          id: string
          linked_image_id: string | null
          metadata: Json | null
          page_number: number
          product_id: string
          reading_order: number | null
          region_type: string
          text_content: string | null
          updated_at: string | null
        }
        Insert: {
          bbox_height: number
          bbox_width: number
          bbox_x: number
          bbox_y: number
          confidence: number
          created_at?: string | null
          id?: string
          linked_image_id?: string | null
          metadata?: Json | null
          page_number: number
          product_id: string
          reading_order?: number | null
          region_type: string
          text_content?: string | null
          updated_at?: string | null
        }
        Update: {
          bbox_height?: number
          bbox_width?: number
          bbox_x?: number
          bbox_y?: number
          confidence?: number
          created_at?: string | null
          id?: string
          linked_image_id?: string | null
          metadata?: Json | null
          page_number?: number
          product_id?: string
          reading_order?: number | null
          region_type?: string
          text_content?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_layout_regions_linked_image_id_fkey"
            columns: ["linked_image_id"]
            isOneToOne: false
            referencedRelation: "document_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_layout_regions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_merge_history: {
        Row: {
          created_at: string | null
          id: string
          is_undone: boolean | null
          merge_reason: string | null
          merge_strategy: string | null
          merged_at: string | null
          merged_by: string | null
          similarity_score: number | null
          source_product_ids: string[]
          source_product_names: string[]
          source_products_snapshot: Json | null
          target_product_after_merge: Json | null
          target_product_before_merge: Json | null
          target_product_id: string
          target_product_name: string
          undone_at: string | null
          undone_by: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_undone?: boolean | null
          merge_reason?: string | null
          merge_strategy?: string | null
          merged_at?: string | null
          merged_by?: string | null
          similarity_score?: number | null
          source_product_ids: string[]
          source_product_names: string[]
          source_products_snapshot?: Json | null
          target_product_after_merge?: Json | null
          target_product_before_merge?: Json | null
          target_product_id: string
          target_product_name: string
          undone_at?: string | null
          undone_by?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_undone?: boolean | null
          merge_reason?: string | null
          merge_strategy?: string | null
          merged_at?: string | null
          merged_by?: string | null
          similarity_score?: number | null
          source_product_ids?: string[]
          source_product_names?: string[]
          source_products_snapshot?: Json | null
          target_product_after_merge?: Json | null
          target_product_before_merge?: Json | null
          target_product_id?: string
          target_product_name?: string
          undone_at?: string | null
          undone_by?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      product_prices: {
        Row: {
          confirmed_at: string
          confirmed_by: string | null
          created_at: string
          currency: string
          discount_percent: number | null
          discount_price: number | null
          id: string
          lead_time_days: number | null
          list_price: number | null
          moq: number | null
          notes: string | null
          price_lookup_call_id: string | null
          product_id: string
          source_kb_doc_ids: Json | null
          source_snippet: string | null
          unit: string | null
          updated_at: string
          valid_until: string | null
          workspace_id: string
        }
        Insert: {
          confirmed_at?: string
          confirmed_by?: string | null
          created_at?: string
          currency?: string
          discount_percent?: number | null
          discount_price?: number | null
          id?: string
          lead_time_days?: number | null
          list_price?: number | null
          moq?: number | null
          notes?: string | null
          price_lookup_call_id?: string | null
          product_id: string
          source_kb_doc_ids?: Json | null
          source_snippet?: string | null
          unit?: string | null
          updated_at?: string
          valid_until?: string | null
          workspace_id: string
        }
        Update: {
          confirmed_at?: string
          confirmed_by?: string | null
          created_at?: string
          currency?: string
          discount_percent?: number | null
          discount_price?: number | null
          id?: string
          lead_time_days?: number | null
          list_price?: number | null
          moq?: number | null
          notes?: string | null
          price_lookup_call_id?: string | null
          product_id?: string
          source_kb_doc_ids?: Json | null
          source_snippet?: string | null
          unit?: string | null
          updated_at?: string
          valid_until?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_prices_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_prices_price_lookup_call_id_fkey"
            columns: ["price_lookup_call_id"]
            isOneToOne: false
            referencedRelation: "agent_tool_call_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_prices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      product_processing_status: {
        Row: {
          completed_at: string | null
          created_at: string | null
          current_stage: string | null
          error_message: string | null
          error_stage: string | null
          error_timestamp: string | null
          id: string
          job_id: string
          metadata: Json | null
          metrics: Json | null
          product_id: string
          product_index: number
          product_name: string
          stages_completed: Json | null
          started_at: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          current_stage?: string | null
          error_message?: string | null
          error_stage?: string | null
          error_timestamp?: string | null
          id?: string
          job_id: string
          metadata?: Json | null
          metrics?: Json | null
          product_id: string
          product_index: number
          product_name: string
          stages_completed?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          current_stage?: string | null
          error_message?: string | null
          error_stage?: string | null
          error_timestamp?: string | null
          id?: string
          job_id?: string
          metadata?: Json | null
          metrics?: Json | null
          product_id?: string
          product_index?: number
          product_name?: string
          stages_completed?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_processing_status_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "background_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      product_similarity_cache: {
        Row: {
          computation_method: string | null
          computation_version: number | null
          computed_at: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          metadata_similarity: number | null
          overall_similarity: number | null
          product_a_id: string
          product_b_id: string
          semantic_similarity: number | null
          similarity_factors: Json | null
          text_similarity: number | null
          visual_similarity: number | null
          workspace_id: string
        }
        Insert: {
          computation_method?: string | null
          computation_version?: number | null
          computed_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          metadata_similarity?: number | null
          overall_similarity?: number | null
          product_a_id: string
          product_b_id: string
          semantic_similarity?: number | null
          similarity_factors?: Json | null
          text_similarity?: number | null
          visual_similarity?: number | null
          workspace_id?: string
        }
        Update: {
          computation_method?: string | null
          computation_version?: number | null
          computed_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          metadata_similarity?: number | null
          overall_similarity?: number | null
          product_a_id?: string
          product_b_id?: string
          semantic_similarity?: number | null
          similarity_factors?: Json | null
          text_similarity?: number | null
          visual_similarity?: number | null
          workspace_id?: string
        }
        Relationships: []
      }
      product_tables: {
        Row: {
          confidence: number
          created_at: string | null
          extractor: string
          headers: Json | null
          id: string
          layout_region_id: string | null
          metadata: Json | null
          page_number: number
          product_id: string
          table_data: Json
          table_type: string
          updated_at: string | null
        }
        Insert: {
          confidence: number
          created_at?: string | null
          extractor: string
          headers?: Json | null
          id?: string
          layout_region_id?: string | null
          metadata?: Json | null
          page_number: number
          product_id: string
          table_data: Json
          table_type: string
          updated_at?: string | null
        }
        Update: {
          confidence?: number
          created_at?: string | null
          extractor?: string
          headers?: Json | null
          id?: string
          layout_region_id?: string | null
          metadata?: Json | null
          page_number?: number
          product_id?: string
          table_data?: Json
          table_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_tables_layout_region_id_fkey"
            columns: ["layout_region_id"]
            isOneToOne: false
            referencedRelation: "product_layout_regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tables_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_usage_stats: {
        Row: {
          avg_time_on_page: number | null
          conversion_rate: number | null
          created_at: string | null
          id: string
          last_updated: string | null
          moodboard_count: number | null
          product_id: string
          quote_count: number | null
          search_result_count: number | null
          view_count: number | null
        }
        Insert: {
          avg_time_on_page?: number | null
          conversion_rate?: number | null
          created_at?: string | null
          id?: string
          last_updated?: string | null
          moodboard_count?: number | null
          product_id: string
          quote_count?: number | null
          search_result_count?: number | null
          view_count?: number | null
        }
        Update: {
          avg_time_on_page?: number | null
          conversion_rate?: number | null
          created_at?: string | null
          id?: string
          last_updated?: string | null
          moodboard_count?: number | null
          product_id?: string
          quote_count?: number | null
          search_result_count?: number | null
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_usage_stats_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          completeness_score: number | null
          confidence_score: number | null
          created_at: string | null
          created_by: string | null
          created_from_type: string | null
          description: string | null
          embedding_metadata: Json | null
          embedding_model: string | null
          external_sku: string | null
          id: string
          import_batch_id: string | null
          layout_analyzed: boolean | null
          layout_detected: boolean | null
          layout_detection_date: string | null
          layout_stats: Json | null
          long_description: string | null
          metadata: Json | null
          name: string
          oxygen_product_id: string | null
          oxygen_tax_id: number | null
          properties: Json | null
          quality_assessment: string | null
          quality_metrics: Json | null
          quality_score: number | null
          search_tsv: unknown
          search_vector: unknown
          sku: string | null
          source_chunks: Json | null
          source_document_id: string | null
          source_job_id: string | null
          source_type: string | null
          specifications: Json | null
          status: string | null
          tables_extracted: boolean | null
          text_embedding_1024: unknown
          total_layout_regions: number | null
          total_tables: number | null
          total_tables_extracted: number | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          category_id?: string | null
          completeness_score?: number | null
          confidence_score?: number | null
          created_at?: string | null
          created_by?: string | null
          created_from_type?: string | null
          description?: string | null
          embedding_metadata?: Json | null
          embedding_model?: string | null
          external_sku?: string | null
          id?: string
          import_batch_id?: string | null
          layout_analyzed?: boolean | null
          layout_detected?: boolean | null
          layout_detection_date?: string | null
          layout_stats?: Json | null
          long_description?: string | null
          metadata?: Json | null
          name: string
          oxygen_product_id?: string | null
          oxygen_tax_id?: number | null
          properties?: Json | null
          quality_assessment?: string | null
          quality_metrics?: Json | null
          quality_score?: number | null
          search_tsv?: unknown
          search_vector?: unknown
          sku?: string | null
          source_chunks?: Json | null
          source_document_id?: string | null
          source_job_id?: string | null
          source_type?: string | null
          specifications?: Json | null
          status?: string | null
          tables_extracted?: boolean | null
          text_embedding_1024?: unknown
          total_layout_regions?: number | null
          total_tables?: number | null
          total_tables_extracted?: number | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          category_id?: string | null
          completeness_score?: number | null
          confidence_score?: number | null
          created_at?: string | null
          created_by?: string | null
          created_from_type?: string | null
          description?: string | null
          embedding_metadata?: Json | null
          embedding_model?: string | null
          external_sku?: string | null
          id?: string
          import_batch_id?: string | null
          layout_analyzed?: boolean | null
          layout_detected?: boolean | null
          layout_detection_date?: string | null
          layout_stats?: Json | null
          long_description?: string | null
          metadata?: Json | null
          name?: string
          oxygen_product_id?: string | null
          oxygen_tax_id?: number | null
          properties?: Json | null
          quality_assessment?: string | null
          quality_metrics?: Json | null
          quality_score?: number | null
          search_tsv?: unknown
          search_vector?: unknown
          sku?: string | null
          source_chunks?: Json | null
          source_document_id?: string | null
          source_job_id?: string | null
          source_type?: string | null
          specifications?: Json | null
          status?: string | null
          tables_extracted?: boolean | null
          text_embedding_1024?: unknown
          total_layout_regions?: number | null
          total_tables?: number | null
          total_tables_extracted?: number | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_contact_requests: {
        Row: {
          created_at: string | null
          from_email: string
          from_name: string
          id: string
          is_read: boolean
          message: string
          services_requested: string[] | null
          to_user_id: string
        }
        Insert: {
          created_at?: string | null
          from_email: string
          from_name: string
          id?: string
          is_read?: boolean
          message: string
          services_requested?: string[] | null
          to_user_id: string
        }
        Update: {
          created_at?: string | null
          from_email?: string
          from_name?: string
          id?: string
          is_read?: boolean
          message?: string
          services_requested?: string[] | null
          to_user_id?: string
        }
        Relationships: []
      }
      profile_reviews: {
        Row: {
          comment: string | null
          created_at: string
          dimension_ratings: Json
          from_name: string
          from_user_id: string
          id: string
          is_verified: boolean
          overall_rating: number
          reply: string | null
          service_name: string | null
          to_user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          dimension_ratings?: Json
          from_name?: string
          from_user_id: string
          id?: string
          is_verified?: boolean
          overall_rating: number
          reply?: string | null
          service_name?: string | null
          to_user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          dimension_ratings?: Json
          from_name?: string
          from_user_id?: string
          id?: string
          is_verified?: boolean
          overall_rating?: number
          reply?: string | null
          service_name?: string | null
          to_user_id?: string
        }
        Relationships: []
      }
      prompt_history: {
        Row: {
          change_reason: string | null
          changed_at: string | null
          changed_by: string | null
          id: string
          new_configuration: Json | null
          new_prompt_text: string
          new_system_prompt: string | null
          old_configuration: Json | null
          old_prompt_text: string
          old_system_prompt: string | null
          prompt_id: string
        }
        Insert: {
          change_reason?: string | null
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_configuration?: Json | null
          new_prompt_text: string
          new_system_prompt?: string | null
          old_configuration?: Json | null
          old_prompt_text: string
          old_system_prompt?: string | null
          prompt_id: string
        }
        Update: {
          change_reason?: string | null
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_configuration?: Json | null
          new_prompt_text?: string
          new_system_prompt?: string | null
          old_configuration?: Json | null
          old_prompt_text?: string
          old_system_prompt?: string | null
          prompt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prompt_history_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      prompts: {
        Row: {
          category: string
          configuration: Json | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          industry: string | null
          is_active: boolean | null
          is_custom: boolean | null
          is_default: boolean | null
          name: string
          prompt_text: string
          prompt_type: string
          stage: string | null
          status: string | null
          subcategory: string | null
          system_prompt: string | null
          updated_at: string | null
          used_in: string[] | null
          version: number | null
          workspace_id: string
        }
        Insert: {
          category: string
          configuration?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean | null
          is_custom?: boolean | null
          is_default?: boolean | null
          name: string
          prompt_text: string
          prompt_type: string
          stage?: string | null
          status?: string | null
          subcategory?: string | null
          system_prompt?: string | null
          updated_at?: string | null
          used_in?: string[] | null
          version?: number | null
          workspace_id?: string
        }
        Update: {
          category?: string
          configuration?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean | null
          is_custom?: boolean | null
          is_default?: boolean | null
          name?: string
          prompt_text?: string
          prompt_type?: string
          stage?: string | null
          status?: string | null
          subcategory?: string | null
          system_prompt?: string | null
          updated_at?: string | null
          used_in?: string[] | null
          version?: number | null
          workspace_id?: string
        }
        Relationships: []
      }
      proposals: {
        Row: {
          accepted_at: string | null
          admin_id: string | null
          created_at: string | null
          discount: number | null
          id: string
          items: Json | null
          notes: string | null
          quote_request_id: string
          sent_at: string | null
          status: string | null
          subtotal: number | null
          tax: number | null
          total: number | null
          updated_at: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          admin_id?: string | null
          created_at?: string | null
          discount?: number | null
          id?: string
          items?: Json | null
          notes?: string | null
          quote_request_id: string
          sent_at?: string | null
          status?: string | null
          subtotal?: number | null
          tax?: number | null
          total?: number | null
          updated_at?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          admin_id?: string | null
          created_at?: string | null
          discount?: number | null
          id?: string
          items?: Json | null
          notes?: string | null
          quote_request_id?: string
          sent_at?: string | null
          status?: string | null
          subtotal?: number | null
          tax?: number | null
          total?: number | null
          updated_at?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposals_quote_request_id_fkey"
            columns: ["quote_request_id"]
            isOneToOne: false
            referencedRelation: "quote_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string | null
          endpoint: string
          id: string
          is_active: boolean | null
          p256dh_key: string
          updated_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string | null
          endpoint: string
          id?: string
          is_active?: boolean | null
          p256dh_key: string
          updated_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          is_active?: boolean | null
          p256dh_key?: string
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      quality_metrics_daily: {
        Row: {
          avg_chunk_quality: number | null
          avg_image_quality: number | null
          avg_product_quality: number | null
          chunks_below_threshold: number | null
          created_at: string | null
          detection_accuracy: number | null
          embedding_generation_failures: number | null
          id: string
          images_below_threshold: number | null
          metric_date: string
          products_below_threshold: number | null
          total_chunks_processed: number | null
          total_detections: number | null
          total_embeddings_generated: number | null
          total_images_extracted: number | null
          total_products_created: number | null
          workspace_id: string
        }
        Insert: {
          avg_chunk_quality?: number | null
          avg_image_quality?: number | null
          avg_product_quality?: number | null
          chunks_below_threshold?: number | null
          created_at?: string | null
          detection_accuracy?: number | null
          embedding_generation_failures?: number | null
          id?: string
          images_below_threshold?: number | null
          metric_date: string
          products_below_threshold?: number | null
          total_chunks_processed?: number | null
          total_detections?: number | null
          total_embeddings_generated?: number | null
          total_images_extracted?: number | null
          total_products_created?: number | null
          workspace_id: string
        }
        Update: {
          avg_chunk_quality?: number | null
          avg_image_quality?: number | null
          avg_product_quality?: number | null
          chunks_below_threshold?: number | null
          created_at?: string | null
          detection_accuracy?: number | null
          embedding_generation_failures?: number | null
          id?: string
          images_below_threshold?: number | null
          metric_date?: string
          products_below_threshold?: number | null
          total_chunks_processed?: number | null
          total_detections?: number | null
          total_embeddings_generated?: number | null
          total_images_extracted?: number | null
          total_products_created?: number | null
          workspace_id?: string
        }
        Relationships: []
      }
      quality_scoring_logs: {
        Row: {
          chunk_id: string | null
          confidence: number | null
          created_at: string | null
          details: Json | null
          detection_type: string | null
          entity_id: string | null
          event: string | null
          id: string
        }
        Insert: {
          chunk_id?: string | null
          confidence?: number | null
          created_at?: string | null
          details?: Json | null
          detection_type?: string | null
          entity_id?: string | null
          event?: string | null
          id?: string
        }
        Update: {
          chunk_id?: string | null
          confidence?: number | null
          created_at?: string | null
          details?: Json | null
          detection_type?: string | null
          entity_id?: string | null
          event?: string | null
          id?: string
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
          query_embedding: unknown
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
          query_embedding?: unknown
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
          query_embedding?: unknown
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
      query_understanding_cache: {
        Row: {
          created_at: string | null
          dynamic_weights: Json | null
          filters: Json | null
          hit_count: number | null
          is_product_name: boolean | null
          last_hit_at: string | null
          model_used: string | null
          parse_latency_ms: number | null
          parsed_data: Json
          query_hash: string
          query_text: string
          visual_query: string | null
          weight_profile: string | null
        }
        Insert: {
          created_at?: string | null
          dynamic_weights?: Json | null
          filters?: Json | null
          hit_count?: number | null
          is_product_name?: boolean | null
          last_hit_at?: string | null
          model_used?: string | null
          parse_latency_ms?: number | null
          parsed_data: Json
          query_hash: string
          query_text: string
          visual_query?: string | null
          weight_profile?: string | null
        }
        Update: {
          created_at?: string | null
          dynamic_weights?: Json | null
          filters?: Json | null
          hit_count?: number | null
          is_product_name?: boolean | null
          last_hit_at?: string | null
          model_used?: string | null
          parse_latency_ms?: number | null
          parsed_data?: Json
          query_hash?: string
          query_text?: string
          visual_query?: string | null
          weight_profile?: string | null
        }
        Relationships: []
      }
      quote_items: {
        Row: {
          added_at: string
          added_from: string | null
          custom_product_description: string | null
          custom_product_name: string | null
          custom_sku: string | null
          custom_unit: string | null
          delivery_date: string | null
          dimensions: string | null
          discounted_price: number | null
          id: string
          installation_requirements: string | null
          line_total: number | null
          notes: string | null
          price_lookup_call_id: string | null
          price_source: string | null
          product_id: string | null
          quantity: number
          quote_id: string
          room: string | null
          selected_color: string | null
          selected_size: string | null
          unit_price: number | null
        }
        Insert: {
          added_at?: string
          added_from?: string | null
          custom_product_description?: string | null
          custom_product_name?: string | null
          custom_sku?: string | null
          custom_unit?: string | null
          delivery_date?: string | null
          dimensions?: string | null
          discounted_price?: number | null
          id?: string
          installation_requirements?: string | null
          line_total?: number | null
          notes?: string | null
          price_lookup_call_id?: string | null
          price_source?: string | null
          product_id?: string | null
          quantity?: number
          quote_id: string
          room?: string | null
          selected_color?: string | null
          selected_size?: string | null
          unit_price?: number | null
        }
        Update: {
          added_at?: string
          added_from?: string | null
          custom_product_description?: string | null
          custom_product_name?: string | null
          custom_sku?: string | null
          custom_unit?: string | null
          delivery_date?: string | null
          dimensions?: string | null
          discounted_price?: number | null
          id?: string
          installation_requirements?: string | null
          line_total?: number | null
          notes?: string | null
          price_lookup_call_id?: string | null
          price_source?: string | null
          product_id?: string | null
          quantity?: number
          quote_id?: string
          room?: string | null
          selected_color?: string | null
          selected_size?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_price_lookup_call_fkey"
            columns: ["price_lookup_call_id"]
            isOneToOne: false
            referencedRelation: "agent_tool_call_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_requests: {
        Row: {
          created_at: string | null
          id: string
          items_count: number | null
          notes: string | null
          quote_id: string | null
          status: string | null
          total_estimated: number | null
          updated_at: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          items_count?: number | null
          notes?: string | null
          quote_id?: string | null
          status?: string | null
          total_estimated?: number | null
          updated_at?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          items_count?: number | null
          notes?: string | null
          quote_id?: string | null
          status?: string | null
          total_estimated?: number | null
          updated_at?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_requests_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_timeline: {
        Row: {
          completed_at: string | null
          created_at: string | null
          id: string
          notes: string | null
          quote_id: string
          quote_item_id: string | null
          status: string | null
          step_order: number | null
          timeline_step_id: string
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          quote_id: string
          quote_item_id?: string | null
          status?: string | null
          step_order?: number | null
          timeline_step_id: string
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          quote_id?: string
          quote_item_id?: string | null
          status?: string | null
          step_order?: number | null
          timeline_step_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_timeline_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_timeline_quote_item_id_fkey"
            columns: ["quote_item_id"]
            isOneToOne: false
            referencedRelation: "quote_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_timeline_timeline_step_id_fkey"
            columns: ["timeline_step_id"]
            isOneToOne: false
            referencedRelation: "timeline_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_upsells: {
        Row: {
          added_at: string | null
          admin_notes: string | null
          customer_accepted: boolean | null
          decided_at: string | null
          id: string
          metadata: Json | null
          quote_id: string
          upsell_id: string
        }
        Insert: {
          added_at?: string | null
          admin_notes?: string | null
          customer_accepted?: boolean | null
          decided_at?: string | null
          id?: string
          metadata?: Json | null
          quote_id: string
          upsell_id: string
        }
        Update: {
          added_at?: string | null
          admin_notes?: string | null
          customer_accepted?: boolean | null
          decided_at?: string | null
          id?: string
          metadata?: Json | null
          quote_id?: string
          upsell_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_upsells_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_upsells_upsell_id_fkey"
            columns: ["upsell_id"]
            isOneToOne: false
            referencedRelation: "upsells"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          created_at: string
          currency: string | null
          custom_request_text: string | null
          customer_company_id: string | null
          customer_contact_id: string | null
          expires_at: string | null
          extras_total: number | null
          grand_total: number | null
          id: string
          last_activity_at: string
          name: string | null
          notes: string | null
          oxygen_contact_id: string | null
          oxygen_last_sync_at: string | null
          oxygen_notice_id: string | null
          oxygen_sync_error: string | null
          oxygen_sync_status: string | null
          pdf_generated_at: string | null
          pdf_generation_status: string | null
          pdf_storage_path: string | null
          quote_number: string | null
          status: string
          status_tag_id: string | null
          submitted_at: string | null
          subtotal: number | null
          total_items: number | null
          updated_at: string
          user_id: string
          vat_amount: number | null
          vat_rate: number | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          currency?: string | null
          custom_request_text?: string | null
          customer_company_id?: string | null
          customer_contact_id?: string | null
          expires_at?: string | null
          extras_total?: number | null
          grand_total?: number | null
          id?: string
          last_activity_at?: string
          name?: string | null
          notes?: string | null
          oxygen_contact_id?: string | null
          oxygen_last_sync_at?: string | null
          oxygen_notice_id?: string | null
          oxygen_sync_error?: string | null
          oxygen_sync_status?: string | null
          pdf_generated_at?: string | null
          pdf_generation_status?: string | null
          pdf_storage_path?: string | null
          quote_number?: string | null
          status?: string
          status_tag_id?: string | null
          submitted_at?: string | null
          subtotal?: number | null
          total_items?: number | null
          updated_at?: string
          user_id: string
          vat_amount?: number | null
          vat_rate?: number | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          currency?: string | null
          custom_request_text?: string | null
          customer_company_id?: string | null
          customer_contact_id?: string | null
          expires_at?: string | null
          extras_total?: number | null
          grand_total?: number | null
          id?: string
          last_activity_at?: string
          name?: string | null
          notes?: string | null
          oxygen_contact_id?: string | null
          oxygen_last_sync_at?: string | null
          oxygen_notice_id?: string | null
          oxygen_sync_error?: string | null
          oxygen_sync_status?: string | null
          pdf_generated_at?: string | null
          pdf_generation_status?: string | null
          pdf_storage_path?: string | null
          quote_number?: string | null
          status?: string
          status_tag_id?: string | null
          submitted_at?: string | null
          subtotal?: number | null
          total_items?: number | null
          updated_at?: string
          user_id?: string
          vat_amount?: number | null
          vat_rate?: number | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_customer_company_id_fkey"
            columns: ["customer_company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_customer_contact_id_fkey"
            columns: ["customer_contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_status_tag_id_fkey"
            columns: ["status_tag_id"]
            isOneToOne: false
            referencedRelation: "status_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      recommendation_analytics: {
        Row: {
          algorithms_used: Json | null
          avg_confidence_score: number | null
          computation_time_ms: number | null
          confidence_distribution: Json | null
          context: string | null
          created_at: string | null
          current_category: string | null
          current_product_id: string | null
          data_retrieval_time_ms: number | null
          diversity_achieved: number | null
          diversity_factor: number | null
          generation_time_ms: number | null
          id: string
          ranking_time_ms: number | null
          recommendation_id: string
          recommendations_data: Json
          total_recommendations: number | null
          updated_at: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          algorithms_used?: Json | null
          avg_confidence_score?: number | null
          computation_time_ms?: number | null
          confidence_distribution?: Json | null
          context?: string | null
          created_at?: string | null
          current_category?: string | null
          current_product_id?: string | null
          data_retrieval_time_ms?: number | null
          diversity_achieved?: number | null
          diversity_factor?: number | null
          generation_time_ms?: number | null
          id?: string
          ranking_time_ms?: number | null
          recommendation_id: string
          recommendations_data?: Json
          total_recommendations?: number | null
          updated_at?: string | null
          user_id: string
          workspace_id?: string
        }
        Update: {
          algorithms_used?: Json | null
          avg_confidence_score?: number | null
          computation_time_ms?: number | null
          confidence_distribution?: Json | null
          context?: string | null
          created_at?: string | null
          current_category?: string | null
          current_product_id?: string | null
          data_retrieval_time_ms?: number | null
          diversity_achieved?: number | null
          diversity_factor?: number | null
          generation_time_ms?: number | null
          id?: string
          ranking_time_ms?: number | null
          recommendation_id?: string
          recommendations_data?: Json
          total_recommendations?: number | null
          updated_at?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      recommendation_scores: {
        Row: {
          algorithm: string
          computed_at: string | null
          confidence: number | null
          created_at: string | null
          expires_at: string | null
          id: string
          material_id: string
          metadata: Json | null
          score: number
          updated_at: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          algorithm: string
          computed_at?: string | null
          confidence?: number | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          material_id: string
          metadata?: Json | null
          score: number
          updated_at?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          algorithm?: string
          computed_at?: string | null
          confidence?: number | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          material_id?: string
          metadata?: Json | null
          score?: number
          updated_at?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_scores_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_scores_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      response_quality_metrics: {
        Row: {
          coherence_score: number
          created_at: string | null
          factual_consistency_score: number
          hallucination_score: number
          id: string
          issues_detected: string[] | null
          overall_quality_score: number
          quality_assessment: string
          query: string
          response_id: string
          response_text: string
          source_attribution_score: number
        }
        Insert: {
          coherence_score: number
          created_at?: string | null
          factual_consistency_score: number
          hallucination_score: number
          id?: string
          issues_detected?: string[] | null
          overall_quality_score: number
          quality_assessment: string
          query: string
          response_id: string
          response_text: string
          source_attribution_score: number
        }
        Update: {
          coherence_score?: number
          created_at?: string | null
          factual_consistency_score?: number
          hallucination_score?: number
          id?: string
          issues_detected?: string[] | null
          overall_quality_score?: number
          quality_assessment?: string
          query?: string
          response_id?: string
          response_text?: string
          source_attribution_score?: number
        }
        Relationships: []
      }
      retailer_extraction_recipes: {
        Row: {
          availability_selector: string | null
          confidence: number
          created_at: string
          currency_default: string | null
          disabled: boolean
          domain: string
          failure_count: number
          id: string
          last_failure_at: string | null
          last_failure_reason: string | null
          last_validated_at: string | null
          original_price_selector: string | null
          price_selector: string | null
          product_name_selector: string | null
          requires_js: boolean
          success_count: number
          updated_at: string
          url_pattern: string
        }
        Insert: {
          availability_selector?: string | null
          confidence?: number
          created_at?: string
          currency_default?: string | null
          disabled?: boolean
          domain: string
          failure_count?: number
          id?: string
          last_failure_at?: string | null
          last_failure_reason?: string | null
          last_validated_at?: string | null
          original_price_selector?: string | null
          price_selector?: string | null
          product_name_selector?: string | null
          requires_js?: boolean
          success_count?: number
          updated_at?: string
          url_pattern: string
        }
        Update: {
          availability_selector?: string | null
          confidence?: number
          created_at?: string
          currency_default?: string | null
          disabled?: boolean
          domain?: string
          failure_count?: number
          id?: string
          last_failure_at?: string | null
          last_failure_reason?: string | null
          last_validated_at?: string | null
          original_price_selector?: string | null
          price_selector?: string | null
          product_name_selector?: string | null
          requires_js?: boolean
          success_count?: number
          updated_at?: string
          url_pattern?: string
        }
        Relationships: []
      }
      retrieval_quality_metrics: {
        Row: {
          created_at: string | null
          id: string
          latency_ms: number
          mrr: number
          precision: number
          query: string
          recall: number
          relevant_chunks: number
          retrieved_chunks: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          latency_ms: number
          mrr: number
          precision: number
          query: string
          recall: number
          relevant_chunks: number
          retrieved_chunks: number
        }
        Update: {
          created_at?: string | null
          id?: string
          latency_ms?: number
          mrr?: number
          precision?: number
          query?: string
          recall?: number
          relevant_chunks?: number
          retrieved_chunks?: number
        }
        Relationships: []
      }
      review_summaries: {
        Row: {
          last_computed_at: string
          summary_text: string
          user_id: string
        }
        Insert: {
          last_computed_at?: string
          summary_text?: string
          user_id: string
        }
        Update: {
          last_computed_at?: string
          summary_text?: string
          user_id?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          created_at: string | null
          id: string
          permission: string
          role_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          permission: string
          role_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          permission?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          level: number
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          level: number
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          level?: number
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      saved_searches: {
        Row: {
          application_context: string | null
          conversation_id: string | null
          core_material: string | null
          created_at: string | null
          description: string | null
          embedding_dimension: number | null
          embedding_model: string | null
          execution_count: number | null
          filters: Json | null
          generation_3d_id: string | null
          id: string
          intent_category: string | null
          is_active_for_recommendations: boolean | null
          is_public: boolean | null
          last_executed_at: string | null
          last_merged_at: string | null
          last_recommendation_sent_at: string | null
          last_used_at: string | null
          material_attributes: Json | null
          material_filters: Json | null
          merge_count: number | null
          merged_from_ids: string[] | null
          moodboard_id: string | null
          name: string
          normalized_query: string | null
          query: string
          recommendation_frequency: string | null
          relevance_score: number | null
          results_snapshot: Json | null
          search_strategy: string | null
          semantic_fingerprint: unknown
          shared_with_users: string[] | null
          spatial_context: Json | null
          tags: string[] | null
          updated_at: string | null
          use_count: number | null
          user_engagement_score: number | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          application_context?: string | null
          conversation_id?: string | null
          core_material?: string | null
          created_at?: string | null
          description?: string | null
          embedding_dimension?: number | null
          embedding_model?: string | null
          execution_count?: number | null
          filters?: Json | null
          generation_3d_id?: string | null
          id?: string
          intent_category?: string | null
          is_active_for_recommendations?: boolean | null
          is_public?: boolean | null
          last_executed_at?: string | null
          last_merged_at?: string | null
          last_recommendation_sent_at?: string | null
          last_used_at?: string | null
          material_attributes?: Json | null
          material_filters?: Json | null
          merge_count?: number | null
          merged_from_ids?: string[] | null
          moodboard_id?: string | null
          name: string
          normalized_query?: string | null
          query: string
          recommendation_frequency?: string | null
          relevance_score?: number | null
          results_snapshot?: Json | null
          search_strategy?: string | null
          semantic_fingerprint?: unknown
          shared_with_users?: string[] | null
          spatial_context?: Json | null
          tags?: string[] | null
          updated_at?: string | null
          use_count?: number | null
          user_engagement_score?: number | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          application_context?: string | null
          conversation_id?: string | null
          core_material?: string | null
          created_at?: string | null
          description?: string | null
          embedding_dimension?: number | null
          embedding_model?: string | null
          execution_count?: number | null
          filters?: Json | null
          generation_3d_id?: string | null
          id?: string
          intent_category?: string | null
          is_active_for_recommendations?: boolean | null
          is_public?: boolean | null
          last_executed_at?: string | null
          last_merged_at?: string | null
          last_recommendation_sent_at?: string | null
          last_used_at?: string | null
          material_attributes?: Json | null
          material_filters?: Json | null
          merge_count?: number | null
          merged_from_ids?: string[] | null
          moodboard_id?: string | null
          name?: string
          normalized_query?: string | null
          query?: string
          recommendation_frequency?: string | null
          relevance_score?: number | null
          results_snapshot?: Json | null
          search_strategy?: string | null
          semantic_fingerprint?: unknown
          shared_with_users?: string[] | null
          spatial_context?: Json | null
          tags?: string[] | null
          updated_at?: string | null
          use_count?: number | null
          user_engagement_score?: number | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_searches_generation_3d_id_fkey"
            columns: ["generation_3d_id"]
            isOneToOne: false
            referencedRelation: "generation_3d"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_searches_moodboard_id_fkey"
            columns: ["moodboard_id"]
            isOneToOne: false
            referencedRelation: "moodboards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_searches_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      scraped_materials_temp: {
        Row: {
          created_at: string | null
          id: string
          material_data: Json
          scraping_session_id: string
          source_url: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          material_data: Json
          scraping_session_id: string
          source_url: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          material_data?: Json
          scraping_session_id?: string
          source_url?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      scraping_pages: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          markdown_content: string | null
          materials_found: number | null
          page_index: number
          processing_time_ms: number | null
          retry_count: number | null
          session_id: string
          started_at: string | null
          status: string
          updated_at: string
          url: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          markdown_content?: string | null
          materials_found?: number | null
          page_index: number
          processing_time_ms?: number | null
          retry_count?: number | null
          session_id: string
          started_at?: string | null
          status?: string
          updated_at?: string
          url: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          markdown_content?: string | null
          materials_found?: number | null
          page_index?: number
          processing_time_ms?: number | null
          retry_count?: number | null
          session_id?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      scraping_sessions: {
        Row: {
          auto_resume: boolean | null
          background_job_id: string | null
          chunks_completed: number | null
          chunks_total: number | null
          completed_pages: number | null
          created_at: string
          current_chunk_id: string | null
          current_page_url: string | null
          estimated_total_materials: number | null
          failed_pages: number | null
          field_mappings: Json | null
          id: string
          last_heartbeat_at: string | null
          last_processed_url: string | null
          last_recovery_at: string | null
          materials_processed: number | null
          metadata: Json | null
          pending_pages: number | null
          processing_mode: string | null
          progress_percentage: number | null
          recovery_attempts: number | null
          scraping_config: Json
          session_id: string
          session_type: string | null
          source_url: string
          status: string
          total_materials_found: number | null
          total_pages: number | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          auto_resume?: boolean | null
          background_job_id?: string | null
          chunks_completed?: number | null
          chunks_total?: number | null
          completed_pages?: number | null
          created_at?: string
          current_chunk_id?: string | null
          current_page_url?: string | null
          estimated_total_materials?: number | null
          failed_pages?: number | null
          field_mappings?: Json | null
          id?: string
          last_heartbeat_at?: string | null
          last_processed_url?: string | null
          last_recovery_at?: string | null
          materials_processed?: number | null
          metadata?: Json | null
          pending_pages?: number | null
          processing_mode?: string | null
          progress_percentage?: number | null
          recovery_attempts?: number | null
          scraping_config?: Json
          session_id: string
          session_type?: string | null
          source_url: string
          status?: string
          total_materials_found?: number | null
          total_pages?: number | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          auto_resume?: boolean | null
          background_job_id?: string | null
          chunks_completed?: number | null
          chunks_total?: number | null
          completed_pages?: number | null
          created_at?: string
          current_chunk_id?: string | null
          current_page_url?: string | null
          estimated_total_materials?: number | null
          failed_pages?: number | null
          field_mappings?: Json | null
          id?: string
          last_heartbeat_at?: string | null
          last_processed_url?: string | null
          last_recovery_at?: string | null
          materials_processed?: number | null
          metadata?: Json | null
          pending_pages?: number | null
          processing_mode?: string | null
          progress_percentage?: number | null
          recovery_attempts?: number | null
          scraping_config?: Json
          session_id?: string
          session_type?: string | null
          source_url?: string
          status?: string
          total_materials_found?: number | null
          total_pages?: number | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scraping_sessions_background_job_id_fkey"
            columns: ["background_job_id"]
            isOneToOne: false
            referencedRelation: "background_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scraping_sessions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      search_analytics: {
        Row: {
          added_to_moodboard: boolean | null
          avg_relevance_score: number | null
          clicks_count: number | null
          conversation_id: string | null
          created_at: string
          detected_categories: Json | null
          extracted_entities: Json | null
          follow_up_queries: string[] | null
          generation_3d_id: string | null
          id: string
          material_filters_applied: Json | null
          material_mentions: Json | null
          moodboard_id: string | null
          personalization_applied: boolean | null
          query_embedding: unknown
          query_processing_time_ms: number | null
          query_text: string
          refinements_count: number | null
          response_time_ms: number | null
          results_shown: number | null
          satisfaction_rating: number | null
          saved_search: boolean | null
          search_intent: string | null
          search_strategy: string | null
          session_id: string | null
          time_on_results: number | null
          total_results: number | null
          used_in_3d_generation: boolean | null
          user_behavior_factors: Json | null
          user_country: string | null
          user_id: string | null
          user_language: string | null
        }
        Insert: {
          added_to_moodboard?: boolean | null
          avg_relevance_score?: number | null
          clicks_count?: number | null
          conversation_id?: string | null
          created_at?: string
          detected_categories?: Json | null
          extracted_entities?: Json | null
          follow_up_queries?: string[] | null
          generation_3d_id?: string | null
          id?: string
          material_filters_applied?: Json | null
          material_mentions?: Json | null
          moodboard_id?: string | null
          personalization_applied?: boolean | null
          query_embedding?: unknown
          query_processing_time_ms?: number | null
          query_text: string
          refinements_count?: number | null
          response_time_ms?: number | null
          results_shown?: number | null
          satisfaction_rating?: number | null
          saved_search?: boolean | null
          search_intent?: string | null
          search_strategy?: string | null
          session_id?: string | null
          time_on_results?: number | null
          total_results?: number | null
          used_in_3d_generation?: boolean | null
          user_behavior_factors?: Json | null
          user_country?: string | null
          user_id?: string | null
          user_language?: string | null
        }
        Update: {
          added_to_moodboard?: boolean | null
          avg_relevance_score?: number | null
          clicks_count?: number | null
          conversation_id?: string | null
          created_at?: string
          detected_categories?: Json | null
          extracted_entities?: Json | null
          follow_up_queries?: string[] | null
          generation_3d_id?: string | null
          id?: string
          material_filters_applied?: Json | null
          material_mentions?: Json | null
          moodboard_id?: string | null
          personalization_applied?: boolean | null
          query_embedding?: unknown
          query_processing_time_ms?: number | null
          query_text?: string
          refinements_count?: number | null
          response_time_ms?: number | null
          results_shown?: number | null
          satisfaction_rating?: number | null
          saved_search?: boolean | null
          search_intent?: string | null
          search_strategy?: string | null
          session_id?: string | null
          time_on_results?: number | null
          total_results?: number | null
          used_in_3d_generation?: boolean | null
          user_behavior_factors?: Json | null
          user_country?: string | null
          user_id?: string | null
          user_language?: string | null
        }
        Relationships: []
      }
      search_query_corrections: {
        Row: {
          acceptance_rate: number | null
          auto_applied_count: number | null
          confidence_score: number | null
          corrected_query: string
          correction_type: string
          created_at: string | null
          id: string
          original_query: string
          updated_at: string | null
          user_accepted_count: number | null
          user_rejected_count: number | null
        }
        Insert: {
          acceptance_rate?: number | null
          auto_applied_count?: number | null
          confidence_score?: number | null
          corrected_query: string
          correction_type: string
          created_at?: string | null
          id?: string
          original_query: string
          updated_at?: string | null
          user_accepted_count?: number | null
          user_rejected_count?: number | null
        }
        Update: {
          acceptance_rate?: number | null
          auto_applied_count?: number | null
          confidence_score?: number | null
          corrected_query?: string
          correction_type?: string
          created_at?: string | null
          id?: string
          original_query?: string
          updated_at?: string | null
          user_accepted_count?: number | null
          user_rejected_count?: number | null
        }
        Relationships: []
      }
      search_query_tracking: {
        Row: {
          cache_hit: boolean | null
          dynamic_weights: Json | null
          embedding_generation_ms: number | null
          enhancement_ms: number | null
          fulltext_search_ms: number | null
          id: string
          is_product_name_search: boolean | null
          matched_terms: string[] | null
          query_metadata: Json | null
          query_text: string
          query_understanding_ms: number | null
          response_time_ms: number | null
          result_count: number | null
          scoring_ms: number | null
          search_type: string | null
          searched_terms: string[] | null
          strategy: string | null
          timestamp: string | null
          total_ms: number | null
          unmatched_terms: string[] | null
          user_id: string | null
          validation_attempted: boolean | null
          validation_results: Json | null
          vector_search_ms: number | null
          weight_profile: string | null
          weight_profile_source: string | null
          workspace_id: string
          zero_results: boolean | null
        }
        Insert: {
          cache_hit?: boolean | null
          dynamic_weights?: Json | null
          embedding_generation_ms?: number | null
          enhancement_ms?: number | null
          fulltext_search_ms?: number | null
          id?: string
          is_product_name_search?: boolean | null
          matched_terms?: string[] | null
          query_metadata?: Json | null
          query_text: string
          query_understanding_ms?: number | null
          response_time_ms?: number | null
          result_count?: number | null
          scoring_ms?: number | null
          search_type?: string | null
          searched_terms?: string[] | null
          strategy?: string | null
          timestamp?: string | null
          total_ms?: number | null
          unmatched_terms?: string[] | null
          user_id?: string | null
          validation_attempted?: boolean | null
          validation_results?: Json | null
          vector_search_ms?: number | null
          weight_profile?: string | null
          weight_profile_source?: string | null
          workspace_id: string
          zero_results?: boolean | null
        }
        Update: {
          cache_hit?: boolean | null
          dynamic_weights?: Json | null
          embedding_generation_ms?: number | null
          enhancement_ms?: number | null
          fulltext_search_ms?: number | null
          id?: string
          is_product_name_search?: boolean | null
          matched_terms?: string[] | null
          query_metadata?: Json | null
          query_text?: string
          query_understanding_ms?: number | null
          response_time_ms?: number | null
          result_count?: number | null
          scoring_ms?: number | null
          search_type?: string | null
          searched_terms?: string[] | null
          strategy?: string | null
          timestamp?: string | null
          total_ms?: number | null
          unmatched_terms?: string[] | null
          user_id?: string | null
          validation_attempted?: boolean | null
          validation_results?: Json | null
          vector_search_ms?: number | null
          weight_profile?: string | null
          weight_profile_source?: string | null
          workspace_id?: string
          zero_results?: boolean | null
        }
        Relationships: []
      }
      search_sessions: {
        Row: {
          created_at: string | null
          duration_ms: number | null
          end_time: string | null
          engagement_score: number | null
          entry_point: string | null
          exit_point: string | null
          id: string
          ip_address: unknown
          recommendations_clicked: number | null
          recommendations_viewed: number | null
          results_clicked: number | null
          results_viewed: number | null
          satisfaction_score: number | null
          search_count: number | null
          session_id: string
          start_time: string | null
          updated_at: string | null
          user_agent: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          duration_ms?: number | null
          end_time?: string | null
          engagement_score?: number | null
          entry_point?: string | null
          exit_point?: string | null
          id?: string
          ip_address?: unknown
          recommendations_clicked?: number | null
          recommendations_viewed?: number | null
          results_clicked?: number | null
          results_viewed?: number | null
          satisfaction_score?: number | null
          search_count?: number | null
          session_id: string
          start_time?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id: string
          workspace_id?: string
        }
        Update: {
          created_at?: string | null
          duration_ms?: number | null
          end_time?: string | null
          engagement_score?: number | null
          entry_point?: string | null
          exit_point?: string | null
          id?: string
          ip_address?: unknown
          recommendations_clicked?: number | null
          recommendations_viewed?: number | null
          results_clicked?: number | null
          results_viewed?: number | null
          satisfaction_score?: number | null
          search_count?: number | null
          session_id?: string
          start_time?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      search_suggestion_clicks: {
        Row: {
          action_type: string
          created_at: string | null
          id: string
          original_query: string | null
          result_count: number | null
          session_id: string | null
          suggestion_id: string | null
          suggestion_position: number | null
          user_id: string | null
          user_satisfied: boolean | null
        }
        Insert: {
          action_type: string
          created_at?: string | null
          id?: string
          original_query?: string | null
          result_count?: number | null
          session_id?: string | null
          suggestion_id?: string | null
          suggestion_position?: number | null
          user_id?: string | null
          user_satisfied?: boolean | null
        }
        Update: {
          action_type?: string
          created_at?: string | null
          id?: string
          original_query?: string | null
          result_count?: number | null
          session_id?: string | null
          suggestion_id?: string | null
          suggestion_position?: number | null
          user_id?: string | null
          user_satisfied?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "search_suggestion_clicks_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "search_suggestions"
            referencedColumns: ["id"]
          },
        ]
      }
      search_suggestions: {
        Row: {
          category: string | null
          click_count: number | null
          created_at: string | null
          ctr: number | null
          id: string
          impression_count: number | null
          is_active: boolean | null
          last_used_at: string | null
          metadata: Json | null
          popularity_score: number | null
          suggestion_text: string
          suggestion_type: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          click_count?: number | null
          created_at?: string | null
          ctr?: number | null
          id?: string
          impression_count?: number | null
          is_active?: boolean | null
          last_used_at?: string | null
          metadata?: Json | null
          popularity_score?: number | null
          suggestion_text: string
          suggestion_type: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          click_count?: number | null
          created_at?: string | null
          ctr?: number | null
          id?: string
          impression_count?: number | null
          is_active?: boolean | null
          last_used_at?: string | null
          metadata?: Json | null
          popularity_score?: number | null
          suggestion_text?: string
          suggestion_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      shopping_carts: {
        Row: {
          created_at: string | null
          id: string
          status: string | null
          total_items: number | null
          updated_at: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          status?: string | null
          total_items?: number | null
          updated_at?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          status?: string | null
          total_items?: number | null
          updated_at?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      social_account_insights: {
        Row: {
          avg_engagement: number | null
          followers_count: number | null
          following_count: number | null
          id: string
          impressions_7d: number | null
          metadata: Json | null
          posts_count: number | null
          reach_7d: number | null
          snapshot_date: string
          social_account_id: string
          workspace_id: string
        }
        Insert: {
          avg_engagement?: number | null
          followers_count?: number | null
          following_count?: number | null
          id?: string
          impressions_7d?: number | null
          metadata?: Json | null
          posts_count?: number | null
          reach_7d?: number | null
          snapshot_date: string
          social_account_id: string
          workspace_id: string
        }
        Update: {
          avg_engagement?: number | null
          followers_count?: number | null
          following_count?: number | null
          id?: string
          impressions_7d?: number | null
          metadata?: Json | null
          posts_count?: number | null
          reach_7d?: number | null
          snapshot_date?: string
          social_account_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_account_insights_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_accounts: {
        Row: {
          avatar_url: string | null
          connected_at: string | null
          created_at: string | null
          display_name: string | null
          followers_count: number | null
          following_count: number | null
          handle: string | null
          id: string
          is_active: boolean | null
          last_synced_at: string | null
          late_account_id: string
          metadata: Json | null
          platform: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          avatar_url?: string | null
          connected_at?: string | null
          created_at?: string | null
          display_name?: string | null
          followers_count?: number | null
          following_count?: number | null
          handle?: string | null
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          late_account_id: string
          metadata?: Json | null
          platform: string
          user_id: string
          workspace_id: string
        }
        Update: {
          avatar_url?: string | null
          connected_at?: string | null
          created_at?: string | null
          display_name?: string | null
          followers_count?: number | null
          following_count?: number | null
          handle?: string | null
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          late_account_id?: string
          metadata?: Json | null
          platform?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      social_post_analytics: {
        Row: {
          clicks: number | null
          comments: number | null
          engagement_rate: number | null
          id: string
          impressions: number | null
          likes: number | null
          metadata: Json | null
          post_id: string
          reach: number | null
          saves: number | null
          shares: number | null
          synced_at: string | null
          workspace_id: string
        }
        Insert: {
          clicks?: number | null
          comments?: number | null
          engagement_rate?: number | null
          id?: string
          impressions?: number | null
          likes?: number | null
          metadata?: Json | null
          post_id: string
          reach?: number | null
          saves?: number | null
          shares?: number | null
          synced_at?: string | null
          workspace_id: string
        }
        Update: {
          clicks?: number | null
          comments?: number | null
          engagement_rate?: number | null
          id?: string
          impressions?: number | null
          likes?: number | null
          metadata?: Json | null
          post_id?: string
          reach?: number | null
          saves?: number | null
          shares?: number | null
          synced_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_post_analytics_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_posts: {
        Row: {
          caption: string | null
          created_at: string | null
          credits_breakdown: Json | null
          credits_used: number
          generation_model: string | null
          hashtags: string[] | null
          id: string
          image_urls: string[] | null
          late_post_id: string | null
          metadata: Json | null
          platform: string
          post_type: string
          published_at: string | null
          scheduled_at: string | null
          social_account_id: string | null
          status: string
          updated_at: string | null
          user_id: string
          video_url: string | null
          workspace_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          credits_breakdown?: Json | null
          credits_used?: number
          generation_model?: string | null
          hashtags?: string[] | null
          id?: string
          image_urls?: string[] | null
          late_post_id?: string | null
          metadata?: Json | null
          platform: string
          post_type?: string
          published_at?: string | null
          scheduled_at?: string | null
          social_account_id?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
          video_url?: string | null
          workspace_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          credits_breakdown?: Json | null
          credits_used?: number
          generation_model?: string | null
          hashtags?: string[] | null
          id?: string
          image_urls?: string[] | null
          late_post_id?: string | null
          metadata?: Json | null
          platform?: string
          post_type?: string
          published_at?: string | null
          scheduled_at?: string | null
          social_account_id?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
          video_url?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_posts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      spatial_analysis: {
        Row: {
          accessibility_analysis: Json | null
          analysis_type: string
          confidence_score: number | null
          created_at: string | null
          flow_optimization: Json | null
          id: string
          layout_suggestions: Json | null
          material_placements: Json | null
          processing_time_ms: number | null
          reasoning_explanation: string | null
          room_type: string
          spatial_features: Json | null
          updated_at: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          accessibility_analysis?: Json | null
          analysis_type: string
          confidence_score?: number | null
          created_at?: string | null
          flow_optimization?: Json | null
          id?: string
          layout_suggestions?: Json | null
          material_placements?: Json | null
          processing_time_ms?: number | null
          reasoning_explanation?: string | null
          room_type: string
          spatial_features?: Json | null
          updated_at?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          accessibility_analysis?: Json | null
          analysis_type?: string
          confidence_score?: number | null
          created_at?: string | null
          flow_optimization?: Json | null
          id?: string
          layout_suggestions?: Json | null
          material_placements?: Json | null
          processing_time_ms?: number | null
          reasoning_explanation?: string | null
          room_type?: string
          spatial_features?: Json | null
          updated_at?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      status_tags: {
        Row: {
          color: string
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          is_system: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          color?: string
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_system?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          color?: string
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_system?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          created_at: string | null
          currency: string | null
          description: string | null
          features: Json | null
          id: string
          is_active: boolean | null
          name: string
          price: number | null
          price_in_cents: number
          stripe_price_id: string | null
          stripe_product_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          currency?: string | null
          description?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          name: string
          price?: number | null
          price_in_cents: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          currency?: string | null
          description?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          name?: string
          price?: number | null
          price_in_cents?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      system_logs: {
        Row: {
          context: Json | null
          created_at: string
          id: string
          job_id: string | null
          level: string
          logger_name: string
          message: string
          request_id: string | null
          timestamp: string
          user_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string
          id?: string
          job_id?: string | null
          level: string
          logger_name: string
          message: string
          request_id?: string | null
          timestamp?: string
          user_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string
          id?: string
          job_id?: string | null
          level?: string
          logger_name?: string
          message?: string
          request_id?: string | null
          timestamp?: string
          user_id?: string | null
        }
        Relationships: []
      }
      system_performance_metrics: {
        Row: {
          created_at: string | null
          id: string
          metric_name: string
          metric_type: string
          metric_unit: string | null
          metric_value: number
          recorded_at: string | null
          tags: Json | null
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          metric_name: string
          metric_type: string
          metric_unit?: string | null
          metric_value: number
          recorded_at?: string | null
          tags?: Json | null
          workspace_id?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          metric_name?: string
          metric_type?: string
          metric_unit?: string | null
          metric_value?: number
          recorded_at?: string | null
          tags?: Json | null
          workspace_id?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          setting_key: string
          setting_value: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      timeline_steps: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      tracked_queries: {
        Row: {
          alert_channels: string[]
          alert_on_new_retailer: boolean
          alert_on_price_drop: boolean
          alert_on_promo: boolean
          alert_webhook_url: string | null
          api_key_id: string | null
          consecutive_stable_refreshes: number
          country_code: string | null
          created_at: string
          current_availability: string | null
          current_currency: string | null
          current_metadata: Json | null
          current_original_price: number | null
          current_price: number | null
          current_price_updated_at: string | null
          current_price_verified: boolean
          dimensions: string | null
          first_refresh_verified: boolean
          id: string
          is_active: boolean
          last_error: string | null
          last_refresh_credits_used: number | null
          last_refreshed_at: string | null
          manufacturer: string | null
          mode: string
          next_check_at: string | null
          pinned_url: string | null
          preferred_retailer_domains: string[] | null
          product_id: string | null
          query_facets: Json | null
          refresh_interval_hours: number
          search_query: string
          total_credits_used: number | null
          updated_at: string
          user_id: string | null
          verify_prices: boolean
          volatility_score: number | null
          workspace_id: string | null
        }
        Insert: {
          alert_channels?: string[]
          alert_on_new_retailer?: boolean
          alert_on_price_drop?: boolean
          alert_on_promo?: boolean
          alert_webhook_url?: string | null
          api_key_id?: string | null
          consecutive_stable_refreshes?: number
          country_code?: string | null
          created_at?: string
          current_availability?: string | null
          current_currency?: string | null
          current_metadata?: Json | null
          current_original_price?: number | null
          current_price?: number | null
          current_price_updated_at?: string | null
          current_price_verified?: boolean
          dimensions?: string | null
          first_refresh_verified?: boolean
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_refresh_credits_used?: number | null
          last_refreshed_at?: string | null
          manufacturer?: string | null
          mode?: string
          next_check_at?: string | null
          pinned_url?: string | null
          preferred_retailer_domains?: string[] | null
          product_id?: string | null
          query_facets?: Json | null
          refresh_interval_hours?: number
          search_query: string
          total_credits_used?: number | null
          updated_at?: string
          user_id?: string | null
          verify_prices?: boolean
          volatility_score?: number | null
          workspace_id?: string | null
        }
        Update: {
          alert_channels?: string[]
          alert_on_new_retailer?: boolean
          alert_on_price_drop?: boolean
          alert_on_promo?: boolean
          alert_webhook_url?: string | null
          api_key_id?: string | null
          consecutive_stable_refreshes?: number
          country_code?: string | null
          created_at?: string
          current_availability?: string | null
          current_currency?: string | null
          current_metadata?: Json | null
          current_original_price?: number | null
          current_price?: number | null
          current_price_updated_at?: string | null
          current_price_verified?: boolean
          dimensions?: string | null
          first_refresh_verified?: boolean
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_refresh_credits_used?: number | null
          last_refreshed_at?: string | null
          manufacturer?: string | null
          mode?: string
          next_check_at?: string | null
          pinned_url?: string | null
          preferred_retailer_domains?: string[] | null
          product_id?: string | null
          query_facets?: Json | null
          refresh_interval_hours?: number
          search_query?: string
          total_credits_used?: number | null
          updated_at?: string
          user_id?: string | null
          verify_prices?: boolean
          volatility_score?: number | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tracked_queries_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracked_queries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      tracked_query_excluded_urls: {
        Row: {
          domain: string | null
          excluded_at: string
          excluded_by_api_key_id: string | null
          id: string
          reason: string | null
          tracked_query_id: string
          url: string | null
        }
        Insert: {
          domain?: string | null
          excluded_at?: string
          excluded_by_api_key_id?: string | null
          id?: string
          reason?: string | null
          tracked_query_id: string
          url?: string | null
        }
        Update: {
          domain?: string | null
          excluded_at?: string
          excluded_by_api_key_id?: string | null
          id?: string
          reason?: string | null
          tracked_query_id?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tracked_query_excluded_urls_excluded_by_api_key_id_fkey"
            columns: ["excluded_by_api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracked_query_excluded_urls_tracked_query_id_fkey"
            columns: ["tracked_query_id"]
            isOneToOne: false
            referencedRelation: "tracked_queries"
            referencedColumns: ["id"]
          },
        ]
      }
      tracked_query_price_history: {
        Row: {
          anomaly_reason: string | null
          availability: string | null
          city: string | null
          currency: string | null
          id: string
          is_anomaly: boolean
          manual_override: boolean
          match_kind: string | null
          match_note: string | null
          match_score: number | null
          notes: string | null
          original_price: number | null
          price: number | null
          price_unit: string | null
          product_title: string | null
          product_url: string
          refresh_run_id: string
          retailer_name: string
          rolling_median_at_check: number | null
          scraped_at: string
          ships_from_abroad: boolean | null
          source: Database["public"]["Enums"]["competitor_source_type"]
          tracked_query_id: string
          verified: boolean
        }
        Insert: {
          anomaly_reason?: string | null
          availability?: string | null
          city?: string | null
          currency?: string | null
          id?: string
          is_anomaly?: boolean
          manual_override?: boolean
          match_kind?: string | null
          match_note?: string | null
          match_score?: number | null
          notes?: string | null
          original_price?: number | null
          price?: number | null
          price_unit?: string | null
          product_title?: string | null
          product_url: string
          refresh_run_id: string
          retailer_name: string
          rolling_median_at_check?: number | null
          scraped_at?: string
          ships_from_abroad?: boolean | null
          source?: Database["public"]["Enums"]["competitor_source_type"]
          tracked_query_id: string
          verified?: boolean
        }
        Update: {
          anomaly_reason?: string | null
          availability?: string | null
          city?: string | null
          currency?: string | null
          id?: string
          is_anomaly?: boolean
          manual_override?: boolean
          match_kind?: string | null
          match_note?: string | null
          match_score?: number | null
          notes?: string | null
          original_price?: number | null
          price?: number | null
          price_unit?: string | null
          product_title?: string | null
          product_url?: string
          refresh_run_id?: string
          retailer_name?: string
          rolling_median_at_check?: number | null
          scraped_at?: string
          ships_from_abroad?: boolean | null
          source?: Database["public"]["Enums"]["competitor_source_type"]
          tracked_query_id?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "tracked_query_price_history_tracked_query_id_fkey"
            columns: ["tracked_query_id"]
            isOneToOne: false
            referencedRelation: "tracked_queries"
            referencedColumns: ["id"]
          },
        ]
      }
      tracked_query_promoted_urls: {
        Row: {
          created_at: string
          created_by: string | null
          override_kind: string
          product_url: string
          reason: string | null
          tracked_query_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          override_kind: string
          product_url: string
          reason?: string | null
          tracked_query_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          override_kind?: string
          product_url?: string
          reason?: string | null
          tracked_query_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracked_query_promoted_urls_tracked_query_id_fkey"
            columns: ["tracked_query_id"]
            isOneToOne: false
            referencedRelation: "tracked_queries"
            referencedColumns: ["id"]
          },
        ]
      }
      trending_searches: {
        Row: {
          category: string | null
          created_at: string | null
          growth_rate: number | null
          id: string
          metadata: Json | null
          query_text: string
          search_count: number | null
          time_window: string
          trend_score: number | null
          unique_users_count: number | null
          updated_at: string | null
          window_end: string
          window_start: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          growth_rate?: number | null
          id?: string
          metadata?: Json | null
          query_text: string
          search_count?: number | null
          time_window: string
          trend_score?: number | null
          unique_users_count?: number | null
          updated_at?: string | null
          window_end: string
          window_start: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          growth_rate?: number | null
          id?: string
          metadata?: Json | null
          query_text?: string
          search_count?: number | null
          time_window?: string
          trend_score?: number | null
          unique_users_count?: number | null
          updated_at?: string | null
          window_end?: string
          window_start?: string
        }
        Relationships: []
      }
      unmatched_term_frequency: {
        Row: {
          first_seen_at: string | null
          frequency_count: number | null
          id: string
          last_seen_at: string | null
          property_key: string | null
          query_ids: string[] | null
          review_status: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          similar_prototypes: Json | null
          term: string
          workspace_ids: string[] | null
        }
        Insert: {
          first_seen_at?: string | null
          frequency_count?: number | null
          id?: string
          last_seen_at?: string | null
          property_key?: string | null
          query_ids?: string[] | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          similar_prototypes?: Json | null
          term: string
          workspace_ids?: string[] | null
        }
        Update: {
          first_seen_at?: string | null
          frequency_count?: number | null
          id?: string
          last_seen_at?: string | null
          property_key?: string | null
          query_ids?: string[] | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          similar_prototypes?: Json | null
          term?: string
          workspace_ids?: string[] | null
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
          workspace_id: string | null
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
          workspace_id?: string | null
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
          workspace_id?: string | null
        }
        Relationships: []
      }
      upsells: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          name: string
          price: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          price: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          price?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      user_behavior_profiles: {
        Row: {
          computation_version: number | null
          created_at: string | null
          id: string
          implicit_preferences: Json
          interaction_patterns: Json
          last_computed_at: string | null
          profile_confidence: number | null
          search_patterns: Json
          updated_at: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          computation_version?: number | null
          created_at?: string | null
          id?: string
          implicit_preferences?: Json
          interaction_patterns?: Json
          last_computed_at?: string | null
          profile_confidence?: number | null
          search_patterns?: Json
          updated_at?: string | null
          user_id: string
          workspace_id?: string
        }
        Update: {
          computation_version?: number | null
          created_at?: string | null
          id?: string
          implicit_preferences?: Json
          interaction_patterns?: Json
          last_computed_at?: string | null
          profile_confidence?: number | null
          search_patterns?: Json
          updated_at?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      user_contact_links_audit: {
        Row: {
          action: string
          contact_id: string | null
          created_at: string | null
          id: string
          link_method: string | null
          linked_by: string | null
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          contact_id?: string | null
          created_at?: string | null
          id?: string
          link_method?: string | null
          linked_by?: string | null
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          contact_id?: string | null
          created_at?: string | null
          id?: string
          link_method?: string | null
          linked_by?: string | null
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_contact_links_audit_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_credits: {
        Row: {
          balance: number | null
          created_at: string | null
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          balance?: number | null
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          balance?: number | null
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_follows: {
        Row: {
          created_at: string | null
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string | null
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string | null
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: []
      }
      user_interaction_events: {
        Row: {
          click_position: number | null
          created_at: string | null
          dwell_time_ms: number | null
          event_context: string | null
          event_type: string
          id: string
          interaction_data: Json | null
          page_url: string | null
          recommendation_id: string | null
          referrer: string | null
          result_position: number | null
          scroll_depth: number | null
          search_query: string | null
          session_id: string
          target_category: string | null
          target_id: string | null
          target_type: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          click_position?: number | null
          created_at?: string | null
          dwell_time_ms?: number | null
          event_context?: string | null
          event_type: string
          id?: string
          interaction_data?: Json | null
          page_url?: string | null
          recommendation_id?: string | null
          referrer?: string | null
          result_position?: number | null
          scroll_depth?: number | null
          search_query?: string | null
          session_id: string
          target_category?: string | null
          target_id?: string | null
          target_type?: string | null
          user_id: string
          workspace_id?: string
        }
        Update: {
          click_position?: number | null
          created_at?: string | null
          dwell_time_ms?: number | null
          event_context?: string | null
          event_type?: string
          id?: string
          interaction_data?: Json | null
          page_url?: string | null
          recommendation_id?: string | null
          referrer?: string | null
          result_position?: number | null
          scroll_depth?: number | null
          search_query?: string | null
          session_id?: string
          target_category?: string | null
          target_id?: string | null
          target_type?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      user_material_interactions: {
        Row: {
          created_at: string | null
          id: string
          interaction_type: string
          interaction_value: number | null
          material_id: string
          metadata: Json | null
          session_id: string | null
          updated_at: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          interaction_type: string
          interaction_value?: number | null
          material_id: string
          metadata?: Json | null
          session_id?: string | null
          updated_at?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          interaction_type?: string
          interaction_value?: number | null
          material_id?: string
          metadata?: Json | null
          session_id?: string | null
          updated_at?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_material_interactions_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_material_interactions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notification_preferences: {
        Row: {
          channel_type: string
          config: Json | null
          created_at: string | null
          id: string
          is_enabled: boolean | null
          notification_type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          channel_type: string
          config?: Json | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          notification_type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          channel_type?: string
          config?: Json | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          notification_type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_notifications: {
        Row: {
          action_url: string | null
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          metadata: Json | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          metadata?: Json | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          metadata?: Json | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          created_at: string | null
          id: string
          preferences: Json
          updated_at: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          preferences?: Json
          updated_at?: string | null
          user_id: string
          workspace_id?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          preferences?: Json
          updated_at?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          address: string | null
          avatar_url: string | null
          bio: string | null
          booking_enabled: boolean | null
          company: string | null
          created_at: string | null
          credits_balance: number
          email: string | null
          factory_claimed_name: string | null
          factory_verified: boolean | null
          featured_moodboard_id: string | null
          full_name: string | null
          id: string
          is_public: boolean | null
          location: string | null
          location_country_code: string | null
          monthly_credits_granted: boolean | null
          phone: string | null
          preferred_factories: Json | null
          professional_type:
            | Database["public"]["Enums"]["professional_type"]
            | null
          profile_views: number | null
          role_id: string
          services: string[] | null
          services_detail: Json | null
          skill_tags: string[] | null
          status: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_current_period_end: string | null
          subscription_status: string | null
          subscription_tier: string | null
          updated_at: string | null
          user_id: string
          website_url: string | null
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          bio?: string | null
          booking_enabled?: boolean | null
          company?: string | null
          created_at?: string | null
          credits_balance?: number
          email?: string | null
          factory_claimed_name?: string | null
          factory_verified?: boolean | null
          featured_moodboard_id?: string | null
          full_name?: string | null
          id?: string
          is_public?: boolean | null
          location?: string | null
          location_country_code?: string | null
          monthly_credits_granted?: boolean | null
          phone?: string | null
          preferred_factories?: Json | null
          professional_type?:
            | Database["public"]["Enums"]["professional_type"]
            | null
          profile_views?: number | null
          role_id: string
          services?: string[] | null
          services_detail?: Json | null
          skill_tags?: string[] | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_current_period_end?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          updated_at?: string | null
          user_id: string
          website_url?: string | null
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          bio?: string | null
          booking_enabled?: boolean | null
          company?: string | null
          created_at?: string | null
          credits_balance?: number
          email?: string | null
          factory_claimed_name?: string | null
          factory_verified?: boolean | null
          featured_moodboard_id?: string | null
          full_name?: string | null
          id?: string
          is_public?: boolean | null
          location?: string | null
          location_country_code?: string | null
          monthly_credits_granted?: boolean | null
          phone?: string | null
          preferred_factories?: Json | null
          professional_type?:
            | Database["public"]["Enums"]["professional_type"]
            | null
          profile_views?: number | null
          role_id?: string
          services?: string[] | null
          services_detail?: Json | null
          skill_tags?: string[] | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_current_period_end?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          updated_at?: string | null
          user_id?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_featured_moodboard_id_fkey"
            columns: ["featured_moodboard_id"]
            isOneToOne: false
            referencedRelation: "moodboards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profiles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_subscriptions: {
        Row: {
          cancel_at: string | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_id: string
          status: string | null
          stripe_subscription_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id: string
          status?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string
          status?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      validation_results: {
        Row: {
          chunk_id: string
          created_at: string
          details: Json | null
          id: string
          issues: Json | null
          message: string | null
          passed: boolean
          rule_id: string
          severity: string
          updated_at: string
          validated_at: string
          workspace_id: string | null
        }
        Insert: {
          chunk_id: string
          created_at?: string
          details?: Json | null
          id?: string
          issues?: Json | null
          message?: string | null
          passed: boolean
          rule_id: string
          severity: string
          updated_at?: string
          validated_at?: string
          workspace_id?: string | null
        }
        Update: {
          chunk_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          issues?: Json | null
          message?: string | null
          passed?: boolean
          rule_id?: string
          severity?: string
          updated_at?: string
          validated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "validation_results_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "document_chunks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "validation_results_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "validation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      validation_rules: {
        Row: {
          auto_fix: boolean | null
          created_at: string
          created_by: string | null
          fix_action: string | null
          id: string
          is_active: boolean
          priority: number
          rule_definition: Json
          rule_description: string | null
          rule_name: string
          rule_type: string
          severity: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          auto_fix?: boolean | null
          created_at?: string
          created_by?: string | null
          fix_action?: string | null
          id?: string
          is_active?: boolean
          priority?: number
          rule_definition: Json
          rule_description?: string | null
          rule_name: string
          rule_type: string
          severity?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          auto_fix?: boolean | null
          created_at?: string
          created_by?: string | null
          fix_action?: string | null
          id?: string
          is_active?: boolean
          priority?: number
          rule_definition?: Json
          rule_description?: string | null
          rule_name?: string
          rule_type?: string
          severity?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      vr_worlds: {
        Row: {
          caption: string | null
          collider_glb_url: string | null
          completed_at: string | null
          created_at: string | null
          credits_charged: number | null
          display_name: string | null
          error_message: string | null
          id: string
          metadata: Json | null
          model: string | null
          operation_id: string | null
          panorama_url: string | null
          source_image_url: string
          source_prompt: string | null
          splat_url_100k: string | null
          splat_url_500k: string | null
          splat_url_full: string | null
          status: string | null
          thumbnail_url: string | null
          updated_at: string | null
          user_id: string | null
          workspace_id: string | null
          world_id: string | null
        }
        Insert: {
          caption?: string | null
          collider_glb_url?: string | null
          completed_at?: string | null
          created_at?: string | null
          credits_charged?: number | null
          display_name?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          model?: string | null
          operation_id?: string | null
          panorama_url?: string | null
          source_image_url: string
          source_prompt?: string | null
          splat_url_100k?: string | null
          splat_url_500k?: string | null
          splat_url_full?: string | null
          status?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
          user_id?: string | null
          workspace_id?: string | null
          world_id?: string | null
        }
        Update: {
          caption?: string | null
          collider_glb_url?: string | null
          completed_at?: string | null
          created_at?: string | null
          credits_charged?: number | null
          display_name?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          model?: string | null
          operation_id?: string | null
          panorama_url?: string | null
          source_image_url?: string
          source_prompt?: string | null
          splat_url_100k?: string | null
          splat_url_500k?: string | null
          splat_url_full?: string | null
          status?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
          user_id?: string | null
          workspace_id?: string | null
          world_id?: string | null
        }
        Relationships: []
      }
      webhook_calls: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_details: Json | null
          error_message: string | null
          id: string
          max_retries: number | null
          metadata: Json | null
          next_retry_at: string | null
          request_headers: Json | null
          request_payload: Json
          response_body: Json | null
          response_headers: Json | null
          response_status: number | null
          response_time_ms: number | null
          retry_count: number | null
          source_id: string
          source_type: string
          started_at: string | null
          status: string | null
          webhook_method: string | null
          webhook_url: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_details?: Json | null
          error_message?: string | null
          id?: string
          max_retries?: number | null
          metadata?: Json | null
          next_retry_at?: string | null
          request_headers?: Json | null
          request_payload: Json
          response_body?: Json | null
          response_headers?: Json | null
          response_status?: number | null
          response_time_ms?: number | null
          retry_count?: number | null
          source_id: string
          source_type: string
          started_at?: string | null
          status?: string | null
          webhook_method?: string | null
          webhook_url: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_details?: Json | null
          error_message?: string | null
          id?: string
          max_retries?: number | null
          metadata?: Json | null
          next_retry_at?: string | null
          request_headers?: Json | null
          request_payload?: Json
          response_body?: Json | null
          response_headers?: Json | null
          response_status?: number | null
          response_time_ms?: number | null
          retry_count?: number | null
          source_id?: string
          source_type?: string
          started_at?: string | null
          status?: string | null
          webhook_method?: string | null
          webhook_url?: string
        }
        Relationships: []
      }
      webhook_endpoints: {
        Row: {
          created_at: string | null
          events: string[] | null
          failure_count: number | null
          headers: Json | null
          id: string
          is_active: boolean | null
          last_failure_at: string | null
          last_success_at: string | null
          name: string
          retry_config: Json | null
          secret: string | null
          updated_at: string | null
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          events?: string[] | null
          failure_count?: number | null
          headers?: Json | null
          id?: string
          is_active?: boolean | null
          last_failure_at?: string | null
          last_success_at?: string | null
          name: string
          retry_config?: Json | null
          secret?: string | null
          updated_at?: string | null
          url: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          events?: string[] | null
          failure_count?: number | null
          headers?: Json | null
          id?: string
          is_active?: boolean | null
          last_failure_at?: string | null
          last_success_at?: string | null
          name?: string
          retry_config?: Json | null
          secret?: string | null
          updated_at?: string | null
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          id: string
          joined_at: string | null
          permissions: Json | null
          role: string
          status: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          id?: string
          joined_at?: string | null
          permissions?: Json | null
          role?: string
          status?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          id?: string
          joined_at?: string | null
          permissions?: Json | null
          role?: string
          status?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_permissions: {
        Row: {
          expires_at: string | null
          granted_at: string | null
          granted_by: string | null
          id: string
          is_active: boolean | null
          permissions: Json | null
          role: string
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          expires_at?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          is_active?: boolean | null
          permissions?: Json | null
          role?: string
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          expires_at?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          is_active?: boolean | null
          permissions?: Json | null
          role?: string
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      workspaces: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          name: string
          settings: Json | null
          slug: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          settings?: Json | null
          slug: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          settings?: Json | null
          slug?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      xml_mapping_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          field_mappings: Json
          id: string
          last_used_at: string | null
          mapping_confidence: Json | null
          sample_structure: Json | null
          template_name: string
          updated_at: string | null
          usage_count: number | null
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          field_mappings: Json
          id?: string
          last_used_at?: string | null
          mapping_confidence?: Json | null
          sample_structure?: Json | null
          template_name: string
          updated_at?: string | null
          usage_count?: number | null
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          field_mappings?: Json
          id?: string
          last_used_at?: string | null
          mapping_confidence?: Json | null
          sample_structure?: Json | null
          template_name?: string
          updated_at?: string | null
          usage_count?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "xml_mapping_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      material_demand_analytics: {
        Row: {
          avg_confidence: number | null
          example_queries: Json | null
          first_requested: string | null
          last_requested: string | null
          material_category: string | null
          material_name: string | null
          mention_count: number | null
          times_added_to_moodboard: number | null
          times_saved: number | null
          times_used_in_3d: number | null
          unique_users_requesting: number | null
        }
        Relationships: []
      }
      popular_searches: {
        Row: {
          all_material_mentions: Json | null
          avg_results: number | null
          last_searched: string | null
          query_text: string | null
          search_count: number | null
          times_added_to_moodboard: number | null
          times_saved: number | null
          unique_users: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_approve_factory_registration: {
        Args: { p_request_id: string; p_reviewer_id: string }
        Returns: undefined
      }
      admin_reject_factory_registration: {
        Args: { p_reason?: string; p_request_id: string; p_reviewer_id: string }
        Returns: undefined
      }
      analyze_mivaa_tables: { Args: never; Returns: string }
      append_recovery_history: {
        Args: { p_event: Json; p_job_id: string }
        Returns: undefined
      }
      append_stage_history: {
        Args: { p_event: Json; p_job_id: string }
        Returns: undefined
      }
      auto_adjust_vector_index_lists: { Args: never; Returns: undefined }
      backfill_factory_from_document_filename: { Args: never; Returns: number }
      backfill_pending_kb_embeddings: {
        Args: { limit_rows?: number }
        Returns: number
      }
      calculate_generation_cost: { Args: { p_job_id: string }; Returns: number }
      calculate_layout_stats: { Args: { p_product_id: string }; Returns: Json }
      calculate_price_change: {
        Args: { p_new_price: number; p_old_price: number }
        Returns: number
      }
      calculate_search_relevance: {
        Args: {
          engagement_score: number
          exec_count: number
          last_exec: string
        }
        Returns: number
      }
      calculate_trending_searches: {
        Args: { p_limit?: number; p_time_window?: string }
        Returns: {
          growth_rate: number
          query_text: string
          search_count: number
          trend_score: number
          unique_users: number
        }[]
      }
      cleanup_expired_similarity_cache: { Args: never; Returns: number }
      cleanup_invalid_stage_history: {
        Args: { p_invalid_stages: string[]; p_job_id: string }
        Returns: undefined
      }
      cleanup_old_import_jobs: {
        Args: {
          agent_log_retention_days?: number
          retention_days?: number
          webhook_success_retention_days?: number
        }
        Returns: {
          rows_deleted: number
          table_name: string
        }[]
      }
      cleanup_old_mivaa_api_logs: {
        Args: { days_to_keep?: number }
        Returns: number
      }
      cosine_similarity_workspace: {
        Args: {
          max_results?: number
          query_embedding: string
          similarity_threshold?: number
          target_workspace_id: string
        }
        Returns: {
          chunk_id: string
          chunk_text: string
          document_id: string
          page_number: number
          similarity_score: number
        }[]
      }
      count_embeddings_by_type: {
        Args: { p_workspace_id: string }
        Returns: {
          embedding_type: string
          percentage: number
          total_count: number
          with_embedding: number
        }[]
      }
      count_vecs_embeddings:
        | {
            Args: { p_workspace_id: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.count_vecs_embeddings(p_workspace_id => text), public.count_vecs_embeddings(p_workspace_id => uuid). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { p_workspace_id: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.count_vecs_embeddings(p_workspace_id => text), public.count_vecs_embeddings(p_workspace_id => uuid). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      current_workspace_context: {
        Args: never
        Returns: {
          is_member: boolean
          user_role: string
          workspace_id: string
        }[]
      }
      debit_user_credits: {
        Args: {
          p_amount: number
          p_description?: string
          p_metadata?: Json
          p_operation_type: string
          p_user_id: string
        }
        Returns: {
          error_message: string
          new_balance: number
          success: boolean
          transaction_id: string
        }[]
      }
      deduct_generation_credits: { Args: { p_job_id: string }; Returns: Json }
      detect_stuck_pdf_jobs: {
        Args: { max_attempts?: number; stuck_threshold_seconds?: number }
        Returns: {
          document_id: string
          filename: string
          id: string
          last_heartbeat: string
          last_recovery_at: string
          recovery_attempts: number
          workspace_id: string
        }[]
      }
      embedding_performance_stats: {
        Args: never
        Returns: {
          estimated_rows: number
          index_name: string
          index_size: string
          table_name: string
          table_size: string
        }[]
      }
      enhanced_vector_search_with_chunks: {
        Args: {
          include_chunks?: boolean
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          content: string
          id: string
          metadata: Json
          similarity: number
          source_type: string
        }[]
      }
      expire_old_quotes: { Args: never; Returns: number }
      extract_material_mentions: { Args: { query_text: string }; Returns: Json }
      fail_exhausted_pdf_jobs: {
        Args: { p_max_attempts?: number; stuck_threshold_seconds?: number }
        Returns: number
      }
      fail_import_job: {
        Args: {
          p_error_details?: Json
          p_error_message: string
          p_job_id: string
        }
        Returns: undefined
      }
      find_complementary_products: {
        Args: { match_count?: number; source_product_id: string }
        Returns: {
          match_source: string
          product_id: string
          relationship_label: string
          similarity: number
        }[]
      }
      find_similar_documents: {
        Args: {
          max_results?: number
          similarity_threshold?: number
          source_document_id: string
          target_workspace_id: string
        }
        Returns: {
          avg_similarity: number
          document_id: string
          document_name: string
          matching_chunks: number
        }[]
      }
      find_similar_products: {
        Args: { match_count?: number; source_product_id: string }
        Returns: {
          match_source: string
          product_id: string
          similarity: number
        }[]
      }
      find_similar_searches: {
        Args: { p_limit?: number; p_search_id: string }
        Returns: {
          id: string
          material_filters: Json
          name: string
          query: string
          search_strategy: string
          similarity_score: number
          use_count: number
        }[]
      }
      fix_image_associations: {
        Args: never
        Returns: {
          chunk_id: string
          document_id: string
          images_associated: number
          page_number: number
        }[]
      }
      get_cron_job_status: {
        Args: never
        Returns: {
          active: boolean
          failures_24h: number
          jobid: number
          jobname: string
          last_run_duration_ms: number
          last_run_message: string
          last_run_started_at: string
          last_run_status: string
          runs_24h: number
          schedule: string
        }[]
      }
      get_cron_run_history: {
        Args: { p_jobname: string; p_limit?: number }
        Returns: {
          duration_ms: number
          end_time: string
          return_message: string
          runid: number
          start_time: string
          status: string
        }[]
      }
      get_current_user_roles: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      get_distinct_factory_names: {
        Args: never
        Returns: {
          name: string
          source: string
        }[]
      }
      get_extraction_stats: {
        Args: { p_document_id?: string; p_workspace_id?: string }
        Returns: {
          avg_confidence: number
          extraction_method: string
          max_confidence: number
          min_confidence: number
          total_images: number
        }[]
      }
      get_hybrid_search_results: {
        Args: {
          result_limit?: number
          similarity_threshold?: number
          text_embedding: string
          text_weight?: number
          visual_embedding?: string
          visual_weight?: number
        }
        Returns: {
          combined_score: number
          material_category: string
          material_id: string
          material_name: string
          text_similarity: number
          visual_similarity: number
        }[]
      }
      get_images_by_product: {
        Args: {
          p_min_confidence?: number
          p_product_name: string
          p_workspace_id?: string
        }
        Returns: {
          bbox: Json
          created_at: string
          detection_confidence: number
          document_id: string
          id: string
          image_url: string
          page_number: number
          vision_model: string
        }[]
      }
      get_import_job_stats: {
        Args: { p_workspace_id: string }
        Returns: {
          completed_jobs: number
          failed_jobs: number
          pending_jobs: number
          processing_jobs: number
          total_jobs: number
          total_products_failed: number
          total_products_imported: number
        }[]
      }
      get_internal_tracked_queries_due: {
        Args: never
        Returns: {
          id: string
          product_id: string
        }[]
      }
      get_job_product_progress: {
        Args: { p_job_id: string }
        Returns: {
          chunks_created: number
          clip_embeddings_generated: number
          completed_at: string
          current_stage: string
          error_message: string
          images_material: number
          images_non_material: number
          images_processed: number
          pages_extracted: number
          processing_time_ms: number
          product_id: string
          product_index: number
          product_name: string
          relationships_created: number
          stages_completed: string[]
          started_at: string
          status: string
        }[]
      }
      get_latest_price: {
        Args: { p_product_id: string; p_source_name: string }
        Returns: {
          availability: string
          currency: string
          price: number
          scraped_at: string
        }[]
      }
      get_mivaa_service_health_summary: {
        Args: never
        Returns: {
          avg_response_time: number
          latest_check: string
          service_name: string
          success_rate: number
        }[]
      }
      get_model_pricing: {
        Args: { p_model_key: string }
        Returns: {
          billing_type: string
          cost_per_gen: number
          hourly_rate: number
          input_price: number
          markup: number
          model_key: string
          output_price: number
        }[]
      }
      get_next_pending_chunk: {
        Args: { session_id_param: string }
        Returns: {
          chunk_id: string
          chunk_index: number
          total_count: number
          urls: Json
        }[]
      }
      get_popular_searches: {
        Args: { p_days?: number; p_limit?: number; p_query_filter?: string }
        Returns: {
          avg_results: number
          last_searched: string
          query_text: string
          search_count: number
          unique_users: number
        }[]
      }
      get_price_statistics: {
        Args: { p_days?: number; p_product_id: string }
        Returns: {
          avg_price: number
          current_price: number
          max_price: number
          min_price: number
          price_trend: string
          total_sources: number
        }[]
      }
      get_product_categories: {
        Args: { p_workspace_id: string }
        Returns: {
          category: string
          product_count: number
        }[]
      }
      get_product_embedding_status: {
        Args: { p_product_id: string }
        Returns: Json
      }
      get_product_processing_summary: {
        Args: { p_job_id: string }
        Returns: {
          completed_products: number
          completion_percentage: number
          failed_products: number
          pending_products: number
          processing_products: number
          total_products: number
        }[]
      }
      get_query_cache_stats: { Args: never; Returns: Json }
      get_quote_expiration_days: { Args: never; Returns: number }
      get_rate_limit: {
        Args: {
          endpoint_path: string
          ip_addr: unknown
          user_id_param?: string
        }
        Returns: number
      }
      get_search_performance_stats: {
        Args: { time_interval?: string }
        Returns: Json
      }
      get_search_stats: {
        Args: { time_interval?: string }
        Returns: {
          avgsearchesperuser: number
          moodboardconversionrate: number
          savedsearchrate: number
          topsearchstrategy: string
          totalsearches: number
          uniqueusers: number
        }[]
      }
      get_similar_materials_visual: {
        Args: {
          query_embedding: string
          result_limit?: number
          similarity_threshold?: number
        }
        Returns: {
          material_category: string
          material_id: string
          material_name: string
          similarity_score: number
        }[]
      }
      get_slowest_queries: {
        Args: { max_results?: number; time_interval?: string }
        Returns: {
          cache_hit: boolean
          embedding_generation_ms: number
          enhancement_ms: number
          fulltext_search_ms: number
          query_text: string
          query_understanding_ms: number
          result_count: number
          scoring_ms: number
          timestamp: string
          total_ms: number
          vector_search_ms: number
        }[]
      }
      get_tool_call_stats: {
        Args: { time_interval?: string }
        Returns: {
          avg_duration_ms: number
          failed_calls: number
          p95_duration_ms: number
          success_rate: number
          successful_calls: number
          tool_name: string
          total_calls: number
          zero_result_calls: number
          zero_result_rate: number
        }[]
      }
      get_top_cached_queries: {
        Args: { max_results?: number }
        Returns: {
          created_at: string
          hit_count: number
          is_product_name: boolean
          last_hit_at: string
          model_used: string
          parse_latency_ms: number
          query_text: string
          total_ms_saved: number
        }[]
      }
      get_user_mivaa_processing_stats: {
        Args: { target_user_id: string }
        Returns: {
          avg_processing_time_ms: number
          failed_processed: number
          successful_processed: number
          total_processed: number
          total_rag_documents: number
        }[]
      }
      get_user_role: { Args: never; Returns: string }
      get_user_workspaces: {
        Args: { user_id: string }
        Returns: {
          workspace_id: string
        }[]
      }
      get_users_for_daily_digest: {
        Args: never
        Returns: {
          search_count: number
          top_searches: Json
          user_email: string
          user_id: string
        }[]
      }
      get_vector_index_recommendations: {
        Args: never
        Returns: {
          current_rows: number
          embedding_columns: number
          index_count: number
          recommendation: string
          tbl_name: string
        }[]
      }
      get_workspace_document_stats: {
        Args: { target_workspace_id: string }
        Returns: {
          avg_chunks_per_document: number
          embedding_coverage: number
          processed_documents: number
          total_chunks: number
          total_documents: number
          total_images: number
        }[]
      }
      get_workspace_id: { Args: never; Returns: string }
      get_zero_result_queries: {
        Args: { max_results?: number; time_interval?: string }
        Returns: {
          last_seen: string
          occurrences: number
          query_text: string
          unique_users: number
        }[]
      }
      grant_credits: {
        Args: {
          p_amount: number
          p_description?: string
          p_metadata?: Json
          p_stripe_invoice_id?: string
          p_stripe_payment_intent_id?: string
          p_transaction_type: string
          p_user_id: string
        }
        Returns: {
          error_message: string
          new_balance: number
          success: boolean
          transaction_id: string
        }[]
      }
      has_price_monitoring_access: { Args: never; Returns: boolean }
      has_role:
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
        | { Args: { _role: string; _user_id: string }; Returns: boolean }
      has_workspace_permission: {
        Args: { permission: string; workspace_id: string }
        Returns: boolean
      }
      hybrid_search_workspace: {
        Args: {
          keyword_weight?: number
          max_results?: number
          query_embedding: string
          query_text: string
          semantic_weight?: number
          similarity_threshold?: number
          target_workspace_id: string
        }
        Returns: {
          chunk_id: string
          chunk_text: string
          combined_score: number
          document_id: string
          keyword_score: number
          page_number: number
          semantic_score: number
        }[]
      }
      increment_flow_run_stats: {
        Args: { p_flow_id: string }
        Returns: undefined
      }
      increment_job_cost: {
        Args: { p_cost_usd: number; p_credits: number; p_job_id: string }
        Returns: undefined
      }
      increment_kb_doc_agent_mention: {
        Args: { doc_id: string }
        Returns: undefined
      }
      increment_kb_doc_view: { Args: { doc_id: string }; Returns: undefined }
      increment_message_count: {
        Args: { conversation_id: string }
        Returns: number
      }
      increment_moodboard_views: {
        Args: { p_moodboard_id: string }
        Returns: undefined
      }
      increment_product_usage: {
        Args: { p_product_id: string; p_usage_type: string }
        Returns: undefined
      }
      increment_profile_views: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      increment_template_usage: {
        Args: { template_id: string }
        Returns: undefined
      }
      initialize_generation_workflow: {
        Args: {
          p_input_images?: Json
          p_models_queue: Json
          p_prompt: string
          p_request_type: string
          p_session_id: string
          p_style_preferences?: Json
          p_user_id: string
        }
        Returns: string
      }
      is_admin: { Args: never; Returns: boolean }
      is_internal_ip: { Args: { ip_addr: unknown }; Returns: boolean }
      is_workspace_member: { Args: { workspace_id: string }; Returns: boolean }
      is_workspace_owner: {
        Args: { user_id: string; workspace_id: string }
        Returns: boolean
      }
      kb_match_docs: {
        Args: {
          allowed_access_levels?: string[]
          match_category_id?: string
          match_category_slug?: string
          match_count?: number
          match_price_doc_type?: string
          match_threshold?: number
          match_workspace_id: string
          query_embedding: string
          require_published?: boolean
        }
        Returns: {
          category_id: string
          category_name: string
          category_slug: string
          content: string
          created_at: string
          created_by: string
          embedding_generated_at: string
          embedding_status: string
          id: string
          price_doc_type: string
          similarity: number
          status: string
          summary: string
          title: string
          updated_at: string
          view_count: number
          visibility: string
          workspace_id: string
        }[]
      }
      kb_search_docs: {
        Args: {
          allowed_access_levels?: string[]
          match_category_id?: string
          match_category_slug?: string
          match_price_doc_type?: string
          result_limit?: number
          search_query: string
          search_type?: string
          search_workspace_id: string
        }
        Returns: {
          category_id: string
          category_name: string
          category_slug: string
          content: string
          created_at: string
          created_by: string
          embedding_generated_at: string
          embedding_status: string
          id: string
          price_doc_type: string
          status: string
          summary: string
          title: string
          updated_at: string
          view_count: number
          visibility: string
          workspace_id: string
        }[]
      }
      log_agent_usage: {
        Args: {
          p_agent_type?: string
          p_conversation_id?: string
          p_input_tokens?: number
          p_latency_ms?: number
          p_metadata?: Json
          p_model_name?: string
          p_output_tokens?: number
          p_tools_called?: Json
          p_turn_number?: number
          p_user_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      mark_pdf_job_for_recovery: {
        Args: { p_job_id: string; p_max_attempts?: number }
        Returns: boolean
      }
      mark_recommendations_sent: {
        Args: { p_search_ids: string[]; p_user_id: string }
        Returns: number
      }
      match_document_chunks_semantic: {
        Args: {
          filter_document_ids?: string[]
          filter_workspace_id?: string
          match_count?: number
          query_embedding: unknown
          similarity_threshold?: number
        }
        Returns: {
          chunk_index: number
          content: string
          document_id: string
          id: string
          metadata: Json
          quality_score: number
          similarity: number
          source_type: string
        }[]
      }
      merge_background_job_metadata: {
        Args: { p_job_id: string; p_metadata: Json }
        Returns: undefined
      }
      merge_import_job_metadata: {
        Args: { p_job_id: string; p_metadata: Json }
        Returns: undefined
      }
      migrate_embeddings_to_1536: { Args: never; Returns: undefined }
      propagate_factory_from_siblings: {
        Args: { doc_id: string }
        Returns: number
      }
      purge_expired_classifier_verdicts: { Args: never; Returns: number }
      record_webhook_call: {
        Args: {
          p_metadata?: Json
          p_request_payload: Json
          p_source_id: string
          p_source_type: string
          p_webhook_url: string
        }
        Returns: string
      }
      recover_stale_jobs: { Args: never; Returns: number }
      refresh_search_analytics_views: { Args: never; Returns: undefined }
      search_chunks_by_embedding: {
        Args: {
          p_limit?: number
          p_workspace_id: string
          query_embedding: string
        }
        Returns: {
          chunk_id: string
          content: string
          document_id: string
          similarity_score: number
        }[]
      }
      search_document_chunks_fts: {
        Args: {
          result_limit?: number
          search_query: string
          workspace_filter?: string
        }
        Returns: {
          content: string
          id: string
          metadata: Json
          rank: number
        }[]
      }
      search_products_by_embedding: {
        Args: {
          p_limit?: number
          p_workspace_id: string
          query_embedding: string
        }
        Returns: {
          description: string
          name: string
          product_id: string
          similarity_score: number
        }[]
      }
      search_products_fts: {
        Args: {
          result_limit?: number
          search_query: string
          workspace_filter?: string
        }
        Returns: {
          description: string
          id: string
          metadata: Json
          name: string
          rank: number
        }[]
      }
      search_products_fulltext: {
        Args: { p_limit?: number; p_workspace_id: string; search_query: string }
        Returns: {
          description: string
          name: string
          product_id: string
          similarity_score: number
        }[]
      }
      should_trigger_alert: {
        Args: { p_alert_id: string; p_new_price: number; p_old_price: number }
        Returns: boolean
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      text2ltree: { Args: { "": string }; Returns: unknown }
      trim_prompt_history: { Args: { keep_n?: number }; Returns: number }
      update_all_search_relevance_scores: { Args: never; Returns: number }
      update_checkpoint_and_append_history: {
        Args: { p_checkpoint: Json; p_event: Json; p_job_id: string }
        Returns: undefined
      }
      update_import_job_progress: {
        Args: {
          p_failed_products?: number
          p_job_id: string
          p_processed_products: number
        }
        Returns: undefined
      }
      update_model_progress: {
        Args: {
          api_response?: Json
          generation_id: string
          model_error?: Json
          model_name: string
          model_result?: Json
        }
        Returns: undefined
      }
      update_model_result: {
        Args: { p_job_id: string; p_model_id: string; p_model_result: Json }
        Returns: Json
      }
      update_product_layout_stats: {
        Args: { p_product_id: string }
        Returns: undefined
      }
      update_product_status: {
        Args: {
          p_current_stage?: string
          p_error_message?: string
          p_job_id: string
          p_metrics?: Json
          p_product_id: string
          p_status: string
        }
        Returns: undefined
      }
      update_search_engagement: {
        Args: { p_action: string; p_search_id: string }
        Returns: number
      }
      update_session_progress: {
        Args: {
          chunks_completed_param?: number
          current_chunk_id_param?: string
          last_processed_url_param?: string
          session_id_param: string
        }
        Returns: undefined
      }
      update_session_statistics: {
        Args: { session_uuid: string }
        Returns: undefined
      }
      update_tracked_query_cadence: {
        Args: { p_max_pct_change: number; p_tracked_query_id: string }
        Returns: undefined
      }
      update_webhook_call_result: {
        Args: {
          p_error_message?: string
          p_response_body?: Json
          p_response_status: number
          p_response_time_ms?: number
          p_webhook_id: string
        }
        Returns: undefined
      }
      upsert_kb_doc: {
        Args: {
          p_content: string
          p_content_markdown?: string
          p_metadata: Json
          p_status?: string
          p_summary?: string
          p_title: string
          p_visibility?: string
          p_workspace_id: string
        }
        Returns: string
      }
      upsert_unmatched_term: {
        Args: { p_property_key: string; p_term: string; p_workspace_id: string }
        Returns: undefined
      }
      validate_embedding_dimensions:
        | {
            Args: never
            Returns: {
              column_name: string
              dimension_count: number
              null_count: number
              row_count: number
              table_name: string
            }[]
          }
        | { Args: { embedding_vector: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "analyst" | "factory"
      appointment_status: "pending" | "confirmed" | "cancelled" | "completed"
      automation_flow_status: "draft" | "active" | "paused" | "archived"
      automation_run_status:
        | "pending"
        | "running"
        | "completed"
        | "failed"
        | "cancelled"
        | "timed_out"
      automation_step_status:
        | "pending"
        | "running"
        | "completed"
        | "skipped"
        | "failed"
      batch_status:
        | "queued"
        | "processing"
        | "completed"
        | "failed"
        | "partial"
        | "cancelled"
      competitor_source_type:
        | "firecrawl_url"
        | "dataforseo_shopping"
        | "claude_web_search"
        | "perplexity_web_search"
        | "marketplace_skroutz"
        | "marketplace_bestprice"
        | "marketplace_shopflix"
        | "idealo"
      crm_note_target_kind: "contact" | "company"
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
        | "ceramic_tile"
        | "porcelain_tile"
        | "natural_stone_tile"
        | "glass_tile"
        | "metal_tile"
        | "concrete_tile"
        | "wood_tile"
        | "stone_tile"
        | "travertine"
        | "marble"
        | "granite"
        | "slate"
        | "limestone"
        | "quartzite"
        | "sandstone"
        | "onyx"
        | "mosaic"
        | "vinyl"
        | "laminate"
        | "carpet"
        | "cork"
        | "bamboo"
        | "terrazzo"
        | "recycled_glass"
        | "acrylic"
        | "corian"
        | "quartz"
        | "granite_composite"
        | "marble_composite"
        | "travertine_composite"
        | "limestone_composite"
        | "quartzite_composite"
        | "sandstone_composite"
        | "onyx_composite"
        | "slate_composite"
        | "glass_composite"
        | "metal_composite"
        | "concrete_composite"
        | "wood_composite"
        | "vinyl_composite"
        | "laminate_composite"
        | "carpet_composite"
        | "rubber_composite"
        | "cork_composite"
        | "bamboo_composite"
        | "terrazzo_composite"
        | "recycled_glass_composite"
        | "acrylic_composite"
        | "corian_composite"
      pdf_extraction_type: "markdown" | "tables" | "images" | "all"
      priority_level: "low" | "normal" | "high"
      processing_status:
        | "pending"
        | "processing"
        | "completed"
        | "failed"
        | "cancelled"
      professional_type:
        | "architect_designer"
        | "supplier"
        | "sourcing_agent"
        | "consultant"
        | "other"
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
      appointment_status: ["pending", "confirmed", "cancelled", "completed"],
      automation_flow_status: ["draft", "active", "paused", "archived"],
      automation_run_status: [
        "pending",
        "running",
        "completed",
        "failed",
        "cancelled",
        "timed_out",
      ],
      automation_step_status: [
        "pending",
        "running",
        "completed",
        "skipped",
        "failed",
      ],
      batch_status: [
        "queued",
        "processing",
        "completed",
        "failed",
        "partial",
        "cancelled",
      ],
      competitor_source_type: [
        "firecrawl_url",
        "dataforseo_shopping",
        "claude_web_search",
        "perplexity_web_search",
        "marketplace_skroutz",
        "marketplace_bestprice",
        "marketplace_shopflix",
        "idealo",
      ],
      crm_note_target_kind: ["contact", "company"],
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
        "ceramic_tile",
        "porcelain_tile",
        "natural_stone_tile",
        "glass_tile",
        "metal_tile",
        "concrete_tile",
        "wood_tile",
        "stone_tile",
        "travertine",
        "marble",
        "granite",
        "slate",
        "limestone",
        "quartzite",
        "sandstone",
        "onyx",
        "mosaic",
        "vinyl",
        "laminate",
        "carpet",
        "cork",
        "bamboo",
        "terrazzo",
        "recycled_glass",
        "acrylic",
        "corian",
        "quartz",
        "granite_composite",
        "marble_composite",
        "travertine_composite",
        "limestone_composite",
        "quartzite_composite",
        "sandstone_composite",
        "onyx_composite",
        "slate_composite",
        "glass_composite",
        "metal_composite",
        "concrete_composite",
        "wood_composite",
        "vinyl_composite",
        "laminate_composite",
        "carpet_composite",
        "rubber_composite",
        "cork_composite",
        "bamboo_composite",
        "terrazzo_composite",
        "recycled_glass_composite",
        "acrylic_composite",
        "corian_composite",
      ],
      pdf_extraction_type: ["markdown", "tables", "images", "all"],
      priority_level: ["low", "normal", "high"],
      processing_status: [
        "pending",
        "processing",
        "completed",
        "failed",
        "cancelled",
      ],
      professional_type: [
        "architect_designer",
        "supplier",
        "sourcing_agent",
        "consultant",
        "other",
      ],
    },
  },
} as const
