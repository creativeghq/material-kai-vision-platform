/**
 * Where CRM lives in the URL — one answer, imported by everything that links into it.
 *
 * CRM record pages are at `/crm/*` behind the `crm.view` capability; the `/admin/crm/*` twin is
 * redirects only (see `deepLinkTargets.test.ts`, which fails a new link written against it).
 *
 * The tab keys matter as much as the path. `/crm` with no `?tab=` opens **Users** — the platform
 * accounts list, which is not the CRM at all — so a link that means "the customers we sell to"
 * and omits the tab lands the operator on a completely different set of records. That is what the
 * dashboard's Customers block did: it counted `crm_companies` and then opened the Users tab.
 */
export const CRM_BASE = '/crm';

/** The `?tab=` keys CRMPage renders panes for (`TAB_VALUES` in CRMPage is built from this). */
export const CRM_TAB = {
  pipeline: 'pipeline',
  users: 'users',
  contacts: 'contacts',
  companies: 'companies',
  categories: 'categories',
} as const;

/** `?<key>=` params the CRM lists read their filter bag out of (see `filterUrl`). */
export const CRM_USER_FILTER_KEY = 'uf';
export const CRM_CONTACT_FILTER_KEY = 'kf';
export const CRM_COMPANY_FILTER_KEY = 'cf';

/**
 * The `kind` value the companies/contacts lists filter on. It is `client`, not `customer` — the
 * column is `is_customer` and the filter option is `client`, and the two have to be translated
 * somewhere. Here, once.
 */
export const CRM_KIND = { customer: 'client', supplier: 'supplier', neither: 'neither' } as const;

/** A CRM URL that names its pane. */
export function crmTabUrl(tab: typeof CRM_TAB[keyof typeof CRM_TAB]): string {
  return `${CRM_BASE}?tab=${tab}`;
}
