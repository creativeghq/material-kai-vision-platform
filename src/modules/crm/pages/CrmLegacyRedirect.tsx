/**
 * `/admin/crm/*` → `/crm/*`, with the id and query string carried across.
 *
 * CRM was mounted at TWO addresses rendering the SAME pages: `/admin/crm/*` (AdminGuard) and
 * `/crm/*` (capability `crm.view`). Which one you landed on depended on which link you happened to
 * click, and the admin-prefixed half quietly required platform-admin — so a `sales`, `accountant`
 * or `hr` user following one was bounced off a customer record they are entitled to open one URL
 * over. Nothing failed loudly; the page simply refused.
 *
 * The `/crm/*` half won because CRM is workspace-facing work, not operator tooling. These
 * redirects stay so the links that outlived the change — stored `action_url`s on old
 * notifications, bookmarks, anything pasted into a chat months ago — still land on the record
 * instead of the catch-all. They are NOT admin-gated: the whole point is that a non-admin
 * following an old link now arrives.
 *
 * The one CRM surface that legitimately stays under `/admin` is `users/:id` — `public.roles` is
 * the GLOBAL account tier (supplier / architect / admin), true in every workspace at once, and
 * `crm-api` refuses to mutate it for anyone who is not a global operator.
 */
import React from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';

/** `to('companies')` → `/crm/companies/:id?<same query>`; no segment → `/crm?<same query>`. */
export const crmRedirect = (segment?: 'companies' | 'contacts', fallbackSearch = ''): React.FC => {
  const Redirect: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const { search } = useLocation();
    const query = search || fallbackSearch;
    const path = segment && id ? `/crm/${segment}/${id}` : '/crm';
    return <Navigate to={`${path}${query}`} replace />;
  };
  return Redirect;
};

export const CrmRootRedirect = crmRedirect();
export const CrmCompanyRedirect = crmRedirect('companies');
export const CrmContactRedirect = crmRedirect('contacts');
/** The old `/admin/crm/categories` page was already only a redirect to the Categories TAB. */
export const CrmCategoriesRedirect = crmRedirect(undefined, '?tab=categories');

export default CrmRootRedirect;
