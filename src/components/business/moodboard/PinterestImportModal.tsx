/**
 * PinterestImportModal
 *
 * Allows users to import Pinterest pins into a moodboard.
 * Phase 1: Paste a pin URL → extract image → add to moodboard → auto-match materials
 * Board browsing was removed: it required Pinterest OAuth tokens in `social_accounts`,
 * whose token columns are gone (the table now belongs to Zernio). Zernio brokers the
 * account connection but exposes no board/pin read API, so there is nothing to browse
 * through. URL import needs no account and is what actually fills a moodboard.
 */

import React, { useState, useEffect } from 'react';
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
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2,
  Link2,
  Image,
  Check,
  ExternalLink,
  Plus,
  Search,
  Package,
} from 'lucide-react';
import { pinterestService, PinterestPin, PinterestImportResult } from '@/services/pinterestService';

interface PinterestImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  moodboardId: string;
  moodboardName?: string;
  onImportComplete?: () => void;
}

export const PinterestImportModal: React.FC<PinterestImportModalProps> = ({
  isOpen,
  onClose,
  moodboardId,
  moodboardName,
  onImportComplete,
}) => {
  const { toast } = useToast();

  // URL import state
  const [pinUrl, setPinUrl] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractedPin, setExtractedPin] = useState<PinterestPin | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<PinterestImportResult | null>(null);

  // Bulk URL import
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkUrls, setBulkUrls] = useState('');
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkResults, setBulkResults] = useState<{ imported: number; failed: number } | null>(null);

  // OAuth state

  useEffect(() => {
    if (isOpen) {
      // Reset state
      setPinUrl('');
      setExtractedPin(null);
      setImportResult(null);
      setBulkResults(null);
    }
  }, [isOpen]);



  // ── URL Extract ──

  const handleExtract = async () => {
    if (!pinUrl.trim()) return;
    if (!pinUrl.includes('pinterest')) {
      toast({ title: 'Invalid URL', description: 'Please paste a Pinterest pin URL', variant: 'destructive' });
      return;
    }
    try {
      setExtracting(true);
      setExtractedPin(null);
      setImportResult(null);
      const pin = await pinterestService.extractPin(pinUrl.trim());
      setExtractedPin(pin);
    } catch (err) {
      toast({ title: 'Extract Failed', description: err instanceof Error ? err.message : 'Could not extract pin data', variant: 'destructive' });
    } finally {
      setExtracting(false);
    }
  };

  const handleImport = async () => {
    if (!extractedPin) return;
    try {
      setImporting(true);
      const result = await pinterestService.importPin(pinUrl.trim(), moodboardId, true);
      setImportResult(result);
      toast({ title: 'Pin Imported', description: `"${extractedPin.title || 'Pin'}" added to your moodboard` });
      onImportComplete?.();
    } catch (err) {
      toast({ title: 'Import Failed', description: err instanceof Error ? err.message : 'Failed to import pin', variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  // ── Bulk Import ──

  const handleBulkImport = async () => {
    const urls = bulkUrls
      .split('\n')
      .map(u => u.trim())
      .filter(u => u.includes('pinterest'));

    if (urls.length === 0) {
      toast({ title: 'No Valid URLs', description: 'Enter at least one Pinterest URL', variant: 'destructive' });
      return;
    }

    try {
      setBulkImporting(true);
      const result = await pinterestService.importPinsBulk(urls, moodboardId, true);
      setBulkResults({ imported: result.imported, failed: result.failed });
      toast({ title: 'Bulk Import Complete', description: `${result.imported} pin(s) imported, ${result.failed} failed` });
      onImportComplete?.();
    } catch (err) {
      toast({ title: 'Bulk Import Failed', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' });
    } finally {
      setBulkImporting(false);
    }
  };

  // ── Board browsing (Phase 2) ──



  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-red-600 fill-current">
              <path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z" />
            </svg>
            Import from Pinterest
          </DialogTitle>
          <DialogDescription>
            {moodboardName ? `Import pins into "${moodboardName}"` : 'Import Pinterest pins into your moodboard'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Toggle: Single URL vs Bulk */}
          <div className="flex gap-2">
            <Button
              variant={!bulkMode ? 'default' : 'outline'}
              size="sm"
              className="rounded-full"
              onClick={() => setBulkMode(false)}
            >
              <Link2 className="h-3.5 w-3.5 mr-1.5" />
              Single pin
            </Button>
            <Button
              variant={bulkMode ? 'default' : 'outline'}
              size="sm"
              className="rounded-full"
              onClick={() => setBulkMode(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Bulk import
            </Button>
          </div>

          {!bulkMode ? (
            /* ── Single Pin URL Import ── */
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Pinterest Pin URL</Label>
                <div className="flex gap-2">
                  <Input
                    value={pinUrl}
                    onChange={e => setPinUrl(e.target.value)}
                    placeholder="https://www.pinterest.com/pin/123456789/"
                    onKeyDown={e => e.key === 'Enter' && handleExtract()}
                  />
                  <Button onClick={handleExtract} disabled={extracting || !pinUrl.trim()} className="rounded-full flex-shrink-0">
                    {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Extracted pin preview */}
              {extractedPin && (
                <div className="rounded-xl border border-border/60 overflow-hidden">
                  {extractedPin.image_url && (
                    <div className="aspect-video bg-muted overflow-hidden">
                      <img src={extractedPin.image_url} alt={extractedPin.title || 'Pinterest pin'} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="p-3 space-y-2">
                    {extractedPin.title && <p className="text-sm font-medium">{extractedPin.title}</p>}
                    {extractedPin.author && <p className="text-xs text-muted-foreground">by {extractedPin.author}</p>}
                    <Button onClick={handleImport} disabled={importing} className="w-full rounded-full">
                      {importing ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importing...</>
                      ) : (
                        <><Image className="h-4 w-4 mr-2" />Import to Moodboard</>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* SEO context bridge (Wave 7) — when we have a pin title, surface
                  shortcuts to research the aesthetic on Google Trends, related
                  searches, and Pinterest itself via the KAI agent. Pure
                  navigation links — no live calls until the user clicks. */}
              {extractedPin?.title && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-primary">
                    <Search className="h-3 w-3" /> Research this aesthetic
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Pinterest is a visual-trend signal. See how this aesthetic ranks on Google,
                    Pinterest search, and Google Trends.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <a
                      href={`/agent-hub?agent=kai&q=${encodeURIComponent(`Research the keyword "${extractedPin.title}" — what's trending around this aesthetic?`)}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-[11px] bg-white/10 hover:bg-white/20 rounded-full px-2.5 py-1 inline-flex items-center gap-1">
                      Google research <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                    <a
                      href={`/agent-hub?agent=kai&q=${encodeURIComponent(`Pinterest search for "${extractedPin.title}"`)}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-[11px] bg-white/10 hover:bg-white/20 rounded-full px-2.5 py-1 inline-flex items-center gap-1">
                      Pinterest competitors <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                    <a
                      href={`/agent-hub?agent=kai&q=${encodeURIComponent(`Show me Google Trends for "${extractedPin.title}" over the past 12 months`)}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-[11px] bg-white/10 hover:bg-white/20 rounded-full px-2.5 py-1 inline-flex items-center gap-1">
                      Google Trends <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                    <a
                      href={`/agent-hub?agent=kai&q=${encodeURIComponent(`What are the related searches for "${extractedPin.title}"? Show me PAA questions too.`)}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-[11px] bg-white/10 hover:bg-white/20 rounded-full px-2.5 py-1 inline-flex items-center gap-1">
                      Related searches + PAA <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </div>
                </div>
              )}

              {/* Import result with matches */}
              {importResult?.success && (
                <div className="rounded-xl border border-green-200 bg-green-50 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-green-700">
                    <Check className="h-4 w-4" />
                    <span className="text-sm font-medium">Pin imported successfully!</span>
                  </div>
                  {importResult.matches && importResult.matches.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                        <Package className="h-3 w-3" />
                        Similar materials in your catalog:
                      </p>
                      <div className="space-y-1">
                        {importResult.matches.slice(0, 3).map((m, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs bg-white rounded-lg p-2 border border-border/40">
                            {/* Decorative: the product name is announced by the sibling span, so a duplicate
    image name would just be noise. (audit #302 finding 6) */}
                            {m.image_url && <img src={m.image_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />}
                            <span className="flex-1 truncate font-medium">{m.product_name}</span>
                            <Badge variant="secondary" className="text-[10px] rounded-full">{Math.round(m.similarity * 100)}%</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* ── Bulk Import ── */
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Pinterest URLs (one per line)</Label>
                <textarea
                  value={bulkUrls}
                  onChange={e => setBulkUrls(e.target.value)}
                  placeholder={'https://www.pinterest.com/pin/123456/\nhttps://www.pinterest.com/pin/789012/\nhttps://www.pinterest.com/pin/345678/'}
                  rows={5}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  {bulkUrls.split('\n').filter(u => u.trim().includes('pinterest')).length} valid URL(s) detected
                </p>
              </div>

              <Button onClick={handleBulkImport} disabled={bulkImporting} className="w-full rounded-full">
                {bulkImporting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importing...</>
                ) : (
                  <><Plus className="h-4 w-4 mr-2" />Import All Pins</>
                )}
              </Button>

              {bulkResults && (
                <div className="rounded-xl border border-green-200 bg-green-50 p-3">
                  <div className="flex items-center gap-2 text-green-700">
                    <Check className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      {bulkResults.imported} imported, {bulkResults.failed} failed
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </DialogContent>
    </Dialog>
  );
};
