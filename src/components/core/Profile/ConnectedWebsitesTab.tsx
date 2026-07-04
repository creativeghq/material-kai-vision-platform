import React, { useEffect, useState } from 'react';
import {
  Globe, Plus, Trash2, RefreshCw, Loader2, ExternalLink, Star,
  AlertTriangle, CheckCircle2, Pencil,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import { Switch } from '@/components/core/ui/switch';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  userWebsitesService,
  type UserWebsite,
  type PreviewResult,
} from '@/services/userWebsitesService';
import { Search, FileSearch } from 'lucide-react';

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function statusOf(w: UserWebsite): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode } {
  if (w.last_crawl_error) {
    return { label: 'Error', variant: 'destructive', icon: <AlertTriangle className="w-3 h-3" /> };
  }
  if (w.last_crawled_at && w.page_count > 0) {
    return { label: `${w.page_count} pages indexed`, variant: 'default', icon: <CheckCircle2 className="w-3 h-3" /> };
  }
  if (w.last_crawled_at) {
    return { label: 'Crawled — no pages', variant: 'secondary', icon: <AlertTriangle className="w-3 h-3" /> };
  }
  return { label: 'Not crawled yet', variant: 'outline', icon: <Globe className="w-3 h-3" /> };
}

export const ConnectedWebsitesTab: React.FC = () => {
  const { toast } = useToast();
  const [sites, setSites] = useState<UserWebsite[]>([]);
  const [loading, setLoading] = useState(true);
  const [crawling, setCrawling] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<UserWebsite | null>(null);
  const [adding, setAdding] = useState(false);
  const [previewing, setPreviewing] = useState<Record<string, boolean>>({});
  const [previewResult, setPreviewResult] = useState<{ website: UserWebsite; result: PreviewResult } | null>(null);

  // Add/edit form state
  const [form, setForm] = useState({
    url: '',
    sitemap_url: '',
    display_name: '',
    is_default: false,
    max_pages: 500,
  });
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    try {
      setLoading(true);
      const rows = await userWebsitesService.list();
      setSites(rows);
    } catch (e: any) {
      toast({ title: 'Failed to load websites', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const openAdd = () => {
    setForm({ url: '', sitemap_url: '', display_name: '', is_default: sites.length === 0, max_pages: 50 });
    setEditing(null);
    setAdding(true);
  };

  const openEdit = (w: UserWebsite) => {
    setForm({
      url: w.url,
      sitemap_url: w.sitemap_url || '',
      display_name: w.display_name || '',
      is_default: w.is_default,
      max_pages: w.max_pages,
    });
    setEditing(w);
    setAdding(true);
  };

  const handleSave = async () => {
    if (!form.url.trim()) {
      toast({ title: 'URL is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await userWebsitesService.update(editing.id, {
          url: form.url,
          sitemap_url: form.sitemap_url || null,
          display_name: form.display_name || null,
          is_default: form.is_default,
          max_pages: form.max_pages,
        });
        toast({ title: 'Website updated' });
      } else {
        const created = await userWebsitesService.create({
          url: form.url,
          sitemap_url: form.sitemap_url || null,
          display_name: form.display_name || null,
          is_default: form.is_default,
          max_pages: form.max_pages,
        });
        toast({ title: 'Website added', description: 'Running preview scan…' });
        // Run a lightweight preview first so the user can confirm before the full crawl.
        userWebsitesService.preview(created.id).then((result) => {
          reload();
          setPreviewResult({ website: { ...created, sitemap_url: result.sitemap_url ?? created.sitemap_url } as UserWebsite, result });
        }).catch((e) => {
          toast({ title: 'Preview failed', description: e.message, variant: 'destructive' });
          reload();
        });
      }
      setAdding(false);
      setEditing(null);
      reload();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleCrawl = async (w: UserWebsite) => {
    setCrawling((c) => ({ ...c, [w.id]: true }));
    try {
      const result = await userWebsitesService.crawl(w.id);
      toast({
        title: 'Crawl complete',
        description: `${result.pages_indexed} of ${result.pages_discovered} pages indexed`,
      });
      reload();
    } catch (e: any) {
      toast({ title: 'Crawl failed', description: e.message, variant: 'destructive' });
      reload();
    } finally {
      setCrawling((c) => ({ ...c, [w.id]: false }));
    }
  };

  const handlePreview = async (w: UserWebsite) => {
    setPreviewing((p) => ({ ...p, [w.id]: true }));
    try {
      const result = await userWebsitesService.preview(w.id);
      setPreviewResult({ website: w, result });
    } catch (e: any) {
      toast({ title: 'Preview failed', description: e.message, variant: 'destructive' });
    } finally {
      setPreviewing((p) => ({ ...p, [w.id]: false }));
    }
  };

  const handleProceedFullCrawl = async () => {
    if (!previewResult) return;
    const w = previewResult.website;
    setPreviewResult(null);
    setCrawling((c) => ({ ...c, [w.id]: true }));
    try {
      const result = await userWebsitesService.crawl(w.id);
      toast({
        title: 'Crawl complete',
        description: `${result.pages_indexed} of ${result.pages_discovered} pages indexed`,
      });
    } catch (e: any) {
      toast({ title: 'Crawl failed', description: e.message, variant: 'destructive' });
    } finally {
      setCrawling((c) => ({ ...c, [w.id]: false }));
      reload();
    }
  };

  const handleRemove = async (w: UserWebsite) => {
    if (!confirm(`Remove ${w.url}? This deletes all indexed pages.`)) return;
    try {
      await userWebsitesService.remove(w.id);
      toast({ title: 'Website removed' });
      reload();
    } catch (e: any) {
      toast({ title: 'Remove failed', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Connected Websites</h2>
        <p className="text-sm text-muted-foreground">
          Connect your website's sitemap to enable site-aware inter-linking suggestions when generating SEO articles.
        </p>
      </div>

      <Card className="dashboard-card">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="w-4 h-4" />
              Your Websites
            </CardTitle>
            <CardDescription>
              The crawler reads your sitemap, fetches each page, and builds a semantic index. We never publish or modify anything on your site.
            </CardDescription>
          </div>
          <Button onClick={openAdd} className="rounded-full" size="sm">
            <Plus className="w-4 h-4 mr-1" />
            Add Website
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : sites.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No websites connected yet. Add one to enable inter-linking suggestions.
            </div>
          ) : (
            <div className="space-y-2">
              {sites.map((w) => {
                const status = statusOf(w);
                return (
                  <div
                    key={w.id}
                    className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Globe className="w-4 h-4 text-primary" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">
                          {w.display_name || w.url.replace(/^https?:\/\//, '')}
                        </span>
                        {w.is_default && (
                          <Badge variant="secondary" className="text-[10px] gap-1">
                            <Star className="w-2.5 h-2.5" />
                            Default
                          </Badge>
                        )}
                        <Badge variant={status.variant} className="text-[10px] gap-1">
                          {status.icon}
                          {status.label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                        <a
                          href={w.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 hover:text-foreground"
                        >
                          {w.url}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        <span>·</span>
                        <span>Last crawl: {timeAgo(w.last_crawled_at)}</span>
                        {w.sitemap_url && (
                          <>
                            <span>·</span>
                            <span className="truncate max-w-[280px]">Sitemap: {w.sitemap_url}</span>
                          </>
                        )}
                      </div>
                      {w.last_crawl_error && (
                        <div className="mt-1 text-xs text-red-500 flex items-start gap-1">
                          <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                          <span className="break-all">{w.last_crawl_error}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Preview (sample 5 pages)"
                        onClick={() => handlePreview(w)}
                        disabled={!!previewing[w.id]}
                      >
                        {previewing[w.id] ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <FileSearch className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Recrawl now (full)"
                        onClick={() => handleCrawl(w)}
                        disabled={!!crawling[w.id]}
                      >
                        {crawling[w.id] ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                      </Button>
                      <Button variant="ghost" size="icon" title="Edit" onClick={() => openEdit(w)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Remove"
                        onClick={() => handleRemove(w)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={adding} onOpenChange={(o) => { if (!o) { setAdding(false); setEditing(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Website' : 'Add Website'}</DialogTitle>
            <DialogDescription>
              We'll fetch your sitemap and build a semantic index of your pages. The crawl uses Firecrawl + Voyage embeddings and runs daily.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="ws-url">Website URL *</Label>
              <Input
                id="ws-url"
                placeholder="https://yourdomain.com"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="ws-sitemap">Sitemap URL (optional)</Label>
              <Input
                id="ws-sitemap"
                placeholder="Auto-detected from /sitemap.xml or robots.txt"
                value={form.sitemap_url}
                onChange={(e) => setForm((f) => ({ ...f, sitemap_url: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                We try <code>/sitemap.xml</code>, <code>/sitemap_index.xml</code>, then read <code>robots.txt</code>. Provide one explicitly if your sitemap lives elsewhere.
              </p>
            </div>
            <div>
              <Label htmlFor="ws-name">Display Name (optional)</Label>
              <Input
                id="ws-name"
                placeholder="My Blog"
                value={form.display_name}
                onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="ws-cap">Max pages to index</Label>
              <Input
                id="ws-cap"
                type="number"
                min={10}
                max={1000}
                value={form.max_pages}
                onChange={(e) => setForm((f) => ({ ...f, max_pages: Math.max(10, Math.min(1000, parseInt(e.target.value, 10) || 50)) }))}
              />
              <p className="text-xs text-muted-foreground mt-1">Default 50 — enough for most blogs. Hard cap is 1000. Larger sites should use a topic-scoped sitemap URL.</p>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="ws-default" className="text-sm">Use as default</Label>
                <p className="text-xs text-muted-foreground">Inter-linking suggestions for new articles will pull from this site.</p>
              </div>
              <Switch
                id="ws-default"
                checked={form.is_default}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_default: v }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => { setAdding(false); setEditing(null); }} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="rounded-full">
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              {editing ? 'Save Changes' : 'Add & Preview'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview-result dialog — shows sitemap stats + 5-page sample, then prompts for full crawl */}
      <Dialog open={!!previewResult} onOpenChange={(o) => { if (!o) setPreviewResult(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="w-4 h-4" />
              Sitemap Preview
            </DialogTitle>
            <DialogDescription>
              {previewResult?.website.url} — review the sample below before running the full crawl. We charge Firecrawl per page, so this preview helps avoid wasted spend on a sitemap that doesn't look right.
            </DialogDescription>
          </DialogHeader>

          {previewResult && (
            <div className="space-y-4 py-2">
              {/* Stats bar */}
              <div className="grid grid-cols-3 gap-3">
                <div className="border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Total URLs</p>
                  <p className="text-xl font-semibold">{previewResult.result.pages_discovered.toLocaleString()}</p>
                </div>
                <div className="border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Will crawl up to</p>
                  <p className="text-xl font-semibold">{Math.min(previewResult.website.max_pages, previewResult.result.pages_discovered)}</p>
                </div>
                <div className="border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Sample success</p>
                  <p className="text-xl font-semibold">
                    {previewResult.result.sample.filter((s) => s.ok).length}/{previewResult.result.sample.length}
                  </p>
                </div>
              </div>

              {previewResult.result.sitemap_url && (
                <p className="text-xs text-muted-foreground">
                  Sitemap: <code className="text-foreground">{previewResult.result.sitemap_url}</code>
                </p>
              )}

              {previewResult.result.pages_discovered > previewResult.website.max_pages && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20 text-xs">
                  <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 mt-0.5 flex-shrink-0" />
                  <p>
                    Your sitemap has {previewResult.result.pages_discovered.toLocaleString()} URLs but the cap for this site is {previewResult.website.max_pages}.
                    The crawler picks the first {previewResult.website.max_pages} sitemap entries. Raise the cap (max 1000) or use a topic-scoped sitemap URL if needed.
                  </p>
                </div>
              )}

              {/* Sample */}
              <div>
                <h4 className="text-sm font-semibold mb-2">Sample pages ({previewResult.result.sample.length})</h4>
                <div className="space-y-2 max-h-[280px] overflow-y-auto">
                  {previewResult.result.sample.length === 0 && (
                    <p className="text-sm text-muted-foreground">No pages could be sampled.</p>
                  )}
                  {previewResult.result.sample.map((s, i) => (
                    <div key={i} className="p-2 border rounded-lg space-y-0.5">
                      <div className="flex items-center gap-2">
                        {s.ok ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
                        )}
                        <span className="text-sm font-medium truncate">
                          {s.title || <span className="italic text-muted-foreground">no title</span>}
                        </span>
                      </div>
                      {s.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 pl-5">{s.description}</p>
                      )}
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline truncate block pl-5"
                      >
                        {s.url}
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setPreviewResult(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleProceedFullCrawl}
              className="rounded-full"
              disabled={!previewResult?.result.ok}
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              Proceed with Full Crawl
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
