/** Commercial answers one question per tab, and a takeoff reaches money through a quote (#523). */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripComments } from '../helpers/stripComments';
import { SUBJECT_LABEL } from '../../src/modules/finance/approvalRules';
import { PROJECT_SECTION_LABELS, PROJECT_TABS } from '../../src/modules/projects/projectSections';

const read = (p: string) => stripComments(readFileSync(resolve(process.cwd(), p), 'utf8'));
const TABS = 'src/modules/projects/components/tabs';
const INVOICING = read(`${TABS}/InvoicingTab.tsx`);
const PURCHASES = read(`${TABS}/PurchasesTab.tsx`);
const COST = read(`${TABS}/CostReportTab.tsx`);
const QUOTES = read(`${TABS}/QuotesTab.tsx`);
const PAGE = read('src/modules/projects/pages/ProjectDetailPage.tsx');
const TOOLS = read('supabase/functions/_shared/tools/construction-tools.ts');

describe('the Bill is gone', () => {
  it('has no tab and no files', () => {
    expect(PROJECT_TABS as readonly string[]).not.toContain('bill');
    for (const f of [`${TABS}/BillTab.tsx`, 'src/modules/projects/services/schedulesService.ts', 'src/modules/projects/components/PricedScheduleCard.tsx']) {
      expect(existsSync(resolve(process.cwd(), f)), f).toBe(false);
    }
  });
});

describe('one question per tab', () => {
  it('names the tabs for what they answer, without moving the links', () => {
    expect(PROJECT_SECTION_LABELS.billing).toBe('Invoicing');
    expect(PROJECT_SECTION_LABELS.finance).toBe('Cost report');
    expect(PAGE).toContain("tabs: ['quotes', 'contracts', 'billing', 'purchases', 'finance']");
  });

  it('Quotes holds what changes the price', () => {
    expect(QUOTES).toContain('<SelectionsPanel');
    expect(QUOTES).toContain('<VariationsCard');
    expect(QUOTES).toContain('canFinance && workspaceId');
  });

  it('Invoicing holds what comes in', () => {
    expect(INVOICING).toContain('<ApplicationsCard');
    expect(INVOICING).toContain('orderType="sales"');
  });

  it('Purchases holds what goes out, and only a finance viewer sees the money', () => {
    for (const part of ['<PurchaseItemsTab', 'orderType="purchase"', '<TenderPackagesCard', '<SupplierBillsCard', '<ProjectExpensesCard']) {
      expect(PURCHASES).toContain(part);
    }
    expect(PURCHASES).toContain('if (!canFinance) return items;');
  });

  it('the Cost report only reports', () => {
    for (const moved of ['VariationsCard', 'ApplicationsCard', 'TenderPackagesCard', 'OrdersPanel', 'ProjectExpensesCard', 'AttachFinanceDialog']) {
      expect(COST, moved).not.toContain(moved);
    }
  });

  it('an agent link lands on the tab that holds the thing', () => {
    expect(TOOLS).toContain('tab=billing');
    expect(TOOLS).toContain('tab=quotes');
    expect(TOOLS).toContain('tab=purchases');
  });
});

describe('approvals and early warning', () => {
  it('a project purchase order is on the approval spine', () => {
    expect(SUBJECT_LABEL.project_purchase_order).toBeTruthy();
    expect(read('src/modules/finance/components/OrdersPanel.tsx')).toContain("subject: 'project_purchase_order'");
  });

  it('the early warning view reads the flags SQL derived', () => {
    expect(TOOLS).toContain("'early_warning'");
    expect(TOOLS).toContain("rpc('get_project_command_centre'");
  });
});
