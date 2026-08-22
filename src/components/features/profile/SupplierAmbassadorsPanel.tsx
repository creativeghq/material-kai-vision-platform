/**
 * "Who promotes my brand" — the supplier's side of an ambassadorship, and the only thing a brand
 * gets out of one. There is nothing to approve here: a professional who picked this company off
 * the platform's supplier list is already promoting it on their public profile. This says who
 * they are, what they promote it FOR, and how much reach that profile has.
 *
 * Read through `list_supplier_brand_ambassadors`, which checks workspace membership against the
 * JWT and only ever returns PUBLIC profiles — a private profile is not promoting anything yet.
 *
 * Renders inside the Supplier Portal (Profile → Supplier Portal, Finance → Payables,
 * /supplier-portal), which is where a claimed supplier already looks at its own numbers.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, BadgeCheck, Eye, Loader2, MapPin, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/core/ui/avatar';
import { HubEmptyState, HubStatGrid, HubStatTile } from '@/components/core/hub';
import { UPLOAD_CATEGORIES, categoryDisplayName } from '@/lib/categoryFieldRegistry';
import { initials, PROFESSIONAL_TYPE_LABELS } from '@/lib/materialCategories';
import { relationshipDef } from '@/lib/ambassadorships';
import {
  listSupplierBrandAmbassadors, type SupplierBrandAmbassador,
} from '@/services/ambassadorService';
import { formatDate } from '@/utils/datetime';

export const SupplierAmbassadorsPanel: React.FC<{ workspaceId: string | null }> = ({ workspaceId }) => {
  const [rows, setRows] = useState<SupplierBrandAmbassador[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      setRows(await listSupplierBrandAmbassadors(workspaceId));
    } catch (e) {
      // NOT swallowed into the empty state. A workspace with no claim returns zero ROWS, so an
      // error here means the read itself is broken — and "nobody promotes you" is exactly what a
      // broken read looks like if you let it fall through. (It already happened once: the RPC
      // declared `text` for a varchar column and raised on every call.)
      setRows([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  /** Per-category counts, in registry order — "who covers me where". */
  const byCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      for (const k of r.category_keys) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return UPLOAD_CATEGORIES
      .filter((k) => counts.has(k))
      .map((k) => ({ key: k, label: categoryDisplayName(k), count: counts.get(k) ?? 0 }));
  }, [rows]);

  const reach = rows.reduce((s, r) => s + (r.ambassador_profile_views || 0), 0);

  if (loading) {
    return (
      <Card className="dashboard-card border-0">
        <CardContent className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading ambassadors…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="dashboard-card border-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-medium">
          <BadgeCheck className="h-4 w-4 text-primary" />Who promotes your brand
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Professionals who list you on their public profile, and the categories they promote you in.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">Could not load your ambassadors.</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <HubEmptyState
            icon={Users}
            title="Nobody lists your brand yet"
            description="When a professional picks your company off the supplier list and adds it to their profile, they appear here — no approval needed on either side."
          />
        ) : (
          <>
            <HubStatGrid>
              <HubStatTile label="Ambassadors" category="PROFILES" value={rows.length} />
              <HubStatTile
                label="Categories" category="THEY PROMOTE YOU IN" value={byCategory.length}
                help="Distinct material categories across every profile listing you."
              />
              <HubStatTile
                label="Profile views" category="COMBINED REACH" value={reach}
                help="Total views of the public profiles that list you. Their audience, not yours."
              />
            </HubStatGrid>

            {byCategory.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {byCategory.map((c) => (
                  <Badge key={c.key} variant="neutral" className="text-[11px]">
                    {c.label}<span className="ml-1 opacity-60 tabular-nums">{c.count}</span>
                  </Badge>
                ))}
              </div>
            )}

            <div className="space-y-3">
              {rows.map((r) => (
                <div key={r.id} className="rounded-lg border border-hairline p-4 space-y-2">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={r.ambassador_avatar_url ?? undefined} />
                      <AvatarFallback className="text-xs">{initials(r.ambassador_name ?? '?')}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        <Link to={`/u/${r.ambassador_user_id}`} className="hover:underline">
                          {r.ambassador_name || 'A professional'}
                        </Link>
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {[
                          r.ambassador_company,
                          r.ambassador_professional_type
                            ? PROFESSIONAL_TYPE_LABELS[r.ambassador_professional_type] ?? r.ambassador_professional_type
                            : null,
                        ].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <Badge variant="neutral" className="text-[11px]">
                        {relationshipDef(r.relationship).label}
                      </Badge>
                      <p className="text-[11px] text-muted-foreground tabular-nums flex items-center justify-end gap-1">
                        <Eye className="h-3 w-3" />{r.ambassador_profile_views}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {r.category_keys.length === 0 ? (
                      <span className="text-xs text-muted-foreground">No category set on their side yet.</span>
                    ) : r.category_keys.map((k) => (
                      <Badge key={k} variant="neutral" className="text-[11px]">{categoryDisplayName(k)}</Badge>
                    ))}
                  </div>

                  {r.headline && <p className="text-sm text-muted-foreground">“{r.headline}”</p>}

                  <p className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-3">
                    {r.ambassador_location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />{r.ambassador_location}
                      </span>
                    )}
                    {r.since_year && <span>works with you since {r.since_year}</span>}
                    <span>listed {formatDate(r.created_at)}</span>
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
