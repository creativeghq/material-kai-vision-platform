/**
 * How a project row is READ on a list surface — the client line, the deadline verdict, the
 * budget figures. The card and the table render the same row two ways and must not disagree
 * about what it says, so both format from here.
 */
import { formatDate } from '@/utils/datetime';
import type { ProjectWithClient } from '../services/projectsService';
import type { ProjectCoverInput } from './projectCover';

/** The fields the cover ladder reads, lifted off a project row. */
export function projectCoverInput(p: ProjectWithClient): ProjectCoverInput {
  return {
    name: p.name,
    description: p.description,
    categoryKey: p.category?.key ?? null,
    categoryLabel: p.category?.label ?? null,
    roomTypes: p.rooms?.map((r) => r.room_type) ?? null,
    cover_image_url: p.cover_image_url,
  };
}

export interface ProjectClientLabel {
  kind: 'company' | 'contact' | null;
  label: string | null;
}

export function projectClientLabel(p: ProjectWithClient): ProjectClientLabel {
  if (p.client_company?.name) return { kind: 'company', label: p.client_company.name };
  if (p.client_contact) {
    const c = p.client_contact;
    const name = c.name || [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.email || null;
    return { kind: 'contact', label: name };
  }
  return { kind: null, label: null };
}

/** Whole days from the viewer's local midnight to the deadline; null without one. */
export function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const target = new Date(date);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export type DeadlineTone = 'overdue' | 'soon' | 'normal';

export interface DeadlineVerdict {
  label: string;
  tone: DeadlineTone;
  days: number;
}

/**
 * The deadline as a verdict, not a date: overdue and this-week are what a list is scanned
 * for; a date further out is just a date.
 */
export function describeDeadline(deadline: string | null | undefined): DeadlineVerdict | null {
  const days = daysUntil(deadline);
  if (days === null || !deadline) return null;
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, tone: 'overdue', days };
  if (days === 0) return { label: 'Due today', tone: 'soon', days };
  if (days <= 7) return { label: `${days}d left`, tone: 'soon', days };
  return { label: `Due ${formatDate(deadline)}`, tone: 'normal', days };
}

/**
 * Text colour per verdict. A light/dark PAIR for the amber step, because a bare `-300` is
 * chosen for plum-black and measures ~1.2:1 on cream (tests/unit/inboxChipContrast.test.ts).
 */
export const DEADLINE_TONE_CLASS: Record<DeadlineTone, string> = {
  overdue: 'text-destructive',
  soon: 'text-amber-800 dark:text-amber-300',
  normal: 'text-muted-foreground',
};

export interface BudgetFigures {
  budget: number;
  actual: number;
  /** 0–100, clamped. */
  pct: number;
  overBudget: boolean;
}

/**
 * The cached `actual_amount` is the accepted-quote spend the DB maintains on the row; this only
 * formats it against the budget. No re-derivation of a money quantity here (CLAUDE.md, rule 1).
 */
export function budgetFigures(p: Pick<ProjectWithClient, 'budget_amount' | 'actual_amount'>): BudgetFigures {
  const budget = Number(p.budget_amount) || 0;
  const actual = Number(p.actual_amount) || 0;
  const pct = budget > 0 ? Math.min(100, Math.round((actual / budget) * 100)) : 0;
  return { budget, actual, pct, overBudget: budget > 0 && actual > budget };
}
