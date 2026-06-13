import React, { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/core/ui/alert-dialog';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ResetPlatformDialogProps {
  trigger?: React.ReactNode;
}

export const ResetPlatformDialog: React.FC<ResetPlatformDialogProps> = ({ trigger }) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const handleReset = async () => {
    if (confirmText !== 'RESET PLATFORM') {
      toast({
        title: 'Confirmation Required',
        description: 'Please type "RESET PLATFORM" to confirm',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      // Call the reset script via Supabase Edge Function
      const { data, error } = await supabase.functions.invoke('reset-platform', {
        body: { confirm: true },
      });

      if (error) throw error;

      toast({
        title: 'Platform Reset Complete',
        description: `Successfully reset platform. ${data?.summary || ''}`,
      });

      setOpen(false);
      setConfirmText('');

      // Reload the page after 2 seconds to reflect changes
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (error: any) {
      console.error('Reset platform error:', error);
      toast({
        title: 'Reset Failed',
        description: error.message || 'Failed to reset platform',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {trigger || (
          <Button
            variant="ghost"
            className="flex items-center gap-2 px-3 py-1 text-sm hover:bg-white/10"
          >
            <RefreshCw className="h-4 w-4" />
            Reset Platform
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-destructive/10">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <AlertDialogTitle className="text-xl">Reset Platform Data</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-left space-y-4 pt-4">
            <p className="font-semibold text-foreground">
              ⚠️ This action will permanently delete the following data:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>Agent Chat (conversations, messages, uploaded files)</li>
              <li>Background Agent runs, logs, checkpoints, memories &amp; tool-call history</li>
              <li>Flow Engine runs &amp; step history</li>
              <li>Quotes System (quotes, items, timeline, upsells, status tags, activity &amp; analytics)</li>
              <li>Moodboards &amp; Presentation Sheets (moodboards, items, products, comments, sheets)</li>
              <li>Catalogs (generated catalogs, source PDFs, access/email/view logs)</li>
              <li>Projects &amp; Client Views (projects, rooms, tasks, events, client-view deliverables &amp; feedback)</li>
              <li>Designer module (projects, materials, assets)</li>
              <li>Storefront carts (shopping carts &amp; cart items)</li>
              <li>Social post content &amp; Messaging conversations (connection tokens are kept)</li>
              <li>3D / Video / VR generation history (incl. WorldLabs VR worlds)</li>
              <li>Analytics (events, manufacturer analytics, quality &amp; recommendation metrics)</li>
              <li>User behavior profiles &amp; personalization state</li>
              <li>Search caches &amp; derived state (suggestions, trending, query understanding, similarity cache, duplicate detection)</li>
              <li>Document Entities &amp; Relationships (product-document, chunk-product, chunk-image)</li>
              <li>PDF Processing (jobs, checkpoints, progress, queues, batch jobs)</li>
              <li>Products &amp; Materials Catalog (products, images, properties, categories, visual analysis)</li>
              <li>Document Data (chunks, embeddings, images, documents, OCR, spatial &amp; layout analysis)</li>
              <li>Surya Layout Data (layout regions, extracted tables)</li>
              <li>Chunk derivatives (boundaries, classifications, quality flags, validation scores)</li>
              <li><strong>VECS Vector Collections</strong> (visual/SLIG, color, texture, style, material, <strong>understanding</strong>)</li>
              <li>Processing Results &amp; Quality Data</li>
              <li>Web Scraping (sessions, pages, temp materials)</li>
              <li>Data Import (jobs, history)</li>
              <li>AI / API / webhook call logs (ai_call_logs, ai_usage_logs, api_usage_logs, mivaa_api_usage_logs, webhook_calls)</li>
              <li>Public lead-gen tools cache &amp; logs; pipeline &amp; OCR metrics</li>
              <li>Storage files (<strong>pdf-tiles</strong> and <strong>generation-images</strong> buckets; catalog/quote/client-view output in pdf-documents is orphan-reaped)</li>
              <li><strong>MIVAA server /tmp folder</strong> (leftover PDFs, image extractions, processing cache)</li>
            </ul>

            <p className="font-semibold text-foreground pt-2">
              ✅ The following data will be PRESERVED:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li><strong>Knowledge Base &amp; Documentation</strong> (kb_docs, categories, attachments, search analytics) — fully preserved</li>
              <li><strong>Anything locked</strong> — any row marked <span className="font-mono">is_locked</span> is never deleted, in any table</li>
              <li>Users, Profiles &amp; Workspaces</li>
              <li>CRM (contacts, companies, relationships)</li>
              <li>Credits &amp; Billing (user_credits, transactions, packages)</li>
              <li><strong>Finance &amp; Fiscal (legally retained)</strong> — invoices, credit notes, payments, supplier bills, POS sessions, time entries, stock movements, delivery/purchase orders, document numbering series, AADE/myDATA fiscal submissions &amp; connectors</li>
              <li><strong>Secrets &amp; API keys</strong> (platform secrets, customer API keys, material KAI keys)</li>
              <li><strong>Mention, Job &amp; SEO Monitoring</strong> (tracked subjects, history, classifier caches — long-running customer-facing state)</li>
              <li><strong>Social &amp; Messaging connections</strong> (OAuth/WhatsApp account tokens, channels, opt-outs)</li>
              <li>Prompts &amp; extraction prompts (admin-managed); prompt_history is trimmed to the 5 most recent edits per prompt</li>
              <li>Background agent definitions &amp; flow definitions (admin-managed)</li>
              <li>Global Upsells &amp; Timeline Steps (admin-managed)</li>
              <li>Roles, permissions &amp; RBAC</li>
              <li>AI model pricing, subscription plans, webhook endpoints</li>
              <li>PDF files in pdf-documents bucket</li>
              <li><strong>System Settings &amp; Configuration</strong> (quote expiration, PDF template, company details, VAT rate)</li>
              <li><strong>Uploaded branding &amp; template images</strong> (business/invoice logo, invoice &amp; statement template covers/footers, quote &amp; catalog templates)</li>
              <li><strong>User Avatars</strong> (profile pictures in profile-avatars)</li>
              <li><strong>Price Monitoring</strong> (tracked queries, competitor sources, price history, alert log, classifier cache, brand-retailer index, extraction recipes — long-running trend data and customer-facing API state)</li>
            </ul>

            <div className="pt-4 space-y-2">
              <label className="text-sm font-medium text-foreground">
                Type <span className="font-mono bg-muted px-2 py-1 rounded">RESET PLATFORM</span> to confirm:
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="w-full px-3 py-2 border rounded-md bg-background"
                placeholder="RESET PLATFORM"
                disabled={loading}
              />
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleReset}
            disabled={loading || confirmText !== 'RESET PLATFORM'}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Resetting...
              </>
            ) : (
              'Reset Platform'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

