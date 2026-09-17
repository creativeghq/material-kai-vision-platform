import { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function ProductDatasheetButton({ productId }: { productId: string }) {
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const generate = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('product-datasheet-pdf', {
        body: { product_id: productId },
      });
      if (error) throw error;
      const url = (data as { url?: string } | null)?.url;
      if (!url) throw new Error('The datasheet came back without a link.');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast({
        title: 'Datasheet not generated',
        description: err instanceof Error ? err.message : 'The datasheet service could not be reached.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={() => void generate()} disabled={busy}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
      <span className="ml-2">{busy ? 'Building…' : 'Datasheet PDF'}</span>
    </Button>
  );
}
