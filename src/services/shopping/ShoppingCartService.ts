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
export class ShoppingCartService {
  private apiService: SupabaseApiService;

  constructor() {
    this.apiService = new SupabaseApiService();
  }

  /**
   * Create a new shopping cart
   */
  async createCart(workspaceId?: string): Promise<Cart> {
    try {
      const response = await this.apiService.call<
        { workspace_id?: string },
        Cart
      >('shopping-cart-api', { workspace_id: workspaceId }, { method: 'POST' });

      return response as unknown as Cart;
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
        CartWithItems
      >('shopping-cart-api', { cart_id: cartId }, { method: 'GET' });

      return response as unknown as CartWithItems;
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
        CartItem
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

      return response as unknown as CartItem;
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
      await this.apiService.call<
        { cart_id: string; item_id: string },
        { success: boolean }
      >(
        'shopping-cart-api',
        { cart_id: cartId, item_id: itemId },
        { method: 'DELETE' }
      );
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
        Cart
      >(
        'shopping-cart-api',
        { cart_id: cartId, status },
        { method: 'PUT' }
      );

      return response as unknown as Cart;
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

