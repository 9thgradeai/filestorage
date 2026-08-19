'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  CloudArrowUp,
  DownloadSimple,
  LinkSimple,
  Eye,
  EyeSlash,
  TrashSimple,
  SignOut,
  UploadSimple,
  Files,
} from '@phosphor-icons/react';
import { useAuth } from '../../lib/auth';
import { api, downloadFile } from '../../lib/api';
import { Brand } from '../../components/Brand';
import { FileTypeIcon } from '../../components/FileTypeIcon';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // mirror backend default (100MB)
const PAGE_SIZE = 12;

interface FileItem {
  id: number;
  original_filename: string;
  file_size: number;
  mime_type: string | null;
  is_public: boolean;
  share_token: string | null;
  share_expires_at: string | null;
  created_at: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function precheckUpload(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return `File is ${formatBytes(file.size)}; the limit is ${formatBytes(MAX_FILE_SIZE)}.`;
  }
  if (file.size === 0) return 'Empty files are not allowed.';
  return null;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch without synchronous setState so it is safe to call from an effect.
  const loadFiles = useCallback(async (page = 1) => {
    try {
      const data = await api.get<{ files: FileItem[]; pagination: Pagination }>(
        `/api/files?page=${page}&limit=${PAGE_SIZE}`
      );
      setFiles(data.files);
      setPagination(data.pagination);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    loadFiles(1);
  }, [authLoading, user, router, loadFiles]);

  const goToPage = (page: number) => {
    setLoading(true);
    loadFiles(page);
  };

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const precheckError = precheckUpload(file);
    if (precheckError) {
      toast.error(precheckError);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploading(true);
    setProgress(0);

    const form = new FormData();
    form.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/files/upload');
    xhr.withCredentials = true;
    const csrf = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/)?.[1];
    if (csrf) xhr.setRequestHeader('X-CSRF-Token', decodeURIComponent(csrf));

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100));
    };
    xhr.onload = () => {
      setUploading(false);
      setProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (xhr.status >= 200 && xhr.status < 300) {
        toast.success(`Uploaded "${file.name}"`);
        setLoading(true);
        loadFiles(pagination.page);
      } else {
        let message = 'Upload failed';
        try {
          message = JSON.parse(xhr.responseText).message || message;
        } catch {
          // non-JSON error body
        }
        toast.error(message);
      }
    };
    xhr.onerror = () => {
      setUploading(false);
      setProgress(0);
      toast.error('Network error during upload');
    };
    xhr.send(form);
  }

  async function togglePublic(f: FileItem) {
    try {
      await api.put(`/api/files/${f.id}/toggle-public`, { is_public: !f.is_public });
      toast.success(f.is_public ? 'File is now private' : 'File is now public');
      setLoading(true);
      loadFiles(pagination.page);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update file');
    }
  }

  async function generateShare(f: FileItem) {
    try {
      const data = await api.post<{ share_url: string }>(`/api/files/${f.id}/share`);
      await navigator.clipboard.writeText(data.share_url);
      toast.success('Share link copied to clipboard');
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate link');
    }
  }

  async function removeFile(f: FileItem) {
    if (!window.confirm(`Delete "${f.original_filename}"?`)) return;
    try {
      await api.delete(`/api/files/${f.id}`);
      toast.success('File deleted');
      setLoading(true);
      loadFiles(pagination.page);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete file');
    }
  }

  async function download(f: FileItem) {
    try {
      const { blob, filename } = await downloadFile(`/api/files/${f.id}/download`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err.message || 'Download failed');
    }
  }

  const totalPages = Math.max(1, pagination.totalPages);

  return (
    <div>
      <nav className="nav">
        <Link href="/">
          <Brand />
        </Link>
        <div className="nav-links">
          <span className="brand-mono">{user?.email}</span>
          <button
            className="btn btn-ghost btn-sm"
            aria-label="Logout"
            onClick={() => {
              logout();
              router.push('/');
            }}
          >
            <SignOut size={15} weight="bold" />
            Logout
          </button>
        </div>
      </nav>

      <div className="page page-glow">
        <div className="row space-between mb-6" style={{ flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="heading">My Files</h1>
            {!loading && files.length > 0 && (
              <p className="brand-mono mt-2" style={{ fontSize: '0.68rem' }}>
                {pagination.total} FILE{pagination.total === 1 ? '' : 'S'} · AES-256 ENCRYPTED
              </p>
            )}
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleUpload}
              style={{ display: 'none' }}
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className={`btn btn-primary ${uploading ? 'disabled' : ''}`}
            >
              {uploading ? (
                <>Uploading {progress}%</>
              ) : (
                <>
                  <CloudArrowUp size={17} weight="bold" />
                  Upload File
                </>
              )}
            </label>
          </div>
        </div>

        {uploading && (
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        )}

        {loading ? (
          <div className="file-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: '138px' }} />
            ))}
          </div>
        ) : files.length === 0 ? (
          <div className="dashboard-empty">
            <span className="empty-icon">
              <Files size={26} weight="duotone" />
            </span>
            <div>
              <h3 className="heading" style={{ fontSize: '1.15rem' }}>
                No files yet
              </h3>
              <p className="muted mt-2" style={{ maxWidth: '40ch', margin: '0.5rem auto 0' }}>
                Upload your first file to get started. It will be validated by content, not just
                its name.
              </p>
            </div>
            <label htmlFor="file-upload" className="btn btn-primary">
              <UploadSimple size={16} weight="bold" />
              Upload your first file
            </label>
          </div>
        ) : (
          <>
            <div className="file-grid">
              {files.map((f) => (
                <div key={f.id} className="file-card">
                  <div className="row space-between">
                    <div className="row" style={{ minWidth: 0 }}>
                      <span className="file-type">
                        <FileTypeIcon name={f.original_filename} size={19} />
                      </span>
                      <span
                        className="file-name"
                        title={f.original_filename}
                      >
                        {f.original_filename}
                      </span>
                    </div>
                    <span className={`badge ${f.is_public ? 'badge-green' : 'badge-yellow'}`}>
                      {f.is_public ? 'Public' : 'Private'}
                    </span>
                  </div>
                  <p className="file-meta">
                    {formatBytes(f.file_size)} · {new Date(f.created_at).toLocaleDateString()}
                  </p>
                  <div className="file-actions">
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => download(f)}
                      aria-label="Download"
                      title="Download"
                    >
                      <DownloadSimple size={15} weight="bold" />
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => togglePublic(f)}
                      aria-label={f.is_public ? 'Make private' : 'Make public'}
                      title={f.is_public ? 'Make private' : 'Make public'}
                    >
                      {f.is_public ? (
                        <EyeSlash size={15} weight="bold" />
                      ) : (
                        <Eye size={15} weight="bold" />
                      )}
                    </button>
                    {f.is_public && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => generateShare(f)}
                        aria-label="Copy share link"
                        title="Copy share link"
                      >
                        <LinkSimple size={15} weight="bold" />
                      </button>
                    )}
                    <span style={{ flex: 1 }} />
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => removeFile(f)}
                      aria-label="Delete"
                      title="Delete"
                    >
                      <TrashSimple size={15} weight="bold" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="pagination">
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={pagination.page <= 1}
                  onClick={() => goToPage(pagination.page - 1)}
                >
                  ← Prev
                </button>
                <span className="pagination-info">
                  PAGE {pagination.page} OF {totalPages}
                </span>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={pagination.page >= totalPages}
                  onClick={() => goToPage(pagination.page + 1)}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}