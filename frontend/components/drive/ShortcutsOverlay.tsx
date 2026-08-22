'use client';

import { useEffect, useRef } from 'react';
import { X, Command } from '@phosphor-icons/react';
import { useFocusTrap } from '../../lib/useFocusTrap';

interface Props {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS: { keys: string[]; label: string; note?: string }[] = [
  { keys: ['⌘', 'K'], label: 'Command palette', note: 'Search files and run actions' },
  { keys: ['⌘', 'A'], label: 'Select all visible files' },
  { keys: ['/'], label: 'Focus search' },
  { keys: ['↑', '↓'], label: 'Move through the palette' },
  { keys: ['↵'], label: 'Open highlighted result' },
  { keys: ['←', '→'], label: 'Previous / next file in preview' },
  { keys: ['Esc'], label: 'Close menus, clear selection' },
  { keys: ['?'], label: 'Show this help', note: 'Shift + /' },
];

const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export default function ShortcutsOverlay({ open, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  useFocusTrap(overlayRef, open);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div ref={overlayRef} className="modal shortcuts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="shortcuts-title">
            <Command size={16} weight="duotone" /> Keyboard shortcuts
          </span>
          <button className="btn-icon" aria-label="Close" onClick={onClose}>
            <X size={16} weight="bold" />
          </button>
        </div>
        <div className="shortcuts-body">
          {SHORTCUTS.map((s) => (
            <div key={s.label} className="shortcut-row">
              <span className="shortcut-keys">
                {s.keys.map((k) =>
                  k === '⌘' ? (
                    <kbd key={k}>{isMac ? '⌘' : 'Ctrl'}</kbd>
                  ) : (
                    <kbd key={k}>{k}</kbd>
                  )
                )}
              </span>
              <span className="shortcut-desc">
                {s.label}
                {s.note && <em>{s.note}</em>}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
