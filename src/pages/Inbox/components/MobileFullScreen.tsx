import React from 'react';
import { createPortal } from 'react-dom';
import { useVisualViewport } from '../useVisualViewport';

/** Portaled while active: <main> is a stacking context nothing inside can rise above the app bars from. */
export const MobileFullScreen: React.FC<{ active: boolean; className: string; children: React.ReactNode }> = ({ active, className, children }) => {
  const viewport = useVisualViewport(active);
  const pane = (
    <div
      className={`${className} ${active ? 'fixed inset-x-0 top-0 z-50 h-[100dvh] bg-background' : ''}`}
      style={active && viewport ? { height: viewport.height, transform: `translateY(${viewport.top}px)` } : undefined}
    >
      {children}
    </div>
  );
  return active ? createPortal(pane, document.body) : pane;
};
