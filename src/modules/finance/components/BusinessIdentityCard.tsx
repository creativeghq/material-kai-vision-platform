/**
 * Business profile for invoicing — the full Novus-style setup (4 tabs):
 *  1. Billing / issuer (bilingual GR-EN) — printed on invoices + transmitted to myDATA.
 *  2. Customer contact — shown in customer-facing emails.
 *  3. Personal / confidential — for support contact.
 *  4. My company — type / operating mode / main activity.
 *  + Bank & logo.
 * Per-workspace (finance_settings); each business fills its own.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Save, Upload, Building2, ImageIcon, Copy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

type Field = { key: string; label: string; en?: boolean; textarea?: boolean; locked?: boolean };

const BILLING: Field[] = [
  { key: 'business_name', label: 'Επωνυμία / Company name', en: true },
  { key: 'business_profession', label: 'Δραστηριότητα / Activity', en: true },
  { key: 'business_vat', label: 'ΑΦΜ / VAT' },
  { key: 'business_gemi', label: 'Αριθμός ΓΕΜΗ' },
  { key: 'business_tax_office', label: 'ΔΟΥ / Tax office', en: true },
  { key: 'business_address', label: 'Οδός / Street', en: true },
  { key: 'business_street_number', label: 'Αριθμός / Number' },
  { key: 'business_postal_code', label: 'Τ.Κ. / Postal code' },
  { key: 'business_city', label: 'Πόλη / City', en: true },
  { key: 'business_country', label: 'Χώρα / Country', en: true },
  { key: 'business_country_code', label: 'Country code (e.g. GR)' },
  { key: 'business_phone', label: 'Τηλέφωνο / Phone' },
  { key: 'business_fax', label: 'FAX' },
  { key: 'business_email', label: 'Email' },
  { key: 'business_other', label: 'Άλλο / Other', en: true },
];
const CUSTOMER_CONTACT: Field[] = [
  { key: 'contact_title', label: 'Επωνυμία / Διακριτικός τίτλος', en: true },
  { key: 'contact_email', label: 'Email επικοινωνίας' },
  { key: 'contact_phone', label: 'Τηλέφωνο εταιρίας' },
  { key: 'contact_fax', label: 'ΦΑΞ' },
  { key: 'contact_website', label: 'Ιστοσελίδα' },
  { key: 'contact_linkedin', label: 'Linkedin' },
  { key: 'contact_facebook', label: 'Facebook' },
  { key: 'contact_hours', label: 'Ωράριο λειτουργίας' },
];
const PERSONAL: Field[] = [
  { key: 'responsible_name', label: 'Ονοματεπώνυμο Υπευθύνου' },
  { key: 'personal_landline', label: 'Σταθερό Τηλέφωνο' },
  { key: 'personal_mobile', label: 'Κινητό Τηλέφωνο' },
  { key: 'notification_email', label: 'Email Ειδοποιήσεων' },
  { key: 'correspondence_address', label: 'Διεύθυνση αλληλογραφίας' },
  { key: 'personal_notes', label: 'Οδηγίες & Σχόλια', textarea: true },
];
const BANK: Field[] = [
  { key: 'bank_name', label: 'Bank name' },
  { key: 'bank_iban', label: 'IBAN' },
  { key: 'bank_bic', label: 'BIC / SWIFT' },
  { key: 'bank_beneficiary', label: 'Beneficiary' },
];

const COMPANY_TYPES = ['Ατομική επιχείρηση / Freelancer', 'Μικρή επιχείρηση (2–10 άτομα)', 'Μεσαία επιχείρηση (11–50 άτομα)', 'Μεγάλη επιχείρηση (50+ άτομα)'];
const MAIN_ACTIVITIES = [
  { group: 'Εμπόριο', items: ['Λιανικό & Χονδρικό εμπόριο', 'Μόνο Λιανικό εμπόριο', 'Μόνο Χονδρικό εμπόριο', 'Κατάστημα εστίασης / cafe'] },
  { group: 'Υπηρεσίες', items: ['Αρχιτέκτονας/Μηχανικός/Εργολάβος', 'Δικηγόρος/Συμβολαιογράφος', 'Λογιστικές υπηρεσίες', 'Ψυχολόγοι/Θεραπευτές', 'Τεχνικό επάγγελμα (Ηλεκτρολόγος/υδραυλικός/κ.α)', 'Επαγγελματίας Υγείας', 'Τουρισμός/Καταλύματα', 'ΜΚΟ', 'Άλλο'] },
];

const ALL_TEXT_FIELDS = [...BILLING, ...CUSTOMER_CONTACT, ...PERSONAL, ...BANK];

export const BusinessIdentityCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [data, setData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    supabase.from('finance_settings').select('*').eq('workspace_id', workspaceId).maybeSingle()
      .then(({ data: row }) => { if (!cancelled) { setData(row ?? { workspace_id: workspaceId }); setLoading(false); } });
    return () => { cancelled = true; };
  }, [workspaceId]);

  const set = (k: string, v: any) => setData((d) => ({ ...d, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const patch: Record<string, any> = { workspace_id: workspaceId, updated_at: new Date().toISOString() };
      for (const f of ALL_TEXT_FIELDS) {
        patch[f.key] = data[f.key] ?? null;
        if (f.en) patch[`${f.key}_en`] = data[`${f.key}_en`] ?? null;
      }
      patch.business_company_type = data.business_company_type ?? null;
      patch.business_seasonal = !!data.business_seasonal;
      patch.main_activity = data.main_activity ?? null;
      const { error } = await supabase.from('finance_settings').upsert(patch, { onConflict: 'workspace_id' });
      if (error) throw error;
      toast({ title: 'Business profile saved' });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
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

  if (loading) return <Card className="lg:col-span-2"><CardContent className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4" /> Business profile (invoicing &amp; myDATA)</CardTitle>
        <Button size="sm" onClick={save} disabled={saving} className="rounded-full">
          {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Save
        </Button>
      </CardHeader>
      <CardContent className="p-5">
        <Tabs defaultValue="billing" className="space-y-4">
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            {[['billing', '1. Billing'], ['contact', '2. Customer contact'], ['personal', '3. Personal'], ['company', '4. My company'], ['bank', 'Bank & logo']].map(([v, l]) => (
              <TabsTrigger key={v} value={v} className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{l}</TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="billing">
            <p className="text-xs text-muted-foreground mb-3">Shown when issuing e-invoices &amp; receipts and transmitted to myDATA — mandatory.</p>
            <Bilingual fields={BILLING} data={data} set={set} />
          </TabsContent>

          <TabsContent value="contact">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-muted-foreground">Shown in the emails your customers receive.</p>
              <Button size="sm" variant="outline" onClick={copyBillingToContact}><Copy className="h-3.5 w-3.5 mr-1" /> Copy from billing</Button>
            </div>
            <Bilingual fields={CUSTOMER_CONTACT} data={data} set={set} />
          </TabsContent>

          <TabsContent value="personal">
            <p className="text-xs text-muted-foreground mb-3">Personal &amp; confidential — used only for support contact, never shown publicly.</p>
            <Grid fields={PERSONAL} data={data} set={set} />
          </TabsContent>

          <TabsContent value="company" className="space-y-3">
            <div className="space-y-1">
              <Label>Τύπος Εταιρίας / Company type</Label>
              <Select value={data.business_company_type ?? ''} onValueChange={(v) => set('business_company_type', v)}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>{COMPANY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Η εταιρία λειτουργεί / Operating</Label>
              <Select value={data.business_seasonal ? 'seasonal' : 'all_year'} onValueChange={(v) => set('business_seasonal', v === 'seasonal')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_year">Λειτουργεί όλο το έτος</SelectItem>
                  <SelectItem value="seasonal">Εποχική λειτουργία</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Κύρια δραστηριότητα / Main activity</Label>
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
          </TabsContent>

          <TabsContent value="bank" className="space-y-4">
            <Grid fields={BANK} data={data} set={set} />
            <div className="space-y-2">
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

const Bilingual: React.FC<{ fields: Field[]; data: Record<string, any>; set: (k: string, v: any) => void }> = ({ fields, data, set }) => (
  <div className="space-y-2">
    <div className="hidden md:grid grid-cols-[160px_1fr_1fr] gap-3 text-xs text-muted-foreground">
      <span /><span>Ελληνικά</span><span>Αγγλικά (English)</span>
    </div>
    {fields.map((f) => (
      <div key={f.key} className="grid grid-cols-1 md:grid-cols-[160px_1fr_1fr] gap-3 md:items-center">
        <Label className="text-xs">{f.label}</Label>
        <Input value={data[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} />
        {f.en
          ? <Input value={data[`${f.key}_en`] ?? ''} onChange={(e) => set(`${f.key}_en`, e.target.value)} />
          : <div className="hidden md:block" />}
      </div>
    ))}
  </div>
);

const Grid: React.FC<{ fields: Field[]; data: Record<string, any>; set: (k: string, v: any) => void }> = ({ fields, data, set }) => (
  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
    {fields.map((f) => (
      <div key={f.key} className={`space-y-1 ${f.textarea ? 'md:col-span-2' : ''}`}>
        <Label>{f.label}</Label>
        {f.textarea
          ? <Textarea rows={2} value={data[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} />
          : <Input value={data[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} />}
      </div>
    ))}
  </div>
);
