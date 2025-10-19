import { Singleton } from '../base/Singleton';
import { SupabaseApiService } from '../base/ApiService';

export interface Cart {
  id: string;
  user_id: string;
  workspace_id?: string;
  status: 'active' | 'submitted' | 'quoted' | 'ordered';
  total_items: number;
  created_at: string;
  updated_at: string;
}

export interface CartItem {
  id: string;
  cart_id: string;
  product_id: string;
  quantity: number;
  unit_price?: number;
  notes?: string;
  added_at: string;
}

export interface CartWithItems extends Cart {
  items?: CartItem[];
}

/**
 * Shopping Cart Service
 * Manages shopping cart operations through the shopping-cart-api Edge Function
 */
export class ShoppingCartService extends Singleton {
  private apiService: SupabaseApiService;

  constructor() {
    super();
    this.apiService = SupabaseApiService.getInstance();
  }

  /**
   * Create a new shopping cart
   */
  async createCart(workspaceId?: string): Promise<Cart> {
    try {
      const response = await this.apiService.call<
        { workspace_id?: string },
        { data: Cart }
      >('shopping-cart-api', { workspace_id: workspaceId }, { method: 'POST' });

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to create cart');
      }

      return response.data.data;
    } catch (error) {
      console.error('Error creating cart:', error);
      throw error;
    }
  }

  /**
   * Get cart details with items
   */
  async getCart(cartId: string): Promise<CartWithItems> {
    try {
      const response = await this.apiService.call<
        { cart_id: string },
        { data: CartWithItems }
      >('shopping-cart-api', { cart_id: cartId }, { method: 'GET' });

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to get cart');
      }

      return response.data.data;
    } catch (error) {
      console.error('Error getting cart:', error);
      throw error;
    }
  }

  /**
   * Add item to cart
   */
  async addItem(
    cartId: string,
    productId: string,
    quantity: number = 1,
    unitPrice?: number,
    notes?: string
  ): Promise<CartItem> {
    try {
      const response = await this.apiService.call<
        {
          cart_id: string;
          product_id: string;
          quantity: number;
          unit_price?: number;
          notes?: string;
        },
        { data: CartItem }
      >(
        'shopping-cart-api',
        {
          cart_id: cartId,
          product_id: productId,
          quantity,
          unit_price: unitPrice,
          notes,
        },
        { method: 'POST' }
      );

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to add item');
      }

      return response.data.data;
    } catch (error) {
      console.error('Error adding item to cart:', error);
      throw error;
    }
  }

  /**
   * Remove item from cart
   */
  async removeItem(cartId: string, itemId: string): Promise<void> {
    try {
      const response = await this.apiService.call<
        { cart_id: string; item_id: string },
        { success: boolean }
      >(
        'shopping-cart-api',
        { cart_id: cartId, item_id: itemId },
        { method: 'DELETE' }
      );

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to remove item');
      }
    } catch (error) {
      console.error('Error removing item from cart:', error);
      throw error;
    }
  }

  /**
   * Update cart status
   */
  async updateCart(cartId: string, status: string): Promise<Cart> {
    try {
      const response = await this.apiService.call<
        { cart_id: string; status: string },
        { data: Cart }
      >(
        'shopping-cart-api',
        { cart_id: cartId, status },
        { method: 'PATCH' }
      );

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to update cart');
      }

      return response.data.data;
    } catch (error) {
      console.error('Error updating cart:', error);
      throw error;
    }
  }

  /**
   * Calculate cart total
   */
  calculateTotal(items: CartItem[]): number {
    return items.reduce((total, item) => {
      return total + ((item.unit_price || 0) * item.quantity);
    }, 0);
  }

  /**
   * Get cart summary
   */
  async getCartSummary(cartId: string): Promise<{
    itemCount: number;
    total: number;
    items: CartItem[];
  }> {
    try {
      const cart = await this.getCart(cartId);
      const items = cart.items || [];
      const total = this.calculateTotal(items);

      return {
        itemCount: items.length,
        total,
        items,
      };
    } catch (error) {
      console.error('Error getting cart summary:', error);
      throw error;
    }
  }
}

export default ShoppingCartService;

