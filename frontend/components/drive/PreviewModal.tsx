'use client';

import { useEffect, useState } from 'react';
import { X, DownloadSimple, Star, File } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import { FileTypeIcon } from '../FileTypeIcon';
import { formatBytes } from '../../lib/format';
import { driveApi, type DriveFile } from '../../lib/drive';

interface Props {
  file: DriveFile;
  onClose: () => void;
  onStarred: (file: DriveFile) => void;
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

export default function PreviewModal({ file, onClose, onStarred }: Props) {
  const kind = kindOf(file);
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

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
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={file.original_filename}>
      <div className="modal modal-preview" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">
            <FileTypeIcon name={file.original_filename} size={18} />
            <span className="modal-title-name" title={file.original_filename}>
              {file.original_filename}
            </span>
          </div>
          <div className="modal-actions">
            <button
              className="btn-icon"
              aria-label={file.starred ? 'Unstar' : 'Star'}
              title={file.starred ? 'Unstar' : 'Star'}
              onClick={() => onStarred(file)}
            >
              <Star size={16} weight={file.starred ? 'fill' : 'bold'} />
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
            <NoPreview file={file} />
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