/**
 * The one editor for a product's fiscal, catalog and customs identity.
 *
 * Every one of these columns was already being WRITTEN — the warehouse intake form
 * (`ReceiveToWarehouseDialog`) collects the full set, `WarehousePanel` collects a subset — but
 * the product modal only ever rendered three of them, so an operator could set a TARIC code or
 * an invoicing unit on intake and then had nowhere to see or correct it. That is what this
 * replaces: the write-only path, and the four hand-maintained copies of "which columns are the
 * fiscal ones" that came with it. `FISCAL_KEYS` in `warehouseService` stays the single
 * definition; this is the single editor over it.
 *
 * Supersedes `ProductMydataCard`, which covered VAT category + wholesale classification only.
 */
import React, { useEffect, useState } from 'react';
import { Loader2, Save, Receipt, Ship, Tag, Sparkles, Check, X, AlertTriangle } from 'lucide-react';
import { Label } from '@/components/core/ui/label';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { invoicingSetupService, type RefRow } from '@/services/invoicingSetupService';
import { VAT_CATEGORIES } from '@/modules/finance/services/financeService';
import { warehouseService, type ProductFiscalFields } from '@/services/warehouseService';
import { taricService, formatTaricCode } from '@/services/taricService';
import { TaricCombobox } from '@/components/core/TaricCombobox';
import { OriginCountryCombobox } from '@/components/core/OriginCountryCombobox';
import { UNITS } from '@/lib/units';

const NONE = '__none';

/** Columns this card owns. Customs columns are handled separately — see `saveCustoms`. */
const SELECT_COLUMNS = [
  'barcode', 'cpv_code', 'item_type', 'category_id', 'measurement_unit_code',
  'mydata_vat_category',
  'mydata_income_classification_type', 'mydata_income_classification_category',
  'mydata_income_classification_type_retail', 'mydata_income_classification_category_retail',
  'prices_include_vat', 'markup_percent', 'warranty', 'product_url', 'notes',
  'taric_code', 'country_of_origin',
  'taric_code_suggested', 'taric_confidence', 'taric_status', 'taric_source', 'taric_reasoning',
].join(', ');

interface State {
  barcode: string;
  cpv: string;
  itemType: string;
  categoryId: string;
  unitCode: string;
  vat: string;
  incType: string;
  incCat: string;
  incTypeRetail: string;
  incCatRetail: string;
  pricesIncludeVat: boolean;
  markup: string;
  warranty: string;
  productUrl: string;
  notes: string;
  taric: string;
  origin: string;
}

const EMPTY: State = {
  barcode: '', cpv: '', itemType: 'good', categoryId: '', unitCode: '',
  vat: '', incType: '', incCat: '', incTypeRetail: '', incCatRetail: '',
  pricesIncludeVat: false, markup: '', warranty: '', productUrl: '', notes: '',
  taric: '', origin: '',
};

export const ProductFiscalCard: React.FC<{ productId: string }> = ({ productId }) => {
  const { toast } = useToast();
  const [form, setForm] = useState<State>(EMPTY);
  const [incTypes, setIncTypes] = useState<RefRow[]>([]);
  const [incCats, setIncCats] = useState<RefRow[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [suggestion, setSuggestion] = useState<{
    code: string; confidence: number | null; reasoning: string | null; status: string;
  } | null>(null);

  const set = (patch: Partial<State>) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: p }, types, cats, matCats] = await Promise.all([
        supabase.from('products').select(SELECT_COLUMNS).eq('id', productId).maybeSingle(),
        invoicingSetupService.listReference('income_classification_type').catch(() => [] as RefRow[]),
        invoicingSetupService.listReference('income_classification_category').catch(() => [] as RefRow[]),
        supabase.from('material_categories').select('id, name').order('name').limit(200)
          .then((r) => (r.data ?? []) as { id: string; name: string }[], () => []),
      ]);
      if (cancelled) return;
      const row = p as any;
      setForm({
        barcode: row?.barcode ?? '',
        cpv: row?.cpv_code ?? '',
        itemType: row?.item_type ?? 'good',
        categoryId: row?.category_id ?? '',
        unitCode: row?.measurement_unit_code != null ? String(row.measurement_unit_code) : '',
        vat: row?.mydata_vat_category != null ? String(row.mydata_vat_category) : '',
        incType: row?.mydata_income_classification_type ?? '',
        incCat: row?.mydata_income_classification_category ?? '',
        incTypeRetail: row?.mydata_income_classification_type_retail ?? '',
        incCatRetail: row?.mydata_income_classification_category_retail ?? '',
        pricesIncludeVat: row?.prices_include_vat ?? false,
        markup: row?.markup_percent != null ? String(row.markup_percent) : '',
        warranty: row?.warranty ?? '',
        productUrl: row?.product_url ?? '',
        notes: row?.notes ?? '',
        taric: (row?.taric_code ?? '').replace(/[^0-9]/g, ''),
        origin: row?.country_of_origin ?? '',
      });
      setSuggestion(
        row?.taric_code_suggested
          ? {
              code: row.taric_code_suggested,
              confidence: row.taric_confidence,
              reasoning: row.taric_reasoning,
              status: row.taric_status,
            }
          : null,
      );
      setIncTypes(types); setIncCats(cats); setCategories(matCats);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [productId]);

  const num = (v: string): number | null => (v.trim() === '' ? null : Number(v));

  const save = async () => {
    setSaving(true);
    try {
      const fiscal: ProductFiscalFields = {
        barcode: form.barcode.trim() || null,
        cpv_code: form.cpv.trim() || null,
        item_type: form.itemType,
        category_id: form.categoryId || null,
        measurement_unit_code: num(form.unitCode),
        mydata_vat_category: num(form.vat),
        mydata_income_classification_type: form.incType || null,
        mydata_income_classification_category: form.incCat || null,
        mydata_income_classification_type_retail: form.incTypeRetail || null,
        mydata_income_classification_category_retail: form.incCatRetail || null,
        prices_include_vat: form.pricesIncludeVat,
        markup_percent: num(form.markup),
        warranty: form.warranty.trim() || null,
        product_url: form.productUrl.trim() || null,
        notes: form.notes.trim() || null,
        taric_code: form.taric || null,
      };
      await warehouseService.updateProductFiscal(productId, fiscal);
      // Origin and the classification audit trail are not part of FISCAL_KEYS — they belong to
      // customs, and a code chosen by hand here is a confirmed one whatever the classifier said.
      const { error } = await supabase.from('products').update({
        country_of_origin: form.origin || null,
        ...(form.taric ? { taric_status: 'confirmed', taric_source: 'manual', taric_code_suggested: null } : {}),
      }).eq('id', productId);
      if (error) throw error;
      if (form.taric) setSuggestion(null);
      toast({ title: 'Product data saved' });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const suggest = async () => {
    setClassifying(true);
    try {
      const res = await taricService.classify([productId], { force: true });
      const first = res?.results?.[0];
      if (first?.code && first.status === 'confirmed') {
        // The supplier had already declared a valid code — applied directly, nothing to confirm.
        set({ taric: first.code });
        setSuggestion(null);
        toast({ title: 'TARIC code taken from the supplier data', description: formatTaricCode(first.code) });
      } else if (first?.code) {
        setSuggestion({
          code: first.code, confidence: first.confidence ?? null,
          reasoning: first.reasoning ?? null, status: 'suggested',
        });
        toast({ title: 'Suggestion ready — review before accepting' });
      } else {
        toast({
          title: 'No confident match',
          description: first?.reason === 'no candidates'
            ? 'The TARIC reference table has no candidates — import it first.'
            : 'Add a clearer description and try again.',
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({ title: 'Classification failed', description: err?.message, variant: 'destructive' });
    } finally { setClassifying(false); }
  };

  const acceptSuggestion = async () => {
    if (!suggestion) return;
    try {
      await taricService.confirmSuggestion(productId, suggestion.code);
      set({ taric: suggestion.code });
      setSuggestion(null);
      toast({ title: 'TARIC code confirmed' });
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    }
  };

  const rejectSuggestion = async () => {
    try {
      await taricService.rejectSuggestion(productId);
      setSuggestion(null);
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Section icon={<Tag className="h-3.5 w-3.5 text-primary" />} title="Catalog identity">
        <Grid>
          <FieldBox label="Barcode (EAN / UPC)">
            <Input className="h-8 text-xs" value={form.barcode} onChange={(e) => set({ barcode: e.target.value })} />
          </FieldBox>
          <FieldBox label="CPV code">
            <Input className="h-8 text-xs" value={form.cpv} onChange={(e) => set({ cpv: e.target.value })} placeholder="procurement" />
          </FieldBox>
          <FieldBox label="Type">
            <Select value={form.itemType} onValueChange={(v) => set({ itemType: v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="good">Merchandise</SelectItem>
                <SelectItem value="service">Service</SelectItem>
              </SelectContent>
            </Select>
          </FieldBox>
          <FieldBox label="Category">
            <Select value={form.categoryId || NONE} onValueChange={(v) => set({ categoryId: v === NONE ? '' : v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}><span className="text-muted-foreground">No category</span></SelectItem>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </FieldBox>
        </Grid>
      </Section>

      <Section icon={<Receipt className="h-3.5 w-3.5 text-primary" />} title="Invoicing &amp; myDATA">
        <Grid>
          {/* The INVOICING unit, which legitimately differs from the warehouse counting unit
              (buy by pallet, sell by m²) — that one lives on the stock row. */}
          <FieldBox label="Invoicing unit">
            <Select value={form.unitCode || NONE} onValueChange={(v) => set({ unitCode: v === NONE ? '' : v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Not set" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}><span className="text-muted-foreground">Not set</span></SelectItem>
                {UNITS.filter((u) => u.mydataCode != null).map((u) => (
                  <SelectItem key={u.key} value={String(u.mydataCode)}>{u.mydataCode} — {u.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldBox>
          <FieldBox label="VAT category (sale)">
            <Select value={form.vat || NONE} onValueChange={(v) => set({ vat: v === NONE ? '' : v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Not set" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}><span className="text-muted-foreground">Not set</span></SelectItem>
                {VAT_CATEGORIES.map((v) => <SelectItem key={v.code} value={v.code}>{v.longLabel}</SelectItem>)}
              </SelectContent>
            </Select>
          </FieldBox>
          <FieldBox label="Income category (wholesale)">
            <RefSelect value={form.incCat} options={incCats} onChange={(v) => set({ incCat: v })} />
          </FieldBox>
          <FieldBox label="Income type (wholesale)">
            <RefSelect value={form.incType} options={incTypes} onChange={(v) => set({ incType: v })} />
          </FieldBox>
          {/* Retail is a DIFFERENT E3 code for the same article — collected on intake but never
              previously visible here, so a wrong one could not be corrected. */}
          <FieldBox label="Income category (retail)">
            <RefSelect value={form.incCatRetail} options={incCats} onChange={(v) => set({ incCatRetail: v })} />
          </FieldBox>
          <FieldBox label="Income type (retail)">
            <RefSelect value={form.incTypeRetail} options={incTypes} onChange={(v) => set({ incTypeRetail: v })} />
          </FieldBox>
          <FieldBox label="Default markup %">
            <Input className="h-8 text-xs" inputMode="decimal" value={form.markup}
              onChange={(e) => set({ markup: e.target.value })} placeholder="0" />
          </FieldBox>
          <div className="flex items-end pb-1">
            {/* htmlFor rather than nesting: Radix renders a button[role=checkbox], not a native
                input, so wrapping it in a label associates nothing. */}
            <Label htmlFor="fiscal-prices-include-vat" className="flex items-center gap-2 text-xs cursor-pointer font-normal">
              <Checkbox
                id="fiscal-prices-include-vat"
                checked={form.pricesIncludeVat}
                onCheckedChange={(v) => set({ pricesIncludeVat: v === true })}
              />
              <span>Stored prices include VAT</span>
            </Label>
          </div>
        </Grid>
      </Section>

      <Section icon={<Ship className="h-3.5 w-3.5 text-primary" />} title="Customs">
        <p className="text-[11px] text-muted-foreground -mt-1 mb-2">
          Since 1 July 2026 an EU import under €150 — IOSS included — is charged €3 of duty per
          tariff sub-heading, and only a declarable 10-digit code is accepted. Origin decides
          preference and anti-dumping, so a code on its own is not enough.
        </p>
        <Grid>
          <FieldBox className="sm:col-span-2" label="TARIC commodity code">
            <TaricCombobox value={form.taric} onChange={(code) => set({ taric: code })}
              triggerClassName="h-8 text-xs w-full" />
          </FieldBox>
          <FieldBox label="Country of origin">
            <OriginCountryCombobox value={form.origin} onChange={(code) => set({ origin: code })}
              triggerClassName="h-8 text-xs w-full" />
          </FieldBox>
          <div className="flex items-end pb-0.5">
            <Button type="button" size="sm" variant="outline" className="rounded-full h-8 text-xs"
              onClick={suggest} disabled={classifying}>
              {classifying
                ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                : <Sparkles className="h-3.5 w-3.5 mr-1" />}
              Suggest a code
            </Button>
          </div>
        </Grid>

        {suggestion && (
          <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
              <div className="min-w-0 text-xs">
                <p className="font-medium">
                  Suggested: <span className="font-mono">{formatTaricCode(suggestion.code)}</span>
                  {suggestion.confidence != null && (
                    <span className="ml-2 font-normal text-muted-foreground">
                      {Math.round(suggestion.confidence * 100)}% confident
                    </span>
                  )}
                </p>
                {suggestion.reasoning && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{suggestion.reasoning}</p>
                )}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Not applied. A tariff classification is a customs liability — confirm it yourself.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" className="rounded-full h-7 text-xs" onClick={acceptSuggestion}>
                <Check className="h-3 w-3 mr-1" /> Accept
              </Button>
              <Button type="button" size="sm" variant="outline" className="rounded-full h-7 text-xs" onClick={rejectSuggestion}>
                <X className="h-3 w-3 mr-1" /> Dismiss
              </Button>
            </div>
          </div>
        )}
      </Section>

      <Section icon={<Tag className="h-3.5 w-3.5 text-primary" />} title="Commercial">
        <Grid>
          <FieldBox label="Warranty">
            <Input className="h-8 text-xs" value={form.warranty} onChange={(e) => set({ warranty: e.target.value })} placeholder="e.g. 2 years" />
          </FieldBox>
          <FieldBox className="sm:col-span-3" label="Link">
            <Input className="h-8 text-xs" value={form.productUrl} onChange={(e) => set({ productUrl: e.target.value })} placeholder="https://" />
          </FieldBox>
          <FieldBox className="sm:col-span-4" label="Notes">
            <Input className="h-8 text-xs" value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Optional notes…" />
          </FieldBox>
        </Grid>
      </Section>

      <Button size="sm" variant="outline" onClick={save} disabled={saving} className="w-full rounded-full">
        {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
        Save product data
      </Button>
    </div>
  );
};

// ── Local layout helpers ───────────────────────────────────────────────────────────────────

const Section: React.FC<{ icon: React.ReactNode; title: React.ReactNode; children: React.ReactNode }> =
  ({ icon, title, children }) => (
    <div className="rounded-md border border-border/60 bg-muted/20 p-3">
      <div className="text-xs font-medium flex items-center gap-1 mb-2">{icon} {title}</div>
      {children}
    </div>
  );

const Grid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-4">{children}</div>
);

const FieldBox: React.FC<{ label: string; className?: string; children: React.ReactNode }> =
  ({ label, className, children }) => (
    <div className={`space-y-1 ${className ?? ''}`}>
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );

const RefSelect: React.FC<{ value: string; options: RefRow[]; onChange: (v: string) => void }> =
  ({ value, options, onChange }) => (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Not set" /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}><span className="text-muted-foreground">Not set</span></SelectItem>
        {options.map((o) => <SelectItem key={o.code} value={o.code}>{o.code} — {o.description}</SelectItem>)}
      </SelectContent>
    </Select>
  );

export default ProductFiscalCard;
