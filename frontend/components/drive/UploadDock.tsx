'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CaretDown,
  CheckCircle,
  CloudArrowUp,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { FileTypeIcon } from '../FileTypeIcon';
import { formatBytes } from '../../lib/format';

export interface UploadItem {
  id: string;
  name: string;
  size: number;
  status: 'uploading' | 'done' | 'error';
  progress: number;
  error?: string;
}

interface Props {
  items: UploadItem[];
  onDismiss: (id: string) => void;
  onClear: () => void;
}

// Consolidated upload dock: a compact progress pill that expands into a full
// queue. Sits above the AI assistant button; auto-clears once every upload
// settles successfully.
export default function UploadDock({ items, onDismiss, onClear }: Props) {
  const [expanded, setExpanded] = useState(false);

  const { uploading, done, failed, overall } = useMemo(() => {
    const uploading = items.filter((i) => i.status === 'uploading');
    const done = items.filter((i) => i.status === 'done');
    const failed = items.filter((i) => i.status === 'error');
    const overall =
      items.length === 0
        ? 0
        : Math.round(items.reduce((sum, i) => sum + i.progress, 0) / items.length);
    return { uploading, done, failed, overall };
  }, [items]);

  const settledCleanly = items.length > 0 && uploading.length === 0 && failed.length === 0;

  // Everything landed: collapse the detail view, then clear the dock shortly
  // after so it doesn't linger. Cancelled if new uploads arrive.
  useEffect(() => {
    if (!settledCleanly) return;
    setExpanded(false);
    const t = setTimeout(onClear, 4200);
    return () => clearTimeout(t);
  }, [settledCleanly, onClear]);

  if (items.length === 0) return null;

  const busy = uploading.length > 0;
  const pendingCount = busy ? uploading.length : 0;
  const totalRelevant = busy ? items.length - done.length : items.length;

  const headline = busy
    ? `Uploading ${items.length - uploading.length - failed.length + 1} of ${totalRelevant}`
    : failed.length > 0
      ? `${failed.length} upload${failed.length !== 1 ? 's' : ''} failed`
      : `${done.length} file${done.length !== 1 ? 's' : ''} uploaded`;

  return (
    <div className={`upload-dock ${expanded ? 'expanded' : ''}`} aria-live="polite">
      <button
        className="upload-dock-pill"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={`${headline}. ${overall}% complete`}
        title={headline}
      >
        <span className={`upload-dock-state ${failed.length ? 'error' : settledCleanly ? 'done' : 'busy'}`}>
          {settledCleanly ? (
            <CheckCircle size={17} weight="fill" />
          ) : failed.length ? (
            <WarningCircle size={17} weight="fill" />
          ) : (
            <span className="upload-dock-ring" style={{ '--pct': overall } as React.CSSProperties}>
              <CloudArrowUp size={13} weight="bold" />
            </span>
          )}
        </span>
        <span className="upload-dock-text">
          <strong>{headline}</strong>
          {busy && <span className="upload-dock-pct">{overall}%</span>}
        </span>
        <CaretDown size={12} weight="bold" className="upload-dock-caret" />
      </button>

      {expanded && (
        <div className="upload-dock-panel">
          <div className="upload-dock-head">
            <span>Uploads</span>
            <button
              className="btn-icon"
              aria-label="Dismiss all"
              title="Dismiss all"
              onClick={onClear}
            >
              <X size={13} weight="bold" />
            </button>
          </div>
          {busy && (
            <div className="progress-track upload-dock-total">
              <div className="progress-fill" style={{ width: `${overall}%` }} />
            </div>
          )}
          <ul className="upload-dock-list">
            {items.map((item) => (
              <li key={item.id} className={`upload-dock-item ${item.status}`}>
                <span className="upload-dock-item-icon">
                  {item.status === 'done' ? (
                    <CheckCircle size={15} weight="duotone" color="var(--accent-strong)" />
                  ) : item.status === 'error' ? (
                    <WarningCircle size={15} weight="duotone" color="var(--danger)" />
                  ) : (
                    <FileTypeIcon name={item.name} size={15} />
                  )}
                </span>
                <span className="upload-dock-item-body">
                  <span className="upload-dock-item-top">
                    <span className="upload-dock-item-name" title={item.name}>
                      {item.name}
                    </span>
                    <span className="upload-dock-item-meta">
                      {item.status === 'uploading'
                        ? `${formatBytes(item.size)} · ${item.progress}%`
                        : item.status === 'error'
                          ? item.error || 'Failed'
                          : formatBytes(item.size)}
                    </span>
                    <button
                      className="upload-queue-close"
                      onClick={() => onDismiss(item.id)}
                      aria-label={`Dismiss ${item.name}`}
                    >
                      <X size={11} weight="bold" />
                    </button>
                  </span>
                  {item.status === 'uploading' && (
                    <span className="progress-track upload-dock-bar">
                      <span className="progress-fill" style={{ width: `${item.progress}%` }} />
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {pendingCount === 0 && (
            <button className="upload-dock-clear" onClick={onClear}>
              Clear list
            </button>
          )}
        </div>
      )}
    </div>
  );
}
