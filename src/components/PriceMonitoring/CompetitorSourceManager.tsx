/**
 * Competitor Source Manager
 * UI to add, edit, and remove competitor URLs for price monitoring
 */

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Plus, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

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
  const [sourceName, setSourceName] = useState('');
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

    if (!sourceName.trim()) {
      setError('Please enter a source name');
      return;
    }

    try {
      setIsSubmitting(true);

      const { error: insertError } = await supabase
        .from('competitor_sources')
        .insert({
          product_id: productId,
          source_name: sourceName.trim(),
          source_url: sourceUrl.trim(),
          is_active: true,
        });

      if (insertError) throw insertError;

      // Reset form
      setSourceName('');
      setSourceUrl('');
      
      // Notify parent
      if (onSourceAdded) {
        onSourceAdded();
      }

      onClose();
    } catch (err) {
      console.error('Failed to add competitor source:', err);
      setError('Failed to add competitor source. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSourceName('');
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
            <Label htmlFor="source-name">Source Name</Label>
            <Input
              id="source-name"
              placeholder="e.g., Amazon, Competitor Store"
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              required
            />
          </div>

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

