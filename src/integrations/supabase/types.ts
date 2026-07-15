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
      aade_lookup_log: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          looked_up_afm: string
          reason: string | null
          requested_by: string | null
          source: string | null
          valid_afm: boolean | null
          workspace_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          looked_up_afm: string
          reason?: string | null
          requested_by?: string | null
          source?: string | null
          valid_afm?: boolean | null
          workspace_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          looked_up_afm?: string
          reason?: string | null
          requested_by?: string | null
          source?: string | null
          valid_afm?: boolean | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aade_lookup_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_artifacts: {
        Row: {
          created_at: string
          id: string
          kind: string
          metadata: Json
          run_id: string
          url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          metadata?: Json
          run_id: string
          url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json
          run_id?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_artifacts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
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
          pinned_at: string | null
          title: string
          toolkits: string[]
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
          pinned_at?: string | null
          title: string
          toolkits?: string[]
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
          pinned_at?: string | null
          title?: string
          toolkits?: string[]
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
      agent_definitions: {
        Row: {
          aliases: string[]
          allowed_tools: string[]
          concurrency_key_template: string | null
          created_at: string
          default_config: Json
          default_credit_cost: number
          display_name: string | null
          edge_function_name: string | null
          execution_kind: string
          id: string
          is_orchestrator: boolean
          max_run_cost_usd: number | null
          max_wall_clock_seconds: number | null
          prompt_category: string | null
          resumable: boolean
          sandbox_image_ref: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          allowed_tools?: string[]
          concurrency_key_template?: string | null
          created_at?: string
          default_config?: Json
          default_credit_cost?: number
          display_name?: string | null
          edge_function_name?: string | null
          execution_kind: string
          id?: string
          is_orchestrator?: boolean
          max_run_cost_usd?: number | null
          max_wall_clock_seconds?: number | null
          prompt_category?: string | null
          resumable?: boolean
          sandbox_image_ref?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          allowed_tools?: string[]
          concurrency_key_template?: string | null
          created_at?: string
          default_config?: Json
          default_credit_cost?: number
          display_name?: string | null
          edge_function_name?: string | null
          execution_kind?: string
          id?: string
          is_orchestrator?: boolean
          max_run_cost_usd?: number | null
          max_wall_clock_seconds?: number | null
          prompt_category?: string | null
          resumable?: boolean
          sandbox_image_ref?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      agent_inbox_messages: {
        Row: {
          channel: string
          created_at: string
          dispatched_run_id: string | null
          id: string
          raw_payload: Json
          rejected_reason: string | null
        }
        Insert: {
          channel: string
          created_at?: string
          dispatched_run_id?: string | null
          id?: string
          raw_payload?: Json
          rejected_reason?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          dispatched_run_id?: string | null
          id?: string
          raw_payload?: Json
          rejected_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_inbox_messages_dispatched_run_id_fkey"
            columns: ["dispatched_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "agent_memories_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "agent_chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_project_deployments: {
        Row: {
          agent_definition_id: string
          agent_project_id: string
          config_overrides: Json
          created_at: string
          enabled: boolean
          id: string
          secrets_ref: string | null
          updated_at: string
        }
        Insert: {
          agent_definition_id: string
          agent_project_id: string
          config_overrides?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          secrets_ref?: string | null
          updated_at?: string
        }
        Update: {
          agent_definition_id?: string
          agent_project_id?: string
          config_overrides?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          secrets_ref?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_project_deployments_agent_definition_id_fkey"
            columns: ["agent_definition_id"]
            isOneToOne: false
            referencedRelation: "agent_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_project_deployments_agent_project_id_fkey"
            columns: ["agent_project_id"]
            isOneToOne: false
            referencedRelation: "agent_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_project_secrets: {
        Row: {
          agent_project_id: string
          created_at: string
          encrypted_value: string
          id: string
          key: string
          updated_at: string
        }
        Insert: {
          agent_project_id: string
          created_at?: string
          encrypted_value: string
          id?: string
          key: string
          updated_at?: string
        }
        Update: {
          agent_project_id?: string
          created_at?: string
          encrypted_value?: string
          id?: string
          key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_project_secrets_agent_project_id_fkey"
            columns: ["agent_project_id"]
            isOneToOne: false
            referencedRelation: "agent_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_project_snapshots: {
        Row: {
          agent_project_id: string
          base_branch: string | null
          base_commit_sha: string | null
          built_at: string | null
          created_at: string
          id: string
          last_used_at: string | null
          lockfile_hashes: Json
          sandbox_image_ref: string | null
          sandbox_snapshot_ref: string | null
          size_mb: number | null
          status: string
        }
        Insert: {
          agent_project_id: string
          base_branch?: string | null
          base_commit_sha?: string | null
          built_at?: string | null
          created_at?: string
          id?: string
          last_used_at?: string | null
          lockfile_hashes?: Json
          sandbox_image_ref?: string | null
          sandbox_snapshot_ref?: string | null
          size_mb?: number | null
          status?: string
        }
        Update: {
          agent_project_id?: string
          base_branch?: string | null
          base_commit_sha?: string | null
          built_at?: string | null
          created_at?: string
          id?: string
          last_used_at?: string | null
          lockfile_hashes?: Json
          sandbox_image_ref?: string | null
          sandbox_snapshot_ref?: string | null
          size_mb?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_project_snapshots_agent_project_id_fkey"
            columns: ["agent_project_id"]
            isOneToOne: false
            referencedRelation: "agent_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_projects: {
        Row: {
          authorized_emails: string[]
          authorized_phone_numbers: string[]
          created_at: string
          daily_budget_usd: number | null
          daily_container_minutes: number | null
          default_branch: string
          default_dry_run: boolean
          deleted_at: string | null
          github_org: string
          github_repo: string
          id: string
          life_platform_webhook_url: string | null
          name: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          authorized_emails?: string[]
          authorized_phone_numbers?: string[]
          created_at?: string
          daily_budget_usd?: number | null
          daily_container_minutes?: number | null
          default_branch?: string
          default_dry_run?: boolean
          deleted_at?: string | null
          github_org: string
          github_repo: string
          id?: string
          life_platform_webhook_url?: string | null
          name: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          authorized_emails?: string[]
          authorized_phone_numbers?: string[]
          created_at?: string
          daily_budget_usd?: number | null
          daily_container_minutes?: number | null
          default_branch?: string
          default_dry_run?: boolean
          deleted_at?: string | null
          github_org?: string
          github_repo?: string
          id?: string
          life_platform_webhook_url?: string | null
          name?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      agent_run_logs: {
        Row: {
          created_at: string
          data: Json | null
          event_type: string | null
          id: string
          level: string
          message: string
          run_id: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          event_type?: string | null
          id?: string
          level?: string
          message: string
          run_id: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          event_type?: string | null
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
          agent_project_id: string | null
          completed_at: string | null
          conversation_state: Json | null
          created_at: string
          credits_debited: number
          delegated_to_python: boolean
          duration_ms: number | null
          error_message: string | null
          github_pr_url: string | null
          id: string
          idempotency_key: string | null
          initiated_by_user: string | null
          input_data: Json
          input_tokens: number
          last_heartbeat: string | null
          last_pushed_sha: string | null
          last_recovery_at: string | null
          model_used: string | null
          output_data: Json | null
          output_tokens: number
          parent_run_id: string | null
          python_job_id: string | null
          recovery_attempts: number
          runtime_confirmed_at: string | null
          sandbox_id: string | null
          snapshot_id: string | null
          started_at: string | null
          status: string
          total_cost_usd: number
          trigger_channel: string | null
          trigger_event_type: string | null
          trigger_metadata: Json
          triggered_by: string
          workspace_id: string | null
        }
        Insert: {
          agent_id: string
          agent_project_id?: string | null
          completed_at?: string | null
          conversation_state?: Json | null
          created_at?: string
          credits_debited?: number
          delegated_to_python?: boolean
          duration_ms?: number | null
          error_message?: string | null
          github_pr_url?: string | null
          id?: string
          idempotency_key?: string | null
          initiated_by_user?: string | null
          input_data?: Json
          input_tokens?: number
          last_heartbeat?: string | null
          last_pushed_sha?: string | null
          last_recovery_at?: string | null
          model_used?: string | null
          output_data?: Json | null
          output_tokens?: number
          parent_run_id?: string | null
          python_job_id?: string | null
          recovery_attempts?: number
          runtime_confirmed_at?: string | null
          sandbox_id?: string | null
          snapshot_id?: string | null
          started_at?: string | null
          status?: string
          total_cost_usd?: number
          trigger_channel?: string | null
          trigger_event_type?: string | null
          trigger_metadata?: Json
          triggered_by?: string
          workspace_id?: string | null
        }
        Update: {
          agent_id?: string
          agent_project_id?: string | null
          completed_at?: string | null
          conversation_state?: Json | null
          created_at?: string
          credits_debited?: number
          delegated_to_python?: boolean
          duration_ms?: number | null
          error_message?: string | null
          github_pr_url?: string | null
          id?: string
          idempotency_key?: string | null
          initiated_by_user?: string | null
          input_data?: Json
          input_tokens?: number
          last_heartbeat?: string | null
          last_pushed_sha?: string | null
          last_recovery_at?: string | null
          model_used?: string | null
          output_data?: Json | null
          output_tokens?: number
          parent_run_id?: string | null
          python_job_id?: string | null
          recovery_attempts?: number
          runtime_confirmed_at?: string | null
          sandbox_id?: string | null
          snapshot_id?: string | null
          started_at?: string | null
          status?: string
          total_cost_usd?: number
          trigger_channel?: string | null
          trigger_event_type?: string | null
          trigger_metadata?: Json
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
            foreignKeyName: "agent_runs_agent_project_id_fkey"
            columns: ["agent_project_id"]
            isOneToOne: false
            referencedRelation: "agent_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_parent_run_id_fkey"
            columns: ["parent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "agent_project_snapshots"
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
        Relationships: [
          {
            foreignKeyName: "agent_tool_call_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "agent_chat_conversations"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "agent_usage_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "agent_chat_conversations"
            referencedColumns: ["id"]
          },
        ]
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
          failure_summary: Json | null
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
          failure_summary?: Json | null
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
          failure_summary?: Json | null
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
      blueprint_items: {
        Row: {
          allowance_amount: number | null
          blueprint_id: string
          created_at: string
          default_quantity: number
          id: string
          is_allowance: boolean
          kind: string
          label: string
          labor_rate: number | null
          line_kind: string
          margin_pct: number
          material_cost: number | null
          notes: string | null
          option_group: string | null
          parent_id: string | null
          product_id: string | null
          quantity_formula: string | null
          service_id: string | null
          sort_order: number
          source: string
          sub_blueprint_id: string | null
          tier: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          allowance_amount?: number | null
          blueprint_id: string
          created_at?: string
          default_quantity?: number
          id?: string
          is_allowance?: boolean
          kind?: string
          label: string
          labor_rate?: number | null
          line_kind?: string
          margin_pct?: number
          material_cost?: number | null
          notes?: string | null
          option_group?: string | null
          parent_id?: string | null
          product_id?: string | null
          quantity_formula?: string | null
          service_id?: string | null
          sort_order?: number
          source?: string
          sub_blueprint_id?: string | null
          tier?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          allowance_amount?: number | null
          blueprint_id?: string
          created_at?: string
          default_quantity?: number
          id?: string
          is_allowance?: boolean
          kind?: string
          label?: string
          labor_rate?: number | null
          line_kind?: string
          margin_pct?: number
          material_cost?: number | null
          notes?: string | null
          option_group?: string | null
          parent_id?: string | null
          product_id?: string | null
          quantity_formula?: string | null
          service_id?: string | null
          sort_order?: number
          source?: string
          sub_blueprint_id?: string | null
          tier?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blueprint_items_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "blueprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blueprint_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "blueprint_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blueprint_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blueprint_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blueprint_items_sub_blueprint_id_fkey"
            columns: ["sub_blueprint_id"]
            isOneToOne: false
            referencedRelation: "blueprints"
            referencedColumns: ["id"]
          },
        ]
      }
      blueprints: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          dimensions_schema: Json
          id: string
          is_platform_starter: boolean
          project_type: string | null
          source_currency: string
          status: string
          title: string
          updated_at: string
          version: number
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          dimensions_schema?: Json
          id?: string
          is_platform_starter?: boolean
          project_type?: string | null
          source_currency?: string
          status?: string
          title: string
          updated_at?: string
          version?: number
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          dimensions_schema?: Json
          id?: string
          is_platform_starter?: boolean
          project_type?: string | null
          source_currency?: string
          status?: string
          title?: string
          updated_at?: string
          version?: number
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blueprints_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
          workspace_id: string | null
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
          workspace_id?: string | null
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
          workspace_id?: string | null
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
          {
            foreignKeyName: "campaigns_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
      catalog_access_log: {
        Row: {
          catalog_id: string
          cookie_expires_at: string | null
          cookie_token: string | null
          created_at: string
          email: string
          granted_access: boolean
          id: string
          ip_address: unknown
          matched_crm_company_id: string | null
          matched_crm_contact_id: string | null
          matched_grant_id: string | null
          matched_kind: Database["public"]["Enums"]["catalog_access_match_kind"]
          matched_user_id: string | null
          user_agent: string | null
        }
        Insert: {
          catalog_id: string
          cookie_expires_at?: string | null
          cookie_token?: string | null
          created_at?: string
          email: string
          granted_access: boolean
          id?: string
          ip_address?: unknown
          matched_crm_company_id?: string | null
          matched_crm_contact_id?: string | null
          matched_grant_id?: string | null
          matched_kind: Database["public"]["Enums"]["catalog_access_match_kind"]
          matched_user_id?: string | null
          user_agent?: string | null
        }
        Update: {
          catalog_id?: string
          cookie_expires_at?: string | null
          cookie_token?: string | null
          created_at?: string
          email?: string
          granted_access?: boolean
          id?: string
          ip_address?: unknown
          matched_crm_company_id?: string | null
          matched_crm_contact_id?: string | null
          matched_grant_id?: string | null
          matched_kind?: Database["public"]["Enums"]["catalog_access_match_kind"]
          matched_user_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_access_log_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalog_operations_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_access_log_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "presentation_catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_access_log_matched_crm_company_id_fkey"
            columns: ["matched_crm_company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_access_log_matched_crm_contact_id_fkey"
            columns: ["matched_crm_contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_access_log_matched_grant_id_fkey"
            columns: ["matched_grant_id"]
            isOneToOne: false
            referencedRelation: "catalog_email_grants"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_email_grants: {
        Row: {
          catalog_id: string
          created_at: string
          email: string
          expires_at: string | null
          granted_by: string | null
          id: string
          note: string | null
          revoked_at: string | null
        }
        Insert: {
          catalog_id: string
          created_at?: string
          email: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          note?: string | null
          revoked_at?: string | null
        }
        Update: {
          catalog_id?: string
          created_at?: string
          email?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          note?: string | null
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_email_grants_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalog_operations_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_email_grants_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "presentation_catalogs"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_email_sends: {
        Row: {
          catalog_id: string
          created_at: string
          email_log_id: string | null
          first_downloaded_at: string | null
          first_opened_at: string | null
          id: string
          recipient_crm_company_id: string | null
          recipient_crm_contact_id: string | null
          recipient_email: string
          recipient_member_kind:
            | Database["public"]["Enums"]["crm_category_member_kind"]
            | null
          recipient_user_id: string | null
          resend_message_id: string | null
          send_batch_id: string
          sent_at: string | null
          sent_by: string | null
          source_category_ids: string[]
          source_category_slugs: string[]
          status: Database["public"]["Enums"]["catalog_email_send_status"]
          status_message: string | null
          subject: string
          template_slug: string | null
        }
        Insert: {
          catalog_id: string
          created_at?: string
          email_log_id?: string | null
          first_downloaded_at?: string | null
          first_opened_at?: string | null
          id?: string
          recipient_crm_company_id?: string | null
          recipient_crm_contact_id?: string | null
          recipient_email: string
          recipient_member_kind?:
            | Database["public"]["Enums"]["crm_category_member_kind"]
            | null
          recipient_user_id?: string | null
          resend_message_id?: string | null
          send_batch_id: string
          sent_at?: string | null
          sent_by?: string | null
          source_category_ids?: string[]
          source_category_slugs?: string[]
          status?: Database["public"]["Enums"]["catalog_email_send_status"]
          status_message?: string | null
          subject: string
          template_slug?: string | null
        }
        Update: {
          catalog_id?: string
          created_at?: string
          email_log_id?: string | null
          first_downloaded_at?: string | null
          first_opened_at?: string | null
          id?: string
          recipient_crm_company_id?: string | null
          recipient_crm_contact_id?: string | null
          recipient_email?: string
          recipient_member_kind?:
            | Database["public"]["Enums"]["crm_category_member_kind"]
            | null
          recipient_user_id?: string | null
          resend_message_id?: string | null
          send_batch_id?: string
          sent_at?: string | null
          sent_by?: string | null
          source_category_ids?: string[]
          source_category_slugs?: string[]
          status?: Database["public"]["Enums"]["catalog_email_send_status"]
          status_message?: string | null
          subject?: string
          template_slug?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_email_sends_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalog_operations_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_email_sends_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "presentation_catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_email_sends_recipient_crm_company_id_fkey"
            columns: ["recipient_crm_company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_email_sends_recipient_crm_contact_id_fkey"
            columns: ["recipient_crm_contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_source_pdfs: {
        Row: {
          created_at: string
          file_size_bytes: number | null
          id: string
          manufacturer_name: string | null
          manufacturer_url: string | null
          notes: string | null
          original_filename: string
          page_count: number | null
          page_renders: Json
          status: Database["public"]["Enums"]["catalog_source_pdf_status"]
          status_message: string | null
          storage_path: string
          updated_at: string
          uploaded_by: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          file_size_bytes?: number | null
          id?: string
          manufacturer_name?: string | null
          manufacturer_url?: string | null
          notes?: string | null
          original_filename: string
          page_count?: number | null
          page_renders?: Json
          status?: Database["public"]["Enums"]["catalog_source_pdf_status"]
          status_message?: string | null
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          file_size_bytes?: number | null
          id?: string
          manufacturer_name?: string | null
          manufacturer_url?: string | null
          notes?: string | null
          original_filename?: string
          page_count?: number | null
          page_renders?: Json
          status?: Database["public"]["Enums"]["catalog_source_pdf_status"]
          status_message?: string | null
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_source_pdfs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_templates: {
        Row: {
          accent_color_hex: string | null
          back_cover_image_path: string
          content_background_path: string | null
          cover_image_path: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          accent_color_hex?: string | null
          back_cover_image_path: string
          content_background_path?: string | null
          cover_image_path: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          accent_color_hex?: string | null
          back_cover_image_path?: string
          content_background_path?: string | null
          cover_image_path?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      catalog_view_events: {
        Row: {
          access_log_id: string | null
          catalog_id: string
          cookie_token: string | null
          created_at: string
          email: string | null
          event_type: Database["public"]["Enums"]["catalog_view_event_type"]
          id: string
          ip_address: unknown
          matched_kind:
            | Database["public"]["Enums"]["catalog_access_match_kind"]
            | null
          matched_user_id: string | null
          metadata: Json
          user_agent: string | null
        }
        Insert: {
          access_log_id?: string | null
          catalog_id: string
          cookie_token?: string | null
          created_at?: string
          email?: string | null
          event_type: Database["public"]["Enums"]["catalog_view_event_type"]
          id?: string
          ip_address?: unknown
          matched_kind?:
            | Database["public"]["Enums"]["catalog_access_match_kind"]
            | null
          matched_user_id?: string | null
          metadata?: Json
          user_agent?: string | null
        }
        Update: {
          access_log_id?: string | null
          catalog_id?: string
          cookie_token?: string | null
          created_at?: string
          email?: string | null
          event_type?: Database["public"]["Enums"]["catalog_view_event_type"]
          id?: string
          ip_address?: unknown
          matched_kind?:
            | Database["public"]["Enums"]["catalog_access_match_kind"]
            | null
          matched_user_id?: string | null
          metadata?: Json
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_view_events_access_log_id_fkey"
            columns: ["access_log_id"]
            isOneToOne: false
            referencedRelation: "catalog_access_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_view_events_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalog_operations_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_view_events_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "presentation_catalogs"
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
      cheques: {
        Row: {
          amount: number
          bank: string | null
          cheque_number: string | null
          counterparty_company_id: string | null
          counterparty_contact_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          direction: string
          due_date: string | null
          id: string
          notes: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount: number
          bank?: string | null
          cheque_number?: string | null
          counterparty_company_id?: string | null
          counterparty_contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          direction: string
          due_date?: string | null
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount?: number
          bank?: string | null
          cheque_number?: string | null
          counterparty_company_id?: string | null
          counterparty_contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          direction?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cheques_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      client_view_feedback: {
        Row: {
          author_name: string | null
          body: string | null
          client_view_id: string
          created_at: string
          id: string
          kind: string
          session_id: string | null
          sheet_id: string | null
          status: string | null
        }
        Insert: {
          author_name?: string | null
          body?: string | null
          client_view_id: string
          created_at?: string
          id?: string
          kind?: string
          session_id?: string | null
          sheet_id?: string | null
          status?: string | null
        }
        Update: {
          author_name?: string | null
          body?: string | null
          client_view_id?: string
          created_at?: string
          id?: string
          kind?: string
          session_id?: string | null
          sheet_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_view_feedback_client_view_id_fkey"
            columns: ["client_view_id"]
            isOneToOne: false
            referencedRelation: "project_client_views"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_view_feedback_sheet_id_fkey"
            columns: ["sheet_id"]
            isOneToOne: false
            referencedRelation: "moodboard_presentation_sheets"
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
      contract_signatures: {
        Row: {
          contract_id: string
          id: string
          ip: string | null
          signature_image: string | null
          signed_at: string
          signer_email: string | null
          signer_name: string
          signer_role: string | null
          user_agent: string | null
          workspace_id: string
        }
        Insert: {
          contract_id: string
          id?: string
          ip?: string | null
          signature_image?: string | null
          signed_at?: string
          signer_email?: string | null
          signer_name: string
          signer_role?: string | null
          user_agent?: string | null
          workspace_id: string
        }
        Update: {
          contract_id?: string
          id?: string
          ip?: string | null
          signature_image?: string | null
          signed_at?: string
          signer_email?: string | null
          signer_name?: string
          signer_role?: string | null
          user_agent?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_signatures_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          body_markdown: string | null
          context: string
          contract_type: string | null
          counterparty_email: string | null
          counterparty_name: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          customer_company_id: string | null
          effective_date: string | null
          expiry_date: string | null
          hr_employee_id: string | null
          id: string
          order_id: string | null
          project_id: string | null
          quote_id: string | null
          sent_at: string | null
          sign_token: string | null
          sign_token_expires_at: string | null
          signed_at: string | null
          status: string
          supplier_company_id: string | null
          title: string
          updated_at: string
          value: number | null
          workspace_id: string
        }
        Insert: {
          body_markdown?: string | null
          context: string
          contract_type?: string | null
          counterparty_email?: string | null
          counterparty_name?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          customer_company_id?: string | null
          effective_date?: string | null
          expiry_date?: string | null
          hr_employee_id?: string | null
          id?: string
          order_id?: string | null
          project_id?: string | null
          quote_id?: string | null
          sent_at?: string | null
          sign_token?: string | null
          sign_token_expires_at?: string | null
          signed_at?: string | null
          status?: string
          supplier_company_id?: string | null
          title: string
          updated_at?: string
          value?: number | null
          workspace_id: string
        }
        Update: {
          body_markdown?: string | null
          context?: string
          contract_type?: string | null
          counterparty_email?: string | null
          counterparty_name?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          customer_company_id?: string | null
          effective_date?: string | null
          expiry_date?: string | null
          hr_employee_id?: string | null
          id?: string
          order_id?: string | null
          project_id?: string | null
          quote_id?: string | null
          sent_at?: string | null
          sign_token?: string | null
          sign_token_expires_at?: string | null
          signed_at?: string | null
          status?: string
          supplier_company_id?: string | null
          title?: string
          updated_at?: string
          value?: number | null
          workspace_id?: string
        }
        Relationships: []
      }
      credit_note_items: {
        Row: {
          created_at: string
          credit_note_id: string
          description: string
          id: string
          income_classification_category: string | null
          income_classification_type: string | null
          line_total: number | null
          net_value: number
          product_id: string | null
          quantity: number
          sku: string | null
          source_invoice_item_id: string | null
          unit: string | null
          unit_price: number
          vat_amount: number
          vat_category: number | null
          vat_percent: number | null
        }
        Insert: {
          created_at?: string
          credit_note_id: string
          description?: string
          id?: string
          income_classification_category?: string | null
          income_classification_type?: string | null
          line_total?: number | null
          net_value?: number
          product_id?: string | null
          quantity?: number
          sku?: string | null
          source_invoice_item_id?: string | null
          unit?: string | null
          unit_price?: number
          vat_amount?: number
          vat_category?: number | null
          vat_percent?: number | null
        }
        Update: {
          created_at?: string
          credit_note_id?: string
          description?: string
          id?: string
          income_classification_category?: string | null
          income_classification_type?: string | null
          line_total?: number | null
          net_value?: number
          product_id?: string | null
          quantity?: number
          sku?: string | null
          source_invoice_item_id?: string | null
          unit?: string | null
          unit_price?: number
          vat_amount?: number
          vat_category?: number | null
          vat_percent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_note_items_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_note_items_source_invoice_item_id_fkey"
            columns: ["source_invoice_item_id"]
            isOneToOne: false
            referencedRelation: "invoice_items"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_notes: {
        Row: {
          amount: number
          branch_code: number
          correlated_mark: string | null
          created_at: string
          created_by: string | null
          credit_note_number: string
          currency: string
          document_type: string | null
          fiscal_mark: string | null
          fiscal_status: string | null
          fx_rate_to_base: number
          id: string
          invoice_id: string
          issued_at: string
          order_id: string | null
          pdf_generated_at: string | null
          pdf_generation_status: string | null
          pdf_storage_path: string | null
          reason: string
          series: string | null
          series_number: number | null
          status: string
          subtotal_net: number | null
          total: number | null
          updated_at: string
          vat_amount: number | null
          workspace_id: string
        }
        Insert: {
          amount: number
          branch_code?: number
          correlated_mark?: string | null
          created_at?: string
          created_by?: string | null
          credit_note_number: string
          currency?: string
          document_type?: string | null
          fiscal_mark?: string | null
          fiscal_status?: string | null
          fx_rate_to_base?: number
          id?: string
          invoice_id: string
          issued_at?: string
          order_id?: string | null
          pdf_generated_at?: string | null
          pdf_generation_status?: string | null
          pdf_storage_path?: string | null
          reason: string
          series?: string | null
          series_number?: number | null
          status?: string
          subtotal_net?: number | null
          total?: number | null
          updated_at?: string
          vat_amount?: number | null
          workspace_id: string
        }
        Update: {
          amount?: number
          branch_code?: number
          correlated_mark?: string | null
          created_at?: string
          created_by?: string | null
          credit_note_number?: string
          currency?: string
          document_type?: string | null
          fiscal_mark?: string | null
          fiscal_status?: string | null
          fx_rate_to_base?: number
          id?: string
          invoice_id?: string
          issued_at?: string
          order_id?: string | null
          pdf_generated_at?: string | null
          pdf_generation_status?: string | null
          pdf_storage_path?: string | null
          reason?: string
          series?: string | null
          series_number?: number | null
          status?: string
          subtotal_net?: number | null
          total?: number | null
          updated_at?: string
          vat_amount?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_notes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "vw_ar_aging"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
      crm_activities: {
        Row: {
          activity_type: string
          actor_user_id: string | null
          created_at: string
          description: string | null
          id: string
          metadata: Json
          target_id: string
          target_kind: string
          title: string
          workspace_id: string | null
        }
        Insert: {
          activity_type: string
          actor_user_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          target_id: string
          target_kind: string
          title: string
          workspace_id?: string | null
        }
        Update: {
          activity_type?: string
          actor_user_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          target_id?: string
          target_kind?: string
          title?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_activities_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_address_units: {
        Row: {
          address: string | null
          branch_number: number | null
          city: string | null
          company_id: string | null
          contact_id: string | null
          country: string | null
          country_code: string | null
          created_at: string
          created_by: string | null
          id: string
          is_default: boolean
          label: string
          postal_code: string | null
          state: string | null
          street: string | null
          street_number: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          address?: string | null
          branch_number?: number | null
          city?: string | null
          company_id?: string | null
          contact_id?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          label: string
          postal_code?: string | null
          state?: string | null
          street?: string | null
          street_number?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          address?: string | null
          branch_number?: number | null
          city?: string | null
          company_id?: string | null
          contact_id?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          label?: string
          postal_code?: string | null
          state?: string | null
          street?: string | null
          street_number?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_address_units_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_address_units_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_categories: {
        Row: {
          color_hex: string | null
          created_at: string
          created_by: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["crm_category_kind"]
          name: string
          slug: string
          source_value: string | null
          updated_at: string
        }
        Insert: {
          color_hex?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["crm_category_kind"]
          name: string
          slug: string
          source_value?: string | null
          updated_at?: string
        }
        Update: {
          color_hex?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["crm_category_kind"]
          name?: string
          slug?: string
          source_value?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      crm_category_members: {
        Row: {
          added_at: string
          added_by: string | null
          category_id: string
          crm_company_id: string | null
          crm_contact_id: string | null
          id: string
          member_kind: Database["public"]["Enums"]["crm_category_member_kind"]
          source: string
          user_id: string | null
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          category_id: string
          crm_company_id?: string | null
          crm_contact_id?: string | null
          id?: string
          member_kind: Database["public"]["Enums"]["crm_category_member_kind"]
          source?: string
          user_id?: string | null
        }
        Update: {
          added_at?: string
          added_by?: string | null
          category_id?: string
          crm_company_id?: string | null
          crm_contact_id?: string | null
          id?: string
          member_kind?: Database["public"]["Enums"]["crm_category_member_kind"]
          source?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_category_members_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "crm_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_category_members_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "crm_categories_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_category_members_crm_company_id_fkey"
            columns: ["crm_company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_category_members_crm_contact_id_fkey"
            columns: ["crm_contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_companies: {
        Row: {
          aade_data: Json | null
          aade_data_at: string | null
          address: string | null
          annual_revenue: string | null
          billing_city: string | null
          billing_country_code: string | null
          billing_name: string | null
          billing_postal_code: string | null
          billing_street: string | null
          billing_street_number: string | null
          billing_tax_office: string | null
          billing_vat: string | null
          business_start_date: string | null
          city: string | null
          commercial_title: string | null
          contact_group: string | null
          country: string | null
          country_code: string | null
          created_at: string | null
          created_by: string | null
          credit_limit: number | null
          description: string | null
          discount_notes: string | null
          discount_percent: number | null
          email: string | null
          employee_count: string | null
          facebook: string | null
          factory_names: string[]
          finance_statement_opt_out: boolean
          id: string
          include_in_myf: boolean
          industry: string | null
          is_brand: boolean
          is_customer: boolean | null
          is_manufacturer: boolean
          is_supplier: boolean | null
          kad_primary: string | null
          kad_primary_description: string | null
          kad_secondary: Json | null
          legal_status: string | null
          linkedin: string | null
          min_order_value: number | null
          name: string
          payment_terms_days: number | null
          phone: string | null
          platform_supplier_id: string | null
          postal_code: string | null
          prices_vat_inclusive: boolean
          profession: string | null
          responsible_sales_user_ids: string[]
          state: string | null
          street: string | null
          street_number: string | null
          tax_office: string | null
          twitter: string | null
          updated_at: string | null
          user_level_key: string | null
          vat_exemption_reason: string | null
          vat_number: string | null
          vat_validated: boolean | null
          vat_validated_address: string | null
          vat_validated_at: string | null
          vat_validated_name: string | null
          vat_validation_source: string | null
          website: string | null
          workspace_id: string
        }
        Insert: {
          aade_data?: Json | null
          aade_data_at?: string | null
          address?: string | null
          annual_revenue?: string | null
          billing_city?: string | null
          billing_country_code?: string | null
          billing_name?: string | null
          billing_postal_code?: string | null
          billing_street?: string | null
          billing_street_number?: string | null
          billing_tax_office?: string | null
          billing_vat?: string | null
          business_start_date?: string | null
          city?: string | null
          commercial_title?: string | null
          contact_group?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string | null
          created_by?: string | null
          credit_limit?: number | null
          description?: string | null
          discount_notes?: string | null
          discount_percent?: number | null
          email?: string | null
          employee_count?: string | null
          facebook?: string | null
          factory_names?: string[]
          finance_statement_opt_out?: boolean
          id?: string
          include_in_myf?: boolean
          industry?: string | null
          is_brand?: boolean
          is_customer?: boolean | null
          is_manufacturer?: boolean
          is_supplier?: boolean | null
          kad_primary?: string | null
          kad_primary_description?: string | null
          kad_secondary?: Json | null
          legal_status?: string | null
          linkedin?: string | null
          min_order_value?: number | null
          name: string
          payment_terms_days?: number | null
          phone?: string | null
          platform_supplier_id?: string | null
          postal_code?: string | null
          prices_vat_inclusive?: boolean
          profession?: string | null
          responsible_sales_user_ids?: string[]
          state?: string | null
          street?: string | null
          street_number?: string | null
          tax_office?: string | null
          twitter?: string | null
          updated_at?: string | null
          user_level_key?: string | null
          vat_exemption_reason?: string | null
          vat_number?: string | null
          vat_validated?: boolean | null
          vat_validated_address?: string | null
          vat_validated_at?: string | null
          vat_validated_name?: string | null
          vat_validation_source?: string | null
          website?: string | null
          workspace_id: string
        }
        Update: {
          aade_data?: Json | null
          aade_data_at?: string | null
          address?: string | null
          annual_revenue?: string | null
          billing_city?: string | null
          billing_country_code?: string | null
          billing_name?: string | null
          billing_postal_code?: string | null
          billing_street?: string | null
          billing_street_number?: string | null
          billing_tax_office?: string | null
          billing_vat?: string | null
          business_start_date?: string | null
          city?: string | null
          commercial_title?: string | null
          contact_group?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string | null
          created_by?: string | null
          credit_limit?: number | null
          description?: string | null
          discount_notes?: string | null
          discount_percent?: number | null
          email?: string | null
          employee_count?: string | null
          facebook?: string | null
          factory_names?: string[]
          finance_statement_opt_out?: boolean
          id?: string
          include_in_myf?: boolean
          industry?: string | null
          is_brand?: boolean
          is_customer?: boolean | null
          is_manufacturer?: boolean
          is_supplier?: boolean | null
          kad_primary?: string | null
          kad_primary_description?: string | null
          kad_secondary?: Json | null
          legal_status?: string | null
          linkedin?: string | null
          min_order_value?: number | null
          name?: string
          payment_terms_days?: number | null
          phone?: string | null
          platform_supplier_id?: string | null
          postal_code?: string | null
          prices_vat_inclusive?: boolean
          profession?: string | null
          responsible_sales_user_ids?: string[]
          state?: string | null
          street?: string | null
          street_number?: string | null
          tax_office?: string | null
          twitter?: string | null
          updated_at?: string | null
          user_level_key?: string | null
          vat_exemption_reason?: string | null
          vat_number?: string | null
          vat_validated?: boolean | null
          vat_validated_address?: string | null
          vat_validated_at?: string | null
          vat_validated_name?: string | null
          vat_validation_source?: string | null
          website?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_companies_platform_supplier_id_fkey"
            columns: ["platform_supplier_id"]
            isOneToOne: false
            referencedRelation: "platform_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_companies_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
          billing_city: string | null
          billing_country_code: string | null
          billing_name: string | null
          billing_postal_code: string | null
          billing_street: string | null
          billing_street_number: string | null
          billing_tax_office: string | null
          billing_vat: string | null
          city: string | null
          company: string | null
          contact_group: string | null
          contact_type: string | null
          country: string | null
          country_code: string | null
          created_at: string | null
          created_by: string | null
          credit_limit: number | null
          date_of_birth: string | null
          department: string | null
          discount_notes: string | null
          discount_percent: number | null
          email: string | null
          employee_count: string | null
          facebook: string | null
          finance_statement_opt_out: boolean
          first_name: string | null
          id: string
          include_in_myf: boolean
          industry: string | null
          is_client: boolean | null
          is_supplier: boolean | null
          last_name: string | null
          lead_source: string | null
          lead_status: string | null
          linked_at: string | null
          linked_by: string | null
          linkedin: string | null
          min_order_value: number | null
          mobile: string | null
          name: string
          payment_terms_days: number | null
          phone: string | null
          position: string | null
          postal_code: string | null
          prices_vat_inclusive: boolean
          profession: string | null
          responsible_sales_user_ids: string[]
          state: string | null
          status: string | null
          street: string | null
          street_number: string | null
          tags: Json | null
          tax_office: string | null
          twitter: string | null
          updated_at: string | null
          user_id: string | null
          user_level_key: string | null
          vat_exemption_reason: string | null
          vat_number: string | null
          website: string | null
          workspace_id: string
        }
        Insert: {
          address?: string | null
          annual_revenue?: string | null
          billing_city?: string | null
          billing_country_code?: string | null
          billing_name?: string | null
          billing_postal_code?: string | null
          billing_street?: string | null
          billing_street_number?: string | null
          billing_tax_office?: string | null
          billing_vat?: string | null
          city?: string | null
          company?: string | null
          contact_group?: string | null
          contact_type?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string | null
          created_by?: string | null
          credit_limit?: number | null
          date_of_birth?: string | null
          department?: string | null
          discount_notes?: string | null
          discount_percent?: number | null
          email?: string | null
          employee_count?: string | null
          facebook?: string | null
          finance_statement_opt_out?: boolean
          first_name?: string | null
          id?: string
          include_in_myf?: boolean
          industry?: string | null
          is_client?: boolean | null
          is_supplier?: boolean | null
          last_name?: string | null
          lead_source?: string | null
          lead_status?: string | null
          linked_at?: string | null
          linked_by?: string | null
          linkedin?: string | null
          min_order_value?: number | null
          mobile?: string | null
          name: string
          payment_terms_days?: number | null
          phone?: string | null
          position?: string | null
          postal_code?: string | null
          prices_vat_inclusive?: boolean
          profession?: string | null
          responsible_sales_user_ids?: string[]
          state?: string | null
          status?: string | null
          street?: string | null
          street_number?: string | null
          tags?: Json | null
          tax_office?: string | null
          twitter?: string | null
          updated_at?: string | null
          user_id?: string | null
          user_level_key?: string | null
          vat_exemption_reason?: string | null
          vat_number?: string | null
          website?: string | null
          workspace_id: string
        }
        Update: {
          address?: string | null
          annual_revenue?: string | null
          billing_city?: string | null
          billing_country_code?: string | null
          billing_name?: string | null
          billing_postal_code?: string | null
          billing_street?: string | null
          billing_street_number?: string | null
          billing_tax_office?: string | null
          billing_vat?: string | null
          city?: string | null
          company?: string | null
          contact_group?: string | null
          contact_type?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string | null
          created_by?: string | null
          credit_limit?: number | null
          date_of_birth?: string | null
          department?: string | null
          discount_notes?: string | null
          discount_percent?: number | null
          email?: string | null
          employee_count?: string | null
          facebook?: string | null
          finance_statement_opt_out?: boolean
          first_name?: string | null
          id?: string
          include_in_myf?: boolean
          industry?: string | null
          is_client?: boolean | null
          is_supplier?: boolean | null
          last_name?: string | null
          lead_source?: string | null
          lead_status?: string | null
          linked_at?: string | null
          linked_by?: string | null
          linkedin?: string | null
          min_order_value?: number | null
          mobile?: string | null
          name?: string
          payment_terms_days?: number | null
          phone?: string | null
          position?: string | null
          postal_code?: string | null
          prices_vat_inclusive?: boolean
          profession?: string | null
          responsible_sales_user_ids?: string[]
          state?: string | null
          status?: string | null
          street?: string | null
          street_number?: string | null
          tags?: Json | null
          tax_office?: string | null
          twitter?: string | null
          updated_at?: string | null
          user_id?: string | null
          user_level_key?: string | null
          vat_exemption_reason?: string | null
          vat_number?: string | null
          website?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_contacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_notes: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          edited_by: string | null
          id: string
          target_id: string
          target_kind: Database["public"]["Enums"]["crm_note_target_kind"]
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          edited_by?: string | null
          id?: string
          target_id: string
          target_kind: Database["public"]["Enums"]["crm_note_target_kind"]
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          edited_by?: string | null
          id?: string
          target_id?: string
          target_kind?: Database["public"]["Enums"]["crm_note_target_kind"]
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_billing_registry: {
        Row: {
          credit_cost: number
          cron_key: string
          description: string | null
          metered: boolean
          updated_at: string
        }
        Insert: {
          credit_cost?: number
          cron_key: string
          description?: string | null
          metered?: boolean
          updated_at?: string
        }
        Update: {
          credit_cost?: number
          cron_key?: string
          description?: string | null
          metered?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      dashboard_insights_cache: {
        Row: {
          expires_at: string
          generated_at: string
          insights: Json
          model: string | null
          source: string
          stats: Json
          user_id: string
          workspace_id: string
        }
        Insert: {
          expires_at: string
          generated_at?: string
          insights: Json
          model?: string | null
          source?: string
          stats?: Json
          user_id: string
          workspace_id: string
        }
        Update: {
          expires_at?: string
          generated_at?: string
          insights?: Json
          model?: string | null
          source?: string
          stats?: Json
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_insights_cache_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      data_integrity_checks: {
        Row: {
          autoheal_enabled: boolean
          can_autoheal: boolean | null
          created_at: string
          description: string | null
          detect_fn: string
          domain: string
          heal_fn: string | null
          is_enabled: boolean
          key: string
          severity: string
          sort_order: number
          title: string
        }
        Insert: {
          autoheal_enabled?: boolean
          can_autoheal?: boolean | null
          created_at?: string
          description?: string | null
          detect_fn: string
          domain: string
          heal_fn?: string | null
          is_enabled?: boolean
          key: string
          severity?: string
          sort_order?: number
          title: string
        }
        Update: {
          autoheal_enabled?: boolean
          can_autoheal?: boolean | null
          created_at?: string
          description?: string | null
          detect_fn?: string
          domain?: string
          heal_fn?: string | null
          is_enabled?: boolean
          key?: string
          severity?: string
          sort_order?: number
          title?: string
        }
        Relationships: []
      }
      data_integrity_findings: {
        Row: {
          check_key: string
          detail: Json
          domain: string
          entity_id: string | null
          entity_table: string | null
          first_seen_at: string
          healed_at: string | null
          id: string
          last_seen_at: string
          resolved_by: string | null
          run_id: string | null
          severity: string
          status: string
          workspace_id: string | null
        }
        Insert: {
          check_key: string
          detail?: Json
          domain: string
          entity_id?: string | null
          entity_table?: string | null
          first_seen_at?: string
          healed_at?: string | null
          id?: string
          last_seen_at?: string
          resolved_by?: string | null
          run_id?: string | null
          severity: string
          status?: string
          workspace_id?: string | null
        }
        Update: {
          check_key?: string
          detail?: Json
          domain?: string
          entity_id?: string | null
          entity_table?: string | null
          first_seen_at?: string
          healed_at?: string | null
          id?: string
          last_seen_at?: string
          resolved_by?: string | null
          run_id?: string | null
          severity?: string
          status?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_integrity_findings_check_key_fkey"
            columns: ["check_key"]
            isOneToOne: false
            referencedRelation: "data_integrity_checks"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "data_integrity_findings_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "data_integrity_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      data_integrity_runs: {
        Row: {
          autoheal: boolean
          checks_run: number
          domains: string[] | null
          error: string | null
          findings_healed: number
          findings_open: number
          finished_at: string | null
          id: string
          started_at: string
          triggered_by: string
        }
        Insert: {
          autoheal?: boolean
          checks_run?: number
          domains?: string[] | null
          error?: string | null
          findings_healed?: number
          findings_open?: number
          finished_at?: string | null
          id?: string
          started_at?: string
          triggered_by?: string
        }
        Update: {
          autoheal?: boolean
          checks_run?: number
          domains?: string[] | null
          error?: string | null
          findings_healed?: number
          findings_open?: number
          finished_at?: string | null
          id?: string
          started_at?: string
          triggered_by?: string
        }
        Relationships: []
      }
      delivery_note_items: {
        Row: {
          created_at: string
          delivery_note_id: string
          description: string
          id: string
          product_id: string | null
          quantity: number
          sku: string | null
          unit: string | null
          warehouse_item_id: string | null
        }
        Insert: {
          created_at?: string
          delivery_note_id: string
          description?: string
          id?: string
          product_id?: string | null
          quantity?: number
          sku?: string | null
          unit?: string | null
          warehouse_item_id?: string | null
        }
        Update: {
          created_at?: string
          delivery_note_id?: string
          description?: string
          id?: string
          product_id?: string | null
          quantity?: number
          sku?: string | null
          unit?: string | null
          warehouse_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_note_items_delivery_note_id_fkey"
            columns: ["delivery_note_id"]
            isOneToOne: false
            referencedRelation: "delivery_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_note_items_warehouse_item_id_fkey"
            columns: ["warehouse_item_id"]
            isOneToOne: false
            referencedRelation: "warehouse_items"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_notes: {
        Row: {
          branch_code: number
          created_at: string
          created_by: string | null
          customer_company_id: string | null
          customer_contact_id: string | null
          delivery_note_number: string | null
          fiscal_mark: string | null
          fiscal_status: string | null
          id: string
          invoice_id: string | null
          issued_at: string | null
          kind: string
          move_purpose: string | null
          notes: string | null
          order_id: string | null
          pdf_generated_at: string | null
          pdf_generation_status: string | null
          pdf_storage_path: string | null
          related_document: string | null
          responsible: string | null
          series: string | null
          series_number: number | null
          ship_from: string | null
          ship_from_address_unit_id: string | null
          ship_from_city: string | null
          ship_from_number: string | null
          ship_from_postal: string | null
          ship_from_street: string | null
          ship_to: string | null
          ship_to_address_unit_id: string | null
          ship_to_city: string | null
          ship_to_number: string | null
          ship_to_postal: string | null
          ship_to_street: string | null
          status: string
          transport_date: string | null
          transport_time: string | null
          updated_at: string
          vehicle_number: string | null
          workspace_id: string
        }
        Insert: {
          branch_code?: number
          created_at?: string
          created_by?: string | null
          customer_company_id?: string | null
          customer_contact_id?: string | null
          delivery_note_number?: string | null
          fiscal_mark?: string | null
          fiscal_status?: string | null
          id?: string
          invoice_id?: string | null
          issued_at?: string | null
          kind?: string
          move_purpose?: string | null
          notes?: string | null
          order_id?: string | null
          pdf_generated_at?: string | null
          pdf_generation_status?: string | null
          pdf_storage_path?: string | null
          related_document?: string | null
          responsible?: string | null
          series?: string | null
          series_number?: number | null
          ship_from?: string | null
          ship_from_address_unit_id?: string | null
          ship_from_city?: string | null
          ship_from_number?: string | null
          ship_from_postal?: string | null
          ship_from_street?: string | null
          ship_to?: string | null
          ship_to_address_unit_id?: string | null
          ship_to_city?: string | null
          ship_to_number?: string | null
          ship_to_postal?: string | null
          ship_to_street?: string | null
          status?: string
          transport_date?: string | null
          transport_time?: string | null
          updated_at?: string
          vehicle_number?: string | null
          workspace_id: string
        }
        Update: {
          branch_code?: number
          created_at?: string
          created_by?: string | null
          customer_company_id?: string | null
          customer_contact_id?: string | null
          delivery_note_number?: string | null
          fiscal_mark?: string | null
          fiscal_status?: string | null
          id?: string
          invoice_id?: string | null
          issued_at?: string | null
          kind?: string
          move_purpose?: string | null
          notes?: string | null
          order_id?: string | null
          pdf_generated_at?: string | null
          pdf_generation_status?: string | null
          pdf_storage_path?: string | null
          related_document?: string | null
          responsible?: string | null
          series?: string | null
          series_number?: number | null
          ship_from?: string | null
          ship_from_address_unit_id?: string | null
          ship_from_city?: string | null
          ship_from_number?: string | null
          ship_from_postal?: string | null
          ship_from_street?: string | null
          ship_to?: string | null
          ship_to_address_unit_id?: string | null
          ship_to_city?: string | null
          ship_to_number?: string | null
          ship_to_postal?: string | null
          ship_to_street?: string | null
          status?: string
          transport_date?: string | null
          transport_time?: string | null
          updated_at?: string
          vehicle_number?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_notes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_notes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "vw_ar_aging"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_notes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_notes_ship_from_address_unit_id_fkey"
            columns: ["ship_from_address_unit_id"]
            isOneToOne: false
            referencedRelation: "crm_address_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_notes_ship_to_address_unit_id_fkey"
            columns: ["ship_to_address_unit_id"]
            isOneToOne: false
            referencedRelation: "crm_address_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_notes_workspace_id_fkey"
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
          chunk_type_status: string
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
          chunk_type_status?: string
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
          chunk_type_status?: string
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
          color_aspect_embedding_model: string | null
          color_aspect_schema_version: number | null
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
          material_aspect_embedding_model: string | null
          material_aspect_schema_version: number | null
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
          style_aspect_embedding_model: string | null
          style_aspect_schema_version: number | null
          texture_aspect_embedding_model: string | null
          texture_aspect_schema_version: number | null
          understanding_embedding_model: string | null
          understanding_schema_version: number | null
          vision_analysis: Json | null
          vision_analysis_attempts: number
          vision_analysis_failed: boolean
          vision_analysis_failed_at: string | null
          vision_model: string | null
          vision_provider: string | null
          visual_features: Json | null
          visual_metadata_extraction: Json | null
          workspace_id: string | null
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
          color_aspect_embedding_model?: string | null
          color_aspect_schema_version?: number | null
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
          material_aspect_embedding_model?: string | null
          material_aspect_schema_version?: number | null
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
          style_aspect_embedding_model?: string | null
          style_aspect_schema_version?: number | null
          texture_aspect_embedding_model?: string | null
          texture_aspect_schema_version?: number | null
          understanding_embedding_model?: string | null
          understanding_schema_version?: number | null
          vision_analysis?: Json | null
          vision_analysis_attempts?: number
          vision_analysis_failed?: boolean
          vision_analysis_failed_at?: string | null
          vision_model?: string | null
          vision_provider?: string | null
          visual_features?: Json | null
          visual_metadata_extraction?: Json | null
          workspace_id?: string | null
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
          color_aspect_embedding_model?: string | null
          color_aspect_schema_version?: number | null
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
          material_aspect_embedding_model?: string | null
          material_aspect_schema_version?: number | null
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
          style_aspect_embedding_model?: string | null
          style_aspect_schema_version?: number | null
          texture_aspect_embedding_model?: string | null
          texture_aspect_schema_version?: number | null
          understanding_embedding_model?: string | null
          understanding_schema_version?: number | null
          vision_analysis?: Json | null
          vision_analysis_attempts?: number
          vision_analysis_failed?: boolean
          vision_analysis_failed_at?: string | null
          vision_model?: string | null
          vision_provider?: string | null
          visual_features?: Json | null
          visual_metadata_extraction?: Json | null
          workspace_id?: string | null
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
      document_series: {
        Row: {
          branch_id: string | null
          created_at: string
          doc_code: string
          id: string
          is_active: boolean
          next_number: number
          series: string
          workspace_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          doc_code: string
          id?: string
          is_active?: boolean
          next_number?: number
          series: string
          workspace_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          doc_code?: string
          id?: string
          is_active?: boolean
          next_number?: number
          series?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_series_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "finance_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_series_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
          storage_bucket: string | null
          storage_object_path: string | null
          updated_at: string | null
          workspace_id: string
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
          storage_bucket?: string | null
          storage_object_path?: string | null
          updated_at?: string | null
          workspace_id: string
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
          storage_bucket?: string | null
          storage_object_path?: string | null
          updated_at?: string | null
          workspace_id?: string
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
          workspace_id: string | null
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
          workspace_id?: string | null
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
          workspace_id?: string | null
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
          workspace_id: string | null
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
          workspace_id?: string | null
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
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      embedding_backfill_state: {
        Row: {
          attempts: number
          created_at: string
          deficiency: string
          entity_id: string
          entity_type: string
          last_attempt_at: string | null
          last_error: string | null
          resolved_at: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          deficiency: string
          entity_id: string
          entity_type: string
          last_attempt_at?: string | null
          last_error?: string | null
          resolved_at?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          deficiency?: string
          entity_id?: string
          entity_type?: string
          last_attempt_at?: string | null
          last_error?: string | null
          resolved_at?: string | null
          updated_at?: string
          workspace_id?: string | null
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
      ergani_leave_types: {
        Row: {
          category: string
          code: string
          description_el: string
          description_en: string | null
          is_hourly: boolean
          sort_order: number
          subcategory: string
        }
        Insert: {
          category?: string
          code: string
          description_el: string
          description_en?: string | null
          is_hourly?: boolean
          sort_order?: number
          subcategory?: string
        }
        Update: {
          category?: string
          code?: string
          description_el?: string
          description_en?: string | null
          is_hourly?: boolean
          sort_order?: number
          subcategory?: string
        }
        Relationships: []
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
      facet_canonical_values: {
        Row: {
          alias_count: number
          aliases: Json
          canonical_value: string
          embedding: unknown
          embedding_model: string
          facet_key: string
          first_seen_at: string
          id: string
          is_golden: boolean
          is_locked: boolean
          last_seen_at: string
          schema_version: number
          workspace_id: string | null
        }
        Insert: {
          alias_count?: number
          aliases?: Json
          canonical_value: string
          embedding?: unknown
          embedding_model?: string
          facet_key: string
          first_seen_at?: string
          id?: string
          is_golden?: boolean
          is_locked?: boolean
          last_seen_at?: string
          schema_version?: number
          workspace_id?: string | null
        }
        Update: {
          alias_count?: number
          aliases?: Json
          canonical_value?: string
          embedding?: unknown
          embedding_model?: string
          facet_key?: string
          first_seen_at?: string
          id?: string
          is_golden?: boolean
          is_locked?: boolean
          last_seen_at?: string
          schema_version?: number
          workspace_id?: string | null
        }
        Relationships: []
      }
      facet_merge_log: {
        Row: {
          action: string
          facet_key: string
          id: number
          normalized_value: string
          occurred_at: string
          product_id: string | null
          raw_value: string
          resolved_canonical: string
          similarity: number | null
          source: string | null
          workspace_id: string | null
        }
        Insert: {
          action: string
          facet_key: string
          id?: number
          normalized_value: string
          occurred_at?: string
          product_id?: string | null
          raw_value: string
          resolved_canonical: string
          similarity?: number | null
          source?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string
          facet_key?: string
          id?: number
          normalized_value?: string
          occurred_at?: string
          product_id?: string | null
          raw_value?: string
          resolved_canonical?: string
          similarity?: number | null
          source?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      factory_access_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          factory_user_id: string
          id: string
          message: string | null
          rejection_reason: string | null
          requester_user_id: string
          requester_workspace_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          factory_user_id: string
          id?: string
          message?: string | null
          rejection_reason?: string | null
          requester_user_id: string
          requester_workspace_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          factory_user_id?: string
          id?: string
          message?: string | null
          rejection_reason?: string | null
          requester_user_id?: string
          requester_workspace_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "factory_access_requests_requester_workspace_id_fkey"
            columns: ["requester_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      finance_bank_accounts: {
        Row: {
          account_ref: string | null
          created_at: string
          currency: string
          iban: string | null
          id: string
          is_active: boolean
          is_default: boolean
          kind: string
          name: string
          notes: string | null
          opening_balance: number
          show_on_invoice: boolean
          sort_order: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_ref?: string | null
          created_at?: string
          currency?: string
          iban?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          kind?: string
          name: string
          show_on_invoice?: boolean
          notes?: string | null
          opening_balance?: number
          sort_order?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_ref?: string | null
          created_at?: string
          currency?: string
          iban?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          kind?: string
          name?: string
          notes?: string | null
          opening_balance?: number
          show_on_invoice?: boolean
          sort_order?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_bank_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_branches: {
        Row: {
          address: string | null
          branch_code: number
          city: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          postal_code: string | null
          street_number: string | null
          workspace_id: string
        }
        Insert: {
          address?: string | null
          branch_code?: number
          city?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          postal_code?: string | null
          street_number?: string | null
          workspace_id: string
        }
        Update: {
          address?: string | null
          branch_code?: number
          city?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          postal_code?: string | null
          street_number?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_branches_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_categories: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_active: boolean
          kind: string
          margin_pct: number | null
          name: string
          workspace_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          margin_pct?: number | null
          name: string
          workspace_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          margin_pct?: number | null
          name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_categories_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_settings: {
        Row: {
          auto_statement_day_of_month: number
          auto_statement_day_of_week: number | null
          auto_statement_enabled: boolean
          auto_statement_frequency: string
          auto_statement_hour_utc: number
          auto_statement_interval_days: number | null
          auto_statement_last_run_at: string | null
          auto_statement_min_balance: number
          auto_statement_only_outstanding: boolean
          auto_statement_side: string
          bank_accounts: Json
          bank_beneficiary: string | null
          bank_bic: string | null
          bank_iban: string | null
          bank_name: string | null
          base_currency: string
          branding_contact_line: string | null
          business_address: string | null
          business_address_en: string | null
          business_city: string | null
          business_city_en: string | null
          business_company_type: string | null
          business_country: string | null
          business_country_code: string | null
          business_country_en: string | null
          business_email: string | null
          business_fax: string | null
          business_gemi: string | null
          business_logo_path: string | null
          business_name: string | null
          business_name_en: string | null
          business_other: string | null
          business_other_en: string | null
          business_phone: string | null
          business_postal_code: string | null
          business_profession: string | null
          business_profession_en: string | null
          business_seasonal: boolean
          business_street_number: string | null
          business_tax_office: string | null
          business_tax_office_en: string | null
          business_vat: string | null
          business_website: string | null
          contact_email: string | null
          contact_facebook: string | null
          contact_fax: string | null
          contact_hours: string | null
          contact_linkedin: string | null
          contact_phone: string | null
          contact_title: string | null
          contact_title_en: string | null
          contact_website: string | null
          correspondence_address: string | null
          credit_note_next_number: number
          default_credit_limit: number | null
          default_income_classification_category: string | null
          default_income_classification_type: string | null
          default_invoice_notes: string | null
          default_markup_pct: number
          default_payment_terms_days: number
          default_vat_rate: number
          digest_day_of_week: number | null
          digest_enabled: boolean
          digest_frequency: string
          digest_hour_utc: number
          digest_last_sent_at: string | null
          digest_recipients: string[]
          einvoicing_authorization_note: string | null
          einvoicing_authorization_status: string
          einvoicing_authorization_updated_at: string | null
          inbound_last_mark: string | null
          invoice_next_number: number
          invoice_number_pad: number
          invoice_number_prefix: string
          invoice_template_colors: Json
          invoice_template_cover_path: string | null
          invoice_template_footer_path: string | null
          invoice_template_id: string
          main_activity: string | null
          min_order_value: number | null
          negative_margin_policy: string
          notification_email: string | null
          personal_landline: string | null
          personal_mobile: string | null
          personal_notes: string | null
          quote_template_backcover_path: string | null
          quote_template_content_path: string | null
          quote_template_cover_path: string | null
          quote_template_intro_path: string | null
          receipt_next_number: number
          responsible_name: string | null
          risk_block_inactive_vat: boolean
          risk_block_min_order: boolean
          risk_block_over_credit_limit: boolean
          risk_block_unpaid_invoice: boolean
          risk_block_unvalidated_vat: boolean
          risk_warn_over_credit_limit: boolean
          sales_can_see_cost: boolean
          statement_email_body: string | null
          statement_email_subject: string | null
          statement_template_cover_path: string | null
          statement_template_footer_path: string | null
          statements_enabled: boolean
          trip_expense_reimbursement_mode: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          auto_statement_day_of_month?: number
          auto_statement_day_of_week?: number | null
          auto_statement_enabled?: boolean
          auto_statement_frequency?: string
          auto_statement_hour_utc?: number
          auto_statement_interval_days?: number | null
          auto_statement_last_run_at?: string | null
          auto_statement_min_balance?: number
          auto_statement_only_outstanding?: boolean
          auto_statement_side?: string
          bank_accounts?: Json
          bank_beneficiary?: string | null
          bank_bic?: string | null
          bank_iban?: string | null
          bank_name?: string | null
          base_currency?: string
          branding_contact_line?: string | null
          business_address?: string | null
          business_address_en?: string | null
          business_city?: string | null
          business_city_en?: string | null
          business_company_type?: string | null
          business_country?: string | null
          business_country_code?: string | null
          business_country_en?: string | null
          business_email?: string | null
          business_fax?: string | null
          business_gemi?: string | null
          business_logo_path?: string | null
          business_name?: string | null
          business_name_en?: string | null
          business_other?: string | null
          business_other_en?: string | null
          business_phone?: string | null
          business_postal_code?: string | null
          business_profession?: string | null
          business_profession_en?: string | null
          business_seasonal?: boolean
          business_street_number?: string | null
          business_tax_office?: string | null
          business_tax_office_en?: string | null
          business_vat?: string | null
          business_website?: string | null
          contact_email?: string | null
          contact_facebook?: string | null
          contact_fax?: string | null
          contact_hours?: string | null
          contact_linkedin?: string | null
          contact_phone?: string | null
          contact_title?: string | null
          contact_title_en?: string | null
          contact_website?: string | null
          correspondence_address?: string | null
          credit_note_next_number?: number
          default_credit_limit?: number | null
          default_income_classification_category?: string | null
          default_income_classification_type?: string | null
          default_invoice_notes?: string | null
          default_markup_pct?: number
          default_payment_terms_days?: number
          default_vat_rate?: number
          digest_day_of_week?: number | null
          digest_enabled?: boolean
          digest_frequency?: string
          digest_hour_utc?: number
          digest_last_sent_at?: string | null
          digest_recipients?: string[]
          einvoicing_authorization_note?: string | null
          einvoicing_authorization_status?: string
          einvoicing_authorization_updated_at?: string | null
          inbound_last_mark?: string | null
          invoice_next_number?: number
          invoice_number_pad?: number
          invoice_number_prefix?: string
          invoice_template_colors?: Json
          invoice_template_cover_path?: string | null
          invoice_template_footer_path?: string | null
          invoice_template_id?: string
          main_activity?: string | null
          min_order_value?: number | null
          negative_margin_policy?: string
          notification_email?: string | null
          personal_landline?: string | null
          personal_mobile?: string | null
          personal_notes?: string | null
          quote_template_backcover_path?: string | null
          quote_template_content_path?: string | null
          quote_template_cover_path?: string | null
          quote_template_intro_path?: string | null
          receipt_next_number?: number
          responsible_name?: string | null
          risk_block_inactive_vat?: boolean
          risk_block_min_order?: boolean
          risk_block_over_credit_limit?: boolean
          risk_block_unpaid_invoice?: boolean
          risk_block_unvalidated_vat?: boolean
          risk_warn_over_credit_limit?: boolean
          sales_can_see_cost?: boolean
          statement_email_body?: string | null
          statement_email_subject?: string | null
          statement_template_cover_path?: string | null
          statement_template_footer_path?: string | null
          statements_enabled?: boolean
          trip_expense_reimbursement_mode?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          auto_statement_day_of_month?: number
          auto_statement_day_of_week?: number | null
          auto_statement_enabled?: boolean
          auto_statement_frequency?: string
          auto_statement_hour_utc?: number
          auto_statement_interval_days?: number | null
          auto_statement_last_run_at?: string | null
          auto_statement_min_balance?: number
          auto_statement_only_outstanding?: boolean
          auto_statement_side?: string
          bank_accounts?: Json
          bank_beneficiary?: string | null
          bank_bic?: string | null
          bank_iban?: string | null
          bank_name?: string | null
          base_currency?: string
          branding_contact_line?: string | null
          business_address?: string | null
          business_address_en?: string | null
          business_city?: string | null
          business_city_en?: string | null
          business_company_type?: string | null
          business_country?: string | null
          business_country_code?: string | null
          business_country_en?: string | null
          business_email?: string | null
          business_fax?: string | null
          business_gemi?: string | null
          business_logo_path?: string | null
          business_name?: string | null
          business_name_en?: string | null
          business_other?: string | null
          business_other_en?: string | null
          business_phone?: string | null
          business_postal_code?: string | null
          business_profession?: string | null
          business_profession_en?: string | null
          business_seasonal?: boolean
          business_street_number?: string | null
          business_tax_office?: string | null
          business_tax_office_en?: string | null
          business_vat?: string | null
          business_website?: string | null
          contact_email?: string | null
          contact_facebook?: string | null
          contact_fax?: string | null
          contact_hours?: string | null
          contact_linkedin?: string | null
          contact_phone?: string | null
          contact_title?: string | null
          contact_title_en?: string | null
          contact_website?: string | null
          correspondence_address?: string | null
          credit_note_next_number?: number
          default_credit_limit?: number | null
          default_income_classification_category?: string | null
          default_income_classification_type?: string | null
          default_invoice_notes?: string | null
          default_markup_pct?: number
          default_payment_terms_days?: number
          default_vat_rate?: number
          digest_day_of_week?: number | null
          digest_enabled?: boolean
          digest_frequency?: string
          digest_hour_utc?: number
          digest_last_sent_at?: string | null
          digest_recipients?: string[]
          einvoicing_authorization_note?: string | null
          einvoicing_authorization_status?: string
          einvoicing_authorization_updated_at?: string | null
          inbound_last_mark?: string | null
          invoice_next_number?: number
          invoice_number_pad?: number
          invoice_number_prefix?: string
          invoice_template_colors?: Json
          invoice_template_cover_path?: string | null
          invoice_template_footer_path?: string | null
          invoice_template_id?: string
          main_activity?: string | null
          min_order_value?: number | null
          negative_margin_policy?: string
          notification_email?: string | null
          personal_landline?: string | null
          personal_mobile?: string | null
          personal_notes?: string | null
          quote_template_backcover_path?: string | null
          quote_template_content_path?: string | null
          quote_template_cover_path?: string | null
          quote_template_intro_path?: string | null
          receipt_next_number?: number
          responsible_name?: string | null
          risk_block_inactive_vat?: boolean
          risk_block_min_order?: boolean
          risk_block_over_credit_limit?: boolean
          risk_block_unpaid_invoice?: boolean
          risk_block_unvalidated_vat?: boolean
          risk_warn_over_credit_limit?: boolean
          sales_can_see_cost?: boolean
          statement_email_body?: string | null
          statement_email_subject?: string | null
          statement_template_cover_path?: string | null
          statement_template_footer_path?: string | null
          statements_enabled?: boolean
          trip_expense_reimbursement_mode?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_statement_shares: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          failed_attempts: number
          id: string
          is_active: boolean
          last_viewed_at: string | null
          party_id: string
          party_type: string
          payment_link_amount: number | null
          payment_link_currency: string | null
          payment_link_id: string | null
          payment_link_url: string | null
          side: string
          token: string
          view_count: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          failed_attempts?: number
          id?: string
          is_active?: boolean
          last_viewed_at?: string | null
          party_id: string
          party_type: string
          payment_link_amount?: number | null
          payment_link_currency?: string | null
          payment_link_id?: string | null
          payment_link_url?: string | null
          side?: string
          token: string
          view_count?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          failed_attempts?: number
          id?: string
          is_active?: boolean
          last_viewed_at?: string | null
          party_id?: string
          party_type?: string
          payment_link_amount?: number | null
          payment_link_currency?: string | null
          payment_link_id?: string | null
          payment_link_url?: string | null
          side?: string
          token?: string
          view_count?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_statement_shares_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_connectors: {
        Row: {
          capabilities: string[]
          config_schema: Json
          country_codes: string[]
          created_at: string
          description: string | null
          is_enabled: boolean
          name: string
          slug: string
        }
        Insert: {
          capabilities?: string[]
          config_schema?: Json
          country_codes?: string[]
          created_at?: string
          description?: string | null
          is_enabled?: boolean
          name: string
          slug: string
        }
        Update: {
          capabilities?: string[]
          config_schema?: Json
          country_codes?: string[]
          created_at?: string
          description?: string | null
          is_enabled?: boolean
          name?: string
          slug?: string
        }
        Relationships: []
      }
      fiscal_submissions: {
        Row: {
          aa: string | null
          attempt: number
          authentication_code: string | null
          capability: string
          connector_slug: string
          created_at: string
          error_code: string | null
          error_message: string | null
          fiscal_invoice_type: string | null
          id: string
          invoice_id: string | null
          invoice_url: string | null
          is_offline: boolean
          mark: string | null
          provider_credits: number | null
          qr_url: string | null
          request_payload: Json | null
          response_payload: Json | null
          series: string | null
          status: string
          transmission_failure: boolean
          uid: string | null
          workspace_id: string
        }
        Insert: {
          aa?: string | null
          attempt?: number
          authentication_code?: string | null
          capability: string
          connector_slug: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          fiscal_invoice_type?: string | null
          id?: string
          invoice_id?: string | null
          invoice_url?: string | null
          is_offline?: boolean
          mark?: string | null
          provider_credits?: number | null
          qr_url?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          series?: string | null
          status?: string
          transmission_failure?: boolean
          uid?: string | null
          workspace_id: string
        }
        Update: {
          aa?: string | null
          attempt?: number
          authentication_code?: string | null
          capability?: string
          connector_slug?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          fiscal_invoice_type?: string | null
          id?: string
          invoice_id?: string | null
          invoice_url?: string | null
          is_offline?: boolean
          mark?: string | null
          provider_credits?: number | null
          qr_url?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          series?: string | null
          status?: string
          transmission_failure?: boolean
          uid?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_submissions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_submissions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "vw_ar_aging"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_submissions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_area_registry: {
        Row: {
          area_key: string
          bound_flow_id: string | null
          category: string
          created_at: string
          description: string | null
          required: boolean
          sort_order: number
          title: string
          trigger_type: string
          updated_at: string
        }
        Insert: {
          area_key: string
          bound_flow_id?: string | null
          category?: string
          created_at?: string
          description?: string | null
          required?: boolean
          sort_order?: number
          title: string
          trigger_type: string
          updated_at?: string
        }
        Update: {
          area_key?: string
          bound_flow_id?: string | null
          category?: string
          created_at?: string
          description?: string | null
          required?: boolean
          sort_order?: number
          title?: string
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_area_registry_bound_flow_id_fkey"
            columns: ["bound_flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
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
          is_global: boolean
          is_locked: boolean
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
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          graph_definition?: Json
          id?: string
          is_global?: boolean
          is_locked?: boolean
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
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          graph_definition?: Json
          id?: string
          is_global?: boolean
          is_locked?: boolean
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
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flows_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      freight_quotes: {
        Row: {
          answered_at: string | null
          answered_by: string | null
          cheapest_amount: number | null
          cheapest_currency: string | null
          container_type: string | null
          created_at: string
          created_by: string | null
          destination: string
          id: string
          mode: string
          offer_count: number
          offers: Json
          operator_note: string | null
          origin: string
          quote_id: string | null
          ready_date: string | null
          requested_by: string | null
          source: string
          status: string
          workspace_id: string
        }
        Insert: {
          answered_at?: string | null
          answered_by?: string | null
          cheapest_amount?: number | null
          cheapest_currency?: string | null
          container_type?: string | null
          created_at?: string
          created_by?: string | null
          destination: string
          id?: string
          mode?: string
          offer_count?: number
          offers?: Json
          operator_note?: string | null
          origin: string
          quote_id?: string | null
          ready_date?: string | null
          requested_by?: string | null
          source?: string
          status?: string
          workspace_id: string
        }
        Update: {
          answered_at?: string | null
          answered_by?: string | null
          cheapest_amount?: number | null
          cheapest_currency?: string | null
          container_type?: string | null
          created_at?: string
          created_by?: string | null
          destination?: string
          id?: string
          mode?: string
          offer_count?: number
          offers?: Json
          operator_note?: string | null
          origin?: string
          quote_id?: string | null
          ready_date?: string | null
          requested_by?: string | null
          source?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "freight_quotes_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freight_quotes_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "vw_quote_followup_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freight_quotes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      hr_absences: {
        Row: {
          absence_type: string
          approved_by: string | null
          created_at: string
          employee_id: string
          end_date: string
          ergani_leave_code: string | null
          id: string
          note: string | null
          start_date: string
          status: string
          working_days: number | null
          workspace_id: string
        }
        Insert: {
          absence_type?: string
          approved_by?: string | null
          created_at?: string
          employee_id: string
          end_date: string
          ergani_leave_code?: string | null
          id?: string
          note?: string | null
          start_date: string
          status?: string
          working_days?: number | null
          workspace_id: string
        }
        Update: {
          absence_type?: string
          approved_by?: string | null
          created_at?: string
          employee_id?: string
          end_date?: string
          ergani_leave_code?: string | null
          id?: string
          note?: string | null
          start_date?: string
          status?: string
          working_days?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_absences_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_absences_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "vw_hr_employee_absence_summary"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "hr_absences_ergani_leave_code_fkey"
            columns: ["ergani_leave_code"]
            isOneToOne: false
            referencedRelation: "ergani_leave_types"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "hr_absences_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_accounting_documents: {
        Row: {
          ai_confidence: number | null
          ai_notes: string | null
          analyzed_at: string | null
          created_at: string
          credits_spent: number
          doc_kind: string | null
          extracted: Json | null
          id: string
          mime: string | null
          name: string
          payroll_run_id: string | null
          period: string
          size_bytes: number | null
          status: string
          storage_bucket: string
          storage_object_path: string
          uploaded_by: string | null
          workspace_id: string
        }
        Insert: {
          ai_confidence?: number | null
          ai_notes?: string | null
          analyzed_at?: string | null
          created_at?: string
          credits_spent?: number
          doc_kind?: string | null
          extracted?: Json | null
          id?: string
          mime?: string | null
          name: string
          payroll_run_id?: string | null
          period: string
          size_bytes?: number | null
          status?: string
          storage_bucket: string
          storage_object_path: string
          uploaded_by?: string | null
          workspace_id: string
        }
        Update: {
          ai_confidence?: number | null
          ai_notes?: string | null
          analyzed_at?: string | null
          created_at?: string
          credits_spent?: number
          doc_kind?: string | null
          extracted?: Json | null
          id?: string
          mime?: string | null
          name?: string
          payroll_run_id?: string | null
          period?: string
          size_bytes?: number | null
          status?: string
          storage_bucket?: string
          storage_object_path?: string
          uploaded_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_accounting_documents_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "hr_payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_accounting_documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_applications: {
        Row: {
          ai_rated_at: string | null
          ai_score: number | null
          ai_summary: string | null
          applied_at: string
          candidate_id: string
          hired_employee_id: string | null
          id: string
          job_posting_id: string
          notes: string | null
          rating: number | null
          stage: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ai_rated_at?: string | null
          ai_score?: number | null
          ai_summary?: string | null
          applied_at?: string
          candidate_id: string
          hired_employee_id?: string | null
          id?: string
          job_posting_id: string
          notes?: string | null
          rating?: number | null
          stage?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ai_rated_at?: string | null
          ai_score?: number | null
          ai_summary?: string | null
          applied_at?: string
          candidate_id?: string
          hired_employee_id?: string | null
          id?: string
          job_posting_id?: string
          notes?: string | null
          rating?: number | null
          stage?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_applications_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "hr_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_applications_hired_employee_id_fkey"
            columns: ["hired_employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_applications_hired_employee_id_fkey"
            columns: ["hired_employee_id"]
            isOneToOne: false
            referencedRelation: "vw_hr_employee_absence_summary"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "hr_applications_job_posting_id_fkey"
            columns: ["job_posting_id"]
            isOneToOne: false
            referencedRelation: "hr_job_postings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_applications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_candidates: {
        Row: {
          created_at: string
          email: string | null
          headline: string | null
          id: string
          name: string
          phone: string | null
          resume_bucket: string | null
          resume_path: string | null
          source: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          headline?: string | null
          id?: string
          name: string
          phone?: string | null
          resume_bucket?: string | null
          resume_path?: string | null
          source?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          headline?: string | null
          id?: string
          name?: string
          phone?: string | null
          resume_bucket?: string | null
          resume_path?: string | null
          source?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_candidates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_checkin_alerts: {
        Row: {
          created_at: string
          employee_id: string
          expected_at: string | null
          id: string
          reference_date: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          expected_at?: string | null
          id?: string
          reference_date: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          expected_at?: string | null
          id?: string
          reference_date?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_checkin_alerts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_checkin_alerts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "vw_hr_employee_absence_summary"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "hr_checkin_alerts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_departments: {
        Row: {
          created_at: string
          description: string | null
          head_contact_id: string | null
          id: string
          name: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          head_contact_id?: string | null
          id?: string
          name: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          head_contact_id?: string | null
          id?: string
          name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_departments_head_contact_id_fkey"
            columns: ["head_contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_departments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_documents: {
        Row: {
          created_at: string
          doc_type: string
          employee_id: string | null
          id: string
          name: string
          size_bytes: number | null
          storage_bucket: string
          storage_object_path: string
          uploaded_by: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          doc_type?: string
          employee_id?: string | null
          id?: string
          name: string
          size_bytes?: number | null
          storage_bucket: string
          storage_object_path: string
          uploaded_by?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          doc_type?: string
          employee_id?: string | null
          id?: string
          name?: string
          size_bytes?: number | null
          storage_bucket?: string
          storage_object_path?: string
          uploaded_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "vw_hr_employee_absence_summary"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "hr_documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_employees: {
        Row: {
          amka: string | null
          annual_leave_allowance_days: number
          clock_pin_hash: string | null
          created_at: string
          crm_contact_id: string
          department_id: string | null
          dependent_children: number
          employment_type: string | null
          end_date: string | null
          ergani_e3: Json
          hourly_rate: number | null
          id: string
          manager_contact_id: string | null
          monthly_salary: number | null
          pay_basis: string
          salary_currency: string | null
          start_date: string | null
          status: string
          updated_at: string
          user_id: string | null
          weekly_hours: number | null
          work_days: number[]
          work_end_time: string | null
          work_start_time: string | null
          workspace_id: string
        }
        Insert: {
          amka?: string | null
          annual_leave_allowance_days?: number
          clock_pin_hash?: string | null
          created_at?: string
          crm_contact_id: string
          department_id?: string | null
          dependent_children?: number
          employment_type?: string | null
          end_date?: string | null
          ergani_e3?: Json
          hourly_rate?: number | null
          id?: string
          manager_contact_id?: string | null
          monthly_salary?: number | null
          pay_basis?: string
          salary_currency?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          weekly_hours?: number | null
          work_days?: number[]
          work_end_time?: string | null
          work_start_time?: string | null
          workspace_id: string
        }
        Update: {
          amka?: string | null
          annual_leave_allowance_days?: number
          clock_pin_hash?: string | null
          created_at?: string
          crm_contact_id?: string
          department_id?: string | null
          dependent_children?: number
          employment_type?: string | null
          end_date?: string | null
          ergani_e3?: Json
          hourly_rate?: number | null
          id?: string
          manager_contact_id?: string | null
          monthly_salary?: number | null
          pay_basis?: string
          salary_currency?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          weekly_hours?: number | null
          work_days?: number[]
          work_end_time?: string | null
          work_start_time?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_employees_crm_contact_id_fkey"
            columns: ["crm_contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "hr_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employees_manager_contact_id_fkey"
            columns: ["manager_contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employees_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_ergani_submissions: {
        Row: {
          created_at: string
          created_by: string | null
          employee_id: string | null
          entity_id: string | null
          entity_type: string | null
          environment: string
          ergani_id: string | null
          error: string | null
          id: string
          protocol: string | null
          request: Json | null
          response: Json | null
          status: string
          submission_type: string
          submit_date: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          employee_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          environment?: string
          ergani_id?: string | null
          error?: string | null
          id?: string
          protocol?: string | null
          request?: Json | null
          response?: Json | null
          status?: string
          submission_type: string
          submit_date?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          employee_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          environment?: string
          ergani_id?: string | null
          error?: string | null
          id?: string
          protocol?: string | null
          request?: Json | null
          response?: Json | null
          status?: string
          submission_type?: string
          submit_date?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_ergani_submissions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_ergani_submissions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "vw_hr_employee_absence_summary"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "hr_ergani_submissions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_job_postings: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string | null
          department_id: string | null
          description: string | null
          employment_type: string | null
          id: string
          location: string | null
          published_at: string | null
          remote: boolean
          requirements: string | null
          salary_max: number | null
          salary_min: number | null
          status: string
          title: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string | null
          department_id?: string | null
          description?: string | null
          employment_type?: string | null
          id?: string
          location?: string | null
          published_at?: string | null
          remote?: boolean
          requirements?: string | null
          salary_max?: number | null
          salary_min?: number | null
          status?: string
          title: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string | null
          department_id?: string | null
          description?: string | null
          employment_type?: string | null
          id?: string
          location?: string | null
          published_at?: string | null
          remote?: boolean
          requirements?: string | null
          salary_max?: number | null
          salary_min?: number | null
          status?: string
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_job_postings_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "hr_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_job_postings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_kiosk_attempts: {
        Row: {
          created_at: string
          id: number
          ip: string | null
          outcome: string | null
          subject: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: never
          ip?: string | null
          outcome?: string | null
          subject?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: never
          ip?: string | null
          outcome?: string | null
          subject?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      hr_onboarding_tasks: {
        Row: {
          assignee_contact_id: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          employee_id: string
          id: string
          sort_order: number
          status: string
          title: string
          workspace_id: string
        }
        Insert: {
          assignee_contact_id?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          employee_id: string
          id?: string
          sort_order?: number
          status?: string
          title: string
          workspace_id: string
        }
        Update: {
          assignee_contact_id?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          employee_id?: string
          id?: string
          sort_order?: number
          status?: string
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_onboarding_tasks_assignee_contact_id_fkey"
            columns: ["assignee_contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_onboarding_tasks_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_onboarding_tasks_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "vw_hr_employee_absence_summary"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "hr_onboarding_tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_payroll_items: {
        Row: {
          basis: string | null
          currency: string
          days_worked: number | null
          deductions: number
          employee_contributions: number
          employee_id: string
          employer_contributions: number
          employer_cost: number
          gross: number
          hours_per_day: number | null
          id: string
          income_tax: number
          net: number
          note: string | null
          rate: number | null
          run_id: string
          workspace_id: string
        }
        Insert: {
          basis?: string | null
          currency?: string
          days_worked?: number | null
          deductions?: number
          employee_contributions?: number
          employee_id: string
          employer_contributions?: number
          employer_cost?: number
          gross?: number
          hours_per_day?: number | null
          id?: string
          income_tax?: number
          net?: number
          note?: string | null
          rate?: number | null
          run_id: string
          workspace_id: string
        }
        Update: {
          basis?: string | null
          currency?: string
          days_worked?: number | null
          deductions?: number
          employee_contributions?: number
          employee_id?: string
          employer_contributions?: number
          employer_cost?: number
          gross?: number
          hours_per_day?: number | null
          id?: string
          income_tax?: number
          net?: number
          note?: string | null
          rate?: number | null
          run_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_payroll_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payroll_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "vw_hr_employee_absence_summary"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "hr_payroll_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "hr_payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payroll_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_payroll_runs: {
        Row: {
          approved_at: string | null
          created_at: string
          created_by: string | null
          currency: string
          id: string
          notes: string | null
          paid_at: string | null
          period: string
          posted_finance_ref: Json | null
          status: string
          total_gross: number
          total_net: number
          workspace_id: string
        }
        Insert: {
          approved_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          period: string
          posted_finance_ref?: Json | null
          status?: string
          total_gross?: number
          total_net?: number
          workspace_id: string
        }
        Update: {
          approved_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          period?: string
          posted_finance_ref?: Json | null
          status?: string
          total_gross?: number
          total_net?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_payroll_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_payroll_settings: {
        Row: {
          bracket_reductions: Json
          contribution_monthly_ceiling: number | null
          country_code: string
          currency: string
          employee_contribution_rate: number
          employer_contribution_rate: number
          income_tax_brackets: Json
          salaries_per_year: number
          tax_credit_base: number
          tax_credit_per_child: Json
          tax_credit_taper_floor: number
          tax_credit_taper_per_1000: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          bracket_reductions?: Json
          contribution_monthly_ceiling?: number | null
          country_code?: string
          currency?: string
          employee_contribution_rate?: number
          employer_contribution_rate?: number
          income_tax_brackets?: Json
          salaries_per_year?: number
          tax_credit_base?: number
          tax_credit_per_child?: Json
          tax_credit_taper_floor?: number
          tax_credit_taper_per_1000?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          bracket_reductions?: Json
          contribution_monthly_ceiling?: number | null
          country_code?: string
          currency?: string
          employee_contribution_rate?: number
          employer_contribution_rate?: number
          income_tax_brackets?: Json
          salaries_per_year?: number
          tax_credit_base?: number
          tax_credit_per_child?: Json
          tax_credit_taper_floor?: number
          tax_credit_taper_per_1000?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_payroll_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_settings: {
        Row: {
          created_at: string
          kiosk_enabled: boolean
          kiosk_require_pin: boolean
          late_alert_enabled: boolean
          late_grace_minutes: number
          notify_emails: string[]
          notify_finance: boolean
          notify_owner: boolean
          notify_user_ids: string[]
          timezone: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          kiosk_enabled?: boolean
          kiosk_require_pin?: boolean
          late_alert_enabled?: boolean
          late_grace_minutes?: number
          notify_emails?: string[]
          notify_finance?: boolean
          notify_owner?: boolean
          notify_user_ids?: string[]
          timezone?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          kiosk_enabled?: boolean
          kiosk_require_pin?: boolean
          late_alert_enabled?: boolean
          late_grace_minutes?: number
          notify_emails?: string[]
          notify_finance?: boolean
          notify_owner?: boolean
          notify_user_ids?: string[]
          timezone?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_time_punches: {
        Row: {
          created_at: string
          created_by: string | null
          employee_id: string
          ergani_protocol: string | null
          id: string
          is_late: boolean | null
          late_reason: string | null
          punch_type: string
          punched_at: string
          reference_date: string
          source: string
          status: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          employee_id: string
          ergani_protocol?: string | null
          id?: string
          is_late?: boolean | null
          late_reason?: string | null
          punch_type: string
          punched_at?: string
          reference_date: string
          source?: string
          status?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          employee_id?: string
          ergani_protocol?: string | null
          id?: string
          is_late?: boolean | null
          late_reason?: string | null
          punch_type?: string
          punched_at?: string
          reference_date?: string
          source?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_time_punches_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_time_punches_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "vw_hr_employee_absence_summary"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "hr_time_punches_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_work_schedules: {
        Row: {
          created_at: string
          created_by: string | null
          details: Json
          effective_from: string
          effective_to: string | null
          employee_id: string
          id: string
          schedule_type: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          details?: Json
          effective_from: string
          effective_to?: string | null
          employee_id: string
          id?: string
          schedule_type: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          details?: Json
          effective_from?: string
          effective_to?: string | null
          employee_id?: string
          id?: string
          schedule_type?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_work_schedules_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_work_schedules_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "vw_hr_employee_absence_summary"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "hr_work_schedules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      inbound_documents: {
        Row: {
          category_id: string | null
          created_at: string
          created_supplier_bill_id: string | null
          currency: string
          doc_type: string | null
          id: string
          issue_date: string | null
          issuer_name: string | null
          issuer_vat: string | null
          lines: Json
          mark: string
          raw: Json | null
          status: string
          total_gross: number | null
          total_net: number | null
          total_vat: number | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          created_supplier_bill_id?: string | null
          currency?: string
          doc_type?: string | null
          id?: string
          issue_date?: string | null
          issuer_name?: string | null
          issuer_vat?: string | null
          lines?: Json
          mark: string
          raw?: Json | null
          status?: string
          total_gross?: number | null
          total_net?: number | null
          total_vat?: number | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          created_supplier_bill_id?: string | null
          currency?: string
          doc_type?: string | null
          id?: string
          issue_date?: string | null
          issuer_name?: string | null
          issuer_vat?: string | null
          lines?: Json
          mark?: string
          raw?: Json | null
          status?: string
          total_gross?: number | null
          total_net?: number | null
          total_vat?: number | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbound_documents_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_documents_created_supplier_bill_id_fkey"
            columns: ["created_supplier_bill_id"]
            isOneToOne: false
            referencedRelation: "supplier_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_documents_created_supplier_bill_id_fkey"
            columns: ["created_supplier_bill_id"]
            isOneToOne: false
            referencedRelation: "vw_ap_aging"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_shipments: {
        Row: {
          carrier: string | null
          created_at: string
          created_by: string | null
          destination: string | null
          eta: string | null
          id: string
          is_active: boolean
          last_event: string | null
          last_polled_at: string | null
          milestones: Json
          order_id: string | null
          origin: string | null
          provider: string
          provider_ref: string | null
          raw: Json | null
          reference: string
          status: string
          tracking_type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          carrier?: string | null
          created_at?: string
          created_by?: string | null
          destination?: string | null
          eta?: string | null
          id?: string
          is_active?: boolean
          last_event?: string | null
          last_polled_at?: string | null
          milestones?: Json
          order_id?: string | null
          origin?: string | null
          provider?: string
          provider_ref?: string | null
          raw?: Json | null
          reference: string
          status?: string
          tracking_type?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          carrier?: string | null
          created_at?: string
          created_by?: string | null
          destination?: string | null
          eta?: string | null
          id?: string
          is_active?: boolean
          last_event?: string | null
          last_polled_at?: string | null
          milestones?: Json
          order_id?: string | null
          origin?: string | null
          provider?: string
          provider_ref?: string | null
          raw?: Json | null
          reference?: string
          status?: string
          tracking_type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbound_shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_shipments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_messages: {
        Row: {
          attachments: Json
          body: string | null
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          message_type: Database["public"]["Enums"]["inbox_message_type"]
          metadata: Json
          sender_participant_id: string | null
          thread_id: string
        }
        Insert: {
          attachments?: Json
          body?: string | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          message_type?: Database["public"]["Enums"]["inbox_message_type"]
          metadata?: Json
          sender_participant_id?: string | null
          thread_id: string
        }
        Update: {
          attachments?: Json
          body?: string | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          message_type?: Database["public"]["Enums"]["inbox_message_type"]
          metadata?: Json
          sender_participant_id?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_messages_sender_participant_id_fkey"
            columns: ["sender_participant_id"]
            isOneToOne: false
            referencedRelation: "inbox_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "inbox_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_participants: {
        Row: {
          added_by: string | null
          agent_id: string | null
          contact_id: string | null
          created_at: string
          id: string
          joined_at: string
          last_read_at: string | null
          participant_type: Database["public"]["Enums"]["inbox_participant_type"]
          status: Database["public"]["Enums"]["inbox_participant_status"]
          thread_id: string
          thread_role: Database["public"]["Enums"]["inbox_thread_role"]
          updated_at: string
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          added_by?: string | null
          agent_id?: string | null
          contact_id?: string | null
          created_at?: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          participant_type: Database["public"]["Enums"]["inbox_participant_type"]
          status?: Database["public"]["Enums"]["inbox_participant_status"]
          thread_id: string
          thread_role?: Database["public"]["Enums"]["inbox_thread_role"]
          updated_at?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          added_by?: string | null
          agent_id?: string | null
          contact_id?: string | null
          created_at?: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          participant_type?: Database["public"]["Enums"]["inbox_participant_type"]
          status?: Database["public"]["Enums"]["inbox_participant_status"]
          thread_id?: string
          thread_role?: Database["public"]["Enums"]["inbox_thread_role"]
          updated_at?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inbox_participants_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_participants_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "inbox_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_participants_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_thread_tokens: {
        Row: {
          claimed_by_user_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          thread_id: string
          token: string
        }
        Insert: {
          claimed_by_user_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          thread_id: string
          token?: string
        }
        Update: {
          claimed_by_user_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          thread_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_thread_tokens_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_thread_tokens_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "inbox_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_threads: {
        Row: {
          agent_id: string | null
          agent_state: string
          channel: Database["public"]["Enums"]["inbox_channel"]
          created_at: string
          created_by: string | null
          id: string
          last_message_at: string
          metadata: Json
          status: Database["public"]["Enums"]["inbox_thread_status"]
          subject: string | null
          thread_type: Database["public"]["Enums"]["inbox_thread_type"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          agent_id?: string | null
          agent_state?: string
          channel?: Database["public"]["Enums"]["inbox_channel"]
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string
          metadata?: Json
          status?: Database["public"]["Enums"]["inbox_thread_status"]
          subject?: string | null
          thread_type?: Database["public"]["Enums"]["inbox_thread_type"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          agent_id?: string | null
          agent_state?: string
          channel?: Database["public"]["Enums"]["inbox_channel"]
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string
          metadata?: Json
          status?: Database["public"]["Enums"]["inbox_thread_status"]
          subject?: string | null
          thread_type?: Database["public"]["Enums"]["inbox_thread_type"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_threads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
      invoice_items: {
        Row: {
          added_at: string
          deductions_amount: number | null
          description: string | null
          discounted_price: number | null
          fees_amount: number | null
          fees_category: number | null
          id: string
          income_classification_category: string | null
          income_classification_type: string | null
          invoice_id: string
          line_comments: string | null
          line_cost: number | null
          line_margin: number | null
          line_total: number
          measurement_unit_code: number | null
          net_value: number | null
          other_taxes_amount: number | null
          other_taxes_category: number | null
          product_id: string | null
          quantity: number
          selected_attributes: Json
          selected_color: string | null
          selected_size: string | null
          sku: string | null
          source_quote_item_id: string | null
          stamp_duty_amount: number | null
          stamp_duty_category: number | null
          unit: string | null
          unit_cost_snapshot: number | null
          unit_price: number
          vat_amount: number | null
          vat_category: number | null
          vat_exemption_category: number | null
          withheld_amount: number | null
          withheld_category: number | null
        }
        Insert: {
          added_at?: string
          deductions_amount?: number | null
          description?: string | null
          discounted_price?: number | null
          fees_amount?: number | null
          fees_category?: number | null
          id?: string
          income_classification_category?: string | null
          income_classification_type?: string | null
          invoice_id: string
          line_comments?: string | null
          line_cost?: number | null
          line_margin?: number | null
          line_total?: number
          measurement_unit_code?: number | null
          net_value?: number | null
          other_taxes_amount?: number | null
          other_taxes_category?: number | null
          product_id?: string | null
          quantity?: number
          selected_attributes?: Json
          selected_color?: string | null
          selected_size?: string | null
          sku?: string | null
          source_quote_item_id?: string | null
          stamp_duty_amount?: number | null
          stamp_duty_category?: number | null
          unit?: string | null
          unit_cost_snapshot?: number | null
          unit_price?: number
          vat_amount?: number | null
          vat_category?: number | null
          vat_exemption_category?: number | null
          withheld_amount?: number | null
          withheld_category?: number | null
        }
        Update: {
          added_at?: string
          deductions_amount?: number | null
          description?: string | null
          discounted_price?: number | null
          fees_amount?: number | null
          fees_category?: number | null
          id?: string
          income_classification_category?: string | null
          income_classification_type?: string | null
          invoice_id?: string
          line_comments?: string | null
          line_cost?: number | null
          line_margin?: number | null
          line_total?: number
          measurement_unit_code?: number | null
          net_value?: number | null
          other_taxes_amount?: number | null
          other_taxes_category?: number | null
          product_id?: string | null
          quantity?: number
          selected_attributes?: Json
          selected_color?: string | null
          selected_size?: string | null
          sku?: string | null
          source_quote_item_id?: string | null
          stamp_duty_amount?: number | null
          stamp_duty_category?: number | null
          unit?: string | null
          unit_cost_snapshot?: number | null
          unit_price?: number
          vat_amount?: number | null
          vat_category?: number | null
          vat_exemption_category?: number | null
          withheld_amount?: number | null
          withheld_category?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "vw_ar_aging"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_source_quote_item_id_fkey"
            columns: ["source_quote_item_id"]
            isOneToOne: false
            referencedRelation: "quote_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_source_quote_item_id_fkey"
            columns: ["source_quote_item_id"]
            isOneToOne: false
            referencedRelation: "quote_items_with_room"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_due: number | null
          amount_paid: number
          b2g_details: Json | null
          branch_code: number
          cash_discount_pct: number
          category_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_address_unit_id: string | null
          customer_company_id: string | null
          customer_contact_id: string | null
          digital_transaction_fee: number
          doc_language: string
          document_type: string | null
          due_at: string | null
          exchange_rate: number | null
          fiscal_connector_slug: string | null
          fiscal_mark: string | null
          fiscal_qr_url: string | null
          fiscal_status: string | null
          fiscal_submitted_at: string | null
          fiscal_uid: string | null
          fx_rate_to_base: number
          has_shipping: boolean
          id: string
          include_in_myf: boolean
          info_box: string | null
          internal_number: string
          invoice_kind: string
          is_b2g: boolean
          issued_at: string | null
          legal_number: string | null
          logo_mode: string
          move_purpose: string | null
          move_stock: boolean
          notes: string | null
          order_id: string | null
          page_count: number | null
          paid_at: string | null
          paid_upfront: boolean
          pay_token: string | null
          pay_token_expires_at: string | null
          payment_method_code: number | null
          payment_method_info: string | null
          payment_terms_days: number | null
          pdf_generated_at: string | null
          pdf_generation_status: string | null
          pdf_storage_path: string | null
          pos_session_id: string | null
          prices_include_vat: boolean
          print_online_code: boolean
          print_terms: boolean
          progress_pct: number | null
          project_id: string | null
          quote_id: string | null
          related_document: string | null
          responsible: string | null
          self_pricing: boolean
          series: string | null
          series_number: number | null
          ship_from: string | null
          ship_to: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          subtotal_net: number
          template_colors: Json | null
          template_id: string | null
          total: number
          total_deductions_amount: number
          total_fees_amount: number
          total_other_taxes_amount: number
          total_stamp_duty_amount: number
          total_withheld_amount: number
          transport_date: string | null
          transport_time: string | null
          updated_at: string
          vat_amount: number
          vat_payment_suspension: boolean
          vat_rate: number
          vehicle_number: string | null
          workspace_id: string
        }
        Insert: {
          amount_due?: number | null
          amount_paid?: number
          b2g_details?: Json | null
          branch_code?: number
          cash_discount_pct?: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_address_unit_id?: string | null
          customer_company_id?: string | null
          customer_contact_id?: string | null
          digital_transaction_fee?: number
          doc_language?: string
          document_type?: string | null
          due_at?: string | null
          exchange_rate?: number | null
          fiscal_connector_slug?: string | null
          fiscal_mark?: string | null
          fiscal_qr_url?: string | null
          fiscal_status?: string | null
          fiscal_submitted_at?: string | null
          fiscal_uid?: string | null
          fx_rate_to_base?: number
          has_shipping?: boolean
          id?: string
          include_in_myf?: boolean
          info_box?: string | null
          internal_number: string
          invoice_kind?: string
          is_b2g?: boolean
          issued_at?: string | null
          legal_number?: string | null
          logo_mode?: string
          move_purpose?: string | null
          move_stock?: boolean
          notes?: string | null
          order_id?: string | null
          page_count?: number | null
          paid_at?: string | null
          paid_upfront?: boolean
          pay_token?: string | null
          pay_token_expires_at?: string | null
          payment_method_code?: number | null
          payment_method_info?: string | null
          payment_terms_days?: number | null
          pdf_generated_at?: string | null
          pdf_generation_status?: string | null
          pdf_storage_path?: string | null
          pos_session_id?: string | null
          prices_include_vat?: boolean
          print_online_code?: boolean
          print_terms?: boolean
          progress_pct?: number | null
          project_id?: string | null
          quote_id?: string | null
          related_document?: string | null
          responsible?: string | null
          self_pricing?: boolean
          series?: string | null
          series_number?: number | null
          ship_from?: string | null
          ship_to?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          subtotal_net?: number
          template_colors?: Json | null
          template_id?: string | null
          total?: number
          total_deductions_amount?: number
          total_fees_amount?: number
          total_other_taxes_amount?: number
          total_stamp_duty_amount?: number
          total_withheld_amount?: number
          transport_date?: string | null
          transport_time?: string | null
          updated_at?: string
          vat_amount?: number
          vat_payment_suspension?: boolean
          vat_rate?: number
          vehicle_number?: string | null
          workspace_id: string
        }
        Update: {
          amount_due?: number | null
          amount_paid?: number
          b2g_details?: Json | null
          branch_code?: number
          cash_discount_pct?: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_address_unit_id?: string | null
          customer_company_id?: string | null
          customer_contact_id?: string | null
          digital_transaction_fee?: number
          doc_language?: string
          document_type?: string | null
          due_at?: string | null
          exchange_rate?: number | null
          fiscal_connector_slug?: string | null
          fiscal_mark?: string | null
          fiscal_qr_url?: string | null
          fiscal_status?: string | null
          fiscal_submitted_at?: string | null
          fiscal_uid?: string | null
          fx_rate_to_base?: number
          has_shipping?: boolean
          id?: string
          include_in_myf?: boolean
          info_box?: string | null
          internal_number?: string
          invoice_kind?: string
          is_b2g?: boolean
          issued_at?: string | null
          legal_number?: string | null
          logo_mode?: string
          move_purpose?: string | null
          move_stock?: boolean
          notes?: string | null
          order_id?: string | null
          page_count?: number | null
          paid_at?: string | null
          paid_upfront?: boolean
          pay_token?: string | null
          pay_token_expires_at?: string | null
          payment_method_code?: number | null
          payment_method_info?: string | null
          payment_terms_days?: number | null
          pdf_generated_at?: string | null
          pdf_generation_status?: string | null
          pdf_storage_path?: string | null
          pos_session_id?: string | null
          prices_include_vat?: boolean
          print_online_code?: boolean
          print_terms?: boolean
          progress_pct?: number | null
          project_id?: string | null
          quote_id?: string | null
          related_document?: string | null
          responsible?: string | null
          self_pricing?: boolean
          series?: string | null
          series_number?: number | null
          ship_from?: string | null
          ship_to?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          subtotal_net?: number
          template_colors?: Json | null
          template_id?: string | null
          total?: number
          total_deductions_amount?: number
          total_fees_amount?: number
          total_other_taxes_amount?: number
          total_stamp_duty_amount?: number
          total_withheld_amount?: number
          transport_date?: string | null
          transport_time?: string | null
          updated_at?: string
          vat_amount?: number
          vat_payment_suspension?: boolean
          vat_rate?: number
          vehicle_number?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_address_unit_id_fkey"
            columns: ["customer_address_unit_id"]
            isOneToOne: false
            referencedRelation: "crm_address_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_company_id_fkey"
            columns: ["customer_company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_contact_id_fkey"
            columns: ["customer_contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_pos_session_id_fkey"
            columns: ["pos_session_id"]
            isOneToOne: false
            referencedRelation: "pos_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "vw_quote_followup_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      job_alert_log: {
        Row: {
          alert_type: string
          channels: string[]
          channels_skipped: string[] | null
          created_at: string
          id: string
          listing_count: number | null
          payload: Json | null
          tracked_job_id: string | null
          user_id: string | null
        }
        Insert: {
          alert_type: string
          channels?: string[]
          channels_skipped?: string[] | null
          created_at?: string
          id?: string
          listing_count?: number | null
          payload?: Json | null
          tracked_job_id?: string | null
          user_id?: string | null
        }
        Update: {
          alert_type?: string
          channels?: string[]
          channels_skipped?: string[] | null
          created_at?: string
          id?: string
          listing_count?: number | null
          payload?: Json | null
          tracked_job_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_alert_log_tracked_job_id_fkey"
            columns: ["tracked_job_id"]
            isOneToOne: false
            referencedRelation: "job_research_summary"
            referencedColumns: ["tracked_job_id"]
          },
          {
            foreignKeyName: "job_alert_log_tracked_job_id_fkey"
            columns: ["tracked_job_id"]
            isOneToOne: false
            referencedRelation: "tracked_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_board_index: {
        Row: {
          distinct_employers: number
          domain: string
          first_seen_at: string
          last_seen_at: string
          promoted_at: string | null
          refresh_runs: number
          sample_employers: string[]
          status: string
          verified_matches: number
        }
        Insert: {
          distinct_employers?: number
          domain: string
          first_seen_at?: string
          last_seen_at?: string
          promoted_at?: string | null
          refresh_runs?: number
          sample_employers?: string[]
          status?: string
          verified_matches?: number
        }
        Update: {
          distinct_employers?: number
          domain?: string
          first_seen_at?: string
          last_seen_at?: string
          promoted_at?: string | null
          refresh_runs?: number
          sample_employers?: string[]
          status?: string
          verified_matches?: number
        }
        Relationships: []
      }
      job_classifier_verdict_cache: {
        Row: {
          cache_key: string
          created_at: string
          expires_at: string
          id: string
          match_note: string | null
          relevance: string
          relevance_score: number | null
        }
        Insert: {
          cache_key: string
          created_at?: string
          expires_at?: string
          id?: string
          match_note?: string | null
          relevance: string
          relevance_score?: number | null
        }
        Update: {
          cache_key?: string
          created_at?: string
          expires_at?: string
          id?: string
          match_note?: string | null
          relevance?: string
          relevance_score?: number | null
        }
        Relationships: []
      }
      job_excluded_urls: {
        Row: {
          company: string | null
          created_at: string
          domain: string | null
          id: string
          reason: string | null
          tracked_job_id: string
          url: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          domain?: string | null
          id?: string
          reason?: string | null
          tracked_job_id: string
          url?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          domain?: string | null
          id?: string
          reason?: string | null
          tracked_job_id?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_excluded_urls_tracked_job_id_fkey"
            columns: ["tracked_job_id"]
            isOneToOne: false
            referencedRelation: "job_research_summary"
            referencedColumns: ["tracked_job_id"]
          },
          {
            foreignKeyName: "job_excluded_urls_tracked_job_id_fkey"
            columns: ["tracked_job_id"]
            isOneToOne: false
            referencedRelation: "tracked_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_listings: {
        Row: {
          canonical_url: string
          classifier_cached: boolean | null
          company: string | null
          company_domain: string | null
          content_hash: string
          created_at: string
          description_excerpt: string | null
          description_md: string | null
          digest_included_at: string | null
          discovered_at: string
          employment_type: string | null
          expires_at: string | null
          id: string
          is_remote: boolean | null
          location: string | null
          match_note: string | null
          posted_at: string | null
          raw_payload: Json | null
          refresh_run_id: string
          relevance: string | null
          relevance_score: number | null
          salary_annual_max_usd: number | null
          salary_annual_min_usd: number | null
          salary_currency: string | null
          salary_max: number | null
          salary_min: number | null
          salary_normalization_note: string | null
          salary_period: string | null
          seniority: string | null
          source: string
          title: string | null
          tracked_job_id: string
          url: string
          user_action: string | null
          user_action_at: string | null
          user_notes: string | null
        }
        Insert: {
          canonical_url: string
          classifier_cached?: boolean | null
          company?: string | null
          company_domain?: string | null
          content_hash: string
          created_at?: string
          description_excerpt?: string | null
          description_md?: string | null
          digest_included_at?: string | null
          discovered_at?: string
          employment_type?: string | null
          expires_at?: string | null
          id?: string
          is_remote?: boolean | null
          location?: string | null
          match_note?: string | null
          posted_at?: string | null
          raw_payload?: Json | null
          refresh_run_id: string
          relevance?: string | null
          relevance_score?: number | null
          salary_annual_max_usd?: number | null
          salary_annual_min_usd?: number | null
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          salary_normalization_note?: string | null
          salary_period?: string | null
          seniority?: string | null
          source: string
          title?: string | null
          tracked_job_id: string
          url: string
          user_action?: string | null
          user_action_at?: string | null
          user_notes?: string | null
        }
        Update: {
          canonical_url?: string
          classifier_cached?: boolean | null
          company?: string | null
          company_domain?: string | null
          content_hash?: string
          created_at?: string
          description_excerpt?: string | null
          description_md?: string | null
          digest_included_at?: string | null
          discovered_at?: string
          employment_type?: string | null
          expires_at?: string | null
          id?: string
          is_remote?: boolean | null
          location?: string | null
          match_note?: string | null
          posted_at?: string | null
          raw_payload?: Json | null
          refresh_run_id?: string
          relevance?: string | null
          relevance_score?: number | null
          salary_annual_max_usd?: number | null
          salary_annual_min_usd?: number | null
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          salary_normalization_note?: string | null
          salary_period?: string | null
          seniority?: string | null
          source?: string
          title?: string | null
          tracked_job_id?: string
          url?: string
          user_action?: string | null
          user_action_at?: string | null
          user_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_listings_tracked_job_id_fkey"
            columns: ["tracked_job_id"]
            isOneToOne: false
            referencedRelation: "job_research_summary"
            referencedColumns: ["tracked_job_id"]
          },
          {
            foreignKeyName: "job_listings_tracked_job_id_fkey"
            columns: ["tracked_job_id"]
            isOneToOne: false
            referencedRelation: "tracked_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_match_corrections: {
        Row: {
          corrected_relevance: string
          created_at: string
          id: string
          job_listing_id: string | null
          original_relevance: string | null
          reason: string | null
          tracked_job_id: string | null
          user_id: string | null
        }
        Insert: {
          corrected_relevance: string
          created_at?: string
          id?: string
          job_listing_id?: string | null
          original_relevance?: string | null
          reason?: string | null
          tracked_job_id?: string | null
          user_id?: string | null
        }
        Update: {
          corrected_relevance?: string
          created_at?: string
          id?: string
          job_listing_id?: string | null
          original_relevance?: string | null
          reason?: string | null
          tracked_job_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_match_corrections_job_listing_id_fkey"
            columns: ["job_listing_id"]
            isOneToOne: false
            referencedRelation: "job_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_match_corrections_tracked_job_id_fkey"
            columns: ["tracked_job_id"]
            isOneToOne: false
            referencedRelation: "job_research_summary"
            referencedColumns: ["tracked_job_id"]
          },
          {
            foreignKeyName: "job_match_corrections_tracked_job_id_fkey"
            columns: ["tracked_job_id"]
            isOneToOne: false
            referencedRelation: "tracked_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_research_sites: {
        Row: {
          auto_added: boolean
          auto_disabled_at: string | null
          browse_url: string | null
          category: string | null
          country_code: string | null
          created_at: string
          created_by: string | null
          discovered_via: string | null
          display_name: string | null
          id: string
          is_enabled: boolean
          last_yield_at: string | null
          lifetime_verified: number
          manual_review: boolean
          manual_review_reason: string | null
          notes: string | null
          site_type: string
          updated_at: string
          url_or_domain: string
        }
        Insert: {
          auto_added?: boolean
          auto_disabled_at?: string | null
          browse_url?: string | null
          category?: string | null
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          discovered_via?: string | null
          display_name?: string | null
          id?: string
          is_enabled?: boolean
          last_yield_at?: string | null
          lifetime_verified?: number
          manual_review?: boolean
          manual_review_reason?: string | null
          notes?: string | null
          site_type: string
          updated_at?: string
          url_or_domain: string
        }
        Update: {
          auto_added?: boolean
          auto_disabled_at?: string | null
          browse_url?: string | null
          category?: string | null
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          discovered_via?: string | null
          display_name?: string | null
          id?: string
          is_enabled?: boolean
          last_yield_at?: string | null
          lifetime_verified?: number
          manual_review?: boolean
          manual_review_reason?: string | null
          notes?: string | null
          site_type?: string
          updated_at?: string
          url_or_domain?: string
        }
        Relationships: []
      }
      job_source_review: {
        Row: {
          created_at: string
          disabled: string[] | null
          flagged: string[] | null
          id: string
          per_domain: Json | null
          promoted: string[] | null
          refresh_run_id: string | null
          summary: string | null
          tracked_job_id: string | null
        }
        Insert: {
          created_at?: string
          disabled?: string[] | null
          flagged?: string[] | null
          id?: string
          per_domain?: Json | null
          promoted?: string[] | null
          refresh_run_id?: string | null
          summary?: string | null
          tracked_job_id?: string | null
        }
        Update: {
          created_at?: string
          disabled?: string[] | null
          flagged?: string[] | null
          id?: string
          per_domain?: Json | null
          promoted?: string[] | null
          refresh_run_id?: string | null
          summary?: string | null
          tracked_job_id?: string | null
        }
        Relationships: []
      }
      job_url_verification_cache: {
        Row: {
          canonical_url: string
          checked_at: string
          company: string | null
          expires_at: string
          is_closed: boolean
          is_valid: boolean
          posted_at_text: string | null
          source: string | null
          title: string | null
        }
        Insert: {
          canonical_url: string
          checked_at?: string
          company?: string | null
          expires_at?: string
          is_closed?: boolean
          is_valid: boolean
          posted_at_text?: string | null
          source?: string | null
          title?: string | null
        }
        Update: {
          canonical_url?: string
          checked_at?: string
          company?: string | null
          expires_at?: string
          is_closed?: boolean
          is_valid?: boolean
          posted_at_text?: string | null
          source?: string | null
          title?: string | null
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
          is_locked: boolean
          material_category_id: string | null
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
          is_locked?: boolean
          material_category_id?: string | null
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
          is_locked?: boolean
          material_category_id?: string | null
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
            foreignKeyName: "kb_categories_material_category_id_fkey"
            columns: ["material_category_id"]
            isOneToOne: false
            referencedRelation: "material_categories"
            referencedColumns: ["id"]
          },
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
      kb_doc_chunks: {
        Row: {
          char_end: number
          char_start: number
          chunk_index: number
          content: string
          created_at: string | null
          embedding_model: string | null
          heading: string | null
          id: string
          kb_doc_id: string
          schema_version: number | null
          text_embedding: unknown
          token_count: number | null
          workspace_id: string
        }
        Insert: {
          char_end: number
          char_start: number
          chunk_index: number
          content: string
          created_at?: string | null
          embedding_model?: string | null
          heading?: string | null
          id?: string
          kb_doc_id: string
          schema_version?: number | null
          text_embedding?: unknown
          token_count?: number | null
          workspace_id: string
        }
        Update: {
          char_end?: number
          char_start?: number
          chunk_index?: number
          content?: string
          created_at?: string | null
          embedding_model?: string | null
          heading?: string | null
          id?: string
          kb_doc_id?: string
          schema_version?: number | null
          text_embedding?: unknown
          token_count?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kb_doc_chunks_kb_doc_id_fkey"
            columns: ["kb_doc_id"]
            isOneToOne: false
            referencedRelation: "kb_docs"
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
          allowed_agents: string[] | null
          category_id: string | null
          content: string
          content_markdown: string | null
          content_tier: number
          created_at: string | null
          created_by: string | null
          embedding_dimension: number | null
          embedding_error_message: string | null
          embedding_generated_at: string | null
          embedding_generation_time_ms: number | null
          embedding_model: string | null
          embedding_status: string | null
          id: string
          is_locked: boolean | null
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
          allowed_agents?: string[] | null
          category_id?: string | null
          content: string
          content_markdown?: string | null
          content_tier?: number
          created_at?: string | null
          created_by?: string | null
          embedding_dimension?: number | null
          embedding_error_message?: string | null
          embedding_generated_at?: string | null
          embedding_generation_time_ms?: number | null
          embedding_model?: string | null
          embedding_status?: string | null
          id?: string
          is_locked?: boolean | null
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
          allowed_agents?: string[] | null
          category_id?: string | null
          content?: string
          content_markdown?: string | null
          content_tier?: number
          created_at?: string | null
          created_by?: string | null
          embedding_dimension?: number | null
          embedding_error_message?: string | null
          embedding_generated_at?: string | null
          embedding_generation_time_ms?: number | null
          embedding_model?: string | null
          embedding_status?: string | null
          id?: string
          is_locked?: boolean | null
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
      llm_mention_probes: {
        Row: {
          competitors_mentioned: string[] | null
          context_snippet: string | null
          cost_usd: number | null
          error: string | null
          id: string
          input_tokens: number | null
          latency_ms: number | null
          mentioned: boolean | null
          model: string
          output_tokens: number | null
          position: number | null
          probe_run_id: string
          probe_template_key: string
          prompt_text: string
          response_text: string | null
          run_at: string
          sentiment: Database["public"]["Enums"]["mention_sentiment"] | null
          tracked_mention_id: string
        }
        Insert: {
          competitors_mentioned?: string[] | null
          context_snippet?: string | null
          cost_usd?: number | null
          error?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          mentioned?: boolean | null
          model: string
          output_tokens?: number | null
          position?: number | null
          probe_run_id: string
          probe_template_key: string
          prompt_text: string
          response_text?: string | null
          run_at?: string
          sentiment?: Database["public"]["Enums"]["mention_sentiment"] | null
          tracked_mention_id: string
        }
        Update: {
          competitors_mentioned?: string[] | null
          context_snippet?: string | null
          cost_usd?: number | null
          error?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          mentioned?: boolean | null
          model?: string
          output_tokens?: number | null
          position?: number | null
          probe_run_id?: string
          probe_template_key?: string
          prompt_text?: string
          response_text?: string | null
          run_at?: string
          sentiment?: Database["public"]["Enums"]["mention_sentiment"] | null
          tracked_mention_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "llm_mention_probes_tracked_mention_id_fkey"
            columns: ["tracked_mention_id"]
            isOneToOne: false
            referencedRelation: "tracked_mentions"
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
      marketplace_inquiries: {
        Row: {
          accepted_at: string | null
          accepted_order_id: string | null
          buyer_name: string | null
          buyer_user_id: string
          buyer_workspace_id: string
          created_at: string
          demand_id: string | null
          demand_type: string | null
          id: string
          inbox_thread_id: string | null
          listing_id: string
          message: string | null
          qty_wanted: number | null
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_order_id?: string | null
          buyer_name?: string | null
          buyer_user_id: string
          buyer_workspace_id: string
          created_at?: string
          demand_id?: string | null
          demand_type?: string | null
          id?: string
          inbox_thread_id?: string | null
          listing_id: string
          message?: string | null
          qty_wanted?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_order_id?: string | null
          buyer_name?: string | null
          buyer_user_id?: string
          buyer_workspace_id?: string
          created_at?: string
          demand_id?: string | null
          demand_type?: string | null
          id?: string
          inbox_thread_id?: string | null
          listing_id?: string
          message?: string | null
          qty_wanted?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_inquiries_accepted_order_id_fkey"
            columns: ["accepted_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_inquiries_buyer_workspace_id_fkey"
            columns: ["buyer_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_inquiries_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_listings: {
        Row: {
          batch_lot: string | null
          condition: string
          country_code: string | null
          created_at: string
          created_by: string | null
          currency: string
          delivery_option: string
          description: string | null
          expires_at: string | null
          id: string
          image_urls: string[]
          location_city: string | null
          location_region: string | null
          material_category: string | null
          price: number
          product_id: string | null
          qty_listed: number
          qty_remaining: number
          seller_name: string | null
          specs: Json
          status: string
          title: string
          unit: string
          updated_at: string
          view_count: number
          warehouse_item_id: string | null
          workspace_id: string
        }
        Insert: {
          batch_lot?: string | null
          condition?: string
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          delivery_option?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          image_urls?: string[]
          location_city?: string | null
          location_region?: string | null
          material_category?: string | null
          price: number
          product_id?: string | null
          qty_listed: number
          qty_remaining: number
          seller_name?: string | null
          specs?: Json
          status?: string
          title: string
          unit?: string
          updated_at?: string
          view_count?: number
          warehouse_item_id?: string | null
          workspace_id: string
        }
        Update: {
          batch_lot?: string | null
          condition?: string
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          delivery_option?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          image_urls?: string[]
          location_city?: string | null
          location_region?: string | null
          material_category?: string | null
          price?: number
          product_id?: string | null
          qty_listed?: number
          qty_remaining?: number
          seller_name?: string | null
          specs?: Json
          status?: string
          title?: string
          unit?: string
          updated_at?: string
          view_count?: number
          warehouse_item_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_listings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_listings_warehouse_item_id_fkey"
            columns: ["warehouse_item_id"]
            isOneToOne: false
            referencedRelation: "warehouse_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_listings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_want_lists: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          keyword: string | null
          label: string | null
          last_notified_at: string | null
          location_city: string | null
          material_category: string | null
          max_price: number | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          keyword?: string | null
          label?: string | null
          last_notified_at?: string | null
          location_city?: string | null
          material_category?: string | null
          max_price?: number | null
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          keyword?: string | null
          label?: string | null
          last_notified_at?: string | null
          location_city?: string | null
          material_category?: string | null
          max_price?: number | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_want_lists_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      master_request_lines: {
        Row: {
          created_at: string
          decline_reason: string | null
          id: string
          master_request_id: string
          priced_at: string | null
          priced_by: string | null
          priced_currency: string
          priced_unit_cost: number | null
          product_id: string | null
          quantity: number
          quote_item_id: string
          status: string
        }
        Insert: {
          created_at?: string
          decline_reason?: string | null
          id?: string
          master_request_id: string
          priced_at?: string | null
          priced_by?: string | null
          priced_currency?: string
          priced_unit_cost?: number | null
          product_id?: string | null
          quantity?: number
          quote_item_id: string
          status?: string
        }
        Update: {
          created_at?: string
          decline_reason?: string | null
          id?: string
          master_request_id?: string
          priced_at?: string | null
          priced_by?: string | null
          priced_currency?: string
          priced_unit_cost?: number | null
          product_id?: string | null
          quantity?: number
          quote_item_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "master_request_lines_master_request_id_fkey"
            columns: ["master_request_id"]
            isOneToOne: false
            referencedRelation: "master_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "master_request_lines_quote_item_id_fkey"
            columns: ["quote_item_id"]
            isOneToOne: false
            referencedRelation: "quote_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "master_request_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      master_requests: {
        Row: {
          amount: number | null
          created_at: string
          created_by: string | null
          currency: string | null
          escalated_from: string | null
          id: string
          note: string | null
          parent_workspace_id: string
          priced_at: string | null
          priced_by: string | null
          quote_id: string
          requester_workspace_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          escalated_from?: string | null
          id?: string
          note?: string | null
          parent_workspace_id: string
          priced_at?: string | null
          priced_by?: string | null
          quote_id: string
          requester_workspace_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          escalated_from?: string | null
          id?: string
          note?: string | null
          parent_workspace_id?: string
          priced_at?: string | null
          priced_by?: string | null
          quote_id?: string
          requester_workspace_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "master_requests_escalated_from_fkey"
            columns: ["escalated_from"]
            isOneToOne: false
            referencedRelation: "master_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "master_requests_parent_workspace_id_fkey"
            columns: ["parent_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "master_requests_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "master_requests_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "vw_quote_followup_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "master_requests_requester_workspace_id_fkey"
            columns: ["requester_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      material_category_aliases: {
        Row: {
          alias: string
          category_key: string
          created_at: string
        }
        Insert: {
          alias: string
          category_key: string
          created_at?: string
        }
        Update: {
          alias?: string
          category_key?: string
          created_at?: string
        }
        Relationships: []
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
          is_hidden: boolean
          is_verified: boolean
          product_id: string
          rating: number
          review_text: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_hidden?: boolean
          is_verified?: boolean
          product_id: string
          rating: number
          review_text?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_hidden?: boolean
          is_verified?: boolean
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
      mention_alert_log: {
        Row: {
          alert_type: Database["public"]["Enums"]["mention_alert_type"]
          channels_fired: string[] | null
          channels_skipped: string[] | null
          created_at: string | null
          credits_charged: number | null
          id: string
          outlet_domain: string | null
          outlet_name: string | null
          payload: Json | null
          product_id: string | null
          tracked_mention_id: string | null
          user_id: string | null
        }
        Insert: {
          alert_type: Database["public"]["Enums"]["mention_alert_type"]
          channels_fired?: string[] | null
          channels_skipped?: string[] | null
          created_at?: string | null
          credits_charged?: number | null
          id?: string
          outlet_domain?: string | null
          outlet_name?: string | null
          payload?: Json | null
          product_id?: string | null
          tracked_mention_id?: string | null
          user_id?: string | null
        }
        Update: {
          alert_type?: Database["public"]["Enums"]["mention_alert_type"]
          channels_fired?: string[] | null
          channels_skipped?: string[] | null
          created_at?: string | null
          credits_charged?: number | null
          id?: string
          outlet_domain?: string | null
          outlet_name?: string | null
          payload?: Json | null
          product_id?: string | null
          tracked_mention_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mention_alert_log_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mention_alert_log_tracked_mention_id_fkey"
            columns: ["tracked_mention_id"]
            isOneToOne: false
            referencedRelation: "tracked_mentions"
            referencedColumns: ["id"]
          },
        ]
      }
      mention_classifier_verdict_cache: {
        Row: {
          cache_key: string
          cached_at: string | null
          content_hash: string
          expires_at: string | null
          id: string
          match_note: string | null
          relevance: Database["public"]["Enums"]["mention_relevance"] | null
          relevance_score: number | null
          sentiment: Database["public"]["Enums"]["mention_sentiment"] | null
          sentiment_score: number | null
          subject_facets_hash: string
        }
        Insert: {
          cache_key: string
          cached_at?: string | null
          content_hash: string
          expires_at?: string | null
          id?: string
          match_note?: string | null
          relevance?: Database["public"]["Enums"]["mention_relevance"] | null
          relevance_score?: number | null
          sentiment?: Database["public"]["Enums"]["mention_sentiment"] | null
          sentiment_score?: number | null
          subject_facets_hash: string
        }
        Update: {
          cache_key?: string
          cached_at?: string | null
          content_hash?: string
          expires_at?: string | null
          id?: string
          match_note?: string | null
          relevance?: Database["public"]["Enums"]["mention_relevance"] | null
          relevance_score?: number | null
          sentiment?: Database["public"]["Enums"]["mention_sentiment"] | null
          sentiment_score?: number | null
          subject_facets_hash?: string
        }
        Relationships: []
      }
      mention_excluded_urls: {
        Row: {
          domain: string | null
          excluded_at: string | null
          excluded_by: string | null
          id: string
          reason: string | null
          tracked_mention_id: string
          url: string | null
        }
        Insert: {
          domain?: string | null
          excluded_at?: string | null
          excluded_by?: string | null
          id?: string
          reason?: string | null
          tracked_mention_id: string
          url?: string | null
        }
        Update: {
          domain?: string | null
          excluded_at?: string | null
          excluded_by?: string | null
          id?: string
          reason?: string | null
          tracked_mention_id?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mention_excluded_urls_tracked_mention_id_fkey"
            columns: ["tracked_mention_id"]
            isOneToOne: false
            referencedRelation: "tracked_mentions"
            referencedColumns: ["id"]
          },
        ]
      }
      mention_history: {
        Row: {
          anomaly_reason: string | null
          author: string | null
          body_md: string | null
          canonical_url: string | null
          classifier_cached: boolean | null
          content_hash: string | null
          country_code: string | null
          discovered_at: string
          engagement: Json | null
          excerpt: string | null
          id: string
          is_anomaly: boolean | null
          language_code: string | null
          manual_override: boolean | null
          match_kind: string | null
          match_note: string | null
          outlet_domain: string | null
          outlet_name: string | null
          outlet_type: Database["public"]["Enums"]["mention_outlet_type"] | null
          published_at: string | null
          raw_payload: Json | null
          refresh_run_id: string
          relevance: Database["public"]["Enums"]["mention_relevance"] | null
          relevance_score: number | null
          sentiment: Database["public"]["Enums"]["mention_sentiment"] | null
          sentiment_score: number | null
          source: string
          title: string | null
          tracked_mention_id: string
          url: string
        }
        Insert: {
          anomaly_reason?: string | null
          author?: string | null
          body_md?: string | null
          canonical_url?: string | null
          classifier_cached?: boolean | null
          content_hash?: string | null
          country_code?: string | null
          discovered_at?: string
          engagement?: Json | null
          excerpt?: string | null
          id?: string
          is_anomaly?: boolean | null
          language_code?: string | null
          manual_override?: boolean | null
          match_kind?: string | null
          match_note?: string | null
          outlet_domain?: string | null
          outlet_name?: string | null
          outlet_type?:
            | Database["public"]["Enums"]["mention_outlet_type"]
            | null
          published_at?: string | null
          raw_payload?: Json | null
          refresh_run_id: string
          relevance?: Database["public"]["Enums"]["mention_relevance"] | null
          relevance_score?: number | null
          sentiment?: Database["public"]["Enums"]["mention_sentiment"] | null
          sentiment_score?: number | null
          source: string
          title?: string | null
          tracked_mention_id: string
          url: string
        }
        Update: {
          anomaly_reason?: string | null
          author?: string | null
          body_md?: string | null
          canonical_url?: string | null
          classifier_cached?: boolean | null
          content_hash?: string | null
          country_code?: string | null
          discovered_at?: string
          engagement?: Json | null
          excerpt?: string | null
          id?: string
          is_anomaly?: boolean | null
          language_code?: string | null
          manual_override?: boolean | null
          match_kind?: string | null
          match_note?: string | null
          outlet_domain?: string | null
          outlet_name?: string | null
          outlet_type?:
            | Database["public"]["Enums"]["mention_outlet_type"]
            | null
          published_at?: string | null
          raw_payload?: Json | null
          refresh_run_id?: string
          relevance?: Database["public"]["Enums"]["mention_relevance"] | null
          relevance_score?: number | null
          sentiment?: Database["public"]["Enums"]["mention_sentiment"] | null
          sentiment_score?: number | null
          source?: string
          title?: string | null
          tracked_mention_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "mention_history_tracked_mention_id_fkey"
            columns: ["tracked_mention_id"]
            isOneToOne: false
            referencedRelation: "tracked_mentions"
            referencedColumns: ["id"]
          },
        ]
      }
      mention_match_corrections: {
        Row: {
          corrected_relevance:
            | Database["public"]["Enums"]["mention_relevance"]
            | null
          corrected_sentiment:
            | Database["public"]["Enums"]["mention_sentiment"]
            | null
          correction_note: string | null
          created_at: string | null
          created_by: string | null
          id: string
          mention_history_id: string | null
          original_relevance:
            | Database["public"]["Enums"]["mention_relevance"]
            | null
          original_sentiment:
            | Database["public"]["Enums"]["mention_sentiment"]
            | null
          outlet_domain: string | null
          page_facets: Json | null
          subject_facets: Json | null
          title: string | null
          tracked_mention_id: string | null
          url: string | null
        }
        Insert: {
          corrected_relevance?:
            | Database["public"]["Enums"]["mention_relevance"]
            | null
          corrected_sentiment?:
            | Database["public"]["Enums"]["mention_sentiment"]
            | null
          correction_note?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          mention_history_id?: string | null
          original_relevance?:
            | Database["public"]["Enums"]["mention_relevance"]
            | null
          original_sentiment?:
            | Database["public"]["Enums"]["mention_sentiment"]
            | null
          outlet_domain?: string | null
          page_facets?: Json | null
          subject_facets?: Json | null
          title?: string | null
          tracked_mention_id?: string | null
          url?: string | null
        }
        Update: {
          corrected_relevance?:
            | Database["public"]["Enums"]["mention_relevance"]
            | null
          corrected_sentiment?:
            | Database["public"]["Enums"]["mention_sentiment"]
            | null
          correction_note?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          mention_history_id?: string | null
          original_relevance?:
            | Database["public"]["Enums"]["mention_relevance"]
            | null
          original_sentiment?:
            | Database["public"]["Enums"]["mention_sentiment"]
            | null
          outlet_domain?: string | null
          page_facets?: Json | null
          subject_facets?: Json | null
          title?: string | null
          tracked_mention_id?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mention_match_corrections_mention_history_id_fkey"
            columns: ["mention_history_id"]
            isOneToOne: false
            referencedRelation: "mention_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mention_match_corrections_tracked_mention_id_fkey"
            columns: ["tracked_mention_id"]
            isOneToOne: false
            referencedRelation: "tracked_mentions"
            referencedColumns: ["id"]
          },
        ]
      }
      mention_outlets: {
        Row: {
          country_code: string | null
          created_at: string | null
          domain: string
          domain_authority: number | null
          first_seen_at: string | null
          is_aggregator: boolean | null
          is_press_release_wire: boolean | null
          language_code: string | null
          last_seen_at: string | null
          metadata: Json | null
          name: string | null
          outlet_type: Database["public"]["Enums"]["mention_outlet_type"] | null
          total_mentions_seen: number | null
          updated_at: string | null
        }
        Insert: {
          country_code?: string | null
          created_at?: string | null
          domain: string
          domain_authority?: number | null
          first_seen_at?: string | null
          is_aggregator?: boolean | null
          is_press_release_wire?: boolean | null
          language_code?: string | null
          last_seen_at?: string | null
          metadata?: Json | null
          name?: string | null
          outlet_type?:
            | Database["public"]["Enums"]["mention_outlet_type"]
            | null
          total_mentions_seen?: number | null
          updated_at?: string | null
        }
        Update: {
          country_code?: string | null
          created_at?: string | null
          domain?: string
          domain_authority?: number | null
          first_seen_at?: string | null
          is_aggregator?: boolean | null
          is_press_release_wire?: boolean | null
          language_code?: string | null
          last_seen_at?: string | null
          metadata?: Json | null
          name?: string | null
          outlet_type?:
            | Database["public"]["Enums"]["mention_outlet_type"]
            | null
          total_mentions_seen?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      mention_promoted_urls: {
        Row: {
          created_at: string | null
          created_by: string | null
          override_relevance: Database["public"]["Enums"]["mention_relevance"]
          reason: string | null
          tracked_mention_id: string
          updated_at: string | null
          url: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          override_relevance: Database["public"]["Enums"]["mention_relevance"]
          reason?: string | null
          tracked_mention_id: string
          updated_at?: string | null
          url: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          override_relevance?: Database["public"]["Enums"]["mention_relevance"]
          reason?: string | null
          tracked_mention_id?: string
          updated_at?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "mention_promoted_urls_tracked_mention_id_fkey"
            columns: ["tracked_mention_id"]
            isOneToOne: false
            referencedRelation: "tracked_mentions"
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
          workspace_id: string | null
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
          workspace_id?: string | null
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
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messaging_campaign_recipients_message_log_id_fkey"
            columns: ["message_log_id"]
            isOneToOne: false
            referencedRelation: "messaging_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messaging_campaign_recipients_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
          workspace_id: string | null
          zernio_account_id: string | null
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
          workspace_id?: string | null
          zernio_account_id?: string | null
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
          workspace_id?: string | null
          zernio_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messaging_channels_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      messaging_logs: {
        Row: {
          agent_run_id: string | null
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
          workspace_id: string | null
        }
        Insert: {
          agent_run_id?: string | null
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
          workspace_id?: string | null
        }
        Update: {
          agent_run_id?: string | null
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
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messaging_logs_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "messaging_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
      module_access_requests: {
        Row: {
          created_at: string
          id: string
          module_slug: string
          requested_by: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          module_slug: string
          requested_by: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          module_slug?: string
          requested_by?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_access_requests_module_slug_fkey"
            columns: ["module_slug"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "module_access_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      modules: {
        Row: {
          addon_currency: string
          addon_price_cents: number | null
          addon_stripe_product_id: string | null
          category: string | null
          created_at: string | null
          description: string | null
          enabled: boolean
          icon: string | null
          is_addon: boolean
          long_description: string | null
          name: string
          price_tier: string | null
          screenshot_url: string | null
          slug: string
          summary: string | null
          updated_at: string | null
          version: string | null
        }
        Insert: {
          addon_currency?: string
          addon_price_cents?: number | null
          addon_stripe_product_id?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          enabled?: boolean
          icon?: string | null
          is_addon?: boolean
          long_description?: string | null
          name: string
          price_tier?: string | null
          screenshot_url?: string | null
          slug: string
          summary?: string | null
          updated_at?: string | null
          version?: string | null
        }
        Update: {
          addon_currency?: string
          addon_price_cents?: number | null
          addon_stripe_product_id?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          enabled?: boolean
          icon?: string | null
          is_addon?: boolean
          long_description?: string | null
          name?: string
          price_tier?: string | null
          screenshot_url?: string | null
          slug?: string
          summary?: string | null
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
      moodboard_presentation_sheets: {
        Row: {
          ai_log_ids: string[] | null
          created_at: string
          created_by: string | null
          credits_used: number
          data: Json
          error_message: string | null
          id: string
          moodboard_id: string
          page_count: number | null
          pdf_generated_at: string | null
          pdf_storage_path: string | null
          pdf_url: string | null
          share_expires_at: string | null
          share_token: string | null
          share_view_count: number
          sheet_type: Database["public"]["Enums"]["moodboard_sheet_type"]
          status: Database["public"]["Enums"]["moodboard_sheet_status"]
          title: string
          updated_at: string
        }
        Insert: {
          ai_log_ids?: string[] | null
          created_at?: string
          created_by?: string | null
          credits_used?: number
          data?: Json
          error_message?: string | null
          id?: string
          moodboard_id: string
          page_count?: number | null
          pdf_generated_at?: string | null
          pdf_storage_path?: string | null
          pdf_url?: string | null
          share_expires_at?: string | null
          share_token?: string | null
          share_view_count?: number
          sheet_type: Database["public"]["Enums"]["moodboard_sheet_type"]
          status?: Database["public"]["Enums"]["moodboard_sheet_status"]
          title: string
          updated_at?: string
        }
        Update: {
          ai_log_ids?: string[] | null
          created_at?: string
          created_by?: string | null
          credits_used?: number
          data?: Json
          error_message?: string | null
          id?: string
          moodboard_id?: string
          page_count?: number | null
          pdf_generated_at?: string | null
          pdf_storage_path?: string | null
          pdf_url?: string | null
          share_expires_at?: string | null
          share_token?: string | null
          share_view_count?: number
          sheet_type?: Database["public"]["Enums"]["moodboard_sheet_type"]
          status?: Database["public"]["Enums"]["moodboard_sheet_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "moodboard_presentation_sheets_moodboard_id_fkey"
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
          project_id: string | null
          room_id: string | null
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
          project_id?: string | null
          room_id?: string | null
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
          project_id?: string | null
          room_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          view_count?: number
          view_preference?: string
        }
        Relationships: [
          {
            foreignKeyName: "moodboards_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moodboards_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "project_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      mydata_reference: {
        Row: {
          category: string
          code: string
          description: string
          is_enabled: boolean
          rate: number | null
          rate_kind: string
          sort_order: number | null
        }
        Insert: {
          category: string
          code: string
          description: string
          is_enabled?: boolean
          rate?: number | null
          rate_kind?: string
          sort_order?: number | null
        }
        Update: {
          category?: string
          code?: string
          description?: string
          is_enabled?: boolean
          rate?: number | null
          rate_kind?: string
          sort_order?: number | null
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
          user_id: string | null
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          extracted_text?: string | null
          file_id?: string | null
          id?: string
          processing_time_ms?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          extracted_text?: string | null
          file_id?: string | null
          id?: string
          processing_time_ms?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          description: string
          id: string
          line_total: number
          measurement_unit_code: string | null
          net_value: number
          order_id: string
          product_id: string | null
          quantity: number
          quantity_delivered: number
          sort_order: number
          supplier_company_id: string | null
          unit_cost: number | null
          unit_price: number
          update_warehouse: boolean
          vat_amount: number
          vat_category: number | null
          vat_percent: number | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          line_total?: number
          measurement_unit_code?: string | null
          net_value?: number
          order_id: string
          product_id?: string | null
          quantity?: number
          quantity_delivered?: number
          sort_order?: number
          supplier_company_id?: string | null
          unit_cost?: number | null
          unit_price?: number
          update_warehouse?: boolean
          vat_amount?: number
          vat_category?: number | null
          vat_percent?: number | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          line_total?: number
          measurement_unit_code?: string | null
          net_value?: number
          order_id?: string
          product_id?: string | null
          quantity?: number
          quantity_delivered?: number
          sort_order?: number
          supplier_company_id?: string | null
          unit_cost?: number | null
          unit_price?: number
          update_warehouse?: boolean
          vat_amount?: number
          vat_category?: number | null
          vat_percent?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_supplier_company_id_fkey"
            columns: ["supplier_company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          customer_company_id: string | null
          customer_contact_id: string | null
          id: string
          notes: string | null
          order_number: string | null
          order_type: string
          paired_order_id: string | null
          paired_workspace_id: string | null
          payment_status: string
          project_id: string | null
          source_quote_id: string | null
          status: string
          subtotal_net: number
          supplier_acknowledged_at: string | null
          supplier_company_id: string | null
          supplier_contact_id: string | null
          supplier_eta: string | null
          supplier_note: string | null
          supplier_status: string | null
          three_way_match_status: string | null
          total: number
          updated_at: string
          vat_amount: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_company_id?: string | null
          customer_contact_id?: string | null
          id?: string
          notes?: string | null
          order_number?: string | null
          order_type: string
          paired_order_id?: string | null
          paired_workspace_id?: string | null
          payment_status?: string
          project_id?: string | null
          source_quote_id?: string | null
          status?: string
          subtotal_net?: number
          supplier_acknowledged_at?: string | null
          supplier_company_id?: string | null
          supplier_contact_id?: string | null
          supplier_eta?: string | null
          supplier_note?: string | null
          supplier_status?: string | null
          three_way_match_status?: string | null
          total?: number
          updated_at?: string
          vat_amount?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_company_id?: string | null
          customer_contact_id?: string | null
          id?: string
          notes?: string | null
          order_number?: string | null
          order_type?: string
          paired_order_id?: string | null
          paired_workspace_id?: string | null
          payment_status?: string
          project_id?: string | null
          source_quote_id?: string | null
          status?: string
          subtotal_net?: number
          supplier_acknowledged_at?: string | null
          supplier_company_id?: string | null
          supplier_contact_id?: string | null
          supplier_eta?: string | null
          supplier_note?: string | null
          supplier_status?: string | null
          three_way_match_status?: string | null
          total?: number
          updated_at?: string
          vat_amount?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_company_id_fkey"
            columns: ["customer_company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_contact_id_fkey"
            columns: ["customer_contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_source_quote_id_fkey"
            columns: ["source_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_source_quote_id_fkey"
            columns: ["source_quote_id"]
            isOneToOne: false
            referencedRelation: "vw_quote_followup_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_supplier_company_id_fkey"
            columns: ["supplier_company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_supplier_contact_id_fkey"
            columns: ["supplier_contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      paddleocr_metrics: {
        Row: {
          attempt_number: number | null
          caller: string | null
          chars_count: number | null
          created_at: string
          document_id: string | null
          failure_mode_head: string | null
          id: number
          image_id: string | null
          job_id: string | null
          latency_ms: number | null
          outcome: string | null
          page_number: number | null
          provider: string | null
          region_count: number | null
        }
        Insert: {
          attempt_number?: number | null
          caller?: string | null
          chars_count?: number | null
          created_at?: string
          document_id?: string | null
          failure_mode_head?: string | null
          id?: never
          image_id?: string | null
          job_id?: string | null
          latency_ms?: number | null
          outcome?: string | null
          page_number?: number | null
          provider?: string | null
          region_count?: number | null
        }
        Update: {
          attempt_number?: number | null
          caller?: string | null
          chars_count?: number | null
          created_at?: string
          document_id?: string | null
          failure_mode_head?: string | null
          id?: never
          image_id?: string | null
          job_id?: string | null
          latency_ms?: number | null
          outcome?: string | null
          page_number?: number | null
          provider?: string | null
          region_count?: number | null
        }
        Relationships: []
      }
      payment_allocations: {
        Row: {
          amount: number
          amount_doc_currency: number | null
          created_at: string
          credit_note_id: string | null
          fx_rate: number
          id: string
          invoice_id: string | null
          payment_id: string | null
          realized_fx_gain_loss: number
          supplier_bill_id: string | null
          supplier_credit_note_id: string | null
        }
        Insert: {
          amount: number
          amount_doc_currency?: number | null
          created_at?: string
          credit_note_id?: string | null
          fx_rate?: number
          id?: string
          invoice_id?: string | null
          payment_id?: string | null
          realized_fx_gain_loss?: number
          supplier_bill_id?: string | null
          supplier_credit_note_id?: string | null
        }
        Update: {
          amount?: number
          amount_doc_currency?: number | null
          created_at?: string
          credit_note_id?: string | null
          fx_rate?: number
          id?: string
          invoice_id?: string | null
          payment_id?: string | null
          realized_fx_gain_loss?: number
          supplier_bill_id?: string | null
          supplier_credit_note_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "vw_ar_aging"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_supplier_bill_id_fkey"
            columns: ["supplier_bill_id"]
            isOneToOne: false
            referencedRelation: "supplier_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_supplier_bill_id_fkey"
            columns: ["supplier_bill_id"]
            isOneToOne: false
            referencedRelation: "vw_ap_aging"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_supplier_credit_note_id_fkey"
            columns: ["supplier_credit_note_id"]
            isOneToOne: false
            referencedRelation: "supplier_credit_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_audit_log: {
        Row: {
          action: string
          actor: string | null
          changed_at: string
          id: string
          new_row: Json | null
          old_row: Json
          payment_id: string | null
          workspace_id: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          changed_at?: string
          id?: string
          new_row?: Json | null
          old_row: Json
          payment_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          changed_at?: string
          id?: string
          new_row?: Json | null
          old_row?: Json
          payment_id?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          bank_account_id: string | null
          category_id: string | null
          counterparty_company_id: string | null
          counterparty_contact_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          direction: string
          fx_rate_to_base: number
          id: string
          method: string | null
          notes: string | null
          order_id: string | null
          paid_at: string
          pdf_generated_at: string | null
          pdf_generation_status: string | null
          pdf_storage_path: string | null
          receipt_number: string | null
          reference: string | null
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          workspace_id: string
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          category_id?: string | null
          counterparty_company_id?: string | null
          counterparty_contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          direction: string
          fx_rate_to_base?: number
          id?: string
          method?: string | null
          notes?: string | null
          order_id?: string | null
          paid_at?: string
          pdf_generated_at?: string | null
          pdf_generation_status?: string | null
          pdf_storage_path?: string | null
          receipt_number?: string | null
          reference?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          workspace_id: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          category_id?: string | null
          counterparty_company_id?: string | null
          counterparty_contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          direction?: string
          fx_rate_to_base?: number
          id?: string
          method?: string | null
          notes?: string | null
          order_id?: string | null
          paid_at?: string
          pdf_generated_at?: string | null
          pdf_generation_status?: string | null
          pdf_storage_path?: string | null
          receipt_number?: string | null
          reference?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "finance_bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "vw_bank_account_balances"
            referencedColumns: ["bank_account_id"]
          },
          {
            foreignKeyName: "payments_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_counterparty_company_id_fkey"
            columns: ["counterparty_company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_counterparty_contact_id_fkey"
            columns: ["counterparty_contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
          user_id: string | null
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
          user_id?: string | null
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
          user_id?: string | null
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
      planned_payments: {
        Row: {
          amount: number
          category: string
          counterparty_company_id: string | null
          counterparty_contact_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          direction: string
          id: string
          invoice_id: string | null
          notes: string | null
          paid_payment_id: string | null
          reminder_at: string | null
          reminder_sent_at: string | null
          scheduled_for: string
          status: string
          supplier_bill_id: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount: number
          category?: string
          counterparty_company_id?: string | null
          counterparty_contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          direction: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          paid_payment_id?: string | null
          reminder_at?: string | null
          reminder_sent_at?: string | null
          scheduled_for: string
          status?: string
          supplier_bill_id?: string | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount?: number
          category?: string
          counterparty_company_id?: string | null
          counterparty_contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          direction?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          paid_payment_id?: string | null
          reminder_at?: string | null
          reminder_sent_at?: string | null
          scheduled_for?: string
          status?: string
          supplier_bill_id?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planned_payments_counterparty_company_id_fkey"
            columns: ["counterparty_company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_payments_counterparty_contact_id_fkey"
            columns: ["counterparty_contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "vw_ar_aging"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_payments_paid_payment_id_fkey"
            columns: ["paid_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_payments_supplier_bill_id_fkey"
            columns: ["supplier_bill_id"]
            isOneToOne: false
            referencedRelation: "supplier_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_payments_supplier_bill_id_fkey"
            columns: ["supplier_bill_id"]
            isOneToOne: false
            referencedRelation: "vw_ap_aging"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_payments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_secret_module_links: {
        Row: {
          module_slug: string
          secret_key: string
        }
        Insert: {
          module_slug: string
          secret_key: string
        }
        Update: {
          module_slug?: string
          secret_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_secret_module_links_module_slug_fkey"
            columns: ["module_slug"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "platform_secret_module_links_secret_key_fkey"
            columns: ["secret_key"]
            isOneToOne: false
            referencedRelation: "platform_secrets"
            referencedColumns: ["key"]
          },
        ]
      }
      platform_secrets: {
        Row: {
          category: string | null
          created_at: string
          default_value: string | null
          description: string | null
          is_sensitive: boolean
          key: string
          last_verified_at: string | null
          last_verified_error: string | null
          last_verified_status: string | null
          primary_module_slug: string | null
          updated_at: string
          updated_by: string | null
          value: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          default_value?: string | null
          description?: string | null
          is_sensitive?: boolean
          key: string
          last_verified_at?: string | null
          last_verified_error?: string | null
          last_verified_status?: string | null
          primary_module_slug?: string | null
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          default_value?: string | null
          description?: string | null
          is_sensitive?: boolean
          key?: string
          last_verified_at?: string | null
          last_verified_error?: string | null
          last_verified_status?: string | null
          primary_module_slug?: string | null
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_secrets_primary_module_slug_fkey"
            columns: ["primary_module_slug"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["slug"]
          },
        ]
      }
      platform_suppliers: {
        Row: {
          claimed_workspace_id: string | null
          country_code: string
          created_at: string
          id: string
          legal_name: string | null
          primary_email: string | null
          status: string
          updated_at: string
          vat_number: string
          vat_validated: boolean | null
          vat_validated_at: string | null
          vat_validation_source: string | null
          website: string | null
        }
        Insert: {
          claimed_workspace_id?: string | null
          country_code: string
          created_at?: string
          id?: string
          legal_name?: string | null
          primary_email?: string | null
          status?: string
          updated_at?: string
          vat_number: string
          vat_validated?: boolean | null
          vat_validated_at?: string | null
          vat_validation_source?: string | null
          website?: string | null
        }
        Update: {
          claimed_workspace_id?: string | null
          country_code?: string
          created_at?: string
          id?: string
          legal_name?: string | null
          primary_email?: string | null
          status?: string
          updated_at?: string
          vat_number?: string
          vat_validated?: boolean | null
          vat_validated_at?: string | null
          vat_validation_source?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_suppliers_claimed_workspace_id_fkey"
            columns: ["claimed_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_cash_movements: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          direction: string
          id: string
          reason: string | null
          session_id: string
          workspace_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          direction: string
          id?: string
          reason?: string | null
          session_id: string
          workspace_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          direction?: string
          id?: string
          reason?: string | null
          session_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_cash_movements_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "pos_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sessions: {
        Row: {
          branch_code: number
          cash_variance: number | null
          closed_at: string | null
          closed_by: string | null
          closing_counted_cash: number | null
          id: string
          notes: string | null
          opened_at: string
          opened_by: string
          opening_float: number
          status: string
          workspace_id: string
          z_number: number | null
        }
        Insert: {
          branch_code?: number
          cash_variance?: number | null
          closed_at?: string | null
          closed_by?: string | null
          closing_counted_cash?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by: string
          opening_float?: number
          status?: string
          workspace_id: string
          z_number?: number | null
        }
        Update: {
          branch_code?: number
          cash_variance?: number | null
          closed_at?: string | null
          closed_by?: string | null
          closing_counted_cash?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string
          opening_float?: number
          status?: string
          workspace_id?: string
          z_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_sessions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_signatures: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          expiry_date: string | null
          final_mark: string | null
          final_payment_type: number | null
          id: string
          invoice_id: string | null
          invoice_uid: string | null
          is_expired: boolean
          payment_amount: number
          payment_balance: number | null
          payment_type: number | null
          pos_nsp_id: number | null
          pos_session_id: string | null
          signature_data: string | null
          signature_token: string
          status: string
          terminal_id: string | null
          tip_amount: number
          transaction_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          expiry_date?: string | null
          final_mark?: string | null
          final_payment_type?: number | null
          id?: string
          invoice_id?: string | null
          invoice_uid?: string | null
          is_expired?: boolean
          payment_amount: number
          payment_balance?: number | null
          payment_type?: number | null
          pos_nsp_id?: number | null
          pos_session_id?: string | null
          signature_data?: string | null
          signature_token: string
          status?: string
          terminal_id?: string | null
          tip_amount?: number
          transaction_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          expiry_date?: string | null
          final_mark?: string | null
          final_payment_type?: number | null
          id?: string
          invoice_id?: string | null
          invoice_uid?: string | null
          is_expired?: boolean
          payment_amount?: number
          payment_balance?: number | null
          payment_type?: number | null
          pos_nsp_id?: number | null
          pos_session_id?: string | null
          signature_data?: string | null
          signature_token?: string
          status?: string
          terminal_id?: string | null
          tip_amount?: number
          transaction_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_signatures_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_signatures_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "vw_ar_aging"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_signatures_pos_session_id_fkey"
            columns: ["pos_session_id"]
            isOneToOne: false
            referencedRelation: "pos_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_signatures_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_terminals: {
        Row: {
          branch_code: number
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          label: string
          notes: string | null
          pos_nsp_id: number
          terminal_id: string
          workspace_id: string
        }
        Insert: {
          branch_code?: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label: string
          notes?: string | null
          pos_nsp_id: number
          terminal_id: string
          workspace_id: string
        }
        Update: {
          branch_code?: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label?: string
          notes?: string | null
          pos_nsp_id?: number
          terminal_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_terminals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      presentation_catalogs: {
        Row: {
          back_cover_data: Json
          body_data: Json
          cover_data: Json
          created_at: string
          description: string | null
          id: string
          owner_user_id: string | null
          page_count: number | null
          pdf_generated_at: string | null
          pdf_storage_path: string | null
          pdf_url: string | null
          published_at: string | null
          slug: string | null
          source_pdf_ids: string[]
          status: Database["public"]["Enums"]["presentation_catalog_status"]
          status_message: string | null
          subtitle: string | null
          template_id: string | null
          title: string
          unique_email_count: number
          unpublished_at: string | null
          updated_at: string
          view_count: number
          workspace_id: string
        }
        Insert: {
          back_cover_data?: Json
          body_data?: Json
          cover_data?: Json
          created_at?: string
          description?: string | null
          id?: string
          owner_user_id?: string | null
          page_count?: number | null
          pdf_generated_at?: string | null
          pdf_storage_path?: string | null
          pdf_url?: string | null
          published_at?: string | null
          slug?: string | null
          source_pdf_ids?: string[]
          status?: Database["public"]["Enums"]["presentation_catalog_status"]
          status_message?: string | null
          subtitle?: string | null
          template_id?: string | null
          title: string
          unique_email_count?: number
          unpublished_at?: string | null
          updated_at?: string
          view_count?: number
          workspace_id: string
        }
        Update: {
          back_cover_data?: Json
          body_data?: Json
          cover_data?: Json
          created_at?: string
          description?: string | null
          id?: string
          owner_user_id?: string | null
          page_count?: number | null
          pdf_generated_at?: string | null
          pdf_storage_path?: string | null
          pdf_url?: string | null
          published_at?: string | null
          slug?: string | null
          source_pdf_ids?: string[]
          status?: Database["public"]["Enums"]["presentation_catalog_status"]
          status_message?: string | null
          subtitle?: string | null
          template_id?: string | null
          title?: string
          unique_email_count?: number
          unpublished_at?: string | null
          updated_at?: string
          view_count?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "presentation_catalogs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "catalog_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presentation_catalogs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
      pricing_change_requests: {
        Row: {
          after: Json | null
          before: Json | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          note: string | null
          requested_by: string | null
          status: string
          target_id: string | null
          target_type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          after?: Json | null
          before?: Json | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          note?: string | null
          requested_by?: string | null
          status?: string
          target_id?: string | null
          target_type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          after?: Json | null
          before?: Json | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          note?: string | null
          requested_by?: string | null
          status?: string
          target_id?: string | null
          target_type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_change_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_custom_rules: {
        Row: {
          category_key: string | null
          created_at: string
          discount_pct: number
          id: string
          is_active: boolean
          label: string | null
          params: Json
          rule_type: string
          sort_order: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          category_key?: string | null
          created_at?: string
          discount_pct?: number
          id?: string
          is_active?: boolean
          label?: string | null
          params?: Json
          rule_type: string
          sort_order?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          category_key?: string | null
          created_at?: string
          discount_pct?: number
          id?: string
          is_active?: boolean
          label?: string | null
          params?: Json
          rule_type?: string
          sort_order?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_custom_rules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_level_discounts: {
        Row: {
          category_key: string | null
          created_at: string
          discount_pct: number
          id: string
          level_key: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          category_key?: string | null
          created_at?: string
          discount_pct?: number
          id?: string
          level_key: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          category_key?: string | null
          created_at?: string
          discount_pct?: number
          id?: string
          level_key?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_level_discounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_level_discounts_workspace_id_level_key_fkey"
            columns: ["workspace_id", "level_key"]
            isOneToOne: false
            referencedRelation: "workspace_user_levels"
            referencedColumns: ["workspace_id", "level_key"]
          },
        ]
      }
      pricing_rules: {
        Row: {
          created_at: string
          currency: string
          id: string
          markup_pct: number | null
          scope: string
          sell_price: number | null
          target_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          markup_pct?: number | null
          scope: string
          sell_price?: number | null
          target_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          markup_pct?: number | null
          scope?: string
          sell_price?: number | null
          target_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
          cost_basis: number | null
          cost_source: string | null
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
          storefront_published: boolean
          unit: string | null
          updated_at: string
          valid_until: string | null
          workspace_id: string
        }
        Insert: {
          confirmed_at?: string
          confirmed_by?: string | null
          cost_basis?: number | null
          cost_source?: string | null
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
          storefront_published?: boolean
          unit?: string | null
          updated_at?: string
          valid_until?: string | null
          workspace_id: string
        }
        Update: {
          confirmed_at?: string
          confirmed_by?: string | null
          cost_basis?: number | null
          cost_source?: string | null
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
          storefront_published?: boolean
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
      product_suppliers: {
        Row: {
          created_at: string
          currency: string
          id: string
          is_preferred: boolean
          lead_time_days: number | null
          moq: number | null
          notes: string | null
          product_id: string
          supplier_company_id: string
          unit_cost: number | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          is_preferred?: boolean
          lead_time_days?: number | null
          moq?: number | null
          notes?: string | null
          product_id: string
          supplier_company_id: string
          unit_cost?: number | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          is_preferred?: boolean
          lead_time_days?: number | null
          moq?: number | null
          notes?: string | null
          product_id?: string
          supplier_company_id?: string
          unit_cost?: number | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_suppliers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_suppliers_supplier_company_id_fkey"
            columns: ["supplier_company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_suppliers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
          attributes: Json
          attributes_raw: Json
          avg_rating: number | null
          barcode: string | null
          brand_company_id: string | null
          category: string | null
          category_id: string | null
          completeness_score: number | null
          confidence_score: number | null
          cost: number | null
          cost_currency: string | null
          cost_source: string | null
          cost_updated_at: string | null
          created_at: string | null
          created_by: string | null
          created_from_type: string | null
          description: string | null
          embedding_metadata: Json | null
          embedding_model: string | null
          enforce_moq: boolean
          external_sku: string | null
          id: string
          import_batch_id: string | null
          item_type: string
          layout_analyzed: boolean | null
          layout_detected: boolean | null
          layout_detection_date: string | null
          layout_stats: Json | null
          long_description: string | null
          measurement_unit_code: number | null
          metadata: Json | null
          mydata_income_classification_category: string | null
          mydata_income_classification_type: string | null
          mydata_vat_category: number | null
          name: string
          numeric_specs: Json | null
          properties: Json | null
          quality_assessment: string | null
          quality_metrics: Json | null
          quality_score: number | null
          review_count: number
          search_tsv: unknown
          search_vector: unknown
          sku: string | null
          source_chunks: Json | null
          source_document_id: string | null
          source_job_id: string | null
          source_type: string | null
          specifications: Json | null
          status: string | null
          supplier_company_id: string | null
          supply_mode: string
          tables_extracted: boolean | null
          text_embedding_1024: unknown
          text_embedding_1024_model: string | null
          text_embedding_schema_version: number | null
          total_layout_regions: number | null
          total_tables: number | null
          total_tables_extracted: number | null
          updated_at: string | null
          work_category: string | null
          workspace_id: string
        }
        Insert: {
          attributes?: Json
          attributes_raw?: Json
          avg_rating?: number | null
          barcode?: string | null
          brand_company_id?: string | null
          category?: string | null
          category_id?: string | null
          completeness_score?: number | null
          confidence_score?: number | null
          cost?: number | null
          cost_currency?: string | null
          cost_source?: string | null
          cost_updated_at?: string | null
          created_at?: string | null
          created_by?: string | null
          created_from_type?: string | null
          description?: string | null
          embedding_metadata?: Json | null
          embedding_model?: string | null
          enforce_moq?: boolean
          external_sku?: string | null
          id?: string
          import_batch_id?: string | null
          item_type?: string
          layout_analyzed?: boolean | null
          layout_detected?: boolean | null
          layout_detection_date?: string | null
          layout_stats?: Json | null
          long_description?: string | null
          measurement_unit_code?: number | null
          metadata?: Json | null
          mydata_income_classification_category?: string | null
          mydata_income_classification_type?: string | null
          mydata_vat_category?: number | null
          name: string
          numeric_specs?: Json | null
          properties?: Json | null
          quality_assessment?: string | null
          quality_metrics?: Json | null
          quality_score?: number | null
          review_count?: number
          search_tsv?: unknown
          search_vector?: unknown
          sku?: string | null
          source_chunks?: Json | null
          source_document_id?: string | null
          source_job_id?: string | null
          source_type?: string | null
          specifications?: Json | null
          status?: string | null
          supplier_company_id?: string | null
          supply_mode?: string
          tables_extracted?: boolean | null
          text_embedding_1024?: unknown
          text_embedding_1024_model?: string | null
          text_embedding_schema_version?: number | null
          total_layout_regions?: number | null
          total_tables?: number | null
          total_tables_extracted?: number | null
          updated_at?: string | null
          work_category?: string | null
          workspace_id: string
        }
        Update: {
          attributes?: Json
          attributes_raw?: Json
          avg_rating?: number | null
          barcode?: string | null
          brand_company_id?: string | null
          category?: string | null
          category_id?: string | null
          completeness_score?: number | null
          confidence_score?: number | null
          cost?: number | null
          cost_currency?: string | null
          cost_source?: string | null
          cost_updated_at?: string | null
          created_at?: string | null
          created_by?: string | null
          created_from_type?: string | null
          description?: string | null
          embedding_metadata?: Json | null
          embedding_model?: string | null
          enforce_moq?: boolean
          external_sku?: string | null
          id?: string
          import_batch_id?: string | null
          item_type?: string
          layout_analyzed?: boolean | null
          layout_detected?: boolean | null
          layout_detection_date?: string | null
          layout_stats?: Json | null
          long_description?: string | null
          measurement_unit_code?: number | null
          metadata?: Json | null
          mydata_income_classification_category?: string | null
          mydata_income_classification_type?: string | null
          mydata_vat_category?: number | null
          name?: string
          numeric_specs?: Json | null
          properties?: Json | null
          quality_assessment?: string | null
          quality_metrics?: Json | null
          quality_score?: number | null
          review_count?: number
          search_tsv?: unknown
          search_vector?: unknown
          sku?: string | null
          source_chunks?: Json | null
          source_document_id?: string | null
          source_job_id?: string | null
          source_type?: string | null
          specifications?: Json | null
          status?: string | null
          supplier_company_id?: string | null
          supply_mode?: string
          tables_extracted?: boolean | null
          text_embedding_1024?: unknown
          text_embedding_1024_model?: string | null
          text_embedding_schema_version?: number | null
          total_layout_regions?: number | null
          total_tables?: number | null
          total_tables_extracted?: number | null
          updated_at?: string | null
          work_category?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_company_id_fkey"
            columns: ["brand_company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_source_job_id_fkey"
            columns: ["source_job_id"]
            isOneToOne: false
            referencedRelation: "background_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_company_id_fkey"
            columns: ["supplier_company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
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
          is_hidden: boolean
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
          is_hidden?: boolean
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
          is_hidden?: boolean
          is_verified?: boolean
          overall_rating?: number
          reply?: string | null
          service_name?: string | null
          to_user_id?: string
        }
        Relationships: []
      }
      project_client_views: {
        Row: {
          cover: Json
          created_at: string
          created_by: string | null
          embed_ffe: boolean
          embed_lighting: boolean
          embed_vr: boolean
          error_message: string | null
          feedback_enabled: boolean
          id: string
          page_count: number | null
          pdf_generated_at: string | null
          pdf_generation_status: string
          pdf_storage_path: string | null
          project_id: string
          public_share_enabled: boolean
          public_share_token: string | null
          quote_id: string | null
          share_expires_at: string | null
          share_view_count: number
          sheet_ids: string[]
          title: string
          updated_at: string
          vr_world_id: string | null
        }
        Insert: {
          cover?: Json
          created_at?: string
          created_by?: string | null
          embed_ffe?: boolean
          embed_lighting?: boolean
          embed_vr?: boolean
          error_message?: string | null
          feedback_enabled?: boolean
          id?: string
          page_count?: number | null
          pdf_generated_at?: string | null
          pdf_generation_status?: string
          pdf_storage_path?: string | null
          project_id: string
          public_share_enabled?: boolean
          public_share_token?: string | null
          quote_id?: string | null
          share_expires_at?: string | null
          share_view_count?: number
          sheet_ids?: string[]
          title?: string
          updated_at?: string
          vr_world_id?: string | null
        }
        Update: {
          cover?: Json
          created_at?: string
          created_by?: string | null
          embed_ffe?: boolean
          embed_lighting?: boolean
          embed_vr?: boolean
          error_message?: string | null
          feedback_enabled?: boolean
          id?: string
          page_count?: number | null
          pdf_generated_at?: string | null
          pdf_generation_status?: string
          pdf_storage_path?: string | null
          project_id?: string
          public_share_enabled?: boolean
          public_share_token?: string | null
          quote_id?: string | null
          share_expires_at?: string | null
          share_view_count?: number
          sheet_ids?: string[]
          title?: string
          updated_at?: string
          vr_world_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_client_views_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_client_views_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_client_views_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "vw_quote_followup_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_client_views_vr_world_id_fkey"
            columns: ["vr_world_id"]
            isOneToOne: false
            referencedRelation: "vr_worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      project_collaborators: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_at: string
          invited_by: string
          message: string | null
          project_id: string
          revoked_at: string | null
          role: string
          share_token: string
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_at?: string
          invited_by: string
          message?: string | null
          project_id: string
          revoked_at?: string | null
          role?: string
          share_token?: string
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_at?: string
          invited_by?: string
          message?: string | null
          project_id?: string
          revoked_at?: string | null
          role?: string
          share_token?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_collaborators_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_events: {
        Row: {
          actor_id: string | null
          event_type: string
          id: string
          occurred_at: string
          payload: Json
          project_id: string
        }
        Insert: {
          actor_id?: string | null
          event_type: string
          id?: string
          occurred_at?: string
          payload?: Json
          project_id: string
        }
        Update: {
          actor_id?: string | null
          event_type?: string
          id?: string
          occurred_at?: string
          payload?: Json
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_plan_items: {
        Row: {
          allowance_amount: number | null
          created_at: string
          id: string
          is_allowance: boolean
          is_selected: boolean
          kind: string
          label: string
          labor_rate: number | null
          line_kind: string
          line_total: number
          margin_pct: number
          material_cost: number | null
          notes: string | null
          option_group: string | null
          parent_id: string | null
          plan_id: string
          product_id: string | null
          quantity: number
          quantity_formula: string | null
          service_id: string | null
          sort_order: number
          source: string
          tier: string | null
          unit: string | null
          unit_price: number
          updated_at: string
        }
        Insert: {
          allowance_amount?: number | null
          created_at?: string
          id?: string
          is_allowance?: boolean
          is_selected?: boolean
          kind?: string
          label: string
          labor_rate?: number | null
          line_kind?: string
          line_total?: number
          margin_pct?: number
          material_cost?: number | null
          notes?: string | null
          option_group?: string | null
          parent_id?: string | null
          plan_id: string
          product_id?: string | null
          quantity?: number
          quantity_formula?: string | null
          service_id?: string | null
          sort_order?: number
          source?: string
          tier?: string | null
          unit?: string | null
          unit_price?: number
          updated_at?: string
        }
        Update: {
          allowance_amount?: number | null
          created_at?: string
          id?: string
          is_allowance?: boolean
          is_selected?: boolean
          kind?: string
          label?: string
          labor_rate?: number | null
          line_kind?: string
          line_total?: number
          margin_pct?: number
          material_cost?: number | null
          notes?: string | null
          option_group?: string | null
          parent_id?: string | null
          plan_id?: string
          product_id?: string | null
          quantity?: number
          quantity_formula?: string | null
          service_id?: string | null
          sort_order?: number
          source?: string
          tier?: string | null
          unit?: string | null
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_plan_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "project_plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_plan_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "project_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_plan_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_plan_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      project_plan_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          plan_id: string
          snapshot: Json
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          plan_id: string
          snapshot: Json
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          plan_id?: string
          snapshot?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_plan_versions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "project_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      project_plans: {
        Row: {
          blueprint_id: string | null
          brief: string | null
          created_at: string
          created_by: string | null
          dimensions: Json
          id: string
          project_id: string | null
          quote_id: string | null
          source_currency: string
          status: string
          subtotal: number
          title: string
          updated_at: string
          user_id: string
          version: number
          workspace_id: string
        }
        Insert: {
          blueprint_id?: string | null
          brief?: string | null
          created_at?: string
          created_by?: string | null
          dimensions?: Json
          id?: string
          project_id?: string | null
          quote_id?: string | null
          source_currency?: string
          status?: string
          subtotal?: number
          title: string
          updated_at?: string
          user_id: string
          version?: number
          workspace_id: string
        }
        Update: {
          blueprint_id?: string | null
          brief?: string | null
          created_at?: string
          created_by?: string | null
          dimensions?: Json
          id?: string
          project_id?: string | null
          quote_id?: string | null
          source_currency?: string
          status?: string
          subtotal?: number
          title?: string
          updated_at?: string
          user_id?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_plans_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "blueprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_plans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_plans_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_plans_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "vw_quote_followup_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_plans_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      project_products: {
        Row: {
          created_at: string
          created_by: string | null
          custom_description: string | null
          custom_name: string | null
          custom_sku: string | null
          id: string
          notes: string | null
          position: number
          price_currency: string
          price_source: string | null
          product_id: string | null
          project_id: string
          quantity: number
          quoted_price: number | null
          room_id: string | null
          sold_price: number | null
          source_quote_item_id: string | null
          status: Database["public"]["Enums"]["project_product_status"]
          unit: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          custom_description?: string | null
          custom_name?: string | null
          custom_sku?: string | null
          id?: string
          notes?: string | null
          position?: number
          price_currency?: string
          price_source?: string | null
          product_id?: string | null
          project_id: string
          quantity?: number
          quoted_price?: number | null
          room_id?: string | null
          sold_price?: number | null
          source_quote_item_id?: string | null
          status?: Database["public"]["Enums"]["project_product_status"]
          unit?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          custom_description?: string | null
          custom_name?: string | null
          custom_sku?: string | null
          id?: string
          notes?: string | null
          position?: number
          price_currency?: string
          price_source?: string | null
          product_id?: string | null
          project_id?: string
          quantity?: number
          quoted_price?: number | null
          room_id?: string | null
          sold_price?: number | null
          source_quote_item_id?: string | null
          status?: Database["public"]["Enums"]["project_product_status"]
          unit?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_products_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_products_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "project_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_products_source_quote_item_id_fkey"
            columns: ["source_quote_item_id"]
            isOneToOne: false
            referencedRelation: "quote_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_products_source_quote_item_id_fkey"
            columns: ["source_quote_item_id"]
            isOneToOne: false
            referencedRelation: "quote_items_with_room"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_products_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      project_purchase_items: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          currency: string
          design_image_path: string | null
          design_image_url: string | null
          details: Json
          id: string
          item_type: string
          name: string
          notes: string | null
          project_id: string
          quantity: number
          quote_id: string | null
          room_id: string | null
          sort_order: number
          status: string
          supplier_company_id: string | null
          unit_cost: number | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          design_image_path?: string | null
          design_image_url?: string | null
          details?: Json
          id?: string
          item_type?: string
          name: string
          notes?: string | null
          project_id: string
          quantity?: number
          quote_id?: string | null
          room_id?: string | null
          sort_order?: number
          status?: string
          supplier_company_id?: string | null
          unit_cost?: number | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          design_image_path?: string | null
          design_image_url?: string | null
          details?: Json
          id?: string
          item_type?: string
          name?: string
          notes?: string | null
          project_id?: string
          quantity?: number
          quote_id?: string | null
          room_id?: string | null
          sort_order?: number
          status?: string
          supplier_company_id?: string | null
          unit_cost?: number | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_purchase_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_purchase_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_purchase_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "vw_quote_followup_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_purchase_items_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "project_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      project_rooms: {
        Row: {
          budget_amount: number | null
          created_at: string
          deadline: string | null
          id: string
          name: string
          notes: string | null
          project_id: string
          room_type: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          budget_amount?: number | null
          created_at?: string
          deadline?: string | null
          id?: string
          name: string
          notes?: string | null
          project_id: string
          room_type?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          budget_amount?: number | null
          created_at?: string
          deadline?: string | null
          id?: string
          name?: string
          notes?: string | null
          project_id?: string
          room_type?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_rooms_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_tasks: {
        Row: {
          assignee_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          parent_task_id: string | null
          project_id: string
          room_id: string | null
          sort_order: number
          status: string
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          parent_task_id?: string | null
          project_id: string
          room_id?: string | null
          sort_order?: number
          status?: string
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          parent_task_id?: string | null
          project_id?: string
          room_id?: string | null
          sort_order?: number
          status?: string
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "project_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          accepted_quote_count: number
          actual_amount: number
          budget_amount: number | null
          budget_currency: string
          client_address_unit_id: string | null
          client_company_id: string | null
          client_contact_id: string | null
          cover_image_url: string | null
          created_at: string
          deadline: string | null
          description: string | null
          id: string
          last_activity_at: string
          moodboard_count: number
          name: string
          status: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          accepted_quote_count?: number
          actual_amount?: number
          budget_amount?: number | null
          budget_currency?: string
          client_address_unit_id?: string | null
          client_company_id?: string | null
          client_contact_id?: string | null
          cover_image_url?: string | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          id?: string
          last_activity_at?: string
          moodboard_count?: number
          name: string
          status?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          accepted_quote_count?: number
          actual_amount?: number
          budget_amount?: number | null
          budget_currency?: string
          client_address_unit_id?: string | null
          client_company_id?: string | null
          client_contact_id?: string | null
          cover_image_url?: string | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          id?: string
          last_activity_at?: string
          moodboard_count?: number
          name?: string
          status?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_address_unit_id_fkey"
            columns: ["client_address_unit_id"]
            isOneToOne: false
            referencedRelation: "crm_address_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_client_company_id_fkey"
            columns: ["client_company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_client_contact_id_fkey"
            columns: ["client_contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
          workspace_id: string
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
          workspace_id: string
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
          workspace_id?: string
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
      public_lookup_cache: {
        Row: {
          created_at: string
          expires_at: string
          hit_count: number
          query_hash: string
          result: Json
          scan_type: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          hit_count?: number
          query_hash: string
          result: Json
          scan_type: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          hit_count?: number
          query_hash?: string
          result?: Json
          scan_type?: string
        }
        Relationships: []
      }
      public_lookup_log: {
        Row: {
          cache_hit: boolean
          created_at: string
          error_message: string | null
          id: string
          ip_address: unknown
          latency_ms: number
          outcome: string
          query_hash: string
          query_text: string
          scan_type: string
          upstream_cost_usd: number
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          cache_hit?: boolean
          created_at?: string
          error_message?: string | null
          id?: string
          ip_address?: unknown
          latency_ms?: number
          outcome: string
          query_hash: string
          query_text: string
          scan_type: string
          upstream_cost_usd?: number
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          cache_hit?: boolean
          created_at?: string
          error_message?: string | null
          id?: string
          ip_address?: unknown
          latency_ms?: number
          outcome?: string
          query_hash?: string
          query_text?: string
          scan_type?: string
          upstream_cost_usd?: number
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
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
      quote_activities: {
        Row: {
          body: string | null
          completed_at: string | null
          created_at: string
          id: string
          kind: string
          metadata: Json
          quote_id: string
          scheduled_for: string | null
          user_id: string | null
        }
        Insert: {
          body?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          kind: string
          metadata?: Json
          quote_id: string
          scheduled_for?: string | null
          user_id?: string | null
        }
        Update: {
          body?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json
          quote_id?: string
          scheduled_for?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_activities_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_activities_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "vw_quote_followup_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_analytics_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json
          quote_id: string
          session_id: string
          source_page: string | null
          user_id: string | null
          view_context: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          quote_id: string
          session_id: string
          source_page?: string | null
          user_id?: string | null
          view_context?: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          quote_id?: string
          session_id?: string
          source_page?: string | null
          user_id?: string | null
          view_context?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_analytics_events_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_analytics_events_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "vw_quote_followup_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_approvals: {
        Row: {
          id: string
          ip_address: string | null
          plan_id: string | null
          quote_id: string
          signed_at: string
          signer_email: string | null
          signer_name: string
          user_agent: string | null
          version_hash: string | null
        }
        Insert: {
          id?: string
          ip_address?: string | null
          plan_id?: string | null
          quote_id: string
          signed_at?: string
          signer_email?: string | null
          signer_name: string
          user_agent?: string | null
          version_hash?: string | null
        }
        Update: {
          id?: string
          ip_address?: string | null
          plan_id?: string | null
          quote_id?: string
          signed_at?: string
          signer_email?: string | null
          signer_name?: string
          user_agent?: string | null
          version_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_approvals_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "project_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_approvals_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_approvals_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "vw_quote_followup_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          added_at: string
          added_from: string | null
          cost_snapshot: number | null
          cost_snapshot_at: string | null
          cost_snapshot_currency: string | null
          cost_snapshot_source: string | null
          custom_image_url: string | null
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
          pricing_status: string
          product_id: string | null
          quantity: number
          quote_id: string
          retail_price: number | null
          room: string | null
          room_id: string | null
          selected_attributes: Json
          selected_color: string | null
          selected_size: string | null
          unit_price: number | null
        }
        Insert: {
          added_at?: string
          added_from?: string | null
          cost_snapshot?: number | null
          cost_snapshot_at?: string | null
          cost_snapshot_currency?: string | null
          cost_snapshot_source?: string | null
          custom_image_url?: string | null
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
          pricing_status?: string
          product_id?: string | null
          quantity?: number
          quote_id: string
          retail_price?: number | null
          room?: string | null
          room_id?: string | null
          selected_attributes?: Json
          selected_color?: string | null
          selected_size?: string | null
          unit_price?: number | null
        }
        Update: {
          added_at?: string
          added_from?: string | null
          cost_snapshot?: number | null
          cost_snapshot_at?: string | null
          cost_snapshot_currency?: string | null
          cost_snapshot_source?: string | null
          custom_image_url?: string | null
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
          pricing_status?: string
          product_id?: string | null
          quantity?: number
          quote_id?: string
          retail_price?: number | null
          room?: string | null
          room_id?: string | null
          selected_attributes?: Json
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
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "vw_quote_followup_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "project_rooms"
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
          workspace_id: string
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
          workspace_id: string
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
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_requests_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_requests_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "vw_quote_followup_queue"
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
            foreignKeyName: "quote_timeline_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "vw_quote_followup_queue"
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
            foreignKeyName: "quote_timeline_quote_item_id_fkey"
            columns: ["quote_item_id"]
            isOneToOne: false
            referencedRelation: "quote_items_with_room"
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
            foreignKeyName: "quote_upsells_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "vw_quote_followup_queue"
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
          accepted_at: string | null
          cash_discount_pct: number
          created_at: string
          currency: string | null
          custom_request_text: string | null
          customer_address_unit_id: string | null
          customer_company_id: string | null
          customer_contact_id: string | null
          expires_at: string | null
          extras_total: number | null
          grand_total: number | null
          id: string
          last_activity_at: string
          margin_pct: number
          name: string | null
          notes: string | null
          paid_upfront: boolean
          parent_quote_id: string | null
          pdf_generated_at: string | null
          pdf_generation_status: string | null
          pdf_storage_path: string | null
          project_id: string | null
          public_share_created_at: string | null
          public_share_enabled: boolean
          public_share_token: string | null
          quote_number: string | null
          quote_role: string
          rejected_at: string | null
          revision_number: number
          source_quote_id: string | null
          status: string
          status_tag_id: string | null
          submitted_at: string | null
          subtotal: number | null
          total_items: number | null
          updated_at: string
          user_id: string
          vat_amount: number | null
          vat_rate: number | null
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          cash_discount_pct?: number
          created_at?: string
          currency?: string | null
          custom_request_text?: string | null
          customer_address_unit_id?: string | null
          customer_company_id?: string | null
          customer_contact_id?: string | null
          expires_at?: string | null
          extras_total?: number | null
          grand_total?: number | null
          id?: string
          last_activity_at?: string
          margin_pct?: number
          name?: string | null
          notes?: string | null
          paid_upfront?: boolean
          parent_quote_id?: string | null
          pdf_generated_at?: string | null
          pdf_generation_status?: string | null
          pdf_storage_path?: string | null
          project_id?: string | null
          public_share_created_at?: string | null
          public_share_enabled?: boolean
          public_share_token?: string | null
          quote_number?: string | null
          quote_role?: string
          rejected_at?: string | null
          revision_number?: number
          source_quote_id?: string | null
          status?: string
          status_tag_id?: string | null
          submitted_at?: string | null
          subtotal?: number | null
          total_items?: number | null
          updated_at?: string
          user_id: string
          vat_amount?: number | null
          vat_rate?: number | null
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          cash_discount_pct?: number
          created_at?: string
          currency?: string | null
          custom_request_text?: string | null
          customer_address_unit_id?: string | null
          customer_company_id?: string | null
          customer_contact_id?: string | null
          expires_at?: string | null
          extras_total?: number | null
          grand_total?: number | null
          id?: string
          last_activity_at?: string
          margin_pct?: number
          name?: string | null
          notes?: string | null
          paid_upfront?: boolean
          parent_quote_id?: string | null
          pdf_generated_at?: string | null
          pdf_generation_status?: string | null
          pdf_storage_path?: string | null
          project_id?: string | null
          public_share_created_at?: string | null
          public_share_enabled?: boolean
          public_share_token?: string | null
          quote_number?: string | null
          quote_role?: string
          rejected_at?: string | null
          revision_number?: number
          source_quote_id?: string | null
          status?: string
          status_tag_id?: string | null
          submitted_at?: string | null
          subtotal?: number | null
          total_items?: number | null
          updated_at?: string
          user_id?: string
          vat_amount?: number | null
          vat_rate?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotes_customer_address_unit_id_fkey"
            columns: ["customer_address_unit_id"]
            isOneToOne: false
            referencedRelation: "crm_address_units"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "quotes_parent_quote_id_fkey"
            columns: ["parent_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_parent_quote_id_fkey"
            columns: ["parent_quote_id"]
            isOneToOne: false
            referencedRelation: "vw_quote_followup_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_source_quote_id_fkey"
            columns: ["source_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_source_quote_id_fkey"
            columns: ["source_quote_id"]
            isOneToOne: false
            referencedRelation: "vw_quote_followup_queue"
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
          user_id: string | null
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
          user_id?: string | null
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
          user_id?: string | null
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
      reseller_applications: {
        Row: {
          aade_checked_at: string | null
          aade_snapshot: Json | null
          aade_valid: boolean | null
          country_code: string
          created_at: string
          id: string
          operator_workspace_id: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
          vat_number: string
          workspace_id: string | null
        }
        Insert: {
          aade_checked_at?: string | null
          aade_snapshot?: Json | null
          aade_valid?: boolean | null
          country_code?: string
          created_at?: string
          id?: string
          operator_workspace_id: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
          vat_number: string
          workspace_id?: string | null
        }
        Update: {
          aade_checked_at?: string | null
          aade_snapshot?: Json | null
          aade_valid?: boolean | null
          country_code?: string
          created_at?: string
          id?: string
          operator_workspace_id?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          vat_number?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reseller_applications_operator_workspace_id_fkey"
            columns: ["operator_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reseller_applications_workspace_id_fkey"
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
          avg_rating: number | null
          last_computed_at: string
          review_count: number
          summary_text: string
          user_id: string
        }
        Insert: {
          avg_rating?: number | null
          last_computed_at?: string
          review_count?: number
          summary_text?: string
          user_id: string
        }
        Update: {
          avg_rating?: number | null
          last_computed_at?: string
          review_count?: number
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
      role_upgrade_requests: {
        Row: {
          admin_note: string | null
          created_at: string
          id: string
          justification: string | null
          requested_role_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["role_upgrade_status"]
          updated_at: string
          user_id: string
          vat_validated: boolean | null
          vat_validated_at: string | null
          vat_validated_name: string | null
          vat_validation_source: string | null
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          id?: string
          justification?: string | null
          requested_role_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["role_upgrade_status"]
          updated_at?: string
          user_id: string
          vat_validated?: boolean | null
          vat_validated_at?: string | null
          vat_validated_name?: string | null
          vat_validation_source?: string | null
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          id?: string
          justification?: string | null
          requested_role_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["role_upgrade_status"]
          updated_at?: string
          user_id?: string
          vat_validated?: boolean | null
          vat_validated_at?: string | null
          vat_validated_name?: string | null
          vat_validation_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "role_upgrade_requests_requested_role_id_fkey"
            columns: ["requested_role_id"]
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
          workspace_id: string
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
          workspace_id: string
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
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_searches_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "agent_chat_conversations"
            referencedColumns: ["id"]
          },
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
        Relationships: [
          {
            foreignKeyName: "search_analytics_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "agent_chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_analytics_moodboard_id_fkey"
            columns: ["moodboard_id"]
            isOneToOne: false
            referencedRelation: "moodboards"
            referencedColumns: ["id"]
          },
        ]
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
      seo_domain_audit_history: {
        Row: {
          audited_at: string
          backlinks: number | null
          cost_usd: number | null
          domain_rank: number | null
          id: string
          organic_traffic: number | null
          ranking_keywords: number | null
          raw_sections: Json | null
          referring_domains: number | null
          source: string
          spam_score: number | null
          top_competitors: Json | null
          top_keywords: Json | null
          tracked_domain_id: string
          user_id: string
        }
        Insert: {
          audited_at?: string
          backlinks?: number | null
          cost_usd?: number | null
          domain_rank?: number | null
          id?: string
          organic_traffic?: number | null
          ranking_keywords?: number | null
          raw_sections?: Json | null
          referring_domains?: number | null
          source?: string
          spam_score?: number | null
          top_competitors?: Json | null
          top_keywords?: Json | null
          tracked_domain_id: string
          user_id: string
        }
        Update: {
          audited_at?: string
          backlinks?: number | null
          cost_usd?: number | null
          domain_rank?: number | null
          id?: string
          organic_traffic?: number | null
          ranking_keywords?: number | null
          raw_sections?: Json | null
          referring_domains?: number | null
          source?: string
          spam_score?: number | null
          top_competitors?: Json | null
          top_keywords?: Json | null
          tracked_domain_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seo_domain_audit_history_tracked_domain_id_fkey"
            columns: ["tracked_domain_id"]
            isOneToOne: false
            referencedRelation: "seo_tracked_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_research_runs: {
        Row: {
          cost_usd: number | null
          country_code: string | null
          created_at: string
          error_message: string | null
          id: string
          kind: string
          label: string | null
          language_code: string | null
          latency_ms: number | null
          request_params: Json
          response: Json | null
          starred: boolean
          subject: string
          success: boolean
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          cost_usd?: number | null
          country_code?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          kind: string
          label?: string | null
          language_code?: string | null
          latency_ms?: number | null
          request_params?: Json
          response?: Json | null
          starred?: boolean
          subject: string
          success?: boolean
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          cost_usd?: number | null
          country_code?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          kind?: string
          label?: string | null
          language_code?: string | null
          latency_ms?: number | null
          request_params?: Json
          response?: Json | null
          starred?: boolean
          subject?: string
          success?: boolean
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seo_research_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_tracked_domains: {
        Row: {
          audit_cadence_hours: number
          country_code: string | null
          created_at: string
          current_backlinks: number | null
          current_domain_rank: number | null
          current_organic_traffic: number | null
          current_ranking_keywords: number | null
          current_referring_domains: number | null
          display_label: string | null
          domain: string
          id: string
          is_active: boolean
          language_code: string
          last_audit_id: string | null
          last_audited_at: string | null
          next_audit_at: string | null
          notes: string | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          audit_cadence_hours?: number
          country_code?: string | null
          created_at?: string
          current_backlinks?: number | null
          current_domain_rank?: number | null
          current_organic_traffic?: number | null
          current_ranking_keywords?: number | null
          current_referring_domains?: number | null
          display_label?: string | null
          domain: string
          id?: string
          is_active?: boolean
          language_code?: string
          last_audit_id?: string | null
          last_audited_at?: string | null
          next_audit_at?: string | null
          notes?: string | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          audit_cadence_hours?: number
          country_code?: string | null
          created_at?: string
          current_backlinks?: number | null
          current_domain_rank?: number | null
          current_organic_traffic?: number | null
          current_ranking_keywords?: number | null
          current_referring_domains?: number | null
          display_label?: string | null
          domain?: string
          id?: string
          is_active?: boolean
          language_code?: string
          last_audit_id?: string | null
          last_audited_at?: string | null
          next_audit_at?: string | null
          notes?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seo_tracked_domains_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
          metadata: Json | null
          platform: string
          user_id: string
          workspace_id: string
          zernio_account_id: string
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
          metadata?: Json | null
          platform: string
          user_id: string
          workspace_id: string
          zernio_account_id: string
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
          metadata?: Json | null
          platform?: string
          user_id?: string
          workspace_id?: string
          zernio_account_id?: string
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
          zernio_post_id: string | null
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
          zernio_post_id?: string | null
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
          zernio_post_id?: string | null
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
      social_zernio_profiles: {
        Row: {
          created_at: string
          workspace_id: string
          zernio_profile_id: string
        }
        Insert: {
          created_at?: string
          workspace_id: string
          zernio_profile_id: string
        }
        Update: {
          created_at?: string
          workspace_id?: string
          zernio_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_zernio_profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
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
      stock_allocations: {
        Row: {
          created_at: string
          customer_company_id: string | null
          customer_contact_id: string | null
          delivery_note_id: string | null
          demand_id: string
          demand_type: string
          dispatched_at: string | null
          expected_at: string | null
          id: string
          product_id: string | null
          quantity: number
          reserved_at: string | null
          source_type: string | null
          status: string
          supply_order_item_id: string | null
          updated_at: string
          warehouse_item_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          customer_company_id?: string | null
          customer_contact_id?: string | null
          delivery_note_id?: string | null
          demand_id: string
          demand_type: string
          dispatched_at?: string | null
          expected_at?: string | null
          id?: string
          product_id?: string | null
          quantity: number
          reserved_at?: string | null
          source_type?: string | null
          status?: string
          supply_order_item_id?: string | null
          updated_at?: string
          warehouse_item_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          customer_company_id?: string | null
          customer_contact_id?: string | null
          delivery_note_id?: string | null
          demand_id?: string
          demand_type?: string
          dispatched_at?: string | null
          expected_at?: string | null
          id?: string
          product_id?: string | null
          quantity?: number
          reserved_at?: string | null
          source_type?: string | null
          status?: string
          supply_order_item_id?: string | null
          updated_at?: string
          warehouse_item_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_allocations_customer_company_id_fkey"
            columns: ["customer_company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_allocations_customer_contact_id_fkey"
            columns: ["customer_contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_allocations_delivery_note_id_fkey"
            columns: ["delivery_note_id"]
            isOneToOne: false
            referencedRelation: "delivery_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_allocations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_allocations_supply_order_item_id_fkey"
            columns: ["supply_order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_allocations_warehouse_item_id_fkey"
            columns: ["warehouse_item_id"]
            isOneToOne: false
            referencedRelation: "warehouse_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_allocations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_count_lines: {
        Row: {
          count_id: string
          counted_qty: number | null
          created_at: string
          id: string
          name: string
          note: string | null
          product_id: string | null
          sku: string | null
          system_qty: number
          unit: string
          updated_at: string
          warehouse_item_id: string
          workspace_id: string
        }
        Insert: {
          count_id: string
          counted_qty?: number | null
          created_at?: string
          id?: string
          name: string
          note?: string | null
          product_id?: string | null
          sku?: string | null
          system_qty?: number
          unit?: string
          updated_at?: string
          warehouse_item_id: string
          workspace_id: string
        }
        Update: {
          count_id?: string
          counted_qty?: number | null
          created_at?: string
          id?: string
          name?: string
          note?: string | null
          product_id?: string | null
          sku?: string | null
          system_qty?: number
          unit?: string
          updated_at?: string
          warehouse_item_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_count_lines_count_id_fkey"
            columns: ["count_id"]
            isOneToOne: false
            referencedRelation: "stock_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_lines_warehouse_item_id_fkey"
            columns: ["warehouse_item_id"]
            isOneToOne: false
            referencedRelation: "warehouse_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_lines_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_counts: {
        Row: {
          adjusted_lines: number | null
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          posted_at: string | null
          posted_by: string | null
          status: string
          updated_at: string
          warehouse_id: string
          workspace_id: string
        }
        Insert: {
          adjusted_lines?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          posted_at?: string | null
          posted_by?: string | null
          status?: string
          updated_at?: string
          warehouse_id: string
          workspace_id: string
        }
        Update: {
          adjusted_lines?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          posted_at?: string | null
          posted_by?: string | null
          status?: string
          updated_at?: string
          warehouse_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_counts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_counts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_by: string | null
          direction: string
          id: string
          item_id: string | null
          occurred_at: string
          quantity: number
          reason: string | null
          source_id: string | null
          source_type: string | null
          workspace_id: string
        }
        Insert: {
          created_by?: string | null
          direction: string
          id?: string
          item_id?: string | null
          occurred_at?: string
          quantity: number
          reason?: string | null
          source_id?: string | null
          source_type?: string | null
          workspace_id: string
        }
        Update: {
          created_by?: string | null
          direction?: string
          id?: string
          item_id?: string | null
          occurred_at?: string
          quantity?: number
          reason?: string | null
          source_id?: string | null
          source_type?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "warehouse_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_cleanup_log: {
        Row: {
          bucket: string
          bytes_freed: number
          deleted: number
          details: Json
          error: string | null
          id: string
          ran_at: string
          scanned: number
          source: string
        }
        Insert: {
          bucket: string
          bytes_freed?: number
          deleted?: number
          details?: Json
          error?: string | null
          id?: string
          ran_at?: string
          scanned?: number
          source: string
        }
        Update: {
          bucket?: string
          bytes_freed?: number
          deleted?: number
          details?: Json
          error?: string | null
          id?: string
          ran_at?: string
          scanned?: number
          source?: string
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
      supplier_bills: {
        Row: {
          amount_due: number | null
          amount_paid: number
          category_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          due_at: string | null
          fx_rate_to_base: number
          id: string
          issued_at: string | null
          notes: string | null
          order_id: string | null
          paid_at: string | null
          project_id: string | null
          status: string
          subtotal_net: number
          supplier_bill_number: string | null
          supplier_company_id: string | null
          supplier_contact_id: string | null
          total: number
          updated_at: string
          vat_amount: number
          workspace_id: string
        }
        Insert: {
          amount_due?: number | null
          amount_paid?: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          due_at?: string | null
          fx_rate_to_base?: number
          id?: string
          issued_at?: string | null
          notes?: string | null
          order_id?: string | null
          paid_at?: string | null
          project_id?: string | null
          status?: string
          subtotal_net?: number
          supplier_bill_number?: string | null
          supplier_company_id?: string | null
          supplier_contact_id?: string | null
          total?: number
          updated_at?: string
          vat_amount?: number
          workspace_id: string
        }
        Update: {
          amount_due?: number | null
          amount_paid?: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          due_at?: string | null
          fx_rate_to_base?: number
          id?: string
          issued_at?: string | null
          notes?: string | null
          order_id?: string | null
          paid_at?: string | null
          project_id?: string | null
          status?: string
          subtotal_net?: number
          supplier_bill_number?: string | null
          supplier_company_id?: string | null
          supplier_contact_id?: string | null
          total?: number
          updated_at?: string
          vat_amount?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_bills_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_bills_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_bills_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_bills_supplier_company_id_fkey"
            columns: ["supplier_company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_bills_supplier_contact_id_fkey"
            columns: ["supplier_contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_bills_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_claim_requests: {
        Row: {
          country_code: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          evidence: Json
          id: string
          platform_supplier_id: string
          requesting_user_id: string
          requesting_workspace_id: string
          risk_flag: string
          status: string
          updated_at: string
          vat_number: string
        }
        Insert: {
          country_code: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          evidence?: Json
          id?: string
          platform_supplier_id: string
          requesting_user_id: string
          requesting_workspace_id: string
          risk_flag?: string
          status?: string
          updated_at?: string
          vat_number: string
        }
        Update: {
          country_code?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          evidence?: Json
          id?: string
          platform_supplier_id?: string
          requesting_user_id?: string
          requesting_workspace_id?: string
          risk_flag?: string
          status?: string
          updated_at?: string
          vat_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_claim_requests_platform_supplier_id_fkey"
            columns: ["platform_supplier_id"]
            isOneToOne: false
            referencedRelation: "platform_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_claim_requests_requesting_workspace_id_fkey"
            columns: ["requesting_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_credit_note_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          line_total: number
          net_value: number
          product_id: string | null
          quantity: number
          sku: string | null
          supplier_credit_note_id: string
          unit: string | null
          unit_price: number
          vat_amount: number
          vat_category: number | null
          vat_percent: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          line_total?: number
          net_value?: number
          product_id?: string | null
          quantity?: number
          sku?: string | null
          supplier_credit_note_id: string
          unit?: string | null
          unit_price?: number
          vat_amount?: number
          vat_category?: number | null
          vat_percent?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          line_total?: number
          net_value?: number
          product_id?: string | null
          quantity?: number
          sku?: string | null
          supplier_credit_note_id?: string
          unit?: string | null
          unit_price?: number
          vat_amount?: number
          vat_category?: number | null
          vat_percent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_credit_note_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_credit_note_items_supplier_credit_note_id_fkey"
            columns: ["supplier_credit_note_id"]
            isOneToOne: false
            referencedRelation: "supplier_credit_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_credit_notes: {
        Row: {
          category_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          external_mark: string | null
          fx_rate_to_base: number
          id: string
          issued_at: string
          notes: string | null
          order_id: string | null
          reason: string | null
          status: string
          subtotal_net: number
          supplier_bill_id: string | null
          supplier_company_id: string | null
          supplier_contact_id: string | null
          supplier_credit_note_number: string
          total: number
          updated_at: string
          vat_amount: number
          workspace_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          external_mark?: string | null
          fx_rate_to_base?: number
          id?: string
          issued_at?: string
          notes?: string | null
          order_id?: string | null
          reason?: string | null
          status?: string
          subtotal_net?: number
          supplier_bill_id?: string | null
          supplier_company_id?: string | null
          supplier_contact_id?: string | null
          supplier_credit_note_number: string
          total?: number
          updated_at?: string
          vat_amount?: number
          workspace_id: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          external_mark?: string | null
          fx_rate_to_base?: number
          id?: string
          issued_at?: string
          notes?: string | null
          order_id?: string | null
          reason?: string | null
          status?: string
          subtotal_net?: number
          supplier_bill_id?: string | null
          supplier_company_id?: string | null
          supplier_contact_id?: string | null
          supplier_credit_note_number?: string
          total?: number
          updated_at?: string
          vat_amount?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_credit_notes_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_credit_notes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_credit_notes_supplier_bill_id_fkey"
            columns: ["supplier_bill_id"]
            isOneToOne: false
            referencedRelation: "supplier_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_credit_notes_supplier_bill_id_fkey"
            columns: ["supplier_bill_id"]
            isOneToOne: false
            referencedRelation: "vw_ap_aging"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_credit_notes_supplier_company_id_fkey"
            columns: ["supplier_company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_credit_notes_supplier_contact_id_fkey"
            columns: ["supplier_contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_credit_notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_products: {
        Row: {
          availability: string | null
          cost: number | null
          created_at: string
          currency: string
          id: string
          is_preferred: boolean
          lead_time_days: number | null
          moq: number | null
          product_id: string
          supplier_company_id: string
          supplier_sku: string | null
          updated_at: string
          valid_until: string | null
          workspace_id: string
        }
        Insert: {
          availability?: string | null
          cost?: number | null
          created_at?: string
          currency?: string
          id?: string
          is_preferred?: boolean
          lead_time_days?: number | null
          moq?: number | null
          product_id: string
          supplier_company_id: string
          supplier_sku?: string | null
          updated_at?: string
          valid_until?: string | null
          workspace_id: string
        }
        Update: {
          availability?: string | null
          cost?: number | null
          created_at?: string
          currency?: string
          id?: string
          is_preferred?: boolean
          lead_time_days?: number | null
          moq?: number | null
          product_id?: string
          supplier_company_id?: string
          supplier_sku?: string | null
          updated_at?: string
          valid_until?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_supplier_company_id_fkey"
            columns: ["supplier_company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      tech_radar_findings: {
        Row: {
          category: string
          created_at: string
          dedupe_hash: string
          effort: string | null
          evidence: Json
          id: string
          impact: string | null
          is_new: boolean
          rationale: string
          recommendation: string | null
          ring: Database["public"]["Enums"]["tech_radar_ring"]
          run_id: string | null
          status: Database["public"]["Enums"]["tech_radar_status"]
          subject_id: string
          title: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          dedupe_hash: string
          effort?: string | null
          evidence?: Json
          id?: string
          impact?: string | null
          is_new?: boolean
          rationale: string
          recommendation?: string | null
          ring: Database["public"]["Enums"]["tech_radar_ring"]
          run_id?: string | null
          status?: Database["public"]["Enums"]["tech_radar_status"]
          subject_id: string
          title: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          dedupe_hash?: string
          effort?: string | null
          evidence?: Json
          id?: string
          impact?: string | null
          is_new?: boolean
          rationale?: string
          recommendation?: string | null
          ring?: Database["public"]["Enums"]["tech_radar_ring"]
          run_id?: string | null
          status?: Database["public"]["Enums"]["tech_radar_status"]
          subject_id?: string
          title?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tech_radar_findings_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "tech_radar_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tech_radar_findings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tech_radar_subjects: {
        Row: {
          component: string | null
          consecutive_quiet_runs: number
          constraints: string | null
          created_at: string
          created_by: string | null
          current_approach: string
          id: string
          is_active: boolean
          last_review_cost_usd: number
          last_reviewed_at: string | null
          monitor_agent_id: string | null
          next_review_at: string | null
          repo: string | null
          review_interval_hours: number
          tags: string[]
          title: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          component?: string | null
          consecutive_quiet_runs?: number
          constraints?: string | null
          created_at?: string
          created_by?: string | null
          current_approach: string
          id?: string
          is_active?: boolean
          last_review_cost_usd?: number
          last_reviewed_at?: string | null
          monitor_agent_id?: string | null
          next_review_at?: string | null
          repo?: string | null
          review_interval_hours?: number
          tags?: string[]
          title: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          component?: string | null
          consecutive_quiet_runs?: number
          constraints?: string | null
          created_at?: string
          created_by?: string | null
          current_approach?: string
          id?: string
          is_active?: boolean
          last_review_cost_usd?: number
          last_reviewed_at?: string | null
          monitor_agent_id?: string | null
          next_review_at?: string | null
          repo?: string | null
          review_interval_hours?: number
          tags?: string[]
          title?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tech_radar_subjects_monitor_agent_id_fkey"
            columns: ["monitor_agent_id"]
            isOneToOne: false
            referencedRelation: "background_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tech_radar_subjects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_purity_audit_log: {
        Row: {
          has_violations: boolean
          id: string
          ran_at: string
          report: Json
        }
        Insert: {
          has_violations?: boolean
          id?: string
          ran_at?: string
          report: Json
        }
        Update: {
          has_violations?: boolean
          id?: string
          ran_at?: string
          report?: Json
        }
        Relationships: []
      }
      time_entries: {
        Row: {
          billed_at: string | null
          billed_invoice_id: string | null
          created_at: string
          created_by: string | null
          customer_company_id: string | null
          customer_contact_id: string | null
          description: string
          hourly_rate: number
          id: string
          is_billable: boolean
          minutes: number
          updated_at: string
          user_id: string | null
          work_date: string
          workspace_id: string
        }
        Insert: {
          billed_at?: string | null
          billed_invoice_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_company_id?: string | null
          customer_contact_id?: string | null
          description: string
          hourly_rate?: number
          id?: string
          is_billable?: boolean
          minutes: number
          updated_at?: string
          user_id?: string | null
          work_date?: string
          workspace_id: string
        }
        Update: {
          billed_at?: string | null
          billed_invoice_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_company_id?: string | null
          customer_contact_id?: string | null
          description?: string
          hourly_rate?: number
          id?: string
          is_billable?: boolean
          minutes?: number
          updated_at?: string
          user_id?: string | null
          work_date?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_billed_invoice_id_fkey"
            columns: ["billed_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_billed_invoice_id_fkey"
            columns: ["billed_invoice_id"]
            isOneToOne: false
            referencedRelation: "vw_ar_aging"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_customer_company_id_fkey"
            columns: ["customer_company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_customer_contact_id_fkey"
            columns: ["customer_contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      tracked_jobs: {
        Row: {
          alert_channels: string[]
          alert_on_burst: boolean
          alert_webhook_url: string | null
          api_key_id: string | null
          auto_expand_keywords: boolean
          background_agent_id: string | null
          burst_threshold: number
          careers_page_urls: string[] | null
          consecutive_stable_refreshes: number | null
          country_code: string | null
          created_at: string
          current_listing_count_24h: number | null
          current_listing_count_7d: number | null
          current_metadata: Json | null
          current_snapshot_at: string | null
          current_top_companies: Json | null
          digest_day_of_week: number | null
          digest_enabled: boolean
          digest_hour_utc: number
          employment_type: string[] | null
          excluded_companies: string[] | null
          excluded_keywords: string[] | null
          expanded_keywords: string[] | null
          id: string
          is_active: boolean
          keywords: string[]
          label: string
          last_burst_alert_at: string | null
          last_digest_sent_at: string | null
          last_error: string | null
          last_keywords_expanded_at: string | null
          last_refresh_billed_usd: number | null
          last_refresh_credits_debited: number | null
          last_refresh_credits_used: number | null
          last_refreshed_at: string | null
          location: string | null
          max_age_days: number
          next_check_at: string | null
          preferred_companies: string[] | null
          query_phrasings: string[] | null
          refresh_interval_hours: number
          remote_only: boolean
          rss_feed_urls: string[] | null
          salary_currency: string | null
          salary_min: number | null
          seniority: string | null
          source_conversation_id: string | null
          sources_enabled: Json
          total_billed_usd: number
          total_credits_used: number | null
          total_partner_credits_debited: number
          updated_at: string
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          alert_channels?: string[]
          alert_on_burst?: boolean
          alert_webhook_url?: string | null
          api_key_id?: string | null
          auto_expand_keywords?: boolean
          background_agent_id?: string | null
          burst_threshold?: number
          careers_page_urls?: string[] | null
          consecutive_stable_refreshes?: number | null
          country_code?: string | null
          created_at?: string
          current_listing_count_24h?: number | null
          current_listing_count_7d?: number | null
          current_metadata?: Json | null
          current_snapshot_at?: string | null
          current_top_companies?: Json | null
          digest_day_of_week?: number | null
          digest_enabled?: boolean
          digest_hour_utc?: number
          employment_type?: string[] | null
          excluded_companies?: string[] | null
          excluded_keywords?: string[] | null
          expanded_keywords?: string[] | null
          id?: string
          is_active?: boolean
          keywords?: string[]
          label: string
          last_burst_alert_at?: string | null
          last_digest_sent_at?: string | null
          last_error?: string | null
          last_keywords_expanded_at?: string | null
          last_refresh_billed_usd?: number | null
          last_refresh_credits_debited?: number | null
          last_refresh_credits_used?: number | null
          last_refreshed_at?: string | null
          location?: string | null
          max_age_days?: number
          next_check_at?: string | null
          preferred_companies?: string[] | null
          query_phrasings?: string[] | null
          refresh_interval_hours?: number
          remote_only?: boolean
          rss_feed_urls?: string[] | null
          salary_currency?: string | null
          salary_min?: number | null
          seniority?: string | null
          source_conversation_id?: string | null
          sources_enabled?: Json
          total_billed_usd?: number
          total_credits_used?: number | null
          total_partner_credits_debited?: number
          updated_at?: string
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          alert_channels?: string[]
          alert_on_burst?: boolean
          alert_webhook_url?: string | null
          api_key_id?: string | null
          auto_expand_keywords?: boolean
          background_agent_id?: string | null
          burst_threshold?: number
          careers_page_urls?: string[] | null
          consecutive_stable_refreshes?: number | null
          country_code?: string | null
          created_at?: string
          current_listing_count_24h?: number | null
          current_listing_count_7d?: number | null
          current_metadata?: Json | null
          current_snapshot_at?: string | null
          current_top_companies?: Json | null
          digest_day_of_week?: number | null
          digest_enabled?: boolean
          digest_hour_utc?: number
          employment_type?: string[] | null
          excluded_companies?: string[] | null
          excluded_keywords?: string[] | null
          expanded_keywords?: string[] | null
          id?: string
          is_active?: boolean
          keywords?: string[]
          label?: string
          last_burst_alert_at?: string | null
          last_digest_sent_at?: string | null
          last_error?: string | null
          last_keywords_expanded_at?: string | null
          last_refresh_billed_usd?: number | null
          last_refresh_credits_debited?: number | null
          last_refresh_credits_used?: number | null
          last_refreshed_at?: string | null
          location?: string | null
          max_age_days?: number
          next_check_at?: string | null
          preferred_companies?: string[] | null
          query_phrasings?: string[] | null
          refresh_interval_hours?: number
          remote_only?: boolean
          rss_feed_urls?: string[] | null
          salary_currency?: string | null
          salary_min?: number | null
          seniority?: string | null
          source_conversation_id?: string | null
          sources_enabled?: Json
          total_billed_usd?: number
          total_credits_used?: number | null
          total_partner_credits_debited?: number
          updated_at?: string
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracked_jobs_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracked_jobs_background_agent_id_fkey"
            columns: ["background_agent_id"]
            isOneToOne: false
            referencedRelation: "background_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracked_jobs_source_conversation_id_fkey"
            columns: ["source_conversation_id"]
            isOneToOne: false
            referencedRelation: "agent_chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracked_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tracked_mentions: {
        Row: {
          alert_channels: string[] | null
          alert_on_llm_visibility_change: boolean | null
          alert_on_negative_sentiment: boolean | null
          alert_on_new_outlet: boolean | null
          alert_on_spike: boolean | null
          alert_webhook_url: string | null
          aliases: string[] | null
          api_key_id: string | null
          auto_expand_aliases: boolean
          brand_name: string | null
          consecutive_stable_refreshes: number | null
          country_codes: string[] | null
          created_at: string
          current_mention_count_30d: number | null
          current_mention_count_7d: number | null
          current_metadata: Json | null
          current_sentiment_avg: number | null
          current_share_of_voice: number | null
          current_snapshot_at: string | null
          current_top_outlets: Json | null
          homepage_domain: string | null
          id: string
          is_active: boolean
          language_codes: string[] | null
          last_error: string | null
          last_refresh_billed_usd: number | null
          last_refresh_credits_debited: number | null
          last_refresh_credits_used: number | null
          last_refreshed_at: string | null
          next_check_at: string | null
          product_id: string | null
          recency_days: number
          refresh_interval_hours: number
          source_config: Json
          sources_enabled: Json
          subject_facets: Json | null
          subject_facets_cached_at: string | null
          subject_label: string
          subject_type: Database["public"]["Enums"]["mention_subject_type"]
          total_billed_usd: number
          total_credits_used: number | null
          total_partner_credits_debited: number
          updated_at: string
          user_id: string | null
          velocity_score: number | null
          workspace_id: string
        }
        Insert: {
          alert_channels?: string[] | null
          alert_on_llm_visibility_change?: boolean | null
          alert_on_negative_sentiment?: boolean | null
          alert_on_new_outlet?: boolean | null
          alert_on_spike?: boolean | null
          alert_webhook_url?: string | null
          aliases?: string[] | null
          api_key_id?: string | null
          auto_expand_aliases?: boolean
          brand_name?: string | null
          consecutive_stable_refreshes?: number | null
          country_codes?: string[] | null
          created_at?: string
          current_mention_count_30d?: number | null
          current_mention_count_7d?: number | null
          current_metadata?: Json | null
          current_sentiment_avg?: number | null
          current_share_of_voice?: number | null
          current_snapshot_at?: string | null
          current_top_outlets?: Json | null
          homepage_domain?: string | null
          id?: string
          is_active?: boolean
          language_codes?: string[] | null
          last_error?: string | null
          last_refresh_billed_usd?: number | null
          last_refresh_credits_debited?: number | null
          last_refresh_credits_used?: number | null
          last_refreshed_at?: string | null
          next_check_at?: string | null
          product_id?: string | null
          recency_days?: number
          refresh_interval_hours?: number
          source_config?: Json
          sources_enabled?: Json
          subject_facets?: Json | null
          subject_facets_cached_at?: string | null
          subject_label: string
          subject_type?: Database["public"]["Enums"]["mention_subject_type"]
          total_billed_usd?: number
          total_credits_used?: number | null
          total_partner_credits_debited?: number
          updated_at?: string
          user_id?: string | null
          velocity_score?: number | null
          workspace_id: string
        }
        Update: {
          alert_channels?: string[] | null
          alert_on_llm_visibility_change?: boolean | null
          alert_on_negative_sentiment?: boolean | null
          alert_on_new_outlet?: boolean | null
          alert_on_spike?: boolean | null
          alert_webhook_url?: string | null
          aliases?: string[] | null
          api_key_id?: string | null
          auto_expand_aliases?: boolean
          brand_name?: string | null
          consecutive_stable_refreshes?: number | null
          country_codes?: string[] | null
          created_at?: string
          current_mention_count_30d?: number | null
          current_mention_count_7d?: number | null
          current_metadata?: Json | null
          current_sentiment_avg?: number | null
          current_share_of_voice?: number | null
          current_snapshot_at?: string | null
          current_top_outlets?: Json | null
          homepage_domain?: string | null
          id?: string
          is_active?: boolean
          language_codes?: string[] | null
          last_error?: string | null
          last_refresh_billed_usd?: number | null
          last_refresh_credits_debited?: number | null
          last_refresh_credits_used?: number | null
          last_refreshed_at?: string | null
          next_check_at?: string | null
          product_id?: string | null
          recency_days?: number
          refresh_interval_hours?: number
          source_config?: Json
          sources_enabled?: Json
          subject_facets?: Json | null
          subject_facets_cached_at?: string | null
          subject_label?: string
          subject_type?: Database["public"]["Enums"]["mention_subject_type"]
          total_billed_usd?: number
          total_credits_used?: number | null
          total_partner_credits_debited?: number
          updated_at?: string
          user_id?: string | null
          velocity_score?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracked_mentions_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracked_mentions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
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
          workspace_id: string
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
          workspace_id: string
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
          workspace_id?: string
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
      trip_expense_items: {
        Row: {
          amount: number
          approval_status: string
          billable: boolean
          category: string
          created_at: string
          currency: string
          description: string | null
          expense_date: string
          id: string
          payment_method: string | null
          project_id: string | null
          receipt_bucket: string | null
          receipt_mime: string | null
          receipt_name: string | null
          receipt_path: string | null
          report_id: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sort_order: number
          updated_at: string
          vat_amount: number | null
          vendor: string | null
          workspace_id: string
        }
        Insert: {
          amount?: number
          approval_status?: string
          billable?: boolean
          category?: string
          created_at?: string
          currency?: string
          description?: string | null
          expense_date?: string
          id?: string
          payment_method?: string | null
          project_id?: string | null
          receipt_bucket?: string | null
          receipt_mime?: string | null
          receipt_name?: string | null
          receipt_path?: string | null
          report_id: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sort_order?: number
          updated_at?: string
          vat_amount?: number | null
          vendor?: string | null
          workspace_id: string
        }
        Update: {
          amount?: number
          approval_status?: string
          billable?: boolean
          category?: string
          created_at?: string
          currency?: string
          description?: string | null
          expense_date?: string
          id?: string
          payment_method?: string | null
          project_id?: string | null
          receipt_bucket?: string | null
          receipt_mime?: string | null
          receipt_name?: string | null
          receipt_path?: string | null
          report_id?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sort_order?: number
          updated_at?: string
          vat_amount?: number | null
          vendor?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_expense_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_expense_items_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "trip_expense_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_expense_reports: {
        Row: {
          approved_amount: number
          assigned_by: string | null
          card_type: string
          created_at: string
          currency: string
          destination: string | null
          id: string
          item_count: number
          notes: string | null
          pending_amount: number
          purpose: string | null
          reimbursed_at: string | null
          reimbursement_planned_payment_id: string | null
          rejected_amount: number
          request_note: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string | null
          title: string
          total_amount: number
          trip_end: string | null
          trip_start: string | null
          updated_at: string
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          approved_amount?: number
          assigned_by?: string | null
          card_type?: string
          created_at?: string
          currency?: string
          destination?: string | null
          id?: string
          item_count?: number
          notes?: string | null
          pending_amount?: number
          purpose?: string | null
          reimbursed_at?: string | null
          reimbursement_planned_payment_id?: string | null
          rejected_amount?: number
          request_note?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          title: string
          total_amount?: number
          trip_end?: string | null
          trip_start?: string | null
          updated_at?: string
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          approved_amount?: number
          assigned_by?: string | null
          card_type?: string
          created_at?: string
          currency?: string
          destination?: string | null
          id?: string
          item_count?: number
          notes?: string | null
          pending_amount?: number
          purpose?: string | null
          reimbursed_at?: string | null
          reimbursement_planned_payment_id?: string | null
          rejected_amount?: number
          request_note?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          title?: string
          total_amount?: number
          trip_end?: string | null
          trip_start?: string | null
          updated_at?: string
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_expense_reports_reimbursement_planned_payment_id_fkey"
            columns: ["reimbursement_planned_payment_id"]
            isOneToOne: false
            referencedRelation: "planned_payments"
            referencedColumns: ["id"]
          },
        ]
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
          user_id: string | null
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
          user_id?: string | null
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
          user_id?: string | null
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
          branding_company_name: string | null
          branding_contact_line: string | null
          branding_logo_url: string | null
          business_id: string | null
          company: string | null
          created_at: string | null
          credits_balance: number
          email: string | null
          entity_type: Database["public"]["Enums"]["user_entity_type"]
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
          stripe_billing_customer_id: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_current_period_end: string | null
          subscription_status: string | null
          subscription_tier: string | null
          theme_preference: string
          updated_at: string | null
          user_id: string
          website_url: string | null
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          bio?: string | null
          booking_enabled?: boolean | null
          branding_company_name?: string | null
          branding_contact_line?: string | null
          branding_logo_url?: string | null
          business_id?: string | null
          company?: string | null
          created_at?: string | null
          credits_balance?: number
          email?: string | null
          entity_type?: Database["public"]["Enums"]["user_entity_type"]
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
          stripe_billing_customer_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_current_period_end?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          theme_preference?: string
          updated_at?: string | null
          user_id: string
          website_url?: string | null
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          bio?: string | null
          booking_enabled?: boolean | null
          branding_company_name?: string | null
          branding_contact_line?: string | null
          branding_logo_url?: string | null
          business_id?: string | null
          company?: string | null
          created_at?: string | null
          credits_balance?: number
          email?: string | null
          entity_type?: Database["public"]["Enums"]["user_entity_type"]
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
          stripe_billing_customer_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_current_period_end?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          theme_preference?: string
          updated_at?: string | null
          user_id?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
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
      user_website_pages: {
        Row: {
          content_excerpt: string | null
          created_at: string
          description: string | null
          embedding: unknown
          fetched_at: string | null
          http_status: number | null
          id: string
          is_active: boolean
          keywords: string[]
          last_seen_in_sitemap: string
          title: string | null
          updated_at: string
          url: string
          user_id: string
          website_id: string
        }
        Insert: {
          content_excerpt?: string | null
          created_at?: string
          description?: string | null
          embedding?: unknown
          fetched_at?: string | null
          http_status?: number | null
          id?: string
          is_active?: boolean
          keywords?: string[]
          last_seen_in_sitemap?: string
          title?: string | null
          updated_at?: string
          url: string
          user_id: string
          website_id: string
        }
        Update: {
          content_excerpt?: string | null
          created_at?: string
          description?: string | null
          embedding?: unknown
          fetched_at?: string | null
          http_status?: number | null
          id?: string
          is_active?: boolean
          keywords?: string[]
          last_seen_in_sitemap?: string
          title?: string | null
          updated_at?: string
          url?: string
          user_id?: string
          website_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_website_pages_website_id_fkey"
            columns: ["website_id"]
            isOneToOne: false
            referencedRelation: "user_websites"
            referencedColumns: ["id"]
          },
        ]
      }
      user_websites: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          is_active: boolean
          is_default: boolean
          last_crawl_error: string | null
          last_crawled_at: string | null
          max_pages: number
          page_count: number
          sitemap_url: string | null
          updated_at: string
          url: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          last_crawl_error?: string | null
          last_crawled_at?: string | null
          max_pages?: number
          page_count?: number
          sitemap_url?: string | null
          updated_at?: string
          url: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          last_crawl_error?: string | null
          last_crawled_at?: string | null
          max_pages?: number
          page_count?: number
          sitemap_url?: string | null
          updated_at?: string
          url?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_websites_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
      warehouse_coverage: {
        Row: {
          country_code: string | null
          created_at: string
          id: string
          postal_prefix: string | null
          priority: number
          region: string | null
          updated_at: string
          warehouse_id: string
          workspace_id: string
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          id?: string
          postal_prefix?: string | null
          priority?: number
          region?: string | null
          updated_at?: string
          warehouse_id: string
          workspace_id: string
        }
        Update: {
          country_code?: string | null
          created_at?: string
          id?: string
          postal_prefix?: string | null
          priority?: number
          region?: string | null
          updated_at?: string
          warehouse_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_coverage_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_coverage_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_items: {
        Row: {
          barcode: string | null
          cpv_code: string | null
          created_at: string
          id: string
          location: string | null
          mydata_classification_category: string | null
          mydata_classification_type: string | null
          name: string
          product_id: string | null
          qty_on_hand: number
          qty_reserved: number
          reorder_point: number
          serial_number: string | null
          sku: string | null
          taric_code: string | null
          unit: string
          updated_at: string
          warehouse_id: string | null
          workspace_id: string
        }
        Insert: {
          barcode?: string | null
          cpv_code?: string | null
          created_at?: string
          id?: string
          location?: string | null
          mydata_classification_category?: string | null
          mydata_classification_type?: string | null
          name: string
          product_id?: string | null
          qty_on_hand?: number
          qty_reserved?: number
          reorder_point?: number
          serial_number?: string | null
          sku?: string | null
          taric_code?: string | null
          unit?: string
          updated_at?: string
          warehouse_id?: string | null
          workspace_id: string
        }
        Update: {
          barcode?: string | null
          cpv_code?: string | null
          created_at?: string
          id?: string
          location?: string | null
          mydata_classification_category?: string | null
          mydata_classification_type?: string | null
          name?: string
          product_id?: string | null
          qty_on_hand?: number
          qty_reserved?: number
          reorder_point?: number
          serial_number?: string | null
          sku?: string | null
          taric_code?: string | null
          unit?: string
          updated_at?: string
          warehouse_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_items_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_pending_items: {
        Row: {
          add_to_catalog: boolean
          attributes: string | null
          category_id: string | null
          created_at: string
          currency: string
          id: string
          inbound_document_id: string | null
          line_index: number | null
          matched_product_id: string | null
          matched_warehouse_item_id: string | null
          name: string
          quantity: number
          raw_description: string | null
          sales_price: number | null
          size: string | null
          sku: string | null
          status: string
          suggested_sales_price: number | null
          target_warehouse_id: string | null
          unit: string | null
          unit_cost: number | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          add_to_catalog?: boolean
          attributes?: string | null
          category_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          inbound_document_id?: string | null
          line_index?: number | null
          matched_product_id?: string | null
          matched_warehouse_item_id?: string | null
          name: string
          quantity?: number
          raw_description?: string | null
          sales_price?: number | null
          size?: string | null
          sku?: string | null
          status?: string
          suggested_sales_price?: number | null
          target_warehouse_id?: string | null
          unit?: string | null
          unit_cost?: number | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          add_to_catalog?: boolean
          attributes?: string | null
          category_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          inbound_document_id?: string | null
          line_index?: number | null
          matched_product_id?: string | null
          matched_warehouse_item_id?: string | null
          name?: string
          quantity?: number
          raw_description?: string | null
          sales_price?: number | null
          size?: string | null
          sku?: string | null
          status?: string
          suggested_sales_price?: number | null
          target_warehouse_id?: string | null
          unit?: string | null
          unit_cost?: number | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_pending_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_pending_items_inbound_document_id_fkey"
            columns: ["inbound_document_id"]
            isOneToOne: false
            referencedRelation: "inbound_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_pending_items_matched_product_id_fkey"
            columns: ["matched_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_pending_items_matched_warehouse_item_id_fkey"
            columns: ["matched_warehouse_item_id"]
            isOneToOne: false
            referencedRelation: "warehouse_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_pending_items_target_warehouse_id_fkey"
            columns: ["target_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          code: string | null
          created_at: string
          id: string
          is_default: boolean
          location: string | null
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          location?: string | null
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          location?: string | null
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      workspace_aade_credentials: {
        Row: {
          afm_called_by: string | null
          created_at: string
          enabled: boolean
          password: string | null
          updated_at: string
          username: string | null
          workspace_id: string
        }
        Insert: {
          afm_called_by?: string | null
          created_at?: string
          enabled?: boolean
          password?: string | null
          updated_at?: string
          username?: string | null
          workspace_id: string
        }
        Update: {
          afm_called_by?: string | null
          created_at?: string
          enabled?: boolean
          password?: string | null
          updated_at?: string
          username?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_aade_credentials_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_credit_transactions: {
        Row: {
          actor_user_id: string | null
          amount: number
          balance_after: number
          created_at: string
          description: string | null
          id: string
          metadata: Json
          operation_type: string | null
          transaction_type: string
          workspace_id: string
        }
        Insert: {
          actor_user_id?: string | null
          amount: number
          balance_after: number
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          operation_type?: string | null
          transaction_type?: string
          workspace_id: string
        }
        Update: {
          actor_user_id?: string | null
          amount?: number
          balance_after?: number
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          operation_type?: string | null
          transaction_type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_credit_transactions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_credits: {
        Row: {
          balance: number
          created_at: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_credits_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_cron_billing_state: {
        Row: {
          cron_key: string
          last_charged_at: string | null
          last_notified_at: string | null
          paused_at: string | null
          resumed_at: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          cron_key: string
          last_charged_at?: string | null
          last_notified_at?: string | null
          paused_at?: string | null
          resumed_at?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          cron_key?: string
          last_charged_at?: string | null
          last_notified_at?: string | null
          paused_at?: string | null
          resumed_at?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_cron_billing_state_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_doc_suggestions: {
        Row: {
          created_at: string
          doc_id: string
          id: string
          proposed_content_markdown: string
          proposer_user_id: string
          rationale: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          doc_id: string
          id?: string
          proposed_content_markdown: string
          proposer_user_id: string
          rationale?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          doc_id?: string
          id?: string
          proposed_content_markdown?: string
          proposer_user_id?: string
          rationale?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_doc_suggestions_doc_id_fkey"
            columns: ["doc_id"]
            isOneToOne: false
            referencedRelation: "workspace_docs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_doc_suggestions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_doc_type: {
        Row: {
          code: string
          default_income_classification_category: string | null
          default_income_classification_type: string | null
          default_withholding_code: string | null
          enabled: boolean
          workspace_id: string
        }
        Insert: {
          code: string
          default_income_classification_category?: string | null
          default_income_classification_type?: string | null
          default_withholding_code?: string | null
          enabled?: boolean
          workspace_id: string
        }
        Update: {
          code?: string
          default_income_classification_category?: string | null
          default_income_classification_type?: string | null
          default_withholding_code?: string | null
          enabled?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_doc_type_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_docs: {
        Row: {
          category: string | null
          content_markdown: string
          content_tsv: unknown
          created_at: string
          created_by: string | null
          id: string
          status: string
          tags: string[]
          title: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          category?: string | null
          content_markdown?: string
          content_tsv?: unknown
          created_at?: string
          created_by?: string | null
          id?: string
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          category?: string | null
          content_markdown?: string
          content_tsv?: unknown
          created_at?: string
          created_by?: string | null
          id?: string
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_docs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_email_config: {
        Row: {
          contacts_auto_sync: boolean
          contacts_last_sync_count: number | null
          contacts_last_sync_error: string | null
          contacts_last_synced_at: string | null
          created_at: string
          daily_send_limit: number | null
          enabled: boolean
          from_email: string | null
          from_name: string | null
          reply_to: string | null
          resend_api_key: string | null
          resend_audience_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          contacts_auto_sync?: boolean
          contacts_last_sync_count?: number | null
          contacts_last_sync_error?: string | null
          contacts_last_synced_at?: string | null
          created_at?: string
          daily_send_limit?: number | null
          enabled?: boolean
          from_email?: string | null
          from_name?: string | null
          reply_to?: string | null
          resend_api_key?: string | null
          resend_audience_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          contacts_auto_sync?: boolean
          contacts_last_sync_count?: number | null
          contacts_last_sync_error?: string | null
          contacts_last_synced_at?: string | null
          created_at?: string
          daily_send_limit?: number | null
          enabled?: boolean
          from_email?: string | null
          from_name?: string | null
          reply_to?: string | null
          resend_api_key?: string | null
          resend_audience_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_email_config_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_ergani_credentials: {
        Row: {
          branch_aa: string
          created_at: string
          employer_afm: string | null
          enabled: boolean
          environment: string
          password: string | null
          updated_at: string
          username: string | null
          usertype: string
          workspace_id: string
        }
        Insert: {
          branch_aa?: string
          created_at?: string
          employer_afm?: string | null
          enabled?: boolean
          environment?: string
          password?: string | null
          updated_at?: string
          username?: string | null
          usertype?: string
          workspace_id: string
        }
        Update: {
          branch_aa?: string
          created_at?: string
          employer_afm?: string | null
          enabled?: boolean
          environment?: string
          password?: string | null
          updated_at?: string
          username?: string | null
          usertype?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_ergani_credentials_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_fiscal_bindings: {
        Row: {
          capability: string
          connector_slug: string
          created_at: string
          id: string
          is_active: boolean
          updated_at: string
          workspace_id: string
        }
        Insert: {
          capability: string
          connector_slug: string
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          workspace_id: string
        }
        Update: {
          capability?: string
          connector_slug?: string
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_fiscal_bindings_connector_slug_fkey"
            columns: ["connector_slug"]
            isOneToOne: false
            referencedRelation: "fiscal_connectors"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "workspace_fiscal_bindings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_inbound_credentials: {
        Row: {
          aade_user_id: string | null
          base_url: string | null
          created_at: string
          enabled: boolean
          subscription_key: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          aade_user_id?: string | null
          base_url?: string | null
          created_at?: string
          enabled?: boolean
          subscription_key?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          aade_user_id?: string | null
          base_url?: string | null
          created_at?: string
          enabled?: boolean
          subscription_key?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_inbound_credentials_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          code: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          role: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          role?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          role?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invites_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_member_credit_limits: {
        Row: {
          monthly_limit: number | null
          updated_at: string
          updated_by: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          monthly_limit?: number | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          monthly_limit?: number | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_member_credit_limits_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      workspace_module_entitlements: {
        Row: {
          enabled: boolean
          granted_at: string
          granted_by: string | null
          id: string
          module_slug: string
          workspace_id: string
        }
        Insert: {
          enabled?: boolean
          granted_at?: string
          granted_by?: string | null
          id?: string
          module_slug: string
          workspace_id: string
        }
        Update: {
          enabled?: boolean
          granted_at?: string
          granted_by?: string | null
          id?: string
          module_slug?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_module_entitlements_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_module_subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          id: string
          module_slug: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          module_slug: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          module_slug?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_module_subscriptions_module_slug_fkey"
            columns: ["module_slug"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "workspace_module_subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_payment_config: {
        Row: {
          charges_enabled: boolean
          details_submitted: boolean
          payout_mode: string
          stripe_connect_account_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          charges_enabled?: boolean
          details_submitted?: boolean
          payout_mode?: string
          stripe_connect_account_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          charges_enabled?: boolean
          details_submitted?: boolean
          payout_mode?: string
          stripe_connect_account_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_payment_config_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
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
      workspace_shipping_credentials: {
        Row: {
          api_key: string | null
          base_url: string | null
          created_at: string
          enabled: boolean
          provider: string
          searates_api_key: string | null
          searates_platform_id: string | null
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          api_key?: string | null
          base_url?: string | null
          created_at?: string
          enabled?: boolean
          provider?: string
          searates_api_key?: string | null
          searates_platform_id?: string | null
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          api_key?: string | null
          base_url?: string | null
          created_at?: string
          enabled?: boolean
          provider?: string
          searates_api_key?: string | null
          searates_platform_id?: string | null
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_shipping_credentials_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_storefront: {
        Row: {
          accent: string | null
          created_at: string
          enabled: boolean
          headline: string | null
          subheadline: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accent?: string | null
          created_at?: string
          enabled?: boolean
          headline?: string | null
          subheadline?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accent?: string | null
          created_at?: string
          enabled?: boolean
          headline?: string | null
          subheadline?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_storefront_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_user_levels: {
        Row: {
          created_at: string
          default_discount_pct: number
          id: string
          is_active: boolean
          is_default: boolean
          label: string
          level_key: string
          sort_order: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          default_discount_pct?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          label: string
          level_key: string
          sort_order?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          default_discount_pct?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          label?: string
          level_key?: string
          sort_order?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_user_levels_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          can_supply_products: boolean
          catalog_access: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_root: boolean
          kind: string
          name: string
          parent_crm_company_id: string | null
          parent_discount_pct: number | null
          parent_user_level_key: string | null
          parent_workspace_id: string | null
          referral_code: string | null
          referral_enabled: boolean
          settings: Json | null
          slug: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          can_supply_products?: boolean
          catalog_access?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_root?: boolean
          kind?: string
          name: string
          parent_crm_company_id?: string | null
          parent_discount_pct?: number | null
          parent_user_level_key?: string | null
          parent_workspace_id?: string | null
          referral_code?: string | null
          referral_enabled?: boolean
          settings?: Json | null
          slug: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          can_supply_products?: boolean
          catalog_access?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_root?: boolean
          kind?: string
          name?: string
          parent_crm_company_id?: string | null
          parent_discount_pct?: number | null
          parent_user_level_key?: string | null
          parent_workspace_id?: string | null
          referral_code?: string | null
          referral_enabled?: boolean
          settings?: Json | null
          slug?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_parent_crm_company_id_fkey"
            columns: ["parent_crm_company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspaces_parent_workspace_id_fkey"
            columns: ["parent_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      catalog_operations_summary: {
        Row: {
          created_at: string | null
          gate_attempts: number | null
          gate_denials: number | null
          gate_grants: number | null
          id: string | null
          last_event_at: string | null
          owner_user_id: string | null
          page_views: number | null
          pdf_downloads: number | null
          published_at: string | null
          slug: string | null
          status:
            | Database["public"]["Enums"]["presentation_catalog_status"]
            | null
          title: string | null
          unique_email_count: number | null
          unpublished_at: string | null
          updated_at: string | null
          view_count: number | null
        }
        Relationships: []
      }
      crm_categories_summary: {
        Row: {
          color_hex: string | null
          company_count: number | null
          contact_count: number | null
          created_at: string | null
          description: string | null
          icon: string | null
          id: string | null
          is_active: boolean | null
          kind: Database["public"]["Enums"]["crm_category_kind"] | null
          name: string | null
          slug: string | null
          source_value: string | null
          total_count: number | null
          updated_at: string | null
          user_count: number | null
        }
        Relationships: []
      }
      job_research_summary: {
        Row: {
          applied_total: number | null
          current_listing_count_24h: number | null
          current_listing_count_7d: number | null
          digest_enabled: boolean | null
          digest_hour_utc: number | null
          is_active: boolean | null
          label: string | null
          last_digest_sent_at: string | null
          last_refreshed_at: string | null
          listings_last_24h: number | null
          matches_last_7d: number | null
          next_check_at: string | null
          total_billed_usd: number | null
          tracked_job_id: string | null
          user_id: string | null
        }
        Relationships: []
      }
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
      pipeline_errors: {
        Row: {
          context: Json | null
          error_message: string | null
          job_id: string | null
          occurred_at: string | null
          product_id: string | null
          product_name: string | null
          severity: string | null
          source: string | null
          stage: string | null
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
      quote_items_with_room: {
        Row: {
          added_at: string | null
          added_from: string | null
          cost_snapshot: number | null
          cost_snapshot_at: string | null
          cost_snapshot_currency: string | null
          cost_snapshot_source: string | null
          custom_product_description: string | null
          custom_product_name: string | null
          custom_sku: string | null
          custom_unit: string | null
          delivery_date: string | null
          dimensions: string | null
          discounted_price: number | null
          effective_room_name: string | null
          effective_room_type: string | null
          id: string | null
          installation_requirements: string | null
          line_total: number | null
          notes: string | null
          price_lookup_call_id: string | null
          price_source: string | null
          product_id: string | null
          quantity: number | null
          quote_id: string | null
          room: string | null
          room_id: string | null
          selected_color: string | null
          selected_size: string | null
          unit_price: number | null
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
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "vw_quote_followup_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "project_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_ap_aging: {
        Row: {
          age_bucket: string | null
          amount_due: number | null
          amount_paid: number | null
          category_id: string | null
          category_name: string | null
          days_overdue: number | null
          description: string | null
          due_at: string | null
          entry_kind: string | null
          id: string | null
          issued_at: string | null
          party_name: string | null
          status: string | null
          supplier_bill_number: string | null
          supplier_company_id: string | null
          supplier_contact_id: string | null
          total: number | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_bills_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_bills_supplier_company_id_fkey"
            columns: ["supplier_company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_bills_supplier_contact_id_fkey"
            columns: ["supplier_contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_bills_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_ar_aging: {
        Row: {
          age_bucket: string | null
          amount_due: number | null
          amount_paid: number | null
          category_id: string | null
          category_name: string | null
          customer_company_id: string | null
          customer_contact_id: string | null
          days_overdue: number | null
          description: string | null
          due_at: string | null
          entry_kind: string | null
          id: string | null
          internal_number: string | null
          issued_at: string | null
          party_name: string | null
          status: string | null
          total: number | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_company_id_fkey"
            columns: ["customer_company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_contact_id_fkey"
            columns: ["customer_contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_bank_account_balances: {
        Row: {
          account_ref: string | null
          bank_account_id: string | null
          currency: string | null
          current_balance: number | null
          iban: string | null
          is_active: boolean | null
          is_default: boolean | null
          kind: string | null
          name: string | null
          opening_balance: number | null
          payment_count: number | null
          sort_order: number | null
          total_in: number | null
          total_out: number | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_bank_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_cash_flow_forecast: {
        Row: {
          amount: number | null
          direction: string | null
          expected_date: string | null
          workspace_id: string | null
        }
        Relationships: []
      }
      vw_customer_account_summary: {
        Row: {
          accepted_total: number | null
          customer_company_id: string | null
          customer_contact_id: string | null
          invoiced_total: number | null
          outstanding_total: number | null
          paid_total: number | null
          quote_count: number | null
          quoted_total: number | null
          workspace_id: string | null
        }
        Relationships: []
      }
      vw_customer_aging_buckets: {
        Row: {
          customer_company_id: string | null
          customer_contact_id: string | null
          due_0_30: number | null
          due_31_90: number | null
          due_90_plus: number | null
          max_days_overdue: number | null
          not_due: number | null
          open_doc_count: number | null
          party_name: string | null
          total_outstanding: number | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_company_id_fkey"
            columns: ["customer_company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_contact_id_fkey"
            columns: ["customer_contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_finance_parties: {
        Row: {
          billed_total: number | null
          contact_group: string | null
          credit_limit: number | null
          display_name: string | null
          email: string | null
          invoiced_total: number | null
          is_customer: boolean | null
          is_supplier: boolean | null
          net_position: number | null
          over_credit_limit: boolean | null
          party_id: string | null
          party_type: string | null
          payable_outstanding: number | null
          payable_paid_total: number | null
          receivable_outstanding: number | null
          receivable_paid_total: number | null
          workspace_id: string | null
        }
        Relationships: []
      }
      vw_hr_employee_absence_summary: {
        Row: {
          annual_leave_allowance_days: number | null
          crm_contact_id: string | null
          days_by_type: Json | null
          employee_id: string | null
          on_leave_today: boolean | null
          remaining_leave_days: number | null
          total_absence_days: number | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_employees_crm_contact_id_fkey"
            columns: ["crm_contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employees_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_monthly_pnl: {
        Row: {
          cogs: number | null
          gross_margin: number | null
          gross_margin_pct: number | null
          invoice_count: number | null
          period_month: string | null
          revenue_net: number | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_quote_followup_queue: {
        Row: {
          created_at: string | null
          currency: string | null
          customer_company_id: string | null
          customer_contact_id: string | null
          days_since_activity: number | null
          grand_total: number | null
          id: string | null
          last_activity_at: string | null
          last_activity_logged_at: string | null
          name: string | null
          next_scheduled_follow_up: string | null
          owner_user_id: string | null
          quote_number: string | null
          status: string | null
          submitted_at: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          currency?: string | null
          customer_company_id?: string | null
          customer_contact_id?: string | null
          days_since_activity?: never
          grand_total?: number | null
          id?: string | null
          last_activity_at?: string | null
          last_activity_logged_at?: never
          name?: string | null
          next_scheduled_follow_up?: never
          owner_user_id?: string | null
          quote_number?: string | null
          status?: string | null
          submitted_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          currency?: string | null
          customer_company_id?: string | null
          customer_contact_id?: string | null
          days_since_activity?: never
          grand_total?: number | null
          id?: string | null
          last_activity_at?: string | null
          last_activity_logged_at?: never
          name?: string | null
          next_scheduled_follow_up?: never
          owner_user_id?: string | null
          quote_number?: string | null
          status?: string | null
          submitted_at?: string | null
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
            foreignKeyName: "quotes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_supplier_account_summary: {
        Row: {
          billed_total: number | null
          ordered_total: number | null
          outstanding_total: number | null
          paid_total: number | null
          po_count: number | null
          supplier_company_id: string | null
          supplier_contact_id: string | null
          workspace_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      __plpgsql_show_dependency_tb:
        | {
            Args: {
              anycompatiblerangetype?: unknown
              anycompatibletype?: unknown
              anyelememttype?: unknown
              anyenumtype?: unknown
              anyrangetype?: unknown
              funcoid: unknown
              relid?: unknown
            }
            Returns: {
              name: string
              oid: unknown
              params: string
              schema: string
              type: string
            }[]
          }
        | {
            Args: {
              anycompatiblerangetype?: unknown
              anycompatibletype?: unknown
              anyelememttype?: unknown
              anyenumtype?: unknown
              anyrangetype?: unknown
              name: string
              relid?: unknown
            }
            Returns: {
              name: string
              oid: unknown
              params: string
              schema: string
              type: string
            }[]
          }
      _extract_storage_bucket_from_url: {
        Args: { p_url: string }
        Returns: string
      }
      _extract_storage_path_from_url: {
        Args: { p_bucket: string; p_url: string }
        Returns: string
      }
      _pricing_cost: {
        Args: { p_product_id: string; p_workspace_id: string }
        Returns: number
      }
      _pricing_retail: {
        Args: { p_product_id: string; p_workspace_id: string }
        Returns: number
      }
      _three_way_match_detail: { Args: { p_order_id: string }; Returns: Json }
      _trip_expense_recompute: {
        Args: { p_report_id: string }
        Returns: undefined
      }
      _trip_expense_sync_reimbursement: {
        Args: { p_report_id: string }
        Returns: undefined
      }
      _user_is_active_project_collaborator: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      _user_owns_project: { Args: { p_project_id: string }; Returns: boolean }
      accept_project_invitation: {
        Args: { p_share_token: string }
        Returns: {
          project_id: string
          project_name: string
        }[]
      }
      admin_approve_factory_registration: {
        Args: { p_request_id: string; p_reviewer_id: string }
        Returns: undefined
      }
      admin_module_subscription_overview: { Args: never; Returns: Json }
      admin_reject_factory_registration: {
        Args: { p_reason?: string; p_request_id: string; p_reviewer_id: string }
        Returns: undefined
      }
      analyze_mivaa_tables: { Args: never; Returns: string }
      answer_freight_quote: {
        Args: { p_note?: string; p_offers: Json; p_quote_id: string }
        Returns: Json
      }
      app_default_workspace_id: { Args: never; Returns: string }
      append_job_alert_log: {
        Args: {
          p_alert_type: string
          p_channels: string[]
          p_channels_skipped: string[]
          p_listing_count: number
          p_payload: Json
          p_tracked_job_id: string
          p_user_id: string
        }
        Returns: string
      }
      append_mention_alert_log: {
        Args: {
          p_alert_type: Database["public"]["Enums"]["mention_alert_type"]
          p_channels_fired: string[]
          p_channels_skipped: string[]
          p_credits_charged: number
          p_outlet_domain: string
          p_outlet_name: string
          p_payload: Json
          p_product_id: string
          p_tracked_mention_id: string
          p_user_id: string
        }
        Returns: string
      }
      append_project_event: {
        Args: {
          p_actor_id: string
          p_event_type: string
          p_payload: Json
          p_project_id: string
        }
        Returns: string
      }
      append_recovery_history: {
        Args: { p_event: Json; p_job_id: string }
        Returns: undefined
      }
      append_stage_history: {
        Args: { p_event: Json; p_job_id: string }
        Returns: undefined
      }
      approve_pending_warehouse_item: {
        Args: { p_id: string; p_overrides?: Json }
        Returns: string
      }
      approve_reseller_application: {
        Args: { p_application_id: string; p_discount_pct?: number }
        Returns: string
      }
      assert_workspace_member: {
        Args: { p_workspace_id: string }
        Returns: undefined
      }
      auto_adjust_vector_index_lists: { Args: never; Returns: undefined }
      backfill_brand_company_ids: {
        Args: { p_limit?: number; p_workspace_id: string }
        Returns: Json
      }
      backfill_factory_from_document_filename: { Args: never; Returns: number }
      backfill_pending_kb_embeddings: {
        Args: { limit_rows?: number }
        Returns: number
      }
      brand_overview: {
        Args: { p_company_id: string; p_workspace_id: string }
        Returns: Json
      }
      build_storage_reference_set: {
        Args: never
        Returns: {
          bucket: string
          is_prefix: boolean
          ref: string
        }[]
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
      cancel_stock_count: { Args: { p_count_id: string }; Returns: undefined }
      catalog_bump_unique_email_count: {
        Args: { p_catalog_id: string; p_email: string }
        Returns: number
      }
      catalog_increment_view_count: {
        Args: { p_catalog_id: string }
        Returns: number
      }
      check_security_invariants: {
        Args: never
        Returns: {
          detail: string
          invariant: string
          object_name: string
          severity: string
        }[]
      }
      claim_brand_for_company: {
        Args: {
          p_company_id: string
          p_names: string[]
          p_workspace_id: string
        }
        Returns: Json
      }
      cleanup_expired_similarity_cache: { Args: never; Returns: number }
      cleanup_invalid_stage_history: {
        Args: { p_invalid_stages: string[]; p_job_id: string }
        Returns: undefined
      }
      cleanup_old_failed_sheets: { Args: never; Returns: number }
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
      cleanup_test_artifacts: {
        Args: { p_dry_run?: boolean; p_min_age_minutes?: number }
        Returns: Json
      }
      close_pos_session: {
        Args: { p_counted_cash?: number; p_session_id: string }
        Returns: Json
      }
      commit_sourcing_options: {
        Args: {
          p_currency?: string
          p_customer_company_id?: string
          p_customer_contact_id?: string
          p_deliver_to_address_unit_id?: string
          p_demand_id: string
          p_demand_type: string
          p_selections: Json
          p_workspace_id: string
        }
        Returns: Json
      }
      compute_three_way_match: { Args: { p_order_id: string }; Returns: Json }
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
      create_child_workspace: {
        Args: {
          p_can_supply_products?: boolean
          p_catalog_access?: string
          p_discount_pct?: number
          p_name: string
          p_parent_id: string
        }
        Returns: string
      }
      create_marketplace_listing: {
        Args: {
          p_batch_lot?: string
          p_condition?: string
          p_country_code?: string
          p_currency?: string
          p_delivery_option?: string
          p_description?: string
          p_expires_at?: string
          p_image_urls?: string[]
          p_location_city?: string
          p_location_region?: string
          p_material_category?: string
          p_price: number
          p_qty: number
          p_specs?: Json
          p_title?: string
          p_warehouse_item_id: string
        }
        Returns: string
      }
      create_project_progress_invoice: {
        Args: { p_kind?: string; p_percent: number; p_quote_id: string }
        Returns: string
      }
      create_simple_flow: {
        Args: {
          p_actions?: Json
          p_activate?: boolean
          p_name: string
          p_trigger_config?: Json
          p_trigger_type: string
          p_workspace_id: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          description: string | null
          graph_definition: Json
          id: string
          is_global: boolean
          is_locked: boolean
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
          workspace_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "flows"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_stock_count: {
        Args: {
          p_note?: string
          p_warehouse_id: string
          p_workspace_id: string
        }
        Returns: string
      }
      create_workspace_invite: {
        Args: { p_role: string; p_workspace_id: string }
        Returns: string
      }
      credit_user_credits: {
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
      credit_workspace_credits: {
        Args: {
          p_actor_user_id?: string
          p_amount: number
          p_description?: string
          p_metadata?: Json
          p_operation_type?: string
          p_transaction_type?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      crm_categories_resolve_recipients: {
        Args: { p_category_ids: string[] }
        Returns: {
          category_ids: string[]
          category_slugs: string[]
          crm_company_id: string
          crm_contact_id: string
          display_name: string
          email: string
          member_kind: Database["public"]["Enums"]["crm_category_member_kind"]
          user_id: string
        }[]
      }
      crm_categories_resolve_recipients_ws: {
        Args: { p_category_ids: string[]; p_workspace_id: string }
        Returns: {
          crm_company_id: string
          crm_contact_id: string
          display_name: string
          email: string
          member_kind: Database["public"]["Enums"]["crm_category_member_kind"]
        }[]
      }
      crm_resync_auto_category_members: {
        Args: never
        Returns: {
          out_category_id: string
          out_deletes: number
          out_inserts: number
          out_slug: string
        }[]
      }
      cron_charge_user: {
        Args: {
          p_cron_key: string
          p_description?: string
          p_units?: number
          p_user_id: string
        }
        Returns: {
          allowed: boolean
          charged: number
          new_balance: number
        }[]
      }
      cron_charge_workspace: {
        Args: {
          p_cron_key: string
          p_description?: string
          p_units?: number
          p_workspace_id: string
        }
        Returns: {
          allowed: boolean
          charged: number
          just_paused: boolean
          just_resumed: boolean
          new_balance: number
          status: string
        }[]
      }
      current_workspace_context: {
        Args: never
        Returns: {
          is_member: boolean
          user_role: string
          workspace_id: string
        }[]
      }
      customer_360: {
        Args: { p_company_id: string; p_workspace_id: string }
        Returns: Json
      }
      debit_credits: {
        Args: {
          p_amount: number
          p_description?: string
          p_metadata?: Json
          p_operation_type: string
          p_user_id: string
          p_workspace_id?: string
        }
        Returns: {
          error_message: string
          new_balance: number
          success: boolean
          transaction_id: string
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
      debit_workspace_credits: {
        Args: {
          p_actor_user_id: string
          p_amount: number
          p_description?: string
          p_metadata?: Json
          p_operation_type?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      decide_customer_pricing_request: {
        Args: { p_approve: boolean; p_note?: string; p_request_id: string }
        Returns: Json
      }
      decide_supplier_claim: {
        Args: { p_approve: boolean; p_reason?: string; p_request_id: string }
        Returns: Json
      }
      decline_freight_quote: {
        Args: { p_quote_id: string; p_reason?: string }
        Returns: undefined
      }
      deduct_generation_credits: { Args: { p_job_id: string }; Returns: Json }
      delete_simple_flow: {
        Args: { p_flow_id: string; p_workspace_id: string }
        Returns: boolean
      }
      delete_storage_objects: {
        Args: { p_bucket: string; p_names: string[] }
        Returns: number
      }
      delete_user_solo_workspaces: {
        Args: { p_user_id: string }
        Returns: number
      }
      deliver_order_line: {
        Args: { p_item: string; p_order: string; p_qty: number }
        Returns: string
      }
      delivery_note_to_invoice: { Args: { p_id: string }; Returns: string }
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
      dic_detect__credits_pool_ledger_drift: {
        Args: never
        Returns: {
          detail: Json
          entity_id: string
          entity_table: string
          workspace_id: string
        }[]
      }
      dic_detect__finance_order_item_net_mismatch: {
        Args: never
        Returns: {
          detail: Json
          entity_id: string
          entity_table: string
          workspace_id: string
        }[]
      }
      dic_detect__finance_order_payment_party: {
        Args: never
        Returns: {
          detail: Json
          entity_id: string
          entity_table: string
          workspace_id: string
        }[]
      }
      dic_detect__finance_order_total_mismatch: {
        Args: never
        Returns: {
          detail: Json
          entity_id: string
          entity_table: string
          workspace_id: string
        }[]
      }
      dic_detect__finance_payment_no_account: {
        Args: never
        Returns: {
          detail: Json
          entity_id: string
          entity_table: string
          workspace_id: string
        }[]
      }
      dic_detect__tenancy_order_item_workspace: {
        Args: never
        Returns: {
          detail: Json
          entity_id: string
          entity_table: string
          workspace_id: string
        }[]
      }
      dic_detect__tenancy_payment_order_workspace: {
        Args: never
        Returns: {
          detail: Json
          entity_id: string
          entity_table: string
          workspace_id: string
        }[]
      }
      dic_heal__finance_order_item_net_mismatch: {
        Args: never
        Returns: number
      }
      dic_heal__finance_order_payment_party: { Args: never; Returns: number }
      dic_heal__finance_order_total_mismatch: { Args: never; Returns: number }
      dic_heal__tenancy_order_item_workspace: { Args: never; Returns: number }
      dismiss_pending_warehouse_item: {
        Args: { p_id: string }
        Returns: undefined
      }
      ensure_default_warehouse: {
        Args: { p_workspace_id: string }
        Returns: string
      }
      escalate_request: { Args: { p_request_id: string }; Returns: string }
      expire_due_listings: { Args: never; Returns: number }
      expire_due_quotes: { Args: never; Returns: number }
      expire_old_quotes: { Args: never; Returns: number }
      extract_material_mentions: { Args: { query_text: string }; Returns: Json }
      extract_numeric_specs: { Args: { p_metadata: Json }; Returns: Json }
      fail_embedding_backfill_entities: {
        Args: {
          p_deficiency: string
          p_entity_type: string
          p_error: string
          p_ids: string[]
        }
        Returns: undefined
      }
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
      finance_list_category_tree: {
        Args: { p_workspace_id: string }
        Returns: {
          category_key: string
          label: string
          level: number
        }[]
      }
      finance_mark_overdue: {
        Args: never
        Returns: {
          bills_flipped: number
          invoices_flipped: number
        }[]
      }
      finance_mydata_reconciliation: {
        Args: { p_from: string; p_to: string; p_workspace_id: string }
        Returns: {
          bucket: string
          currency: string
          doc_id: string
          doc_kind: string
          doc_number: string
          fiscal_mark: string
          fiscal_status: string
          issued_at: string
          total: number
        }[]
      }
      finance_party_ledger: {
        Args: {
          p_company_id: string
          p_contact_id: string
          p_from: string
          p_side: string
          p_to: string
          p_workspace_id: string
        }
        Returns: {
          credit: number
          currency: string
          debit: number
          doc_kind: string
          doc_number: string
          entry_date: string
        }[]
      }
      finance_party_opening_balance: {
        Args: {
          p_before: string
          p_company_id: string
          p_contact_id: string
          p_side: string
          p_workspace_id: string
        }
        Returns: number
      }
      finance_vat_by_code: {
        Args: { p_from: string; p_to: string; p_workspace_id: string }
        Returns: {
          income_classification_category: string
          income_classification_type: string
          line_count: number
          net: number
          vat: number
          vat_category: number
          vat_rate: number
        }[]
      }
      finance_vat_report: {
        Args: { p_from: string; p_to: string; p_workspace_id: string }
        Returns: {
          doc_count: number
          net: number
          section: string
          vat: number
          vat_rate: number
        }[]
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
      find_orphan_storage_objects: {
        Args: { p_bucket: string; p_grace_seconds?: number; p_limit?: number }
        Returns: {
          created_at: string
          name: string
          size_bytes: number
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
      forecast_demand: { Args: { p_workspace_id: string }; Returns: Json }
      generate_client_quote: {
        Args: { p_margin_pct?: number; p_source_quote_id: string }
        Returns: string
      }
      generate_invoice_from_order: {
        Args: { p_order: string }
        Returns: string
      }
      generate_order_from_invoice: {
        Args: { p_invoice_id: string; p_mark_delivered?: boolean }
        Returns: string
      }
      generate_order_from_quote: {
        Args: { p_quote_id: string }
        Returns: string
      }
      generate_supplier_bill_from_order: {
        Args: { p_order: string }
        Returns: string
      }
      generate_workspace_referral: {
        Args: { p_workspace_id: string }
        Returns: string
      }
      get_aade_creds_status: {
        Args: { p_workspace_id: string }
        Returns: {
          afm_called_by: string
          enabled: boolean
          has_password: boolean
          username: string
        }[]
      }
      get_accessible_factory_products: {
        Args: { p_limit?: number; p_offset?: number; p_workspace_id: string }
        Returns: {
          attributes: Json
          attributes_raw: Json
          avg_rating: number | null
          barcode: string | null
          brand_company_id: string | null
          category: string | null
          category_id: string | null
          completeness_score: number | null
          confidence_score: number | null
          cost: number | null
          cost_currency: string | null
          cost_source: string | null
          cost_updated_at: string | null
          created_at: string | null
          created_by: string | null
          created_from_type: string | null
          description: string | null
          embedding_metadata: Json | null
          embedding_model: string | null
          enforce_moq: boolean
          external_sku: string | null
          id: string
          import_batch_id: string | null
          item_type: string
          layout_analyzed: boolean | null
          layout_detected: boolean | null
          layout_detection_date: string | null
          layout_stats: Json | null
          long_description: string | null
          measurement_unit_code: number | null
          metadata: Json | null
          mydata_income_classification_category: string | null
          mydata_income_classification_type: string | null
          mydata_vat_category: number | null
          name: string
          numeric_specs: Json | null
          properties: Json | null
          quality_assessment: string | null
          quality_metrics: Json | null
          quality_score: number | null
          review_count: number
          search_tsv: unknown
          search_vector: unknown
          sku: string | null
          source_chunks: Json | null
          source_document_id: string | null
          source_job_id: string | null
          source_type: string | null
          specifications: Json | null
          status: string | null
          supplier_company_id: string | null
          supply_mode: string
          tables_extracted: boolean | null
          text_embedding_1024: unknown
          text_embedding_1024_model: string | null
          text_embedding_schema_version: number | null
          total_layout_regions: number | null
          total_tables: number | null
          total_tables_extracted: number | null
          updated_at: string | null
          work_category: string | null
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_buyer_finance_limits: {
        Args: {
          p_company_id?: string
          p_contact_id?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      get_catalog_prices_for_workspace: {
        Args: { p_product_ids: string[]; p_workspace_id: string }
        Returns: Json
      }
      get_cooccurring_products: {
        Args: { p_limit?: number; p_product_id: string; p_workspace_id: string }
        Returns: Json
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
      get_customer_open_balance: {
        Args: {
          p_company_id?: string
          p_contact_id?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      get_distinct_factory_names: {
        Args: never
        Returns: {
          name: string
          source: string
        }[]
      }
      get_embedding_backfill_backlog: { Args: never; Returns: Json }
      get_ergani_creds_status: {
        Args: { p_workspace_id: string }
        Returns: {
          branch_aa: string
          employer_afm: string
          enabled: boolean
          environment: string
          has_password: boolean
          username: string
          usertype: string
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
      get_inbound_creds_status: {
        Args: { p_workspace_id: string }
        Returns: {
          aade_user_id: string
          base_url: string
          enabled: boolean
          has_key: boolean
        }[]
      }
      get_internal_tracked_jobs_due: {
        Args: { p_limit?: number }
        Returns: {
          alert_channels: string[]
          alert_on_burst: boolean
          alert_webhook_url: string | null
          api_key_id: string | null
          auto_expand_keywords: boolean
          background_agent_id: string | null
          burst_threshold: number
          careers_page_urls: string[] | null
          consecutive_stable_refreshes: number | null
          country_code: string | null
          created_at: string
          current_listing_count_24h: number | null
          current_listing_count_7d: number | null
          current_metadata: Json | null
          current_snapshot_at: string | null
          current_top_companies: Json | null
          digest_day_of_week: number | null
          digest_enabled: boolean
          digest_hour_utc: number
          employment_type: string[] | null
          excluded_companies: string[] | null
          excluded_keywords: string[] | null
          expanded_keywords: string[] | null
          id: string
          is_active: boolean
          keywords: string[]
          label: string
          last_burst_alert_at: string | null
          last_digest_sent_at: string | null
          last_error: string | null
          last_keywords_expanded_at: string | null
          last_refresh_billed_usd: number | null
          last_refresh_credits_debited: number | null
          last_refresh_credits_used: number | null
          last_refreshed_at: string | null
          location: string | null
          max_age_days: number
          next_check_at: string | null
          preferred_companies: string[] | null
          query_phrasings: string[] | null
          refresh_interval_hours: number
          remote_only: boolean
          rss_feed_urls: string[] | null
          salary_currency: string | null
          salary_min: number | null
          seniority: string | null
          source_conversation_id: string | null
          sources_enabled: Json
          total_billed_usd: number
          total_credits_used: number | null
          total_partner_credits_debited: number
          updated_at: string
          user_id: string | null
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "tracked_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_internal_tracked_mentions_due: {
        Args: { p_limit?: number }
        Returns: {
          brand_name: string
          id: string
          next_check_at: string
          product_id: string
          subject_type: Database["public"]["Enums"]["mention_subject_type"]
        }[]
      }
      get_internal_tracked_queries_due: {
        Args: never
        Returns: {
          id: string
          product_id: string
        }[]
      }
      get_manageable_workspaces: {
        Args: never
        Returns: {
          can_supply_products: boolean
          catalog_access: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_root: boolean
          kind: string
          name: string
          parent_crm_company_id: string | null
          parent_discount_pct: number | null
          parent_user_level_key: string | null
          parent_workspace_id: string | null
          referral_code: string | null
          referral_enabled: boolean
          settings: Json | null
          slug: string
          status: string | null
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "workspaces"
          isOneToOne: false
          isSetofReturn: true
        }
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
      get_my_credit_spend_summary: { Args: { p_days?: number }; Returns: Json }
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
      get_product_price_for_workspace: {
        Args: {
          p_audience?: string
          p_company_id?: string
          p_contact_id?: string
          p_product_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      get_product_price_history: {
        Args: { p_days?: number; p_product_id: string; p_workspace_id: string }
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
      get_product_provenance: {
        Args: { p_product_id: string; p_workspace_id: string }
        Returns: Json
      }
      get_products_by_brand: {
        Args: { p_company_id: string; p_workspace_id: string }
        Returns: Json
      }
      get_products_in_project: {
        Args: { p_project_id: string; p_workspace_id: string }
        Returns: Json
      }
      get_project_finance_summary: {
        Args: { p_project_id: string }
        Returns: Json
      }
      get_project_invitation_preview: {
        Args: { p_share_token: string }
        Returns: {
          expires_at: string
          invited_by_name: string
          invited_email_masked: string
          is_expired: boolean
          is_revoked: boolean
          project_id: string
          project_name: string
        }[]
      }
      get_projects_using_product: {
        Args: { p_product_id: string; p_workspace_id: string }
        Returns: Json
      }
      get_provider_health: {
        Args: { p_window_minutes?: number }
        Returns: {
          calls: number
          failed: number
          failure_rate: number
          last_error: string
          last_fail: string
          last_ok: string
          provider: string
          status: string
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
      get_shipping_creds_status: {
        Args: { p_workspace_id: string }
        Returns: Json
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
      get_sourcing_board: {
        Args: { p_mine?: boolean; p_workspace_id: string }
        Returns: Json
      }
      get_supplier_inbound_orders: {
        Args: { p_workspace_id: string }
        Returns: Json
      }
      get_supplier_inbound_orders_svc: {
        Args: { p_workspace_id: string }
        Returns: Json
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
      get_tracked_jobs_due_for_digest: {
        Args: { p_current_hour_utc: number; p_limit?: number }
        Returns: {
          alert_channels: string[]
          alert_on_burst: boolean
          alert_webhook_url: string | null
          api_key_id: string | null
          auto_expand_keywords: boolean
          background_agent_id: string | null
          burst_threshold: number
          careers_page_urls: string[] | null
          consecutive_stable_refreshes: number | null
          country_code: string | null
          created_at: string
          current_listing_count_24h: number | null
          current_listing_count_7d: number | null
          current_metadata: Json | null
          current_snapshot_at: string | null
          current_top_companies: Json | null
          digest_day_of_week: number | null
          digest_enabled: boolean
          digest_hour_utc: number
          employment_type: string[] | null
          excluded_companies: string[] | null
          excluded_keywords: string[] | null
          expanded_keywords: string[] | null
          id: string
          is_active: boolean
          keywords: string[]
          label: string
          last_burst_alert_at: string | null
          last_digest_sent_at: string | null
          last_error: string | null
          last_keywords_expanded_at: string | null
          last_refresh_billed_usd: number | null
          last_refresh_credits_debited: number | null
          last_refresh_credits_used: number | null
          last_refreshed_at: string | null
          location: string | null
          max_age_days: number
          next_check_at: string | null
          preferred_companies: string[] | null
          query_phrasings: string[] | null
          refresh_interval_hours: number
          remote_only: boolean
          rss_feed_urls: string[] | null
          salary_currency: string | null
          salary_min: number | null
          seniority: string | null
          source_conversation_id: string | null
          sources_enabled: Json
          total_billed_usd: number
          total_credits_used: number | null
          total_partner_credits_debited: number
          updated_at: string
          user_id: string | null
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "tracked_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_tracked_mentions_due_for_llm_probe: {
        Args: { p_limit?: number; p_min_age_days?: number }
        Returns: {
          id: string
          last_probed_at: string
          subject_label: string
          subject_type: Database["public"]["Enums"]["mention_subject_type"]
        }[]
      }
      get_user_role: { Args: never; Returns: string }
      get_user_websites_due_for_recrawl: {
        Args: { p_limit?: number; p_max_age_hours?: number }
        Returns: {
          id: string
          max_pages: number
          sitemap_url: string
          url: string
          user_id: string
        }[]
      }
      get_user_workspaces: {
        Args: { user_id: string }
        Returns: {
          workspace_id: string
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
      get_webhook_inbound_history: {
        Args: { p_flow_id: string; p_limit?: number }
        Returns: {
          completed_at: string
          duration_ms: number
          error_message: string
          run_id: string
          started_at: string
          status: string
          trigger_event_data: Json
        }[]
      }
      get_webhook_inbound_status: {
        Args: never
        Returns: {
          failures_24h: number
          flow_id: string
          flow_name: string
          is_locked: boolean
          last_run_at: string
          last_run_duration_ms: number
          last_run_error: string
          last_run_status: string
          runs_24h: number
          status: string
          total_runs: number
        }[]
      }
      get_webhook_outbound_status: {
        Args: never
        Returns: {
          calls_24h: number
          endpoint_id: string
          events: string[]
          failure_count: number
          failures_24h: number
          is_active: boolean
          last_call_at: string
          last_call_status: string
          last_failure_at: string
          last_success_at: string
          name: string
          pending: number
          url: string
        }[]
      }
      get_workspace_ancestors: {
        Args: { p_workspace_id: string }
        Returns: {
          depth: number
          workspace_id: string
        }[]
      }
      get_workspace_descendants: {
        Args: { p_workspace_id: string }
        Returns: {
          depth: number
          workspace_id: string
        }[]
      }
      get_workspace_email_config_status: {
        Args: { p_workspace_id: string }
        Returns: {
          effective_daily_limit: number
          enabled: boolean
          from_email: string
          from_name: string
          has_api_key: boolean
          platform_from_email: string
          platform_from_name: string
          platform_reply_to: string
          reply_to: string
          sent_today: number
          source: string
        }[]
      }
      get_workspace_id: { Args: never; Returns: string }
      get_workspace_member_credit_status: {
        Args: { p_user_id?: string; p_workspace_id: string }
        Returns: Json
      }
      get_workspace_module_access: {
        Args: { p_workspace_id: string }
        Returns: {
          available: boolean
          slug: string
          tier: string
        }[]
      }
      get_workspace_notify_recipients: {
        Args: { p_workspace_id: string }
        Returns: {
          user_id: string
        }[]
      }
      get_workspace_payout_account: {
        Args: { p_workspace_id: string }
        Returns: string
      }
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
      heal_data_integrity_check: { Args: { p_key: string }; Returns: number }
      hr_overview_analytics: { Args: { p_workspace_id: string }; Returns: Json }
      inbound_doc_receive_stock: {
        Args: { p_doc_id: string; p_lines: Json }
        Returns: undefined
      }
      inbound_doc_receive_to_warehouse: {
        Args: { p_doc_id: string; p_mappings: Json }
        Returns: number
      }
      inbound_doc_to_supplier_bill: {
        Args: { p_doc_id: string }
        Returns: string
      }
      increment_client_view_count: {
        Args: { p_view_id: string }
        Returns: undefined
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
      increment_listing_view: { Args: { p_id: string }; Returns: undefined }
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
      is_admin_user: { Args: never; Returns: boolean }
      is_business_user: { Args: never; Returns: boolean }
      is_inbox_operator: { Args: { p_user_id: string }; Returns: boolean }
      is_inbox_shared_workspace_member: {
        Args: { p_thread_id: string; p_user_id: string }
        Returns: boolean
      }
      is_inbox_thread_member: {
        Args: { p_thread_id: string; p_user_id: string }
        Returns: boolean
      }
      is_inbox_thread_participant: {
        Args: { p_thread_id: string; p_user_id: string }
        Returns: boolean
      }
      is_internal_ip: { Args: { ip_addr: unknown }; Returns: boolean }
      is_operator_admin: { Args: never; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_platform_operator: { Args: never; Returns: boolean }
      is_workspace_admin: { Args: { p_workspace_id: string }; Returns: boolean }
      is_workspace_entitled: {
        Args: { p_module_slug: string; p_workspace_id: string }
        Returns: boolean
      }
      is_workspace_finance_manager: {
        Args: { p_workspace_id: string }
        Returns: boolean
      }
      is_workspace_finance_viewer: {
        Args: { p_workspace_id: string }
        Returns: boolean
      }
      is_workspace_member: { Args: { workspace_id: string }; Returns: boolean }
      is_workspace_owner: {
        Args: { user_id: string; workspace_id: string }
        Returns: boolean
      }
      issue_credit_note: {
        Args: {
          p_correlated?: boolean
          p_invoice_id: string
          p_lines: Json
          p_reason: string
        }
        Returns: string
      }
      issue_delivery_note: { Args: { p_id: string }; Returns: undefined }
      issue_invoice_from_quote: {
        Args: { p_quote_id: string }
        Returns: string
      }
      issue_supplier_credit_note:
        | {
            Args: {
              p_external_mark?: string
              p_lines: Json
              p_reason?: string
              p_supplier_bill_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_category_id?: string
              p_currency?: string
              p_external_mark?: string
              p_issued_at?: string
              p_lines: Json
              p_mark_paid?: boolean
              p_reason?: string
              p_supplier_bill_id: string
              p_supplier_company_id?: string
              p_supplier_contact_id?: string
              p_workspace_id?: string
            }
            Returns: string
          }
      kb_brand_page: { Args: { p_brand_slug: string }; Returns: Json }
      kb_compute_content_tier: {
        Args: { p_metadata: Json; p_title: string }
        Returns: number
      }
      kb_doc_related_products: {
        Args: { p_brand?: string; p_doc_id: string; p_limit?: number }
        Returns: {
          brand: string
          id: string
          image_url: string
          name: string
        }[]
      }
      kb_is_category_protected: { Args: { p_cat_id: string }; Returns: boolean }
      kb_is_doc_protected: { Args: { p_doc_id: string }; Returns: boolean }
      kb_keyword_search: {
        Args: {
          p_allowed_access_levels?: string[]
          p_limit?: number
          p_query: string
          p_workspace_id: string
        }
        Returns: {
          category_id: string
          category_name: string
          created_at: string
          embedding_status: string
          id: string
          status: string
          summary: string
          title: string
          view_count: number
          visibility: string
        }[]
      }
      kb_list_brands: {
        Args: never
        Returns: {
          brand: string
          doc_count: number
          image_url: string
          product_count: number
          slug: string
        }[]
      }
      kb_match_doc_chunks:
        | {
            Args: {
              allowed_access_levels?: string[]
              include_private?: boolean
              match_agent_id?: string
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
              chunk_id: string
              chunk_index: number
              content: string
              document_title: string
              heading: string
              kb_doc_id: string
              price_doc_type: string
              similarity: number
              status: string
              visibility: string
            }[]
          }
        | {
            Args: {
              allowed_access_levels?: string[]
              include_private?: boolean
              match_agent_id?: string
              match_category_id?: string
              match_category_slug?: string
              match_count?: number
              match_price_doc_type?: string
              match_threshold?: number
              match_workspace_id: string
              query_embedding: string
              require_published?: boolean
              shared_workspace_id?: string
            }
            Returns: {
              category_id: string
              category_name: string
              category_slug: string
              chunk_id: string
              chunk_index: number
              content: string
              document_title: string
              heading: string
              kb_doc_id: string
              price_doc_type: string
              similarity: number
              status: string
              visibility: string
            }[]
          }
      kb_match_docs: {
        Args: {
          allowed_access_levels?: string[]
          include_private?: boolean
          match_agent_id?: string
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
      kb_search_docs:
        | {
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
        | {
            Args: {
              allowed_access_levels?: string[]
              include_private?: boolean
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
      kb_upsert_mirrored_category: {
        Args: { p_material_category_id: string; p_workspace_id: string }
        Returns: string
      }
      lint_plpgsql_errors: {
        Args: never
        Returns: {
          fn: string
          message: string
        }[]
      }
      list_crm_categories: {
        Args: never
        Returns: {
          id: string
          kind: string
          name: string
          slug: string
        }[]
      }
      list_pending_freight_quotes: { Args: never; Returns: Json }
      list_workspace_expense_assignees: {
        Args: { p_workspace_id: string }
        Returns: {
          email: string
          name: string
          user_id: string
        }[]
      }
      list_workspace_makers: {
        Args: { p_workspace_id: string }
        Returns: {
          brand_company_id: string
          factory_name: string
          product_count: number
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
      mark_invoice_issued: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      mark_listing_sold: {
        Args: { p_id: string; p_qty?: number }
        Returns: undefined
      }
      mark_overdue_invoices: { Args: never; Returns: number }
      mark_pdf_job_for_recovery: {
        Args: { p_job_id: string; p_max_attempts?: number }
        Returns: boolean
      }
      mark_recommendations_sent: {
        Args: { p_search_ids: string[]; p_user_id: string }
        Returns: number
      }
      marketplace_price_comps: {
        Args: {
          p_exclude_workspace?: string
          p_material_category: string
          p_unit: string
        }
        Returns: {
          max_price: number
          median_price: number
          min_price: number
          n: number
        }[]
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
      match_user_website_pages: {
        Args: {
          p_limit?: number
          p_match_threshold?: number
          p_query_embedding: unknown
          p_user_id: string
          p_website_id?: string
        }
        Returns: {
          content_excerpt: string
          description: string
          keywords: string[]
          page_id: string
          similarity: number
          title: string
          url: string
          website_id: string
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
      mint_invoice_pay_token: {
        Args: { p_invoice_id: string; p_ttl_days?: number }
        Returns: string
      }
      next_credit_note_number: {
        Args: { p_workspace_id: string }
        Returns: string
      }
      next_delivery_note_number: {
        Args: { p_workspace_id: string }
        Returns: string
      }
      next_document_number: {
        Args: {
          p_branch_code?: number
          p_doc_code?: string
          p_workspace_id: string
        }
        Returns: {
          formatted: string
          number: number
          series: string
        }[]
      }
      next_invoice_number: { Args: { p_workspace_id: string }; Returns: string }
      next_supplier_credit_note_number: {
        Args: { p_workspace_id: string }
        Returns: string
      }
      open_pos_session: {
        Args: {
          p_branch_code?: number
          p_opening_float?: number
          p_workspace_id: string
        }
        Returns: string
      }
      plpgsql_check_function:
        | {
            Args: {
              all_warnings?: boolean
              anycompatiblerangetype?: unknown
              anycompatibletype?: unknown
              anyelememttype?: unknown
              anyenumtype?: unknown
              anyrangetype?: unknown
              compatibility_warnings?: boolean
              constant_tracing?: boolean
              extra_warnings?: boolean
              fatal_errors?: boolean
              format?: string
              funcoid: unknown
              incomment_options_usage_warning?: boolean
              newtable?: unknown
              oldtable?: unknown
              other_warnings?: boolean
              performance_warnings?: boolean
              relid?: unknown
              security_warnings?: boolean
              use_incomment_options?: boolean
              without_warnings?: boolean
            }
            Returns: string[]
          }
        | {
            Args: {
              all_warnings?: boolean
              anycompatiblerangetype?: unknown
              anycompatibletype?: unknown
              anyelememttype?: unknown
              anyenumtype?: unknown
              anyrangetype?: unknown
              compatibility_warnings?: boolean
              constant_tracing?: boolean
              extra_warnings?: boolean
              fatal_errors?: boolean
              format?: string
              incomment_options_usage_warning?: boolean
              name: string
              newtable?: unknown
              oldtable?: unknown
              other_warnings?: boolean
              performance_warnings?: boolean
              relid?: unknown
              security_warnings?: boolean
              use_incomment_options?: boolean
              without_warnings?: boolean
            }
            Returns: string[]
          }
      plpgsql_check_function_tb:
        | {
            Args: {
              all_warnings?: boolean
              anycompatiblerangetype?: unknown
              anycompatibletype?: unknown
              anyelememttype?: unknown
              anyenumtype?: unknown
              anyrangetype?: unknown
              compatibility_warnings?: boolean
              constant_tracing?: boolean
              extra_warnings?: boolean
              fatal_errors?: boolean
              funcoid: unknown
              incomment_options_usage_warning?: boolean
              newtable?: unknown
              oldtable?: unknown
              other_warnings?: boolean
              performance_warnings?: boolean
              relid?: unknown
              security_warnings?: boolean
              use_incomment_options?: boolean
              without_warnings?: boolean
            }
            Returns: {
              context: string
              detail: string
              functionid: unknown
              hint: string
              level: string
              lineno: number
              message: string
              position: number
              query: string
              sqlstate: string
              statement: string
            }[]
          }
        | {
            Args: {
              all_warnings?: boolean
              anycompatiblerangetype?: unknown
              anycompatibletype?: unknown
              anyelememttype?: unknown
              anyenumtype?: unknown
              anyrangetype?: unknown
              compatibility_warnings?: boolean
              constant_tracing?: boolean
              extra_warnings?: boolean
              fatal_errors?: boolean
              incomment_options_usage_warning?: boolean
              name: string
              newtable?: unknown
              oldtable?: unknown
              other_warnings?: boolean
              performance_warnings?: boolean
              relid?: unknown
              security_warnings?: boolean
              use_incomment_options?: boolean
              without_warnings?: boolean
            }
            Returns: {
              context: string
              detail: string
              functionid: unknown
              hint: string
              level: string
              lineno: number
              message: string
              position: number
              query: string
              sqlstate: string
              statement: string
            }[]
          }
      plpgsql_check_pragma: { Args: { name: string[] }; Returns: number }
      plpgsql_check_profiler: { Args: { enable?: boolean }; Returns: boolean }
      plpgsql_check_tracer: {
        Args: { enable?: boolean; verbosity?: string }
        Returns: boolean
      }
      plpgsql_coverage_branches:
        | { Args: { funcoid: unknown }; Returns: number }
        | { Args: { name: string }; Returns: number }
      plpgsql_coverage_statements:
        | { Args: { funcoid: unknown }; Returns: number }
        | { Args: { name: string }; Returns: number }
      plpgsql_profiler_function_statements_tb:
        | {
            Args: { funcoid: unknown }
            Returns: {
              avg_time: number
              block_num: number
              exec_stmts: number
              exec_stmts_err: number
              lineno: number
              max_time: number
              parent_note: string
              parent_stmtid: number
              processed_rows: number
              queryid: number
              stmtid: number
              stmtname: string
              total_time: number
            }[]
          }
        | {
            Args: { name: string }
            Returns: {
              avg_time: number
              block_num: number
              exec_stmts: number
              exec_stmts_err: number
              lineno: number
              max_time: number
              parent_note: string
              parent_stmtid: number
              processed_rows: number
              queryid: number
              stmtid: number
              stmtname: string
              total_time: number
            }[]
          }
      plpgsql_profiler_function_tb:
        | {
            Args: { funcoid: unknown }
            Returns: {
              avg_time: number
              cmds_on_row: number
              exec_stmts: number
              exec_stmts_err: number
              lineno: number
              max_time: number[]
              processed_rows: number[]
              queryids: number[]
              source: string
              stmt_lineno: number
              total_time: number
            }[]
          }
        | {
            Args: { name: string }
            Returns: {
              avg_time: number
              cmds_on_row: number
              exec_stmts: number
              exec_stmts_err: number
              lineno: number
              max_time: number[]
              processed_rows: number[]
              queryids: number[]
              source: string
              stmt_lineno: number
              total_time: number
            }[]
          }
      plpgsql_profiler_functions_all: {
        Args: never
        Returns: {
          avg_time: number
          exec_count: number
          exec_stmts_err: number
          funcoid: unknown
          max_time: number
          min_time: number
          stddev_time: number
          total_time: number
        }[]
      }
      plpgsql_profiler_install_fake_queryid_hook: {
        Args: never
        Returns: undefined
      }
      plpgsql_profiler_remove_fake_queryid_hook: {
        Args: never
        Returns: undefined
      }
      plpgsql_profiler_reset: { Args: { funcoid: unknown }; Returns: undefined }
      plpgsql_profiler_reset_all: { Args: never; Returns: undefined }
      plpgsql_show_dependency_tb:
        | {
            Args: {
              anycompatiblerangetype?: unknown
              anycompatibletype?: unknown
              anyelememttype?: unknown
              anyenumtype?: unknown
              anyrangetype?: unknown
              fnname: string
              relid?: unknown
            }
            Returns: {
              name: string
              oid: unknown
              params: string
              schema: string
              type: string
            }[]
          }
        | {
            Args: {
              anycompatiblerangetype?: unknown
              anycompatibletype?: unknown
              anyelememttype?: unknown
              anyenumtype?: unknown
              anyrangetype?: unknown
              funcoid: unknown
              relid?: unknown
            }
            Returns: {
              name: string
              oid: unknown
              params: string
              schema: string
              type: string
            }[]
          }
      pos_session_report: { Args: { p_session_id: string }; Returns: Json }
      post_stock_count: { Args: { p_count_id: string }; Returns: Json }
      preflight_credits: {
        Args: { p_amount: number; p_user_id: string; p_workspace_id?: string }
        Returns: Json
      }
      pricing_category_ancestry: {
        Args: { p_category_key: string }
        Returns: string[]
      }
      propagate_factory_from_siblings: {
        Args: { doc_id: string }
        Returns: number
      }
      propose_or_apply_customer_pricing: {
        Args: {
          p_discount_percent?: number
          p_subject_id: string
          p_subject_type: string
          p_user_level_key?: string
        }
        Returns: Json
      }
      purge_expired_classifier_verdicts: { Args: never; Returns: number }
      receive_order_into_warehouse: {
        Args: { p_order: string }
        Returns: number
      }
      recompute_job_cost: {
        Args: { p_tracked_job_id: string }
        Returns: undefined
      }
      recompute_mention_cost: {
        Args: { p_tracked_mention_id: string }
        Returns: undefined
      }
      recompute_order_payment_status: {
        Args: { p_order: string }
        Returns: undefined
      }
      reconcile_brand_company_ids_all: {
        Args: { p_max_makers?: number }
        Returns: Json
      }
      record_embedding_backfill_attempts: {
        Args: {
          p_deficiency: string
          p_entity_type: string
          p_ids: string[]
          p_workspace_id?: string
        }
        Returns: undefined
      }
      record_payment_fx: {
        Args: {
          p_allocations: Json
          p_amount: number
          p_bank_account_id?: string
          p_category_id?: string
          p_counterparty_company_id: string
          p_counterparty_contact_id: string
          p_currency: string
          p_direction: string
          p_fx_rate_to_base: number
          p_method: string
          p_notes: string
          p_order_id?: string
          p_paid_at: string
          p_reference: string
          p_workspace_id: string
        }
        Returns: string
      }
      record_payment_with_allocations: {
        Args: {
          p_allocations: Json
          p_amount: number
          p_counterparty_company_id: string
          p_counterparty_contact_id: string
          p_currency: string
          p_direction: string
          p_method: string
          p_notes: string
          p_paid_at: string
          p_reference: string
          p_workspace_id: string
        }
        Returns: string
      }
      record_stock_movement: {
        Args: {
          p_direction: string
          p_item_id: string
          p_quantity: number
          p_reason?: string
          p_source_id?: string
          p_source_type?: string
        }
        Returns: number
      }
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
      redeem_workspace_invite: { Args: { p_code: string }; Returns: Json }
      redeem_workspace_referral: { Args: { p_code: string }; Returns: Json }
      refresh_search_analytics_views: { Args: never; Returns: undefined }
      refresh_three_way_match: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      refund_credits: {
        Args: {
          p_amount: number
          p_description?: string
          p_metadata?: Json
          p_operation_type: string
          p_user_id: string
          p_workspace_id?: string
        }
        Returns: {
          error_message: string
          new_balance: number
          success: boolean
          transaction_id: string
        }[]
      }
      reject_reseller_application: {
        Args: { p_application_id: string; p_notes?: string }
        Returns: undefined
      }
      reorder_warehouse_item: {
        Args: {
          p_qty?: number
          p_supplier_product_id?: string
          p_warehouse_item_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      report_cashflow_per_day: {
        Args: { p_from: string; p_to: string; p_workspace_id: string }
        Returns: {
          difference: number
          payment_count: number
          payments: number
          period: string
          receipts: number
        }[]
      }
      report_customer_top_products: {
        Args: {
          p_company_id?: string
          p_contact_id?: string
          p_limit?: number
          p_workspace_id: string
        }
        Returns: {
          description: string
          last_ordered: string
          on_hand: number
          order_count: number
          product_id: string
          revenue_net: number
          sku: string
          total_quantity: number
        }[]
      }
      report_myf: {
        Args: { p_from: string; p_to: string; p_workspace_id: string }
        Returns: {
          counterparty_name: string
          direction: string
          doc_count: number
          gross: number
          net: number
          vat: number
          vat_number: string
        }[]
      }
      report_open_tasks: {
        Args: { p_workspace_id: string }
        Returns: {
          body: string
          days_until: number
          kind: string
          owner_user_id: string
          quote_id: string
          quote_label: string
          scheduled_for: string
        }[]
      }
      report_payments_in_per_counterparty: {
        Args: { p_from: string; p_to: string; p_workspace_id: string }
        Returns: {
          display_name: string
          party_id: string
          party_type: string
          payment_count: number
          total_received: number
        }[]
      }
      report_payments_out_per_counterparty: {
        Args: { p_from: string; p_to: string; p_workspace_id: string }
        Returns: {
          display_name: string
          party_id: string
          party_type: string
          payment_count: number
          total_paid: number
        }[]
      }
      report_pnl_per_category: {
        Args: { p_from: string; p_to: string; p_workspace_id: string }
        Returns: {
          category_id: string
          category_name: string
          customer_credits: number
          expenses: number
          income: number
          net: number
          supplier_credits: number
          vat_expense: number
          vat_income: number
        }[]
      }
      report_purchases_per_product: {
        Args: { p_from: string; p_to: string; p_workspace_id: string }
        Returns: {
          product_id: string
          product_name: string
          sku: string
          total_cost: number
          total_quantity: number
        }[]
      }
      report_receipts_per_product: {
        Args: { p_from: string; p_to: string; p_workspace_id: string }
        Returns: {
          product_id: string
          product_name: string
          sku: string
          total_cost: number
          total_quantity: number
        }[]
      }
      report_sales_per_category: {
        Args: { p_from: string; p_to: string; p_workspace_id: string }
        Returns: {
          category_id: string
          category_name: string
          gross_margin: number
          line_count: number
          revenue_net: number
          total_quantity: number
        }[]
      }
      report_sales_per_customer: {
        Args: { p_from: string; p_to: string; p_workspace_id: string }
        Returns: {
          display_name: string
          gross_margin: number
          invoice_count: number
          party_id: string
          party_type: string
          revenue_net: number
        }[]
      }
      report_sales_per_day: {
        Args: { p_from: string; p_to: string; p_workspace_id: string }
        Returns: {
          gross_margin: number
          invoice_count: number
          period: string
          revenue_net: number
        }[]
      }
      report_sales_per_designer: {
        Args: { p_from: string; p_to: string; p_workspace_id: string }
        Returns: {
          accepted_quote_count: number
          display_name: string
          gross_margin: number
          invoice_count: number
          revenue_net: number
          user_id: string
        }[]
      }
      report_sales_per_factory: {
        Args: { p_from: string; p_to: string; p_workspace_id: string }
        Returns: {
          factory_name: string
          gross_margin: number
          line_count: number
          revenue_net: number
          total_quantity: number
        }[]
      }
      report_sales_per_product: {
        Args: { p_from: string; p_to: string; p_workspace_id: string }
        Returns: {
          gross_margin: number
          product_id: string
          product_name: string
          revenue_net: number
          sku: string
          total_quantity: number
        }[]
      }
      report_spend_per_supplier: {
        Args: { p_from: string; p_to: string; p_workspace_id: string }
        Returns: {
          bill_count: number
          billed_total: number
          display_name: string
          outstanding: number
          paid_total: number
          party_id: string
          party_type: string
        }[]
      }
      report_top_customer_outstanding: {
        Args: { p_workspace_id: string }
        Returns: {
          display_name: string
          max_days_overdue: number
          oldest_due_at: string
          open_invoice_count: number
          outstanding: number
          party_id: string
          party_type: string
        }[]
      }
      report_top_supplier_outstanding: {
        Args: { p_workspace_id: string }
        Returns: {
          display_name: string
          max_days_overdue: number
          oldest_due_at: string
          open_bill_count: number
          outstanding: number
          party_id: string
          party_type: string
        }[]
      }
      request_supplier_claim: {
        Args: {
          p_country: string
          p_evidence?: Json
          p_vat: string
          p_workspace_id: string
        }
        Returns: string
      }
      reset_lock_aware_tables: {
        Args: { p_tables: string[] }
        Returns: string[]
      }
      reset_truncate_heavy: { Args: never; Returns: Json }
      resolve_brand_company: {
        Args: { p_name: string; p_workspace_id: string }
        Returns: string
      }
      resolve_embedding_backfill_entities: {
        Args: { p_deficiency: string; p_entity_type: string; p_ids: string[] }
        Returns: undefined
      }
      resolve_facet_value: {
        Args: {
          p_embedding?: unknown
          p_facet_key: string
          p_normalized: string
          p_product_id?: string
          p_raw_value: string
          p_source?: string
          p_threshold?: number
          p_workspace_id?: string
        }
        Returns: Json
      }
      resolve_facet_values_batch: {
        Args: {
          p_items: Json
          p_product_id?: string
          p_source?: string
          p_threshold?: number
          p_workspace_id?: string
        }
        Returns: Json
      }
      resolve_invoice_pay_token: {
        Args: { p_token: string }
        Returns: {
          amount_due: number
          currency: string
          customer_display: string
          expired: boolean
          internal_number: string
          invoice_id: string
          status: string
          workspace_id: string
        }[]
      }
      resolve_platform_supplier: {
        Args: {
          p_country: string
          p_legal_name?: string
          p_source?: string
          p_validated?: boolean
          p_validated_at?: string
          p_vat: string
        }
        Returns: string
      }
      resolve_sourcing_options: {
        Args: {
          p_deliver_to_address_unit_id?: string
          p_product_id: string
          p_qty: number
          p_workspace_id: string
        }
        Returns: Json
      }
      return_priced_request: {
        Args: { p_note?: string; p_request_id: string }
        Returns: undefined
      }
      review_doc_suggestion: {
        Args: { p_action: string; p_suggestion_id: string }
        Returns: Json
      }
      review_factory_access_request: {
        Args: { p_decision: string; p_reason?: string; p_request_id: string }
        Returns: undefined
      }
      run_data_integrity_checks: {
        Args: {
          p_autoheal?: boolean
          p_domains?: string[]
          p_triggered_by?: string
        }
        Returns: string
      }
      save_searates_credentials: {
        Args: {
          p_api_key: string
          p_platform_id: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      save_shipping_credentials: {
        Args: {
          p_api_key: string
          p_base_url?: string
          p_enabled: boolean
          p_provider: string
          p_workspace_id: string
        }
        Returns: undefined
      }
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
      search_products_by_specs: {
        Args: { p_filters?: Json; p_limit?: number; p_workspace_id: string }
        Returns: Json
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
      search_workspace_docs_fts: {
        Args: { p_limit?: number; p_query: string; p_workspace_id: string }
        Returns: {
          id: string
          rank: number
          snippet: string
          title: string
        }[]
      }
      seed_workspace_user_levels: {
        Args: { p_workspace_id: string }
        Returns: undefined
      }
      set_quote_public_share: {
        Args: { p_enabled: boolean; p_quote_id: string }
        Returns: {
          accepted_at: string | null
          cash_discount_pct: number
          created_at: string
          currency: string | null
          custom_request_text: string | null
          customer_address_unit_id: string | null
          customer_company_id: string | null
          customer_contact_id: string | null
          expires_at: string | null
          extras_total: number | null
          grand_total: number | null
          id: string
          last_activity_at: string
          margin_pct: number
          name: string | null
          notes: string | null
          paid_upfront: boolean
          parent_quote_id: string | null
          pdf_generated_at: string | null
          pdf_generation_status: string | null
          pdf_storage_path: string | null
          project_id: string | null
          public_share_created_at: string | null
          public_share_enabled: boolean
          public_share_token: string | null
          quote_number: string | null
          quote_role: string
          rejected_at: string | null
          revision_number: number
          source_quote_id: string | null
          status: string
          status_tag_id: string | null
          submitted_at: string | null
          subtotal: number | null
          total_items: number | null
          updated_at: string
          user_id: string
          vat_amount: number | null
          vat_rate: number | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "quotes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_workspace_entitlement: {
        Args: {
          p_enabled: boolean
          p_module_slug: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      set_workspace_member_credit_limit: {
        Args: {
          p_monthly_limit: number
          p_user_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      should_trigger_alert: {
        Args: { p_alert_id: string; p_new_price: number; p_old_price: number }
        Returns: boolean
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      stamp_job_refresh_cost: {
        Args: { p_refresh_run_id: string; p_tracked_job_id: string }
        Returns: undefined
      }
      stamp_mention_refresh_cost: {
        Args: { p_refresh_run_id: string; p_tracked_mention_id: string }
        Returns: undefined
      }
      stock_overview: { Args: { p_workspace_id: string }; Returns: Json }
      stock_valuation: { Args: { p_workspace_id: string }; Returns: Json }
      storage_audit_summary: {
        Args: never
        Returns: {
          bucket: string
          newest_object_at: string
          object_count: number
          oldest_object_at: string
          total_bytes: number
        }[]
      }
      storage_orphan_summary: {
        Args: never
        Returns: {
          bucket: string
          oldest_orphan_at: string
          orphan_bytes: number
          orphan_objects: number
          total_bytes: number
          total_objects: number
        }[]
      }
      submit_line_rfq: {
        Args: { p_quote_id: string; p_quote_item_ids: string[] }
        Returns: string
      }
      price_rfq_line: {
        Args: { p_line_id: string; p_unit_cost: number }
        Returns: undefined
      }
      decline_rfq_line: {
        Args: { p_line_id: string; p_reason?: string }
        Returns: undefined
      }
      apply_rfq_prices_to_quote: {
        Args: { p_master_request_id: string; p_save_back?: boolean }
        Returns: number
      }
      submit_procurement_request: {
        Args: { p_quote_id: string }
        Returns: string
      }
      submit_reseller_application: {
        Args: { p_country?: string; p_vat: string }
        Returns: string
      }
      supplier_360: {
        Args: { p_company_id: string; p_workspace_id: string }
        Returns: Json
      }
      supplier_update_inbound_order: {
        Args: {
          p_eta?: string
          p_note?: string
          p_order_id: string
          p_status?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      supplier_update_inbound_order_svc: {
        Args: {
          p_eta?: string
          p_note?: string
          p_order_id: string
          p_status?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      tenant_purity_audit: { Args: never; Returns: Json }
      text2ltree: { Args: { "": string }; Returns: unknown }
      tier_rank: { Args: { p_tier: string }; Returns: number }
      toggle_simple_flow: {
        Args: { p_active: boolean; p_flow_id: string; p_workspace_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          description: string | null
          graph_definition: Json
          id: string
          is_global: boolean
          is_locked: boolean
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
          workspace_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "flows"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transfer_stock: {
        Args: {
          p_from_item_id: string
          p_qty: number
          p_to_warehouse_id: string
        }
        Returns: string
      }
      trim_prompt_history: { Args: { keep_n?: number }; Returns: number }
      trip_expense_request_card: {
        Args: {
          p_card_type?: string
          p_note?: string
          p_title?: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: {
          approved_amount: number
          assigned_by: string | null
          card_type: string
          created_at: string
          currency: string
          destination: string | null
          id: string
          item_count: number
          notes: string | null
          pending_amount: number
          purpose: string | null
          reimbursed_at: string | null
          reimbursement_planned_payment_id: string | null
          rejected_amount: number
          request_note: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string | null
          title: string
          total_amount: number
          trip_end: string | null
          trip_start: string | null
          updated_at: string
          user_id: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "trip_expense_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      trip_expense_review_item: {
        Args: { p_decision: string; p_item_id: string; p_note?: string }
        Returns: {
          approved_amount: number
          assigned_by: string | null
          card_type: string
          created_at: string
          currency: string
          destination: string | null
          id: string
          item_count: number
          notes: string | null
          pending_amount: number
          purpose: string | null
          reimbursed_at: string | null
          reimbursement_planned_payment_id: string | null
          rejected_amount: number
          request_note: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string | null
          title: string
          total_amount: number
          trip_end: string | null
          trip_start: string | null
          updated_at: string
          user_id: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "trip_expense_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      trip_expense_submit: {
        Args: { p_report_id: string }
        Returns: {
          approved_amount: number
          assigned_by: string | null
          card_type: string
          created_at: string
          currency: string
          destination: string | null
          id: string
          item_count: number
          notes: string | null
          pending_amount: number
          purpose: string | null
          reimbursed_at: string | null
          reimbursement_planned_payment_id: string | null
          rejected_amount: number
          request_note: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string | null
          title: string
          total_amount: number
          trip_end: string | null
          trip_start: string | null
          updated_at: string
          user_id: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "trip_expense_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_all_search_relevance_scores: { Args: never; Returns: number }
      update_checkpoint_and_append_history: {
        Args: { p_checkpoint: Json; p_event: Json; p_job_id: string }
        Returns: undefined
      }
      update_child_workspace_settings: {
        Args: {
          p_can_supply_products?: boolean
          p_catalog_access?: string
          p_discount_pct?: number
          p_workspace_id: string
        }
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
      update_job_failure_summary: { Args: { p_job_id: string }; Returns: Json }
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
      update_tracked_job_cadence: {
        Args: {
          p_id: string
          p_new_match_count: number
          p_refresh_run_id?: string
        }
        Returns: undefined
      }
      update_tracked_mention_cadence: {
        Args: { p_tracked_mention_id: string; p_velocity_pct_change: number }
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
      validate_embedding_dimensions: {
        Args: never
        Returns: {
          column_name: string
          dimension_count: number
          null_count: number
          row_count: number
          table_name: string
        }[]
      }
      verify_storage_orphans: {
        Args: { p_bucket: string; p_paths: string[] }
        Returns: {
          name: string
        }[]
      }
      wipe_unprotected_kb_docs: { Args: never; Returns: number }
      withdraw_listing: { Args: { p_id: string }; Returns: undefined }
      workspace_inbound_status: {
        Args: { p_workspace_id: string }
        Returns: Json
      }
      workspace_plan_level: {
        Args: { p_workspace_id: string }
        Returns: number
      }
      workspace_quota: {
        Args: { p_key: string; p_workspace_id: string }
        Returns: number
      }
      workspace_rank: { Args: { p_workspace_id: string }; Returns: string }
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
      catalog_access_match_kind:
        | "platform_user"
        | "crm_contact"
        | "crm_company"
        | "email_grant"
        | "denied"
      catalog_email_send_status: "queued" | "sent" | "failed" | "skipped"
      catalog_source_pdf_status: "uploaded" | "processing" | "ready" | "failed"
      catalog_view_event_type: "page_view" | "pdf_download" | "pdf_view"
      competitor_source_type:
        | "firecrawl_url"
        | "dataforseo_shopping"
        | "claude_web_search"
        | "perplexity_web_search"
        | "marketplace_skroutz"
        | "marketplace_bestprice"
        | "marketplace_shopflix"
        | "idealo"
      crm_category_kind:
        | "professional_type"
        | "role"
        | "manual"
        | "industry"
        | "lead_status"
        | "lead_source"
      crm_category_member_kind: "platform_user" | "crm_contact" | "crm_company"
      crm_note_target_kind: "contact" | "company"
      detection_method:
        | "visual"
        | "spectral"
        | "thermal"
        | "ocr"
        | "voice"
        | "combined"
      inbox_channel: "internal" | "whatsapp"
      inbox_message_type: "text" | "system" | "agent" | "note"
      inbox_participant_status: "active" | "left" | "removed"
      inbox_participant_type: "member" | "customer" | "agent"
      inbox_thread_role: "owner" | "agent" | "participant"
      inbox_thread_status: "open" | "snoozed" | "closed"
      inbox_thread_type: "internal" | "customer" | "upstream"
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
      mention_alert_type:
        | "mention_spike"
        | "negative_sentiment"
        | "new_outlet"
        | "llm_visibility_change"
      mention_outlet_type:
        | "news"
        | "blog"
        | "youtube"
        | "forum"
        | "llm"
        | "rss"
        | "aggregator"
        | "other"
      mention_relevance: "exact" | "tangential" | "mismatch" | "unverifiable"
      mention_sentiment: "positive" | "neutral" | "negative"
      mention_subject_type: "product" | "brand" | "keyword"
      moodboard_sheet_status: "draft" | "generating" | "ready" | "failed"
      moodboard_sheet_type:
        | "material_board"
        | "color_palette"
        | "concept_board"
        | "lighting_plan"
        | "annotated_render"
        | "elevation_render_pair"
        | "ffe_schedule"
        | "full_deck"
        | "area_breakdown"
        | "plumbing_plan"
      pdf_extraction_type: "markdown" | "tables" | "images" | "all"
      presentation_catalog_status:
        | "draft"
        | "generating"
        | "ready"
        | "published"
        | "archived"
        | "failed"
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
      project_product_status:
        | "selection"
        | "confirmed"
        | "ordered"
        | "shipped"
        | "delivered"
      role_upgrade_status: "pending" | "approved" | "rejected"
      tech_radar_ring: "adopt" | "trial" | "assess" | "hold"
      tech_radar_status:
        | "new"
        | "reviewed"
        | "accepted"
        | "dismissed"
        | "in_progress"
        | "done"
      user_entity_type: "solo" | "business"
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
      catalog_access_match_kind: [
        "platform_user",
        "crm_contact",
        "crm_company",
        "email_grant",
        "denied",
      ],
      catalog_email_send_status: ["queued", "sent", "failed", "skipped"],
      catalog_source_pdf_status: ["uploaded", "processing", "ready", "failed"],
      catalog_view_event_type: ["page_view", "pdf_download", "pdf_view"],
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
      crm_category_kind: [
        "professional_type",
        "role",
        "manual",
        "industry",
        "lead_status",
        "lead_source",
      ],
      crm_category_member_kind: ["platform_user", "crm_contact", "crm_company"],
      crm_note_target_kind: ["contact", "company"],
      detection_method: [
        "visual",
        "spectral",
        "thermal",
        "ocr",
        "voice",
        "combined",
      ],
      inbox_channel: ["internal", "whatsapp"],
      inbox_message_type: ["text", "system", "agent", "note"],
      inbox_participant_status: ["active", "left", "removed"],
      inbox_participant_type: ["member", "customer", "agent"],
      inbox_thread_role: ["owner", "agent", "participant"],
      inbox_thread_status: ["open", "snoozed", "closed"],
      inbox_thread_type: ["internal", "customer", "upstream"],
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
      mention_alert_type: [
        "mention_spike",
        "negative_sentiment",
        "new_outlet",
        "llm_visibility_change",
      ],
      mention_outlet_type: [
        "news",
        "blog",
        "youtube",
        "forum",
        "llm",
        "rss",
        "aggregator",
        "other",
      ],
      mention_relevance: ["exact", "tangential", "mismatch", "unverifiable"],
      mention_sentiment: ["positive", "neutral", "negative"],
      mention_subject_type: ["product", "brand", "keyword"],
      moodboard_sheet_status: ["draft", "generating", "ready", "failed"],
      moodboard_sheet_type: [
        "material_board",
        "color_palette",
        "concept_board",
        "lighting_plan",
        "annotated_render",
        "elevation_render_pair",
        "ffe_schedule",
        "full_deck",
        "area_breakdown",
        "plumbing_plan",
      ],
      pdf_extraction_type: ["markdown", "tables", "images", "all"],
      presentation_catalog_status: [
        "draft",
        "generating",
        "ready",
        "published",
        "archived",
        "failed",
      ],
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
      project_product_status: [
        "selection",
        "confirmed",
        "ordered",
        "shipped",
        "delivered",
      ],
      role_upgrade_status: ["pending", "approved", "rejected"],
      tech_radar_ring: ["adopt", "trial", "assess", "hold"],
      tech_radar_status: [
        "new",
        "reviewed",
        "accepted",
        "dismissed",
        "in_progress",
        "done",
      ],
      user_entity_type: ["solo", "business"],
    },
  },
} as const
