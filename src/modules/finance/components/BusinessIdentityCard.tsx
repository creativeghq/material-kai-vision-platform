/**
 * Business identity for invoices (the myDATA issuer block). Per-workspace — each
 * business fills its legal details + logo; these print on invoices and are the
 * issuer.vatNumber/name/address transmitted to myDATA via the operator's Novus key.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Save, Upload, Building2, ImageIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const FIELDS: { key: string; label: string; en?: boolean }[] = [
  { key: 'business_name', label: 'Company name (Επωνυμία)', en: true },
  { key: 'business_profession', label: 'Activity (Δραστηριότητα)', en: true },
  { key: 'business_vat', label: 'VAT / ΑΦΜ' },
  { key: 'business_gemi', label: 'ΓΕΜΗ no.' },
  { key: 'business_tax_office', label: 'Tax office (ΔΟΥ)' },
  { key: 'business_company_type', label: 'Company type' },
];
const ADDRESS: { key: string; label: string }[] = [
  { key: 'business_address', label: 'Street (Οδός)' },
  { key: 'business_street_number', label: 'Number (Αριθμός)' },
  { key: 'business_postal_code', label: 'Postal code (Τ.Κ.)' },
  { key: 'business_city', label: 'City (Πόλη)' },
  { key: 'business_country_code', label: 'Country code (e.g. GR)' },
];
const CONTACT: { key: string; label: string }[] = [
  { key: 'business_phone', label: 'Phone' },
  { key: 'business_fax', label: 'Fax' },
  { key: 'business_email', label: 'Email' },
  { key: 'business_website', label: 'Website' },
];
const BANK: { key: string; label: string }[] = [
  { key: 'bank_name', label: 'Bank name' },
  { key: 'bank_iban', label: 'IBAN' },
  { key: 'bank_beneficiary', label: 'Beneficiary' },
];

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
      for (const f of [...FIELDS, ...ADDRESS, ...CONTACT, ...BANK]) {
        patch[f.key] = data[f.key] ?? null;
        if ((f as any).en) patch[`${f.key}_en`] = data[`${f.key}_en`] ?? null;
      }
      const { error } = await supabase.from('finance_settings').upsert(patch, { onConflict: 'workspace_id' });
      if (error) throw error;
      toast({ title: 'Business identity saved' });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

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
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4" /> Business identity (for invoices &amp; myDATA)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 p-5">
        <Section title="Legal details">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label>{f.label}</Label>
                <Input value={data[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} />
                {f.en && <Input className="mt-1" placeholder="English (optional)" value={data[`${f.key}_en`] ?? ''} onChange={(e) => set(`${f.key}_en`, e.target.value)} />}
              </div>
            ))}
          </div>
        </Section>
        <Section title="Address"><Grid fields={ADDRESS} data={data} set={set} /></Section>
        <Section title="Contact"><Grid fields={CONTACT} data={data} set={set} /></Section>
        <Section title="Bank (printed on invoices)"><Grid fields={BANK} data={data} set={set} /></Section>

        <Section title="Logo">
          <div className="flex items-center gap-4">
            <div className="h-20 w-40 rounded-md border border-border/60 bg-muted/20 flex items-center justify-center overflow-hidden">
              {logoUrl ? <img src={logoUrl} alt="logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted-foreground flex items-center gap-1"><ImageIcon className="h-4 w-4" /> No logo</span>}
            </div>
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />} {logoUrl ? 'Replace' : 'Upload'} logo
            </Button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ''; }} />
          </div>
        </Section>

        <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Save business identity</Button>
      </CardContent>
    </Card>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="space-y-2">
    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
    {children}
  </div>
);

const Grid: React.FC<{ fields: { key: string; label: string }[]; data: Record<string, any>; set: (k: string, v: any) => void }> = ({ fields, data, set }) => (
  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
    {fields.map((f) => (
      <div key={f.key} className="space-y-1">
        <Label>{f.label}</Label>
        <Input value={data[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} />
      </div>
    ))}
  </div>
);
