/** The default is never restated here — the editor asks `email-api`, so there is one layout. */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Save, RotateCcw, Download, Monitor, Smartphone, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Badge } from '@/components/core/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const BRAND_KEYS = ['brand_name', 'brand_url', 'brand_logo_url', 'brand_logo_dark_url', 'brand_footer_note'] as const;
const LAYOUT_KEY = 'default_layout_html';
const CONTENT_SLOT = '{{content}}';

type BrandKey = (typeof BRAND_KEYS)[number];
type Brand = Record<BrandKey, string>;

const EMPTY_BRAND: Brand = { brand_name: '', brand_url: '', brand_logo_url: '', brand_logo_dark_url: '', brand_footer_note: '' };

export const EmailLayoutPanel: React.FC = () => {
  const [brand, setBrand] = useState<Brand>(EMPTY_BRAND);
  const [layout, setLayout] = useState('');
  const [defaultLayout, setDefaultLayout] = useState('');
  const [preview, setPreview] = useState('');
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [emailType, setEmailType] = useState<'transactional' | 'marketing'>('transactional');
  const [width, setWidth] = useState<'desktop' | 'mobile'>('desktop');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rendering, setRendering] = useState(false);
  const { toast } = useToast();

  const isCustom = layout.trim().length > 0;
  const missingSlot = isCustom && !layout.includes(CONTENT_SLOT);

  const renderPreview = useCallback(async (html: string, type: 'transactional' | 'marketing') => {
    setRendering(true);
    try {
      const { data, error } = await supabase.functions.invoke('email-api', {
        body: { action: 'layout', layoutHtml: html, emailType: type },
      });
      if (error) throw error;
      setPreview(data?.html ?? '');
      setPreviewError(data?.error ?? null);
      if (typeof data?.defaultLayout === 'string') setDefaultLayout(data.defaultLayout);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Could not render the preview.');
    } finally {
      setRendering(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('email_settings')
          .select('setting_key, setting_value')
          .in('setting_key', [LAYOUT_KEY, ...BRAND_KEYS]);
        if (error) throw error;
        const next = { ...EMPTY_BRAND };
        let stored = '';
        for (const row of data ?? []) {
          if (row.setting_key === LAYOUT_KEY) stored = row.setting_value || '';
          else if ((BRAND_KEYS as readonly string[]).includes(row.setting_key)) {
            next[row.setting_key as BrandKey] = row.setting_value || '';
          }
        }
        setBrand(next);
        setLayout(stored);
        await renderPreview(stored, 'transactional');
      } catch (_err) {
        toast({ title: 'Error', description: 'Failed to load the email layout', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
  }, [renderPreview, toast]);

  const debounce = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (loading || missingSlot) return;
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void renderPreview(layout, emailType), 600);
    return () => clearTimeout(debounce.current);
  }, [layout, emailType, loading, missingSlot, renderPreview]);

  const save = async () => {
    if (missingSlot) {
      toast({
        title: 'The layout has no {{content}} slot',
        description: 'Without it the message body is dropped and recipients get an empty email.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const rows = [
        { setting_key: LAYOUT_KEY, setting_value: layout.trim() },
        ...BRAND_KEYS.map(k => ({ setting_key: k, setting_value: brand[k].trim() })),
      ];
      // upsert, never update: no row exists until the first save, and an update matching
      // nothing reports success while changing nothing.
      const { error } = await supabase
        .from('email_settings')
        .upsert(rows, { onConflict: 'setting_key' });
      if (error) throw error;
      toast({ title: 'Layout saved', description: 'Every email sent from the platform now uses it.' });
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to save the layout',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-8 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading layout...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="dashboard-card">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="font-light">Email Layout</CardTitle>
              <CardDescription>
                The shell every email the platform sends is delivered in — alerts, digests,
                verifications, automations. Workspaces sending from their own domain keep their own
                brand and never inherit this one.
              </CardDescription>
            </div>
            <Badge variant={isCustom ? 'info' : 'neutral'}>
              {isCustom ? 'Custom layout' : 'Built-in default'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="brand_name">Brand name</Label>
              <Input
                id="brand_name"
                placeholder="Materials Hub"
                value={brand.brand_name}
                onChange={e => setBrand({ ...brand, brand_name: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Wordmark in the header. Defaults to the sender name.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand_url">Brand link</Label>
              <Input
                id="brand_url"
                placeholder="https://app.materialshub.gr"
                value={brand.brand_url}
                onChange={e => setBrand({ ...brand, brand_url: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Where the header wordmark points.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand_logo_url">Logo URL</Label>
              <Input
                id="brand_logo_url"
                placeholder="https://…/logo.png (optional)"
                value={brand.brand_logo_url}
                onChange={e => setBrand({ ...brand, brand_logo_url: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Publicly reachable, 2× the 28px display height. Empty renders the wordmark as text,
                which every image-blocking client still shows.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand_logo_dark_url">Logo URL — dark mode</Label>
              <Input
                id="brand_logo_dark_url"
                placeholder="https://…/logo-white.png (optional)"
                value={brand.brand_logo_dark_url}
                onChange={e => setBrand({ ...brand, brand_logo_dark_url: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Shown when the reader's client is in dark mode. A dark wordmark vanishes on a dark
                ground and no email client can recolour a PNG.
              </p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="brand_footer_note">Extra footer line</Label>
              <Input
                id="brand_footer_note"
                placeholder="Optional — anything beyond the company details"
                value={brand.brand_footer_note}
                onChange={e => setBrand({ ...brand, brand_footer_note: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                The legal footer — company name, address, ΑΦΜ, ΔΟΥ, ΓΕΜΗ — is read from Finance →
                Settings and printed automatically. Use this only for something extra.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="layout_html">Layout HTML</Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLayout(defaultLayout)}
                  disabled={!defaultLayout}
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Start from the default
                </Button>
                <Button variant="outline" size="sm" onClick={() => setLayout('')} disabled={!isCustom}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Back to the default
                </Button>
              </div>
            </div>
            <Textarea
              id="layout_html"
              value={layout}
              onChange={e => setLayout(e.target.value)}
              placeholder="Empty — using the built-in default layout. Paste HTML here to override it."
              spellCheck={false}
              className="font-mono text-xs min-h-[220px]"
            />
            <p className="text-xs text-muted-foreground">
              Slots: <code>{'{{content}}'}</code> (required — the message body),{' '}
              <code>{'{{preheader}}'}</code>, <code>{'{{brand_logo}}'}</code>,{' '}
              <code>{'{{brand_name}}'}</code>, <code>{'{{brand_url}}'}</code>,{' '}
              <code>{'{{sender_name}}'}</code>, <code>{'{{sender_email}}'}</code>,{' '}
              <code>{'{{footer_note}}'}</code>, <code>{'{{unsubscribe_block}}'}</code>,{' '}
              <code>{'{{colophon}}'}</code>, <code>{'{{current_year}}'}</code>.
            </p>
            {missingSlot && (
              <p className="flex items-start gap-2 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />
                This layout has no {'{{content}}'} slot, so the message body would be dropped. Saving
                is blocked until you add it.
              </p>
            )}
          </div>

          <div className="flex justify-end">
            <Button onClick={() => void save()} disabled={saving || missingSlot}>
              {saving
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                : <><Save className="h-4 w-4 mr-2" />Save layout</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="dashboard-card">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="font-light">Preview</CardTitle>
              <CardDescription>
                Rendered by the send path itself, with sample content that exercises every element
                the layout styles.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Tabs value={emailType} onValueChange={v => setEmailType(v as typeof emailType)}>
                <TabsList>
                  <TabsTrigger value="transactional">Transactional</TabsTrigger>
                  <TabsTrigger value="marketing">Marketing</TabsTrigger>
                </TabsList>
              </Tabs>
              <Tabs value={width} onValueChange={v => setWidth(v as typeof width)}>
                <TabsList>
                  <TabsTrigger value="desktop"><Monitor className="h-3.5 w-3.5" /></TabsTrigger>
                  <TabsTrigger value="mobile"><Smartphone className="h-3.5 w-3.5" /></TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {previewError ? (
            <p className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 mt-px shrink-0" />
              {previewError}
            </p>
          ) : (
            <div className="bg-surface-sunken border-hairline border rounded-sm p-3 overflow-x-auto">
              <div className="mx-auto" style={{ width: width === 'mobile' ? 390 : '100%', maxWidth: '100%' }}>
                  <iframe
                  title="Email layout preview"
                  sandbox=""
                  srcDoc={preview}
                  className="w-full bg-white rounded-sm"
                  style={{ height: 620, border: 0 }}
                />
              </div>
            </div>
          )}
          {rendering && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Rendering…
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
