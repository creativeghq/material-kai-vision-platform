/**
 * Email Template Builder — GrapesJS + grapesjs-preset-newsletter
 * Fully open-source, no paid plan required.
 * Features: 7 KAI custom blocks, device preview, test send, preheader, tag docs, save/load JSON.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import grapesjs, { Editor as GrapesEditor } from 'grapesjs';
// @ts-ignore — no official TS types for this plugin
import newsletterPlugin from 'grapesjs-preset-newsletter';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Monitor, Tablet, Smartphone, Send, Info } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/core/ui/sheet';
import { Badge } from '@/components/core/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ── Types ──────────────────────────────────────────────────────────────────
type DeviceView = 'desktop' | 'tablet' | 'mobile';

const DEVICE_WIDTHS: Record<DeviceView, number> = {
  desktop: 1200,
  tablet: 768,
  mobile: 375,
};

const BRAND = {
  primary: '#3E192A',
  font: "'Open Sans', Arial, sans-serif",
};

// ── Template tag documentation ─────────────────────────────────────────────
const TEMPLATE_TAGS = [
  { tag: '{{firstName}}',     label: 'First Name',       example: 'Jane',                          note: 'Populated from recipient contact data when sending a campaign, or passed explicitly in the send API call.' },
  { tag: '{{lastName}}',      label: 'Last Name',        example: 'Smith',                         note: 'Same as firstName — comes from the recipient record.' },
  { tag: '{{fullName}}',      label: 'Full Name',        example: 'Jane Smith',                    note: 'Concatenation of first + last. Falls back to email address if no name is available.' },
  { tag: '{{email}}',         label: 'Email Address',    example: 'jane@studio.com',               note: "The recipient's email address. Always available." },
  { tag: '{{companyName}}',   label: 'Company Name',     example: 'Material KAI',                  note: 'Defaults to "Material KAI". Can be overridden per send.' },
  { tag: '{{currentYear}}',   label: 'Current Year',     example: '2026',                          note: 'Injected at send time. Useful in footer copyright lines.' },
  { tag: '{{platformUrl}}',   label: 'Platform URL',     example: 'https://materialkai.com',       note: 'The main platform URL. Set in Email Settings.' },
  { tag: '{{unsubscribeUrl}}',label: 'Unsubscribe Link', example: 'https://…/unsubscribe?token=…', note: 'Required for marketing emails. Automatically generated.' },
];

// ── HTML email card helpers ─────────────────────────────────────────────────
function cardHtml(imageUrl: string, title: string, subtitle: string, linkUrl = '#') {
  const img = imageUrl
    ? `<img src="${imageUrl}" width="100%" style="display:block;max-height:160px;object-fit:cover;border-radius:8px 8px 0 0;" alt="${title}" />`
    : `<div style="height:120px;background:#e8e0d8;border-radius:8px 8px 0 0;text-align:center;padding:40px 0;font-size:28px;">🧱</div>`;
  return (
    `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:8px;overflow:hidden;border:1px solid #eee;">` +
      `<tr><td>${img}</td></tr>` +
      `<tr><td style="padding:12px;">` +
        `<a href="${linkUrl}" style="text-decoration:none;">` +
          `<div style="font-family:${BRAND.font};font-weight:600;font-size:14px;color:#1a1a1a;margin-bottom:4px;">${title}</div>` +
          `<div style="font-family:${BRAND.font};font-size:12px;color:#888;">${subtitle}</div>` +
        `</a>` +
      `</td></tr>` +
    `</table>`
  );
}

function gridHtml(items: { image: string; title: string; subtitle: string; url?: string }[], cols: number): string {
  const pct = Math.floor(100 / cols);
  const rows: string[] = [];
  for (let i = 0; i < items.length; i += cols) {
    const cells = items.slice(i, i + cols).map(it =>
      `<td width="${pct}%" style="padding:6px;vertical-align:top;">${cardHtml(it.image, it.title, it.subtitle, it.url)}</td>`
    );
    while (cells.length < cols) cells.push(`<td width="${pct}%" style="padding:6px;"></td>`);
    rows.push(`<tr>${cells.join('')}</tr>`);
  }
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0">${rows.join('')}</table>`;
}

function listHtml(items: { image: string; title: string; subtitle: string; url?: string }[]): string {
  const rows = items.map(it => {
    const img = it.image
      ? `<img src="${it.image}" width="80" height="64" style="display:block;object-fit:cover;border-radius:6px;" alt="${it.title}" />`
      : `<div style="width:80px;height:64px;background:#e8e0d8;border-radius:6px;"></div>`;
    return (
      `<tr><td style="padding:8px 0;border-bottom:1px solid #f0eae6;">` +
        `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
          `<td width="88" style="vertical-align:top;">${img}</td>` +
          `<td style="padding-left:12px;vertical-align:top;">` +
            `<a href="${it.url || '#'}" style="text-decoration:none;">` +
              `<div style="font-family:${BRAND.font};font-weight:600;font-size:14px;color:#1a1a1a;">${it.title}</div>` +
              `<div style="font-family:${BRAND.font};font-size:12px;color:#888;margin-top:3px;">${it.subtitle}</div>` +
            `</a>` +
          `</td>` +
        `</tr></table>` +
      `</td></tr>`
    );
  });
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0">${rows.join('')}</table>`;
}

// ── Live data fetcher + KAI block renderer ─────────────────────────────────
async function renderKaiBlock(type: string, count: number, cols: number, layout: 'columns' | 'list'): Promise<string> {
  const now = new Date();
  const weekAgo  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    if (type === 'material_card' || type === 'top_week' || type === 'top_month') {
      let query = supabase.from('products').select('id, name, description, metadata, source_document_id')
        .order('created_at', { ascending: false }).limit(count);
      if (type === 'top_week')  query = query.gte('created_at', weekAgo);
      if (type === 'top_month') query = query.gte('created_at', monthAgo);
      const { data: products } = await query;
      if (!products?.length) return `<!-- KAI block: no ${type} data found -->`;

      const docIds = products.map(p => p.source_document_id).filter(Boolean);
      const imageMap: Record<string, string> = {};
      if (docIds.length) {
        const { data: imgs } = await supabase.from('document_images').select('document_id, image_url').in('document_id', docIds);
        imgs?.forEach(img => { if (!imageMap[img.document_id]) imageMap[img.document_id] = img.image_url; });
      }
      const items = products.map(p => ({
        image: p.source_document_id ? (imageMap[p.source_document_id] || '') : '',
        title: p.name || 'Untitled Material',
        subtitle: [p.metadata?.material_category?.replace(/_/g, ' '), p.metadata?.available_colors?.slice(0, 2).join(', ')].filter(Boolean).join(' · ') || 'Material',
        url: '#',
      }));
      return layout === 'list' ? listHtml(items) : gridHtml(items, Math.max(1, Math.min(cols, 4)));
    }

    if (type === 'moodboard') {
      const { data: boards } = await supabase.from('moodboards')
        .select('id, title, description, moodboard_items(media_url, position)')
        .eq('is_public', true).order('created_at', { ascending: false }).limit(count);
      if (!boards?.length) return `<!-- KAI block: no public moodboards found -->`;
      const items = boards.map((b: any) => {
        const sorted = (b.moodboard_items || []).sort((a: any, z: any) => a.position - z.position);
        return { image: sorted.find((mi: any) => mi.media_url)?.media_url || '', title: b.title || 'Untitled Moodboard', subtitle: b.description || 'Curated collection', url: '#' };
      });
      return layout === 'list' ? listHtml(items) : gridHtml(items, Math.max(1, Math.min(cols, 3)));
    }

    if (type === 'vr3d') {
      const { data: worlds } = await supabase.from('vr_worlds')
        .select('id, status, panorama_url, thumbnail_url').eq('status', 'completed')
        .order('created_at', { ascending: false }).limit(count);
      if (!worlds?.length) return `<!-- KAI block: no completed 3D worlds found -->`;
      const items = worlds.map(w => ({ image: w.panorama_url || w.thumbnail_url || '', title: 'Material World', subtitle: 'Explore in 3D', url: '#' }));
      return layout === 'list' ? listHtml(items) : gridHtml(items, Math.max(1, Math.min(cols, 3)));
    }
  } catch (err) {
    console.error('KAI block render error:', err);
  }
  return `<!-- KAI block: failed to render ${type} -->`;
}

// ── Post-processes exported HTML: replaces data-kai-block placeholders ─────
async function processEmailHtml(html: string): Promise<string> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks = Array.from(doc.querySelectorAll('[data-kai-block]'));
  if (!blocks.length) return html;
  await Promise.all(blocks.map(async (el) => {
    const type   = el.getAttribute('data-kai-block') || '';
    const count  = parseInt(el.getAttribute('data-count') || '3');
    const cols   = parseInt(el.getAttribute('data-cols') || '3');
    const layout = (el.getAttribute('data-layout') || 'columns') as 'columns' | 'list';
    const replacement = await renderKaiBlock(type, count, cols, layout);
    const wrapper = doc.createElement('div');
    wrapper.innerHTML = replacement;
    el.replaceWith(...Array.from(wrapper.childNodes));
  }));
  return `<!DOCTYPE html>${doc.documentElement.outerHTML}`;
}

// ── Preheader injection ─────────────────────────────────────────────────────
function injectPreheader(html: string, text: string): string {
  if (!text.trim()) return html;
  const padding = '&zwnj;&nbsp;'.repeat(90);
  const snippet = `<span style="display:none;font-size:1px;color:#ffffff;max-height:0;overflow:hidden;mso-hide:all;">${text}${padding}</span>`;
  return html.replace(/(<body[^>]*>)/i, `$1${snippet}`);
}

// ── KAI custom blocks for GrapesJS ─────────────────────────────────────────
function addKaiBlocks(editor: GrapesEditor) {
  const placeholder = (type: string, icon: string, label: string, count = 3, cols = 3, layout = 'columns') =>
    `<div data-kai-block="${type}" data-count="${count}" data-cols="${cols}" data-layout="${layout}" ` +
    `style="background:#f8f4f2;border:2px dashed #c4a0b0;border-radius:8px;padding:24px;text-align:center;font-family:sans-serif;margin:0;">` +
      `<div style="font-size:24px;margin-bottom:8px;">${icon}</div>` +
      `<strong style="color:#3E192A;font-size:13px;">${label}</strong>` +
      `<div style="color:#999;font-size:11px;margin-top:4px;">${count} items · ${layout}${layout !== 'list' ? ` · ${cols} cols` : ''}</div>` +
      `<div style="color:#bbb;font-size:10px;margin-top:2px;">Live data inserted on save / send</div>` +
    `</div>`;

  const icon = (emoji: string) =>
    `<div style="font-size:26px;text-align:center;padding:6px 0;line-height:1;">${emoji}</div>`;

  const KAI = 'KAI Blocks';

  editor.BlockManager.add('kai-branded-header', {
    label: 'Branded Header', category: KAI, media: icon('🏷️'),
    content: `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#3E192A;">` +
      `<tr><td align="center" style="padding:28px 24px;">` +
        `<div style="font-family:'Open Sans',Arial,sans-serif;color:#ffffff;font-size:28px;font-weight:300;letter-spacing:3px;">MATERIAL KAI</div>` +
        `<div style="font-family:'Open Sans',Arial,sans-serif;color:#ffffff;opacity:0.75;font-size:13px;margin-top:8px;letter-spacing:1px;">Your Weekly Materials Update</div>` +
      `</td></tr></table>`,
  });

  editor.BlockManager.add('kai-cta-button', {
    label: 'Brand CTA Button', category: KAI, media: icon('🔘'),
    content: `<table width="100%" cellpadding="0" cellspacing="0" border="0">` +
      `<tr><td align="center" style="padding:24px;">` +
        `<a href="https://materialkai.com" style="background:#3E192A;color:#ffffff;` +
        `font-family:'Open Sans',Arial,sans-serif;font-size:15px;font-weight:600;` +
        `text-decoration:none;padding:14px 40px;border-radius:50px;display:inline-block;">` +
          `Explore Materials` +
        `</a></td></tr></table>`,
  });

  editor.BlockManager.add('kai-material-card', {
    label: 'Material Card', category: KAI, media: icon('📦'),
    content: placeholder('material_card', '📦', 'Material Card', 3, 3),
  });

  editor.BlockManager.add('kai-top-week', {
    label: 'Top Materials – Week', category: KAI, media: icon('📈'),
    content: placeholder('top_week', '📈', 'Top Materials – This Week', 6, 3),
  });

  editor.BlockManager.add('kai-top-month', {
    label: 'Top Materials – Month', category: KAI, media: icon('📅'),
    content: placeholder('top_month', '📅', 'Top Materials – This Month', 6, 3),
  });

  editor.BlockManager.add('kai-moodboard', {
    label: 'Latest Moodboards', category: KAI, media: icon('🎨'),
    content: placeholder('moodboard', '🎨', 'Latest Public Moodboards', 3, 3),
  });

  editor.BlockManager.add('kai-vr3d', {
    label: 'Latest 3D Inspirations', category: KAI, media: icon('🌐'),
    content: placeholder('vr3d', '🌐', 'Latest 3D Inspirations', 3, 3),
  });
}

// ── Tag info panel ─────────────────────────────────────────────────────────
function TagInfoPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-96 overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle>Template Variables</SheetTitle>
          <p className="text-sm text-muted-foreground">
            Use these tags in your subject line, preview text, and email body. Replaced with real values at send time.
          </p>
        </SheetHeader>
        <div className="space-y-4 mt-2">
          {TEMPLATE_TAGS.map(t => (
            <div key={t.tag} className="border rounded-lg p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-primary font-semibold">{t.tag}</code>
                <Badge variant="outline" className="text-xs">{t.label}</Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{t.note}</p>
              <p className="text-xs text-muted-foreground">
                <span className="text-foreground font-medium">Example: </span><em>{t.example}</em>
              </p>
            </div>
          ))}
          <div className="border rounded-lg p-3 bg-muted/30 space-y-1.5">
            <p className="text-xs font-semibold">Custom variables</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Any key–value pair passed in the <code className="bg-muted px-1 rounded">variables</code> field
              of the send API call can be used as <code className="bg-muted px-1 rounded">{'{{variableName}}'}</code>.
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export const EmailTemplateBuilder: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef    = useRef<GrapesEditor | null>(null);
  const initGuard    = useRef(false); // prevents StrictMode double-init
  const topBarRef    = useRef<HTMLDivElement>(null);

  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [sendingTest,  setSendingTest]  = useState(false);
  const [editorReady,  setEditorReady]  = useState(false);
  const [template,     setTemplate]     = useState<any>(null);
  const [subject,      setSubject]      = useState('');
  const [previewText,  setPreviewText]  = useState('');
  const [previewHtml,  setPreviewHtml]  = useState<string | null>(null);
  const [previewDevice,setPreviewDevice]= useState<DeviceView>('desktop');
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [showTagInfo,    setShowTagInfo]    = useState(false);
  const [testEmail,      setTestEmail]      = useState('');

  // Load template metadata from Supabase
  useEffect(() => { if (id) loadTemplate(); }, [id]);

  const loadTemplate = async () => {
    try {
      const { data, error } = await supabase.from('email_templates').select('*').eq('id', id).single();
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

  // Initialize GrapesJS once the container is mounted
  useEffect(() => {
    if (!containerRef.current || initGuard.current) return;
    initGuard.current = true;

    const editor = grapesjs.init({
      container: containerRef.current,
      height: '100%',
      width: 'auto',
      fromElement: false,
      storageManager: false, // we handle persistence ourselves
      plugins: [newsletterPlugin],
      pluginsOpts: {
        'grapesjs-preset-newsletter': { inlineCss: true },
      },
    });

    addKaiBlocks(editor);
    editorRef.current = editor;
    setEditorReady(true);

    return () => {
      editor.destroy();
      editorRef.current = null;
      initGuard.current = false;
    };
  }, []);

  // Load saved design once both editor and template are ready
  useEffect(() => {
    if (editorReady && template && editorRef.current) {
      if (template.unlayer_design) {
        try { editorRef.current.loadProjectData(template.unlayer_design); } catch { /* ignore */ }
      }
    }
  }, [editorReady, template]);

  // Export HTML (with inlined CSS + preheader + KAI block replacement)
  const exportAndProcess = useCallback(async (): Promise<{ design: any; html: string }> => {
    const editor = editorRef.current;
    if (!editor) throw new Error('Editor not ready');

    // gjs-get-inlined-html is provided by grapesjs-preset-newsletter — returns CSS-inlined HTML
    const rawHtml = (editor.runCommand('gjs-get-inlined-html') as string) || '';
    const design  = editor.getProjectData();
    const html    = await processEmailHtml(injectPreheader(rawHtml, previewText));

    return { design, html };
  }, [previewText]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { design, html } = await exportAndProcess();
      const { error } = await supabase.from('email_templates').update({
        subject_template: subject,
        preview_text:     previewText,
        html_template:    html,
        unlayer_design:   design, // column keeps its name; now stores GrapesJS JSON
        is_active:        true,
        updated_at:       new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
      toast({ title: 'Saved', description: 'Template saved successfully.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to save template', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (!testEmail.trim()) return;
    setSendingTest(true);
    try {
      const { html } = await exportAndProcess();
      const { data, error } = await supabase.functions.invoke('email-api', {
        body: {
          action: 'send',
          to: testEmail.trim(),
          subject: subject || `[Test] ${template?.name}`,
          html,
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
  };

  const handlePreview = (device: DeviceView) => {
    const editor = editorRef.current;
    if (!editor) return;
    setPreviewDevice(device);
    const rawHtml = (editor.runCommand('gjs-get-inlined-html') as string) || '';
    setPreviewHtml(injectPreheader(rawHtml, previewText));
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen"><p className="text-muted-foreground">Loading template…</p></div>;
  }
  if (!template) {
    return <div className="flex items-center justify-center h-screen"><p className="text-muted-foreground">Template not found.</p></div>;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div ref={topBarRef} className="border-b bg-background shrink-0">

        {/* Row 1: nav + actions */}
        <div className="flex items-center justify-between px-4 py-2.5 gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <Button variant="ghost" size="sm" onClick={() => navigate('/admin?tab=email')}>
              <ArrowLeft className="h-4 w-4 mr-1" />Back
            </Button>
            <div>
              <p className="font-semibold text-sm leading-tight">{template.name}</p>
              <p className="text-xs text-muted-foreground capitalize">{template.category}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              title="Template variable guide"
              onClick={() => setShowTagInfo(true)}
              className="p-1.5 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              <Info className="h-4 w-4" />
            </button>

            {/* Device preview buttons */}
            <div className="flex items-center border rounded-full overflow-hidden divide-x">
              {(['desktop', 'tablet', 'mobile'] as DeviceView[]).map(d => (
                <button
                  key={d}
                  title={`${d} preview`}
                  disabled={!editorReady}
                  onClick={() => handlePreview(d)}
                  className="px-2.5 py-1.5 hover:bg-muted disabled:opacity-40 transition-colors"
                >
                  {d === 'desktop' && <Monitor className="h-4 w-4" />}
                  {d === 'tablet'  && <Tablet  className="h-4 w-4" />}
                  {d === 'mobile'  && <Smartphone className="h-4 w-4" />}
                </button>
              ))}
            </div>

            <Button variant="outline" size="sm" disabled={!editorReady} onClick={() => setShowTestDialog(true)}>
              <Send className="h-4 w-4 mr-1" />Send Test
            </Button>

            <Button size="sm" disabled={saving || !editorReady} onClick={handleSave}>
              <Save className="h-4 w-4 mr-1" />{saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>

        {/* Row 2: subject + preview text */}
        <div className="flex items-center gap-4 px-4 py-2 border-t bg-muted/30">
          <div className="flex items-center gap-2 flex-1">
            <Label htmlFor="subject" className="text-xs whitespace-nowrap text-muted-foreground w-20 shrink-0">Subject</Label>
            <Input
              id="subject" value={subject} onChange={e => setSubject(e.target.value)}
              placeholder="e.g. Welcome, {{firstName}}!" className="h-7 text-xs flex-1"
            />
          </div>
          <div className="flex items-center gap-2 flex-1">
            <Label htmlFor="preview-text" className="text-xs whitespace-nowrap text-muted-foreground w-20 shrink-0">Preview text</Label>
            <Input
              id="preview-text" value={previewText} onChange={e => setPreviewText(e.target.value)}
              placeholder="Short teaser shown in Gmail, Outlook… (max ~90 chars)"
              className="h-7 text-xs flex-1" maxLength={150}
            />
          </div>
        </div>
      </div>

      {/* ── GrapesJS canvas (fills remaining height) ─────────────────────── */}
      <div ref={containerRef} className="flex-1 min-h-0" />

      {/* ── Tag info sheet ───────────────────────────────────────────────── */}
      <TagInfoPanel open={showTagInfo} onClose={() => setShowTagInfo(false)} />

      {/* ── Send test dialog ─────────────────────────────────────────────── */}
      {showTestDialog && (
        <Dialog open onOpenChange={open => { if (!open) { setShowTestDialog(false); setTestEmail(''); } }}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Send Test Email</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">
              Sends the current design (with preheader + live data blocks) to an inbox before going live.
            </p>
            <div className="space-y-2 pt-1">
              <Label htmlFor="test-email" className="text-xs">Recipient email</Label>
              <Input
                id="test-email" type="email" value={testEmail}
                onChange={e => setTestEmail(e.target.value)}
                placeholder="you@example.com"
                onKeyDown={e => e.key === 'Enter' && handleSendTest()}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => { setShowTestDialog(false); setTestEmail(''); }}>Cancel</Button>
              <Button size="sm" disabled={!testEmail.trim() || sendingTest} onClick={handleSendTest}>
                <Send className="h-3.5 w-3.5 mr-1" />{sendingTest ? 'Sending…' : 'Send'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Responsive preview modal ─────────────────────────────────────── */}
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
                <div className="flex items-center border rounded-full overflow-hidden divide-x">
                  {(['desktop', 'tablet', 'mobile'] as DeviceView[]).map(d => (
                    <button
                      key={d}
                      onClick={() => setPreviewDevice(d)}
                      className={`px-2.5 py-1.5 transition-colors ${previewDevice === d ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                    >
                      {d === 'desktop' && <Monitor    className="h-3.5 w-3.5" />}
                      {d === 'tablet'  && <Tablet     className="h-3.5 w-3.5" />}
                      {d === 'mobile'  && <Smartphone className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </div>
              </div>
            </DialogHeader>
            <div className="flex-1 overflow-auto bg-muted/30 p-4 flex justify-center">
              <div style={{ width: DEVICE_WIDTHS[previewDevice], flexShrink: 0 }} className="bg-white rounded shadow-sm overflow-hidden">
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
