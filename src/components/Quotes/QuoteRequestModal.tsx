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
import { QuoteWithItems } from '@/services/quotes/QuotesService';

interface QuoteRequestModalProps {
  quote: QuoteWithItems;
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
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-2xl">Quote Request Details</DialogTitle>
              <DialogDescription className="mt-1">
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
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
            <h3 className="text-lg font-medium mb-3 text-gray-900">Summary</h3>

            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center bg-blue-50 rounded-lg"
                style={{
                  width: '2rem',
                  height: '2rem',
                }}
              >
                <Package className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-gray-600 text-sm">Items</p>
                <p className="font-medium text-gray-900">{quote.items?.length || 0} items</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center bg-blue-50 rounded-lg" style={{ width: '2rem', height: '2rem' }}>
                <FileText className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-gray-600 text-sm">Quote Name</p>
                <p className="text-lg font-semibold text-gray-900">
                  {quote.name || 'Untitled Quote'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center bg-blue-50 rounded-lg" style={{ width: '2rem', height: '2rem' }}>
                <Calendar className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-gray-600 text-sm">Created</p>
                <p className="font-medium text-gray-900">{formatDate(quote.created_at)}</p>
              </div>
            </div>

            {quote.updated_at !== quote.created_at && (
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center bg-blue-50 rounded-lg" style={{ width: '2rem', height: '2rem' }}>
                  <Calendar className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-gray-600 text-sm">Last Updated</p>
                  <p className="font-medium text-gray-900">{formatDate(quote.updated_at)}</p>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          {quote.notes && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-medium mb-2 text-gray-900">Notes</h3>
              <p className="text-gray-700 whitespace-pre-wrap">{quote.notes}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1"
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

