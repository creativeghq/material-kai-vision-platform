import React from 'react';
import { X, Calendar, FileText, Package } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { QuoteRequest } from '@/services/quotes.service';

interface QuoteRequestModalProps {
  quote: QuoteRequest;
  onClose: () => void;
  onUpdate: () => void;
}

export const QuoteRequestModal: React.FC<QuoteRequestModalProps> = ({
  quote,
  onClose,
}) => {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatPrice = (price?: number) => {
    if (!price) return 'Not estimated';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
  };

  const getStatusColor = (status: string) => {
    const colors = {
      pending: 'bg-[hsl(var(--badge-pending-bg))] text-[hsl(var(--badge-pending-text))] border-[hsl(var(--badge-pending-border))]',
      updated: 'bg-[hsl(var(--badge-updated-bg))] text-[hsl(var(--badge-updated-text))] border-[hsl(var(--badge-updated-border))]',
      approved: 'bg-[hsl(var(--badge-approved-bg))] text-[hsl(var(--badge-approved-text))] border-[hsl(var(--badge-approved-border))]',
      rejected: 'bg-[hsl(var(--badge-rejected-bg))] text-[hsl(var(--badge-rejected-text))] border-[hsl(var(--badge-rejected-border))]',
    };
    return colors[status as keyof typeof colors] || colors.pending;
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-white/20 text-white max-w-2xl">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-2xl">Quote Request Details</DialogTitle>
              <DialogDescription className="text-white/60 mt-1">
                Request ID: {quote.id}
              </DialogDescription>
            </div>
            <Badge variant="secondary" className={getStatusColor(quote.status)}>
              {quote.status}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Summary */}
          <div className="bg-white/5 rounded-lg p-4 space-y-3">
            <h3 className="text-lg font-semibold text-white mb-3">Summary</h3>

            <div className="flex items-center gap-3">
              <Package className="h-5 w-5 text-purple-400" />
              <div>
                <p className="text-white/60 text-sm">Items</p>
                <p className="text-white">{quote.items_count || 0} items</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-purple-400" />
              <div>
                <p className="text-white/60 text-sm">Estimated Total</p>
                <p className="text-white text-lg font-semibold">
                  {formatPrice(quote.total_estimated)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-purple-400" />
              <div>
                <p className="text-white/60 text-sm">Created</p>
                <p className="text-white">{formatDate(quote.created_at)}</p>
              </div>
            </div>

            {quote.updated_at !== quote.created_at && (
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-purple-400" />
                <div>
                  <p className="text-white/60 text-sm">Last Updated</p>
                  <p className="text-white">{formatDate(quote.updated_at)}</p>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          {quote.notes && (
            <div className="bg-white/5 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-white mb-2">Notes</h3>
              <p className="text-white/80 whitespace-pre-wrap">{quote.notes}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1 border-white/20 text-white hover:bg-white/10"
            >
              Close
            </Button>
            {quote.status === 'pending' && (
              <Button
                onClick={() => {
                  // TODO: Navigate to proposals or contact admin
                  onClose();
                }}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
              >
                View Proposals
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

