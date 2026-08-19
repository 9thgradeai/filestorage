'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { DownloadSimple, WarningCircle, LockSimple } from '@phosphor-icons/react';
import { downloadFile } from '../../../lib/api';
import { Brand } from '../../../components/Brand';
import { FileTypeIcon } from '../../../components/FileTypeIcon';

interface SharedInfo {
  id: number;
  original_filename: string;
  file_size: number;
  mime_type: string | null;
  created_at: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function SharedFilePage() {
  const params = useParams();
  const token = typeof params.token === 'string' ? params.token : '';
  const [info, setInfo] = useState<SharedInfo | null>(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/files/public/${encodeURIComponent(token)}/info`)
      .then(async (res) => {
        if (!res.ok) throw new Error('File not found or link expired');
        return res.json();
      })
      .then((data) => setInfo(data.file))
      .catch((err: any) => setError(err.message || 'File not found or link expired'));
  }, [token]);

  async function download() {
    if (!token) return;
    setDownloading(true);
    try {
      const { blob, filename } = await downloadFile(`/api/files/public/${encodeURIComponent(token)}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Download started');
    } catch (err: any) {
      toast.error(err.message || 'Unable to download');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <Link href="/" className="auth-brand">
          <Brand />
        </Link>

        {error ? (
          <div className="shared-card">
            <span className="file-type">
              <WarningCircle size={22} weight="duotone" aria-hidden="true" />
            </span>
            <h1 className="heading" style={{ fontSize: '1.2rem' }}>
              Link not available
            </h1>
            <p className="muted" style={{ maxWidth: '34ch' }}>
              {error}. Public links stop working after 7 days.
            </p>
            <Link href="/" className="btn btn-secondary">
              Go to Vault
            </Link>
          </div>
        ) : info ? (
          <div className="shared-card">
            <span className="file-type">
              <FileTypeIcon name={info.original_filename} size={24} />
            </span>
            <h1
              className="heading"
              style={{ fontSize: '1.2rem', wordBreak: 'break-word' }}
            >
              {info.original_filename}
            </h1>
            <p className="brand-mono mt-2" style={{ fontSize: '0.7rem' }}>
              {formatBytes(info.file_size)}
              {info.mime_type ? ` · ${info.mime_type}` : ''}
              {' · '}
              {new Date(info.created_at).toLocaleDateString()}
            </p>
            <div className="row mt-4" style={{ justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={download} disabled={downloading}>
                {downloading ? 'Downloading…' : 'Download File'}
                {!downloading && <DownloadSimple size={16} weight="bold" aria-hidden="true" />}
              </button>
            </div>
            <p className="auth-note">
              <LockSimple size={11} weight="bold" aria-hidden="true" /> STREAMED FROM S3 OVER TLS
            </p>
          </div>
        ) : (
          <div className="row" style={{ justifyContent: 'center' }}>
            <span className="skeleton" style={{ width: '280px', height: '140px' }} />
          </div>
        )}
      </div>
    </div>
  );
}