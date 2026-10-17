import { useState } from 'react';

import { Button } from '@/components/core/ui/button';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { Input } from '@/components/core/ui/input';
import { FormField, FormGrid, FormSection } from '@/components/core/ui/form-layout';
import { Textarea } from '@/components/core/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { type CertificateDraft, emptyDraft } from './certificateValidity';

const orNull = (v: string) => (v.trim() === '' ? null : v.trim());

interface Props {
  productId: string;
  draft: CertificateDraft | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ProductCertificateDialog({ productId, draft, onClose, onSaved }: Props) {
  const [form, setForm] = useState<CertificateDraft>(draft ?? emptyDraft());
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const set = <K extends keyof CertificateDraft>(k: K, v: CertificateDraft[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.standard.trim()) return;
    setSaving(true);
    // Named field by field: a spread form object is the mass-assignment shape.
    const payload = {
      product_id: productId,
      standard: form.standard.trim(),
      certificate_number: orNull(form.certificate_number),
      issuer: orNull(form.issuer),
      scope: orNull(form.scope),
      result: orNull(form.result),
      valid_from: orNull(form.valid_from),
      valid_until: orNull(form.valid_until),
      notes: orNull(form.notes),
    };

    const { error } = form.id
      ? await supabase.from('product_certificates').update(payload).eq('id', form.id)
      : await supabase.from('product_certificates').insert(payload);

    setSaving(false);
    if (error) {
      toast({ title: 'Certificate not saved', description: error.message, variant: 'destructive' });
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <Dialog open={draft !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-sans">
            {form.id ? 'Edit certificate' : 'Add certificate'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <FormSection title="Certificate">
            <FormGrid>
              <FormField label="Standard" htmlFor="cert-standard" className="sm:col-span-2">
                <Input
                  id="cert-standard" value={form.standard}
                  onChange={(e) => set('standard', e.target.value)}
                  placeholder="EN 13501-1"
                />
              </FormField>
              <FormField label="Result" htmlFor="cert-result" optional>
                <Input
                  id="cert-result" value={form.result}
                  onChange={(e) => set('result', e.target.value)}
                  placeholder="A1"
                />
              </FormField>
              <FormField label="Certificate number" htmlFor="cert-number" optional>
                <Input
                  id="cert-number" value={form.certificate_number}
                  onChange={(e) => set('certificate_number', e.target.value)}
                />
              </FormField>
              <FormField label="Issuer" htmlFor="cert-issuer" optional>
                <Input
                  id="cert-issuer" value={form.issuer}
                  onChange={(e) => set('issuer', e.target.value)}
                  placeholder="Notified body or laboratory"
                />
              </FormField>
              <FormField label="Scope" htmlFor="cert-scope" optional>
                <Input
                  id="cert-scope" value={form.scope}
                  onChange={(e) => set('scope', e.target.value)}
                  placeholder="What the certificate covers"
                />
              </FormField>
            </FormGrid>
          </FormSection>

          <FormSection title="Validity">
            <FormGrid>
              <FormField label="Valid from" htmlFor="cert-from" optional>
                <Input
                  id="cert-from" type="date" value={form.valid_from}
                  onChange={(e) => set('valid_from', e.target.value)}
                />
              </FormField>
              <FormField label="Valid until" htmlFor="cert-until" optional>
                <Input
                  id="cert-until" type="date" value={form.valid_until}
                  onChange={(e) => set('valid_until', e.target.value)}
                />
              </FormField>
            </FormGrid>
          </FormSection>

          <FormSection title="Notes">
            <FormField label="Notes" htmlFor="cert-notes" optional hint="Internal — never shown outside this workspace.">
              <Textarea
                id="cert-notes" value={form.notes} rows={2}
                onChange={(e) => set('notes', e.target.value)}
              />
            </FormField>
          </FormSection>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving || !form.standard.trim()}>
            {saving ? 'Saving…' : 'Save certificate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
