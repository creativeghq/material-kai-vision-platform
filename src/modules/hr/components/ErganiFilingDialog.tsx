import { useState, type ReactNode } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import type { ErganiPreview, ErganiFiled } from '../services/hrService';

/**
 * The review step every Ε-document filing goes through.
 *
 * Ergani publishes the field schema for each document only inside its samples pack, and it varies
 * per employer, so the server builds the payload from the employer's OWN live template and reports
 * which placeholders it could not recognise. Those are shown here for the operator to complete
 * before anything is filed — a government document must never be submitted on a guess.
 *
 * Opening the dialog runs `loadPreview`; `submit` receives the reviewed (possibly edited) document.
 */
export function ErganiFilingDialog({
  trigger, title, description, loadPreview, submit, onDone,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  loadPreview: () => Promise<ErganiPreview | ErganiFiled>;
  submit: (document: unknown) => Promise<ErganiPreview | ErganiFiled>;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filing, setFiling] = useState(false);
  const [code, setCode] = useState('');
  const [doc, setDoc] = useState('');
  const [unfilled, setUnfilled] = useState<string[]>([]);

  const onOpenChange = async (next: boolean) => {
    setOpen(next);
    if (!next) { setDoc(''); setUnfilled([]); setCode(''); return; }
    setLoading(true);
    try {
      const res = await loadPreview();
      if (!('preview' in res)) { onDone(); setOpen(false); return; } // already filed elsewhere
      setCode(res.code);
      setDoc(JSON.stringify(res.document, null, 2));
      setUnfilled(res.unfilled);
    } catch (e) {
      toast({ title: 'Could not prepare the filing', description: (e as Error).message, variant: 'destructive' });
      setOpen(false);
    } finally { setLoading(false); }
  };

  const file = async () => {
    let parsed: unknown;
    try { parsed = JSON.parse(doc); } catch { toast({ title: 'Invalid JSON', description: 'Fix the document before filing.', variant: 'destructive' }); return; }
    setFiling(true);
    try {
      const res = await submit(parsed);
      const protocol = 'result' in res ? res.result.protocol : '';
      toast({ title: 'Filed to Ergani', description: protocol ? `Protocol ${protocol}` : undefined });
      setOpen(false); onDone();
    } catch (e) {
      toast({ title: 'Ergani filing failed', description: (e as Error).message, variant: 'destructive' });
    } finally { setFiling(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{title}{code ? ` · ${code}` : ''}</DialogTitle></DialogHeader>
        {loading ? (
          <div className="flex items-center gap-2 py-10 justify-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Fetching Ergani’s live template…
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{description}</p>
            {unfilled.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-xs min-w-0">
                  <p className="font-medium">{unfilled.length} field{unfilled.length === 1 ? '' : 's'} could not be filled automatically.</p>
                  <p className="text-muted-foreground mt-1">
                    Complete these below before filing. Codes that are the same for every filing of this
                    employee (specialty, contract type) can be saved on the employee record so they prefill next time.
                  </p>
                  <p className="font-mono mt-1.5 break-all">{unfilled.join(', ')}</p>
                </div>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Document (JSON) — review before filing</Label>
              <Textarea value={doc} onChange={(e) => setDoc(e.target.value)} rows={16} className="font-mono text-xs" />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={filing}>Cancel</Button>
          <Button onClick={file} disabled={filing || loading || !doc.trim()}>
            {filing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}File to Ergani
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
