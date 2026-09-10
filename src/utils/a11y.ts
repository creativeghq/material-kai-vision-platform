import type { KeyboardEvent } from 'react';

/** Keyboard activation for an element that has been given `role="button"`. */
export function onEnterOrSpace(handler: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    // Only act on the element itself. Without this, Enter pressed inside a nested input or
    // button bubbles up and fires the row action too.
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    handler();
  };
}
