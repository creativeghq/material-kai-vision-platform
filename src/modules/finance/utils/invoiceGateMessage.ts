/** Operator-readable text for `generate_invoice_from_order`'s refusals. */
export function invoiceGenerationErrorMessage(err: unknown): string {
  const raw = (err as { message?: unknown } | null)?.message != null
    ? String((err as { message?: unknown }).message)
    : String(err ?? '');
  const gate = raw.match(/vat_exemption_required:\s*(.*)$/s);
  if (gate) {
    // Both places the cause may live are named: a permanently exempt buyer should get a standing
    // reason on their CRM record, not the same code re-entered on every future order.
    return `${gate[1].trim()} — myDATA requires an exemption cause on every 0% line. Set the reason on the line, or record a standing one on the customer.`;
  }
  const buyer = raw.match(/invoice_requires_vat_id:\s*(.*)$/s);
  if (buyer) {
    return `${buyer[1].trim()} Add their ΑΦΜ on the CRM record if they are a business.`;
  }
  return raw;
}
