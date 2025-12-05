import React, { useState } from 'react';
import { CheckCircle, XCircle, Calendar, DollarSign, Package, Loader2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { quotesService, Proposal } from '@/services/quotes.service';

interface ProposalDetailModalProps {
  proposal: Proposal;
  onClose: () => void;
  onUpdate: () => void;
}

export const ProposalDetailModal: React.FC<ProposalDetailModalProps> = ({
  proposal,
  onClose,
  onUpdate,
}) => {
  const { toast } = useToast();
  const [processing, setProcessing] = useState(false);

  const handleAccept = async () => {
    try {
      setProcessing(true);
      await quotesService.updateProposalStatus(proposal.id, 'accepted');
      toast({
        title: 'Success',
        description: 'Proposal accepted successfully',
      });
      onUpdate();
      onClose();
    } catch (error) {
      console.error('Error accepting proposal:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to accept proposal',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!confirm('Are you sure you want to reject this proposal?')) return;

    try {
      setProcessing(true);
      await quotesService.updateProposalStatus(proposal.id, 'rejected');
      toast({
        title: 'Success',
        description: 'Proposal rejected',
      });
      onUpdate();
      onClose();
    } catch (error) {
      console.error('Error rejecting proposal:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to reject proposal',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
  };

  const getStatusColor = (status: string) => {
    const colors = {
      draft: 'bg-[hsl(var(--badge-draft-bg))] text-[hsl(var(--badge-draft-text))] border-[hsl(var(--badge-draft-border))]',
      sent: 'bg-[hsl(var(--badge-sent-bg))] text-[hsl(var(--badge-sent-text))] border-[hsl(var(--badge-sent-border))]',
      accepted: 'bg-[hsl(var(--badge-approved-bg))] text-[hsl(var(--badge-approved-text))] border-[hsl(var(--badge-approved-border))]',
      rejected: 'bg-[hsl(var(--badge-rejected-bg))] text-[hsl(var(--badge-rejected-text))] border-[hsl(var(--badge-rejected-border))]',
    };
    return colors[status as keyof typeof colors] || colors.draft;
  };

  const canAcceptOrReject = proposal.status === 'sent';

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-white/20 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-2xl">Proposal Details</DialogTitle>
              <DialogDescription className="text-white/60 mt-1">
                Proposal ID: {proposal.id}
              </DialogDescription>
            </div>
            <Badge variant="secondary" className={getStatusColor(proposal.status)}>
              {proposal.status}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Summary */}
          <div className="bg-white/5 rounded-lg p-4 grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <DollarSign className="h-5 w-5 text-purple-400" />
              <div>
                <p className="text-white/60 text-sm">Subtotal</p>
                <p className="text-white font-semibold">{formatPrice(proposal.subtotal || 0)}</p>
              </div>
            </div>

            {proposal.tax && proposal.tax > 0 && (
              <div className="flex items-center gap-3">
                <DollarSign className="h-5 w-5 text-purple-400" />
                <div>
                  <p className="text-white/60 text-sm">Tax</p>
                  <p className="text-white font-semibold">{formatPrice(proposal.tax)}</p>
                </div>
              </div>
            )}

            {proposal.discount && proposal.discount > 0 && (
              <div className="flex items-center gap-3">
                <DollarSign className="h-5 w-5 text-green-400" />
                <div>
                  <p className="text-white/60 text-sm">Discount</p>
                  <p className="text-green-400 font-semibold">-{formatPrice(proposal.discount)}</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <DollarSign className="h-5 w-5 text-yellow-400" />
              <div>
                <p className="text-white/60 text-sm">Total</p>
                <p className="text-yellow-400 text-xl font-bold">{formatPrice(proposal.total || 0)}</p>
              </div>
            </div>
          </div>

          {/* Items */}
          {proposal.items && proposal.items.length > 0 && (
            <div className="bg-white/5 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <Package className="h-5 w-5" />
                Items ({proposal.items.length})
              </h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10">
                      <TableHead className="text-white/80">Product</TableHead>
                      <TableHead className="text-white/80 text-right">Quantity</TableHead>
                      <TableHead className="text-white/80 text-right">Unit Price</TableHead>
                      <TableHead className="text-white/80 text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {proposal.items.map((item, index) => (
                      <TableRow key={index} className="border-white/10">
                        <TableCell className="text-white/80">
                          {item.product_name || item.product_id}
                        </TableCell>
                        <TableCell className="text-white/80 text-right">{item.quantity}</TableCell>
                        <TableCell className="text-white/80 text-right">
                          {formatPrice(item.unit_price)}
                        </TableCell>
                        <TableCell className="text-white/80 text-right font-semibold">
                          {formatPrice(item.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Notes */}
          {proposal.notes && (
            <div className="bg-white/5 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-white mb-2">Notes</h3>
              <p className="text-white/80 whitespace-pre-wrap">{proposal.notes}</p>
            </div>
          )}

          {/* Metadata */}
          <div className="bg-white/5 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-white mb-3">Timeline</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-purple-400" />
                <span className="text-white/60 text-sm">Created:</span>
                <span className="text-white text-sm">{formatDate(proposal.created_at)}</span>
              </div>
              {proposal.sent_at && (
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-purple-400" />
                  <span className="text-white/60 text-sm">Sent:</span>
                  <span className="text-white text-sm">{formatDate(proposal.sent_at)}</span>
                </div>
              )}
              {proposal.accepted_at && (
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-green-400" />
                  <span className="text-white/60 text-sm">Accepted:</span>
                  <span className="text-white text-sm">{formatDate(proposal.accepted_at)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1 border-white/20 text-white hover:bg-white/10"
              disabled={processing}
            >
              Close
            </Button>
            {canAcceptOrReject && (
              <>
                <Button
                  onClick={handleReject}
                  variant="outline"
                  className="flex-1 border-red-500/20 text-red-400 hover:bg-red-500/10"
                  disabled={processing}
                >
                  {processing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4 mr-2" />
                  )}
                  Reject
                </Button>
                <Button
                  onClick={handleAccept}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  disabled={processing}
                >
                  {processing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  Accept
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

