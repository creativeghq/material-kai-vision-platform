/**
 * Business Details — the legal entity that processes payments + appears on invoices.
 *
 * Stored on `finance_settings.business_*` columns (one row per workspace, single
 * source of truth). The Finance module SettingsTab edits the same fields, so
 * updates here are immediately visible at /admin/finance → Settings.
 *
 * Mounted as a settingsPanel on /admin/modules/payments/settings → Business.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Save, Building2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Props { embedded?: boolean }

interface BusinessFields {
  business_name: string;
  business_vat: string;
  business_tax_office: string;
  business_address: string;
  business_city: string;
  business_postal_code: string;
  business_country_code: string;
  business_phone: string;
  business_email: string;
  business_website: string;
}

const EMPTY: BusinessFields = {
  business_name: '',
  business_vat: '',
  business_tax_office: '',
  business_address: '',
  business_city: '',
  business_postal_code: '',
  business_country_code: '',
  business_phone: '',
  business_email: '',
  business_website: '',
};

export const BusinessDetailsPanel: React.FC<Props> = (_props) => {
  const { toast } = useToast();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [fields, setFields] = useState<BusinessFields>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data: member } = await (supabase as any)
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      const wsId = member?.workspace_id;
      if (!wsId) throw new Error('No workspace for this user');
      setWorkspaceId(wsId);

      const { data: settings } = await (supabase as any)
        .from('finance_settings')
        .select('business_name, business_vat, business_tax_office, business_address, business_city, business_postal_code, business_country_code, business_phone, business_email, business_website')
        .eq('workspace_id', wsId)
        .maybeSingle();

      if (settings) {
        setFields({ ...EMPTY, ...settings });
      }
    } catch (err: any) {
      toast({ title: 'Failed to load business details', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    if (!workspaceId) return;
    try {
      setSaving(true);
      const { error } = await (supabase as any)
        .from('finance_settings')
        .upsert({ workspace_id: workspaceId, ...fields }, { onConflict: 'workspace_id' });
      if (error) throw error;
      toast({ title: 'Business details saved' });
    } catch (err: any) {
      toast({ title: 'Failed to save', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const update = (k: keyof BusinessFields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields(prev => ({ ...prev, [k]: e.target.value }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card className="dashboard-card">
      <CardHeader>
        <CardTitle className="text-base font-light flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          Business details
        </CardTitle>
        <CardDescription>
          The legal entity that processes payments. Shown on invoices, used as the Stripe
          statement descriptor source, and printed on every customer-facing document. One
          source of truth — also editable at <code>/admin/finance → Settings</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Legal / trading name *" value={fields.business_name} onChange={update('business_name')} disabled={saving} placeholder="Acme Materials GmbH" />
          <Field label="VAT number" value={fields.business_vat} onChange={update('business_vat')} disabled={saving} placeholder="EL123456789" />
          <Field label="Tax office" value={fields.business_tax_office} onChange={update('business_tax_office')} disabled={saving} />
          <Field label="Phone" value={fields.business_phone} onChange={update('business_phone')} disabled={saving} />
          <Field label="Email" value={fields.business_email} onChange={update('business_email')} disabled={saving} type="email" />
          <Field label="Website" value={fields.business_website} onChange={update('business_website')} disabled={saving} placeholder="https://example.com" />
        </div>

        <div className="space-y-2">
          <Label className="text-sm">Address</Label>
          <Input value={fields.business_address} onChange={update('business_address')} disabled={saving} placeholder="Street + number" />
          <div className="grid grid-cols-3 gap-2">
            <Input value={fields.business_postal_code} onChange={update('business_postal_code')} disabled={saving} placeholder="Postal code" />
            <Input value={fields.business_city} onChange={update('business_city')} disabled={saving} placeholder="City" className="col-span-1" />
            <Input value={fields.business_country_code} onChange={update('business_country_code')} disabled={saving} placeholder="Country (ISO)" maxLength={2} />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={saving || !fields.business_name.trim()}>
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : <><Save className="h-4 w-4 mr-2" />Save business details</>}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  placeholder?: string;
  type?: string;
}> = ({ label, value, onChange, disabled, placeholder, type }) => (
  <div className="space-y-1">
    <Label className="text-xs">{label}</Label>
    <Input type={type || 'text'} value={value} onChange={onChange} disabled={disabled} placeholder={placeholder} />
  </div>
);
