'use client';

import { useEffect, useRef, useState } from 'react';
import {
  X,
  DownloadSimple,
  Star,
  File,
  CaretLeft,
  CaretRight,
  GlobeHemisphereWest,
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import { FileTypeIcon } from '../FileTypeIcon';
import { formatBytes } from '../../lib/format';
import { driveApi, type DriveFile } from '../../lib/drive';
import { useFocusTrap } from '../../lib/useFocusTrap';

interface Props {
  file: DriveFile;
  onClose: () => void;
  onStarred: (file: DriveFile) => void;
  onPrev?: () => void;
  onNext?: () => void;
  position?: string;
}

type PreviewKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'none';

function kindOf(file: DriveFile): PreviewKind {
  const mime = file.mime_type || '';
  const ext = file.original_filename.split('.').pop()?.toLowerCase() || '';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('text/') || ['txt', 'md', 'log', 'json', 'csv', 'xml', 'yml', 'yaml', 'ts', 'tsx', 'js', 'jsx', 'css', 'html', 'py', 'sql', 'sh', 'go', 'rs'].includes(ext)) {
    return 'text';
  }
  return 'none';
}

export default function PreviewModal({ file, onClose, onStarred, onPrev, onNext, position }: Props) {
  const kind = kindOf(file);
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useFocusTrap(modalRef, true);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    // Reset per-file state so switching files doesn't flash stale content.
    setUrl(null);
    setText(null);
    setError(false);

    if (kind === 'none') return;

    driveApi
      .download(file.id)
      .then(async ({ blob }) => {
        if (cancelled) return;
        if (kind === 'text') {
          setText(await blob.text());
        } else {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.id, kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') onPrev?.();
      else if (e.key === 'ArrowRight') onNext?.();
    };
    // Lock body scroll while open; restore focus to the trigger on close.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const overflowPrev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflowPrev;
      window.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    };
  }, [onClose, onPrev, onNext]);

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={file.original_filename}>
      <div ref={modalRef} className="modal modal-preview" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">
            {onPrev && (
              <button className="btn-icon" aria-label="Previous file" onClick={onPrev}>
                <CaretLeft size={15} weight="bold" />
              </button>
            )}
            <FileTypeIcon name={file.original_filename} size={18} />
            <span className="modal-title-name" title={file.original_filename}>
              {file.original_filename}
            </span>
            {position && <span className="preview-pos">{position}</span>}
            {onNext && (
              <button className="btn-icon" aria-label="Next file" onClick={onNext}>
                <CaretRight size={15} weight="bold" />
              </button>
            )}
          </div>
          <div className="modal-actions">
            {file.is_public && (
              <span className="badge badge-green preview-public-badge" title="Anyone with the link can open this file">
                <GlobeHemisphereWest size={11} weight="fill" /> PUBLIC
              </span>
            )}
            <button
              className="btn-icon"
              aria-label={file.starred ? 'Unstar' : 'Star'}
              title={file.starred ? 'Unstar' : 'Star'}
              onClick={() => onStarred(file)}
            >
              <Star size={16} weight={file.starred ? 'fill' : 'bold'} className={file.starred ? 'drive-star' : ''} />
            </button>
            <button className="btn-icon" aria-label="Close" onClick={onClose}>
              <X size={16} weight="bold" />
            </button>
          </div>
        </div>

        <div className="modal-body">
          {error ? (
            <NoPreview file={file} />
          ) : kind === 'none' ? (
            <NoPreview file={file} />
          ) : kind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob URLs can't use next/image
            url && <img src={url} alt={file.original_filename} className="preview-media" />
          ) : kind === 'video' ? (
            url && <video src={url} controls className="preview-media" />
          ) : kind === 'audio' ? (
            url && <audio src={url} controls className="preview-audio" />
          ) : kind === 'pdf' ? (
            url && <iframe src={url} title={file.original_filename} className="preview-frame" />
          ) : text !== null ? (
            <pre className="preview-text">{text}</pre>
          ) : (
            <div className="preview-loading" role="status" aria-label="Loading preview">
              <span className="btn-spinner" />
            </div>
          )}
        </div>

        <div className="modal-foot">
          <span className="file-meta">
            {formatBytes(file.file_size)}
            {file.mime_type ? ` · ${file.mime_type}` : ''} ·{' '}
            {new Date(file.created_at).toLocaleDateString()}
          </span>
          <button
            className="btn btn-primary btn-sm"
            onClick={async () => {
              try {
                const { blob, filename } = await driveApi.download(file.id);
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 4000);
              } catch {
                toast.error('Download failed');
              }
            }}
          >
            <DownloadSimple size={15} weight="bold" /> Download
          </button>
        </div>
      </div>
    </div>
  );
}

function NoPreview({ file }: { file: DriveFile }) {
  return (
    <div className="preview-none">
      <span className="file-type" style={{ width: 64, height: 64 }}>
        <File size={30} weight="duotone" />
      </span>
      <p className="muted">No preview available for this file type.</p>
      <p className="file-meta">{file.original_filename}</p>
    </div>
  );
}
