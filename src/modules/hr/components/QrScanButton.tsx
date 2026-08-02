/**
 * QR scan for the clock-in kiosk. Reads the employee's Ergani "Digital Work Card" QR (which encodes
 * the VAT number + name + employer id in clear text) using the browser-native BarcodeDetector — no
 * external dependency. We extract the first 9-digit token as the VAT and hand it back. Feature-
 * detected: on browsers without BarcodeDetector (e.g. desktop Firefox/Safari) the button is hidden,
 * so manual entry remains the fallback. (The exact QR payload layout isn't published; the 9-digit
 * VAT is the stable identifier we key on.)
 */
import { useEffect, useRef, useState } from 'react';
import { QrCode, Loader2, X } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useFocusTrap } from '@/hooks/useFocusTrap';

// BarcodeDetector isn't in the TS DOM lib yet.
// deno-lint-ignore no-explicit-any
const BD: any = typeof window !== 'undefined' ? (window as any).BarcodeDetector : undefined;
export const qrScanSupported = !!BD;

function extractVat(raw: string): string | null {
  const m = raw.match(/\b(\d{9})\b/);
  return m ? m[1] : null;
}

export function QrScanButton({ onVat }: { onVat: (vat: string) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const stop = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  useEffect(() => () => stop(), []);

  // Hand-rolled overlay, not a Radix Dialog: Escape, the Tab trap and focus restore all have
  // to be wired explicitly. Without them focus stayed on the trigger BEHIND this, and Tab
  // walked the page underneath.
  // A full-screen camera view with no Escape was the worst of the four to be stuck inside.
  useEscapeKey(open, () => { stop(); setOpen(false); });
  useFocusTrap(overlayRef, open);

  const start = async () => {
    setError(null); setOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      const detector = new BD({ formats: ['qr_code'] });
      const tick = async () => {
        if (!streamRef.current) return;
        try {
          const codes = await detector.detect(video);
          for (const c of codes) {
            const vat = extractVat(String(c.rawValue ?? ''));
            if (vat) { stop(); setOpen(false); onVat(vat); return; }
          }
        } catch { /* transient decode error — keep scanning */ }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setError('Could not access the camera.');
    }
  };

  const close = () => { stop(); setOpen(false); };

  if (!qrScanSupported) return null;

  return (
    <>
      <Button variant="outline" onClick={start} className="w-full h-12 rounded-full"><QrCode className="h-5 w-5 mr-2" />Scan QR code</Button>
      {open && (
        <div
          ref={overlayRef}
          role="dialog"
          aria-modal="true"
          aria-label="Scan a work-card QR code"
          className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4"
        >
          <div className="relative w-full max-w-sm aspect-square rounded-2xl overflow-hidden bg-black">
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
            <div className="absolute inset-8 border-2 border-white/70 rounded-xl pointer-events-none" />
          </div>
          <p className="text-white/80 text-sm mt-4">{error ?? 'Point the camera at your work-card QR'}</p>
          {error && <Loader2 className="hidden" />}
          <Button variant="secondary" onClick={close} className="rounded-full mt-4"><X className="h-4 w-4 mr-2" />Cancel</Button>
        </div>
      )}
    </>
  );
}
