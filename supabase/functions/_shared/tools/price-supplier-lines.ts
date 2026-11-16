export function supplierLinesNote(
  lines: ReadonlyArray<{ supplier: string }>,
  resolved: ReadonlyArray<{ supplier: string }>,
): string | undefined {
  if (lines.length === 0) return undefined;
  if (resolved.length === 0) {
    return 'The query names a supplier but no price row matched the other words. Do NOT guess a price: list these product lines and ask which product (name or size) is meant.';
  }
  const present = new Set(resolved.map((r) => r.supplier));
  const missing = [...new Set(lines.map((l) => l.supplier))].filter((s) => !present.has(s));
  if (missing.length > 0) {
    const names = missing.join(', ');
    return `The query names ${names}, whose price list IS on file, and none of the resolved prices are from it. If a resolved row is the exact product asked for, answer from it. Otherwise never say there is no price list for ${names}: look up again with the matching collection name or code from these examples (a series is often filed under a code), or show them and ask which is meant.`;
  }
  return 'Resolved prices are capped per price list. examples lists the collections this supplier prices in the size asked for; a series is often filed under a collection CODE, so if the product asked for is not among the resolved prices, look for it here before saying it is not priced.';
}
