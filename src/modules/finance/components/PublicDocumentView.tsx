import React, { useLayoutEffect, useRef, useState } from 'react';
import { InvoiceDocument } from './InvoiceDocument';
import type { RenderedPublicDocument } from '@/modules/finance/services/publicDocumentService';

const SHEET_PX = 794;

export const PublicDocumentView: React.FC<{ rendered: RenderedPublicDocument }> = ({ rendered }) => {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const measure = () => {
      const s = Math.min(1, el.clientWidth / SHEET_PX);
      setScale(s);
      setHeight(inner.current ? inner.current.offsetHeight * s : undefined);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, [rendered]);

  return (
    <div ref={outer} className="w-full overflow-hidden print:overflow-visible" style={{ height }}>
      <div
        ref={inner}
        style={{ width: SHEET_PX, transform: `scale(${scale})`, transformOrigin: 'top left' }}
        className="print:!transform-none"
      >
        <InvoiceDocument spec={rendered.spec} colors={rendered.colors} data={rendered.data} />
      </div>
    </div>
  );
};

export default PublicDocumentView;
