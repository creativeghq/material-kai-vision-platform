import React, { useEffect, useState } from 'react';
import { timeAgo } from '@/utils/datetime';
import {
  Globe, Plus, Trash2, RefreshCw, Loader2, ExternalLink, Star,
  AlertTriangle, CheckCircle2, Pencil, MoreHorizontal,
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
import { useWorkspace } from '@/contexts/WorkspaceContext';
import {
  userWebsitesService,
  type UserWebsite,
  type PreviewResult,
} from '@/services/userWebsitesService';
import { Search, FileSearch } from 'lucide-react';
import { formatNumber } from '@/utils/decimal';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/core/ui/dropdown-menu';
import {
  HubCellEmpty, HubCellLink, HubDataTable, HubEmptyState, type HubColumn,
} from '@/components/core/hub';


/**
 * Four states, and they are NOT four shades of the same thing — which is why the page count
 * moved out of this label and into its own column. "384 pages indexed" as a solid accent badge
 * put a number inside a status, so the two could not be scanned separately and the badge carried
 * the weight of a button in every row (design system: status is a TINTED tag, never a fill).
 *
 * "Crawled — no pages" is the one that has to stay distinct from "not crawled": the crawler ran
 * and found nothing, which is a finding, not an absence of one.
 */
function statusOf(w: UserWebsite): {
  label: string;
  variant: 'success' | 'warning' | 'error' | 'neutral';
  icon: React.ReactNode;
} {
  if (w.last_crawl_error) {
    return { label: 'Crawl failed', variant: 'error', icon: <AlertTriangle className="h-3 w-3" /> };
  }
  if (w.last_crawled_at && w.page_count > 0) {
    return { label: 'Indexed', variant: 'success', icon: <CheckCircle2 className="h-3 w-3" /> };
  }
  if (w.last_crawled_at) {
    return { label: 'No pages found', variant: 'warning', icon: <AlertTriangle className="h-3 w-3" /> };
  }
  return { label: 'Not crawled', variant: 'neutral', icon: <Globe className="h-3 w-3" /> };
}

export const ConnectedWebsitesTab: React.FC<{ onOpen?: (w: UserWebsite) => void }> = ({ onOpen }) => {
  const { toast } = useToast();
  const { activeWorkspaceId } = useWorkspace();
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
      const rows = await userWebsitesService.list(activeWorkspaceId);
      setSites(rows);
    } catch (e: any) {
      toast({ title: 'Failed to load websites', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId]);

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
        if (!activeWorkspaceId) {
          toast({ title: 'No active workspace', description: 'Select a workspace before connecting a website.', variant: 'destructive' });
          setSaving(false);
          return;
        }
        const created = await userWebsitesService.create({
          url: form.url,
          workspace_id: activeWorkspaceId,
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

  /**
   * The list was a stack of bordered rows, each carrying a name, two badges, a URL, a crawl
   * time, a sitemap and FIVE icon-only ghost buttons — everything at the same weight, so there
   * was nothing to scan down. It is a list of records with a status and two numbers, which is
   * what `HubDataTable` is: one accent entry point per row, right-aligned figures, an em dash
   * where a value genuinely does not exist yet.
   *
   * `page_count` is `—` until the site has actually been crawled. A crawl that ran and found
   * nothing renders `0`, which is a finding; a crawl that never ran must not.
   */
  const columns: HubColumn<UserWebsite>[] = [
    {
      id: 'website',
      header: 'Website',
      cell: (w) => (
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <HubCellLink>{w.display_name || w.url.replace(/^https?:\/\//, '')}</HubCellLink>
            {w.is_default && (
              <Badge variant="neutral" className="gap-1 text-[10px]">
                <Star className="h-2.5 w-2.5" /> Default
              </Badge>
            )}
          </div>
          {/* A raw URL is unbreakable, so without min-w-0/truncate its min-content width blew
              past the card and gave the whole Profile tab horizontal scroll at 390px. */}
          <a
            href={w.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-0.5 flex min-w-0 max-w-full items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <span className="truncate">{w.url}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
          {/* The reason the status says "Crawl failed". A status you cannot act on is a status
              that sends the reader back to support. */}
          {w.last_crawl_error && (
            <p className="mt-1 flex items-start gap-1 text-xs text-[hsl(var(--error))]">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="break-all">{w.last_crawl_error}</span>
            </p>
          )}
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: (w) => {
        const s = statusOf(w);
        return <Badge variant={s.variant} className="gap-1">{s.icon}{s.label}</Badge>;
      },
    },
    {
      id: 'pages',
      header: 'Pages',
      align: 'right',
      hideBelow: 'sm',
      cell: (w) => (w.last_crawled_at ? formatNumber(w.page_count) : <HubCellEmpty />),
    },
    {
      id: 'crawled',
      header: 'Last crawl',
      align: 'right',
      hideBelow: 'md',
      cell: (w) => (w.last_crawled_at ? timeAgo(w.last_crawled_at) : <HubCellEmpty />),
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      width: 'w-px',
      // Recrawl stays on the row because it is the one you press repeatedly. The other three
      // are occasional, and four more icon-only ghost buttons per row is how the old list ended
      // up with no scannable shape at all.
      // The wrapper is a propagation boundary, not a control: the row navigates, and pressing
      // Recrawl or opening the menu must not also open the dashboard. `role="presentation"` says
      // exactly that — no semantics of its own, and no keyboard focus to strand anyone on.
      cell: (w) => (
        <div
          role="presentation"
          className="flex items-center justify-end gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="icon"
            title="Recrawl now (full)"
            onClick={() => handleCrawl(w)}
            disabled={!!crawling[w.id]}
          >
            {crawling[w.id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="sr-only">Recrawl</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" title="More">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">More actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handlePreview(w)} disabled={!!previewing[w.id]}>
                {previewing[w.id]
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <FileSearch className="mr-2 h-4 w-4" />}
                Preview (sample 5 pages)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openEdit(w)}>
                <Pencil className="mr-2 h-4 w-4" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleRemove(w)} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" /> Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">

      <Card className="dashboard-card">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-4 h-4" />
              Your Websites
            </CardTitle>
            <CardDescription>
              The crawler reads your sitemap, fetches each page, and builds a semantic index. We never publish or modify anything on your site.
            </CardDescription>
          </div>
          <Button onClick={openAdd} size="sm">
            <Plus className="w-4 h-4 mr-1" />
            Add website
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <HubDataTable
            rows={sites}
            columns={columns}
            rowId={(w) => w.id}
            loading={loading}
            onRowClick={onOpen}
            className="rounded-none border-0"
            empty={
              <HubEmptyState
                icon={Globe}
                title="No websites connected yet"
                description="Connect a site's sitemap and generated SEO articles can link to pages you already have, instead of inventing URLs."
                action={<Button size="sm" onClick={openAdd}><Plus /> Add website</Button>}
              />
            }
          />
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
            <Button onClick={handleSave} disabled={saving}>
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Total URLs</p>
                  <p className="text-xl font-semibold">{formatNumber(previewResult.result.pages_discovered)}</p>
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
                <div className="flex items-start gap-2 p-3 rounded-lg bg-[hsl(var(--warning-bg))] border border-[hsl(var(--warning)/0.25)] text-xs">
                  <AlertTriangle className="w-3.5 h-3.5 text-[hsl(var(--warning))] mt-0.5 flex-shrink-0" />
                  <p>
                    Your sitemap has {formatNumber(previewResult.result.pages_discovered)} URLs but the cap for this site is {previewResult.website.max_pages}.
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
                          <CheckCircle2 className="w-3.5 h-3.5 text-[hsl(var(--success))] flex-shrink-0" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 text-[hsl(var(--warning))] flex-shrink-0" />
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
              disabled={!previewResult?.result.ok}
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              Proceed with full crawl
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
