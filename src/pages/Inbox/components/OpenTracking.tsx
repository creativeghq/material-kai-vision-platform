import React, { useCallback, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { formatDate, formatTime } from '@/utils/datetime';

export interface MailOpens { count: number; first_opened_at: string | null; last_opened_at: string | null }

const KEY = 'inbox.trackOpens';
const APPROXIMATE = 'Approximate: some mail apps load images automatically (counting an open nobody made), others block them (hiding a real one).';

export function useTrackOpens(): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState(() => {
    try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
  });
  const set = useCallback((v: boolean) => {
    setOn(v);
    try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* per-viewer convenience only */ }
  }, []);
  return [on, set];
}

export const TrackOpensToggle: React.FC<{ on: boolean; onChange: (v: boolean) => void; className?: string }> = ({ on, onChange, className }) => (
  <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
    title={on ? `Opens are tracked. ${APPROXIMATE}` : 'Track when this email is opened'}
    className={`inline-flex items-center gap-1 h-7 px-2 rounded-sm text-xs border ${on ? 'border-primary/40 text-primary bg-primary/[0.08]' : 'border-hairline text-muted-foreground hover:text-foreground'} ${className ?? ''}`}>
    {on ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
    Track opens
  </button>
);

export const OpenReceipt: React.FC<{ opens: MailOpens | null | undefined }> = ({ opens }) => {
  if (!opens) return null;
  const at = (iso: string) => `${formatDate(iso)} ${formatTime(iso)}`;
  return opens.count > 0 && opens.last_opened_at ? (
    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-300" title={`First opened ${opens.first_opened_at ? at(opens.first_opened_at) : '—'}. ${APPROXIMATE}`}>
      <Eye className="w-3 h-3" /> Opened {opens.count}× · last {at(opens.last_opened_at)}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground" title={APPROXIMATE}>
      <EyeOff className="w-3 h-3" /> No open recorded yet
    </span>
  );
};
