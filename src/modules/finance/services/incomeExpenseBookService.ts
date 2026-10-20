/** Βιβλίο Εσόδων-Εξόδων: every document AADE holds for the period, laid out by `get_income_expense_book`. */
import { supabase } from '@/integrations/supabase/client';

export type BookDirection = 'income' | 'expense';

export interface BookColumn {
  key: string;
  label: string;
  label_el: string;
}

export interface BookFigures {
  total: number;
  net: number;
  vat: number;
  withheld: number;
  cols: Record<string, number>;
}

export interface BookRow extends BookFigures {
  mark: string;
  issue_date: string;
  doc_type: string;
  number: string | null;
  party: string;
  party_vat: string | null;
  /** Where the column split came from. null = nothing classified it. */
  classified_by: 'aade_e3' | 'document' | 'origin' | null;
}

export type AadeCheck =
  | { status: 'matches' | 'differs'; aade_net: number; book_net: number; difference: number }
  | { status: 'not_fetched' | string };

export interface BookMonth {
  month: string;
  rows: BookRow[];
  totals: BookFigures & { docs: number };
  /** Running total from the start of the period through this month (Σε μεταφορά). */
  carried: BookFigures;
  aade_check: AadeCheck;
}

export interface BookSide {
  columns: BookColumn[];
  months: BookMonth[];
  totals: BookFigures & { docs: number; unclassified_docs: number };
}

export interface IncomeExpenseBook {
  from: string;
  to: string;
  business: { name: string | null; vat: string | null; tax_office: string | null } | null;
  income: BookSide;
  expense: BookSide;
  sources: {
    issued_documents: { count: number; fetched_at: string | null };
    classifications: { count: number; fetched_at: string | null };
  };
}

export const incomeExpenseBookService = {
  async load(workspaceId: string, from: string, to: string): Promise<IncomeExpenseBook> {
    const { data, error } = await supabase.rpc('get_income_expense_book' as never, {
      p_workspace_id: workspaceId, p_from: from, p_to: to,
    } as never);
    if (error) throw new Error(error.message);
    return data as unknown as IncomeExpenseBook;
  },
};
