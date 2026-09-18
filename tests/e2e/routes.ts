// Declared once: route-load asserts each PAINTS, content-audit asserts it is USABLE.
export const ROUTES = [
  // Public (no auth)
  '/auth',
  '/tools', '/tools/price-scan', '/tools/mention-scan',
  '/tools/project-plan', '/tools/heat-pump', '/tools/heating-cost',
  '/knowledge-base', '/brands',
  // Core authed
  '/', '/profile', '/moodboard', '/agent-hub', '/compare', '/recognition',
  '/blueprints', '/projects', '/portal', '/market-trends',
  '/billing/subscriptions', '/billing/credits',
  '/apps', '/search-hub', '/tasks', '/requests', '/templates', '/shared', '/settings',
  // Previously white-screened / capability- & entitlement-gated
  '/finance', '/quotes', '/discover', '/crm', '/sales', '/pos', '/network',
  '/inbox', '/trip-expenses',
  '/supplier-portal',
  // Admin (operator-only)
  '/admin', '/admin/operations', '/admin/modules', '/admin/background-agents',
  '/admin/data-health', '/admin/knowledge-base', '/admin/materials-data',
  '/admin/flows', '/admin/data-import', '/admin/plans',
  '/admin/monitoring', '/admin/supplier-claims',
];
