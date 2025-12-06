/**
 * Data Import Hub
 * 
 * Unified interface for importing products from multiple sources:
 * - XML files (with dynamic field mapping)
 * - Web scraping (Firecrawl)
 * - Manual entry
 */

import React, { useState } from 'react';
import { ArrowLeft, Upload, Globe, FileText, Database } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import XMLImportTab from './DataImport/XMLImportTab';
import ImportHistoryTab from './DataImport/ImportHistoryTab';
import { GlobalAdminHeader } from './GlobalAdminHeader';

const DataImportHub: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('xml');

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
              <TabsList className="grid w-full grid-cols-3">
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

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">XML Import</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Upload XML files from suppliers with automatic field detection and AI-assisted mapping
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Web Scraping</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Extract product data from websites using Firecrawl with intelligent content detection
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Batch Processing</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Process products in batches with checkpoint recovery and real-time progress tracking
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default DataImportHub;

