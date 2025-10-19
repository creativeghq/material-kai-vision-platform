import React, { useState } from 'react';
import { QuoteRequestService, QuoteRequest } from '../../services/quote/QuoteRequestService';
import { ShoppingCartService, CartWithItems } from '../../services/shopping/ShoppingCartService';

interface QuoteRequestFormProps {
  cartId: string;
  workspaceId?: string;
  onSuccess?: (quoteRequest: QuoteRequest) => void;
  onError?: (error: string) => void;
}

export const QuoteRequestForm: React.FC<QuoteRequestFormProps> = ({
  cartId,
  workspaceId,
  onSuccess,
  onError,
}) => {
  const [cart, setCart] = useState<CartWithItems | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const quoteService = new QuoteRequestService();
  const cartService = new ShoppingCartService();

  React.useEffect(() => {
    loadCart();
  }, [cartId]);

  const loadCart = async () => {
    try {
      const cartData = await cartService.getCart(cartId);
      setCart(cartData);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load cart';
      setError(errorMsg);
      onError?.(errorMsg);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!cart || !cart.items || cart.items.length === 0) {
      const errorMsg = 'Cart is empty';
      setError(errorMsg);
      onError?.(errorMsg);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const quoteRequest = await quoteService.submitRequest(
        cartId,
        workspaceId,
        notes
      );

      setSuccess(true);
      setNotes('');
      onSuccess?.(quoteRequest);

      // Reset success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to submit quote request';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  if (!cart) {
    return <div className="p-4">Loading...</div>;
  }

  const items = cart.items || [];
  const total = cartService.calculateTotal(items);

  return (
    <div className="w-full max-w-2xl mx-auto p-4">
      <h2 className="text-2xl font-bold mb-4">Request Quote</h2>

      {success && (
        <div className="mb-4 p-4 bg-green-100 text-green-700 rounded-lg">
          ✅ Quote request submitted successfully!
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg">
          ❌ {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Cart Summary */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="font-bold mb-3">Cart Summary</h3>
          <div className="space-y-2 mb-4">
            {items.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span>{item.product_id}</span>
                <span>
                  {item.quantity} × ${(item.unit_price || 0).toFixed(2)} = $
                  {((item.unit_price || 0) * item.quantity).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t pt-2 flex justify-between font-bold">
            <span>Total:</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Additional Notes (Optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add any special requests or notes for your quote..."
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={4}
          />
        </div>

        {/* Submit Button */}
        <div className="flex gap-4">
          <button
            type="submit"
            disabled={loading || items.length === 0}
            className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium"
          >
            {loading ? 'Submitting...' : 'Submit Quote Request'}
          </button>
          <button
            type="button"
            onClick={() => setNotes('')}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
          >
            Clear
          </button>
        </div>

        {/* Info */}
        <div className="text-sm text-gray-600 bg-blue-50 p-3 rounded-lg">
          <p>
            📋 Your quote request will be reviewed by our team. You'll receive a
            proposal with pricing within 24 hours.
          </p>
        </div>
      </form>
    </div>
  );
};

export default QuoteRequestForm;

