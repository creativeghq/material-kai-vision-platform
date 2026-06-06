/**
 * #178 — per-product myDATA tax defaults (admin/workspace-manager only). The VAT
 * category + income classification set here auto-fill the invoice line when this
 * product is added. Stored on products.mydata_*.
 */
import React, { useEffect, useState } from 'react';
import { Loader2, Save, Receipt } from 'lucide-react';
import { Label } from '@/components/core/ui/label';
import { Button } from '@/components/core/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { invoicingSetupService, type RefRow } from '@/services/invoicingSetupService';

const VAT_CATEGORIES = [
  { code: '1', label: '1 — 24%' },
  { code: '2', label: '2 — 13%' },
  { code: '3', label: '3 — 6%' },
  { code: '7', label: '7 — 0%' },
  { code: '8', label: '8 — Without VAT (exempt)' },
];

export const ProductMydataCard: React.FC<{ productId: string }> = ({ productId }) => {
  const { toast } = useToast();
  const [vat, setVat] = useState<string>('');
  const [incType, setIncType] = useState<string>('');
  const [incCat, setIncCat] = useState<string>('');
  const [incTypes, setIncTypes] = useState<RefRow[]>([]);
  const [incCats, setIncCats] = useState<RefRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: p }, t, c] = await Promise.all([
        supabase.from('products').select('mydata_vat_category, mydata_income_classification_type, mydata_income_classification_category').eq('id', productId).maybeSingle(),
        invoicingSetupService.listReference('income_classification_type'),
        invoicingSetupService.listReference('income_classification_category'),
      ]);
      if (cancelled) return;
      setVat(p?.mydata_vat_category != null ? String(p.mydata_vat_category) : '');
      setIncType(p?.mydata_income_classification_type ?? '');
      setIncCat(p?.mydata_income_classification_category ?? '');
      setIncTypes(t); setIncCats(c); setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [productId]);

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('products').update({
        mydata_vat_category: vat ? Number(vat) : null,
        mydata_income_classification_type: incType || null,
        mydata_income_classification_category: incCat || null,
      }).eq('id', productId);
      if (error) throw error;
      toast({ title: 'myDATA defaults saved' });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  if (loading) return null;

  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-2 mt-2">
      <div className="text-xs font-medium flex items-center gap-1"><Receipt className="h-3.5 w-3.5 text-primary" /> myDATA tax defaults</div>
      <div className="grid grid-cols-1 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">VAT category</Label>
          <Select value={vat} onValueChange={setVat}><SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>{VAT_CATEGORIES.map((v) => <SelectItem key={v.code} value={v.code}>{v.label}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Income classification type</Label>
          <Select value={incType} onValueChange={setIncType}><SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>{incTypes.map((t) => <SelectItem key={t.code} value={t.code}>{t.code} — {t.description}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Income classification category</Label>
          <Select value={incCat} onValueChange={setIncCat}><SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>{incCats.map((t) => <SelectItem key={t.code} value={t.code}>{t.code} — {t.description}</SelectItem>)}</SelectContent></Select>
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={save} disabled={saving} className="w-full">
        {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />} Save myDATA defaults
      </Button>
    </div>
  );
};
