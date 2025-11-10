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

const DataImportHub: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('xml');

  return (
    <div className="min-h-screen bg-background">
      {/* Header with Navigation */}
      <div className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Button
                onClick={() => navigate('/admin')}
                className="flex items-center gap-2 px-3 py-1 text-sm border border-gray-300 hover:bg-gray-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Admin
              </Button>
            </div>
            <div className="h-6 w-px bg-border" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Data Import Hub</h1>
              <p className="text-sm text-muted-foreground">
                Import products from XML files, web scraping, or manual entry
              </p>
            </div>
          </div>
        </div>
      </div>

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

