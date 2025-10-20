import React, { useState, useEffect } from 'react';

import { CommissionService, Commission, CommissionSummary } from '../../services/moodboard/CommissionService';

interface CommissionTrackerProps {
  onRefresh?: () => void;
}

export const CommissionTracker: React.FC<CommissionTrackerProps> = ({
  onRefresh,
}) => {
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [summary, setSummary] = useState<CommissionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'paid'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date');

  const commissionService = new CommissionService();

  useEffect(() => {
    loadCommissions();
    // Refresh every 60 seconds
    const interval = setInterval(loadCommissions, 60000);
    return () => clearInterval(interval);
  }, []);

  const loadCommissions = async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await commissionService.getCommissions(100, 0);
      let filtered = result.data;

      if (filter !== 'all') {
        filtered = commissionService.filterByStatus(filtered, filter);
      }

      if (sortBy === 'date') {
        filtered = commissionService.sortByDate(filtered, false);
      } else {
        filtered = commissionService.sortByAmount(filtered, false);
      }

      setCommissions(filtered);
      setSummary(result.totals);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load commissions');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'approved':
        return 'bg-blue-100 text-blue-800';
      case 'paid':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return <div className="p-4">Loading commissions...</div>;
  }

  return (
    <div className="w-full max-w-6xl mx-auto p-4">
      <h2 className="text-2xl font-bold mb-4">Commission Tracker</h2>

      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg">
          ❌ {error}
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <p className="text-sm text-gray-600">Total Commission</p>
            <p className="text-2xl font-bold text-blue-600">
              {commissionService.formatAmount(summary.total_commission)}
            </p>
          </div>
          <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
            <p className="text-sm text-gray-600">Pending</p>
            <p className="text-2xl font-bold text-yellow-600">
              {commissionService.formatAmount(summary.pending_commission)}
            </p>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
            <p className="text-sm text-gray-600">Approved</p>
            <p className="text-2xl font-bold text-purple-600">
              {commissionService.formatAmount(summary.approved_commission)}
            </p>
          </div>
          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <p className="text-sm text-gray-600">Paid</p>
            <p className="text-2xl font-bold text-green-600">
              {commissionService.formatAmount(summary.paid_commission)}
            </p>
          </div>
        </div>
      )}

      {/* Filters and Sort */}
      <div className="mb-4 flex gap-2 flex-wrap">
        <div className="flex gap-2">
          {(['all', 'pending', 'approved', 'paid'] as const).map((f) => (
            <button
              key={f}
              onClick={() => {
                setFilter(f);
              }}
              className={`px-3 py-1 rounded text-sm font-medium ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex gap-2 ml-auto">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'date' | 'amount')}
            className="px-3 py-1 border border-gray-300 rounded text-sm"
          >
            <option value="date">Sort by Date</option>
            <option value="amount">Sort by Amount</option>
          </select>
        </div>
      </div>

      {/* Commissions Table */}
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full">
          <thead className="bg-gray-100 border-b">
            <tr>
              <th className="text-left p-3">Moodboard</th>
              <th className="text-left p-3">Requester</th>
              <th className="text-center p-3">Rate</th>
              <th className="text-right p-3">Amount</th>
              <th className="text-center p-3">Status</th>
              <th className="text-left p-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {commissions.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center p-4 text-gray-500">
                  No commissions found
                </td>
              </tr>
            ) : (
              commissions.map((commission) => (
                <tr key={commission.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-mono text-sm">
                    {commission.moodboard_id.slice(0, 8)}
                  </td>
                  <td className="p-3 font-mono text-sm">
                    {commission.requester_id.slice(0, 8)}
                  </td>
                  <td className="text-center p-3">
                    {commission.commission_percentage}%
                  </td>
                  <td className="text-right p-3 font-bold">
                    {commissionService.formatAmount(commission.commission_amount || 0)}
                  </td>
                  <td className="text-center p-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(commission.status)}`}>
                      {commissionService.getStatusLabel(commission.status)}
                    </span>
                  </td>
                  <td className="p-3 text-sm">
                    {new Date(commission.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <button
        onClick={() => {
          loadCommissions();
          onRefresh?.();
        }}
        className="mt-4 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
      >
        Refresh
      </button>
    </div>
  );
};

export default CommissionTracker;

