/**
 * Validation Rules Service
 * Manages validation rules and applies them to chunks
 */

import { supabase } from '@/integrations/supabase/client';
import {
  ValidationRule,
  ValidationRuleInsert,
  ValidationRuleUpdate,
  ValidationResult,
  ValidationResultInsert,
  ValidationRequest,
  ValidationResponse,
  BatchValidationRequest,
  BatchValidationResponse,
  ValidationStats,
  ValidationRuleConfig,
  ValidationRuleType,
  ValidationOperator,
  ValidationSeverity,
} from '@/types/validation-rules';

import { BaseService, ServiceConfig } from './base/BaseService';

/**
 * Validation Rules Service Configuration
 */
interface ValidationRulesServiceConfig extends ServiceConfig {
  defaultConfig: ValidationRuleConfig;
}

/**
 * Validation Rules Service
 * Manages validation rules and applies them to chunks
 */
export class ValidationRulesService extends BaseService<ValidationRulesServiceConfig> {
  private defaultConfig: ValidationRuleConfig;
  private rulesCache: Map<string, ValidationRule[]> = new Map();

  constructor() {
    super({
      name: 'ValidationRulesService',
      version: '1.0.0',
      environment: 'production',
      enabled: true,
      timeout: 30000,
      retries: 2,
      defaultConfig: {
        enable_auto_fix: false,
        enable_severity_escalation: true,
        max_rules_per_chunk: 50,
        validation_timeout_ms: 5000,
        cache_results: true,
        cache_ttl_ms: 3600000, // 1 hour
      },
    });
    this.defaultConfig = this.config.defaultConfig;
  }

  protected async doHealthCheck(): Promise<void> {
    // Health check implementation
  }

  /**
   * Initialize service
   */
  protected async doInitialize(): Promise<void> {
    console.log('ValidationRulesService initialized');
  }

  /**
   * Create a validation rule
   */
  async createRule(request: ValidationRuleInsert): Promise<ValidationRule> {
    return this.executeOperation(async () => {
      const { data, error } = await supabase
        .from('validation_rules')
        .insert([request])
        .select()
        .single();

      if (error || !data) {
        throw new Error(`Failed to create rule: ${error?.message}`);
      }

      // Invalidate cache
      if (request.workspace_id) {
        this.rulesCache.delete(request.workspace_id);
      }

      return data as ValidationRule;
    }, 'createRule');
  }

  /**
   * Get all active rules for a workspace
   */
  async getActiveRules(workspaceId: string): Promise<ValidationRule[]> {
    return this.executeOperation(async () => {
      // Check cache
      if (this.rulesCache.has(workspaceId)) {
        return this.rulesCache.get(workspaceId)!;
      }

      const { data, error } = await supabase
        .from('validation_rules')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('is_active', true)
        .order('priority', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch rules: ${error.message}`);
      }

      const rules = (data || []) as ValidationRule[];
      this.rulesCache.set(workspaceId, rules);
      return rules;
    }, 'getActiveRules');
  }

  /**
   * Validate a single chunk
   */
  async validateChunk(request: ValidationRequest): Promise<ValidationResponse> {
    return this.executeOperation(async () => {
      // Get chunk data
      const { data: chunkData, error: chunkError } = await supabase
        .from('document_chunks')
        .select('*')
        .eq('id', request.chunk_id)
        .single();

      if (chunkError || !chunkData) {
        throw new Error(`Chunk not found: ${request.chunk_id}`);
      }

      // Get rules to apply
      let rules: ValidationRule[];
      if (request.rule_ids && request.rule_ids.length > 0) {
        const { data, error } = await supabase
          .from('validation_rules')
          .select('*')
          .in('id', request.rule_ids);

        if (error) {
          throw new Error(`Failed to fetch rules: ${error.message}`);
        }

        rules = (data || []) as ValidationRule[];
      } else {
        rules = await this.getActiveRules(request.workspace_id);
      }

      // Apply rules
      const results: ValidationResult[] = [];
      let passedCount = 0;
      const severitySummary: Record<ValidationSeverity, number> = {
        info: 0,
        warning: 0,
        error: 0,
        critical: 0,
      };

      for (const rule of rules.slice(
        0,
        this.defaultConfig.max_rules_per_chunk,
      )) {
        const result = await this.applyRule(
          request.chunk_id,
          rule,
          request.workspace_id,
          request.chunk_data || chunkData,
        );

        results.push(result);
        severitySummary[result.severity]++;

        if (result.passed) {
          passedCount++;
        }
      }

      return {
        chunk_id: request.chunk_id,
        results,
        passed: passedCount === results.length,
        total_rules: results.length,
        passed_rules: passedCount,
        failed_rules: results.length - passedCount,
        severity_summary: severitySummary,
      };
    }, 'validateChunk');
  }

  /**
   * Validate multiple chunks
   */
  async validateChunks(
    request: BatchValidationRequest,
  ): Promise<BatchValidationResponse> {
    return this.executeOperation(async () => {
      const results: ValidationResponse[] = [];
      let passedChunks = 0;
      let totalFailures = 0;
      let totalRulesApplied = 0;

      for (const chunkId of request.chunk_ids) {
        try {
          const response = await this.validateChunk({
            chunk_id: chunkId,
            workspace_id: request.workspace_id,
            rule_ids: request.rule_ids,
          });

          results.push(response);
          totalRulesApplied += response.total_rules;
          totalFailures += response.failed_rules;

          if (response.passed) {
            passedChunks++;
          }
        } catch (error) {
          console.error(`Error validating chunk ${chunkId}:`, error);
        }
      }

      return {
        results,
        total_chunks: request.chunk_ids.length,
        passed_chunks: passedChunks,
        failed_chunks: request.chunk_ids.length - passedChunks,
        total_rules_applied: totalRulesApplied,
        total_failures: totalFailures,
      };
    }, 'validateChunks');
  }

  /**
   * Get validation statistics
   */
  async getValidationStats(workspaceId: string): Promise<ValidationStats> {
    return this.executeOperation(async () => {
      // Get rules
      const { data: rulesData, error: rulesError } = await supabase
        .from('validation_rules')
        .select('*')
        .eq('workspace_id', workspaceId);

      if (rulesError) {
        throw new Error(`Failed to fetch rules: ${rulesError.message}`);
      }

      const rules = (rulesData || []) as ValidationRule[];

      // Get validation results
      const { data: resultsData, error: resultsError } = await supabase
        .from('validation_results')
        .select('*')
        .eq('workspace_id', workspaceId);

      if (resultsError) {
        throw new Error(`Failed to fetch results: ${resultsError.message}`);
      }

      const results = (resultsData || []) as ValidationResult[];

      // Calculate statistics
      const stats: ValidationStats = {
        total_rules: rules.length,
        active_rules: rules.filter((r) => r.is_active).length,
        total_validations: results.length,
        passed_validations: results.filter((r) => r.passed).length,
        failed_validations: results.filter((r) => !r.passed).length,
        pass_rate:
          results.length > 0
            ? results.filter((r) => r.passed).length / results.length
            : 0,
        severity_distribution: this.getSeverityDistribution(results),
        rule_effectiveness: this.getRuleEffectiveness(rules, results),
      };

      return stats;
    }, 'getValidationStats');
  }

  /**
   * Private helper methods
   */

  private async applyRule(
    chunkId: string,
    rule: ValidationRule,
    workspaceId: string,
    chunkData: any,
  ): Promise<ValidationResult> {
    const passed = this.evaluateRule(rule, chunkData);

    const resultInsert: ValidationResultInsert = {
      chunk_id: chunkId,
      rule_id: rule.id,
      workspace_id: workspaceId,
      passed,
      severity: rule.severity,
      message: passed
        ? `Rule "${rule.rule_name}" passed`
        : `Rule "${rule.rule_name}" failed`,
      validated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('validation_results')
      .insert([resultInsert])
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to insert validation result: ${error?.message}`);
    }

    return data as ValidationResult;
  }

  private evaluateRule(rule: ValidationRule, data: any): boolean {
    const definition = rule.rule_definition;
    const fieldValue = this.getFieldValue(data, definition.field);

    switch (definition.operator) {
      case 'equals':
        return fieldValue === definition.value;
      case 'not_equals':
        return fieldValue !== definition.value;
      case 'greater_than':
        return fieldValue > definition.value;
      case 'less_than':
        return fieldValue < definition.value;
      case 'contains':
        return String(fieldValue).includes(String(definition.value));
      case 'not_contains':
        return !String(fieldValue).includes(String(definition.value));
      case 'matches_regex':
        return new RegExp(String(definition.value)).test(String(fieldValue));
      case 'in_range':
        return (
          fieldValue >= definition.value[0] && fieldValue <= definition.value[1]
        );
      default:
        return false;
    }
  }

  private getFieldValue(data: any, field: string): any {
    const parts = field.split('.');
    let value = data;

    for (const part of parts) {
      value = value?.[part];
    }

    return value;
  }

  private getSeverityDistribution(
    results: ValidationResult[],
  ): Record<ValidationSeverity, number> {
    const distribution: Record<ValidationSeverity, number> = {
      info: 0,
      warning: 0,
      error: 0,
      critical: 0,
    };

    results.forEach((result) => {
      distribution[result.severity]++;
    });

    return distribution;
  }

  private getRuleEffectiveness(
    rules: ValidationRule[],
    results: ValidationResult[],
  ): Array<{
    rule_id: string;
    rule_name: string;
    total_applied: number;
    failures: number;
    failure_rate: number;
  }> {
    const effectiveness = [];

    for (const rule of rules) {
      const ruleResults = results.filter((r) => r.rule_id === rule.id);
      const failures = ruleResults.filter((r) => !r.passed).length;
      const failureRate =
        ruleResults.length > 0 ? failures / ruleResults.length : 0;

      effectiveness.push({
        rule_id: rule.id,
        rule_name: rule.rule_name,
        total_applied: ruleResults.length,
        failures,
        failure_rate: failureRate,
      });
    }

    return effectiveness.sort((a, b) => b.failure_rate - a.failure_rate);
  }
}

/**
 * Export singleton instance
 */
export const validationRulesService = new ValidationRulesService();
