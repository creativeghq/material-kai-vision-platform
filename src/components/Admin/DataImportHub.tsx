/**
 * Data Import Hub
 * 
 * Unified interface for importing products from multiple sources:
 * - XML files (with dynamic field mapping)
 * - Web scraping (Firecrawl)
 * - Manual entry
 */

import React, { useState } from 'react';
import { ArrowLeft, Upload, Globe, FileText, Database, FileType } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import XMLImportTab from './DataImport/XMLImportTab';
import ImportHistoryTab from './DataImport/ImportHistoryTab';
import { GlobalAdminHeader } from './GlobalAdminHeader';
import { PDFUploadSection } from '@/components/PDF/PDFUploadSection';
import { PDFProcessingStepsMonitor } from '@/components/PDF/PDFProcessingStepsMonitor';

const DataImportHub: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('pdf'); // PDF is first tab
  const [jobId, setJobId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleUploadComplete = (newJobId: string, uploadedFileName?: string) => {
    setJobId(newJobId);
    setFileName(uploadedFileName || 'PDF Document');
    setIsProcessing(true);
  };

  const handleProcessingComplete = () => {
    setIsProcessing(false);
  };

  const handleReset = () => {
    setJobId(null);
    setFileName('');
    setIsProcessing(false);
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
                <TabsTrigger value="firecrawl" disabled>
                  <Globe className="h-4 w-4 mr-2" />
                  Web Scraping
                  <span className="ml-2 text-xs text-muted-foreground">(Coming Soon)</span>
                </TabsTrigger>
                <TabsTrigger value="history">
                  <Upload className="h-4 w-4 mr-2" />
                  Import History
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pdf" className="mt-6">
                <div className="space-y-6">
                  {/* Upload Section */}
                  {!isProcessing && (
                    <PDFUploadSection onUploadComplete={handleUploadComplete} />
                  )}

                  {/* Processing Monitor */}
                  {jobId && (
                    <PDFProcessingStepsMonitor
                      jobId={jobId}
                      fileName={fileName}
                      onComplete={handleProcessingComplete}
                      onError={(error) => {
                        console.error('Processing error:', error);
                        setIsProcessing(false);
                      }}
                    />
                  )}
                </div>
              </TabsContent>

              <TabsContent value="xml" className="mt-6">
                <XMLImportTab />
              </TabsContent>

              <TabsContent value="firecrawl" className="mt-6">
                <div className="text-center py-12 text-muted-foreground">
                  <Globe className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg">Web scraping integration coming in Phase 4</p>
                  <p className="text-sm mt-2">
                    Will support Firecrawl for automated product extraction from websites
                  </p>
                </div>
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

