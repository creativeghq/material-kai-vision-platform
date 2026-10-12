import React, { useRef, useState } from 'react';
import { FileUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { inboundService, type InboundIngestResult } from '@/modules/finance/services/inboundService';

export function describeIngest(r: InboundIngestResult): { title: string; description?: string } {
  switch (r.outcome) {
    case 'matched_existing':
      return {
        title: 'Matched to a document you already have',
        description: r.lines_written
          ? 'Same supplier, date and net total as a myDATA document; the PDF is attached and its lines were added.'
          : 'Same supplier, date and net total as a myDATA document; the PDF is attached to it rather than filed twice.',
      };
    case 'already_ingested':
      return { title: 'Already in Expenses', description: 'This attachment was filed before.' };
    case 'unreadable':
      return { title: 'Nothing was filed', description: 'The totals on that document could not be read.' };
    case 'created':
      return {
        title: 'Filed for confirmation',
        description: r.lines_written
          ? 'Read from the file, with its lines. Check it and press Confirm document — it is never booked on its own.'
          : 'Read from the file. Check it and press Confirm document — the lines did not foot, so add them by hand.',
      };
    default:
      return { title: 'Supplier document attached' };
  }
}

export const UploadSupplierInvoiceButton: React.FC<{ workspaceId: string; onDone: () => void }> = ({ workspaceId, onDone }) => {
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      toast(describeIngest(await inboundService.ingestSupplierDocument({ workspaceId, file })));
      onDone();
    } catch (err) {
      toast({ title: 'Could not read the document', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f); }}
      />
      <Button size="sm" variant="outline" onClick={() => input.current?.click()} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
        {busy ? 'Reading…' : 'Upload supplier invoice'}
      </Button>
    </>
  );
};
