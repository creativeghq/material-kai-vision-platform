import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Send, FileText, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { escapeHtml } from '@/utils/escapeHtml';
import { useToast } from '@/hooks/use-toast';
import { emailService, isSenderNotConfigured } from '@/modules/email/services/emailService';
import { ConnectEmailModal } from '@/modules/email/components/ConnectEmailModal';
import { notifyEmailSenderNotConfigured } from '@/modules/email/lib/emailSenderGate';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Badge } from '@/components/core/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/core/ui/tabs';

export interface EmailRecipientOption {
  email: string;
  name?: string | null;
  /** 'company' = the org's general inbox; 'contact' = a person. Cosmetic (a badge). */
  kind?: 'contact' | 'company';
}

interface SendEmailDialogProps {
  open: boolean;
  onClose: () => void;
  /**
   * Candidate recipients. When 2+, the dialog shows a To-picker so the user can
   * send to one or several. Falls back to `toEmail`/`toName` for a single recipient.
   */
  recipients?: EmailRecipientOption[];
  /** Emails pre-checked in the To-picker (subset of `recipients`). Defaults to all. */
  initialSelected?: string[];
  /** Single-recipient shorthand (used when `recipients` is omitted). */
  toEmail?: string;
  /** Display name of the recipient, used for greeting prefilling. Optional. */
  toName?: string | null;
  /** Free-form context shown in the dialog header (e.g. "Granitifiandre Spa"). */
  recipientLabel?: string | null;
  /** Workspace whose OWN Resend BYOK sender the email must go out from. Tenant business mail
   *  never sends from the platform address — a missing sender surfaces the Connect-email modal. */
  workspaceId?: string | null;
  /** Called after a successful send (used to log a CRM activity). */
  onSent?: (info: { subject: string; recipients: string[] }) => void;
}

interface EmailTemplateRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  subject_template: string | null;
  html_template: string | null;
  text_template: string | null;
  variables: string[] | null;
  category: string | null;
}

/**
 * Modal to send an email to a CRM contact / company. Two modes:
 *  - "From template" — pick an active email_templates row, fill in any declared
 *    variables, send via email-api with the template's slug.
 *  - "Custom" — write subject + body once, send as a one-off transactional email.
 */
export const SendEmailDialog: React.FC<SendEmailDialogProps> = ({
  open, onClose, recipients, initialSelected, toEmail, toName, recipientLabel, workspaceId, onSent,
}) => {
  const { toast } = useToast();
  const [showConnect, setShowConnect] = useState(false);

  // Effective candidate list: explicit `recipients`, else the single toEmail shorthand.
  const candidates: EmailRecipientOption[] = useMemo(() => {
    const list = (recipients ?? []).filter((r) => (r.email ?? '').trim());
    if (list.length > 0) return list;
    return toEmail?.trim() ? [{ email: toEmail.trim(), name: toName ?? null }] : [];
  }, [recipients, toEmail, toName]);
  const multiRecipient = candidates.length > 1;

  // Which candidates the email goes to (emails). Reset whenever the dialog (re)opens.
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  useEffect(() => {
    if (!open) return;
    const all = candidates.map((c) => c.email);
    const seed = (initialSelected ?? []).filter((e) => all.includes(e));
    setSelectedEmails(seed.length > 0 ? seed : all);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const toggleRecipient = (email: string) =>
    setSelectedEmails((prev) => (prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]));
  // Name used to seed the greeting — the first selected recipient (or first candidate).
  const primaryName = (candidates.find((c) => selectedEmails.includes(c.email)) ?? candidates[0])?.name ?? toName ?? null;

  // Tenant business mail must go from the workspace's own sender. When email-api 503s because no
  // BYOK is configured, surface the Connect-email modal + raise the admin bell instead of a raw error.
  const handleSenderBlocked = async () => {
    setShowConnect(true);
    await notifyEmailSenderNotConfigured({ workspaceId, feature: 'crm_contact' });
  };
  const [templates, setTemplates] = useState<EmailTemplateRow[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [mode, setMode] = useState<'template' | 'custom'>('template');

  // Template mode state
  const [selectedTemplateSlug, setSelectedTemplateSlug] = useState<string>('');
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});

  // Custom mode state
  const [customSubject, setCustomSubject] = useState('');
  const [customBody, setCustomBody] = useState('');

  // Send state
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoadingTemplates(true);
      try {
        // Only surface human-sendable templates here. System/automation templates
        // (is_system=true — price/mention alerts, digests, auth, role-upgrade, …) are
        // fired by the Flows engine + backend dispatchers, never picked by hand, so
        // they'd only clutter this picker. Also scope to this workspace's own templates
        // plus the shared platform ones (workspace_id IS NULL) — never other tenants'.
        let query = supabase
          .from('email_templates')
          .select('id, name, slug, description, subject_template, html_template, text_template, variables, category')
          .eq('is_active', true)
          .eq('is_system', false);
        query = workspaceId
          ? query.or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
          : query.is('workspace_id', null);
        const { data, error } = await query.order('name', { ascending: true });
        if (error) throw error;
        if (cancelled) return;
        const rows = (data ?? []) as EmailTemplateRow[];
        setTemplates(rows);
        // If no templates available, default mode to custom so the dialog is useful
        if (rows.length === 0) setMode('custom');
      } catch (err: any) {
        if (!cancelled) {
          toast({ title: 'Could not load templates', description: err?.message, variant: 'destructive' });
        }
      } finally {
        if (!cancelled) setLoadingTemplates(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, toast, workspaceId]);

  // Reset when dialog opens. Greeting is seeded from the first candidate's name.
  useEffect(() => {
    if (!open) return;
    const seedName = candidates[0]?.name ?? toName ?? null;
    setSelectedTemplateSlug('');
    setTemplateVars({});
    setCustomSubject('');
    setCustomBody(seedName ? `Hi ${seedName.split(' ')[0]},\n\n` : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.slug === selectedTemplateSlug) ?? null,
    [templates, selectedTemplateSlug],
  );

  // Reset variable inputs when template changes
  useEffect(() => {
    if (!selectedTemplate) { setTemplateVars({}); return; }
    const next: Record<string, string> = {};
    for (const v of selectedTemplate.variables ?? []) {
      next[v] = templateVars[v] ?? '';
    }
    // Seed obvious greeting variable if present
    if ('name' in next && !next.name && primaryName) next.name = primaryName;
    setTemplateVars(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplate, primaryName]);

  const allVarsFilled = !selectedTemplate?.variables?.length ||
    selectedTemplate.variables.every((v) => (templateVars[v] ?? '').trim().length > 0);
  const hasRecipient = selectedEmails.length > 0;
  const canSendTemplate = !!selectedTemplate && !sending && allVarsFilled && hasRecipient;
  const canSendCustom = customSubject.trim().length > 0 && customBody.trim().length > 0 && !sending && hasRecipient;

  // A send goes to one address (string) or several (array). First goes on To, the rest CC.
  const sendTo = selectedEmails.length === 1 ? selectedEmails[0] : selectedEmails;
  const sentDescription = (messageId: string) =>
    `${selectedEmails.length === 1 ? `Delivered to ${selectedEmails[0]}` : `Delivered to ${selectedEmails.length} recipients`} · message ${messageId.slice(0, 12)}…`;

  const handleSendTemplate = async () => {
    if (!selectedTemplate || !hasRecipient) return;
    setSending(true);
    try {
      const result = await emailService.sendEmail({
        to: sendTo,
        subject: selectedTemplate.subject_template || selectedTemplate.name,
        templateSlug: selectedTemplate.slug,
        variables: templateVars,
        emailType: 'transactional',
        workspaceId: workspaceId ?? undefined,
        requireWorkspaceSender: true,
      });
      toast({ title: 'Email sent', description: sentDescription(result.messageId) });
      onSent?.({ subject: selectedTemplate.subject_template || selectedTemplate.name, recipients: selectedEmails });
      onClose();
    } catch (err: any) {
      if (isSenderNotConfigured(err)) { await handleSenderBlocked(); return; }
      toast({ title: 'Send failed', description: err?.message ?? 'Unknown error', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const handleSendCustom = async () => {
    if (!hasRecipient || !customSubject.trim() || !customBody.trim()) return;
    setSending(true);
    try {
      // The body comes in as plain text; convert newlines so it renders as
      // paragraphs in the email client. Anything fancier (markdown / rich text)
      // is a follow-up — keeping v1 simple.
      const htmlBody = `<div style="font-family:'Open Sans',Arial,sans-serif;font-size:14px;line-height:1.6;color:#222;white-space:pre-wrap">${escapeHtml(customBody)}</div>`;
      const result = await emailService.sendEmail({
        to: sendTo,
        subject: customSubject.trim(),
        html: htmlBody,
        text: customBody.trim(),
        emailType: 'transactional',
        workspaceId: workspaceId ?? undefined,
        requireWorkspaceSender: true,
      });
      toast({ title: 'Email sent', description: sentDescription(result.messageId) });
      onSent?.({ subject: customSubject.trim(), recipients: selectedEmails });
      onClose();
    } catch (err: any) {
      if (isSenderNotConfigured(err)) { await handleSenderBlocked(); return; }
      toast({ title: 'Send failed', description: err?.message ?? 'Unknown error', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
    <ConnectEmailModal open={showConnect} onClose={() => setShowConnect(false)} feature="email" />
    <Dialog open={open} onOpenChange={(o) => { if (!o && !sending) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Send email
            {recipientLabel && (
              <span className="text-sm font-normal text-muted-foreground">· {recipientLabel}</span>
            )}
          </DialogTitle>
          <DialogDescription>
            {multiRecipient
              ? `Sending to ${selectedEmails.length} of ${candidates.length} recipients`
              : (<>To <span className="font-medium text-foreground">{candidates[0]?.email ?? '—'}</span>{candidates[0]?.name ? ` (${candidates[0].name})` : ''}</>)}
          </DialogDescription>
        </DialogHeader>

        {/* To-picker — only when there's more than one candidate (company record). */}
        {multiRecipient && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">To</Label>
            <div className="flex flex-wrap gap-1.5">
              {candidates.map((c) => {
                const on = selectedEmails.includes(c.email);
                return (
                  <button
                    key={c.email}
                    type="button"
                    onClick={() => toggleRecipient(c.email)}
                    title={c.email}
                    className={[
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                      on ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:border-primary hover:text-foreground',
                    ].join(' ')}
                  >
                    <span className="max-w-[14rem] truncate">{c.name || c.email}{c.kind === 'company' ? ' (company)' : ''}</span>
                  </button>
                );
              })}
            </div>
            {!hasRecipient && <p className="text-[11px] text-destructive">Pick at least one recipient.</p>}
          </div>
        )}

        <Tabs value={mode} onValueChange={(v) => setMode(v as 'template' | 'custom')}>
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            <TabsTrigger value="template">
              <FileText className="h-4 w-4 mr-1.5" /> From template
            </TabsTrigger>
            <TabsTrigger value="custom">
              <Mail className="h-4 w-4 mr-1.5" /> Custom email
            </TabsTrigger>
          </TabsList>

          <TabsContent value="template" className="space-y-4 pt-4">
            {loadingTemplates ? (
              <div className="flex items-center gap-2 justify-center py-6 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading templates…
              </div>
            ) : templates.length === 0 ? (
              <div className="rounded border border-dashed p-4 text-sm text-muted-foreground">
                No active email templates yet. Create some at <code>/admin/email</code> or switch to "Custom email".
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="template-select">Template</Label>
                  <Select value={selectedTemplateSlug} onValueChange={setSelectedTemplateSlug}>
                    <SelectTrigger id="template-select">
                      <SelectValue placeholder="Pick a template…" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.slug}>
                          <div className="flex items-center gap-2">
                            <span>{t.name}</span>
                            {t.category && (
                              <Badge variant="outline" className="text-[10px]">{t.category}</Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedTemplate?.description && (
                    <p className="text-xs text-muted-foreground">{selectedTemplate.description}</p>
                  )}
                </div>

                {selectedTemplate?.subject_template && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Subject preview</Label>
                    <div className="rounded border bg-muted/30 p-2 text-sm font-medium">
                      {selectedTemplate.subject_template}
                    </div>
                  </div>
                )}

                {selectedTemplate && (selectedTemplate.variables?.length ?? 0) > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Variables</Label>
                    <div className="space-y-2">
                      {selectedTemplate.variables!.map((v) => (
                        <div key={v}>
                          <Label htmlFor={`var-${v}`} className="text-xs">{v}</Label>
                          <Input
                            id={`var-${v}`}
                            value={templateVars[v] ?? ''}
                            onChange={(e) => setTemplateVars({ ...templateVars, [v]: e.target.value })}
                            placeholder={`Value for {{${v}}}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedTemplate && (selectedTemplate.variables?.length ?? 0) === 0 && (
                  <p className="text-xs text-muted-foreground">
                    This template has no variables — it will send as-is.
                  </p>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="custom" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="custom-subject">Subject *</Label>
              <Input
                id="custom-subject"
                value={customSubject}
                onChange={(e) => setCustomSubject(e.target.value)}
                placeholder="What's this email about?"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-body">Body *</Label>
              <Textarea
                id="custom-body"
                value={customBody}
                onChange={(e) => setCustomBody(e.target.value)}
                rows={10}
                placeholder="Write your message. Plain text — line breaks become paragraphs."
                className="resize-y"
              />
              <p className="text-[10px] text-muted-foreground">
                Plain text. Newlines render as paragraph breaks. For HTML / templates use the template tab.
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={sending}>Cancel</Button>
          {mode === 'template' ? (
            <Button onClick={handleSendTemplate} disabled={!canSendTemplate}>
              {sending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
              Send
            </Button>
          ) : (
            <Button onClick={handleSendCustom} disabled={!canSendCustom}>
              {sending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
              Send
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
};

export default SendEmailDialog;
