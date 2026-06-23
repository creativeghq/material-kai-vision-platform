import React from 'react';
import { Receipt } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { VAT_COUNTRY_OPTIONS } from '@/lib/vatCountries';

interface ContactTaxVatCardProps {
  vatNumber: string | null;
  countryCode: string | null;
  taxOffice: string | null;
  onPatch: (updates: { vat_number?: string | null; country_code?: string | null; tax_office?: string | null }) => void;
}

/**
 * Tax & VAT for a contact's OWN identity (B2C / sole-trader / self-employed).
 * Only rendered for contacts NOT attached to a business — a contact that belongs
 * to a company is invoiced under the company's VAT, so this card is hidden there.
 */
export const ContactTaxVatCard: React.FC<ContactTaxVatCardProps> = ({
  vatNumber, countryCode, taxOffice, onPatch,
}) => {
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="vat_country">Country</Label>
            <Select value={countryCode || '__unset'} onValueChange={handleCountry}>
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
            placeholder="Local tax authority (e.g. Tax Office Chalandriou for GR)"
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default ContactTaxVatCard;
