import React, { useEffect, useState } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { supabase } from '@/integrations/supabase/client';

interface SetupItem { key: string; label: string; section: string; done: boolean }

/** Overview, until it is all done: the steps a new website needs before its numbers mean anything. */
export const WebsiteSetupChecklist: React.FC<{ websiteId: string; onOpenTab: (tab: string) => void }> = ({ websiteId, onOpenTab }) => {
  const [items, setItems] = useState<SetupItem[] | null>(null);
  useEffect(() => {
    void supabase.rpc('get_website_setup' as never, { p_website_id: websiteId } as never)
      .then(({ data }) => setItems((data as SetupItem[] | null) ?? null));
  }, [websiteId]);
  if (!items || items.every((i) => i.done)) return null;
  const done = items.filter((i) => i.done).length;
  return (
    <Card className="dashboard-card">
      <CardHeader>
        <CardTitle className="text-base">Set up this website</CardTitle>
        <CardDescription>{done} of {items.length} done. Each step opens the place it is done.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {items.map((i) => (
            <li key={i.key}>
              <button type="button" disabled={i.done} onClick={() => onOpenTab(i.section)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-surface-hover disabled:hover:bg-transparent">
                {i.done
                  ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[hsl(var(--success))]" />
                  : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <span className={i.done ? 'text-muted-foreground line-through' : 'text-foreground'}>{i.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};
