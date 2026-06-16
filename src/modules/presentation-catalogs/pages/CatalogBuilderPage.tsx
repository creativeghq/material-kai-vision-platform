import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Loader2, MessageSquare, FileDown, ExternalLink, Globe, Archive, RefreshCw,
  Trash2, Plus, BookOpen, Eye, Activity, Send, Mail, Inbox, FileText,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  catalogsService,
  type PresentationCatalog,
  type CatalogStatus,
  type CatalogEmailGrant,
  type CatalogAccessLogRow,
  type CatalogViewEventRow,
  type CatalogSendBatchSummary,
  type CatalogEmailSendRow,
} from '@/services/catalogsService';
import { SendToCustomersModal } from '@/components/business/catalogs/SendToCustomersModal';
import { CatalogSourcesPanel } from '@/components/business/catalogs/CatalogSourcesPanel';

const STATUS_VARIANT: Record<CatalogStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'secondary',
  generating: 'outline',
  ready: 'default',
  published: 'default',
  archived: 'outline',
  failed: 'destructive',
};

export const CatalogBuilderPage: React.FC = () => {
  const { id: catalogId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [catalog, setCatalog] = useState<PresentationCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [grants, setGrants] = useState<CatalogEmailGrant[]>([]);
  const [accessLog, setAccessLog] = useState<CatalogAccessLogRow[]>([]);
  const [viewEvents, setViewEvents] = useState<CatalogViewEventRow[]>([]);
  const [sendBatches, setSendBatches] = useState<CatalogSendBatchSummary[]>([]);
  const [batchRecipients, setBatchRecipients] = useState<Record<string, CatalogEmailSendRow[]>>({});
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const [grantEmail, setGrantEmail] = useState('');
  const [grantNote, setGrantNote] = useState('');
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('builder');

  const load = useCallback(async () => {
    if (!catalogId) return;
    try {
      setLoading(true);
      const cat = await catalogsService.get(catalogId);
      setCatalog(cat);
      const [g, log, ev, batches] = await Promise.all([
        catalogsService.listEmailGrants(catalogId),
        catalogsService.listAccessLog(catalogId),
        catalogsService.listViewEvents({ catalogId, limit: 100 }),
        catalogsService.listSendBatches(catalogId, 50),
      ]);
      setGrants(g);
      setAccessLog(log);
      setViewEvents(ev);
      setSendBatches(batches);
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to load', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [catalogId, toast]);

  const loadBatchRecipients = useCallback(async (batchId: string) => {
    if (!catalogId || batchRecipients[batchId]) return;
    try {
      const rows = await catalogsService.listSendRecipients(catalogId, batchId);
      setBatchRecipients((prev) => ({ ...prev, [batchId]: rows }));
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : '?', variant: 'destructive' });
    }
  }, [catalogId, batchRecipients, toast]);

  useEffect(() => { load(); }, [load]);

  const totalMaterials = useMemo(() => {
    if (!catalog) return 0;
    return (catalog.body_data?.sections || []).reduce((acc, s) => acc + (s.materials?.length || 0), 0);
  }, [catalog]);

  const handleOpenAgent = () => {
    if (!catalog) return;
    const seed = `Continue building catalog ${catalog.id} ("${catalog.title}"). Use the catalog tools to extract sections, add materials, find images, and generate the PDF when ready.`;
    navigate(`/agent-hub?agent=kai&q=${encodeURIComponent(seed)}`);
  };

  const handleGeneratePdf = async () => {
    if (!catalog) return;
    setBusyAction('pdf');
    try {
      const res = await catalogsService.generatePdf(catalog.id, true);
      toast({ title: 'PDF generated', description: `${res.page_count} pages` });
      load();
    } catch (err) {
      toast({ title: 'PDF failed', description: err instanceof Error ? err.message : '?', variant: 'destructive' });
    } finally { setBusyAction(null); }
  };

  const handlePublish = async () => {
    if (!catalog) return;
    setBusyAction('publish');
    try {
      const slug = catalog.slug || (await proposeSlug(catalog.title));
      await catalogsService.update(catalog.id, {
        slug,
        status: 'published',
        published_at: new Date().toISOString(),
      } as any);
      toast({ title: 'Published', description: `/c/${slug}` });
      load();
    } catch (err) {
      toast({ title: 'Publish failed', description: err instanceof Error ? err.message : '?', variant: 'destructive' });
    } finally { setBusyAction(null); }
  };

  const handleUnpublish = async () => {
    if (!catalog) return;
    setBusyAction('unpublish');
    try {
      await catalogsService.update(catalog.id, {
        status: 'archived',
        unpublished_at: new Date().toISOString(),
      } as any);
      toast({ title: 'Archived' });
      load();
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : '?', variant: 'destructive' });
    } finally { setBusyAction(null); }
  };

  const handleSaveCover = async (patch: Partial<PresentationCatalog>) => {
    if (!catalog) return;
    try {
      const updated = await catalogsService.update(catalog.id, patch);
      setCatalog(updated);
      toast({ title: 'Saved' });
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : '?', variant: 'destructive' });
    }
  };

  const handleAddGrant = async () => {
    if (!catalog || !grantEmail.trim()) return;
    try {
      await catalogsService.addEmailGrant(catalog.id, grantEmail, grantNote || undefined);
      setGrantEmail('');
      setGrantNote('');
      const g = await catalogsService.listEmailGrants(catalog.id);
      setGrants(g);
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : '?', variant: 'destructive' });
    }
  };

  const handleRevokeGrant = async (grantId: string) => {
    try {
      await catalogsService.revokeEmailGrant(grantId);
      const g = await catalogsService.listEmailGrants(catalog!.id);
      setGrants(g);
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : '?', variant: 'destructive' });
    }
  };

  const handleRemoveMaterial = async (sectionId: string, materialId: string) => {
    if (!catalog) return;
    try {
      const updated = await catalogsService.removeMaterial(catalog.id, sectionId, materialId);
      setCatalog(updated);
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : '?', variant: 'destructive' });
    }
  };

  const handleRemoveSection = async (sectionId: string) => {
    if (!catalog) return;
    if (!window.confirm('Remove this section and all its materials?')) return;
    try {
      const updated = await catalogsService.removeSection(catalog.id, sectionId);
      setCatalog(updated);
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : '?', variant: 'destructive' });
    }
  };

  if (loading || !catalog) {
    return (
      <div className="px-3 sm:px-6 py-8">
        <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading catalog…
        </div>
      </div>
    );
  }

  const publicUrl = catalog.slug ? `/c/${catalog.slug}` : null;

  return (
    <div>
      <PageHeader
        title={catalog.title}
        subtitle={catalog.subtitle || ''}
        icon={BookOpen}
        actions={
          <div className="flex gap-2 flex-wrap items-center">
            <Badge variant={STATUS_VARIANT[catalog.status]}>{catalog.status}</Badge>
            <Button variant="outline" size="sm" onClick={() => navigate('/admin/catalogs')}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button variant="outline" size="sm" onClick={handleOpenAgent}>
              <MessageSquare className="mr-2 h-4 w-4" /> Open in KAI
            </Button>
            <Button variant="outline" size="sm" onClick={handleGeneratePdf} disabled={busyAction === 'pdf' || totalMaterials === 0}>
              {busyAction === 'pdf' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
              Generate PDF
            </Button>
            {catalog.status !== 'published' ? (
              <Button size="sm" onClick={handlePublish} disabled={busyAction === 'publish' || totalMaterials === 0}>
                {busyAction === 'publish' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Globe className="mr-2 h-4 w-4" />}
                Publish
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={handleUnpublish} disabled={busyAction === 'unpublish'}>
                {busyAction === 'unpublish' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Archive className="mr-2 h-4 w-4" />}
                Archive
              </Button>
            )}
            {catalog.status === 'published' && (
              <Button size="sm" onClick={() => setSendModalOpen(true)}>
                <Send className="mr-2 h-4 w-4" /> Send to Customers
              </Button>
            )}
            {publicUrl && (
              <Button size="sm" variant="ghost" onClick={() => window.open(publicUrl, '_blank')} title="Open public page">
                <ExternalLink className="h-4 w-4" />
              </Button>
            )}
          </div>
        }
      />

      <div className="px-3 sm:px-6 py-4 sm:py-8 space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
          <TabsTrigger value="builder" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Builder</TabsTrigger>
          <TabsTrigger value="sources" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><FileText className="h-4 w-4" /> Sources ({(catalog.source_pdf_ids || []).length})</TabsTrigger>
          <TabsTrigger value="cover" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Cover & Back</TabsTrigger>
          <TabsTrigger value="access" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Access ({grants.length})</TabsTrigger>
          <TabsTrigger value="log" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Visitors ({viewEvents.length + accessLog.length})</TabsTrigger>
          <TabsTrigger value="sends" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Sends ({sendBatches.length})</TabsTrigger>
          <TabsTrigger value="pdf" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">PDF</TabsTrigger>
        </TabsList>

        <TabsContent value="builder" className="space-y-3 mt-4">
          {(catalog.body_data?.sections || []).length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center space-y-2">
                <div className="font-medium">No sections yet</div>
                <p className="text-sm text-muted-foreground">Upload a source PDF and extract products in the Sources tab, or let the KAI agent build it for you.</p>
                <div className="flex gap-2 justify-center pt-1">
                  <Button onClick={() => setActiveTab('sources')}><FileText className="mr-2 h-4 w-4" /> Go to Sources</Button>
                  <Button variant="outline" onClick={handleOpenAgent}><MessageSquare className="mr-2 h-4 w-4" /> Open in KAI</Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            (catalog.body_data?.sections || []).map((section) => (
              <Card key={section.id} className="dashboard-card">
                <CardHeader className="pb-2 flex-row items-center justify-between">
                  <CardTitle className="text-base">
                    {section.title}
                    <span className="ml-2 text-xs text-muted-foreground font-normal">{section.materials.length} materials</span>
                  </CardTitle>
                  <Button size="sm" variant="ghost" onClick={() => handleRemoveSection(section.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {section.materials.map((m) => (
                    <div key={m.id} className="border rounded p-3 flex gap-3 items-start">
                      <div className="w-20 h-20 rounded bg-muted shrink-0 overflow-hidden">
                        {m.image_url ? (
                          <img src={m.image_url} alt={m.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">no img</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{m.name}</div>
                        {m.description && <div className="text-xs text-muted-foreground line-clamp-2">{m.description}</div>}
                        <div className="flex gap-2 mt-1 text-xs">
                          {m.price != null && <span className="font-medium">{formatPrice(m.price, m.currency)}</span>}
                          {m.price_source && m.price_source !== 'manual' && <Badge variant="outline" className="text-[10px] py-0">{m.price_source.replace(/_/g, ' ')}</Badge>}
                          {!m.image_url && <Badge variant="outline" className="text-[10px] py-0">needs image</Badge>}
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => handleRemoveMaterial(section.id, m.id)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="sources" className="mt-4">
          <CatalogSourcesPanel catalog={catalog} onChanged={load} />
        </TabsContent>

        <TabsContent value="cover" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Cover</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  defaultValue={catalog.title}
                  onBlur={(e) => e.target.value !== catalog.title && handleSaveCover({ title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Subtitle</Label>
                <Input
                  defaultValue={catalog.subtitle || ''}
                  onBlur={(e) => handleSaveCover({ subtitle: e.target.value || null })}
                />
              </div>
              <div className="space-y-2">
                <Label>Description (cover page)</Label>
                <Textarea
                  defaultValue={catalog.description || ''}
                  rows={3}
                  onBlur={(e) => handleSaveCover({ description: e.target.value || null })}
                />
              </div>
              <div className="space-y-2">
                <Label>Client name (cover line)</Label>
                <Input
                  defaultValue={catalog.cover_data?.client_name || ''}
                  onBlur={(e) => handleSaveCover({
                    cover_data: { ...(catalog.cover_data || {}), client_name: e.target.value || null },
                  } as any)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Back cover</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label>Closing message</Label>
                <Textarea
                  defaultValue={catalog.back_cover_data?.closing_message || ''}
                  rows={2}
                  onBlur={(e) => handleSaveCover({
                    back_cover_data: { ...(catalog.back_cover_data || {}), closing_message: e.target.value || null },
                  } as any)}
                />
              </div>
              <div className="space-y-2">
                <Label>Contact line</Label>
                <Input
                  defaultValue={catalog.back_cover_data?.contact_line || ''}
                  onBlur={(e) => handleSaveCover({
                    back_cover_data: { ...(catalog.back_cover_data || {}), contact_line: e.target.value || null },
                  } as any)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="access" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Email allowlist</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Visitors with these emails get access to the published catalog (in addition to platform users + CRM contacts that match by email automatically).
              </p>
              <div className="flex gap-2">
                <Input value={grantEmail} onChange={(e) => setGrantEmail(e.target.value)} placeholder="email@example.com" />
                <Input value={grantNote} onChange={(e) => setGrantNote(e.target.value)} placeholder="Note (optional)" className="max-w-xs" />
                <Button onClick={handleAddGrant} disabled={!grantEmail.trim()}><Plus className="h-4 w-4" /> Add</Button>
              </div>
              <div className="space-y-1">
                {grants.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-4">No granted emails yet.</div>
                ) : grants.map((g) => (
                  <div key={g.id} className="flex items-center gap-2 text-sm border-b py-2">
                    <span className="font-medium">{g.email}</span>
                    {g.note && <span className="text-muted-foreground text-xs">— {g.note}</span>}
                    {g.revoked_at && <Badge variant="outline">revoked</Badge>}
                    <span className="ml-auto text-xs text-muted-foreground">{new Date(g.created_at).toLocaleDateString()}</span>
                    {!g.revoked_at && (
                      <Button size="sm" variant="ghost" onClick={() => handleRevokeGrant(g.id)}>Revoke</Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="log" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniStat icon={Eye} label="Page views" value={viewEvents.filter((e) => e.event_type === 'page_view').length} />
            <MiniStat icon={FileDown} label="PDF downloads" value={viewEvents.filter((e) => e.event_type === 'pdf_download').length} />
            <MiniStat icon={Activity} label="Gate granted" value={accessLog.filter((r) => r.granted_access).length} />
            <MiniStat icon={Activity} label="Gate denied" value={accessLog.filter((r) => !r.granted_access).length} variant={accessLog.some((r) => !r.granted_access) ? 'destructive' : 'default'} />
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Page views & downloads</CardTitle>
              <Button size="sm" variant="ghost" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {viewEvents.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 px-4">No view events yet.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">When</th>
                      <th className="text-left px-3 py-2 font-medium">Event</th>
                      <th className="text-left px-3 py-2 font-medium">Email</th>
                      <th className="text-left px-3 py-2 font-medium">Matched as</th>
                      <th className="text-left px-3 py-2 font-medium">IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewEvents.map((e) => (
                      <tr key={e.id} className="border-t">
                        <td className="px-3 py-2 text-xs whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                        <td className="px-3 py-2">
                          <Badge variant={e.event_type === 'pdf_download' ? 'default' : 'secondary'} className="text-[10px] py-0">
                            {e.event_type === 'pdf_download' ? <FileDown className="h-3 w-3 mr-1 inline" /> : <Eye className="h-3 w-3 mr-1 inline" />}
                            {e.event_type.replace(/_/g, ' ')}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 font-medium text-sm">{e.email || '—'}</td>
                        <td className="px-3 py-2"><Badge variant="outline" className="text-[10px] py-0">{e.matched_kind || '—'}</Badge></td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{e.ip_address || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Email-gate attempts</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {accessLog.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 px-4">No gate attempts yet.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">When</th>
                      <th className="text-left px-3 py-2 font-medium">Email</th>
                      <th className="text-left px-3 py-2 font-medium">Granted</th>
                      <th className="text-left px-3 py-2 font-medium">Matched as</th>
                      <th className="text-left px-3 py-2 font-medium">IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accessLog.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="px-3 py-2 text-xs whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</td>
                        <td className="px-3 py-2 font-medium text-sm">{row.email}</td>
                        <td className="px-3 py-2">
                          <Badge variant={row.granted_access ? 'default' : 'destructive'} className="text-[10px] py-0">
                            {row.granted_access ? 'GRANTED' : 'DENIED'}
                          </Badge>
                        </td>
                        <td className="px-3 py-2"><Badge variant="outline" className="text-[10px] py-0">{row.matched_kind}</Badge></td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{row.ip_address || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sends" className="mt-4 space-y-3">
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Send className="h-4 w-4" /> Sends
              </CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
                {catalog.status === 'published' && (
                  <Button size="sm" onClick={() => setSendModalOpen(true)}>
                    <Send className="mr-2 h-4 w-4" /> New Send
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {sendBatches.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 px-4 text-center">
                  {catalog.status === 'published'
                    ? 'No sends yet. Click "Send to Customers" to email this catalog to selected CRM categories.'
                    : 'Catalog must be published before sending.'}
                </div>
              ) : (
                <div className="divide-y">
                  {sendBatches.map((batch) => {
                    const expanded = expandedBatch === batch.send_batch_id;
                    return (
                      <div key={batch.send_batch_id}>
                        <button
                          className="w-full px-3 py-2.5 text-left hover:bg-muted/30 flex items-center gap-3"
                          onClick={() => {
                            const next = expanded ? null : batch.send_batch_id;
                            setExpandedBatch(next);
                            if (next) loadBatchRecipients(next);
                          }}
                        >
                          <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{batch.subject || '(no subject)'}</div>
                            <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                              {batch.last_sent_at && <span>{new Date(batch.last_sent_at).toLocaleString()}</span>}
                              {batch.source_category_slugs.length > 0 && (
                                <span>to: {batch.source_category_slugs.join(', ')}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Badge variant="default" className="text-[10px] py-0">{batch.sent_count} sent</Badge>
                            {batch.failed_count > 0 && (
                              <Badge variant="destructive" className="text-[10px] py-0">{batch.failed_count} failed</Badge>
                            )}
                          </div>
                        </button>
                        {expanded && (
                          <div className="bg-muted/20 px-3 py-2 space-y-1">
                            {batchRecipients[batch.send_batch_id] === undefined ? (
                              <div className="text-xs text-muted-foreground py-2 flex items-center gap-2">
                                <Loader2 className="h-3 w-3 animate-spin" /> Loading recipients…
                              </div>
                            ) : batchRecipients[batch.send_batch_id]?.length === 0 ? (
                              <div className="text-xs text-muted-foreground py-2">No recipients found.</div>
                            ) : (
                              <div className="space-y-0.5 max-h-72 overflow-y-auto">
                                {batchRecipients[batch.send_batch_id]?.map((r) => (
                                  <div key={r.id} className="flex items-center gap-2 text-xs py-1 border-b border-border/40 last:border-b-0">
                                    <Badge variant={r.status === 'sent' ? 'default' : r.status === 'failed' ? 'destructive' : 'outline'} className="text-[10px] py-0 shrink-0">
                                      {r.status}
                                    </Badge>
                                    <span className="font-mono">{r.recipient_email}</span>
                                    {r.recipient_member_kind && <Badge variant="outline" className="text-[10px] py-0">{r.recipient_member_kind}</Badge>}
                                    {r.first_opened_at && <span title={new Date(r.first_opened_at).toLocaleString()}><Eye className="h-3 w-3 inline" /></span>}
                                    {r.first_downloaded_at && <span title={new Date(r.first_downloaded_at).toLocaleString()}><FileDown className="h-3 w-3 inline" /></span>}
                                    {r.status_message && <span className="text-muted-foreground italic">{r.status_message}</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pdf" className="mt-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              {catalog.pdf_url ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{catalog.page_count} pages • generated {catalog.pdf_generated_at && new Date(catalog.pdf_generated_at).toLocaleString()}</span>
                    <Button size="sm" variant="outline" onClick={() => window.open(catalog.pdf_url!, '_blank')}>
                      <ExternalLink className="mr-2 h-4 w-4" /> Open
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleGeneratePdf} disabled={busyAction === 'pdf'}>
                      {busyAction === 'pdf' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                      Regenerate
                    </Button>
                  </div>
                  <iframe src={catalog.pdf_url} className="w-full h-[80vh] border rounded" title="Catalog PDF" />
                </>
              ) : (
                <div className="text-sm text-muted-foreground py-4">
                  No PDF generated yet. Click "Generate PDF" in the toolbar.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <SendToCustomersModal
        open={sendModalOpen}
        onClose={() => setSendModalOpen(false)}
        catalog={catalog}
        onSent={() => load()}
      />
      </div>
    </div>
  );
};

const MiniStat: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  variant?: 'default' | 'destructive';
}> = ({ icon: Icon, label, value, variant }) => (
  <Card className="dashboard-card">
    <CardContent className="p-3 flex flex-col gap-1">
      <div className="text-xs text-muted-foreground flex items-center gap-1"><Icon className="h-3 w-3" /> {label}</div>
      <div className={`text-2xl font-light ${variant === 'destructive' ? 'text-destructive' : 'text-foreground'}`}>{value.toLocaleString()}</div>
    </CardContent>
  </Card>
);

async function proposeSlug(title: string): Promise<string> {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'catalog';
}

function formatPrice(amount: number, currency: string | null): string {
  const symbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency === 'GBP' ? '£' : (currency ? `${currency} ` : '');
  return `${symbol}${amount.toFixed(2)}`;
}
