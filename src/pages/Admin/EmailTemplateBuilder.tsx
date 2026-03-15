/**
 * Email Template Builder Page
 * Visual drag-and-drop email builder powered by Unlayer
 */

import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Monitor, Tablet, Smartphone, Send } from 'lucide-react';
import EmailEditor, { EditorRef, EmailEditorProps } from 'react-email-editor';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

type DeviceView = 'desktop' | 'tablet' | 'mobile';

const DEVICE_WIDTHS: Record<DeviceView, number> = {
  desktop: 1200,
  tablet: 768,
  mobile: 375,
};

export const EmailTemplateBuilder: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const editorRef = useRef<EditorRef>(null);
  const topBarRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [template, setTemplate] = useState<any>(null);
  const [subject, setSubject] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [editorHeight, setEditorHeight] = useState(window.innerHeight - 57);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewDevice, setPreviewDevice] = useState<DeviceView>('desktop');
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [testEmail, setTestEmail] = useState('');

  useEffect(() => {
    if (id) loadTemplate();
  }, [id]);

  useLayoutEffect(() => {
    const updateHeight = () => {
      const topBarH = topBarRef.current?.offsetHeight ?? 57;
      setEditorHeight(window.innerHeight - topBarH);
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  // Once both the template data is loaded AND the editor iframe is ready, restore the design
  useEffect(() => {
    if (editorReady && template?.unlayer_design) {
      editorRef.current?.editor?.loadDesign(template.unlayer_design);
    }
  }, [editorReady, template]);

  const loadTemplate = async () => {
    try {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      setTemplate(data);
      setSubject(data.subject_template || '');
      setPreviewText(data.preview_text || '');
    } catch {
      toast({ title: 'Error', description: 'Failed to load template', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const onEditorReady: EmailEditorProps['onReady'] = useCallback(() => {
    setEditorReady(true);
  }, []);

  // Injects the Gmail/Outlook preheader snippet right after <body>
  const injectPreheader = (html: string, text: string): string => {
    if (!text.trim()) return html;
    // Pad with zero-width non-joiners to prevent body text leaking into the snippet
    const padding = '&zwnj;&nbsp;'.repeat(90);
    const snippet = `<span style="display:none;font-size:1px;color:#ffffff;max-height:0;overflow:hidden;mso-hide:all;">${text}${padding}</span>`;
    return html.replace(/(<body[^>]*>)/i, `$1${snippet}`);
  };

  const handleSave = () => {
    if (!editorRef.current?.editor) return;
    setSaving(true);

    editorRef.current.editor.exportHtml(async ({ design, html }) => {
      try {
        const finalHtml = injectPreheader(html, previewText);
        const { error } = await supabase
          .from('email_templates')
          .update({
            subject_template: subject,
            preview_text: previewText,
            html_template: finalHtml,
            unlayer_design: design,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);

        if (error) throw error;
        toast({ title: 'Saved', description: 'Template saved successfully.' });
      } catch {
        toast({ title: 'Error', description: 'Failed to save template', variant: 'destructive' });
      } finally {
        setSaving(false);
      }
    });
  };

  const handleSendTest = () => {
    if (!testEmail.trim() || !editorRef.current?.editor) return;
    setSendingTest(true);

    editorRef.current.editor.exportHtml(async ({ html }) => {
      try {
        const finalHtml = injectPreheader(html, previewText);
        const { data, error } = await supabase.functions.invoke('email-api', {
          body: {
            action: 'send',
            to: testEmail.trim(),
            subject: subject || `[Test] ${template.name}`,
            html: finalHtml,
            emailType: 'transactional',
            tags: { test: 'true', template_id: id },
          },
        });

        if (error || !data?.success) throw new Error(data?.error || error?.message || 'Failed to send');
        toast({ title: 'Test email sent', description: `Delivered to ${testEmail}` });
        setShowTestDialog(false);
        setTestEmail('');
      } catch (err: any) {
        toast({ title: 'Send failed', description: err.message, variant: 'destructive' });
      } finally {
        setSendingTest(false);
      }
    });
  };

  const handlePreview = (device: DeviceView) => {
    if (!editorRef.current?.editor) return;
    setPreviewDevice(device);
    editorRef.current.editor.exportHtml(({ html }) => {
      setPreviewHtml(injectPreheader(html, previewText));
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Loading template…</p>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Template not found.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Top bar — two rows */}
      <div ref={topBarRef} className="border-b bg-background shrink-0">
        {/* Row 1: nav + actions */}
        <div className="flex items-center justify-between px-4 py-2.5 gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <Button variant="ghost" size="sm" onClick={() => navigate('/admin?tab=email')}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <div>
              <p className="font-semibold text-sm leading-tight">{template.name}</p>
              <p className="text-xs text-muted-foreground capitalize">{template.category}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Device preview buttons */}
            <div className="flex items-center border rounded-full overflow-hidden divide-x">
              <button title="Desktop preview" disabled={!editorReady} onClick={() => handlePreview('desktop')}
                className="px-2.5 py-1.5 hover:bg-muted disabled:opacity-40 transition-colors">
                <Monitor className="h-4 w-4" />
              </button>
              <button title="Tablet preview" disabled={!editorReady} onClick={() => handlePreview('tablet')}
                className="px-2.5 py-1.5 hover:bg-muted disabled:opacity-40 transition-colors">
                <Tablet className="h-4 w-4" />
              </button>
              <button title="Mobile preview" disabled={!editorReady} onClick={() => handlePreview('mobile')}
                className="px-2.5 py-1.5 hover:bg-muted disabled:opacity-40 transition-colors">
                <Smartphone className="h-4 w-4" />
              </button>
            </div>

            <Button variant="outline" size="sm" disabled={!editorReady} onClick={() => setShowTestDialog(true)}>
              <Send className="h-4 w-4 mr-1" />
              Send Test
            </Button>

            <Button size="sm" disabled={saving || !editorReady} onClick={handleSave}>
              <Save className="h-4 w-4 mr-1" />
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>

        {/* Row 2: subject + preview text */}
        <div className="flex items-center gap-4 px-4 py-2 border-t bg-muted/30">
          <div className="flex items-center gap-2 flex-1">
            <Label htmlFor="subject" className="text-xs whitespace-nowrap text-muted-foreground w-20 shrink-0">
              Subject
            </Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Welcome, {{firstName}}!"
              className="h-7 text-xs flex-1"
            />
          </div>
          <div className="flex items-center gap-2 flex-1">
            <Label htmlFor="preview-text" className="text-xs whitespace-nowrap text-muted-foreground w-20 shrink-0">
              Preview text
            </Label>
            <Input
              id="preview-text"
              value={previewText}
              onChange={(e) => setPreviewText(e.target.value)}
              placeholder="Short teaser shown in Gmail, Outlook… (max ~90 chars)"
              className="h-7 text-xs flex-1"
              maxLength={150}
            />
          </div>
        </div>
      </div>

      {/* Unlayer editor — explicit pixel height so the iframe fills the viewport */}
      <div style={{ height: editorHeight }} className="relative overflow-hidden">
        {!editorReady && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm bg-background z-10">
            Loading editor…
          </div>
        )}
        <EmailEditor
          ref={editorRef}
          onReady={onEditorReady}
          style={{ height: editorHeight }}
          options={{
            appearance: { theme: 'light' },
            features: { textEditor: { spellChecker: true } },
          }}
        />
      </div>

      {/* Send test email dialog */}
      {showTestDialog && (
        <Dialog open onOpenChange={(open) => { if (!open) { setShowTestDialog(false); setTestEmail(''); } }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Send Test Email</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Sends the current design (including preheader) to an email address so you can check it in a real inbox.
            </p>
            <div className="space-y-2 pt-1">
              <Label htmlFor="test-email" className="text-xs">Recipient email</Label>
              <Input
                id="test-email"
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="you@example.com"
                onKeyDown={(e) => e.key === 'Enter' && handleSendTest()}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => { setShowTestDialog(false); setTestEmail(''); }}>
                Cancel
              </Button>
              <Button size="sm" disabled={!testEmail.trim() || sendingTest} onClick={handleSendTest}>
                <Send className="h-3.5 w-3.5 mr-1" />
                {sendingTest ? 'Sending…' : 'Send'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Responsive preview modal */}
      {previewHtml && (
        <Dialog open onOpenChange={() => setPreviewHtml(null)}>
          <DialogContent
            className="p-0 overflow-hidden flex flex-col"
            style={{ maxWidth: 'calc(100vw - 48px)', width: DEVICE_WIDTHS[previewDevice] + 48, maxHeight: '92vh' }}
          >
            <DialogHeader className="px-4 py-3 border-b shrink-0">
              <div className="flex items-center justify-between">
                <DialogTitle className="text-sm font-medium capitalize">
                  {previewDevice} preview — {DEVICE_WIDTHS[previewDevice]}px
                </DialogTitle>
                {/* In-modal device switcher */}
                <div className="flex items-center border rounded-full overflow-hidden divide-x">
                  {(['desktop', 'tablet', 'mobile'] as DeviceView[]).map((d) => (
                    <button
                      key={d}
                      onClick={() => setPreviewDevice(d)}
                      className={`px-2.5 py-1.5 transition-colors ${previewDevice === d ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                      title={`${d} preview`}
                    >
                      {d === 'desktop' && <Monitor className="h-3.5 w-3.5" />}
                      {d === 'tablet' && <Tablet className="h-3.5 w-3.5" />}
                      {d === 'mobile' && <Smartphone className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </div>
              </div>
            </DialogHeader>

            {/* Scrollable preview area */}
            <div className="flex-1 overflow-auto bg-muted/30 p-4 flex justify-center">
              <div
                style={{ width: DEVICE_WIDTHS[previewDevice], flexShrink: 0 }}
                className="bg-white rounded shadow-sm overflow-hidden"
              >
                <iframe
                  srcDoc={previewHtml}
                  style={{ width: DEVICE_WIDTHS[previewDevice], height: 700 }}
                  sandbox="allow-same-origin"
                  title={`${previewDevice} email preview`}
                />
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default EmailTemplateBuilder;
