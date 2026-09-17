export type CertificateValidity =
  | 'valid'
  | 'expiring_soon'
  | 'expired'
  | 'no_expiry_stated';

export type ValidityTone = 'success' | 'warning' | 'error' | 'neutral';

export interface ValidityPresentation {
  label: string;
  tone: ValidityTone;
  known: boolean;
}

const PRESENTATION: Record<CertificateValidity, Omit<ValidityPresentation, 'known'>> = {
  valid: { label: 'Valid', tone: 'success' },
  expiring_soon: { label: 'Expiring soon', tone: 'warning' },
  expired: { label: 'Expired', tone: 'error' },
  no_expiry_stated: { label: 'No expiry stated', tone: 'neutral' },
};

/** SQL decides; this only formats. An unrecognised verdict reads Unknown, never Valid. */
export function presentValidity(status: string | null | undefined): ValidityPresentation {
  const hit = status ? PRESENTATION[status as CertificateValidity] : undefined;
  if (!hit) return { label: 'Unknown', tone: 'neutral', known: false };
  return { ...hit, known: true };
}

export function needsAttention(status: string | null | undefined): boolean {
  return status === 'expired' || status === 'expiring_soon';
}

export interface CertificateDraft {
  id?: string;
  standard: string;
  certificate_number: string;
  issuer: string;
  scope: string;
  result: string;
  valid_from: string;
  valid_until: string;
  notes: string;
}

export interface CertificateCandidate {
  standard: string;
  certificate_number: string | null;
  issuer: string | null;
  scope: string | null;
  valid_from: string | null;
  valid_until: string | null;
}

export const emptyDraft = (standard = ''): CertificateDraft => ({
  standard, certificate_number: '', issuer: '', scope: '', result: '',
  valid_from: '', valid_until: '', notes: '',
});

/** A field the extractor could not read stays BLANK — a guessed expiry is worse than none. */
export function draftFromCandidate(c: CertificateCandidate): CertificateDraft {
  return {
    standard: c.standard,
    certificate_number: c.certificate_number ?? '',
    issuer: c.issuer ?? '',
    scope: c.scope ?? '',
    result: '',
    valid_from: c.valid_from ?? '',
    valid_until: c.valid_until ?? '',
    notes: '',
  };
}
