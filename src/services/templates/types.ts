import type { LucideIcon } from 'lucide-react';
import type { Capability } from '@/auth/capabilities';

/**
 * Universal entity templates (issue #322) — the adapter contract.
 *
 * A template is a NAMED, reusable starting point for a record: "50% deposit invoice",
 * "Interior fit-out project", "Client presentation moodboard". It generalizes what #242 built
 * for blueprints only, and replaces the scattered "duplicate this record" buttons
 * (`financeService.duplicateInvoice`, `ordersService.duplicate`, `moodboardSheetsService.duplicate`)
 * which can only copy something you already made.
 *
 * ONE table (`entity_templates`) discriminated by `entity_type`; the per-type knowledge lives
 * here, in one adapter each. Adding a type = one adapter + one value in the DB CHECK constraint
 * `entity_templates_entity_type_check` — a two-copy system, so it is guarded by
 * tests/unit/templateRegistry.test.ts.
 */

/** Must stay identical to the DB CHECK `entity_templates_entity_type_check`. */
export type TemplateEntityType =
  | 'invoice'
  | 'quote'
  | 'project'
  | 'moodboard'
  | 'order'
  | 'contract'
  | 'expense'
  | 'hr_onboarding'
  | 'crm_company'
  | 'property_listing';

/**
 * Field-name fragments a template payload must NEVER carry, whatever the entity.
 *
 * Three separate hazards, one list:
 *  - **identity / state** — ids, owners, `status`, timestamps. A template that carries them
 *    re-creates a record that claims to be the original.
 *  - **fiscal / secrets** — `fiscal_*`, `legal_number`, MARK, `*_token`. A myDATA-transmitted
 *    invoice cloned WITH its mark is a fake legal document; a cloned share token grants a
 *    stranger access to the new record.
 *  - **derived money** — `total`, `vat_amount`, `amount_paid`, … Storing a computed total in a
 *    template is a second derivation of a money quantity, exactly the shape
 *    tests/unit/moneyDerivation.test.ts exists to stop. Lines are captured; totals are recomputed
 *    by the ordinary create path.
 *
 * Enforced against every adapter's declared fields by tests/unit/templateRegistry.test.ts.
 */
export const FORBIDDEN_CAPTURE_FIELDS = [
  // identity / ownership / lifecycle
  'id', 'workspace_id', 'user_id', 'created_by', 'updated_by', 'created_at', 'updated_at',
  'status', 'last_activity_at', 'completed_at', 'accepted_at', 'rejected_at', 'issued_at',
  'due_at', 'paid_at', 'submitted_at', 'signed_at', 'sent_at', 'deleted_at',
  // fiscal / legal / secrets
  'fiscal_status', 'fiscal_mark', 'fiscal_uid', 'fiscal_qr_url', 'fiscal_connector_slug',
  'fiscal_submitted_at', 'legal_number', 'internal_number', 'series', 'series_number',
  'quote_number', 'order_number', 'pay_token', 'sign_token', 'public_share_token',
  'keep_active_token', 'stripe_payment_intent_id', 'stripe_checkout_session_id',
  // derived money — recomputed by the create path, never stored
  'subtotal', 'subtotal_net', 'vat_amount', 'total', 'grand_total', 'amount_paid', 'amount_due',
  'amount_credited', 'actual_amount', 'line_total', 'line_cost', 'line_margin', 'net_value',
  'extras_total', 'total_withheld_amount', 'total_fees_amount', 'total_stamp_duty_amount',
  'total_other_taxes_amount', 'total_deductions_amount',
] as const;

/** A scalar default the generic template editor can edit without a bespoke per-type form. */
export interface TemplateEditableField {
  key: string;
  label: string;
  kind: 'text' | 'textarea' | 'number' | 'boolean';
  /** Shown under the input. Keep it short. */
  hint?: string;
}

/** A child collection captured alongside the parent record (invoice lines, project tasks, …). */
export interface TemplateChildSpec {
  /** Postgres table the children live in. */
  table: string;
  /** FK column on the child pointing at the parent. */
  fk: string;
  /** Allowlisted child columns. Same forbidden-field rules as the parent. */
  fields: readonly string[];
  /** Column to order by when capturing. */
  orderBy?: string;
  /** Human label for the editor ("Line items", "Tasks"). */
  label: string;
  /**
   * Self-referencing children (a task tree). The two columns are read to rebuild the shape and
   * then discarded: the payload stores `parent_index` — a position in this array — so nesting
   * survives without a uuid ever entering the template.
   */
  hierarchy?: { idField: string; parentField: string };
}

/** What happens when a user picks a template. */
export type TemplateApplyResult =
  /** The record was created outright — navigate to it. */
  | { kind: 'created'; id: string; route: string; message?: string }
  /**
   * No record was created: the module's own create form opens pre-filled.
   *
   * Money documents take this path on purpose. `ordersService.reorderPrefill` already argues it
   * for re-orders: inserting the row behind the scenes skips numbering, buyer-risk checks,
   * myDATA classification and notifications that the real form fires. An invoice conjured from a
   * template without the operator confirming the customer is a legal document nobody approved.
   */
  | { kind: 'prefill'; route: string; message?: string }
  /**
   * An existing record was updated from the template — no new row.
   *
   * `crm_company` works this way: a CRM party must be found or created through the duplicate
   * search, never conjured by a template, so what a company template usefully carries is the
   * COMMERCIAL TERMS you apply to a company you already have.
   */
  | { kind: 'applied'; id: string; route: string; message?: string };

export interface TemplateApplyContext {
  /** The template being applied — prefill routes need it to deep-link back to the payload. */
  templateId: string;
  workspaceId: string;
  userId: string;
  /** Title/name override typed by the user in the picker. */
  title?: string;
  /** Optional parent to attach the new record to (e.g. create the moodboard inside a project). */
  projectId?: string | null;
  /**
   * Party the new record is for. Never captured INTO a template — a template is a shape, not a
   * customer relationship — but the create form that applies one usually knows who it is for.
   */
  customer?: { companyId?: string | null; contactId?: string | null };
  /** The employee an onboarding checklist is applied to. Never captured — a checklist is generic. */
  hrEmployeeId?: string | null;
}

export interface TemplateAdapter<P = Record<string, unknown>> {
  type: TemplateEntityType;
  /** Singular label — "Invoice". */
  label: string;
  /** Plural label — "Invoices". */
  plural: string;
  icon: LucideIcon;
  /** One-liner for the library card. */
  description: string;
  /** Hide the type from users whose persona lacks this capability. */
  capability?: Capability;
  /** Hide the type when the workspace has not bought this module. */
  moduleSlug?: string;
  /** Allowlisted parent columns — the ONLY parent fields ever written into `payload`. */
  captureFields: readonly string[];
  captureChildren?: readonly TemplateChildSpec[];
  editableFields?: readonly TemplateEditableField[];
  /** Table the parent record lives in (used by the generic capture). */
  sourceTable: string;
  /** Read a real record into a payload. RLS-gated — the caller can only capture what they can read. */
  capture(sourceId: string): Promise<P>;
  /**
   * Turn a payload into a record (or a pre-filled form).
   *
   * MUST build an explicit object literal. Never `...payload` into `.insert()` — the payload is
   * stored jsonb and is untrusted input (security invariant 8). A semgrep rule enforces this.
   */
  apply(payload: P, ctx: TemplateApplyContext): Promise<TemplateApplyResult>;
  /** Short facts for the library card: ["6 lines", "EUR", "24% VAT"]. */
  summary(payload: P): string[];
}
