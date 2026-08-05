/**
 * Card→person expense attribution (#315): import Revolut card expenses into the HR
 * expense-report system, attributed to the right employee, receipt included.
 *
 * The chain is deterministic — no name matching:
 *   expense.card_id → card.holder_id → team member EMAIL → hr_employees (via the
 *   roster's CRM contact email) → user_id → that person's monthly "Revolut card"
 *   expense report (card_type 'monthly', created on demand) → trip_expense_items row
 *   (payment_method 'company_card', approval_status default 'pending' — the normal
 *   review flow applies) → receipt fetched from Revolut and stored exactly where the
 *   manual upload path puts it (pdf-documents / trip-expenses/…).
 *
 * `revolut_expenses` is the idempotency ledger: one row per Revolut expense id, ever.
 * An expense whose holder email matches no employee is recorded as `unmatched_person`
 * and NEVER silently invents a CRM/HR entity (Greek-name rule: entities are matched,
 * not created).
 */

// deno-lint-ignore-file no-explicit-any

import {
  getExpenseReceipt,
  listCards,
  listExpenses,
  listTeamMembers,
  issuerDomainFrom,
  type RevolutConfigRow,
} from './client.ts';

export interface ExpenseImportResult {
  ok: boolean;
  scanned: number;
  imported: number;
  unmatchedPerson: number;
  receipts: number;
  errors: string[];
}

function monthBounds(iso: string): { start: string; end: string; label: string } {
  const d = new Date(iso);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  const label = start.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), label };
}

/** Find-or-create the person's monthly Revolut-card report (draft, one per currency). */
async function ensureMonthlyReport(
  service: any,
  workspaceId: string,
  userId: string,
  currency: string,
  spentAt: string,
): Promise<string> {
  const { start, end, label } = monthBounds(spentAt);
  const title = `Revolut card — ${label}`;
  const { data: existing } = await service
    .from('trip_expense_reports')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .eq('card_type', 'monthly')
    .eq('currency', currency)
    .eq('trip_start', start)
    .eq('title', title)
    .maybeSingle();
  if (existing) return existing.id as string;
  const { data: created, error } = await service
    .from('trip_expense_reports')
    .insert({
      workspace_id: workspaceId,
      user_id: userId,
      title,
      purpose: 'Auto-imported Revolut card expenses',
      card_type: 'monthly',
      currency,
      status: 'draft',
      trip_start: start,
      trip_end: end,
    })
    .select('id')
    .single();
  if (error || !created) throw new Error(`report create failed: ${error?.message}`);
  return created.id as string;
}

/**
 * Card lifecycle guard (#315): an offboarded employee must not keep a live company
 * card. Freezes (never unfreezes — that stays a deliberate human action) every active
 * card whose holder's email maps to an employee with a past end_date or terminated
 * status. Runs with the cron sweep, so the window is at most ~6h.
 */
export async function enforceCardLifecycle(service: any, cfg: RevolutConfigRow): Promise<number> {
  const issuer = issuerDomainFrom(cfg.oauth_redirect_uri ?? '');
  const [members, cards] = await Promise.all([
    listTeamMembers(service, cfg, issuer),
    listCards(service, cfg, issuer),
  ]);
  const { data: gone } = await service
    .from('hr_employees')
    .select('id, status, end_date, contact:crm_contacts!crm_contact_id(email)')
    .eq('workspace_id', cfg.workspace_id)
    .or(`end_date.lte.${new Date().toISOString().slice(0, 10)},status.eq.terminated`);
  const goneEmails = new Set(
    ((gone ?? []) as any[])
      .map((r) => String(r.contact?.email ?? '').toLowerCase())
      .filter(Boolean),
  );
  if (goneEmails.size === 0) return 0;

  const memberIdsGone = new Set(
    members.filter((m) => goneEmails.has((m.email ?? '').toLowerCase())).map((m) => m.id),
  );
  let frozen = 0;
  for (const card of cards) {
    if (!card.holder_id || !memberIdsGone.has(card.holder_id)) continue;
    if (card.state === 'frozen' || card.state === 'terminated') continue;
    const { setCardFrozen } = await import('./client.ts');
    const res = await setCardFrozen(service, cfg, issuer, card.id, true);
    if (res.ok) {
      frozen++;
      console.warn(`[revolut/cards] froze card ${card.id} — holder is offboarded`);
    }
  }
  return frozen;
}

export async function importRevolutExpenses(service: any, cfg: RevolutConfigRow): Promise<ExpenseImportResult> {
  const result: ExpenseImportResult = { ok: true, scanned: 0, imported: 0, unmatchedPerson: 0, receipts: 0, errors: [] };
  const workspaceId = cfg.workspace_id;
  try {
    const issuer = issuerDomainFrom(cfg.oauth_redirect_uri ?? '');
    const [members, cards, expenses] = await Promise.all([
      listTeamMembers(service, cfg, issuer),
      listCards(service, cfg, issuer),
      listExpenses(service, cfg, issuer, { from: new Date(Date.now() - 90 * 24 * 3600_000).toISOString() }),
    ]);
    const emailByMember = new Map(members.map((m) => [m.id, (m.email ?? '').toLowerCase()]));
    const holderByCard = new Map(cards.map((c) => [c.id, c.holder_id ?? '']));

    // Roster: employee email (via CRM contact) → { employeeId, userId }.
    const { data: roster } = await service
      .from('hr_employees')
      .select('id, user_id, contact:crm_contacts!crm_contact_id(email)')
      .eq('workspace_id', workspaceId)
      .not('user_id', 'is', null);
    const personByEmail = new Map<string, { employeeId: string; userId: string }>();
    for (const r of (roster ?? []) as any[]) {
      const email = String(r.contact?.email ?? '').toLowerCase();
      if (email) personByEmail.set(email, { employeeId: r.id, userId: r.user_id });
    }

    const { data: seenRows } = await service
      .from('revolut_expenses')
      .select('revolut_expense_id')
      .eq('workspace_id', workspaceId);
    const seen = new Set((seenRows ?? []).map((r: any) => r.revolut_expense_id as string));

    for (const exp of expenses ?? []) {
      if (!exp?.id || seen.has(exp.id)) continue;
      result.scanned++;
      const cardId = exp.card_id ?? '';
      const email = emailByMember.get(holderByCard.get(cardId) ?? '') ?? '';
      const person = email ? personByEmail.get(email) : undefined;
      const amount = Math.abs(Number(exp.amount ?? 0));
      const currency = String(exp.currency ?? 'EUR').toUpperCase();
      const spentAt = exp.spent_at ?? new Date().toISOString();

      const ledger: Record<string, unknown> = {
        workspace_id: workspaceId,
        revolut_expense_id: exp.id,
        card_id: cardId || null,
        holder_member_id: holderByCard.get(cardId) || null,
        holder_email: email || null,
        merchant: exp.merchant?.name ?? null,
        amount, currency,
        spent_at: spentAt,
        state: exp.state ?? null,
      };

      if (!person) {
        result.unmatchedPerson++;
        await service.from('revolut_expenses').insert({ ...ledger, import_status: 'unmatched_person' });
        continue;
      }

      try {
        const reportId = await ensureMonthlyReport(service, workspaceId, person.userId, currency, spentAt);
        const { data: item, error: itemErr } = await service
          .from('trip_expense_items')
          .insert({
            report_id: reportId,
            workspace_id: workspaceId,
            expense_date: String(spentAt).slice(0, 10),
            category: 'other',
            description: `${exp.merchant?.name ?? 'Card expense'} (Revolut ${exp.id.slice(0, 8)})`,
            vendor: exp.merchant?.name ?? null,
            amount, currency,
            payment_method: 'company_card',
          })
          .select('id')
          .single();
        if (itemErr || !item) throw new Error(`item insert failed: ${itemErr?.message}`);

        // Receipt: same bucket + path scheme as the manual upload path, so signing,
        // PDF rendering and storage-GC treat it identically.
        let receiptImported = false;
        const receipt = (exp.receipts ?? [])[0];
        if (receipt?.id) {
          try {
            const { bytes, contentType } = await getExpenseReceipt(service, cfg, issuer, exp.id, receipt.id);
            const ext = contentType.includes('pdf') ? 'pdf' : contentType.includes('png') ? 'png' : 'jpg';
            const path = `trip-expenses/${reportId}/${item.id}-${Date.parse(spentAt)}.${ext}`;
            const { error: upErr } = await service.storage.from('pdf-documents')
              .upload(path, bytes, { contentType, upsert: true });
            if (!upErr) {
              await service.from('trip_expense_items').update({
                receipt_bucket: 'pdf-documents',
                receipt_path: path,
                receipt_name: receipt.file_name ?? `receipt-${exp.id.slice(0, 8)}.${ext}`,
                receipt_mime: contentType,
              }).eq('id', item.id);
              receiptImported = true;
              result.receipts++;
            }
          } catch (err) {
            console.warn('[revolut/expenses] receipt import skipped:', err instanceof Error ? err.message : err);
          }
        }

        await service.from('revolut_expenses').insert({
          ...ledger,
          matched_user_id: person.userId,
          hr_employee_id: person.employeeId,
          report_id: reportId,
          item_id: item.id,
          receipt_imported: receiptImported,
          import_status: 'imported',
        });
        result.imported++;
      } catch (err) {
        result.errors.push(`${exp.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    result.ok = false;
    result.errors.push(err instanceof Error ? err.message : String(err));
  }
  return result;
}
