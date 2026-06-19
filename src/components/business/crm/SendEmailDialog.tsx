import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Send, FileText, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { emailService } from '@/modules/email/services/emailService';
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

interface SendEmailDialogProps {
  open: boolean;
  onClose: () => void;
  /** Recipient email address. Required. */
  toEmail: string;
  /** Display name of the recipient, used for greeting prefilling. Optional. */
  toName?: string | null;
  /** Free-form context shown in the dialog header (e.g. "Granitifiandre Spa"). */
  recipientLabel?: string | null;
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
  open, onClose, toEmail, toName, recipientLabel,
}) => {
  const { toast } = useToast();
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
        const { data, error } = await supabase
          .from('email_templates')
          .select('id, name, slug, description, subject_template, html_template, text_template, variables, category')
          .eq('is_active', true)
          .order('name', { ascending: true });
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
  }, [open, toast]);

  // Reset when dialog opens
  useEffect(() => {
    if (!open) return;
    setSelectedTemplateSlug('');
    setTemplateVars({});
    setCustomSubject('');
    setCustomBody(toName ? `Hi ${toName.split(' ')[0]},\n\n` : '');
  }, [open, toName]);

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
    if ('name' in next && !next.name && toName) next.name = toName;
    setTemplateVars(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplate, toName]);

  const allVarsFilled = !selectedTemplate?.variables?.length ||
    selectedTemplate.variables.every((v) => (templateVars[v] ?? '').trim().length > 0);
  const canSendTemplate = !!selectedTemplate && !sending && allVarsFilled;
  const canSendCustom = customSubject.trim().length > 0 && customBody.trim().length > 0 && !sending;

  const handleSendTemplate = async () => {
    if (!selectedTemplate || !toEmail) return;
    setSending(true);
    try {
      const result = await emailService.sendEmail({
        to: toEmail,
        subject: selectedTemplate.subject_template || selectedTemplate.name,
        templateSlug: selectedTemplate.slug,
        variables: templateVars,
        emailType: 'transactional',
      });
      toast({
        title: 'Email sent',
        description: `Delivered to ${toEmail} · message ${result.messageId.slice(0, 12)}…`,
      });
      onClose();
    } catch (err: any) {
      toast({ title: 'Send failed', description: err?.message ?? 'Unknown error', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const handleSendCustom = async () => {
    if (!toEmail || !customSubject.trim() || !customBody.trim()) return;
    setSending(true);
    try {
      // The body comes in as plain text; convert newlines so it renders as
      // paragraphs in the email client. Anything fancier (markdown / rich text)
      // is a follow-up — keeping v1 simple.
      const htmlBody = `<div style="font-family:'Open Sans',Arial,sans-serif;font-size:14px;line-height:1.6;color:#222;white-space:pre-wrap">${
        customBody
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      }</div>`;
      const result = await emailService.sendEmail({
        to: toEmail,
        subject: customSubject.trim(),
        html: htmlBody,
        text: customBody.trim(),
        emailType: 'transactional',
      });
      toast({
        title: 'Email sent',
        description: `Delivered to ${toEmail} · message ${result.messageId.slice(0, 12)}…`,
      });
      onClose();
    } catch (err: any) {
      toast({ title: 'Send failed', description: err?.message ?? 'Unknown error', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
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
            To <span className="font-medium text-foreground">{toEmail}</span>
            {toName ? ` (${toName})` : ''}
          </DialogDescription>
        </DialogHeader>

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
  );
};

export default SendEmailDialog;
