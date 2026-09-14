/**
 * The reduced-rate territories, as postcode prefixes (#443) — ν.5246/2025.
 *
 * Here so the list can be CHECKED against ELTA rather than trusted: the rate follows where the
 * goods land, a wrong one is a valid percentage, and nothing downstream can catch it. Effective
 * dates are shown because a 2025 invoice is rated by the 2025 rule.
 */
import React, { useEffect, useState } from 'react';
import { Loader2, AlertTriangle, Ship } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import { islandVatService } from '@/modules/finance/services/islandVatService';

interface TerritoryRow {
  postcode_prefix: string;
  territory: string | null;
  region: string | null;
  effective_from: string | null;
  effective_to: string | null;
}

export const IslandVatTerritoriesCard: React.FC = () => {
  const [rows, setRows] = useState<TerritoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    islandVatService.territories()
      .then((r) => { if (!cancelled) { setRows(r as unknown as TerritoryRow[]); setFailed(false); } })
      .catch(() => { if (!cancelled) { setRows([]); setFailed(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Ship className="h-4 w-4 text-primary" /> Island VAT territories
        </CardTitle>
        <CardDescription>
          The rate follows where the goods are DELIVERED, not who the customer is. This is the list
          the derivation matches against — check it against ELTA rather than taking it on trust.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading the territory list…
          </p>
        )}
        {!loading && failed && (
          <p className="flex items-start gap-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The territory list could not be read just now. That is not a statement that it is empty.
          </p>
        )}
        {!loading && !failed && rows.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No reduced-rate territories are on record, so every destination classifies as mainland.
          </p>
        )}
        {rows.length > 0 && (
          <div className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Postcode prefix</TableHead>
                  <TableHead>Territory</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>In force</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={`${r.postcode_prefix}:${r.effective_from ?? ''}`}>
                    <TableCell className="tabular-nums">{r.postcode_prefix}</TableCell>
                    <TableCell>{r.territory ?? '—'}</TableCell>
                    <TableCell>{r.region ?? '—'}</TableCell>
                    <TableCell className="tabular-nums">
                      {r.effective_from ?? '—'}{r.effective_to ? ` → ${r.effective_to}` : ''}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
