import React, { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

import { HubTabNav } from '@/components/core/hub/HubTabNav';
import { PageHeader } from '@/components/shared/PageHeader';

export interface HqTab {
  id: string;
  label: string;
  count?: number;
  render: () => React.ReactNode;
}

interface Props {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  tabs: HqTab[];
  actions?: React.ReactNode;
}

/** An HQ page whose panes are top tabs, kept in `?tab=`. Only the active pane mounts, so each loads on demand. */
export const HqTabbedPage: React.FC<Props> = ({ icon, title, subtitle, tabs, actions }) => {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const active = tabs.find((t) => t.id === requested) ?? tabs[0];

  const select = useCallback((id: string) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id === tabs[0]?.id) next.delete('tab');
      else next.set('tab', id);
      return next;
    }, { replace: true });
  }, [setParams, tabs]);

  return (
    <div>
      <PageHeader icon={icon} title={title} subtitle={subtitle} actions={actions}>
        <HubTabNav
          aria-label={`${title} sections`}
          className="border-b-0"
          activeId={active?.id}
          onSelect={select}
          items={tabs.map((t) => ({ id: t.id, label: t.label, count: t.count }))}
        />
      </PageHeader>
      <div role="tabpanel" aria-label={active?.label} className="space-y-4 p-3 sm:p-6">
        {active?.render()}
      </div>
    </div>
  );
};
