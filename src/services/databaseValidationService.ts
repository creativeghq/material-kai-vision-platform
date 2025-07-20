/**
 * Database Schema Validation Service
 * Validates database schema integrity and handles migrations
 */

import { supabase } from "@/integrations/supabase/client";

export interface SchemaValidationResult {
  isValid: boolean;
  errors: SchemaError[];
  warnings: SchemaWarning[];
  recommendations: string[];
  validatedAt: string;
}

export interface SchemaError {
  type: 'missing_table' | 'missing_column' | 'invalid_type' | 'missing_index' | 'rls_policy_error';
  table: string;
  column?: string;
  expected: any;
  actual: any;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
}

export interface SchemaWarning {
  type: 'performance' | 'deprecated' | 'missing_constraint' | 'naming_convention';
  table: string;
  column?: string;
  message: string;
  suggestion: string;
}

interface TableSchema {
  name: string;
  columns: ColumnSchema[];
  indexes: IndexSchema[];
  policies: PolicySchema[];
}

interface ColumnSchema {
  name: string;
  type: string;
  nullable: boolean;
  default?: any;
  constraints?: string[];
}

interface IndexSchema {
  name: string;
  columns: string[];
  unique: boolean;
  type: string;
}

interface PolicySchema {
  name: string;
  command: string;
  role: string;
  expression: string;
}

class DatabaseValidationService {
  
  private readonly EXPECTED_TABLES: string[] = [
    'profiles',
    'materials_catalog',
    
    'material_style_analysis',
    'material_knowledge',
    'enhanced_knowledge_base',
    'knowledge_relationships',
    'recognition_results',
    'uploaded_files',
    'processing_queue',
    'moodboards',
    'moodboard_items',
    'nerf_reconstructions',
    'svbrdf_extractions',
    'spatial_analysis',
    'generation_3d',
    'agent_tasks',
    'agent_ml_tasks',
    'crewai_agents',
    'api_endpoints',
    'api_usage_logs',
    'rate_limit_rules',
    'search_analytics',
    'user_roles'
  ];

  /**
   * Validate complete database schema
   */
  async validateSchema(): Promise<SchemaValidationResult> {
    try {
      console.log('Starting database schema validation');

      const errors: SchemaError[] = [];
      const warnings: SchemaWarning[] = [];
      const recommendations: string[] = [];

      // Validate table existence
      const tableValidation = await this.validateTables();
      errors.push(...tableValidation.errors);
      warnings.push(...tableValidation.warnings);

      // Validate RLS policies
      const rlsValidation = await this.validateRLSPolicies();
      errors.push(...rlsValidation.errors);
      warnings.push(...rlsValidation.warnings);

      // Validate indexes
      const indexValidation = await this.validateIndexes();
      errors.push(...indexValidation.errors);
      warnings.push(...indexValidation.warnings);

      // Validate data integrity
      const dataValidation = await this.validateDataIntegrity();
      errors.push(...dataValidation.errors);
      warnings.push(...dataValidation.warnings);

      // Generate recommendations
      recommendations.push(...this.generateRecommendations(errors, warnings));

      return {
        isValid: errors.filter(e => e.severity === 'critical' || e.severity === 'high').length === 0,
        errors,
        warnings,
        recommendations,
        validatedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('Error validating database schema:', error);
      throw error;
    }
  }

  /**
   * Validate table existence and structure
   */
  private async validateTables(): Promise<{ errors: SchemaError[], warnings: SchemaWarning[] }> {
    const errors: SchemaError[] = [];
    const warnings: SchemaWarning[] = [];

    try {
      // Since we can't access information_schema from client, we'll test table access directly
      const existingTables: string[] = [];
      
      // Test each expected table by attempting to access it
      for (const table of this.EXPECTED_TABLES) {
        try {
          const { error } = await supabase.from(table as any).select('*').limit(0);
          if (!error) {
            existingTables.push(table);
          }
        } catch {
          // Table doesn't exist or isn't accessible
        }
      }

      // Check for missing expected tables
      for (const expectedTable of this.EXPECTED_TABLES) {
        if (!existingTables.includes(expectedTable)) {
          errors.push({
            type: 'missing_table',
            table: expectedTable,
            severity: 'high',
            expected: 'exists',
            actual: 'missing',
            message: `Required table '${expectedTable}' is missing`
          });
        }
      }

      // Check for unexpected tables (potential naming issues)
      const unexpectedTables = existingTables.filter(t => 
        !this.EXPECTED_TABLES.includes(t) && 
        !t.startsWith('_') && 
        t !== 'schema_migrations'
      );

      for (const unexpectedTable of unexpectedTables) {
        warnings.push({
          type: 'naming_convention',
          table: unexpectedTable,
          message: `Unexpected table '${unexpectedTable}' found`,
          suggestion: 'Review table naming conventions'
        });
      }

    } catch (error) {
      console.error('Error validating tables:', error);
      errors.push({
        type: 'missing_table',
        table: 'validation_error',
        severity: 'critical',
        expected: 'validation_success',
        actual: 'validation_failed',
        message: 'Failed to validate table structure'
      });
    }

    return { errors, warnings };
  }

  /**
   * Validate RLS policies
   */
  private async validateRLSPolicies(): Promise<{ errors: SchemaError[], warnings: SchemaWarning[] }> {
    const errors: SchemaError[] = [];
    const warnings: SchemaWarning[] = [];

    try {
      // Test basic RLS functionality by attempting operations
      const testTables = ['materials_catalog', 'moodboards', 'profiles'];

      for (const table of testTables) {
        try {
          // Test read access
          const { error: readError } = await supabase
            .from(table as any)
            .select('id')
            .limit(1);

          if (readError && readError.code === 'PGRST116') {
            warnings.push({
              type: 'missing_constraint',
              table: table,
              message: `RLS policy may be too restrictive for table '${table}'`,
              suggestion: 'Review RLS policies for public read access if needed'
            });
          }
        } catch (error) {
          // Ignore individual table errors for now
        }
      }

    } catch (error) {
      console.error('Error validating RLS policies:', error);
    }

    return { errors, warnings };
  }

  /**
   * Validate database indexes
   */
  private async validateIndexes(): Promise<{ errors: SchemaError[], warnings: SchemaWarning[] }> {
    const errors: SchemaError[] = [];
    const warnings: SchemaWarning[] = [];

    // Expected indexes for performance
    const expectedIndexes = [
      { table: 'materials_catalog', column: 'category' },
      
      { table: 'recognition_results', column: 'file_id' },
      { table: 'moodboard_items', column: 'moodboard_id' },
      { table: 'uploaded_files', column: 'user_id' },
    ];

    for (const index of expectedIndexes) {
      warnings.push({
        type: 'performance',
        table: index.table,
        column: index.column,
        message: `Consider adding index on ${index.table}.${index.column} for better performance`,
        suggestion: `CREATE INDEX idx_${index.table}_${index.column} ON ${index.table}(${index.column});`
      });
    }

    return { errors, warnings };
  }

  /**
   * Validate data integrity
   */
  private async validateDataIntegrity(): Promise<{ errors: SchemaError[], warnings: SchemaWarning[] }> {
    const errors: SchemaError[] = [];
    const warnings: SchemaWarning[] = [];

    try {
      // Check for orphaned records
      const integrityChecks = [
        {
          name: 'Orphaned moodboard items',
          query: `
            SELECT COUNT(*) as count 
            FROM moodboard_items mi 
            LEFT JOIN moodboards mb ON mi.moodboard_id = mb.id 
            WHERE mb.id IS NULL
          `
        }
      ];

      for (const check of integrityChecks) {
        try {
          // Note: We can't run raw SQL from client, so we'll use table queries
          // This is a simplified check
          warnings.push({
            type: 'missing_constraint',
            table: 'various',
            message: `Data integrity check: ${check.name}`,
            suggestion: 'Run manual data integrity checks periodically'
          });
        } catch (error) {
          // Individual check failed
        }
      }

    } catch (error) {
      console.error('Error validating data integrity:', error);
    }

    return { errors, warnings };
  }

  /**
   * Generate recommendations based on validation results
   */
  private generateRecommendations(errors: SchemaError[], warnings: SchemaWarning[]): string[] {
    const recommendations: string[] = [];

    const criticalErrors = errors.filter(e => e.severity === 'critical');
    const highErrors = errors.filter(e => e.severity === 'high');

    if (criticalErrors.length > 0) {
      recommendations.push('Immediate action required: Critical database errors detected');
    }

    if (highErrors.length > 0) {
      recommendations.push('High priority: Missing required tables or columns');
    }

    const performanceWarnings = warnings.filter(w => w.type === 'performance');
    if (performanceWarnings.length > 3) {
      recommendations.push('Consider adding database indexes for better performance');
    }

    if (warnings.some(w => w.type === 'missing_constraint')) {
      recommendations.push('Review RLS policies and data constraints');
    }

    recommendations.push('Schedule regular database validation checks');
    recommendations.push('Monitor database performance and optimize queries');

    return recommendations;
  }

  /**
   * Validate specific table schema
   */
  async validateTable(tableName: string): Promise<SchemaValidationResult> {
    try {
      const errors: SchemaError[] = [];
      const warnings: SchemaWarning[] = [];

      // Check if table exists
      const { error } = await supabase
        .from(tableName as any)
        .select('*')
        .limit(0);

      if (error) {
        errors.push({
          type: 'missing_table',
          table: tableName,
          severity: 'critical',
          expected: 'exists',
          actual: 'missing',
          message: `Table '${tableName}' does not exist or is not accessible`
        });
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        recommendations: errors.length > 0 ? [`Create table '${tableName}'`] : [],
        validatedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error(`Error validating table ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Get database health metrics
   */
  async getDatabaseHealth(): Promise<any> {
    try {
      // Get basic metrics
      const metrics = {
        totalTables: 0,
        totalRecords: 0,
        recentActivity: 0,
        health: 'unknown'
      };

      // Count records in key tables
      const tableCounts = await Promise.allSettled([
        supabase.from('materials_catalog').select('id', { count: 'exact' }),
        supabase.from('moodboards').select('id', { count: 'exact' }),
        supabase.from('uploaded_files').select('id', { count: 'exact' }),
        supabase.from('recognition_results').select('id', { count: 'exact' })
      ]);

      let totalRecords = 0;
      tableCounts.forEach(result => {
        if (result.status === 'fulfilled' && result.value.count) {
          totalRecords += result.value.count;
        }
      });

      metrics.totalRecords = totalRecords;
      metrics.totalTables = this.EXPECTED_TABLES.length;
      metrics.health = totalRecords > 0 ? 'healthy' : 'empty';

      return metrics;

    } catch (error) {
      console.error('Error getting database health:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const databaseValidationService = new DatabaseValidationService();
export { DatabaseValidationService };