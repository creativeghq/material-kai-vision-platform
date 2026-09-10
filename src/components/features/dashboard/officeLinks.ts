/** Where every My Office figure goes when you click it. */
import { filterUrl } from '@/components/core/filters/filterUrl';
import {
  FINANCE_TAB, ORDERS_FILTER_KEY, AR_FILTER_KEY, AP_FILTER_KEY,
  AGE_BUCKET_KEY, OVERDUE_KEY, financeTabUrl,
} from '@/modules/finance/routes';
import { CRM_TAB, CRM_KIND, CRM_COMPANY_FILTER_KEY, crmTabUrl } from '@/modules/crm/routes';
import { QUOTES_BASE, QUOTES_FILTER_KEY } from '@/modules/quotes/routes';
import type { OrderStatus } from '@/modules/finance/services/ordersService';

/** Finance → Documents → Orders, optionally narrowed to one status. */
export const ordersLink = (status?: OrderStatus): string =>
  filterUrl(financeTabUrl(FINANCE_TAB.orders), ORDERS_FILTER_KEY, { status });

/** The quotes list, optionally narrowed to one status. The status field is a `multi`, so the
 *  value is an array — spelling it as a bare string matches nothing and shows everything. */
export const quotesLink = (status?: string): string =>
  filterUrl(QUOTES_BASE, QUOTES_FILTER_KEY, { status: status ? [status] : undefined });

/** Finance → Receivables. `pastDue` narrows to exactly the rows the Overdue figure counts. */
export const receivablesLink = (opts: { pastDue?: boolean } = {}): string =>
  filterUrl(financeTabUrl(FINANCE_TAB.receivables), AR_FILTER_KEY, {
    [OVERDUE_KEY]: opts.pastDue ? true : undefined,
  });

/** Finance → Payables. */
export const payablesLink = (): string =>
  filterUrl(financeTabUrl(FINANCE_TAB.payables), AP_FILTER_KEY, {});

/** CRM → Companies, optionally narrowed to the customers or the suppliers. */
export const companiesLink = (kind?: typeof CRM_KIND[keyof typeof CRM_KIND]): string =>
  filterUrl(crmTabUrl(CRM_TAB.companies), CRM_COMPANY_FILTER_KEY, { kind });

/** Aging-bucket deep link, kept next to the others so the key is never spelled by hand. */
export const receivablesBucketLink = (bucket: string): string =>
  filterUrl(financeTabUrl(FINANCE_TAB.receivables), AR_FILTER_KEY, { [AGE_BUCKET_KEY]: bucket });

export const PROJECTS_LINK = '/projects';
export const INBOX_LINK = '/inbox';

export { CRM_KIND };
