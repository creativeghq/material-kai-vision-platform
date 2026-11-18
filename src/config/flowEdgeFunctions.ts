export const FLOW_RUNNABLE_EDGE_FUNCTIONS = [
  { name: 'real-estate-listing-social', description: 'Draft a social post for a newly published listing, one per connected account' },
  { name: 'finance-digest-aggregate', description: 'Send finance digest emails and quote follow-up bell notifications' },
  { name: 'finance-send-invoice-email', description: 'Email an invoice or receipt with its PDF and the AADE verification link' },
  { name: 'finance-send-document-email', description: 'Email a credit note, delivery note or order with its PDF and online link' },
] as const;

export type FlowRunnableEdgeFunction = (typeof FLOW_RUNNABLE_EDGE_FUNCTIONS)[number]['name'];

export const FLOW_RUNNABLE_EDGE_FUNCTION_NAMES: ReadonlySet<string> = new Set(
  FLOW_RUNNABLE_EDGE_FUNCTIONS.map((f) => f.name),
);
