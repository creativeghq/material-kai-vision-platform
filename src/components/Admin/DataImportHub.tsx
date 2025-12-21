/**
 * Data Import Hub
 *
 * Unified interface for importing products from multiple sources:
 * - PDF Processing (redirects to async queue monitor)
 * - XML files (with dynamic field mapping)
 * - Web scraping (Firecrawl)
 * - Manual entry
 */

import React, { useState, useEffect } from 'react';
import { Upload, Globe, FileText, FileType, ExternalLink, AlertCircle } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import XMLImportTab from './DataImport/XMLImportTab';
import ImportHistoryTab from './DataImport/ImportHistoryTab';
import { GlobalAdminHeader } from './GlobalAdminHeader';
import { PDFUploadSection } from '@/components/PDF/PDFUploadSection';
import { NewScraperPage } from '@/components/Scraper/NewScraperPage';
import { supabase } from '@/integrations/supabase/client';

// PDFProcessingStepsMonitor has been removed - all monitoring now happens in AsyncJobQueueMonitor

const DataImportHub: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(tabParam || 'pdf');
  const [activeJobs, setActiveJobs] = useState<any[]>([]);
  const [checkingJobs, setCheckingJobs] = useState(true);

  // Check for active PDF processing jobs on mount and handle tab parameter
  useEffect(() => {
    checkActiveJobs();
    // Set active tab from URL parameter if present
    if (tabParam && ['pdf', 'xml', 'firecrawl', 'history'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const checkActiveJobs = async () => {
    try {
      setCheckingJobs(true);
      const { data, error } = await supabase
        .from('background_jobs')
        .select('*')
        .eq('job_type', 'pdf_processing')
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

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader
        title="Data Import Hub"
        description="Import products from XML files, web scraping, or manual entry"
        badge="Admin"
      />

      {/* Main Content */}
      <div className="p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Import Sources</CardTitle>
            <CardDescription>
              Choose your import method and configure field mappings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="pdf">
                  <FileType className="h-4 w-4 mr-2" />
                  PDF Processing
                </TabsTrigger>
                <TabsTrigger value="xml">
                  <FileText className="h-4 w-4 mr-2" />
                  XML Import
                </TabsTrigger>
                <TabsTrigger value="firecrawl">
                  <Globe className="h-4 w-4 mr-2" />
                  Web Scraping
                </TabsTrigger>
                <TabsTrigger value="history">
                  <Upload className="h-4 w-4 mr-2" />
                  Import History
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pdf" className="mt-6">
                <div className="space-y-6">
                  {/* Active Jobs Warning */}
                  {activeJobs.length > 0 && (
                    <Alert className="border-blue-300 bg-blue-50">
                      <AlertCircle className="h-4 w-4 text-blue-600" />
                      <AlertDescription className="text-blue-900">
                        <div className="space-y-2">
                          <p className="font-semibold">
                            {activeJobs.length} PDF processing job{activeJobs.length > 1 ? 's' : ''} currently active
                          </p>
                          <p className="text-sm">
                            Please wait for existing jobs to complete or visit the Async Queue Monitor to manage them.
                          </p>
                          <div className="mt-3 space-y-2">
                            {activeJobs.map((job) => (
                              <div key={job.id} className="flex items-center justify-between p-2 bg-white rounded border border-blue-200">
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
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate('/admin/async-queue-monitor')}
                            className="mt-2 w-full"
                          >
                            View All Jobs in Queue Monitor
                          </Button>
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
                    <Alert className="border-orange-300 bg-orange-50">
                      <AlertCircle className="h-4 w-4 text-orange-600" />
                      <AlertDescription className="text-orange-900">
                        <p className="font-semibold">PDF upload is temporarily blocked</p>
                        <p className="text-sm mt-1">
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
                        <li>Monitor all 14 processing stages in real-time</li>
                        <li>View detailed metrics (products, chunks, images, embeddings)</li>
                        <li>Track progress with live updates every 3 seconds</li>
                        <li>Cancel or delete jobs as needed</li>
                      </ul>
                    </AlertDescription>
                  </Alert>
                </div>
              </TabsContent>

              <TabsContent value="xml" className="mt-6">
                <XMLImportTab />
              </TabsContent>

              <TabsContent value="firecrawl" className="mt-6">
                <NewScraperPage embedded={true} />
              </TabsContent>

              <TabsContent value="history" className="mt-6">
                <ImportHistoryTab />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DataImportHub;

