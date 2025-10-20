import { supabase } from "@/integrations/supabase/client";
import { BaseService } from "./base/BaseService";
import {
  ChunkClassification,
  ChunkClassificationInsert,
  ChunkBoundary,
  ChunkBoundaryInsert,
  ChunkValidationScore,
  ChunkValidationScoreInsert,
  ClassificationStats,
  BoundaryStats,
  ValidationStats,
} from "@/types/chunk-analysis";

/**
 * ChunkAnalysisService
 * Manages database operations for chunk analysis data:
 * - Content classifications (product, specification, etc.)
 * - Boundary detection results (sentence, paragraph, semantic, etc.)
 * - Validation scores (quality, coherence, completeness, etc.)
 */
export class ChunkAnalysisService extends BaseService {
  constructor() {
    super({
      name: "ChunkAnalysisService",
      version: "1.0.0",
      environment: "production",
      enabled: true,
    });
  }

  /**
   * Insert chunk classification
   */
  async insertClassification(
    data: ChunkClassificationInsert
  ): Promise<ChunkClassification> {
    try {
      const { data: result, error } = await supabase
        .from("chunk_classifications")
        .insert([data])
        .select()
        .single();

      if (error) throw error;
      return result as ChunkClassification;
    } catch (error) {
      this.logger.error("Failed to insert classification:", error);
      throw error;
    }
  }

  /**
   * Batch insert classifications
   */
  async insertClassifications(
    data: ChunkClassificationInsert[]
  ): Promise<ChunkClassification[]> {
    try {
      const { data: results, error } = await supabase
        .from("chunk_classifications")
        .insert(data)
        .select();

      if (error) throw error;
      return results as ChunkClassification[];
    } catch (error) {
      this.logger.error("Failed to batch insert classifications:", error);
      throw error;
    }
  }

  /**
   * Get classifications for chunk
   */
  async getClassifications(chunkId: string): Promise<ChunkClassification[]> {
    try {
      const { data, error } = await supabase
        .from("chunk_classifications")
        .select("*")
        .eq("chunk_id", chunkId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as ChunkClassification[];
    } catch (error) {
      this.logger.error("Failed to get classifications:", error);
      throw error;
    }
  }

  /**
   * Get classification statistics
   */
  async getClassificationStats(
    workspaceId: string
  ): Promise<ClassificationStats[]> {
    try {
      const { data, error } = await supabase.rpc(
        "get_classification_stats",
        { workspace_id: workspaceId }
      );

      if (error) throw error;
      return data as ClassificationStats[];
    } catch (error) {
      this.logger.error("Failed to get classification stats:", error);
      throw error;
    }
  }

  /**
   * Insert chunk boundary
   */
  async insertBoundary(data: ChunkBoundaryInsert): Promise<ChunkBoundary> {
    try {
      const { data: result, error } = await supabase
        .from("chunk_boundaries")
        .insert([data])
        .select()
        .single();

      if (error) throw error;
      return result as ChunkBoundary;
    } catch (error) {
      this.logger.error("Failed to insert boundary:", error);
      throw error;
    }
  }

  /**
   * Batch insert boundaries
   */
  async insertBoundaries(
    data: ChunkBoundaryInsert[]
  ): Promise<ChunkBoundary[]> {
    try {
      const { data: results, error } = await supabase
        .from("chunk_boundaries")
        .insert(data)
        .select();

      if (error) throw error;
      return results as ChunkBoundary[];
    } catch (error) {
      this.logger.error("Failed to batch insert boundaries:", error);
      throw error;
    }
  }

  /**
   * Get boundaries for chunk
   */
  async getBoundaries(chunkId: string): Promise<ChunkBoundary[]> {
    try {
      const { data, error } = await supabase
        .from("chunk_boundaries")
        .select("*")
        .eq("chunk_id", chunkId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as ChunkBoundary[];
    } catch (error) {
      this.logger.error("Failed to get boundaries:", error);
      throw error;
    }
  }

  /**
   * Get product boundaries
   */
  async getProductBoundaries(workspaceId: string): Promise<ChunkBoundary[]> {
    try {
      const { data, error } = await supabase
        .from("chunk_boundaries")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("is_product_boundary", true)
        .order("boundary_score", { ascending: false });

      if (error) throw error;
      return data as ChunkBoundary[];
    } catch (error) {
      this.logger.error("Failed to get product boundaries:", error);
      throw error;
    }
  }

  /**
   * Get boundary statistics
   */
  async getBoundaryStats(workspaceId: string): Promise<BoundaryStats[]> {
    try {
      const { data, error } = await supabase.rpc("get_boundary_stats", {
        workspace_id: workspaceId,
      });

      if (error) throw error;
      return data as BoundaryStats[];
    } catch (error) {
      this.logger.error("Failed to get boundary stats:", error);
      throw error;
    }
  }

  /**
   * Insert validation score
   */
  async insertValidationScore(
    data: ChunkValidationScoreInsert
  ): Promise<ChunkValidationScore> {
    try {
      const { data: result, error } = await supabase
        .from("chunk_validation_scores")
        .insert([data])
        .select()
        .single();

      if (error) throw error;
      return result as ChunkValidationScore;
    } catch (error) {
      this.logger.error("Failed to insert validation score:", error);
      throw error;
    }
  }

  /**
   * Batch insert validation scores
   */
  async insertValidationScores(
    data: ChunkValidationScoreInsert[]
  ): Promise<ChunkValidationScore[]> {
    try {
      const { data: results, error } = await supabase
        .from("chunk_validation_scores")
        .insert(data)
        .select();

      if (error) throw error;
      return results as ChunkValidationScore[];
    } catch (error) {
      this.logger.error("Failed to batch insert validation scores:", error);
      throw error;
    }
  }

  /**
   * Get validation scores for chunk
   */
  async getValidationScores(chunkId: string): Promise<ChunkValidationScore[]> {
    try {
      const { data, error } = await supabase
        .from("chunk_validation_scores")
        .select("*")
        .eq("chunk_id", chunkId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as ChunkValidationScore[];
    } catch (error) {
      this.logger.error("Failed to get validation scores:", error);
      throw error;
    }
  }

  /**
   * Get chunks needing review
   */
  async getChunksNeedingReview(workspaceId: string): Promise<ChunkValidationScore[]> {
    try {
      const { data, error } = await supabase
        .from("chunk_validation_scores")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("validation_status", "needs_review")
        .order("overall_validation_score", { ascending: true });

      if (error) throw error;
      return data as ChunkValidationScore[];
    } catch (error) {
      this.logger.error("Failed to get chunks needing review:", error);
      throw error;
    }
  }

  /**
   * Get validation statistics
   */
  async getValidationStats(workspaceId: string): Promise<ValidationStats[]> {
    try {
      const { data, error } = await supabase.rpc("get_validation_stats", {
        workspace_id: workspaceId,
      });

      if (error) throw error;
      return data as ValidationStats[];
    } catch (error) {
      this.logger.error("Failed to get validation stats:", error);
      throw error;
    }
  }

  /**
   * Get comprehensive chunk analysis
   */
  async getChunkAnalysis(chunkId: string) {
    try {
      const [classifications, boundaries, validationScores] = await Promise.all([
        this.getClassifications(chunkId),
        this.getBoundaries(chunkId),
        this.getValidationScores(chunkId),
      ]);

      return {
        chunk_id: chunkId,
        classifications,
        boundaries,
        validation_scores: validationScores,
      };
    } catch (error) {
      this.logger.error("Failed to get chunk analysis:", error);
      throw error;
    }
  }

  /**
   * Initialize the service
   */
  protected async doInitialize(): Promise<void> {
    // Service is ready after construction
  }

  /**
   * Health check for the service
   */
  protected async doHealthCheck(): Promise<void> {
    // Verify database connectivity by checking if we can query
    const { error } = await supabase
      .from("chunk_classifications")
      .select("id")
      .limit(1);

    if (error) {
      throw new Error(`Database health check failed: ${error.message}`);
    }
  }
}

// Export singleton instance
export const chunkAnalysisService = new ChunkAnalysisService();

