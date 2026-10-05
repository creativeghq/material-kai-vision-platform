import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { sanitizeEmailHtml } from '@/utils/sanitizeEmailHtml';

const TRUSTED_KEY = 'inbox.images.trustedSenders';

function readTrusted(): string[] {
  try { return JSON.parse(localStorage.getItem(TRUSTED_KEY) ?? '[]') as string[]; } catch { return []; }
}
function writeTrusted(list: string[]) {
  try { localStorage.setItem(TRUSTED_KEY, JSON.stringify(list.slice(-500))); } catch { return; }
}

const FRAME_CSS = `
  html,body{margin:0;padding:0;background:#fff;color:#1d2321;}
  body{font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;padding:12px;overflow-wrap:anywhere;}
  img{max-width:100%;height:auto;}
  table{max-width:100%;}
  pre{white-space:pre-wrap;}
  a{color:#1f6f62;}
  blockquote{margin:0 0 0 8px;padding-left:10px;border-left:3px solid #d6dbd7;color:#5f6a66;}
`;

export const EmailHtmlView: React.FC<{ html: string; sender?: string | null; onShowText?: () => void }> = ({ html, sender, onShowText }) => {
  const senderKey = (sender ?? '').trim().toLowerCase();
  const [allowOnce, setAllowOnce] = useState(false);
  const [trusted, setTrusted] = useState(() => !!senderKey && readTrusted().includes(senderKey));
  const allow = allowOnce || trusted;
  const { html: clean, blockedImages } = useMemo(() => sanitizeEmailHtml(html, allow), [html, allow]);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);

  const measure = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (doc?.documentElement) setHeight(Math.min(Math.max(doc.documentElement.scrollHeight, 40), 4000));
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let observer: ResizeObserver | null = null;
    const onLoad = () => {
      measure();
      const doc = frame.contentDocument;
      if (!doc?.body) return;
      observer = new ResizeObserver(measure);
      observer.observe(doc.body);
      doc.querySelectorAll('img').forEach((img) => img.addEventListener('load', measure));
    };
    frame.addEventListener('load', onLoad);
    return () => { frame.removeEventListener('load', onLoad); observer?.disconnect(); };
  }, [clean, measure]);

  const trustSender = () => {
    if (!senderKey) return;
    writeTrusted([...readTrusted().filter((s) => s !== senderKey), senderKey]);
    setTrusted(true);
  };

  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><style>${FRAME_CSS}</style></head><body>${clean}</body></html>`;

  return (
    <div className="space-y-1.5">
      {(blockedImages > 0 || onShowText) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {blockedImages > 0 && !allow && (
            <>
              <span className="inline-flex items-center gap-1"><ImageOff className="h-3.5 w-3.5" />Images hidden</span>
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setAllowOnce(true)}>Show images</Button>
              {senderKey && <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={trustSender}>Always for {senderKey}</Button>}
            </>
          )}
          {onShowText && <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onShowText}>Plain text</Button>}
        </div>
      )}
      <iframe
        ref={frameRef}
        title="Email message"
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        srcDoc={srcDoc}
        style={{ height }}
        className="w-full rounded-sm border border-hairline bg-white"
      />
    </div>
  );
};
