import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { escapeHtml } from '@/utils/escapeHtml';
import { normalizeSignatureCard, renderSignatureHtml, signatureDocument, type SignatureCard } from '@/utils/emailSignature';

const EMPTY: SignatureCard = {
  name: '', title: '', company: '', phone: '', email: '', website: '', address: '', tagline: '', logo_url: '', confidentiality: false,
};

const FIELDS: Array<{ key: Exclude<keyof SignatureCard, 'confidentiality'>; label: string; placeholder: string }> = [
  { key: 'name', label: 'Name', placeholder: 'Maria Papadopoulou' },
  { key: 'title', label: 'Job title', placeholder: 'Sales Manager' },
  { key: 'company', label: 'Company', placeholder: 'Example Ltd' },
  { key: 'phone', label: 'Phone', placeholder: '+30 210 000 0000' },
  { key: 'email', label: 'Email', placeholder: 'maria@example.gr' },
  { key: 'website', label: 'Website', placeholder: 'example.gr' },
  { key: 'address', label: 'Location', placeholder: 'Thessaloniki, Greece' },
  { key: 'tagline', label: 'Tagline', placeholder: 'One line about the business' },
  { key: 'logo_url', label: 'Logo image URL (https)', placeholder: 'https://…/logo.png' },
];

export const SignatureDesignerDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: SignatureCard | null;
  onSave: (card: SignatureCard) => Promise<boolean>;
}> = ({ open, onOpenChange, initial, onSave }) => {
  const [card, setCard] = useState<SignatureCard>(initial ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const initialRef = useRef(initial);
  initialRef.current = initial;
  // Reset only when the dialog OPENS; a parent re-render must not wipe what is being typed.
  useEffect(() => { if (open) setCard(initialRef.current ?? EMPTY); }, [open]);

  const normalized = useMemo(() => normalizeSignatureCard(card), [card]);
  const previewHtml = useMemo(() => (normalized ? renderSignatureHtml(normalized, escapeHtml) : ''), [normalized]);
  const logoRejected = !!card.logo_url.trim() && !normalized?.logo_url;
  const emailRejected = !!card.email.trim() && !normalized?.email;

  const save = async () => {
    if (!normalized) return;
    setBusy(true);
    const ok = await onSave(normalized);
    setBusy(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Design your email signature</DialogTitle>
          <DialogDescription>Added under the emails you send from the Inbox mailbox: replies, new emails, scheduled emails and follow-ups. Connected Gmail accounts use Gmail's own signature.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="grid gap-3">
            {FIELDS.map((f) => (
              <div key={f.key} className="grid gap-1">
                <Label htmlFor={`sig-${f.key}`} className="text-xs">{f.label}</Label>
                <Input
                  id={`sig-${f.key}`} value={card[f.key]} placeholder={f.placeholder} className="h-8 text-sm"
                  onChange={(e) => setCard((c) => ({ ...c, [f.key]: e.target.value }))}
                />
              </div>
            ))}
            {emailRejected && <p className="text-xs text-destructive">That email address is not valid, so it is left out.</p>}
            {logoRejected && <p className="text-xs text-destructive">The logo must be an https:// image address, or it is left out.</p>}
            <label htmlFor="sig-confidentiality" className="flex items-center gap-2 text-xs">
              <Checkbox id="sig-confidentiality" checked={card.confidentiality} onCheckedChange={(v) => setCard((c) => ({ ...c, confidentiality: v === true }))} />
              Add a confidentiality note
            </label>
          </div>
          <div className="min-w-0 space-y-1.5">
            <p className="text-xs font-semibold">Preview</p>
            {previewHtml
              ? (
                <iframe
                  title="Signature preview" sandbox=""
                  srcDoc={signatureDocument(previewHtml)}
                  className="h-64 w-full rounded-sm border border-hairline bg-white"
                />
              )
              : <p className="rounded-sm border border-hairline p-4 text-xs text-muted-foreground">Enter your name to see the signature.</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { void save(); }} disabled={!normalized || busy}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}Save signature
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
