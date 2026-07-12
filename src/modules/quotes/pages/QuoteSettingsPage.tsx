import React, { useState, useEffect, useRef } from 'react';
import { Save, Loader2, Clock, FileText, Image, X, Eye } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { parseDecimalOr } from '@/utils/decimal';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { edgeErrorMessage } from '@/utils/edgeError';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';

interface PDFTemplateConfig {
  first_page_path: string;
  intro_page_path: string;
  last_page_path: string;
  content_page_path: string;
  company_name: string;
  company_address: string;
  company_phone: string;
  company_email: string;
  company_vat: string;
  vat_rate_default: number;
}

const DEFAULT_PDF_CONFIG: PDFTemplateConfig = {
  first_page_path: '',
  intro_page_path: '',
  last_page_path: '',
  content_page_path: '',
  company_name: '',
  company_address: '',
  company_phone: '',
  company_email: '',
  company_vat: '',
  vat_rate_default: 24,
};

interface QuoteSettingsProps {
  /** Render without the page header — used when mounted inside a Sheet panel. */
  embedded?: boolean;
}

export const QuoteSettingsPage: React.FC<QuoteSettingsProps> = ({ embedded = false }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [quoteExpirationDays, setQuoteExpirationDays] = useState<number>(30);
  const [settingId, setSettingId] = useState<string>('');

  // PDF Template state
  const [pdfConfig, setPdfConfig] = useState<PDFTemplateConfig>(DEFAULT_PDF_CONFIG);
  const [pdfSettingId, setPdfSettingId] = useState<string>('');
  const [savingPdf, setSavingPdf] = useState(false);
  const [uploadingImage, setUploadingImage] = useState<string | null>(null);

  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [introPreview, setIntroPreview] = useState<string | null>(null);
  const [backcoverPreview, setBackcoverPreview] = useState<string | null>(null);
  const [bgPreview, setBgPreview] = useState<string | null>(null);

  // Rendered "proper view" of the whole template (a sample quote PDF).
  const { activeWorkspaceId } = useWorkspace();
  const [previewing, setPreviewing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handlePreview = async () => {
    try {
      setPreviewing(true);
      setPreviewUrl(null);
      const { data, error } = await supabase.functions.invoke('generate-quote-pdf', {
        body: { preview: true, workspace_id: activeWorkspaceId ?? undefined },
      });
      if (error) throw new Error(await edgeErrorMessage(error));
      if (!(data as any)?.success || !(data as any)?.pdf_url) throw new Error((data as any)?.error || 'Preview failed');
      setPreviewUrl((data as any).pdf_url);
    } catch (e: any) {
      toast({ title: 'Preview failed', description: e?.message, variant: 'destructive' });
    } finally {
      setPreviewing(false);
    }
  };

  const coverInputRef = useRef<HTMLInputElement>(null);
  const introInputRef = useRef<HTMLInputElement>(null);
  const backcoverInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSettings();
    loadPDFTemplateConfig();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .eq('setting_key', 'quote_expiration_days')
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setQuoteExpirationDays(data.setting_value as number);
        setSettingId(data.id);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to load quote settings',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadPDFTemplateConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .eq('setting_key', 'quote_pdf_template')
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        const raw = data.setting_value as Record<string, any>;
        const config: PDFTemplateConfig = {
          ...DEFAULT_PDF_CONFIG,
          first_page_path: raw.first_page_path || raw.cover_image_path || '',
          intro_page_path: raw.intro_page_path || '',
          last_page_path: raw.last_page_path || raw.backcover_image_path || '',
          content_page_path: raw.content_page_path || raw.items_background_path || '',
          company_name: raw.company_name || '',
          company_address: raw.company_address || '',
          company_phone: raw.company_phone || '',
          company_email: raw.company_email || '',
          company_vat: raw.company_vat || '',
          vat_rate_default: raw.vat_rate_default ?? 24,
        };
        setPdfConfig(config);
        setPdfSettingId(data.id);

        if (config.first_page_path) loadImagePreview(config.first_page_path, setCoverPreview);
        if (config.intro_page_path) loadImagePreview(config.intro_page_path, setIntroPreview);
        if (config.last_page_path) loadImagePreview(config.last_page_path, setBackcoverPreview);
        if (config.content_page_path) loadImagePreview(config.content_page_path, setBgPreview);
      }
    } catch (error) {
      console.error('Error loading PDF template config:', error);
    }
  };

  const loadImagePreview = async (path: string, setter: (url: string | null) => void) => {
    try {
      const { data } = await supabase.storage
        .from('quote-templates')
        .createSignedUrl(path, 3600);
      setter(data?.signedUrl || null);
    } catch {
      setter(null);
    }
  };

  const handleSave = async () => {
    if (quoteExpirationDays < 1) {
      toast({
        title: 'Invalid Value',
        description: 'Expiration days must be at least 1',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSaving(true);
      const { error } = await supabase
        .from('system_settings')
        .update({
          setting_value: quoteExpirationDays,
          updated_at: new Date().toISOString(),
        })
        .eq('id', settingId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Quote settings updated',
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to save settings',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (
    file: File,
    targetPath: string,
    previewSetter: (url: string | null) => void,
    configKey?: keyof PDFTemplateConfig,
  ) => {
    const allowedTypes = ['image/png', 'image/jpeg'];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: 'Invalid file type', description: 'Only PNG and JPG images are allowed.', variant: 'destructive' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum file size is 10MB.', variant: 'destructive' });
      return;
    }

    try {
      setUploadingImage(targetPath);
      const { error } = await supabase.storage
        .from('quote-templates')
        .upload(targetPath, file, { upsert: true });

      if (error) throw error;

      await loadImagePreview(targetPath, previewSetter);

      const updatedConfig = configKey
        ? { ...pdfConfig, [configKey]: targetPath }
        : pdfConfig;

      if (configKey) {
        setPdfConfig(updatedConfig);
      }

      if (pdfSettingId) {
        await supabase
          .from('system_settings')
          .update({ setting_value: updatedConfig as any, updated_at: new Date().toISOString() })
          .eq('id', pdfSettingId);
      }

      toast({ title: 'Image uploaded', description: `${targetPath} saved successfully.` });
    } catch (error) {
      console.error('Error uploading image:', error);
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Failed to upload image.',
        variant: 'destructive',
      });
    } finally {
      setUploadingImage(null);
    }
  };

  const handleImageDelete = async (
    storagePath: string,
    previewSetter: (url: string | null) => void,
    configKey?: keyof PDFTemplateConfig,
  ) => {
    try {
      setUploadingImage(storagePath);
      await supabase.storage.from('quote-templates').remove([storagePath]);

      previewSetter(null);

      const updatedConfig = configKey
        ? { ...pdfConfig, [configKey]: '' }
        : pdfConfig;

      if (configKey) setPdfConfig(updatedConfig);

      if (pdfSettingId) {
        await supabase
          .from('system_settings')
          .update({ setting_value: updatedConfig as any, updated_at: new Date().toISOString() })
          .eq('id', pdfSettingId);
      }

      toast({ title: 'Image deleted', description: `${storagePath} removed.` });
    } catch (error) {
      console.error('Error deleting image:', error);
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Failed to delete image.',
        variant: 'destructive',
      });
    } finally {
      setUploadingImage(null);
    }
  };

  const handleSavePdfConfig = async () => {
    try {
      setSavingPdf(true);
      const { error } = await supabase
        .from('system_settings')
        .update({
          setting_value: pdfConfig as any,
          updated_at: new Date().toISOString(),
        })
        .eq('id', pdfSettingId);

      if (error) throw error;

      toast({ title: 'Success', description: 'PDF template configuration saved.' });
    } catch (error) {
      console.error('Error saving PDF config:', error);
      toast({ title: 'Error', description: 'Failed to save PDF configuration.', variant: 'destructive' });
    } finally {
      setSavingPdf(false);
    }
  };

  const content = (
    <div className={embedded ? 'space-y-6' : 'p-3 sm:p-6 space-y-6'}>
      <div className="dashboard-card space-y-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
            <h2 className="text-xl font-semibold">Quote Expiration</h2>
          </div>

          <div className="space-y-4">
            <Label htmlFor="expiration-days" className="text-base">
              Days Until Expiration
            </Label>
            <p className="text-sm text-muted-foreground">
              Number of days of inactivity before a draft quote expires.
              Any activity (adding/removing items) extends the expiration.
            </p>

            <div className="flex items-center gap-4">
              <Input
                id="expiration-days"
                type="number"
                min="1"
                value={quoteExpirationDays}
                onChange={(e) => setQuoteExpirationDays(parseInt(e.target.value) || 1)}
                className="max-w-xs"
              />
              <span className="text-muted-foreground">days</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <Button
            onClick={handleSave}
            disabled={saving}
            style={{ backgroundColor: 'hsl(var(--primary))' }}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Settings
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="dashboard-card space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
            <h2 className="text-xl font-semibold">PDF Design Template</h2>
          </div>
          <Button variant="outline" size="sm" onClick={handlePreview} disabled={previewing}>
            {previewing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
            Preview
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          The default design applied to every quote PDF — cover, intro, item pages, and back cover, plus the
          company details shown on the document. Use <strong>Preview</strong> to see a sample quote rendered with it.
        </p>

        <div className="space-y-4">
          <h3 className="text-base font-medium">Template Images</h3>
          <div className={`grid grid-cols-1 ${embedded ? 'md:grid-cols-2' : 'md:grid-cols-4'} gap-6`}>
            <div className="space-y-2">
              <Label>Cover Page</Label>
              <div className="relative">
                <div
                  className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => coverInputRef.current?.click()}
                >
                  {coverPreview ? (
                    <img src={coverPreview} alt="Cover" className="w-full h-40 object-cover rounded" />
                  ) : (
                    <div className="h-40 flex flex-col items-center justify-center text-muted-foreground">
                      <Image className="h-8 w-8 mb-2" />
                      <span className="text-sm">Click to upload cover</span>
                    </div>
                  )}
                  {uploadingImage === 'template-cover.png' && (
                    <div className="mt-2 flex items-center justify-center gap-2 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Uploading...
                    </div>
                  )}
                </div>
                {coverPreview && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleImageDelete(pdfConfig.first_page_path || 'template-cover.png', setCoverPreview, 'first_page_path'); }}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                    title="Delete image"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file, 'template-cover.png', setCoverPreview, 'first_page_path');
                  e.target.value = '';
                }}
              />
            </div>

            <div className="space-y-2">
              <Label>Intro Page</Label>
              <div className="relative">
                <div
                  className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => introInputRef.current?.click()}
                >
                  {introPreview ? (
                    <img src={introPreview} alt="Intro" className="w-full h-40 object-cover rounded" />
                  ) : (
                    <div className="h-40 flex flex-col items-center justify-center text-muted-foreground">
                      <Image className="h-8 w-8 mb-2" />
                      <span className="text-sm">Click to upload intro page</span>
                    </div>
                  )}
                  {uploadingImage === 'template-intro.png' && (
                    <div className="mt-2 flex items-center justify-center gap-2 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Uploading...
                    </div>
                  )}
                </div>
                {introPreview && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleImageDelete(pdfConfig.intro_page_path || 'template-intro.png', setIntroPreview, 'intro_page_path'); }}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                    title="Delete image"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <input
                ref={introInputRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file, 'template-intro.png', setIntroPreview, 'intro_page_path');
                  e.target.value = '';
                }}
              />
            </div>

            <div className="space-y-2">
              <Label>Items Background</Label>
              <div className="relative">
                <div
                  className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => bgInputRef.current?.click()}
                >
                  {bgPreview ? (
                    <img src={bgPreview} alt="Background" className="w-full h-40 object-cover rounded" />
                  ) : (
                    <div className="h-40 flex flex-col items-center justify-center text-muted-foreground">
                      <Image className="h-8 w-8 mb-2" />
                      <span className="text-sm">Click to upload background</span>
                    </div>
                  )}
                  {uploadingImage === 'template-content.png' && (
                    <div className="mt-2 flex items-center justify-center gap-2 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Uploading...
                    </div>
                  )}
                </div>
                {bgPreview && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleImageDelete(pdfConfig.content_page_path || 'template-content.png', setBgPreview, 'content_page_path'); }}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                    title="Delete image"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <input
                ref={bgInputRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file, 'template-content.png', setBgPreview, 'content_page_path');
                  e.target.value = '';
                }}
              />
            </div>

            <div className="space-y-2">
              <Label>Back Cover Page</Label>
              <div className="relative">
                <div
                  className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => backcoverInputRef.current?.click()}
                >
                  {backcoverPreview ? (
                    <img src={backcoverPreview} alt="Back Cover" className="w-full h-40 object-cover rounded" />
                  ) : (
                    <div className="h-40 flex flex-col items-center justify-center text-muted-foreground">
                      <Image className="h-8 w-8 mb-2" />
                      <span className="text-sm">Click to upload back cover</span>
                    </div>
                  )}
                  {uploadingImage === 'template-backcover.png' && (
                    <div className="mt-2 flex items-center justify-center gap-2 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Uploading...
                    </div>
                  )}
                </div>
                {backcoverPreview && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleImageDelete(pdfConfig.last_page_path || 'template-backcover.png', setBackcoverPreview, 'last_page_path'); }}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                    title="Delete image"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <input
                ref={backcoverInputRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file, 'template-backcover.png', setBackcoverPreview, 'last_page_path');
                  e.target.value = '';
                }}
              />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-base font-medium">Company Details (shown on PDF)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company-name">Company Name</Label>
              <Input
                id="company-name"
                value={pdfConfig.company_name}
                onChange={(e) => setPdfConfig(prev => ({ ...prev, company_name: e.target.value }))}
                placeholder="Materials Hub"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company-email">Email</Label>
              <Input
                id="company-email"
                type="email"
                value={pdfConfig.company_email}
                onChange={(e) => setPdfConfig(prev => ({ ...prev, company_email: e.target.value }))}
                placeholder="info@materialkai.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company-phone">Phone</Label>
              <Input
                id="company-phone"
                value={pdfConfig.company_phone}
                onChange={(e) => setPdfConfig(prev => ({ ...prev, company_phone: e.target.value }))}
                placeholder="+30 210 1234567"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company-vat">VAT Number</Label>
              <Input
                id="company-vat"
                value={pdfConfig.company_vat}
                onChange={(e) => setPdfConfig(prev => ({ ...prev, company_vat: e.target.value }))}
                placeholder="EL123456789"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="company-address">Address</Label>
              <Input
                id="company-address"
                value={pdfConfig.company_address}
                onChange={(e) => setPdfConfig(prev => ({ ...prev, company_address: e.target.value }))}
                placeholder="123 Main Street, Athens, 10431, Greece"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="default-vat-rate">Default VAT Rate (%)</Label>
              <Input
                id="default-vat-rate"
                type="text"
                inputMode="decimal"
                value={pdfConfig.vat_rate_default}
                onChange={(e) => setPdfConfig(prev => ({ ...prev, vat_rate_default: parseDecimalOr(e.target.value, 0) }))}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={handlePreview} disabled={previewing}>
            {previewing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
            Preview
          </Button>
          <Button
            onClick={handleSavePdfConfig}
            disabled={savingPdf}
            style={{ backgroundColor: 'hsl(var(--primary))' }}
          >
            {savingPdf ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save PDF Settings
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Rendered preview of the PDF Design Template */}
      <Dialog open={!!previewUrl} onOpenChange={(o) => !o && setPreviewUrl(null)}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
          <DialogHeader><DialogTitle>PDF Design Template — Preview</DialogTitle></DialogHeader>
          {previewUrl && <iframe src={previewUrl} title="Quote template preview" className="w-full flex-1 rounded-md border" />}
        </DialogContent>
      </Dialog>
    </div>
  );

  if (loading) {
    if (embedded) {
      return (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      );
    }
    return (
      <div className="min-h-screen">
        <GlobalAdminHeader
          title="Quote Settings"
          description="Configure quote expiration + PDF template"
          badge="Admin"
        />
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (embedded) return content;

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader
        title="Quote Settings"
        description="Configure quote expiration + PDF template"
        badge="Admin"
      />
      {content}
    </div>
  );
};

export default QuoteSettingsPage;
