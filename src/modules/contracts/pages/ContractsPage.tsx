// Dedicated top-level Contracts page (#module: contracts). Contracts span HR, Finance and Projects,
// so their home is here — not under Finance. Filter tabs switch context; the per-entity sections
// (project detail, employee dialog, customer) remain as contextual sub-views that also feed this list.
import React, { useState } from 'react';
import { FileSignature } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { PageHeader } from '@/components/shared/PageHeader';
import { Skeleton } from '@/components/core/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/core/ui/tabs';
import { ContractsSection } from '@/components/features/contracts/ContractsSection';

const TABS = [
  { value: 'all', label: 'All' },
  { value: 'finance', label: 'Finance' },
  { value: 'hr', label: 'HR' },
  { value: 'project', label: 'Projects' },
] as const;

type TabValue = typeof TABS[number]['value'];

export default function ContractsPage() {
  const { activeWorkspaceId, loading } = useWorkspace();
  const [tab, setTab] = useState<TabValue>('all');
  const ws = activeWorkspaceId ?? '';

  if (loading) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;

  if (!ws) {
    return (
      <div className="min-h-screen">
        <PageHeader icon={FileSignature} title="Contracts" subtitle="Signable agreements across HR, Finance and Projects" />
        <div className="p-6"><div className="dashboard-card p-8 text-center text-sm text-muted-foreground">No active workspace.</div></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <PageHeader icon={FileSignature} title="Contracts" subtitle="Signable agreements across HR, Finance and Projects" />
      <div className="p-3 sm:p-6 max-w-4xl">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
          <TabsList className="mb-4 gap-1.5">
            {TABS.map((t) => <TabsTrigger key={t.value} value={t.value} className="px-3">{t.label}</TabsTrigger>)}
          </TabsList>
          {TABS.map((t) => (
            <TabsContent key={t.value} value={t.value} className="mt-0">
              <ContractsSection
                workspaceId={ws}
                context={t.value}
                heading={t.value === 'all' ? 'All contracts' : `${t.label} contracts`}
              />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
