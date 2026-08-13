/**
 * Operator-readable text for `generate_invoice_from_order`'s refusals.
 *
 * An order is a commercial document: it declares nothing, so it may carry 0% VAT for as long as it
 * stays an order. Generating the invoice is the step that turns that rate into a fiscal claim, and
 * myDATA requires an exemption cause (ΑΑΔΕ 1–31) on every vatCategory 7/8 line. So the SQL refuses
 * there, while it is still an order and still cheap to fix.
 *
 * The second refusal is the buyer's identity. AADE rejects a τιμολόγιο issued to a party with no
 * VAT number, so once the operator can PICK the document (Invoice / Retail receipt) that pick has
 * to be refused in the one place that can see the buyer — the RPC — rather than trusted from a
 * menu the browser rendered.
 *
 * Both `vat_exemption_required:` and `invoice_requires_vat_id:` are CONTRACTS, not prose — the
 * function raises them by name so the UI can recognise a refusal without string-matching a
 * sentence that may later be reworded or translated. Rename one on one side only and the operator
 * silently gets a raw Postgres error where they used to get the offending lines and what to do
 * about them; that is what
 * [tests/unit/invoiceVatGate.test.ts](tests/unit/invoiceVatGate.test.ts) is for.
 *
 * Lives in `utils/` rather than beside the RPC call because it is pure: importing `ordersService`
 * instantiates the Supabase client, which a unit test has no env for.
 */
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
