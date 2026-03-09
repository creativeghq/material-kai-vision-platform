import React, { useState, useEffect, useRef } from 'react';
import { Settings, Save, Loader2, Clock, FileText, Upload, Image, X } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { GlobalAdminHeader } from './GlobalAdminHeader';

interface SystemSetting {
  id: string;
  setting_key: string;
  setting_value: number;
  description: string;
  updated_by?: string;
  created_at: string;
  updated_at: string;
}

interface PDFTemplateConfig {
  cover_image_path: string;
  intro_page_path: string;
  backcover_image_path: string;
  items_background_path: string;
  company_name: string;
  company_address: string;
  company_phone: string;
  company_email: string;
  company_vat: string;
  vat_rate_default: number;
}

const DEFAULT_PDF_CONFIG: PDFTemplateConfig = {
  cover_image_path: 'cover.png',
  intro_page_path: '',
  backcover_image_path: 'backcover.png',
  items_background_path: 'items-background.png',
  company_name: '',
  company_address: '',
  company_phone: '',
  company_email: '',
  company_vat: '',
  vat_rate_default: 24,
};

export const SystemSettingsPage: React.FC = () => {
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

  // Image preview URLs
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [introPreview, setIntroPreview] = useState<string | null>(null);
  const [backcoverPreview, setBackcoverPreview] = useState<string | null>(null);
  const [bgPreview, setBgPreview] = useState<string | null>(null);

  // File input refs
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
        .single();

      if (error) throw error;

      if (data) {
        setQuoteExpirationDays(data.setting_value as number);
        setSettingId(data.id);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to load system settings',
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
        const config = data.setting_value as Record<string, any>;
        setPdfConfig({
          ...DEFAULT_PDF_CONFIG,
          ...config,
        });
        setPdfSettingId(data.id);

        // Load image previews using resolved config paths
        loadImagePreview(config.first_page_path || config.cover_image_path || 'cover.png', setCoverPreview);
        if (config.intro_page_path) loadImagePreview(config.intro_page_path, setIntroPreview);
        loadImagePreview(config.last_page_path || config.backcover_image_path || 'backcover.png', setBackcoverPreview);
        loadImagePreview(config.content_page_path || config.items_background_path || 'items-background.png', setBgPreview);
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
        description: 'System settings updated successfully',
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to save system settings',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (
    file: File,
    targetPath: string,
    previewSetter: (url: string | null) => void
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

      // Refresh preview
      await loadImagePreview(targetPath, previewSetter);

      toast({ title: 'Image uploaded', description: `${targetPath} updated successfully.` });
    } catch (error) {
      console.error('Error uploading image:', error);
      toast({ title: 'Upload failed', description: 'Failed to upload image.', variant: 'destructive' });
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

  if (loading) {
    return (
      <div className="min-h-screen">
        <GlobalAdminHeader
          title="System Settings"
          description="Configure platform-wide settings"
          badge="Admin"
        />
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader
        title="System Settings"
        description="Configure platform-wide settings"
        badge="Admin"
      />

      {/* Settings Content */}
      <div className="p-6 space-y-6">
          <div className="dashboard-card space-y-6">
            {/* Quote Expiration Setting */}
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

            {/* Save Button */}
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

          {/* Quote PDF Template Settings */}
          <div className="dashboard-card space-y-6">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
              <h2 className="text-xl font-semibold">Quote PDF Template</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Configure the images and company details used when generating quote PDFs.
            </p>

            {/* Template Images */}
            <div className="space-y-4">
              <h3 className="text-base font-medium">Template Images</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* Cover Image */}
                <div className="space-y-2">
                  <Label>Cover Page</Label>
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
                    {uploadingImage === 'cover.png' && (
                      <div className="mt-2 flex items-center justify-center gap-2 text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Uploading...
                      </div>
                    )}
                  </div>
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(file, 'cover.png', setCoverPreview);
                      e.target.value = '';
                    }}
                  />
                </div>

                {/* Intro Page Image */}
                <div className="space-y-2">
                  <Label>Intro Page</Label>
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
                    {uploadingImage === 'intro-page.png' && (
                      <div className="mt-2 flex items-center justify-center gap-2 text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Uploading...
                      </div>
                    )}
                  </div>
                  <input
                    ref={introInputRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleImageUpload(file, 'intro-page.png', setIntroPreview);
                        setPdfConfig(prev => ({ ...prev, intro_page_path: 'intro-page.png' }));
                      }
                      e.target.value = '';
                    }}
                  />
                </div>

                {/* Items Background Image */}
                <div className="space-y-2">
                  <Label>Items Background</Label>
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
                    {uploadingImage === 'items-background.png' && (
                      <div className="mt-2 flex items-center justify-center gap-2 text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Uploading...
                      </div>
                    )}
                  </div>
                  <input
                    ref={bgInputRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(file, 'items-background.png', setBgPreview);
                      e.target.value = '';
                    }}
                  />
                </div>

                {/* Back Cover Image */}
                <div className="space-y-2">
                  <Label>Back Cover Page</Label>
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
                    {uploadingImage === 'backcover.png' && (
                      <div className="mt-2 flex items-center justify-center gap-2 text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Uploading...
                      </div>
                    )}
                  </div>
                  <input
                    ref={backcoverInputRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(file, 'backcover.png', setBackcoverPreview);
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Company Details */}
            <div className="space-y-4">
              <h3 className="text-base font-medium">Company Details (shown on PDF)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="company-name">Company Name</Label>
                  <Input
                    id="company-name"
                    value={pdfConfig.company_name}
                    onChange={(e) => setPdfConfig(prev => ({ ...prev, company_name: e.target.value }))}
                    placeholder="Material Kai"
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
                    type="number"
                    step="0.5"
                    min="0"
                    value={pdfConfig.vat_rate_default}
                    onChange={(e) => setPdfConfig(prev => ({ ...prev, vat_rate_default: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
              </div>
            </div>

            {/* Save PDF Config */}
            <div className="flex justify-end pt-4">
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
      </div>
    </div>
  );
};
