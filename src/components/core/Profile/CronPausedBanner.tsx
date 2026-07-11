/**
 * Surfaces scheduled features that are paused because the workspace owner ran out of credits
 * (workspace_cron_billing_state.status = 'paused_insufficient_credits'). They resume automatically
 * on the next run once credits are topped up — this banner just tells the user why + points to
 * "Add credits". Member-readable via RLS.
 */
import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';

const FEATURE_LABELS: Record<string, string> = {
  'price-monitoring': 'Price monitoring',
  'mention-monitoring': 'Mention monitoring',
  'llm-mention-probe': 'LLM visibility probes',
  'job-research-refresh': 'Job research',
  'job-research-digest': 'Job digests',
  'seo-toolkit-audit': 'SEO audits',
  'email-campaign': 'Email campaigns',
  'email-contacts-sync': 'CRM → Resend contact sync',
  'finance-auto-statement': 'Automatic statements',
  'finance-inbound-sync': 'myDATA inbound sync',
  'hr-checkin': 'HR late check-in alerts',
  'check-material-alerts': 'Material alerts',
  'user-website-recrawl': 'Website re-crawl',
};

export const CronPausedBanner: React.FC = () => {
  const { activeWorkspaceId } = useWorkspace();
  const [paused, setPaused] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeWorkspaceId) { setPaused([]); return; }
      const { data } = await supabase
        .from('workspace_cron_billing_state')
        .select('cron_key')
        .eq('workspace_id', activeWorkspaceId)
        .eq('status', 'paused_insufficient_credits');
      if (!cancelled) setPaused((data ?? []).map((r: any) => r.cron_key));
    })();
    return () => { cancelled = true; };
  }, [activeWorkspaceId]);

  if (paused.length === 0) return null;

  const names = paused.map((k) => FEATURE_LABELS[k] ?? k);

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
      <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
      <div className="text-sm">
        <p className="font-medium">Some scheduled features are paused — out of credits</p>
        <p className="text-muted-foreground mt-1">
          {names.join(', ')} {names.length === 1 ? 'is' : 'are'} paused because this workspace ran out of credits.
          They resume <strong>automatically</strong> on the next run once you add credits below — no need to re-enable anything.
        </p>
      </div>
    </div>
  );
};

export default CronPausedBanner;
