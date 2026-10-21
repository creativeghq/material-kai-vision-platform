import React, { useEffect, useState } from 'react';
import { Loader2, Save, ScrollText } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { financeService } from '@/modules/finance/services/financeService';

/** Workspace defaults every new quote starts from: its Terms & Conditions and validity. */
export const QuoteTermsCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [terms, setTerms] = useState('');
  const [validityDays, setValidityDays] = useState('');
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setUnavailable(false);
    financeService.getSettings(workspaceId)
      .then((s) => {
        if (cancelled) return;
        setTerms(s.default_quote_terms ?? '');
        setValidityDays(s.quote_validity_days != null ? String(s.quote_validity_days) : '');
      })
      .catch(() => { if (!cancelled) setUnavailable(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId]);

  const handleSave = async () => {
    const days = validityDays.trim() === '' ? null : Number(validityDays);
    if (days != null && (!Number.isInteger(days) || days < 1 || days > 365)) {
      toast({ title: 'Invalid validity', description: 'Enter whole days between 1 and 365, or leave it empty for the platform default.', variant: 'destructive' });
      return;
    }
    try {
      setSaving(true);
      await financeService.updateSettings(workspaceId, {
        default_quote_terms: terms.trim() || null,
        quote_validity_days: days,
      });
      toast({ title: 'Quote terms saved', description: 'New quotes start with these terms and validity.' });
    } catch (e: unknown) {
      toast({ title: 'Could not save quote terms', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dashboard-card space-y-4">
      <div className="flex items-center gap-2">
        <ScrollText className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
        <h2 className="text-xl font-semibold">Offer Terms &amp; Validity</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Every new quote starts with these terms and can be edited on the quote itself. They print as a
        <strong> Terms &amp; Conditions</strong> section after the totals. Changing them here does not alter quotes
        already created.
      </p>

      {loading ? (
        <div className="flex h-24 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : unavailable ? (
        <p className="text-sm text-muted-foreground">
          Offer terms are part of the workspace&apos;s finance settings — ask a finance manager or the workspace owner to set them.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="quote-validity-days">Offer valid for (days, optional)</Label>
            <div className="flex items-center gap-3">
              <Input
                id="quote-validity-days"
                type="number"
                min={1}
                max={365}
                value={validityDays}
                onChange={(e) => setValidityDays(e.target.value)}
                className="max-w-[8rem]"
                placeholder="30"
              />
              <span className="text-sm text-muted-foreground">days — empty uses the platform default</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quote-default-terms">Default terms</Label>
            <Textarea
              id="quote-default-terms"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              rows={8}
              placeholder={'Prices in EUR, excluding VAT.\nPayment: 50% advance on order, balance before delivery.\nDelivery: ex-warehouse; transport not included.'}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save terms
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
