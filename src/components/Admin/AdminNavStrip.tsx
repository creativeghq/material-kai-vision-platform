import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { HubTabNav, type HubTabItem } from '@/components/core/hub/HubTabNav';
import { usePermissions } from '@/hooks/usePermissions';
import { dataIntegrityService } from '@/services/dataIntegrityService';

const ADMIN_AREAS: Omit<HubTabItem, 'count'>[] = [
  { id: 'harness', label: 'Agent Harness', to: '/admin' },
  { id: 'operations', label: 'Operations', to: '/admin/operations' },
  { id: 'ai-configs', label: 'AI Configs', to: '/admin/ai-configs' },
  { id: 'materials', label: 'Materials Data', to: '/admin/materials-data' },
  { id: 'import', label: 'Data Import', to: '/admin/data-import' },
  { id: 'queue', label: 'Job Queue', to: '/admin/async-queue-monitor' },
  { id: 'kb', label: 'Knowledge Base', to: '/admin/knowledge-base' },
  { id: 'health', label: 'Data Health', to: '/admin/data-health' },
  { id: 'logs', label: 'Logs', to: '/admin/logs' },
  { id: 'monitoring', label: 'Monitoring', to: '/admin/monitoring' },
  { id: 'modules', label: 'Modules', to: '/admin/modules', matchPrefix: true },
  { id: 'plans', label: 'Plans', to: '/admin/plans' },
  { id: 'claims', label: 'Supplier Claims', to: '/admin/supplier-claims' },
  { id: 'freight', label: 'Freight Quotes', to: '/admin/freight-quotes' },
  { id: 'catalog', label: 'Master Catalog', to: '/catalog-master' },
];

const isAdminPath = (path: string) => path === '/admin' || path.startsWith('/admin/') || path === '/catalog-master';

export const AdminNavStrip: React.FC = () => {
  const { pathname } = useLocation();
  const { isOperator } = usePermissions();
  const show = isOperator && isAdminPath(pathname);
  const [openFindings, setOpenFindings] = useState(0);

  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    void dataIntegrityService.listFindings({ status: 'open' })
      .then((f) => { if (!cancelled) setOpenFindings(f.length); })
      .catch(() => { if (!cancelled) setOpenFindings(0); });
    return () => { cancelled = true; };
  }, [show]);

  if (!show) return null;

  return (
    <div className="sticky top-0 z-20 bg-background px-3 sm:px-6">
      <HubTabNav
        aria-label="Admin areas"
        items={ADMIN_AREAS.map((a) => (a.id === 'health' ? { ...a, count: openFindings } : a))}
      />
    </div>
  );
};
