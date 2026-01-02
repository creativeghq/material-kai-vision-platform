/**
 * Recommendations Service
 * Handles interaction tracking and fetching recommendations
 */

import { supabase } from '@/integrations/supabase/client';

export interface Recommendation {
  material_id: string;
  score: number;
  confidence: number;
  algorithm: string;
  metadata?: Record<string, any>;
}

export class RecommendationsService {
  /**
   * Track user interaction with a material
   */
  private static async trackInteraction(
    materialId: string,
    interactionType: 'view' | 'click' | 'save' | 'purchase' | 'rate' | 'add_to_quote' | 'share',
    interactionValue: number = 1.0,
    metadata?: Record<string, any>,
  ): Promise<void> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const workspaceId = localStorage.getItem('current_workspace_id');
      if (!workspaceId) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/recommendations-api/track-interaction`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            workspace_id: workspaceId,
            material_id: materialId,
            interaction_type: interactionType,
            interaction_value: interactionValue,
            session_id: session.user.id,
            metadata: metadata || {},
          }),
        },
      );

      if (!response.ok) {
        console.error('Failed to track interaction:', await response.text());
      }
    } catch (error) {
      console.error('Error tracking interaction:', error);
    }
  }

  /**
   * Track when user views a material
   */
  static async trackView(materialId: string, metadata?: Record<string, any>): Promise<void> {
    await this.trackInteraction(materialId, 'view', 1.0, metadata);
  }

  /**
   * Track when user clicks on a material
   */
  static async trackClick(materialId: string, metadata?: Record<string, any>): Promise<void> {
    await this.trackInteraction(materialId, 'click', 2.0, metadata);
  }

  /**
   * Track when user saves a material to favorites
   */
  static async trackSave(materialId: string, metadata?: Record<string, any>): Promise<void> {
    await this.trackInteraction(materialId, 'save', 3.0, metadata);
  }

  /**
   * Track when user rates a material
   */
  static async trackRating(materialId: string, rating: number, metadata?: Record<string, any>): Promise<void> {
    await this.trackInteraction(materialId, 'rate', rating, metadata);
  }

  /**
   * Track when user adds material to quote
   */
  static async trackAddToQuote(materialId: string, metadata?: Record<string, any>): Promise<void> {
    await this.trackInteraction(materialId, 'add_to_quote', 4.0, metadata);
  }

  /**
   * Track when user shares a material
   */
  static async trackShare(materialId: string, metadata?: Record<string, any>): Promise<void> {
    await this.trackInteraction(materialId, 'share', 3.0, metadata);
  }

  /**
   * Get personalized recommendations for current user
   */
  static async getRecommendationsForUser(
    limit: number = 20,
    algorithm: 'user_user' | 'item_item' | 'hybrid' = 'user_user',
  ): Promise<Recommendation[]> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];

      const workspaceId = localStorage.getItem('current_workspace_id');
      if (!workspaceId) return [];

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/recommendations-api/for-user?workspace_id=${workspaceId}&limit=${limit}&algorithm=${algorithm}`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        },
      );

      if (!response.ok) {
        console.error('Failed to fetch recommendations:', await response.text());
        return [];
      }

      const { data } = await response.json();
      return data || [];
    } catch (error) {
      console.error('Error fetching recommendations:', error);
      return [];
    }
  }

  /**
   * Get materials similar to a specific material
   */
  static async getSimilarMaterials(materialId: string, limit: number = 10): Promise<Recommendation[]> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];

      const workspaceId = localStorage.getItem('current_workspace_id');
      if (!workspaceId) return [];

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/recommendations-api/similar-materials/${materialId}?workspace_id=${workspaceId}&limit=${limit}`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        },
      );

      if (!response.ok) {
        console.error('Failed to fetch similar materials:', await response.text());
        return [];
      }

      const { data } = await response.json();
      return data || [];
    } catch (error) {
      console.error('Error fetching similar materials:', error);
      return [];
    }
  }
}

