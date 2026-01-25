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
              <li>Quotes System (quotes, items, timeline, upsells, status tags)</li>
              <li>Moodboards (moodboards, items, products, quote requests)</li>
              <li>3D Generation History</li>
              <li>Analytics (events, quality metrics, scoring logs, recommendations)</li>
              <li>Document Entities & Relationships</li>
              <li>Relevancy Relationships (product-chunk, chunk-image, product-image)</li>
              <li>PDF Processing (jobs, checkpoints, progress, queues)</li>
              <li>Products & Materials Catalog (products, visual analysis)</li>
              <li>Document Data (chunks, embeddings, images, documents)</li>
              <li>YOLO Layout Data (layout regions, extracted tables)</li>
              <li>Processing Results & Quality Data</li>
              <li>Web Scraping (sessions, pages, temp materials)</li>
              <li>Data Import (jobs, history)</li>
              <li>Agent Tasks</li>
              <li>Storage files (pdf-tiles, material-images, moodboard-images, 3d-renders)</li>
            </ul>

            <p className="font-semibold text-foreground pt-2">
              ✅ The following data will be PRESERVED:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li><strong>Knowledge Base & Documentation</strong> (kb_docs, categories, attachments, search analytics)</li>
              <li>Users & Authentication</li>
              <li>Profiles & Workspaces</li>
              <li>CRM (contacts, companies, relationships)</li>
              <li>API Keys & Usage Logs</li>
              <li>Global Upsells (admin-managed)</li>
              <li>Global Timeline Elements</li>
              <li>Material Metadata Field Definitions</li>
              <li>PDF files in pdf-documents folder</li>
              <li>System Settings & Configuration</li>
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

