import React, { useState } from 'react';
import { Share2, Copy, ExternalLink, Loader2, Link2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Switch } from '@/components/core/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/core/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { quotesService } from '../services/QuotesService';

/**
 * QuoteShareButton — lets a quote owner (or admin) turn on a public share link
 * and copy it. Backed by the `set_quote_public_share` RPC, so it works for the
 * customer on any quote status (not just draft). Mounted on the customer quote
 * detail page header next to the download buttons.
 */

interface Props {
  quoteId: string;
  enabled: boolean;
  token: string | null;
  /** Reload the parent quote after the share state changes. */
  onChange?: () => void;
  /** Header styling on the dark primary header (matches QuoteDownloadButtons headerMode). */
  headerMode?: boolean;
}

export const QuoteShareButton: React.FC<Props> = ({ quoteId, enabled, token, onChange }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const shareUrl =
    token && typeof window !== 'undefined' ? `${window.location.origin}/q/${token}` : null;

  const toggle = async (next: boolean) => {
    try {
      setBusy(true);
      await quotesService.setQuotePublicShare(quoteId, next);
      toast({
        title: next ? 'Share link enabled' : 'Share link disabled',
        description: next ? 'Anyone with the link can view this quote.' : 'The link no longer works.',
      });
      onChange?.();
    } catch (err) {
      console.error('Failed to toggle quote share:', err);
      toast({ title: 'Error', description: 'Could not update sharing.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const copy = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(
      () => toast({ title: 'Link copied', description: shareUrl }),
      () => toast({ title: 'Copy failed', variant: 'destructive' }),
    );
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-full gap-2">
          <Share2 className="h-4 w-4" />
          Share
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5" /> Public link
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Share a read-only view of this quote with anyone — no login needed.
              </p>
            </div>
            <div className="flex items-center gap-1.5 pt-0.5">
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              <Switch checked={enabled} onCheckedChange={toggle} disabled={busy} />
            </div>
          </div>

          {enabled && shareUrl && (
            <>
              <code className="block text-xs bg-muted/50 border rounded-md px-2 py-1.5 truncate">
                {shareUrl}
              </code>
              <div className="flex items-center gap-2">
                <Button size="sm" className="rounded-full gap-1 flex-1" onClick={copy}>
                  <Copy className="h-3.5 w-3.5" /> Copy link
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full gap-1"
                  onClick={() => window.open(shareUrl, '_blank')}
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open
                </Button>
              </div>
            </>
          )}

          {!enabled && (
            <p className="text-xs text-muted-foreground">
              Toggle on to generate a shareable link.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default QuoteShareButton;
