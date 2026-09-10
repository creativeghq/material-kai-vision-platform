import React from 'react';
import { MapPin, ExternalLink } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import {
  googleMapsUrl, formatAddressOneLine, type AddressLike,
} from '@/utils/address';

interface Props {
  address: AddressLike | null | undefined;
  /** Known Google listing ids — Maps then opens THAT place, not its guess at the text. */
  placeId?: string | null;
  cid?: string | null;
  /** A surveyed point (property listings carry one). Beats the address text. */
  lat?: number | string | null;
  lng?: number | string | null;
  /** `icon` = a bare pin for a dense row; `button` = an outline button with a label. */
  variant?: 'icon' | 'button';
  label?: string;
  className?: string;
}

/** "Show this address on Google Maps." */
export const AddressMapLink: React.FC<Props> = ({
  address, placeId, cid, lat, lng, variant = 'icon', label = 'Map', className,
}) => {
  const href = googleMapsUrl(address, { place_id: placeId, cid, lat, lng });
  if (!href) return null;

  const title = `Open on Google Maps — ${formatAddressOneLine(address ?? {}) || 'this listing'}`;

  if (variant === 'button') {
    return (
      <Button asChild size="sm" variant="outline" className={className}>
        <a href={href} target="_blank" rel="noopener noreferrer" title={title}>
          <MapPin className="h-4 w-4" />
          {label}
          <ExternalLink className="h-3 w-3 opacity-60" />
        </a>
      </Button>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      aria-label={title}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-primary ${className ?? ''}`}
    >
      <MapPin className="h-4 w-4" />
    </a>
  );
};

export default AddressMapLink;
