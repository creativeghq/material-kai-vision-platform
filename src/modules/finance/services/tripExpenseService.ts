// Trip Cards (sales-team expense reports) — service surface.
// A trip card (`trip_expense_reports`) is owned by a sales rep and holds
// day-by-day expense lines (`trip_expense_items`), each with an optional
// receipt/invoice attachment. The rep builds it as a draft, submits it, and
// finance approves/rejects each line. On approval the workspace's
// `trip_expense_reimbursement_mode` setting decides whether a reimbursement
// payable is auto-posted (handled DB-side in trip_expense_review_item).
// CRUD goes straight to the tables under RLS. Status transitions + review go
// through SECURITY DEFINER RPCs. Receipt upload / signed URLs / PDF render go
// through the `trip-expense-ops` edge function (service role) because receipts
// live in the private pdf-documents bucket and finance (a different user than
// the rep) must be able to read them.

import { supabase } from '@/integrations/supabase/client';
import { flowEventService } from '@/services/flows/flowEventService';
import { formatMoney } from '@/modules/finance/services/financeService';
import { todayLocalISO } from '@/utils/datetime';
import { billingErrorMessage } from '@/modules/finance/services/timeTrackingService';

export type TripStatus =
  | 'draft' | 'submitted' | 'partially_approved' | 'approved' | 'rejected' | 'reimbursed';
export type ExpenseApproval = 'pending' | 'approved' | 'rejected';
export type ExpensePaymentMethod = 'cash' | 'card' | 'personal' | 'company_card' | 'other';

export const TRIP_EXPENSE_CATEGORIES = [
  'transport', 'fuel', 'hotel', 'meals', 'parking', 'tolls', 'supplies', 'other',
] as const;
export type TripExpenseCategory = (typeof TRIP_EXPENSE_CATEGORIES)[number];

// One source for the VALUES (#391). The label list below keeps the name
// `EXPENSE_CARD_TYPES` because that is what the UI already imports; the raw array lives
// in `../tripExpenseVocabulary` as `CARD_TYPE_VALUES` and is what the guard pins.
export { isExpenseCardType } from '../tripExpenseVocabulary';
export type { ExpenseCardType } from '../tripExpenseVocabulary';

import { EXPENSE_CARD_TYPES as CARD_TYPE_VALUES } from '../tripExpenseVocabulary';
import type { ExpenseCardType } from '../tripExpenseVocabulary';

/** Every card type with its label. Keyed by the vocabulary, so a new value is a compile
 *  error here rather than an option that silently never appears in the picker. */
const CARD_TYPE_LABELS: Record<ExpenseCardType, string> = {
  trip: 'Trip',
  monthly: 'Monthly expenses',
  other: 'Other',
};

export const EXPENSE_CARD_TYPES: { value: ExpenseCardType; label: string }[] =
  CARD_TYPE_VALUES.map((value) => ({ value, label: CARD_TYPE_LABELS[value] }));
export const EXPENSE_CARD_TYPE_LABEL: Record<ExpenseCardType, string> = {
  trip: 'Trip', monthly: 'Monthly', other: 'Other',
};

export const TRIP_STATUS_LABEL: Record<TripStatus, string> = {
  draft: 'Draft',
  submitted: 'Under review',
  partially_approved: 'Partially approved',
  approved: 'Approved',
  rejected: 'Rejected',
  reimbursed: 'Reimbursed',
};

export interface TripExpenseReport {
  id: string;
  workspace_id: string;
  user_id: string;
  card_type: ExpenseCardType;
  title: string;
  destination: string | null;
  purpose: string | null;
  trip_start: string | null;
  trip_end: string | null;
  currency: string;
  status: TripStatus;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  /** Finance user who requested this card on the rep's behalf (null = self-created). */
  assigned_by: string | null;
  request_note: string | null;
  reimbursement_planned_payment_id: string | null;
  reimbursed_at: string | null;
  item_count: number;
  total_amount: number;
  approved_amount: number;
  rejected_amount: number;
  pending_amount: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TripExpenseItem {
  id: string;
  report_id: string;
  workspace_id: string;
  expense_date: string;
  category: string;
  description: string | null;
  vendor: string | null;
  amount: number;
  currency: string;
  vat_amount: number | null;
  payment_method: ExpensePaymentMethod | null;
  billable: boolean;
  project_id: string | null;
  receipt_bucket: string | null;
  receipt_path: string | null;
  receipt_name: string | null;
  receipt_mime: string | null;
  approval_status: ExpenseApproval;
  review_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  /** How this line came to exist. NULL = typed by hand; see CreateItemInput for the rest. */
  extraction_status: 'pending' | 'extracted' | 'failed' | null;
  /** The raw reader output, kept so a wrong prefill can be traced to what was actually read. */
  extracted: Record<string, unknown> | null;
  /** A scanned line the rep has not confirmed yet. */
  needs_review: boolean;
  /** Set once the billable line has been on-charged to a customer as a draft invoice. */
  billed_invoice_id: string | null;
  billed_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** One currency's worth of a derived total. Never summed across currencies — see `cardLinks`. */
export interface TripMoneyByCurrency { currency: string; amount: number }

export interface TripCardLinks {
  orders: Array<{
    id: string; order_number: string | null; order_type: 'sales' | 'purchase'; status: string;
    total: number; currency: string; created_at: string; party_name: string | null;
  }>;
  bills: Array<{
    id: string; number: string | null; status: string; total: number; currency: string;
    issued_at: string | null; supplier_name: string | null;
  }>;
  /** Sales orders won on this card. */
  earned: TripMoneyByCurrency[];
  /** Supplier bills filed against it. */
  filed: TripMoneyByCurrency[];
}

export interface CreateReportInput {
  workspaceId: string;
  card_type?: ExpenseCardType;
  title: string;
  destination?: string | null;
  purpose?: string | null;
  trip_start?: string | null;
  trip_end?: string | null;
  currency?: string;
  notes?: string | null;
}

export interface CreateItemInput {
  report_id: string;
  expense_date?: string;
  category?: string;
  description?: string | null;
  vendor?: string | null;
  amount: number;
  currency?: string;
  vat_amount?: number | null;
  payment_method?: ExpensePaymentMethod;
  billable?: boolean;
  project_id?: string | null;
  sort_order?: number;
  /**
   * Set only by the receipt scanner (#379). `extraction_status` is an EXPLICIT marker: NULL means
   * a human typed this line, 'extracted' means a scan produced it, 'failed' means a scan ran and
   * could not read the paper — and only the last of those is worth retrying with a better photo.
   * `needs_review` is what keeps this prefill-then-confirm rather than an automation that books
   * money off a model's reading; it is cleared by the person, never by a confidence score.
   */
  extraction_status?: 'pending' | 'extracted' | 'failed' | null;
  extracted?: Record<string, unknown> | null;
  needs_review?: boolean;
}

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || '');
      resolve(res.includes(',') ? res.split(',')[1] : res);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export const tripExpenseService = {
  // -------- Reports --------

  async listReports(opts: {
    workspaceId: string;
    /** Only the caller's own cards (reps); finance omits to see every card. */
    mine?: boolean;
    status?: TripStatus[];
    cardType?: ExpenseCardType;
  }): Promise<TripExpenseReport[]> {
    let q = supabase
      .from('trip_expense_reports')
      .select('*')
      .eq('workspace_id', opts.workspaceId)
      .order('created_at', { ascending: false });
    if (opts.status?.length) q = q.in('status', opts.status);
    if (opts.cardType) q = q.eq('card_type', opts.cardType);
    if (opts.mine) {
      const { data: auth } = await supabase.auth.getUser();
      if (auth?.user?.id) q = q.eq('user_id', auth.user.id);
    }
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as TripExpenseReport[];
  },

  async getReport(id: string): Promise<{ report: TripExpenseReport; items: TripExpenseItem[] }> {
    const [{ data: report, error: e1 }, { data: items, error: e2 }] = await Promise.all([
      supabase.from('trip_expense_reports').select('*').eq('id', id).single(),
      supabase.from('trip_expense_items').select('*').eq('report_id', id).order('expense_date', { ascending: true }).order('sort_order', { ascending: true }),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    return { report: report as TripExpenseReport, items: (items ?? []) as TripExpenseItem[] };
  },

  /**
   * What has been FILED against this card — the orders won on the trip and the supplier bills
   * booked to it. Distinct from the card's own `trip_expense_items`, which are the rep's
   * out-of-pocket claims; a filed bill is a company cost (a hotel invoiced to the company, a
   * flight on the company card) that belongs to the trip without belonging to the claim.
   *
   * Totals come back DERIVED and grouped by currency — the client formats, it does not sum. Only
   * SALES orders count as earned: a purchase made on a buying trip is spend, and netting the two
   * directions into one figure is the money-derivation mistake this codebase already made once.
   */
  async cardLinks(reportId: string): Promise<TripCardLinks> {
    const { data, error } = await (supabase as any).rpc('get_trip_card_links', { p_report_id: reportId });
    if (error) throw error;
    const d = (data ?? {}) as Partial<TripCardLinks>;
    return { orders: d.orders ?? [], bills: d.bills ?? [], earned: d.earned ?? [], filed: d.filed ?? [] };
  },

  async createReport(input: CreateReportInput): Promise<TripExpenseReport> {
    const { data, error } = await supabase
      .from('trip_expense_reports')
      .insert({
        workspace_id: input.workspaceId,
        card_type: input.card_type ?? 'trip',
        title: input.title,
        destination: input.destination ?? null,
        purpose: input.purpose ?? null,
        trip_start: input.trip_start ?? null,
        trip_end: input.trip_end ?? null,
        currency: input.currency ?? 'EUR',
        notes: input.notes ?? null,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as TripExpenseReport;
  },

  async updateReport(id: string, patch: Partial<Pick<TripExpenseReport,
    'title' | 'destination' | 'purpose' | 'trip_start' | 'trip_end' | 'currency' | 'notes'>>): Promise<void> {
    const { error } = await supabase.from('trip_expense_reports').update(patch).eq('id', id);
    if (error) throw error;
  },

  async deleteReport(id: string): Promise<void> {
    const { error } = await supabase.from('trip_expense_reports').delete().eq('id', id);
    if (error) throw error;
  },

  // -------- Items --------

  /**
   * The human half of prefill-then-confirm. Clearing `needs_review` is a deliberate act by the rep
   * who is looking at both the photo and the numbers — never something a confidence threshold does
   * on their behalf, because a confident wrong reading is the failure mode of this whole feature.
   */
  async confirmScanned(itemId: string): Promise<void> {
    const { error } = await supabase.from('trip_expense_items')
      .update({ needs_review: false } as never).eq('id', itemId);
    if (error) throw error;
  },

  async addItem(input: CreateItemInput): Promise<TripExpenseItem> {
    const { data, error } = await supabase
      .from('trip_expense_items')
      .insert({
        report_id: input.report_id,
        expense_date: input.expense_date ?? todayLocalISO(),
        category: input.category ?? 'other',
        description: input.description ?? null,
        vendor: input.vendor ?? null,
        amount: input.amount,
        currency: input.currency ?? 'EUR',
        vat_amount: input.vat_amount ?? null,
        payment_method: input.payment_method ?? 'personal',
        billable: input.billable ?? false,
        project_id: input.project_id ?? null,
        sort_order: input.sort_order ?? 0,
        extraction_status: input.extraction_status ?? null,
        extracted: input.extracted ?? null,
        needs_review: input.needs_review ?? false,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as TripExpenseItem;
  },

  // ---------- project attribution (#285) ----------
  //
  // An expense item is the claim; the PROJECT says which job bears its cost. These let a project
  // pull costs to itself without leaving the job — the claim still lives in Expenses, keeps its
  // receipt, and still goes through the same approval, because that is where reimbursement and
  // review belong. Nothing here approves anything.

  /** Every claim attributed to this project, newest first. */
  async listByProject(projectId: string): Promise<TripExpenseItem[]> {
    const { data, error } = await supabase
      .from('trip_expense_items').select('*')
      .eq('project_id', projectId)
      .order('expense_date', { ascending: false });
    if (error) throw error;
    return (data ?? []) as TripExpenseItem[];
  },

  /**
   * Claims in this workspace not yet attributed to any project — the "link an existing expense"
   * candidates. This is where imported card spend lands (the Revolut feed materialises into
   * trip_expense_items), so it is how a fetched charge gets pulled onto a job.
   * Already-billed claims are excluded: re-pointing one would move a cost the client was already
   * invoiced for.
   */
  async listUnassigned(workspaceId: string): Promise<TripExpenseItem[]> {
    const { data, error } = await supabase
      .from('trip_expense_items').select('*')
      .eq('workspace_id', workspaceId)
      .is('project_id', null)
      .is('billed_invoice_id', null)
      .order('expense_date', { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data ?? []) as TripExpenseItem[];
  },

  /** Attribute a claim to a project, or clear it by passing null. */
  async assignToProject(itemId: string, projectId: string | null): Promise<void> {
    const { error } = await supabase
      .from('trip_expense_items').update({ project_id: projectId }).eq('id', itemId);
    if (error) throw error;
  },

  /**
   * The card that holds ad-hoc costs booked straight from a project. Reused rather than created
   * per expense — one card per project keeps the reviewer's queue readable, and mirrors how the
   * card importer reuses a single monthly card instead of one per charge.
   */
  async ensureProjectCard(workspaceId: string, projectId: string, projectName: string): Promise<string> {
    const title = `Project — ${projectName}`;
    const { data: existing } = await supabase
      .from('trip_expense_reports').select('id')
      .eq('workspace_id', workspaceId).eq('title', title)
      .limit(1).maybeSingle();
    if (existing?.id) return existing.id as string;

    const report = await this.createReport({
      workspaceId, card_type: 'other', title,
      purpose: `Costs booked directly against project ${projectId}`,
    });
    return report.id;
  },

  async updateItem(id: string, patch: Partial<Pick<TripExpenseItem,
    'expense_date' | 'category' | 'description' | 'vendor' | 'amount' | 'currency' | 'vat_amount' | 'payment_method' | 'billable' | 'project_id' | 'sort_order'>>): Promise<void> {
    const { error } = await supabase.from('trip_expense_items').update(patch).eq('id', id);
    if (error) throw error;
  },

  async removeItem(id: string): Promise<void> {
    const { error } = await supabase.from('trip_expense_items').delete().eq('id', id);
    if (error) throw error;
  },

  /**
   * Rebill approved, billable, not-yet-billed trip-expense items to a customer as a draft invoice
   * (one line per expense), stamping billed_invoice_id so a line can't be double-billed. Mirrors
   * timeTrackingService.billToInvoice. Returns the new invoice id.
   */
  async billToClient(
    workspaceId: string,
    customer: { type: 'company' | 'contact'; id: string },
    itemIds: string[],
    vatRate = 24,
  ): Promise<string> {
    if (itemIds.length === 0) throw new Error('No expenses selected');
    /**
     * ONE transaction (#351 S4), and it bills what the comment above says it bills.
     *
     * Create → lines → stamp were three separate writes; a failure on the stamp left the claims
     * reading unbilled beside an invoice that already carried them, so retrying billed the
     * client twice for the same receipts.
     *
     * `approval_status = 'approved'` is applied server-side now (#351 S3) — only `billable` was
     * ever checked here, while the panel filtered approval and the doc comment claimed it. And
     * a selection spanning two currencies is refused rather than summed into whichever currency
     * happened to be first.
     */
    const { data, error } = await supabase.rpc('bill_trip_expenses_to_invoice', {
      p_workspace_id: workspaceId,
      p_customer_company_id: customer.type === 'company' ? customer.id : null,
      p_customer_contact_id: customer.type === 'contact' ? customer.id : null,
      p_item_ids: itemIds,
      p_vat_rate: vatRate,
    });
    if (error) throw new Error(billingErrorMessage(error.message));
    if (!data) throw new Error('The invoice was not created');
    return data as string;
  },

  // -------- Workflow (RPCs) --------

  async submit(reportId: string): Promise<TripExpenseReport> {
    const { data, error } = await supabase.rpc('trip_expense_submit', { p_report_id: reportId });
    if (error) throw error;
    const report = data as TripExpenseReport;
    // Notify finance reviewers that a card is waiting for review (via Flows).
    try {
      const { data: reviewers } = await supabase
        .from('workspace_members').select('user_id')
        .eq('workspace_id', report.workspace_id).in('role', ['owner', 'admin']);
      flowEventService.emit('expense_card_submitted', {
        card_id: report.id,
        workspace_id: report.workspace_id,
        reviewer_ids: (reviewers || []).map((m: any) => m.user_id),
        type: 'expense_card_submitted',
        title: `Expense card submitted: ${report.title}`,
        body: `An expense card (${EXPENSE_CARD_TYPE_LABEL[report.card_type] ?? report.card_type}) totalling ${formatMoney(Number(report.total_amount), report.currency)} is waiting for your review.`,
        action_url: '/finance?tab=trip_cards',
      });
    } catch { /* fire-and-forget */ }
    return report;
  },

  async reviewItem(itemId: string, decision: ExpenseApproval, note?: string): Promise<TripExpenseReport> {
    const { data, error } = await supabase.rpc('trip_expense_review_item', {
      p_item_id: itemId, p_decision: decision, p_note: note ?? null,
    });
    if (error) throw error;
    const report = data as TripExpenseReport;
    // Once every line is decided (no pending left), tell the rep the outcome.
    if (Number(report.pending_amount) === 0 && ['approved', 'partially_approved', 'rejected'].includes(report.status)) {
      try {
        const outcome = report.status === 'approved' ? 'approved'
          : report.status === 'rejected' ? 'rejected' : 'partially approved';
        flowEventService.emit('expense_card_reviewed', {
          card_id: report.id,
          workspace_id: report.workspace_id,
          user_id: report.user_id,
          status: report.status,
          type: 'expense_card_reviewed',
          title: `Expense card ${outcome}: ${report.title}`,
          body: `Finance reviewed your expense card. Approved: ${formatMoney(Number(report.approved_amount), report.currency)}, rejected: ${formatMoney(Number(report.rejected_amount), report.currency)}.`,
          action_url: '/trip-expenses',
        });
      } catch { /* fire-and-forget */ }
    }
    return report;
  },

  /** Finance requests/assigns a new card to a team member, who is notified to fill it. */
  async requestCard(input: { workspaceId: string; userId: string; cardType?: ExpenseCardType; title: string; note?: string }): Promise<TripExpenseReport> {
    const { data, error } = await supabase.rpc('trip_expense_request_card', {
      p_workspace_id: input.workspaceId, p_user_id: input.userId,
      p_card_type: input.cardType ?? 'trip', p_title: input.title, p_note: input.note ?? null,
    });
    if (error) throw error;
    const report = data as TripExpenseReport;
    try {
      flowEventService.emit('expense_card_requested', {
        card_id: report.id,
        workspace_id: report.workspace_id,
        user_id: report.user_id,
        type: 'expense_card_requested',
        title: `Please fill an expense card: ${report.title}`,
        body: input.note ? `Finance asked you to complete an expense card. Note: ${input.note}` : 'Finance asked you to complete an expense card. Add your expenses and submit when ready.',
        action_url: '/trip-expenses',
      });
    } catch { /* fire-and-forget */ }
    return report;
  },

  async listAssignees(workspaceId: string): Promise<{ user_id: string; name: string; email: string | null }[]> {
    const { data, error } = await supabase.rpc('list_workspace_expense_assignees', { p_workspace_id: workspaceId });
    if (error) throw error;
    return (data ?? []) as { user_id: string; name: string; email: string | null }[];
  },

  // -------- Receipts + PDF (edge function, service-role) --------

  async uploadReceipt(itemId: string, file: File): Promise<{ receipt_path: string; signed_url: string }> {
    const data_base64 = await fileToBase64(file);
    const { data, error } = await supabase.functions.invoke('trip-expense-ops', {
      body: { action: 'upload_receipt', item_id: itemId, filename: file.name, content_type: file.type, data_base64 },
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || 'Upload failed');
    return { receipt_path: data.receipt_path, signed_url: data.signed_url };
  },

  async receiptUrl(itemId: string): Promise<string | null> {
    const { data, error } = await supabase.functions.invoke('trip-expense-ops', {
      body: { action: 'sign_receipt', item_id: itemId },
    });
    if (error) throw error;
    return data?.signed_url ?? null;
  },

  async generatePdf(reportId: string): Promise<{ pdf_url: string; pdf_storage_path: string }> {
    const { data, error } = await supabase.functions.invoke('trip-expense-ops', {
      body: { action: 'generate_pdf', report_id: reportId },
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || 'PDF generation failed');
    return { pdf_url: data.pdf_url, pdf_storage_path: data.pdf_storage_path };
  },
};

export type TripExpenseService = typeof tripExpenseService;
