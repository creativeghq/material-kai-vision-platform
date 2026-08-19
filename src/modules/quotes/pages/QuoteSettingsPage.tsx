import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Save, Loader2, Clock, FileText, Eye, ExternalLink } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { edgeErrorMessage } from '@/utils/edgeError';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';

interface QuoteSettingsProps {
  /** Render without the page header — used when mounted inside a Sheet panel. */
  embedded?: boolean;
}

/**
 * Quote settings: the expiration window (operator-only) and a rendered preview of the
 * workspace's PDF design.
 *
 * The four template slots are NOT edited here. They live on `workspace_pdf_templates`,
 * one row per workspace, and that row is the design for every presentation document —
 * quotes, catalogs, proformas, moodboard sheets. Its editor is Profile → Keys →
 * Document Templates (`WorkspacePdfTemplateCard`). This page used to carry a second
 * uploader over the same row and the same `quote-templates` bucket, which is not merely
 * redundant: it never wrote `cover_width`/`cover_height` (the renderer takes the PDF page
 * size and orientation from them, so a cover uploaded here kept the PREVIOUS cover's
 * dimensions), it uploaded the file undownscaled (pdf-lib decodes the whole image into
 * memory and a full-size PNG OOMs the PDF worker), and its delete removed a hardcoded
 * `quote-<slot>.png` path rather than whatever the column actually pointed at. One store,
 * one editor.
 */
export const QuoteSettingsPage: React.FC<QuoteSettingsProps> = ({ embedded = false }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [quoteExpirationDays, setQuoteExpirationDays] = useState<number>(30);
  const [settingId, setSettingId] = useState<string>('');

  const { activeWorkspaceId, activeWorkspace } = useWorkspace();

  // Rendered "proper view" of the whole template (a sample quote PDF).
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

  useEffect(() => {
    loadSettings();
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

      <div className="dashboard-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
            <h2 className="text-xl font-semibold">PDF Design</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/profile?tab=keys">
                <ExternalLink className="h-4 w-4 mr-2" />
                Edit template
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={handlePreview} disabled={previewing}>
              {previewing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
              Preview
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Quotes render with your workspace&apos;s document template — cover, introduction, item-page
          background and back cover. It is shared with catalogs, proformas and moodboard sheets, so it is
          edited in one place: <strong>Profile → Keys → Document Templates</strong>. Any slot you leave
          empty inherits the operator default. Use <strong>Preview</strong> to see a sample quote rendered
          with it.
        </p>
      </div>

      {/* Rendered preview of the workspace's PDF design */}
      <Dialog open={!!previewUrl} onOpenChange={(o) => !o && setPreviewUrl(null)}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
          <DialogHeader><DialogTitle>PDF Design — Preview</DialogTitle></DialogHeader>
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
          description="Configure quote expiration + PDF design"
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
        description="Configure quote expiration + PDF design"
        badge="Admin"
      />
      {content}
    </div>
  );
};

export default QuoteSettingsPage;
