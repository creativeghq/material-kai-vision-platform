import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Eye, File as FileIcon, FileSpreadsheet, FileText, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/core/ui/avatar';
import { Button } from '@/components/core/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { castSlotForName } from '@/utils/characterAvatar';
import { gmailApi, type GmailAttachment } from '@/services/gmailApi';
import { avatarTint, castAvatarSrc, initials } from '../inboxFormat';

export const MailAvatar: React.FC<{ name?: string | null; email?: string | null; photoUrl?: string | null; className?: string }> = ({ name, email, photoUrl, className }) => {
  const label = name || email || '?';
  const generated = useMemo(() => castAvatarSrc(email || label, castSlotForName(email || label, name ?? null)), [email, label, name]);
  return (
    <Avatar className={className ?? 'h-9 w-9'}>
      <AvatarImage src={photoUrl || generated} alt={label} className="object-cover" />
      <AvatarFallback className={`text-xs ${avatarTint(label)}`}>{initials(label)}</AvatarFallback>
    </Avatar>
  );
};

export const PersonChip: React.FC<{ name?: string | null; address: string; photoUrl?: string | null; onRemove?: () => void }> = ({ name, address, photoUrl, onRemove }) => (
  <span className="inline-flex items-center gap-1.5 rounded-sm border border-hairline bg-card pl-0.5 pr-1.5 py-0.5 text-xs max-w-full" title={address}>
    <MailAvatar name={name} email={address} photoUrl={photoUrl} className="h-5 w-5" />
    <span className="truncate">{name || address}</span>
    {onRemove && (
      <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-foreground" title={`Remove ${address}`}>
        <X className="w-3 h-3" />
      </button>
    )}
  </span>
);

const ADDRESS = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

export const RecipientInput: React.FC<{
  id: string;
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  known?: Map<string, { name: string | null; photo_url?: string | null }>;
  autoFocus?: boolean;
}> = ({ id, label, value, onChange, known, autoFocus }) => {
  const [draft, setDraft] = useState('');
  const commit = (text: string) => {
    const parts = text.split(/[\s,;]+/).map((p) => p.trim().toLowerCase()).filter(Boolean);
    const good = parts.filter((p) => ADDRESS.test(p));
    if (good.length) onChange([...new Set([...value, ...good])]);
    setDraft(parts.filter((p) => !ADDRESS.test(p)).join(' '));
  };
  return (
    <div className="flex items-start gap-2 py-1">
      <label htmlFor={id} className="text-xs text-muted-foreground w-8 pt-1.5 shrink-0">{label}</label>
      <div className="flex-1 flex flex-wrap items-center gap-1 min-w-0">
        {value.map((a) => (
          <PersonChip key={a} address={a} name={known?.get(a)?.name ?? null} photoUrl={known?.get(a)?.photo_url ?? null}
            onRemove={() => onChange(value.filter((x) => x !== a))} />
        ))}
        <input
          id={id}
          autoFocus={autoFocus}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (['Enter', ',', ';', 'Tab', ' '].includes(e.key) && draft.trim()) { e.preventDefault(); commit(draft); }
            if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => draft.trim() && commit(draft)}
          onPaste={(e) => { e.preventDefault(); commit(draft + ' ' + e.clipboardData.getData('text')); }}
          className="flex-1 min-w-[10rem] bg-transparent text-sm outline-none py-1"
          placeholder={value.length ? '' : 'name@company.com'}
        />
      </div>
    </div>
  );
};

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

const PREVIEWABLE = /^(image\/(png|jpe?g|gif|webp)|application\/pdf)$/i;
const THUMB_LIMIT = 4 * 1024 * 1024;

function iconFor(mime: string) {
  if (mime.startsWith('image/')) return ImageIcon;
  if (/pdf|word|text/.test(mime)) return FileText;
  if (/sheet|excel|csv/.test(mime)) return FileSpreadsheet;
  return FileIcon;
}

export const AttachmentCards: React.FC<{ accountId: string; messageId: string; attachments: GmailAttachment[] }> = ({ accountId, messageId, attachments }) => {
  const { toast } = useToast();
  const [data, setData] = useState<Record<string, string>>({});
  const [viewing, setViewing] = useState<GmailAttachment | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async (a: GmailAttachment): Promise<string | null> => {
    if (data[a.attachmentId]) return data[a.attachmentId];
    try {
      const { data_base64 } = await gmailApi.attachment(accountId, messageId, a.attachmentId);
      const url = URL.createObjectURL(base64ToBlob(data_base64, a.mimeType || 'application/octet-stream'));
      urls.current.push(url);
      setData((d) => ({ ...d, [a.attachmentId]: url }));
      return url;
    } catch (e) {
      toast({ title: `Could not open ${a.filename}`, description: (e as Error).message, variant: 'destructive' });
      return null;
    }
  };

  const urls = useRef<string[]>([]);
  useEffect(() => () => { urls.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  useEffect(() => {
    attachments.filter((a) => a.mimeType.startsWith('image/') && a.size <= THUMB_LIMIT).slice(0, 6).forEach((a) => { void load(a); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId]);

  const download = async (a: GmailAttachment) => {
    setBusy(a.attachmentId);
    const url = await load(a);
    setBusy(null);
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = a.filename;
    link.click();
  };

  if (!attachments.length) return null;
  return (
    <div className="space-y-2 pt-2">
      <div className="text-sm font-semibold">Attachments <span className="font-normal text-muted-foreground">({attachments.length} {attachments.length === 1 ? 'file' : 'files'})</span></div>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
        {attachments.map((a) => {
          const Icon = iconFor(a.mimeType);
          const thumb = a.mimeType.startsWith('image/') ? data[a.attachmentId] : null;
          return (
            <div key={a.attachmentId} className="group rounded-sm border border-hairline bg-card overflow-hidden">
              <button type="button" className="block w-full aspect-[4/3] bg-surface-sunken relative"
                onClick={() => (PREVIEWABLE.test(a.mimeType) ? void load(a).then((u) => u && setViewing(a)) : void download(a))}
                title={PREVIEWABLE.test(a.mimeType) ? `Preview ${a.filename}` : `Download ${a.filename}`}>
                {thumb
                  ? <img src={thumb} alt={a.filename} className="absolute inset-0 w-full h-full object-cover" />
                  : <Icon className="absolute inset-0 m-auto w-8 h-8 text-muted-foreground" />}
              </button>
              <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs">
                <span className="truncate flex-1" title={a.filename}>{a.filename}</span>
                <span className="text-muted-foreground tabular-nums shrink-0">{formatBytes(a.size)}</span>
                {PREVIEWABLE.test(a.mimeType) && (
                  <button type="button" className="text-muted-foreground hover:text-foreground" title="Preview" onClick={() => void load(a).then((u) => u && setViewing(a))}>
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                )}
                <button type="button" className="text-muted-foreground hover:text-foreground" title="Download" onClick={() => void download(a)}>
                  {busy === a.attachmentId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-5xl w-[92vw] p-0 overflow-hidden">
          <DialogHeader className="px-4 py-2.5 border-b border-hairline bg-surface-sunken">
            <DialogTitle className="text-sm font-semibold truncate pr-8">{viewing?.filename}</DialogTitle>
            <DialogDescription className="sr-only">Preview of the attachment</DialogDescription>
          </DialogHeader>
          <div className="h-[75vh] flex items-center justify-center bg-surface-sunken">
            {viewing && data[viewing.attachmentId] && (viewing.mimeType.startsWith('image/')
              ? <img src={data[viewing.attachmentId]} alt={viewing.filename} className="max-h-full max-w-full object-contain" />
              : <iframe src={data[viewing.attachmentId]} title={viewing.filename} className="w-full h-full border-0" />)}
          </div>
          {viewing && (
            <div className="px-4 py-2 border-t border-hairline flex justify-end">
              <Button size="sm" variant="outline" onClick={() => void download(viewing)}><Download className="w-4 h-4 mr-1" />Download</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
