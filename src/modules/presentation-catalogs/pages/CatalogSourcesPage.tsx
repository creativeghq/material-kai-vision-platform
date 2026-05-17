import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, FileText, Trash2, Loader2, Copy, Check } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { catalogsService, type CatalogSourcePdf } from '@/services/catalogsService';

export const CatalogSourcesPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [sources, setSources] = useState<CatalogSourcePdf[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [manufacturer, setManufacturer] = useState('');
  const [manufacturerUrl, setManufacturerUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const rows = await catalogsService.listSourcePdfs();
      setSources(rows);
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to load', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      await catalogsService.uploadSourcePdf(file, {
        manufacturer_name: manufacturer.trim() || undefined,
        manufacturer_url: manufacturerUrl.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast({ title: 'Uploaded', description: file.name });
      setManufacturer('');
      setManufacturerUrl('');
      setNotes('');
      load();
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Upload failed', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this source PDF?')) return;
    try {
      await catalogsService.deleteSourcePdf(id);
      load();
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Delete failed', variant: 'destructive' });
    }
  };

  const handleCopyId = async (id: string) => {
    await navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <PageHeader
        title="Catalog Source PDFs"
        subtitle="Upload manufacturer catalogs that the KAI agent can extract from."
        icon={FileText}
        actions={
          <Button variant="outline" onClick={() => navigate('/admin/catalogs')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Catalogs
          </Button>
        }
      />

      <Card className="dashboard-card">
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Manufacturer name (optional)</Label>
              <Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="e.g. Flobali" />
            </div>
            <div className="space-y-2">
              <Label>Manufacturer URL</Label>
              <Input value={manufacturerUrl} onChange={(e) => setManufacturerUrl(e.target.value)} placeholder="https://..." />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal note for this catalog" />
            </div>
          </div>
          <div>
            <input
              id="catalog-source-upload"
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
                e.target.value = '';
              }}
            />
            <Button
              onClick={() => document.getElementById('catalog-source-upload')?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Upload PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : sources.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            No source PDFs uploaded yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {sources.map((s) => (
            <Card key={s.id} className="dashboard-card">
              <CardContent className="p-4 flex items-center gap-4">
                <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{s.original_filename}</span>
                    <Badge variant="outline">{s.status}</Badge>
                    {s.manufacturer_name && <Badge variant="secondary">{s.manufacturer_name}</Badge>}
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                    {s.page_count && <span>{s.page_count} pages</span>}
                    {s.file_size_bytes && <span>{(s.file_size_bytes / 1024 / 1024).toFixed(1)} MB</span>}
                    <span>uploaded {new Date(s.created_at).toLocaleDateString()}</span>
                    {s.notes && <span title={s.notes}>📝</span>}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => handleCopyId(s.id)} title="Copy source_pdf_id">
                    {copiedId === s.id ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(s.id)} title="Delete">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
