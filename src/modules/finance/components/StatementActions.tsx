/**
 * Shared party account-statement action row — the four actions used everywhere a
 * customer/supplier statement can be acted on (Finance → Parties drill-down, the CRM
 * party page, the Sales portal):
 *   • Email    — email the statement to the party (errors clearly when no email on file)
 *   • Download — generate the statement PDF (dry-run) and open it
 *   • Share    — mint/copy a public /statement/{token} link the party unlocks with VAT+email
 *   • View CRM — open the party's CRM record (hidden when already on it)
 *
 * Rendered as compact icon buttons by default (`variant="icons"`), or labelled buttons.
 *
 * A surface that puts these in an "Actions" menu instead of a button row calls
 * `usePartyStatementActions` and renders its own menu items — the WORK stays here so a menu
 * and a button row can never drift into two different email/share behaviours. The hook must be
 * called by the component that OWNS the menu, never inside `DropdownMenuContent`: Radix unmounts
 * that subtree on close, which would take the Connect-email modal down with it mid-flow.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Download, Share2, ExternalLink, Loader2, Check, Copy, RotateCcw } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/core/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { financeService } from '@/modules/finance/services/financeService';
import { useConnectEmailGate } from '@/modules/email/hooks/useConnectEmailGate';

export interface StatementActionsProps {
  partyType: 'company' | 'contact';
  partyId: string;
  workspaceId?: string | null;
  /** Party email (for the no-email pre-check on the Email action). */
  email?: string | null;
  side?: 'customer' | 'supplier';
  from?: string;
  to?: string;
  /** When false, Email + Download are disabled (finance statements turned off in Settings). */
  statementsEnabled?: boolean;
  /** CRM deep-link; when omitted the "View in CRM" action is not shown. */
  crmHref?: string;
  variant?: 'icons' | 'buttons';
  className?: string;
}

/** Everything `StatementActions` does, without the button row — for menu-shaped callers. */
export function usePartyStatementActions(opts: {
  partyType: 'company' | 'contact';
  partyId: string;
  email?: string | null;
  side?: 'customer' | 'supplier';
  from?: string;
  to?: string;
}) {
  const { partyType, partyId, email, side, from, to } = opts;
  const { toast } = useToast();
  const { handleEmailSendError, connectEmailGate } = useConnectEmailGate();
  const [busy, setBusy] = useState<null | 'email' | 'download' | 'share'>(null);
  const [copied, setCopied] = useState(false);

  const common = { partyType, partyId, side, from, to };

  const emailStatement = async () => {
    // Fast-guard only when the caller KNOWS there's no email (passed null/''). When the
    // prop is undefined (caller didn't have it handy) we let the server decide and report.
    if (email === null || email === '') {
      toast({ title: 'No email on file', description: 'Add an email to this record first, or use Share / Download instead.', variant: 'destructive' });
      return;
    }
    setBusy('email');
    try {
      const res = await financeService.sendStatement(common);
      if (res.ok && res.email_sent_to) {
        toast({ title: 'Statement emailed', description: `Sent to ${res.email_sent_to}` });
      } else if (res.ok && !res.email_sent_to) {
        // Server generated the PDF but had no address to send to → surface as an error, not success.
        toast({ title: 'Not sent', description: 'No email on file for this party. Use Share or Download instead.', variant: 'destructive' });
      } else {
        toast({ title: 'Send failed', description: res.error ?? 'Unknown error', variant: 'destructive' });
      }
    } catch (err: any) {
      if (await handleEmailSendError(err, { feature: 'statement' })) return;
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const downloadStatement = async () => {
    setBusy('download');
    try {
      const res = await financeService.sendStatement({ ...common, dryRun: true });
      if (res.ok && res.pdf_url) {
        window.open(res.pdf_url, '_blank', 'noopener');
      } else {
        toast({ title: 'Could not generate PDF', description: res.error ?? 'Unknown error', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const shareStatement = async (rotate = false) => {
    setBusy('share');
    try {
      const res = await financeService.mintStatementShareLink({ partyType, partyId, side, rotate });
      await navigator.clipboard.writeText(res.url).catch(() => { /* clipboard may be blocked */ });
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast({
        title: rotate ? 'New link copied — old one revoked' : 'Share link copied',
        description: 'The party unlocks it with their VAT + email.',
      });
    } catch (err: any) {
      toast({ title: 'Could not create link', description: err?.message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  return { emailStatement, downloadStatement, shareStatement, busy, copied, connectEmailGate };
}

export const StatementActions: React.FC<StatementActionsProps> = ({
  partyType, partyId, email, side, from, to, statementsEnabled = true, crmHref, variant = 'icons', className,
}) => {
  const { emailStatement, downloadStatement, shareStatement, busy, copied, connectEmailGate } =
    usePartyStatementActions({ partyType, partyId, email, side, from, to });

  const iconMode = variant === 'icons';
  const spin = (k: typeof busy, icon: React.ReactNode) => (busy === k ? <Loader2 className="h-4 w-4 animate-spin" /> : icon);

  const Btn: React.FC<{ onClick?: () => void; disabled?: boolean; title: string; icon: React.ReactNode; label: string }> = ({ onClick, disabled, title, icon, label }) =>
    iconMode ? (
      <Button type="button" variant="outline" size="icon" className="h-9 w-9" title={title} onClick={onClick} disabled={disabled}>{icon}</Button>
    ) : (
      <Button type="button" variant="outline" size="sm" title={title} onClick={onClick} disabled={disabled}>{icon}<span className="ml-2">{label}</span></Button>
    );

  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <Btn onClick={emailStatement} disabled={busy !== null || !statementsEnabled}
        title={statementsEnabled ? 'Email account statement' : 'Statements disabled in Settings'}
        icon={spin('email', <Mail className="h-4 w-4" />)} label="Email" />
      <Btn onClick={downloadStatement} disabled={busy !== null || !statementsEnabled}
        title={statementsEnabled ? 'Download PDF statement' : 'Statements disabled in Settings'}
        icon={spin('download', <Download className="h-4 w-4" />)} label="Download PDF" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {iconMode ? (
            <Button type="button" variant="outline" size="icon" className="h-9 w-9" title="Share statement" disabled={busy !== null}>
              {busy === 'share' ? <Loader2 className="h-4 w-4 animate-spin" /> : copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Share2 className="h-4 w-4" />}
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" title="Share statement" disabled={busy !== null}>
              {busy === 'share' ? <Loader2 className="h-4 w-4" /> : copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Share2 className="h-4 w-4" />}
              <span className="ml-2">{copied ? 'Copied' : 'Share'}</span>
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => shareStatement(false)}>
            <Copy className="h-3.5 w-3.5 mr-2" /> Copy share link
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => shareStatement(true)} className="text-destructive focus:text-destructive">
            <RotateCcw className="h-3.5 w-3.5 mr-2" /> Revoke &amp; re-issue link
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {crmHref && (
        iconMode ? (
          <Link to={crmHref}><Button type="button" variant="outline" size="icon" className="h-9 w-9" title="View in CRM"><ExternalLink className="h-4 w-4" /></Button></Link>
        ) : (
          <Link to={crmHref}><Button type="button" variant="outline" size="sm" title="View in CRM"><ExternalLink className="h-4 w-4 mr-2" /> View in CRM</Button></Link>
        )
      )}
      {connectEmailGate}
    </div>
  );
};

export default StatementActions;
