import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { LINKED_RECORD_KINDS, type LinkedRecordKind } from '@/config/linkedRecordKinds';
import { getLinkedRecords, type LinkedRecord } from '@/services/linkedRecordsService';
import { humanizeLabel } from '@/utils/humanize';

interface LinkedRecordsPanelProps {
  kind: LinkedRecordKind;
  id: string;
  /** Bump to re-read after the page changed one of the links. */
  refreshKey?: unknown;
}

/** LINKED RECORDS — everything directly tied to this record, read from `get_linked_records`. */
export const LinkedRecordsPanel: React.FC<LinkedRecordsPanelProps> = ({ kind, id, refreshKey }) => {
  const [rows, setRows] = useState<LinkedRecord[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    getLinkedRecords(kind, id)
      .then((r) => { if (!cancelled) setRows(r); })
      .catch(() => { if (!cancelled) { setRows(null); setFailed(true); } });
    return () => { cancelled = true; };
  }, [kind, id, refreshKey]);

  if (rows === null && !failed) return null;
  if (rows !== null && rows.length === 0) return null;

  const groups = new Map<LinkedRecordKind, LinkedRecord[]>();
  for (const row of rows ?? []) {
    const list = groups.get(row.kind);
    if (list) list.push(row);
    else groups.set(row.kind, [row]);
  }

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle>Linked records</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {failed ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">Could not load the linked records.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {[...groups.entries()].map(([groupKind, list]) => {
              const spec = LINKED_RECORD_KINDS[groupKind];
              const Icon = spec.icon;
              return list.map((row) => {
                const text = row.label || spec.label;
                const body = (
                  <>
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="w-32 shrink-0 text-xs text-muted-foreground">{row.relation ?? spec.label}</span>
                    <span className="min-w-0 flex-1 truncate font-sans text-sm">{text}</span>
                    {row.status && <Badge variant="neutral">{humanizeLabel(row.status)}</Badge>}
                  </>
                );
                return (
                  <li key={`${row.kind}:${row.id}`}>
                    {spec.route ? (
                      <Link to={spec.route(row.id)} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-sunken">
                        {body}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 px-5 py-2.5">{body}</div>
                    )}
                  </li>
                );
              });
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
