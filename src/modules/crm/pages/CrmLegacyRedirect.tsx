/** `/admin/crm/*` → `/crm/*`, with the id and query string carried across. */
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
