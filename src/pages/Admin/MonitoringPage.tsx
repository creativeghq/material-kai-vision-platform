import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TrendingUp, Megaphone, Briefcase } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/core/ui/tabs';
import { Button } from '@/components/core/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { PriceMonitoringDashboard } from '@/components/business/price-monitoring/PriceMonitoringDashboard';
import MentionMonitoringDashboard from '@/components/business/mention-monitoring/MentionMonitoringDashboard';
import { SectionHeader } from '@/components/shared/SectionHeader';

/**
 * #244 B — one monitoring home. Three tabs (Price / Mention / Job Research)
 * over the existing surfaces; each tab's content is gated by its module flag
 * (`isModuleEnabled`), so a disabled module shows a hint instead of the dashboard.
 */
const ModuleDisabled: React.FC<{ name: string }> = ({ name }) => (
  <div className="dashboard-card p-8 text-center text-sm text-muted-foreground">
    {name} is disabled. Enable it under <code>/admin/modules</code> to use this tab.
  </div>
);

export default function MonitoringPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const tab = params.get('tab') || 'price';
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});

  useEffect(() => {
    supabase.from('modules').select('slug,enabled')
      .in('slug', ['price-monitoring', 'mention-monitoring', 'job-research'])
      .then(({ data }) => setEnabled(Object.fromEntries((data || []).map((m: any) => [m.slug, m.enabled]))));
  }, []);

  return (
    <div className="p-6 space-y-4">
      <SectionHeader title="Monitoring" subtitle="Price, mentions, and job-research tracking in one place." />
      <Tabs value={tab} onValueChange={(t) => setParams({ tab: t })}>
        <TabsList>
          <TabsTrigger value="price"><TrendingUp className="h-4 w-4 mr-1.5" /> Price</TabsTrigger>
          <TabsTrigger value="mention"><Megaphone className="h-4 w-4 mr-1.5" /> Mentions</TabsTrigger>
          <TabsTrigger value="jobs"><Briefcase className="h-4 w-4 mr-1.5" /> Job Research</TabsTrigger>
        </TabsList>

        <TabsContent value="price" className="mt-4">
          {enabled['price-monitoring'] === false ? <ModuleDisabled name="Price Monitoring" /> : <PriceMonitoringDashboard />}
        </TabsContent>
        <TabsContent value="mention" className="mt-4">
          {enabled['mention-monitoring'] === false ? <ModuleDisabled name="Mention Monitoring" /> : <MentionMonitoringDashboard />}
        </TabsContent>
        <TabsContent value="jobs" className="mt-4">
          {enabled['job-research'] === false ? <ModuleDisabled name="Job Research" /> : (
            <div className="dashboard-card p-8 text-center space-y-3">
              <p className="text-sm text-muted-foreground">Job-research searches run as background agents.</p>
              <Button onClick={() => navigate('/admin/ai-configs?tab=background-agents')} className="rounded-full">Open Background Agents →</Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
