import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Props {
  productId: string;
  kbDocId?: string;
  documentId?: string;
  label?: string;
}

export function ProductDocumentDownload({ productId, kbDocId, documentId, label }: Props) {
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const open = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('product-document-url', {
        body: { product_id: productId, kb_doc_id: kbDocId, document_id: documentId },
      });
      if (error) throw error;
      const url = (data as { url?: string } | null)?.url;
      if (!url) {
        toast({
          title: 'No original file stored',
          description: 'This page was extracted from a document we no longer hold a file for.',
        });
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast({
        title: 'Could not open the original',
        description: err instanceof Error ? err.message : 'The document service could not be reached.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={() => void open()} disabled={busy}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      <span className="ml-2">{label ?? 'Original PDF'}</span>
    </Button>
  );
}
