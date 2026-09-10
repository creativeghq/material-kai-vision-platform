/** Which platform events a TENANT may subscribe an outbound webhook to (#330). */
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
