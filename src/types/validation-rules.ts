/**
 * Validation Rules Types
 * TypeScript interfaces for validation rules database schema
 *
 * Tables:
 * - validation_rules: Rule definitions
 * - validation_results: Rule application results
 */

/**
 * Validation Rule Type
 */
export type ValidationRuleType =
  | 'content_quality'
  | 'boundary_quality'
  | 'semantic_coherence'
  | 'completeness'
  | 'metadata_presence'
  | 'specification_count'
  | 'image_count'
  | 'custom';

/**
 * Validation Operator
 */
export type ValidationOperator = 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'not_contains' | 'matches_regex' | 'in_range';

/**
 * Validation Severity
 */
export type ValidationSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * Validation Rule Definition
 */
export interface ValidationRuleDefinition {
  field: string;
  operator: ValidationOperator;
  value: any;
  threshold?: number;
  message?: string;
}

/**
 * Validation Rule
 */
export interface ValidationRule {
  id: string;
  workspace_id?: string;
  rule_name: string;
  rule_type: ValidationRuleType;
  rule_description?: string;
  rule_definition: ValidationRuleDefinition;
  is_active: boolean;
  priority: number; // 1-100, higher = more important
  severity: ValidationSeverity;
  auto_fix?: boolean;
  fix_action?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Validation Rule Insert
 */
export interface ValidationRuleInsert {
  workspace_id?: string;
  rule_name: string;
  rule_type: ValidationRuleType;
  rule_description?: string;
  rule_definition: ValidationRuleDefinition;
  is_active?: boolean;
  priority?: number;
  severity?: ValidationSeverity;
  auto_fix?: boolean;
  fix_action?: string;
  created_by?: string;
}

/**
 * Validation Rule Update
 */
export interface ValidationRuleUpdate {
  rule_name?: string;
  rule_type?: ValidationRuleType;
  rule_description?: string;
  rule_definition?: ValidationRuleDefinition;
  is_active?: boolean;
  priority?: number;
  severity?: ValidationSeverity;
  auto_fix?: boolean;
  fix_action?: string;
}

/**
 * Validation Result
 */
export interface ValidationResult {
  id: string;
  chunk_id: string;
  rule_id: string;
  workspace_id?: string;
  passed: boolean;
  severity: ValidationSeverity;
  message?: string;
  details?: Record<string, any>;
  issues?: Array<{
    type: string;
    description: string;
    suggestion?: string;
  }>;
  validated_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * Validation Result Insert
 */
export interface ValidationResultInsert {
  chunk_id: string;
  rule_id: string;
  workspace_id?: string;
  passed: boolean;
  severity: ValidationSeverity;
  message?: string;
  details?: Record<string, any>;
  issues?: Array<{
    type: string;
    description: string;
    suggestion?: string;
  }>;
  validated_at?: string;
}

/**
 * Validation Result Update
 */
export interface ValidationResultUpdate {
  passed?: boolean;
  severity?: ValidationSeverity;
  message?: string;
  details?: Record<string, any>;
  issues?: Array<{
    type: string;
    description: string;
    suggestion?: string;
  }>;
  validated_at?: string;
}

/**
 * Validation Request
 */
export interface ValidationRequest {
  chunk_id: string;
  workspace_id: string;
  rule_ids?: string[]; // If not provided, apply all active rules
  chunk_data?: Record<string, any>;
}

/**
 * Validation Response
 */
export interface ValidationResponse {
  chunk_id: string;
  results: ValidationResult[];
  passed: boolean;
  total_rules: number;
  passed_rules: number;
  failed_rules: number;
  severity_summary: Record<ValidationSeverity, number>;
}

/**
 * Batch Validation Request
 */
export interface BatchValidationRequest {
  chunk_ids: string[];
  workspace_id: string;
  rule_ids?: string[];
}

/**
 * Batch Validation Response
 */
export interface BatchValidationResponse {
  results: ValidationResponse[];
  total_chunks: number;
  passed_chunks: number;
  failed_chunks: number;
  total_rules_applied: number;
  total_failures: number;
}

/**
 * Validation Statistics
 */
export interface ValidationStats {
  total_rules: number;
  active_rules: number;
  total_validations: number;
  passed_validations: number;
  failed_validations: number;
  pass_rate: number;
  severity_distribution: Record<ValidationSeverity, number>;
  rule_effectiveness: Array<{
    rule_id: string;
    rule_name: string;
    total_applied: number;
    failures: number;
    failure_rate: number;
  }>;
}

/**
 * Validation Rule Configuration
 */
export interface ValidationRuleConfig {
  enable_auto_fix: boolean;
  enable_severity_escalation: boolean;
  max_rules_per_chunk: number;
  validation_timeout_ms: number;
  cache_results: boolean;
  cache_ttl_ms: number;
}

/**
 * Combined Phase 2.3 Database Types
 */
export interface Phase23Database {
  validation_rules: {
    Row: ValidationRule;
    Insert: ValidationRuleInsert;
    Update: ValidationRuleUpdate;
  };
  validation_results: {
    Row: ValidationResult;
    Insert: ValidationResultInsert;
    Update: ValidationResultUpdate;
  };
}

