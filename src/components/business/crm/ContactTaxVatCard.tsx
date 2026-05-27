import React from 'react';
import { Receipt, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';

/** ISO-3166 alpha-2 codes for VAT purposes. Greece uses 'EL' (not 'GR') in
 * the VIES system; we follow that convention so what the user types here can
 * be used directly against VIES / ΑΑΔΕ. The list covers EU + EEA + UK + CH +
 * the handful of non-EU countries we see in the platform. "Other" sits at the
 * end for manual entry of anything missing. */
const VAT_COUNTRY_OPTIONS: Array<{ code: string; name: string; eu: boolean }> = [
  { code: 'EL', name: 'Greece',          eu: true  },
  { code: 'AT', name: 'Austria',         eu: true  },
  { code: 'BE', name: 'Belgium',         eu: true  },
  { code: 'BG', name: 'Bulgaria',        eu: true  },
  { code: 'HR', name: 'Croatia',         eu: true  },
  { code: 'CY', name: 'Cyprus',          eu: true  },
  { code: 'CZ', name: 'Czech Republic',  eu: true  },
  { code: 'DK', name: 'Denmark',         eu: true  },
  { code: 'EE', name: 'Estonia',         eu: true  },
  { code: 'FI', name: 'Finland',         eu: true  },
  { code: 'FR', name: 'France',          eu: true  },
  { code: 'DE', name: 'Germany',         eu: true  },
  { code: 'HU', name: 'Hungary',         eu: true  },
  { code: 'IE', name: 'Ireland',         eu: true  },
  { code: 'IT', name: 'Italy',           eu: true  },
  { code: 'LV', name: 'Latvia',          eu: true  },
  { code: 'LT', name: 'Lithuania',       eu: true  },
  { code: 'LU', name: 'Luxembourg',      eu: true  },
  { code: 'MT', name: 'Malta',           eu: true  },
  { code: 'NL', name: 'Netherlands',     eu: true  },
  { code: 'PL', name: 'Poland',          eu: true  },
  { code: 'PT', name: 'Portugal',        eu: true  },
  { code: 'RO', name: 'Romania',         eu: true  },
  { code: 'SK', name: 'Slovakia',        eu: true  },
  { code: 'SI', name: 'Slovenia',        eu: true  },
  { code: 'ES', name: 'Spain',           eu: true  },
  { code: 'SE', name: 'Sweden',          eu: true  },
  { code: 'GB', name: 'United Kingdom',  eu: false },
  { code: 'CH', name: 'Switzerland',     eu: false },
  { code: 'NO', name: 'Norway',          eu: false },
  { code: 'IS', name: 'Iceland',         eu: false },
  { code: 'US', name: 'United States',   eu: false },
  { code: 'CA', name: 'Canada',          eu: false },
  { code: 'AU', name: 'Australia',       eu: false },
  { code: 'JP', name: 'Japan',           eu: false },
];

interface AttachedCompany {
  company_id?: string | null;
  company_name?: string | null;
  vat_number?: string | null;
  country_code?: string | null;
  is_primary?: boolean | null;
}

interface ContactTaxVatCardProps {
  vatNumber: string | null;
  countryCode: string | null;
  taxOffice: string | null;
  /** Companies attached to this contact via crm_company_contacts. Used to
      decide whether to show the "business VAT takes priority" banner. */
  attachedCompanies?: AttachedCompany[];
  onPatch: (updates: { vat_number?: string | null; country_code?: string | null; tax_office?: string | null }) => void;
}

export const ContactTaxVatCard: React.FC<ContactTaxVatCardProps> = ({
  vatNumber, countryCode, taxOffice, attachedCompanies = [], onPatch,
}) => {
  // Surface only companies that have an actual VAT to compare against.
  const companiesWithVat = attachedCompanies.filter((c) => !!c?.vat_number);
  const primaryBusiness = companiesWithVat.find((c) => c.is_primary) ?? companiesWithVat[0] ?? null;

  const [localVat, setLocalVat]     = React.useState(vatNumber ?? '');
  const [localTax, setLocalTax]     = React.useState(taxOffice ?? '');
  const vatFocused = React.useRef(false);
  const taxFocused = React.useRef(false);
  React.useEffect(() => { if (!vatFocused.current) setLocalVat(vatNumber ?? ''); }, [vatNumber]);
  React.useEffect(() => { if (!taxFocused.current) setLocalTax(taxOffice ?? ''); }, [taxOffice]);

  const handleVatBlur = () => {
    const trimmed = localVat.trim();
    if (trimmed === (vatNumber ?? '')) return;
    onPatch({ vat_number: trimmed === '' ? null : trimmed });
  };
  const handleTaxBlur = () => {
    const trimmed = localTax.trim();
    if (trimmed === (taxOffice ?? '')) return;
    onPatch({ tax_office: trimmed === '' ? null : trimmed });
  };
  const handleCountry = (v: string) => {
    onPatch({ country_code: v === '__unset' ? null : v });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Receipt className="h-4 w-4" />
          Tax &amp; VAT
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {primaryBusiness && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs flex items-start gap-2">
            <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-foreground">
                <span className="font-medium">Business VAT takes priority for invoicing.</span>{' '}
                This contact is attached to{' '}
                <span className="font-medium">
                  {primaryBusiness.company_name ?? '(unnamed business)'}
                </span>{' '}
                — invoices issued to this contact in a B2B context will use that company's VAT
                {primaryBusiness.vat_number && (
                  <>
                    {' '}(<span className="font-mono">{(primaryBusiness.country_code ?? '').toUpperCase()}{primaryBusiness.vat_number}</span>)
                  </>
                )}.
              </p>
              <p className="text-muted-foreground">
                The fields below are the contact's personal VAT — only used for B2C / sole-trader / self-employed invoicing.
              </p>
              {companiesWithVat.length > 1 && (
                <p className="text-muted-foreground">
                  +{companiesWithVat.length - 1} other attached business{companiesWithVat.length - 1 === 1 ? '' : 'es'} with VAT.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="vat_country">Country</Label>
            <Select
              value={countryCode || '__unset'}
              onValueChange={handleCountry}
            >
              <SelectTrigger id="vat_country">
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__unset">Not set</SelectItem>
                {VAT_COUNTRY_OPTIONS.map((o) => (
                  <SelectItem key={o.code} value={o.code}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] w-7">{o.code}</span>
                      <span>{o.name}</span>
                      {o.eu && <Badge variant="outline" className="text-[9px] py-0">EU</Badge>}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="vat_number">VAT number</Label>
            <Input
              id="vat_number"
              value={localVat}
              onChange={(e) => setLocalVat(e.target.value)}
              onFocus={() => { vatFocused.current = true; }}
              onBlur={() => { vatFocused.current = false; handleVatBlur(); }}
              placeholder="e.g. 123456789"
            />
            <p className="text-[10px] text-muted-foreground">
              Digits only or country-prefixed (e.g. <span className="font-mono">EL123456789</span>). Saved on blur.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tax_office">Tax office</Label>
          <Input
            id="tax_office"
            value={localTax}
            onChange={(e) => setLocalTax(e.target.value)}
            onFocus={() => { taxFocused.current = true; }}
            onBlur={() => { taxFocused.current = false; handleTaxBlur(); }}
            placeholder="Local tax authority (e.g. ΔΟΥ ΧΑΛΑΝΔΡΙΟΥ for GR)"
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default ContactTaxVatCard;
