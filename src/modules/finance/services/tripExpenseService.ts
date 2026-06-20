// Trip Cards (sales-team expense reports) — service surface.
//
// A trip card (`trip_expense_reports`) is owned by a sales rep and holds
// day-by-day expense lines (`trip_expense_items`), each with an optional
// receipt/invoice attachment. The rep builds it as a draft, submits it, and
// finance approves/rejects each line. On approval the workspace's
// `trip_expense_reimbursement_mode` setting decides whether a reimbursement
// payable is auto-posted (handled DB-side in trip_expense_review_item).
//
// CRUD goes straight to the tables under RLS. Status transitions + review go
// through SECURITY DEFINER RPCs. Receipt upload / signed URLs / PDF render go
// through the `trip-expense-ops` edge function (service role) because receipts
// live in the private pdf-documents bucket and finance (a different user than
// the rep) must be able to read them.

import { supabase } from '@/integrations/supabase/client';
import { flowEventService } from '@/services/flows/flowEventService';
import { formatMoney } from '@/modules/finance/services/financeService';

export type TripStatus =
  | 'draft' | 'submitted' | 'partially_approved' | 'approved' | 'rejected' | 'reimbursed';
export type ExpenseApproval = 'pending' | 'approved' | 'rejected';
export type ExpensePaymentMethod = 'cash' | 'card' | 'personal' | 'company_card' | 'other';

export const TRIP_EXPENSE_CATEGORIES = [
  'transport', 'fuel', 'hotel', 'meals', 'parking', 'tolls', 'supplies', 'other',
] as const;
export type TripExpenseCategory = (typeof TRIP_EXPENSE_CATEGORIES)[number];

export type ExpenseCardType = 'trip' | 'monthly' | 'other';

export const EXPENSE_CARD_TYPES: { value: ExpenseCardType; label: string }[] = [
  { value: 'trip', label: 'Trip' },
  { value: 'monthly', label: 'Monthly expenses' },
  { value: 'other', label: 'Other' },
];
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
  sort_order: number;
  created_at: string;
  updated_at: string;
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

  async addItem(input: CreateItemInput): Promise<TripExpenseItem> {
    const { data, error } = await supabase
      .from('trip_expense_items')
      .insert({
        report_id: input.report_id,
        expense_date: input.expense_date ?? new Date().toISOString().slice(0, 10),
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
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as TripExpenseItem;
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
