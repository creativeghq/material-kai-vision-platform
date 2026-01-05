import React, { useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { quotesService } from '@/services/quotes/QuotesService';

interface CreateQuoteModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (quoteId: string, quoteName: string) => void;
}

export const CreateQuoteModal: React.FC<CreateQuoteModalProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const { toast } = useToast();
  const [quoteName, setQuoteName] = useState('');
  const [notes, setNotes] = useState('');
  const [processing, setProcessing] = useState(false);

  const handleCreate = async () => {
    if (!quoteName.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a quote name',
        variant: 'destructive',
      });
      return;
    }

    try {
      setProcessing(true);
      const newQuote = await quotesService.createQuote({
        name: quoteName,
        notes: notes || undefined,
      });

      toast({
        title: 'Success',
        description: 'Quote created successfully',
      });

      onSuccess(newQuote.id, quoteName);
      setQuoteName('');
      setNotes('');
      onClose();
    } catch (error) {
      console.error('Error creating quote:', error);
      toast({
        title: 'Error',
        description: 'Failed to create quote',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Quote</DialogTitle>
          <DialogDescription>
            Create a new quote request. You can add products or a custom request after creation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div>
            <Label>Quote Name *</Label>
            <Input
              value={quoteName}
              onChange={(e) => setQuoteName(e.target.value)}
              placeholder="e.g., Office Renovation Materials"
              className="mt-1"
              disabled={processing}
            />
          </div>

          <div>
            <Label>Notes (Optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any additional notes about this quote..."
              className="mt-1"
              rows={3}
              disabled={processing}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1"
              disabled={processing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              className="flex-1"
              disabled={processing}
            >
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Quote
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

