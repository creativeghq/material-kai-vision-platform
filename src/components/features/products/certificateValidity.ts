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
