// Presentation helpers shared by the public careers board and the job detail page.
import { Building2 } from 'lucide-react';
import type { CareersJobSummary, CompanyProfile, CompensationBand } from '@/services/publicCareersService';

export const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: 'Full time', part_time: 'Part time', contractor: 'Contractor',
};
export const LOCATION_TYPE_LABELS: Record<string, string> = {
  onsite: 'On-site', hybrid: 'Hybrid', remote: 'Remote',
};

/** "Remote" wins as the headline location type; fall back to the legacy `remote` boolean. */
export function locationTypeLabel(j: Pick<CareersJobSummary, 'location_type' | 'remote'>): string | null {
  if (j.location_type) return LOCATION_TYPE_LABELS[j.location_type] ?? j.location_type;
  return j.remote ? 'Remote' : null;
}

const money = (n: number, currency: string) => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'EUR', maximumFractionDigits: 0 }).format(n);
  } catch { return `${n.toLocaleString()} ${currency}`.trim(); }
};

/** "€90,000 – €122,000" / "From €90,000" / "Up to €122,000". */
export function rangeLabel(min: number | null, max: number | null, currency: string | null): string | null {
  const c = currency || 'EUR';
  if (min != null && max != null) return `${money(min, c)} – ${money(max, c)}`;
  if (min != null) return `From ${money(min, c)}`;
  if (max != null) return `Up to ${money(max, c)}`;
  return null;
}

export function bandLabel(b: CompensationBand): string | null {
  const base = rangeLabel(b.min, b.max, b.currency);
  const extras = [b.equity ? 'Offers Equity' : null, b.bonus ? 'Offers Bonus' : null, b.note].filter(Boolean);
  return [base, ...extras].filter(Boolean).join(' • ') || null;
}

/**
 * One salary line for the board card: the first compensation band if the employer configured
 * the multi-region table, else the legacy flat salary_min/max.
 */
export function summarySalary(j: CareersJobSummary): string | null {
  const first = j.compensation?.[0];
  if (first) return rangeLabel(first.min, first.max, first.currency);
  return rangeLabel(j.salary_min, j.salary_max, j.currency);
}

/** "Athens · Remote · Full time" */
export function metaLine(j: CareersJobSummary): string {
  return [j.department, j.location, locationTypeLabel(j), j.employment_type ? EMPLOYMENT_LABELS[j.employment_type] ?? j.employment_type : null]
    .filter(Boolean).join(' · ');
}

export function CompanyHeader({ company, onHome }: { company: CompanyProfile; onHome?: () => void }) {
  return (
    <div className="flex items-center gap-3">
      {company.logo_url ? (
        <img src={company.logo_url} alt={company.name} className="h-11 w-11 rounded-xl object-contain bg-card border border-border/60" />
      ) : (
        <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <Building2 className="h-6 w-6 text-primary" />
        </div>
      )}
      <div className="min-w-0">
        {onHome ? (
          <button onClick={onHome} className="text-left text-xl font-display font-semibold hover:text-primary transition-colors truncate block">
            {company.name}
          </button>
        ) : (
          <h1 className="text-2xl font-display font-semibold truncate">{company.name}</h1>
        )}
        {company.tagline && <p className="text-sm text-muted-foreground line-clamp-1">{company.tagline}</p>}
      </div>
    </div>
  );
}
