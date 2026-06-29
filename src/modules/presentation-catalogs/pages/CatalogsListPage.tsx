import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Plus, Loader2, Eye, Trash2, Upload, ExternalLink, MessageSquare } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent } from '@/components/core/ui/card';
import { useToast } from '@/hooks/use-toast';
import { catalogsService, type PresentationCatalog, type CatalogStatus } from '@/services/catalogsService';
import { CreateCatalogModal } from '../../../components/business/catalogs/CreateCatalogModal';
import { humanizeLabel } from '@/utils/humanize';

const STATUS_VARIANT: Record<CatalogStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'secondary',
  generating: 'outline',
  ready: 'default',
  published: 'default',
  archived: 'outline',
  failed: 'destructive',
};

export const CatalogsListPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [catalogs, setCatalogs] = useState<PresentationCatalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const rows = await catalogsService.list();
      setCatalogs(rows);
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to load catalogs', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = useCallback(async (catalogId: string) => {
    if (!window.confirm('Delete this catalog? This cannot be undone.')) return;
    try {
      await catalogsService.remove(catalogId);
      toast({ title: 'Deleted' });
      load();
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Delete failed', variant: 'destructive' });
    }
  }, [load, toast]);

  const handleOpenAgent = useCallback((catalog: PresentationCatalog) => {
    const seed = `Continue building catalog ${catalog.id} (\"${catalog.title}\"). Use the catalog tools to extract sections, add materials, find images, and generate the PDF when ready.`;
    navigate(`/agent-hub?agent=kai&q=${encodeURIComponent(seed)}`);
  }, [navigate]);

  return (
    <div>
      <PageHeader
        title="Presentation Catalogs"
        subtitle="Build email-gated catalog landing pages and PDFs from manufacturer source PDFs."
        icon={BookOpen}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/admin/operations?tab=catalogs')}>
              <Eye className="mr-2 h-4 w-4" /> Operations
            </Button>
            <Button variant="outline" onClick={() => navigate('/admin/catalogs/sources')}>
              <Upload className="mr-2 h-4 w-4" /> Source PDFs
            </Button>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" /> New Catalog
            </Button>
          </div>
        }
      />

      <div className="px-3 sm:px-6 py-4 sm:py-8 space-y-6">
      {loading ? (
        <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading catalogs…
        </div>
      ) : catalogs.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground space-y-2">
            <BookOpen className="mx-auto h-8 w-8 opacity-40" />
            <div className="font-medium text-foreground">No catalogs yet</div>
            <p className="text-sm">Upload manufacturer PDFs first, then start a new catalog and let the KAI agent build it for you.</p>
            <div className="flex gap-2 justify-center pt-2">
              <Button variant="outline" onClick={() => navigate('/admin/catalogs/sources')}>Upload source PDFs</Button>
              <Button onClick={() => setShowCreate(true)}>New Catalog</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {catalogs.map((c) => {
            const sectionsCount = c.body_data?.sections?.length || 0;
            const materialsCount = (c.body_data?.sections || []).reduce((acc, s) => acc + (s.materials?.length || 0), 0);
            return (
              <Card key={c.id} className="dashboard-card">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium text-base truncate">{c.title}</h3>
                      <Badge variant={STATUS_VARIANT[c.status]}>{humanizeLabel(c.status)}</Badge>
                      {c.slug && <span className="text-xs text-muted-foreground">/c/{c.slug}</span>}
                    </div>
                    {c.subtitle && <p className="text-sm text-muted-foreground truncate">{c.subtitle}</p>}
                    <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                      <span>{sectionsCount} sections</span>
                      <span>{materialsCount} materials</span>
                      <span>{c.view_count} views</span>
                      <span>updated {new Date(c.updated_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => handleOpenAgent(c)} title="Open in KAI agent">
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigate(`/admin/catalogs/${c.id}`)}>
                      <Eye className="mr-1 h-4 w-4" /> Open
                    </Button>
                    {c.status === 'published' && c.slug && (
                      <Button size="sm" variant="ghost" onClick={() => window.open(`/c/${c.slug}`, '_blank')} title="Open public page">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(c.id)} title="Delete">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateCatalogModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onCreated={(catalog) => {
            setShowCreate(false);
            navigate(`/admin/catalogs/${catalog.id}`);
          }}
        />
      )}
      </div>
    </div>
  );
};
