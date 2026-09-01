/**
 * Which platform events a TENANT may subscribe an outbound webhook to (#330).
 *
 * A deliberate subset of the Flows `TriggerType` union, not the whole thing. Two filters:
 *
 *  1. **Is it the tenant's own business fact?** "My invoice was issued", "my order shipped",
 *     "my legal document was refused" — yes. Platform-internal events (role upgrades, module
 *     access, agent failures) describe OUR operations, not theirs.
 *  2. **Is one delivery per occurrence sane?** `email_opened` / `email_clicked` fire per
 *     recipient per open. Subscribing an endpoint to those turns one campaign into thousands of
 *     signed POSTs, and the first thing it does is take the tenant's own server down.
 *
 * `fiscal_credits_low` is excluded specifically: it is about the OPERATOR's provider credit
 * pool, not any tenant's business, and it happens to be emitted into the root workspace — which
 * would make it subscribable by exactly one workspace and confusing for everyone.
 *
 * Every value MUST exist in the `TriggerType` union in `src/services/flows/types.ts`. A value
 * that does not is a subscription nothing will ever fire, which looks identical to a broken
 * endpoint from the tenant's side. Held by tests/unit/webhookEventVocabulary.test.ts — the
 * two files cannot import each other across the Deno/Vite boundary, so a test is the only
 * thing that can enforce it.
 */
export const SUBSCRIBABLE_EVENT_TYPES: string[] = [
  // Money in and out
  'invoice_issued',
  'receipt_issued',
  'invoice_paid',
  'payment_received',
  'payment_sent',
  'payment_reversed',
  // A legal document did not land on myDATA — the tenant's accounting system wants to know
  // immediately, because the series number is burned.
  'fiscal_document_rejected',
  // Orders
  'order_created',
  'order_status_changed',
  'order_dispatched',
  'upstream_order_created',
  // Quotes and contracts
  'quote_sent',
  'quote_approved',
  'quote_rejected',
  'contract_signed',
  // Purchasing
  'purchase_order.sent',
  'purchase_order.received',
  'supplier_po_received',
  'rfq_lines_requested',
  'rfq_lines_priced',
  // Stock
  'inventory_low_stock',
  // CRM
  'crm_contact_created',
  'crm_company_created',
  // Projects / client-facing
  'project_task_overdue',
  'project_created',
  'project_task_completed',
  'project_milestone_reached',
  'project_snag_raised',
  'project_expense_approved',
  'project_delivery_issued',
  'project_asset_registered',
  'project_status_changed',
  'project_request_raised',
  'project_request_answered',
  'client_view_feedback_received',
  'appointment_booked',
];
