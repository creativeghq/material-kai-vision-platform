import React, { useState, useEffect, useRef } from 'react';
import { Save, Loader2, Clock, FileText, Image, X, Eye } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { edgeErrorMessage } from '@/utils/edgeError';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';

interface PDFTemplateConfig {
  first_page_path: string;
  intro_page_path: string;
  last_page_path: string;
  content_page_path: string;
}

const DEFAULT_PDF_CONFIG: PDFTemplateConfig = {
  first_page_path: '',
  intro_page_path: '',
  last_page_path: '',
  content_page_path: '',
};

// One of the four template slots. Maps to the PDFTemplateConfig key and the
// per-workspace finance_settings column. Every workspace (root included) self-serves.
type TemplateSlot = 'cover' | 'intro' | 'content' | 'backcover';

const SLOT_TO_CONFIG_KEY: Record<TemplateSlot, keyof PDFTemplateConfig> = {
  cover: 'first_page_path',
  intro: 'intro_page_path',
  content: 'content_page_path',
  backcover: 'last_page_path',
};

/**
 * Where each slot is stored: `workspace_pdf_templates`, which is what EVERY PDF generator
 * actually resolves from (`_shared/pdf/branding.ts`, `generate-moodboard-sheet-pdf`).
 *
 * This used to write `finance_settings.quote_template_*_path` — a second, parallel vault
 * that NOTHING reads (`grep quote_template supabase/functions/` → zero hits). Templates
 * uploaded here therefore never appeared on a quote, and the natural response is to upload
 * them again and blame the renderer. One store, one writer. (audit #298)
 */
const SLOT_TO_TEMPLATE_COL: Record<TemplateSlot, string> = {
  cover: 'cover_path',
  intro: 'intro_path',
  // The "content" slot is the page BACKGROUND in the generator's vocabulary.
  content: 'background_path',
  backcover: 'backcover_path',
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
  const [uploadingImage, setUploadingImage] = useState<string | null>(null);

  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [introPreview, setIntroPreview] = useState<string | null>(null);
  const [backcoverPreview, setBackcoverPreview] = useState<string | null>(null);
  const [bgPreview, setBgPreview] = useState<string | null>(null);

  // Rendered "proper view" of the whole template (a sample quote PDF).
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  // Every workspace (root included) self-serves its own template images under its
  // own {workspace_id}/ prefix, persisted on its finance_settings row.
  const slotPath = (slot: TemplateSlot) => `${activeWorkspaceId}/quote-${slot}.png`;
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
  }, []);

  // Re-run when the active workspace resolves — reads this workspace's finance_settings row.
  useEffect(() => {
    loadPDFTemplateConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId]);

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
      // This workspace's 4 template paths live on `workspace_pdf_templates` — the store the
      // PDF generators actually read. (Was finance_settings.quote_template_*, which has no
      // reader anywhere; see SLOT_TO_TEMPLATE_COL.)
      if (!activeWorkspaceId) return;
      const { data, error } = await supabase
        .from('workspace_pdf_templates')
        .select('cover_path, intro_path, background_path, backcover_path')
        .eq('workspace_id', activeWorkspaceId)
        .maybeSingle();

      if (error) throw error;

      const config: PDFTemplateConfig = {
        ...DEFAULT_PDF_CONFIG,
        first_page_path: data?.cover_path || '',
        intro_page_path: data?.intro_path || '',
        content_page_path: data?.background_path || '',
        last_page_path: data?.backcover_path || '',
      };
      setPdfConfig(config);

      config.first_page_path ? loadImagePreview(config.first_page_path, setCoverPreview) : setCoverPreview(null);
      config.intro_page_path ? loadImagePreview(config.intro_page_path, setIntroPreview) : setIntroPreview(null);
      config.last_page_path ? loadImagePreview(config.last_page_path, setBackcoverPreview) : setBackcoverPreview(null);
      config.content_page_path ? loadImagePreview(config.content_page_path, setBgPreview) : setBgPreview(null);
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
    slot: TemplateSlot,
    previewSetter: (url: string | null) => void,
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

    const targetPath = slotPath(slot);
    const configKey = SLOT_TO_CONFIG_KEY[slot];

    try {
      setUploadingImage(targetPath);
      const { error } = await supabase.storage
        .from('quote-templates')
        .upload(targetPath, file, { upsert: true });

      if (error) throw error;

      await loadImagePreview(targetPath, previewSetter);

      setPdfConfig({ ...pdfConfig, [configKey]: targetPath });

      // Persist onto workspace_pdf_templates — the store every PDF generator reads.
      const col = SLOT_TO_TEMPLATE_COL[slot];
      const { error: upErr } = await supabase
        .from('workspace_pdf_templates')
        .upsert({ workspace_id: activeWorkspaceId, [col]: targetPath }, { onConflict: 'workspace_id' });
      if (upErr) throw upErr;

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
    slot: TemplateSlot,
    previewSetter: (url: string | null) => void,
  ) => {
    const storagePath = slotPath(slot);
    const configKey = SLOT_TO_CONFIG_KEY[slot];
    try {
      setUploadingImage(storagePath);
      await supabase.storage.from('quote-templates').remove([storagePath]);

      previewSetter(null);

      setPdfConfig({ ...pdfConfig, [configKey]: '' });

      const col = SLOT_TO_TEMPLATE_COL[slot];
      const { error: clrErr } = await supabase
        .from('workspace_pdf_templates')
        .update({ [col]: null })
        .eq('workspace_id', activeWorkspaceId);
      if (clrErr) throw clrErr;

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

  const content = (
    <div className={embedded ? 'space-y-6' : 'p-3 sm:p-6 space-y-6'}>
      {/* Quote expiration is a platform-global setting — only the operator (root) edits it. */}
      {activeWorkspace?.isRoot && (
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
      )}

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
          This workspace&apos;s PDF Design Template — cover, intro, item pages, and back cover. Any slot you leave empty
          inherits the operator default. Use <strong>Preview</strong> to see a sample quote rendered with it.
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
                  {uploadingImage === slotPath('cover') && (
                    <div className="mt-2 flex items-center justify-center gap-2 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Uploading...
                    </div>
                  )}
                </div>
                {coverPreview && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleImageDelete('cover', setCoverPreview); }}
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
                  if (file) handleImageUpload(file, 'cover', setCoverPreview);
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
                  {uploadingImage === slotPath('intro') && (
                    <div className="mt-2 flex items-center justify-center gap-2 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Uploading...
                    </div>
                  )}
                </div>
                {introPreview && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleImageDelete('intro', setIntroPreview); }}
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
                  if (file) handleImageUpload(file, 'intro', setIntroPreview);
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
                  {uploadingImage === slotPath('content') && (
                    <div className="mt-2 flex items-center justify-center gap-2 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Uploading...
                    </div>
                  )}
                </div>
                {bgPreview && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleImageDelete('content', setBgPreview); }}
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
                  if (file) handleImageUpload(file, 'content', setBgPreview);
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
                  {uploadingImage === slotPath('backcover') && (
                    <div className="mt-2 flex items-center justify-center gap-2 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Uploading...
                    </div>
                  )}
                </div>
                {backcoverPreview && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleImageDelete('backcover', setBackcoverPreview); }}
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
                  if (file) handleImageUpload(file, 'backcover', setBackcoverPreview);
                  e.target.value = '';
                }}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={handlePreview} disabled={previewing}>
            {previewing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
            Preview
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
