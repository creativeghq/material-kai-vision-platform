import { Singleton } from '../base/Singleton';
import { SupabaseApiService } from '../base/ApiService';

export interface MoodboardProduct {
  id: string;
  moodboard_id: string;
  product_id: string;
  position_x?: number;
  position_y?: number;
  notes?: string;
  added_at: string;
}

/**
 * Moodboard Products Service
 * Manages moodboard product operations through the moodboard-products-api Edge Function
 */
export class MoodboardProductsService extends Singleton {
  private apiService: SupabaseApiService;

  constructor() {
    super();
    this.apiService = SupabaseApiService.getInstance();
  }

  /**
   * Add product to moodboard
   */
  async addProduct(
    moodboardId: string,
    productId: string,
    positionX?: number,
    positionY?: number,
    notes?: string
  ): Promise<MoodboardProduct> {
    try {
      const response = await this.apiService.call<
        {
          moodboard_id: string;
          product_id: string;
          position_x?: number;
          position_y?: number;
          notes?: string;
        },
        { data: MoodboardProduct }
      >(
        'moodboard-products-api',
        {
          moodboard_id: moodboardId,
          product_id: productId,
          position_x: positionX,
          position_y: positionY,
          notes,
        },
        { method: 'POST' }
      );

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to add product to moodboard');
      }

      return response.data.data;
    } catch (error) {
      console.error('Error adding product to moodboard:', error);
      throw error;
    }
  }

  /**
   * Get products in moodboard
   */
  async getProducts(
    moodboardId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ data: MoodboardProduct[]; count: number }> {
    try {
      const response = await this.apiService.call<
        { moodboard_id: string; limit: number; offset: number },
        { data: MoodboardProduct[]; count: number }
      >(
        'moodboard-products-api',
        { moodboard_id: moodboardId, limit, offset },
        { method: 'GET' }
      );

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to get moodboard products');
      }

      return response.data;
    } catch (error) {
      console.error('Error getting moodboard products:', error);
      throw error;
    }
  }

  /**
   * Remove product from moodboard
   */
  async removeProduct(moodboardId: string, productId: string): Promise<void> {
    try {
      const response = await this.apiService.call<
        { moodboard_id: string; product_id: string },
        { success: boolean }
      >(
        'moodboard-products-api',
        { moodboard_id: moodboardId, product_id: productId },
        { method: 'DELETE' }
      );

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to remove product from moodboard');
      }
    } catch (error) {
      console.error('Error removing product from moodboard:', error);
      throw error;
    }
  }

  /**
   * Update product position in moodboard
   */
  async updatePosition(
    moodboardId: string,
    productId: string,
    positionX: number,
    positionY: number
  ): Promise<MoodboardProduct> {
    try {
      // Note: This would require an additional PATCH endpoint
      // For now, we'll remove and re-add with new position
      await this.removeProduct(moodboardId, productId);
      return this.addProduct(moodboardId, productId, positionX, positionY);
    } catch (error) {
      console.error('Error updating product position:', error);
      throw error;
    }
  }

  /**
   * Get product count in moodboard
   */
  async getProductCount(moodboardId: string): Promise<number> {
    try {
      const result = await this.getProducts(moodboardId, 1, 0);
      return result.count;
    } catch (error) {
      console.error('Error getting product count:', error);
      throw error;
    }
  }
}

export default MoodboardProductsService;

