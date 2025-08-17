import React, { useState, useEffect } from 'react';
import { Loader2, ExternalLink, Download } from 'lucide-react';
import { toast } from 'sonner';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';


interface HTMLDocumentViewerProps {
  isOpen: boolean;
  onClose: () => void;
  knowledgeEntryId: string;
  documentTitle?: string;
}

export const HTMLDocumentViewer: React.FC<HTMLDocumentViewerProps> = ({
  isOpen,
  onClose,
  knowledgeEntryId,
  documentTitle = 'HTML Document',
}) => {
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (isOpen && knowledgeEntryId) {
      fetchHTMLContent();
    }
  }, [isOpen, knowledgeEntryId]);

  const fetchHTMLContent = async () => {
    setLoading(true);
    setError('');

    try {
      // Fetch the knowledge entry which contains the HTML content
      const { data: knowledgeEntry, error: fetchError } = await supabase
        .from('materials_catalog')
        .select('description, name, properties')
        .eq('id', knowledgeEntryId)
        .maybeSingle();

      if (fetchError || !knowledgeEntry) {
        throw new Error('HTML document not found');
      }

      // Use description as content, and extract HTML content from properties if available
      let htmlContent = knowledgeEntry.description || '';

      // Check if properties is an object and has html_content
      if (knowledgeEntry.properties &&
          typeof knowledgeEntry.properties === 'object' &&
          !Array.isArray(knowledgeEntry.properties) &&
          knowledgeEntry.properties !== null) {
        const props = knowledgeEntry.properties as Record<string, any>;
        htmlContent = props.html_content || htmlContent;
      }

      setHtmlContent(htmlContent);
    } catch (err) {
      console.error('Error fetching HTML content:', err);
      setError(err instanceof Error ? err.message : 'Failed to load HTML document');
      toast.error('Failed to load HTML document');
    } finally {
      setLoading(false);
    }
  };

  const downloadHTML = () => {
    if (!htmlContent) return;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${documentTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('HTML document downloaded');
  };

  const openInNewTab = () => {
    if (!htmlContent) return;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold">
              {documentTitle}
            </DialogTitle>
            <div className="flex gap-2">
              <Button
                onClick={openInNewTab}
                disabled={!htmlContent || loading}
                className="text-xs"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Open in New Tab
              </Button>
              <Button
                onClick={downloadHTML}
                disabled={!htmlContent || loading}
                className="text-xs"
              >
                <Download className="h-3 w-3 mr-1" />
                Download HTML
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 border rounded-lg overflow-hidden bg-white">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex items-center gap-2 text-gray-600">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading HTML document...
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-red-600 font-medium">Error loading document</p>
                <p className="text-gray-500 text-sm mt-1">{error}</p>
                <Button
                  onClick={fetchHTMLContent}
                  className="mt-3"
                >
                  Try Again
                </Button>
              </div>
            </div>
          ) : htmlContent ? (
            <iframe
              srcDoc={htmlContent}
              className="w-full h-full border-0"
              title="HTML Document Preview"
              sandbox="allow-same-origin allow-scripts"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              No content available
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
