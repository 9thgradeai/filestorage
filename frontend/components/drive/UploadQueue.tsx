'use client';

import { CheckCircle, WarningCircle, X, CloudArrowUp } from '@phosphor-icons/react';
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
}

export default function UploadQueue({ items, onDismiss }: Props) {
  if (items.length === 0) return null;

  return (
    <div className="upload-queue" aria-label="Uploads">
      {items.map((item) => (
        <div key={item.id} className="upload-queue-item">
          <span className="upload-queue-icon">
            {item.status === 'done' ? (
              <CheckCircle size={16} weight="duotone" color="var(--accent-strong)" />
            ) : item.status === 'error' ? (
              <WarningCircle size={16} weight="duotone" color="var(--danger)" />
            ) : (
              <CloudArrowUp size={16} weight="duotone" />
            )}
          </span>
          <div className="upload-queue-body">
            <div className="upload-queue-top">
              <span className="upload-queue-name" title={item.name}>
                {item.name}
              </span>
              <button
                className="upload-queue-close"
                onClick={() => onDismiss(item.id)}
                aria-label="Dismiss"
              >
                <X size={12} weight="bold" />
              </button>
            </div>
            <div className="upload-queue-meta">
              {item.status === 'uploading'
                ? `Uploading ${item.progress}% · ${formatBytes(item.size)}`
                : item.status === 'error'
                  ? item.error || 'Upload failed'
                  : 'Uploaded'}
            </div>
            {item.status === 'uploading' && (
              <div className="progress-track upload-queue-progress">
                <div className="progress-fill" style={{ width: `${item.progress}%` }} />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}