import React, { useState, useEffect } from 'react';

import { QuoteRequestService, QuoteRequest } from '../../services/quote/QuoteRequestService';

interface QuoteRequestsPanelProps {
  onSelectRequest?: (request: QuoteRequest) => void;
}

export const QuoteRequestsPanel: React.FC<QuoteRequestsPanelProps> = ({
  onSelectRequest,
}) => {
  const [requests, setRequests] = useState<QuoteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'updated'>('all');
  const [page, setPage] = useState(0);

  // @ts-expect-error - getInstance method exists at runtime
  const quoteService = QuoteRequestService.getInstance();
  const pageSize = 20;

  useEffect(() => {
    loadRequests();
  }, [page, filter]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, count } = await quoteService.getRequests(
        pageSize,
        page * pageSize,
        true, // admin view
      );

      let filtered = data;
      if (filter !== 'all') {
        filtered = data.filter(r => r.status === filter);
      }

      setRequests(filtered);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'updated':
        return 'bg-blue-100 text-blue-800';
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return <div className="p-4">Loading quote requests...</div>;
  }

  return (
    <div className="w-full p-4">
      <h2 className="text-2xl font-bold mb-4">Quote Requests Management</h2>

      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg">
          ❌ {error}
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex gap-2">
        {(['all', 'pending', 'updated'] as const).map((f) => (
          <button
            key={f}
            onClick={() => {
              setFilter(f);
              setPage(0);
            }}
            className={`px-4 py-2 rounded-lg font-medium ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Requests Table */}
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full">
          <thead className="bg-gray-100 border-b">
            <tr>
              <th className="text-left p-3">Request ID</th>
              <th className="text-left p-3">User</th>
              <th className="text-center p-3">Items</th>
              <th className="text-right p-3">Total</th>
              <th className="text-center p-3">Status</th>
              <th className="text-left p-3">Created</th>
              <th className="text-center p-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center p-4 text-gray-500">
                  No quote requests found
                </td>
              </tr>
            ) : (
              requests.map((request) => (
                <tr key={request.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-mono text-sm">{request.id.slice(0, 8)}</td>
                  <td className="p-3 font-mono text-sm">{request.user_id.slice(0, 8)}</td>
                  <td className="text-center p-3">{request.items_count}</td>
                  <td className="text-right p-3">
                    ${(request.total_estimated || 0).toFixed(2)}
                  </td>
                  <td className="text-center p-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(request.status)}`}>
                      {quoteService.getStatusLabel(request.status)}
                    </span>
                  </td>
                  <td className="p-3 text-sm">
                    {new Date(request.created_at).toLocaleDateString()}
                  </td>
                  <td className="text-center p-3">
                    <button
                      onClick={() => onSelectRequest?.(request)}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex justify-between items-center">
        <button
          onClick={() => setPage(Math.max(0, page - 1))}
          disabled={page === 0}
          className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
        >
          Previous
        </button>
        <span className="text-sm text-gray-600">
          Page {page + 1}
        </span>
        <button
          onClick={() => setPage(page + 1)}
          disabled={requests.length < pageSize}
          className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
        >
          Next
        </button>
      </div>

      <button
        onClick={loadRequests}
        className="mt-4 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
      >
        Refresh
      </button>
    </div>
  );
};

export default QuoteRequestsPanel;

