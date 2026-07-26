/**
 * Business profile for invoicing — the full Novus-style setup (4 tabs):
 *  1. Billing / issuer — printed on invoices + transmitted to myDATA.
 *  2. Customer contact — shown in customer-facing emails.
 *  3. Personal / confidential — for support contact.
 *  4. My company — type / operating mode / main activity.
 *  + Bank & logo.
 *
 * Labels are English-only (translations come later). Fields marked `bilingual`
 * (name/activity/address/city/country) store BOTH a Greek and an English value for
 * dual-language invoices — instead of two columns, a top EN/GR switch picks which
 * language you're entering. Every field carries a placeholder example.
 * Per-workspace (finance_settings); each business fills its own.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Save, Upload, Building2, ImageIcon, Copy, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { aadeService } from '@/modules/myaade';
import { gemiService } from '@/services/gemiService';

type Lang = 'en' | 'gr';
type Field = { key: string; label: string; bilingual?: boolean; textarea?: boolean; placeholder?: string };

const BILLING: Field[] = [
  { key: 'business_name', label: 'Company name', bilingual: true, placeholder: 'Acme Tiles S.A.' },
  { key: 'business_profession', label: 'Activity', bilingual: true, placeholder: 'Wholesale of building materials' },
  { key: 'business_vat', label: 'VAT number', placeholder: 'EL123456789' },
  { key: 'business_gemi', label: 'GEMI number', placeholder: '123456789000' },
  { key: 'business_tax_office', label: 'Tax office', bilingual: true, placeholder: 'FAE Athinon' },
  { key: 'business_address', label: 'Street', bilingual: true, placeholder: 'Ermou' },
  { key: 'business_street_number', label: 'Number', placeholder: '15' },
  { key: 'business_postal_code', label: 'Postal code', placeholder: '10563' },
  { key: 'business_city', label: 'City', bilingual: true, placeholder: 'Athens' },
  { key: 'business_country', label: 'Country', bilingual: true, placeholder: 'Greece' },
  { key: 'business_country_code', label: 'Country code', placeholder: 'GR' },
  { key: 'business_phone', label: 'Phone', placeholder: '+30 210 1234567' },
  { key: 'business_fax', label: 'Fax', placeholder: '+30 210 1234568' },
  { key: 'business_email', label: 'Email', placeholder: 'billing@acme.gr' },
  { key: 'business_other', label: 'Other', bilingual: true, placeholder: 'e.g. branch / notes' },
];
const CUSTOMER_CONTACT: Field[] = [
  { key: 'contact_title', label: 'Display name / Brand', bilingual: true, placeholder: 'Acme Tiles' },
  { key: 'contact_email', label: 'Contact email', placeholder: 'hello@acme.gr' },
  { key: 'contact_phone', label: 'Company phone', placeholder: '+30 210 1234567' },
  { key: 'contact_fax', label: 'Fax', placeholder: '+30 210 1234568' },
  { key: 'contact_website', label: 'Website', placeholder: 'https://acme.gr' },
  { key: 'contact_linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/company/acme' },
  { key: 'contact_facebook', label: 'Facebook', placeholder: 'https://facebook.com/acme' },
  { key: 'contact_hours', label: 'Opening hours', placeholder: 'Mon–Fri 9:00–17:00' },
];
const PERSONAL: Field[] = [
  { key: 'responsible_name', label: 'Responsible person', placeholder: 'Maria Papadopoulou' },
  { key: 'personal_landline', label: 'Landline', placeholder: '+30 210 1234567' },
  { key: 'personal_mobile', label: 'Mobile', placeholder: '+30 69x xxx xxxx' },
  { key: 'notification_email', label: 'Notifications email', placeholder: 'alerts@acme.gr' },
  { key: 'correspondence_address', label: 'Correspondence address', placeholder: 'Ermou 15, 10563 Athens' },
  { key: 'personal_notes', label: 'Notes & instructions', textarea: true, placeholder: 'Anything we should know…' },
];
const COMPANY_TYPES = [
  'Sole proprietor / Freelancer', 'Small business (2–10 people)',
  'Medium business (11–50 people)', 'Large business (50+ people)',
];
const MAIN_ACTIVITIES = [
  { group: 'Commerce', items: ['Retail & Wholesale', 'Retail only', 'Wholesale only', 'Food service / Café'] },
  { group: 'Services', items: ['Architect/Engineer/Contractor', 'Lawyer/Notary', 'Accounting services', 'Psychologists/Therapists', 'Technical trade (Electrician/Plumber/etc.)', 'Healthcare professional', 'Tourism/Accommodation', 'NGO', 'Other'] },
];

const ALL_TEXT_FIELDS = [...BILLING, ...CUSTOMER_CONTACT, ...PERSONAL];

export const BusinessIdentityCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [data, setData] = useState<Record<string, any>>({});
  const [lang, setLang] = useState<Lang>('en');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [aadeLoading, setAadeLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    supabase.from('finance_settings').select('*').eq('workspace_id', workspaceId).maybeSingle()
      .then(({ data: row }) => {
        if (cancelled) return;
        const r: Record<string, any> = row ?? { workspace_id: workspaceId };
        setData(r);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [workspaceId]);

  const set = (k: string, v: any) => setData((d) => ({ ...d, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const patch: Record<string, any> = { workspace_id: workspaceId, updated_at: new Date().toISOString() };
      for (const f of ALL_TEXT_FIELDS) {
        patch[f.key] = data[f.key] ?? null;
        if (f.bilingual) patch[`${f.key}_en`] = data[`${f.key}_en`] ?? null;
      }
      patch.business_company_type = data.business_company_type ?? null;
      patch.business_seasonal = !!data.business_seasonal;
      patch.main_activity = data.main_activity ?? null;
      // Accounts are managed in Settings → Accounts (single source), not here.
      const { error } = await supabase.from('finance_settings').upsert(patch, { onConflict: 'workspace_id' });
      if (error) throw error;
      toast({ title: 'Business profile saved' });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  /** Prefill the issuer fields from ΑΑΔΕ (RgWsPublic2) using the VAT number.
   *  The bilingual fields (name/activity/tax office/street/city) are filled in BOTH
   *  languages: the Greek base key from ΑΑΔΕ's registered value, and the `_en` key from
   *  the server-side English translation (`translate: true`). Review then Save. No companyId
   *  → this is the workspace's OWN business, so nothing is cached onto a CRM company row. */
  const lookupAade = async () => {
    const afm = String(data.business_vat ?? '').replace(/[^0-9]/g, '');
    if (afm.length !== 9) {
      toast({ title: 'Need a 9-digit VAT number', description: 'Type the Greek VAT (9 digits) in the VAT number field first.', variant: 'destructive' });
      return;
    }
    setAadeLoading(true);
    try {
      const res = await aadeService.lookup({ afm, reason: 'own_business', workspaceId, translate: true });
      if ('error' in res && res.error) {
        toast({ title: 'ΑΑΔΕ lookup failed', description: res.message || res.error, variant: 'destructive' });
        return;
      }
      if ('ok' in res && res.ok) {
        const r = res.basic_rec;
        const en = res.basic_rec_en ?? null;
        const primaryAct = res.activities.find((a) => a.kind === 1) ?? res.activities[0] ?? null;
        // `pick(current, greek, english)` — keep the current value if ΑΑΔΕ gave nothing.
        const pick = (cur: any, gr: string | null | undefined) => gr ?? cur;
        setData((d) => ({
          ...d,
          // Greek (base) slots — the registered ΑΑΔΕ values.
          business_name: pick(d.business_name, r.onomasia),
          business_profession: pick(d.business_profession, primaryAct?.description),
          business_tax_office: pick(d.business_tax_office, r.doy_descr),
          business_address: pick(d.business_address, r.postal_address),
          business_city: pick(d.business_city, r.postal_area_description),
          // English (_en) slots — the server-side translation. Fall back to the Greek value
          // (better a filled field than an empty one) when translation was unavailable.
          business_name_en: pick(d.business_name_en, en?.onomasia ?? r.onomasia),
          business_profession_en: pick(d.business_profession_en, en?.primary_activity_descr ?? primaryAct?.description),
          business_tax_office_en: pick(d.business_tax_office_en, en?.doy_descr ?? r.doy_descr),
          business_address_en: pick(d.business_address_en, en?.postal_address ?? r.postal_address),
          business_city_en: pick(d.business_city_en, en?.postal_area_description ?? r.postal_area_description),
          // Non-bilingual (single-slot) fields.
          business_street_number: pick(d.business_street_number, r.postal_address_no),
          business_postal_code: pick(d.business_postal_code, r.postal_zip_code),
          business_country: d.business_country || 'Greece',
          business_country_en: d.business_country_en || 'Greece',
          business_country_code: d.business_country_code || 'GR',
        }));
        toast({
          title: 'Prefilled from ΑΑΔΕ',
          description: r.onomasia
            ? `Registered as ${r.onomasia}${en?.onomasia && en.onomasia !== r.onomasia ? ` (${en.onomasia})` : ''}. Review & Save.`
            : 'Review & Save.',
        });

        // ΓΕΜΗ enrichment: fills the GEMI number (ΑΑΔΕ doesn't return it) + the official
        // Latin-character company name, which is better than a machine transliteration for the
        // EN slot. Best-effort — a ΓΕΜΗ miss or unconfigured key never blocks the ΑΑΔΕ prefill.
        try {
          const g = await gemiService.lookup({ afm, reason: 'own_business', workspaceId });
          if ('ok' in g && g.ok) {
            setData((d) => ({
              ...d,
              business_gemi: g.gemi.ar_gemi ?? d.business_gemi,
              // ΓΕΜΗ's official Latin name wins over the Haiku transliteration when present.
              business_name_en: g.gemi.name_en ?? d.business_name_en,
            }));
            if (g.gemi.ar_gemi) {
              toast({ title: 'ΓΕΜΗ number added', description: `Γ.Ε.ΜΗ.: ${g.gemi.ar_gemi}. Review & Save.` });
            }
          }
        } catch { /* GEMI is a best-effort add-on; ignore failures */ }
      }
    } finally { setAadeLoading(false); }
  };

  const copyBillingToContact = () => setData((d) => ({
    ...d,
    contact_title: d.business_name ?? '', contact_email: d.business_email ?? '',
    contact_phone: d.business_phone ?? '', contact_fax: d.business_fax ?? '',
  }));

  const uploadLogo = async (file: File) => {
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { toast({ title: 'PNG/JPG/WEBP only', variant: 'destructive' }); return; }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
      const path = `business-logos/${workspaceId}.${ext}`;
      const { error: upErr } = await supabase.storage.from('generation-images').upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('generation-images').getPublicUrl(path);
      set('business_logo_path', path);
      await supabase.from('finance_settings').upsert({ workspace_id: workspaceId, business_logo_path: path }, { onConflict: 'workspace_id' });
      set('_logo_url', `${pub.publicUrl}?t=${Date.now()}`);
      toast({ title: 'Logo uploaded' });
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err?.message, variant: 'destructive' });
    } finally { setUploading(false); }
  };

  const logoUrl = data._logo_url
    ?? (data.business_logo_path ? supabase.storage.from('generation-images').getPublicUrl(data.business_logo_path).data.publicUrl : null);

  if (loading) return <Card><CardContent className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2"><Building2 className="h-4 w-4" /> Business Profile (Invoicing &amp; myDATA)</CardTitle>
        <div className="flex items-center gap-2">
          <LangToggle lang={lang} onChange={setLang} />
          <Button size="sm" onClick={save} disabled={saving} className="rounded-full">
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Save
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-5">
        <Tabs defaultValue="billing" className="space-y-4">
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            {[['billing', '1. Billing'], ['contact', '2. Customer Contact'], ['personal', '3. Personal'], ['company', '4. My Company']].map(([v, l]) => (
              <TabsTrigger key={v} value={v}>{l}</TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="billing">
            <div className="flex items-start justify-between gap-2 mb-3">
              <p className="text-xs text-muted-foreground">Shown when issuing e-invoices &amp; receipts and transmitted to myDATA — mandatory.</p>
              <Button size="sm" variant="outline" onClick={lookupAade} disabled={aadeLoading} className="shrink-0">
                {aadeLoading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />} Fetch from ΑΑΔΕ + ΓΕΜΗ
              </Button>
            </div>
            <FieldGrid fields={BILLING} data={data} set={set} lang={lang} />
          </TabsContent>

          <TabsContent value="contact">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-muted-foreground">Shown in the emails your customers receive.</p>
              <Button size="sm" variant="outline" onClick={copyBillingToContact}><Copy className="h-3.5 w-3.5 mr-1" /> Copy from billing</Button>
            </div>
            <FieldGrid fields={CUSTOMER_CONTACT} data={data} set={set} lang={lang} />
          </TabsContent>

          <TabsContent value="personal">
            <p className="text-xs text-muted-foreground mb-3">Personal &amp; confidential — used only for support contact, never shown publicly.</p>
            <FieldGrid fields={PERSONAL} data={data} set={set} lang={lang} />
          </TabsContent>

          <TabsContent value="company" className="space-y-3">
            <div className="space-y-1">
              <Label>Company type</Label>
              <Select value={data.business_company_type ?? ''} onValueChange={(v) => set('business_company_type', v)}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>{COMPANY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Operating</Label>
              <Select value={data.business_seasonal ? 'seasonal' : 'all_year'} onValueChange={(v) => set('business_seasonal', v === 'seasonal')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_year">All year round</SelectItem>
                  <SelectItem value="seasonal">Seasonal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Main activity</Label>
              <Select value={data.main_activity ?? ''} onValueChange={(v) => set('main_activity', v)}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {MAIN_ACTIVITIES.map((g) => (
                    <React.Fragment key={g.group}>
                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">{g.group}</div>
                      {g.items.map((it) => <SelectItem key={it} value={it}>{it}</SelectItem>)}
                    </React.Fragment>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Logo lives here now (the separate "Bank & Logo" tab was retired — bank
                details are managed in Settings → Accounts and print from there). */}
            <div className="space-y-2 pt-2 border-t border-border/60">
              <Label>Logo (printed on invoices)</Label>
              <div className="flex items-center gap-4">
                <div className="h-20 w-40 rounded-md border border-border/60 bg-muted/20 flex items-center justify-center overflow-hidden">
                  {logoUrl ? <img src={logoUrl} alt="logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted-foreground flex items-center gap-1"><ImageIcon className="h-4 w-4" /> No logo</span>}
                </div>
                <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />} {logoUrl ? 'Replace' : 'Upload'} logo
                </Button>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ''; }} />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

const LangToggle: React.FC<{ lang: Lang; onChange: (l: Lang) => void }> = ({ lang, onChange }) => (
  <div className="flex rounded-full border border-border/60 p-0.5 text-xs">
    {(['en', 'gr'] as Lang[]).map((l) => (
      <button
        key={l}
        type="button"
        onClick={() => onChange(l)}
        className={`rounded-full px-3 py-1 font-medium transition-colors ${lang === l ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
      >
        {l === 'en' ? 'EN' : 'GR'}
      </button>
    ))}
  </div>
);

const FieldGrid: React.FC<{ fields: Field[]; data: Record<string, any>; set: (k: string, v: any) => void; lang: Lang }> = ({ fields, data, set, lang }) => (
  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
    {fields.map((f) => {
      const bound = f.bilingual && lang === 'en' ? `${f.key}_en` : f.key;
      return (
        <div key={f.key} className={`space-y-1 ${f.textarea ? 'md:col-span-2' : ''}`}>
          <Label className="text-xs flex items-center gap-1">
            {f.label}
            {f.bilingual && <span className="text-[10px] uppercase text-muted-foreground">· {lang}</span>}
          </Label>
          {f.textarea
            ? <Textarea rows={2} value={data[bound] ?? ''} placeholder={f.placeholder} onChange={(e) => set(bound, e.target.value)} />
            : <Input value={data[bound] ?? ''} placeholder={f.placeholder} onChange={(e) => set(bound, e.target.value)} />}
        </div>
      );
    })}
  </div>
);
