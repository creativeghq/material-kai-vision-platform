import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Upload, FileText, Loader2, Trash2, Plus, Sparkles, Wand2, Check, Library } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { catalogsService, type PresentationCatalog, type CatalogSourcePdf } from '@/services/catalogsService';
import { getErrorMessage } from '@/core/errors/utils';

interface Props {
  catalog: PresentationCatalog;
  /** Called after any change that mutates the catalog (attach/detach/extract/translate) so the parent reloads. */
  onChanged: () => void;
}

interface ExtractCandidate {
  name: string;
  description?: string | null;
  image_url?: string | null;
  price?: number | null;
  currency?: string | null;
  specs?: Record<string, any>;
  specs_raw?: Record<string, string[]>;
  source_pdf_id?: string | null;
  page_no?: number | null;
}

/**
 * Inline source-PDF management for the catalog builder. Mirrors the agent's
 * upload → attach → extract/translate flow so admins never have to detour to
 * the standalone /admin/catalogs/sources library page to get going.
 *
 * Uploaded PDFs are NOT digested into the platform product DB — they only feed
 * on-demand Vision extraction for this catalog.
 */
export const CatalogSourcesPanel: React.FC<Props> = ({ catalog, onChanged }) => {
  const { toast } = useToast();
  const [allSources, setAllSources] = useState<CatalogSourcePdf[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);

  // Upload metadata
  const [manufacturer, setManufacturer] = useState('');

  // Extraction
  const [extractQuery, setExtractQuery] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [candidates, setCandidates] = useState<ExtractCandidate[]>([]);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [sectionTitle, setSectionTitle] = useState('');

  const attachedIds = useMemo(() => new Set(catalog.source_pdf_ids || []), [catalog.source_pdf_ids]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setAllSources(await catalogsService.listSourcePdfs());
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to load source PDFs', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const attached = allSources.filter((s) => attachedIds.has(s.id));
  const unattached = allSources.filter((s) => !attachedIds.has(s.id));

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      await catalogsService.uploadAndAttachSourcePdf(catalog.id, file, {
        manufacturer_name: manufacturer.trim() || undefined,
      });
      toast({ title: 'Uploaded & attached', description: file.name });
      setManufacturer('');
      await load();
      onChanged();
    } catch (err) {
      toast({ title: 'Upload failed', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleAttach = async (sourceId: string) => {
    setBusyId(sourceId);
    try {
      await catalogsService.attachSourcePdfs(catalog.id, [sourceId]);
      onChanged();
    } catch (err) {
      toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' });
    } finally { setBusyId(null); }
  };

  const handleDetach = async (sourceId: string) => {
    setBusyId(sourceId);
    try {
      await catalogsService.detachSourcePdf(catalog.id, sourceId);
      onChanged();
    } catch (err) {
      toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' });
    } finally { setBusyId(null); }
  };

  const handleTranslate = async (sourceId: string, preserveLayout: boolean) => {
    setBusyId(sourceId);
    try {
      await catalogsService.translatePdf({ sourcePdfId: sourceId, targetCatalogId: catalog.id, preserveOriginalLayout: preserveLayout });
      toast({ title: 'Translated', description: 'Sections added to the catalog body.' });
      onChanged();
    } catch (err) {
      toast({ title: 'Translate failed', description: getErrorMessage(err), variant: 'destructive' });
    } finally { setBusyId(null); }
  };

  const handleExtract = async () => {
    if (!extractQuery.trim()) return;
    setExtracting(true);
    setCandidates([]);
    setSelected({});
    try {
      const res = await catalogsService.extractFromPdfs({ catalogId: catalog.id, query: extractQuery.trim() });
      const cands = (res.candidates || []) as ExtractCandidate[];
      setCandidates(cands);
      setSelected(Object.fromEntries(cands.map((_, i) => [i, true])));
      setSectionTitle(`Extracted: ${extractQuery.trim().slice(0, 60)}`);
      if (cands.length === 0) toast({ title: 'No matches', description: 'The Vision pass found no products for that query.' });
    } catch (err) {
      toast({ title: 'Extract failed', description: getErrorMessage(err), variant: 'destructive' });
    } finally { setExtracting(false); }
  };

  const handleAddSelected = async () => {
    const chosen = candidates.filter((_, i) => selected[i]);
    if (chosen.length === 0) return;
    try {
      await catalogsService.approveExtractionCandidates(catalog.id, sectionTitle.trim() || 'Extracted', chosen);
      toast({ title: 'Added', description: `${chosen.length} material${chosen.length === 1 ? '' : 's'} added.` });
      setCandidates([]);
      setSelected({});
      setExtractQuery('');
      onChanged();
    } catch (err) {
      toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      {/* Upload + attach */}
      <Card className="dashboard-card">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2"><Upload className="h-4 w-4" /> Add source PDFs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Upload a manufacturer or discount-list PDF to extract products from. It stays a one-off source for this
            catalog — it is <strong>not</strong> ingested into the product database.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1 flex-1 min-w-[180px]">
              <Label className="text-xs">Manufacturer / Label (optional)</Label>
              <Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="e.g. Spring discounts 2026" />
            </div>
            <input
              id="catalog-inline-upload"
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
                e.target.value = '';
              }}
            />
            <Button onClick={() => document.getElementById('catalog-inline-upload')?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Upload PDF
            </Button>
            <Button variant="outline" onClick={() => setShowLibrary((v) => !v)}>
              <Library className="mr-2 h-4 w-4" /> {showLibrary ? 'Hide library' : 'Attach existing'}
            </Button>
          </div>

          {showLibrary && (
            <div className="border rounded p-2 space-y-1 max-h-60 overflow-y-auto">
              {loading ? (
                <div className="text-xs text-muted-foreground flex items-center gap-2 py-2"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</div>
              ) : unattached.length === 0 ? (
                <div className="text-xs text-muted-foreground py-2">No other source PDFs in your library.</div>
              ) : unattached.map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-sm py-1">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate flex-1">{s.original_filename}</span>
                  {s.manufacturer_name && <Badge variant="secondary" className="text-[10px] py-0">{s.manufacturer_name}</Badge>}
                  <Button size="sm" variant="ghost" disabled={busyId === s.id} onClick={() => handleAttach(s.id)}>
                    {busyId === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Attach
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attached PDFs */}
      <Card className="dashboard-card">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" /> Attached PDFs ({attached.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {attached.length === 0 ? (
            <div className="text-sm text-muted-foreground py-2">No PDFs attached yet. Upload or attach one above.</div>
          ) : attached.map((s) => (
            <div key={s.id} className="border rounded p-3 space-y-2">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-medium text-sm truncate flex-1">{s.original_filename}</span>
                {s.page_count && <Badge variant="outline" className="text-[10px] py-0">{s.page_count}p</Badge>}
                <Button size="sm" variant="ghost" disabled={busyId === s.id} onClick={() => handleDetach(s.id)} title="Detach (keeps the PDF in your library)">
                  {busyId === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3 text-destructive" />}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={busyId === s.id} onClick={() => handleTranslate(s.id, false)}>
                  <Wand2 className="mr-2 h-3 w-3" /> Translate whole PDF
                </Button>
                <Button size="sm" variant="ghost" disabled={busyId === s.id} onClick={() => handleTranslate(s.id, true)}>
                  Translate (keep page layout)
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Targeted extract */}
      {attached.length > 0 && (
        <Card className="dashboard-card">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Extract specific products</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={extractQuery}
                onChange={(e) => setExtractQuery(e.target.value)}
                placeholder='e.g. "white porcelain tiles on discount"'
                onKeyDown={(e) => { if (e.key === 'Enter') handleExtract(); }}
              />
              <Button onClick={handleExtract} disabled={extracting || !extractQuery.trim()}>
                {extracting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Extract
              </Button>
            </div>

            {candidates.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Add to section</Label>
                  <Input value={sectionTitle} onChange={(e) => setSectionTitle(e.target.value)} className="max-w-xs h-8" />
                  <Button size="sm" className="ml-auto" onClick={handleAddSelected} disabled={!Object.values(selected).some(Boolean)}>
                    <Check className="mr-2 h-3 w-3" /> Add selected ({Object.values(selected).filter(Boolean).length})
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {candidates.map((c, i) => (
                    <label key={i} className={`border rounded p-2 flex gap-2 items-start cursor-pointer ${selected[i] ? 'border-primary' : ''}`}>
                      <Checkbox
                        checked={!!selected[i]}
                        onCheckedChange={(v) => setSelected((prev) => ({ ...prev, [i]: v === true }))}
                        className="mt-1"
                       />
                      <div className="w-14 h-14 rounded bg-muted shrink-0 overflow-hidden">
                        {c.image_url
                          ? <img src={c.image_url} alt={c.name} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">no img</div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{c.name}</div>
                        {c.description && <div className="text-xs text-muted-foreground line-clamp-2">{c.description}</div>}
                        {c.price != null && <div className="text-xs font-medium mt-0.5">{c.currency || ''} {c.price}</div>}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
