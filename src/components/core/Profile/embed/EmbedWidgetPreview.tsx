import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  widgetAttributes, widgetDef, widgetIsComplete,
  type EmbedWidgetId, type WidgetOptions,
} from './embedWidgets';

let bundle: Promise<void> | null = null;

function loadEmbedBundle(): Promise<void> {
  bundle ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/embed/materialkai-product.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      bundle = null;
      script.remove();
      reject(new Error('The widget script could not be loaded.'));
    };
    document.head.append(script);
  });
  return bundle;
}

interface Props {
  apiKey: string;
  widget: EmbedWidgetId;
  options: WidgetOptions;
}

/** The real widget, rendered here exactly as a visitor's browser renders it. */
export const EmbedWidgetPreview: React.FC<Props> = ({ apiKey, widget, options }) => {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [error, setError] = useState<string | null>(null);
  const complete = widgetIsComplete(widget, options);
  const { productId, blueprintId, sceneId } = options;
  const productIds = (options.productIds ?? []).join(',');

  useEffect(() => {
    const node = host.current;
    if (!complete || !node) return;
    let cancelled = false;
    setState('loading');
    loadEmbedBundle()
      .then(() => {
        if (cancelled) return;
        const el = document.createElement(widgetDef(widget).tag);
        for (const [k, v] of widgetAttributes(apiKey, widget, { productId, blueprintId, sceneId, productIds: productIds ? productIds.split(',') : [] })) el.setAttribute(k, v);
        node.replaceChildren(el);
        setState('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'The preview could not start.');
        setState('failed');
      });
    return () => {
      cancelled = true;
      node.replaceChildren();
    };
  }, [apiKey, widget, productId, blueprintId, sceneId, productIds, complete]);

  if (!complete) {
    return (
      <div className="rounded-md border border-dashed border-hairline p-6 text-center text-sm text-muted-foreground">
        {widget === 'product' ? 'Pick a product to see the preview.' : 'Pick a blueprint to see the preview.'}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-hairline bg-background p-3">
      {state === 'loading' && (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />Loading the widget…
        </div>
      )}
      {state === 'failed' && <p className="py-6 text-sm text-destructive">{error}</p>}
      <div ref={host} />
    </div>
  );
};
