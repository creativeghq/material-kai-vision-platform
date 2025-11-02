import React, { useState, useEffect } from 'react';

import {
  ShoppingCartService,
  CartWithItems,
  CartItem,
} from '../../services/shopping/ShoppingCartService';

interface ShoppingCartProps {
  cartId: string;
  onRequestQuote?: (cartId: string) => void;
  onItemRemoved?: (itemId: string) => void;
}

export const ShoppingCart: React.FC<ShoppingCartProps> = ({
  cartId,
  onRequestQuote,
  onItemRemoved,
}) => {
  const [cart, setCart] = useState<CartWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cartService = new ShoppingCartService();

  useEffect(() => {
    loadCart();
  }, [cartId]);

  const loadCart = async () => {
    try {
      setLoading(true);
      setError(null);
      const cartData = await cartService.getCart(cartId);
      setCart(cartData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cart');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    try {
      await cartService.removeItem(cartId, itemId);
      await loadCart();
      onItemRemoved?.(itemId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove item');
    }
  };

  const handleRequestQuote = () => {
    if (cart && cart.items && cart.items.length > 0) {
      onRequestQuote?.(cartId);
    }
  };

  if (loading) {
    return <div className="p-4">Loading cart...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-600">Error: {error}</div>;
  }

  if (!cart) {
    return <div className="p-4">Cart not found</div>;
  }

  const items = cart.items || [];
  const total = cartService.calculateTotal(items);

  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      <h2 className="text-2xl font-bold mb-4">Shopping Cart</h2>

      {items.length === 0 ? (
        <div className="text-center py-8 text-gray-500">Your cart is empty</div>
      ) : (
        <>
          <div className="overflow-x-auto mb-6">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100 border-b">
                  <th className="text-left p-3">Product</th>
                  <th className="text-center p-3">Quantity</th>
                  <th className="text-right p-3">Unit Price</th>
                  <th className="text-right p-3">Total</th>
                  <th className="text-center p-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: CartItem) => (
                  <tr key={item.id} className="border-b hover:bg-gray-50">
                    <td className="p-3">{item.product_id}</td>
                    <td className="text-center p-3">{item.quantity}</td>
                    <td className="text-right p-3">
                      ${(item.unit_price || 0).toFixed(2)}
                    </td>
                    <td className="text-right p-3">
                      ${((item.unit_price || 0) * item.quantity).toFixed(2)}
                    </td>
                    <td className="text-center p-3">
                      <button
                        onClick={() => handleRemoveItem(item.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleRemoveItem(item.id);
                          }
                        }}
                        className="text-red-600 hover:text-red-800 font-medium"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="font-medium">Subtotal:</span>
              <span>${total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-lg font-bold border-t pt-2">
              <span>Total:</span>
              <span>${total.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={handleRequestQuote}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleRequestQuote();
                }
              }}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 font-medium"
            >
              Request Quote
            </button>
            <button
              onClick={loadCart}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  loadCart();
                }
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
            >
              Refresh
            </button>
          </div>

          <div className="mt-4 text-sm text-gray-600">
            <p>Items in cart: {items.length}</p>
            <p>Cart Status: {cart.status}</p>
          </div>
        </>
      )}
    </div>
  );
};

export default ShoppingCart;
