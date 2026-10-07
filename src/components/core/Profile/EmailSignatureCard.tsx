import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Check, ClipboardCopy, Mail, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { HubEmptyState } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { escapeHtml } from '@/utils/escapeHtml';
import { renderSignatureHtml, renderSignatureText, signatureDocument, type SignatureCard } from '@/utils/emailSignature';
import type { ComposerSettings } from '@/pages/Inbox/useComposerSettings';
import { SignatureDesignerDialog } from './SignatureDesignerDialog';

interface EmailSignatureCardProps {
  settings: ComposerSettings;
  loaded: boolean;
  save: (patch: Partial<ComposerSettings>) => Promise<string | null>;
  defaults: SignatureCard;
  workspaceName: string | null;
  designerOpen: boolean;
  onDesignerOpenChange: (open: boolean) => void;
}

export const EmailSignatureCard: React.FC<EmailSignatureCardProps> = ({
  settings, loaded, save, defaults, workspaceName, designerOpen, onDesignerOpenChange,
}) => {
  const { toast } = useToast();
  const location = useLocation();
  const [copied, setCopied] = useState(false);
  const card = settings.signature_card;
  const plain = settings.email_signature.trim();
  const html = useMemo(() => (card ? renderSignatureHtml(card, escapeHtml) : ''), [card]);

  useEffect(() => {
    if (location.hash === '#email-signature') document.getElementById('email-signature')?.scrollIntoView({ block: 'start' });
  }, [location.hash, loaded]);

  const copyForMailApp = async () => {
    if (!card) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([renderSignatureText(card)], { type: 'text/plain' }),
      })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: 'Signature copied', description: 'Paste it into the signature settings of Gmail or Outlook.' });
    } catch {
      toast({ title: 'Could not copy', description: 'Your browser blocked the clipboard. Try again from the page, not a pop-up.', variant: 'destructive' });
    }
  };

  const remove = async () => {
    const err = await save({ signature_card: null, email_signature: '' });
    toast(err ? { title: 'Not removed', description: err, variant: 'destructive' } : { title: 'Signature removed' });
  };

  return (
    <Card id="email-signature" className="scroll-mt-20">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2"><Mail className="h-4 w-4 text-primary" />Email signature</CardTitle>
            <p className="text-xs text-muted-foreground">
              Added under the emails you send from the Inbox{workspaceName ? ` in ${workspaceName}` : ''}: replies, new emails, scheduled emails and follow-ups.
            </p>
          </div>
          {(card || plain) && (
            <div className="flex flex-wrap gap-2">
              {card && (
                <Button size="sm" variant="outline" onClick={() => { void copyForMailApp(); }}>
                  {copied ? <Check /> : <ClipboardCopy />}Copy for Gmail / Outlook
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => onDesignerOpenChange(true)}><Pencil />{card ? 'Edit' : 'Design'}</Button>
              <Button size="sm" variant="ghost" aria-label="Remove signature" title="Remove signature" onClick={() => { void remove(); }}><Trash2 /></Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {card ? (
          <iframe
            title="Email signature preview" sandbox="" srcDoc={signatureDocument(html)}
            className="h-56 w-full rounded-sm border border-hairline bg-white"
          />
        ) : plain ? (
          <div className="space-y-2">
            <pre className="whitespace-pre-wrap rounded-sm border border-hairline bg-surface-sunken p-3 font-sans text-sm">{plain}</pre>
            <p className="text-xs text-muted-foreground">A plain-text signature. Design one to add your logo, links and layout.</p>
          </div>
        ) : loaded ? (
          <HubEmptyState
            icon={Mail}
            title="No email signature yet"
            description="Your name, role, phone and company logo under every email, filled in from your profile and your business details."
            action={<Button size="sm" onClick={() => onDesignerOpenChange(true)}><Pencil />Design your signature</Button>}
          />
        ) : null}
      </CardContent>
      <SignatureDesignerDialog
        open={designerOpen}
        onOpenChange={onDesignerOpenChange}
        initial={card ?? defaults}
        onSave={async (next) => {
          const err = await save({ signature_card: next });
          toast(err ? { title: 'Not saved', description: err, variant: 'destructive' } : { title: 'Signature saved' });
          return !err;
        }}
      />
    </Card>
  );
};
