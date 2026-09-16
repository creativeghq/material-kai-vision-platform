import { useState } from 'react';

import { Button } from '@/components/core/ui/button';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface CertificateDraft {
  id?: string;
  standard: string;
  certificate_number: string;
  issuer: string;
  scope: string;
  result: string;
  valid_from: string;
  valid_until: string;
  notes: string;
}

export const emptyDraft = (standard = ''): CertificateDraft => ({
  standard, certificate_number: '', issuer: '', scope: '', result: '',
  valid_from: '', valid_until: '', notes: '',
});

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

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="cert-standard">Standard</Label>
            <Input
              id="cert-standard" value={form.standard}
              onChange={(e) => set('standard', e.target.value)}
              placeholder="EN 13501-1"
            />
          </div>
          <div>
            <Label htmlFor="cert-result">Result</Label>
            <Input
              id="cert-result" value={form.result}
              onChange={(e) => set('result', e.target.value)}
              placeholder="A1"
            />
          </div>
          <div>
            <Label htmlFor="cert-number">Certificate number</Label>
            <Input
              id="cert-number" value={form.certificate_number}
              onChange={(e) => set('certificate_number', e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="cert-issuer">Issuer</Label>
            <Input
              id="cert-issuer" value={form.issuer}
              onChange={(e) => set('issuer', e.target.value)}
              placeholder="Notified body or laboratory"
            />
          </div>
          <div>
            <Label htmlFor="cert-scope">Scope</Label>
            <Input
              id="cert-scope" value={form.scope}
              onChange={(e) => set('scope', e.target.value)}
              placeholder="What the certificate covers"
            />
          </div>
          <div>
            <Label htmlFor="cert-from">Valid from</Label>
            <Input
              id="cert-from" type="date" value={form.valid_from}
              onChange={(e) => set('valid_from', e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="cert-until">Valid until</Label>
            <Input
              id="cert-until" type="date" value={form.valid_until}
              onChange={(e) => set('valid_until', e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="cert-notes">Notes</Label>
            <Textarea
              id="cert-notes" value={form.notes} rows={2}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Internal — never shown outside this workspace"
            />
          </div>
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
