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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/admin')}
            className="text-gray-400 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Admin
          </Button>
        </div>

        <div className="flex items-center gap-3 mb-2">
          <Database className="h-8 w-8 text-blue-400" />
          <h1 className="text-3xl font-bold text-white">Data Import Hub</h1>
        </div>
        <p className="text-gray-400">
          Import products from XML files, web scraping, or manual entry
        </p>
      </div>

      {/* Main Content */}
      <Card className="bg-gray-800/50 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">Import Sources</CardTitle>
          <CardDescription className="text-gray-400">
            Choose your import method and configure field mappings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-gray-700/50">
              <TabsTrigger
                value="xml"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"
              >
                <FileText className="h-4 w-4 mr-2" />
                XML Import
              </TabsTrigger>
              <TabsTrigger
                value="firecrawl"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"
                disabled
              >
                <Globe className="h-4 w-4 mr-2" />
                Web Scraping
                <span className="ml-2 text-xs text-gray-500">(Coming Soon)</span>
              </TabsTrigger>
              <TabsTrigger
                value="history"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"
              >
                <Upload className="h-4 w-4 mr-2" />
                Import History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="xml" className="mt-6">
              <XMLImportTab />
            </TabsContent>

            <TabsContent value="firecrawl" className="mt-6">
              <div className="text-center py-12 text-gray-400">
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <Card className="bg-gray-800/50 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white text-sm">XML Import</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-400 text-sm">
              Upload XML files from suppliers with automatic field detection and AI-assisted mapping
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gray-800/50 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white text-sm">Web Scraping</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-400 text-sm">
              Extract product data from websites using Firecrawl with intelligent content detection
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gray-800/50 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white text-sm">Batch Processing</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-400 text-sm">
              Process products in batches with checkpoint recovery and real-time progress tracking
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DataImportHub;

