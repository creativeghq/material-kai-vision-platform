import React, { useState, useEffect } from 'react';
import { QuoteRequestService, QuoteRequest } from '../../services/quote/QuoteRequestService';
import { ProposalsService, Proposal } from '../../services/quote/ProposalsService';

interface QuoteStatusTrackerProps {
  userId?: string;
  onProposalAccepted?: (proposal: Proposal) => void;
}

export const QuoteStatusTracker: React.FC<QuoteStatusTrackerProps> = ({
  userId,
  onProposalAccepted,
}) => {
  const [quoteRequests, setQuoteRequests] = useState<QuoteRequest[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<QuoteRequest | null>(null);

  const quoteService = QuoteRequestService.getInstance();
  const proposalService = ProposalsService.getInstance();

  useEffect(() => {
    loadData();
    // Refresh every 30 seconds
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: requests } = await quoteService.getRequests(50, 0, false);
      setQuoteRequests(requests);

      const { data: props } = await proposalService.getProposals(50, 0);
      setProposals(props);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptProposal = async (proposal: Proposal) => {
    try {
      const updated = await proposalService.acceptProposal(proposal.id);
      setProposals(proposals.map(p => p.id === updated.id ? updated : p));
      onProposalAccepted?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept proposal');
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
      case 'sent':
        return 'bg-purple-100 text-purple-800';
      case 'accepted':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return <div className="p-4">Loading quote status...</div>;
  }

  return (
    <div className="w-full max-w-6xl mx-auto p-4">
      <h2 className="text-2xl font-bold mb-4">Quote Status Tracker</h2>

      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg">
          ❌ {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quote Requests */}
        <div>
          <h3 className="text-xl font-bold mb-3">Quote Requests</h3>
          {quoteRequests.length === 0 ? (
            <div className="text-gray-500 p-4">No quote requests</div>
          ) : (
            <div className="space-y-3">
              {quoteRequests.map((request) => (
                <div
                  key={request.id}
                  onClick={() => setSelectedRequest(request)}
                  className="p-4 border rounded-lg cursor-pointer hover:bg-gray-50"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-medium">Request #{request.id.slice(0, 8)}</span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(request.status)}`}>
                      {quoteService.getStatusLabel(request.status)}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">
                    <p>Items: {request.items_count}</p>
                    <p>Total: ${(request.total_estimated || 0).toFixed(2)}</p>
                    <p className="text-xs mt-1">
                      {new Date(request.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Proposals */}
        <div>
          <h3 className="text-xl font-bold mb-3">Proposals</h3>
          {proposals.length === 0 ? (
            <div className="text-gray-500 p-4">No proposals</div>
          ) : (
            <div className="space-y-3">
              {proposals.map((proposal) => (
                <div
                  key={proposal.id}
                  className="p-4 border rounded-lg bg-white"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-medium">Proposal #{proposal.id.slice(0, 8)}</span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(proposal.status)}`}>
                      {proposalService.getStatusLabel(proposal.status)}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 mb-3">
                    <p>Subtotal: ${(proposal.subtotal || 0).toFixed(2)}</p>
                    <p>Tax: ${(proposal.tax || 0).toFixed(2)}</p>
                    <p className="font-bold">Total: ${(proposal.total || 0).toFixed(2)}</p>
                  </div>
                  {proposal.status === 'sent' && (
                    <button
                      onClick={() => handleAcceptProposal(proposal)}
                      className="w-full bg-green-600 text-white py-2 px-3 rounded hover:bg-green-700 text-sm font-medium"
                    >
                      Accept Proposal
                    </button>
                  )}
                  {proposal.status === 'accepted' && (
                    <div className="text-green-600 text-sm font-medium">
                      ✅ Proposal Accepted
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Selected Request Details */}
      {selectedRequest && (
        <div className="mt-6 p-4 border rounded-lg bg-gray-50">
          <h3 className="font-bold mb-2">Request Details</h3>
          <div className="text-sm space-y-1">
            <p><strong>ID:</strong> {selectedRequest.id}</p>
            <p><strong>Status:</strong> {quoteService.getStatusLabel(selectedRequest.status)}</p>
            <p><strong>Items:</strong> {selectedRequest.items_count}</p>
            <p><strong>Total:</strong> ${(selectedRequest.total_estimated || 0).toFixed(2)}</p>
            <p><strong>Notes:</strong> {selectedRequest.notes || 'None'}</p>
            <p><strong>Created:</strong> {new Date(selectedRequest.created_at).toLocaleString()}</p>
          </div>
        </div>
      )}

      <button
        onClick={loadData}
        className="mt-4 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
      >
        Refresh
      </button>
    </div>
  );
};

export default QuoteStatusTracker;

