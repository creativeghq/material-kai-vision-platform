export const EINVOICE_READ_OUTCOMES = ['details_found', 'nothing_printed', 'unreachable', 'not_readable'] as const;

export type EinvoiceReadOutcome = (typeof EINVOICE_READ_OUTCOMES)[number];
