/**
 * AI Data — unified admin shell mounting Metadata Management,
 * Relevancy Management, and Duplicate Detection as tabs.
 *
 * Routes:
 *   /admin/ai-data                          (defaults to ?tab=metadata)
 *   /admin/ai-data?tab=metadata
 *   /admin/ai-data?tab=relevancy
 *   /admin/ai-data?tab=duplicates
 *
 * Old standalone routes (/admin/metadata, /admin/relevancy,
 * /admin/duplicate-detection) redirect here.
 */

import React, { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Database, Link2, Copy, Tags } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';
import { MetadataManagement } from '@/components/Admin/MetadataManagement';
import { RelevancyManagement } from '@/components/Admin/RelevancyManagement';
import { DuplicateDetectionPage } from './DuplicateDetectionPage';
import { BatchCategorizationPage } from './BatchCategorizationPage';

const TAB_VALUES = ['metadata', 'relevancy', 'duplicates', 'categorization'] as const;
type TabValue = typeof TAB_VALUES[number];

const AIDataPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab: TabValue = (() => {
    const t = searchParams.get('tab');
    return (TAB_VALUES as readonly string[]).includes(t || '') ? (t as TabValue) : 'metadata';
  })();
  const [activeTab, setActiveTab] = useState<TabValue>(initialTab);

  const handleTabChange = useCallback((val: string) => {
    const next = (TAB_VALUES as readonly string[]).includes(val) ? (val as TabValue) : 'metadata';
    setActiveTab(next);
    const params = new URLSearchParams(searchParams);
    if (next === 'metadata') params.delete('tab');
    else params.set('tab', next);
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader
        title="AI Data"
        description="Pipeline output review — metadata, entity relationships, and duplicates"
        badge="Admin"
      />

      <div className="p-3 sm:p-6 space-y-6">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            <TabsTrigger value="metadata" className="flex items-center gap-2">
              <Database className="h-4 w-4" /> Metadata
            </TabsTrigger>
            <TabsTrigger value="relevancy" className="flex items-center gap-2">
              <Link2 className="h-4 w-4" /> Relevancy
            </TabsTrigger>
            <TabsTrigger value="duplicates" className="flex items-center gap-2">
              <Copy className="h-4 w-4" /> Duplicates
            </TabsTrigger>
            <TabsTrigger value="categorization" className="flex items-center gap-2">
              <Tags className="h-4 w-4" /> Categorization
            </TabsTrigger>
          </TabsList>

          <TabsContent value="metadata" className="mt-6">
            <MetadataManagement />
          </TabsContent>
          <TabsContent value="relevancy" className="mt-6">
            <RelevancyManagement />
          </TabsContent>
          <TabsContent value="duplicates" className="mt-6">
            <DuplicateDetectionPage />
          </TabsContent>
          {/* Bulk AI categorization — relocated from /admin/batch-categorization */}
          <TabsContent value="categorization" className="mt-6">
            <BatchCategorizationPage embedded />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AIDataPage;
