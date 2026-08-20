import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, ArrowRight, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/core/ui/dialog';
import { CONNECT_EMAIL_PATH } from '@/modules/email/lib/emailSenderGate';

/**
 * Shown anywhere a tenant tries to send business email (quote, invoice, statement, catalog,
 * CRM contact, PO, campaign) but the workspace hasn't connected its OWN Resend sender yet.
 *
 * Tenants never send from the operator's platform address — they bring their own verified
 * sender. This modal explains that and deep-links to Profile → Keys to set it up.
 */
export const ConnectEmailModal: React.FC<{
  open: boolean;
  onClose: () => void;
  /** Human label of the feature that was blocked, e.g. "quote", "invoice". */
  feature?: string;
}> = ({ open, onClose, feature }) => {
  const navigate = useNavigate();
  const what = feature ? `send this ${feature}` : 'send this email';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" /> Connect your email to send
          </DialogTitle>
          <DialogDescription>
            To {what}, this workspace needs its own email sender. Emails go out from
            <span className="font-medium text-foreground"> your own verified address</span> —
            not a shared platform address — so replies and deliverability stay under your brand.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm text-muted-foreground flex items-start gap-2.5">
          <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
          <span>
            You'll add a Resend API key and a verified sender once. After that, every quote,
            invoice, statement, catalog and campaign sends from your address automatically.
          </span>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Not now</Button>
          <Button
            onClick={() => { onClose(); navigate(CONNECT_EMAIL_PATH); }}
          >
            Connect email <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConnectEmailModal;
