import React, { useState, useEffect } from 'react';

import {
  MoodboardProductsService,
  MoodboardProduct,
} from '../../services/moodboard/MoodboardProductsService';

interface MoodboardProductSelectorProps {
  moodboardId: string;
  onProductAdded?: (product: MoodboardProduct) => void;
  onProductRemoved?: (productId: string) => void;
}

export const MoodboardProductSelector: React.FC<
  MoodboardProductSelectorProps
> = ({ moodboardId, onProductAdded, onProductRemoved }) => {
  const [products, setProducts] = useState<MoodboardProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newProductId, setNewProductId] = useState('');
  const [positionX, setPositionX] = useState(0);
  const [positionY, setPositionY] = useState(0);
  const [notes, setNotes] = useState('');
  const [adding, setAdding] = useState(false);

  const moodboardService = new MoodboardProductsService();

  useEffect(() => {
    loadProducts();
  }, [moodboardId]);

  const loadProducts = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await moodboardService.getProducts(moodboardId, 100, 0);
      setProducts(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newProductId.trim()) {
      setError('Please enter a product ID');
      return;
    }

    try {
      setAdding(true);
      setError(null);

      const product = await moodboardService.addProduct(
        moodboardId,
        newProductId,
        positionX,
        positionY,
        notes,
      );

      setProducts([...products, product]);
      setNewProductId('');
      setPositionX(0);
      setPositionY(0);
      setNotes('');
      onProductAdded?.(product);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add product');
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveProduct = async (productId: string) => {
    try {
      await moodboardService.removeProduct(moodboardId, productId);
      setProducts(products.filter((p) => p.product_id !== productId));
      onProductRemoved?.(productId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove product');
    }
  };

  if (loading) {
    return <div className="p-4">Loading products...</div>;
  }

  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      <h2 className="text-2xl font-bold mb-4">Moodboard Products</h2>

      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg">
          ❌ {error}
        </div>
      )}

      {/* Add Product Form */}
      <form
        onSubmit={handleAddProduct}
        className="mb-6 p-4 bg-gray-50 rounded-lg border"
      >
        <h3 className="font-bold mb-3">Add Product</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1">Product ID</label>
            <input
              type="text"
              value={newProductId}
              onChange={(e) => setNewProductId(e.target.value)}
              placeholder="Enter product ID"
              className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Position X</label>
            <input
              type="number"
              value={positionX}
              onChange={(e) => setPositionX(parseInt(e.target.value) || 0)}
              className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Position Y</label>
            <input
              type="number"
              value={positionY}
              onChange={(e) => setPositionY(parseInt(e.target.value) || 0)}
              className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Notes (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes"
              className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={adding}
          className="bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium"
        >
          {adding ? 'Adding...' : 'Add Product'}
        </button>
      </form>

      {/* Products List */}
      <div>
        <h3 className="font-bold mb-3">
          Products in Moodboard ({products.length})
        </h3>

        {products.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No products added yet
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {products.map((product) => (
              <div
                key={product.id}
                className="p-4 border rounded-lg bg-white hover:shadow-lg transition"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-bold">{product.product_id}</p>
                    <p className="text-sm text-gray-600">
                      Position: ({product.position_x}, {product.position_y})
                    </p>
                  </div>
                  <button
                    onClick={() => handleRemoveProduct(product.product_id)}
                    onKeyDown={(e) =>
                      e.key === 'Enter' &&
                      handleRemoveProduct(product.product_id)
                    }
                    className="text-red-600 hover:text-red-800 font-medium text-sm"
                  >
                    Remove
                  </button>
                </div>

                {product.notes && (
                  <p className="text-sm text-gray-600 mb-2">
                    <strong>Notes:</strong> {product.notes}
                  </p>
                )}

                <p className="text-xs text-gray-500">
                  Added: {new Date(product.added_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={loadProducts}
        onKeyDown={(e) => e.key === 'Enter' && loadProducts()}
        className="mt-4 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
      >
        Refresh
      </button>
    </div>
  );
};

export default MoodboardProductSelector;
