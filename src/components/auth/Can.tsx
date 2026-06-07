/**
 * #195 — declarative capability gate. Renders children only when the active persona
 * holds the capability. Use for nav items, buttons, cards, route sections:
 *
 *   <Can capability="crm.view"><CrmNavItem /></Can>
 *   <Can capability="network.manage" fallback={<Locked />}>…</Can>
 *   <Can anyOf={['finance.manage','invoice.issue']}>…</Can>
 */
import React from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import type { Capability } from '@/auth/capabilities';

interface Props {
  capability?: Capability;
  anyOf?: Capability[];
  children: React.ReactNode;
  /** Rendered instead of children when the capability is absent. Defaults to nothing. */
  fallback?: React.ReactNode;
}

export const Can: React.FC<Props> = ({ capability, anyOf, children, fallback = null }) => {
  const { can, canAny, loading } = usePermissions();
  if (loading) return null;
  const allowed = capability ? can(capability) : anyOf ? canAny(...anyOf) : false;
  return <>{allowed ? children : fallback}</>;
};
