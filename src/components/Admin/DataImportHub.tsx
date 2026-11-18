/**
 * Data Import Hub
 *
 * Unified interface for importing products from multiple sources:
 * - PDF Processing (redirects to async queue monitor)
 * - XML files (with dynamic field mapping)
 * - Manual entry
 */

import React, { useState, useEffect } from 'react';
import { Upload, FileText, FileType, ExternalLink, AlertCircle, Download, FileSpreadsheet } from 'lucide-react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent } from '@/components/core/ui/tabs';
import { HubTabNav, type HubTabItem } from '@/components/core/hub/HubTabNav';
import { CatalogExportTab } from '@/components/Admin/DataImport/CatalogExportTab';
import { CsvImportTab } from '@/components/Admin/DataImport/CsvImportTab';
import { Button } from '@/components/core/ui/button';
import { Alert, AlertDescription } from '@/components/core/ui/alert';
import XMLImportTab from './DataImport/XMLImportTab';
import ImportHistoryTab from './DataImport/ImportHistoryTab';
import { PDF_JOB_TYPES, PRODUCT_STAGES } from './AsyncJobQueueMonitor/constants';
import { PageHeader } from '@/components/shared/PageHeader';
import { PDFUploadSection } from '@/components/features/pdf/PDFUploadSection';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';

const IMPORT_TABS: HubTabItem[] = [
  { id: 'pdf', label: 'PDF Processing', icon: FileType },
  { id: 'xml', label: 'XML Import', icon: FileText },
  { id: 'history', label: 'Import History', icon: Upload },
  { id: 'csv', label: 'CSV Import', icon: FileSpreadsheet },
  { id: 'export', label: 'Export', icon: Download },
];

const DataImportHub: React.FC = () => {
  const navigate = useNavigate();
  const { activeWorkspaceId } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab = IMPORT_TABS.some((t) => t.id === tabParam) ? tabParam! : 'pdf';
  const selectTab = (id: string) => {
    const next = new URLSearchParams(searchParams);
    if (id === 'pdf') next.delete('tab');
    else next.set('tab', id);
    setSearchParams(next, { replace: true });
  };
  const [activeJobs, setActiveJobs] = useState<any[]>([]);
  const [checkingJobs, setCheckingJobs] = useState(true);

  useEffect(() => {
    checkActiveJobs();
  }, [activeWorkspaceId]);

  const checkActiveJobs = async () => {
    if (!activeWorkspaceId) return;
    try {
      setCheckingJobs(true);
      const { data, error } = await supabase
        .from('background_jobs')
        .select('*')
        .eq('workspace_id', activeWorkspaceId)
        .in('job_type', [...PDF_JOB_TYPES])
        .in('status', ['pending', 'processing'])
        .order('created_at', { ascending: false });

      if (error) throw error;

      setActiveJobs(data || []);
    } catch (error) {
      console.error('Error checking active jobs:', error);
    } finally {
      setCheckingJobs(false);
    }
  };

  const handleUploadComplete = (newJobId: string, uploadedFileName?: string) => {
    console.log('🎯 DataImportHub: Upload complete, redirecting to queue monitor', { newJobId, uploadedFileName });
    // Redirect to async queue monitor
    navigate(`/admin/async-queue-monitor?jobId=${newJobId}`);
  };

  if (tabParam === 'categories') return <Navigate to="/admin/materials-data?tab=categories" replace />;

  return (
    <div className="min-h-screen">
      <PageHeader icon={Upload} title="Data Import" subtitle="Import products from PDF catalogues, XML feeds, CSV files or manual entry.">
        <HubTabNav items={IMPORT_TABS} activeId={activeTab} onSelect={selectTab} aria-label="Data Import sections" />
      </PageHeader>

      <div className="p-3 sm:p-6 space-y-6">
            <Tabs value={activeTab} onValueChange={selectTab} className="w-full">
              <TabsContent value="pdf" className="mt-0">
                <div className="space-y-6">
                  {/* Active Jobs Warning */}
                  {activeJobs.length > 0 && (
                    <Alert className="border-[hsl(var(--info))]/30 bg-[hsl(var(--info-bg))]">
                      <AlertCircle className="h-4 w-4 text-[hsl(var(--info))]" />
                      <AlertDescription>
                        <div className="space-y-2">
                          <p className="font-semibold">
                            {activeJobs.length} PDF processing job{activeJobs.length > 1 ? 's' : ''} currently active
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Please wait for existing jobs to complete or visit the Async Queue Monitor to manage them.
                          </p>
                          <div className="mt-3 space-y-2">
                            {activeJobs.map((job) => (
                              <div key={job.id} className="flex items-center justify-between p-2 bg-card rounded-lg border border-border">
                                <div>
                                  <div className="text-sm font-medium">
                                    {job.metadata?.filename || 'PDF Document'}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    Job ID: {job.id.slice(0, 8)}... | Status: {job.status} | Progress: {job.progress}%
                                  </div>
                                </div>
                                <Button
                                  size="sm"
                                  onClick={() => navigate(`/admin/async-queue-monitor?jobId=${job.id}`)}
                                  className="flex items-center gap-2"
                                >
                                  Monitor
                                  <ExternalLink className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                          <div className="flex justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigate('/admin/async-queue-monitor')}
                              className="mt-2"
                            >
                              View All Jobs in Queue Monitor
                            </Button>
                          </div>
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Upload Section - Blocked if jobs are active */}
                  {checkingJobs ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <p>Checking for active jobs...</p>
                    </div>
                  ) : activeJobs.length > 0 ? (
                    <Alert className="border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning-bg))]">
                      <AlertCircle className="h-4 w-4 text-warning" />
                      <AlertDescription>
                        <p className="font-semibold">PDF upload is temporarily blocked</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Please complete or cancel existing jobs before uploading new PDFs.
                          This ensures proper resource management and prevents conflicts.
                        </p>
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <PDFUploadSection onUploadComplete={handleUploadComplete} />
                  )}

                  {/* Info Box */}
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <p className="font-semibold">PDF Processing Workflow</p>
                      <p className="text-sm mt-1">
                        After uploading a PDF, you'll be redirected to the <strong>Async Queue Monitor</strong> where you can:
                      </p>
                      <ul className="text-sm mt-2 space-y-1 list-disc list-inside">
                        <li>Monitor all {PRODUCT_STAGES.length} processing stages in real-time</li>
                        <li>View detailed metrics (products, chunks, images, embeddings)</li>
                        <li>Track progress with live updates every 3 seconds</li>
                        <li>Cancel or delete jobs as needed</li>
                      </ul>
                    </AlertDescription>
                  </Alert>
                </div>
              </TabsContent>

              <TabsContent value="xml" className="mt-0">
                <XMLImportTab />
              </TabsContent>

              <TabsContent value="history" className="mt-0">
                <ImportHistoryTab />
              </TabsContent>

              <TabsContent value="csv" className="mt-0">
                <CsvImportTab />
              </TabsContent>
              <TabsContent value="export" className="mt-0">
                <CatalogExportTab />
              </TabsContent>
            </Tabs>
      </div>
    </div>
  );
};

export default DataImportHub;

