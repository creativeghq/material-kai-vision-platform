import React from 'react';
import { Bold, Italic, Link2, List, ListOrdered, Quote, Eye, EyeOff } from 'lucide-react';
import { escapeHtml } from '@/utils/escapeHtml';
import { hasEmailMarkup, renderEmailMarkup } from '@/utils/emailMarkup';
import { EmailHtmlView } from './EmailHtmlView';

type Setter = (next: string) => void;

function edit(el: HTMLTextAreaElement | null, value: string, set: Setter, fn: (sel: string) => { text: string; select?: [number, number] }) {
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? value.length;
  const { text, select } = fn(value.slice(start, end));
  set(value.slice(0, start) + text + value.slice(end));
  requestAnimationFrame(() => {
    if (!el) return;
    el.focus();
    const [a, b] = select ?? [text.length, text.length];
    el.setSelectionRange(start + a, start + b);
  });
}

const wrap = (marker: string, placeholder: string) => (sel: string) => {
  const inner = sel || placeholder;
  return { text: `${marker}${inner}${marker}`, select: [marker.length, marker.length + inner.length] as [number, number] };
};

const prefixLines = (prefix: (i: number) => string) => (sel: string) => {
  const lines = (sel || 'item').split('\n');
  const text = lines.map((l, i) => `${prefix(i)}${l}`).join('\n');
  return { text: `\n${text}\n` };
};

export const EmailFormatBar: React.FC<{
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: Setter;
  preview: boolean;
  onPreview: (on: boolean) => void;
}> = ({ textareaRef, value, onChange, preview, onPreview }) => {
  const run = (fn: Parameters<typeof edit>[3]) => edit(textareaRef.current, value, onChange, fn);
  const tools: Array<{ icon: React.ElementType; title: string; fn: Parameters<typeof edit>[3] }> = [
    { icon: Bold, title: 'Bold', fn: wrap('**', 'bold text') },
    { icon: Italic, title: 'Italic', fn: wrap('*', 'italic text') },
    {
      icon: Link2, title: 'Link',
      fn: (sel) => {
        const label = sel || 'link text';
        return { text: `[${label}](https://)`, select: [label.length + 3, label.length + 11] };
      },
    },
    { icon: List, title: 'Bulleted list', fn: prefixLines(() => '- ') },
    { icon: ListOrdered, title: 'Numbered list', fn: prefixLines((i) => `${i + 1}. `) },
    { icon: Quote, title: 'Quote', fn: prefixLines(() => '> ') },
  ];
  return (
    <div className="flex items-center gap-0.5">
      {tools.map(({ icon: Icon, title, fn }) => (
        <button key={title} type="button" title={title} disabled={preview} onClick={() => run(fn)}
          className="p-1.5 rounded-sm text-muted-foreground hover:bg-surface-hover hover:text-foreground disabled:opacity-40">
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}
      <button type="button" title={preview ? 'Back to editing' : 'Preview the email'} onClick={() => onPreview(!preview)}
        aria-pressed={preview}
        className="ml-1 inline-flex items-center gap-1 px-1.5 py-1 rounded-sm text-xs text-muted-foreground hover:bg-surface-hover hover:text-foreground">
        {preview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        {preview ? 'Edit' : 'Preview'}
      </button>
    </div>
  );
};

export const EmailPreview: React.FC<{ value: string; onEdit: () => void }> = ({ value, onEdit }) => (
  hasEmailMarkup(value)
    ? <EmailHtmlView html={renderEmailMarkup(value, escapeHtml)} onShowText={onEdit} />
    : <div className="rounded-sm border border-hairline bg-card p-3 text-sm whitespace-pre-wrap min-h-[80px]">{value || 'Nothing to preview yet.'}</div>
);
