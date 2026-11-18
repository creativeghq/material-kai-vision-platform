/**
 * AI Data — unified admin shell mounting Metadata Management,
 * Relevancy Management, and Duplicate Detection as tabs.
 */

import React, { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Database } from 'lucide-react';
import { Tabs, TabsContent } from '@/components/core/ui/tabs';
import { HubSegmented } from '@/components/core/hub/HubSegmented';
import { PageHeader } from '@/components/shared/PageHeader';
import { MetadataManagement } from '@/components/Admin/MetadataManagement';
import { FieldRoleAudit } from '@/components/Admin/FieldRoleAudit';
import { RelevancyManagement } from '@/components/Admin/RelevancyManagement';
import { DuplicateDetectionPage } from './DuplicateDetectionPage';

const VIEWS = [
  { value: 'metadata', label: 'Metadata' },
  { value: 'relevancy', label: 'Relevancy' },
  { value: 'duplicates', label: 'Duplicates' },
  { value: 'field-roles', label: 'Field Roles' },
] as const;
const TAB_VALUES = VIEWS.map((v) => v.value);
type TabValue = typeof VIEWS[number]['value'];

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
        <PageHeader icon={Database} title="AI Data" subtitle="Pipeline output review — metadata, entity relationships and duplicates." />
      )}

      <div className={embedded ? 'space-y-6' : 'p-3 sm:p-6 space-y-6'}>
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
          <HubSegmented options={VIEWS} value={activeTab} onChange={handleTabChange} aria-label="AI Review view" />

          <TabsContent value="metadata" className="mt-6">
            <MetadataManagement />
          </TabsContent>
          <TabsContent value="relevancy" className="mt-6">
            <RelevancyManagement />
          </TabsContent>
          <TabsContent value="duplicates" className="mt-6">
            <DuplicateDetectionPage />
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
