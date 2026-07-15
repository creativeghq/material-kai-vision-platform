/**
 * Competitor Source Manager
 * UI to add a custom retailer URL ("Custom Monitoring"). Backed by a
 * mode='url-only' tracked_queries row — Firecrawl re-verifies it on every
 * refresh, no Perplexity discovery cost.
 */

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Alert, AlertDescription } from '@/components/core/ui/alert';
import { AlertCircle } from 'lucide-react';
import { addUrlOnly } from '@/services/priceMonitoringApi';

interface CompetitorSourceManagerProps {
  productId: string;
  isOpen: boolean;
  onClose: () => void;
  onSourceAdded?: () => void;
}

export const CompetitorSourceManager: React.FC<CompetitorSourceManagerProps> = ({
  productId,
  isOpen,
  onClose,
  onSourceAdded,
}) => {
  const [sourceUrl, setSourceUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate URL
    try {
      new URL(sourceUrl);
    } catch {
      setError('Please enter a valid URL');
      return;
    }

    try {
      setIsSubmitting(true);
      // Custom monitoring = mode='url-only' tracked_query. Firecrawl verifies
      // the URL on every refresh; no Perplexity discovery cost. The retailer
      // name is derived from the URL host on read — no separate name input.
      await addUrlOnly({ productId, url: sourceUrl.trim() });

      // Reset form
      setSourceUrl('');

      // Notify parent
      if (onSourceAdded) {
        onSourceAdded();
      }

      onClose();
    } catch (err) {
      console.error('Failed to add custom retailer URL:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to add custom retailer URL. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSourceUrl('');
    setError(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Competitor Source</DialogTitle>
          <DialogDescription>
            Add a competitor URL to monitor prices for this product
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="source-url">Product URL</Label>
            <Input
              id="source-url"
              type="url"
              placeholder="https://example.com/product/..."
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              required
            />
            <p className="text-xs text-gray-500">
              Enter the full URL of the product page on the competitor's website
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Adding...' : 'Add Source'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CompetitorSourceManager;

