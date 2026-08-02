import type { KeyboardEvent } from 'react';

/**
 * Keyboard activation for an element that has been given `role="button"`.
 *
 * A native `<button>` fires its click handler on Enter AND Space; a `<div onClick>` fires on
 * neither, so every clickable row, card and thumbnail in this codebase was mouse-only. Where the
 * element cannot simply BE a `<button>` — because it is a grid/table row, or it already contains
 * its own buttons and nesting interactive content is invalid — the accessible equivalent is
 * `role="button" tabIndex={0}` plus this handler.
 *
 * `preventDefault` matters for Space: without it the browser scrolls the page as well as
 * activating, so the user loses their place on every keyboard click.
 *
 * Keep the same function in `onClick` and here, so the two can never drift apart:
 *
 *     <div role="button" tabIndex={0} onClick={open} onKeyDown={onEnterOrSpace(open)}>
 */
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
