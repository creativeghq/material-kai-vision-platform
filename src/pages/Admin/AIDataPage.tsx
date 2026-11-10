/**
 * AI Data — unified admin shell mounting Metadata Management,
 * Relevancy Management, and Duplicate Detection as tabs.
 */

import React, { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Database, Link2, Copy, Tags } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';
import { MetadataManagement } from '@/components/Admin/MetadataManagement';
import { FieldRoleAudit } from '@/components/Admin/FieldRoleAudit';
import { RelevancyManagement } from '@/components/Admin/RelevancyManagement';
import { DuplicateDetectionPage } from './DuplicateDetectionPage';
import { BatchCategorizationPage } from './BatchCategorizationPage';

const TAB_VALUES = ['metadata', 'relevancy', 'duplicates', 'categorization', 'field-roles'] as const;
type TabValue = typeof TAB_VALUES[number];

interface AIDataPageProps {
  /** Hide the page header when mounted inside another page's tab. */
  embedded?: boolean;
  /** Query param the sub-tab syncs to; embedded without one keeps local state. */
  tabParam?: string;
}

const isTab = (v: string | null): v is TabValue => (TAB_VALUES as readonly string[]).includes(v ?? '');

const AIDataPage: React.FC<AIDataPageProps> = ({ embedded = false, tabParam }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const param = tabParam ?? (embedded ? null : 'tab');

  const [localTab, setLocalTab] = useState<TabValue>('metadata');
  const fromUrl = param ? searchParams.get(param) : null;
  const activeTab: TabValue = param ? (isTab(fromUrl) ? fromUrl : 'metadata') : localTab;

  const handleTabChange = useCallback((val: string) => {
    const next: TabValue = isTab(val) ? val : 'metadata';
    if (!param) {
      setLocalTab(next);
      return;
    }
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === 'metadata') params.delete(param);
      else params.set(param, next);
      return params;
    }, { replace: true });
  }, [param, setSearchParams]);

  return (
    <div className={embedded ? '' : 'min-h-screen'}>
      {!embedded && (
        <GlobalAdminHeader
          title="AI Data"
          description="Pipeline output review — metadata, entity relationships, and duplicates"
          badge="Admin"
        />
      )}

      <div className={embedded ? 'space-y-6' : 'p-3 sm:p-6 space-y-6'}>
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
            <TabsTrigger value="field-roles" className="flex items-center gap-2">
              <Database className="h-4 w-4" /> Field Roles
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
          {/* #347 phase 4.5 — audit and override, never a gate. */}
          <TabsContent value="field-roles" className="mt-6">
            <FieldRoleAudit />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AIDataPage;
