import React, { useMemo } from 'react';

import { HubSideNav, type HubNavGroup } from '@/components/core/hub/HubSideNav';
import { Layout } from '@/components/core/Layout';

import { useAdminAttention } from './adminAttention';
import { ADMIN_NAV } from './adminNav';

/** Operator HQ chrome: the admin section rail beside the page. Pages own their PageHeader and top tabs. */
export const AdminShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { data } = useAdminAttention();

  const groups = useMemo<HubNavGroup[]>(
    () => ADMIN_NAV.map((g) => ({
      label: g.label,
      items: g.items.map((d) => ({
        id: d.id,
        label: d.label,
        to: d.path,
        icon: d.icon,
        count: data && d.count ? d.count(data) : undefined,
      })),
    })),
    [data],
  );

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <aside className="shrink-0 border-b border-hairline bg-card px-2 py-2 lg:border-b-0 lg:bg-transparent lg:py-4 lg:pl-3">
        <HubSideNav groups={groups} aria-label="Admin sections" />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
};

/** Layout + the admin rail — the element every operator route renders inside. */
export const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Layout>
    <AdminShell>{children}</AdminShell>
  </Layout>
);
