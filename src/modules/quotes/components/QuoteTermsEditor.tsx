import React, { useEffect, useState } from 'react';
import { Loader2, Save, ScrollText } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Textarea } from '@/components/core/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { quotesService } from '../services/QuotesService';

interface Props {
  quoteId: string;
  terms: string | null | undefined;
  /** An accepted/rejected quote is frozen by the database; its terms are shown read-only. */
  readOnly: boolean;
  onSaved: () => void | Promise<void>;
}

/** This quote's Terms & Conditions, printed after the totals in its PDF. */
export const QuoteTermsEditor: React.FC<Props> = ({ quoteId, terms, readOnly, onSaved }) => {
  const { toast } = useToast();
  const [value, setValue] = useState(terms ?? '');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setValue(terms ?? ''); }, [terms]);

  const dirty = value.trim() !== (terms ?? '').trim();

  const save = async () => {
    try {
      setSaving(true);
      await quotesService.updateQuote(quoteId, { terms: value.trim() || null });
      toast({ title: 'Terms saved', description: 'Regenerate the PDF to print the new terms.' });
      await onSaved();
    } catch (e: unknown) {
      toast({ title: 'Could not save terms', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dashboard-card space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ScrollText className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
          <span className="text-sm font-medium">Terms &amp; Conditions</span>
        </div>
        {!readOnly && (
          <Button size="sm" variant="outline" onClick={save} disabled={!dirty || saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save terms
          </Button>
        )}
      </div>
      {readOnly ? (
        value
          ? <p className="whitespace-pre-wrap text-sm text-muted-foreground">{value}</p>
          : <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <Textarea
          id="quote-terms"
          aria-label="Terms and conditions"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={6}
          placeholder="Payment, delivery, transport, what is and is not included… Defaults come from Quote Settings."
        />
      )}
    </div>
  );
};
