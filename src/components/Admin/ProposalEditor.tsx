import React, { useState, useEffect } from 'react';

import { ProposalsService, Proposal, ProposalItem } from '../../services/quote/ProposalsService';
import { QuoteRequestService, QuoteRequest } from '../../services/quote/QuoteRequestService';

interface ProposalEditorProps {
  quoteRequestId: string;
  onSave?: (proposal: Proposal) => void;
  onError?: (error: string) => void;
}

export const ProposalEditor: React.FC<ProposalEditorProps> = ({
  quoteRequestId,
  onSave,
  onError,
}) => {
  const [quoteRequest, setQuoteRequest] = useState<QuoteRequest | null>(null);
  const [subtotal, setSubtotal] = useState(0);
  const [tax, setTax] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // @ts-expect-error - getInstance method exists at runtime
  const proposalService = ProposalsService.getInstance();
  // @ts-expect-error - getInstance method exists at runtime
  const quoteService = QuoteRequestService.getInstance();

  useEffect(() => {
    loadQuoteRequest();
  }, [quoteRequestId]);

  const loadQuoteRequest = async () => {
    try {
      setLoading(true);
      setError(null);
      const request = await quoteService.getRequest(quoteRequestId);
      setQuoteRequest(request);
      setSubtotal(request.total_estimated || 0);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load quote request';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!quoteRequest) {
      const errorMsg = 'Quote request not found';
      setError(errorMsg);
      onError?.(errorMsg);
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // Create proposal items from quote request items
      // @ts-expect-error - items property exists at runtime
      const items: ProposalItem[] = (quoteRequest.items || []).map((item: any) => ({
        product_id: item.product_id,
        quantity: item.quantity || 1,
        unit_price: item.unit_price || 0,
        total: (item.unit_price || 0) * (item.quantity || 1),
      }));

      const proposal = await proposalService.createProposal(
        quoteRequestId,
        items,
        subtotal,
        tax,
        discount,
        notes,
      );

      setSuccess(true);
      onSave?.(proposal);

      // Reset success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to save proposal';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-4">Loading quote request...</div>;
  }

  if (!quoteRequest) {
    return <div className="p-4 text-red-600">Quote request not found</div>;
  }

  const total = proposalService.calculateTotal(subtotal, tax, discount);

  return (
    <div className="w-full max-w-2xl mx-auto p-4">
      <h2 className="text-2xl font-bold mb-4">Create Proposal</h2>

      {success && (
        <div className="mb-4 p-4 bg-green-100 text-green-700 rounded-lg">
          ✅ Proposal created successfully!
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg">
          ❌ {error}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Quote Request Info */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="font-bold mb-2">Quote Request Details</h3>
          <div className="text-sm space-y-1">
            <p><strong>Request ID:</strong> {quoteRequest.id.slice(0, 8)}</p>
            <p><strong>Items:</strong> {quoteRequest.items_count}</p>
            <p><strong>Estimated Total:</strong> ${(quoteRequest.total_estimated || 0).toFixed(2)}</p>
            {quoteRequest.notes && <p><strong>Notes:</strong> {quoteRequest.notes}</p>}
          </div>
        </div>

        {/* Pricing */}
        <div className="space-y-4">
          <h3 className="font-bold">Pricing</h3>

          <div>
            <label className="block text-sm font-medium mb-1">Subtotal</label>
            <input
              type="number"
              step="0.01"
              value={subtotal}
              onChange={(e) => setSubtotal(parseFloat(e.target.value) || 0)}
              className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Tax</label>
            <input
              type="number"
              step="0.01"
              value={tax}
              onChange={(e) => setTax(parseFloat(e.target.value) || 0)}
              className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Discount</label>
            <input
              type="number"
              step="0.01"
              value={discount}
              onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
              className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Total */}
          <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
            <div className="flex justify-between items-center text-lg font-bold">
              <span>Total:</span>
              <span>${total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium mb-2">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add any notes for the proposal..."
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={4}
          />
        </div>

        {/* Submit Button */}
        <div className="flex gap-4">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium"
          >
            {saving ? 'Saving...' : 'Create Proposal'}
          </button>
          <button
            type="button"
            onClick={() => {
              setSubtotal(quoteRequest.total_estimated || 0);
              setTax(0);
              setDiscount(0);
              setNotes('');
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
          >
            Reset
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProposalEditor;

