'use client';

import { RefObject, useEffect } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

// Elements hidden via display:none report zero client rects; this check stays
// correct for position:fixed elements (unlike offsetParent).
const isVisible = (el: HTMLElement): boolean =>
  el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0;

// Traps keyboard focus inside a dialog while `active` is true: focuses the
// first focusable element on open (unless something inside already has focus,
// e.g. an autoFocus input) and cycles Tab/Shift+Tab within the container.
// Focus restoration on close remains the caller's responsibility.
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    const getFocusable = (): HTMLElement[] =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible);

    if (!container.contains(document.activeElement)) {
      const first = getFocusable()[0];
      (first || container).focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;

      if (!container.contains(current)) {
        // Focus escaped (e.g. programmatic blur) — pull it back in.
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (e.shiftKey && current === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [ref, active]);
}
