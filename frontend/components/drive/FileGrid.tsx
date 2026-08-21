'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Folder as FolderIcon,
  DownloadSimple,
  LinkSimple,
  Eye,
  EyeSlash,
  Star,
  TrashSimple,
  ArrowClockwise,
  PencilSimple,
  ArrowsOut,
  DotsThreeVertical,
  Files,
  WarningCircle,
} from '@phosphor-icons/react';
import { FileTypeIcon } from '../FileTypeIcon';
import { formatBytes, formatDate } from '../../lib/format';
import type { DriveFile, Folder, DriveMode } from '../../lib/drive';

export type FileAction =
  | 'preview'
  | 'download'
  | 'rename'
  | 'move'
  | 'star'
  | 'unstar'
  | 'share'
  | 'makePublic'
  | 'makePrivate'
  | 'trash'
  | 'restore'
  | 'delete';

interface Props {
  folders: Folder[];
  files: DriveFile[];
  mode: DriveMode;
  view: 'grid' | 'list';
  loading: boolean;
  search?: string;
  selected: Set<number>;
  error?: string | null;
  onRetry?: () => void;
  onToggleSelect: (id: number) => void;
  onToggleSelectAll: () => void;
  onClearSelection: () => void;
  onOpenFolder: (id: number) => void;
  onOpenFile: (file: DriveFile) => void;
  onFileAction: (action: FileAction, file: DriveFile) => void;
  onBulkAction: (action: FileAction) => void;
}

export default function FileGrid({
  folders,
  files,
  mode,
  view,
  loading,
  search,
  selected,
  error,
  onRetry,
  onToggleSelect,
  onToggleSelectAll,
  onClearSelection,
  onOpenFolder,
  onOpenFile,
  onFileAction,
  onBulkAction,
}: Props) {
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const inTrash = mode === 'trash';
  const anySelected = selected.size > 0;

  // ── Grid view ────────────────────────────────────────────────────────
  if (view === 'grid') {
    return (
      <div className="drive-content">
        {anySelected && (
          <BulkBar
            count={selected.size}
            inTrash={inTrash}
            onClear={onClearSelection}
            onDownload={() => onBulkAction('download')}
            onStar={() => onBulkAction('star')}
            onTrash={() => onBulkAction(inTrash ? 'delete' : 'trash')}
          />
        )}

        {loading ? (
          <div className="file-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: '168px' }} />
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={onRetry} />
        ) : folders.length === 0 && files.length === 0 ? (
          <EmptyState mode={mode} q={search} />
        ) : (
          <div className="file-grid">
            {folders.map((folder) => (
              <div key={`f-${folder.id}`} className="file-card folder-card">
                <button className="file-card-main" onClick={() => onOpenFolder(folder.id)}>
                  <span className="file-type file-type-folder">
                    <FolderIcon size={22} weight="duotone" />
                  </span>
                  <span className="file-name" title={folder.name}>
                    {folder.name}
                  </span>
                </button>
                <p className="file-meta">
                  FOLDER · {formatDate(folder.updated_at)}
                </p>
              </div>
            ))}

            {files.map((file) => (
              <div
                key={file.id}
                className={`file-card ${selected.has(file.id) ? 'selected' : ''} ${menuFor === file.id ? 'has-menu' : ''}`}
              >
                <div className="file-card-top">
                  <label className="drive-check">
                    <input
                      type="checkbox"
                      checked={selected.has(file.id)}
                      onChange={() => onToggleSelect(file.id)}
                      aria-label={`Select ${file.original_filename}`}
                    />
                    <span className="drive-check-box" />
                  </label>
                  {file.starred && (
                    <Star size={13} weight="fill" className="drive-star" aria-label="Starred" />
                  )}
                </div>
                <button
                  className="file-card-main"
                  onClick={() => onOpenFile(file)}
                >
                  <span className="file-type">
                    <FileTypeIcon name={file.original_filename} size={24} />
                  </span>
                  <span className="file-name" title={file.original_filename}>
                    {file.original_filename}
                  </span>
                </button>
                <p className="file-meta">
                  {formatBytes(file.file_size)} · {formatDate(file.created_at)}
                </p>
                <div className="file-actions">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => onFileAction('preview', file)}
                    aria-label="Preview"
                    title="Preview"
                  >
                    <Eye size={15} weight="bold" />
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => onFileAction(file.starred ? 'unstar' : 'star', file)}
                    aria-label={file.starred ? 'Unstar' : 'Star'}
                    title={file.starred ? 'Unstar' : 'Star'}
                  >
                    <Star size={15} weight={file.starred ? 'fill' : 'bold'} />
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => onFileAction('download', file)}
                    aria-label="Download"
                    title="Download"
                  >
                    <DownloadSimple size={15} weight="bold" />
                  </button>
                  <span style={{ flex: 1 }} />
                  <button
                    className="btn btn-secondary btn-sm"
onClick={(e) => {
                      e.stopPropagation();
                      if (menuFor === file.id) {
                        setMenuFor(null);
                        setMenuAnchor(null);
                      } else {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setMenuFor(file.id);
                        setMenuAnchor(rect);
                      }
                    }}
                    aria-label="More actions"
                    title="More actions"
                  >
                    <DotsThreeVertical size={15} weight="bold" />
                  </button>
                  {menuFor === file.id && menuAnchor && (
                    <FileContextMenu
                      file={file}
                      inTrash={inTrash}
                      anchor={menuAnchor}
                      onFileAction={onFileAction}
                      onClose={() => { setMenuFor(null); setMenuAnchor(null); }}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────────────────
  const allSelected = files.length > 0 && files.every((f) => selected.has(f.id));

  return (
    <div className="drive-content">
      {anySelected && (
        <BulkBar
          count={selected.size}
          inTrash={inTrash}
          onClear={onClearSelection}
          onDownload={() => onBulkAction('download')}
          onStar={() => onBulkAction('star')}
          onTrash={() => onBulkAction(inTrash ? 'delete' : 'trash')}
        />
      )}

      {loading ? (
        <div className="drive-list">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: '52px' }} />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : folders.length === 0 && files.length === 0 ? (
        <EmptyState mode={mode} q={search} />
      ) : (
        <div className="drive-list">
          <div className="drive-list-head">
            <label className="drive-check">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                aria-label="Select all"
              />
              <span className="drive-check-box" />
            </label>
            <span>Name</span>
            <span>Type</span>
            <span>Size</span>
            <span>Modified</span>
            <span aria-hidden="true" />
          </div>

          {folders.map((folder) => (
            <div key={`f-${folder.id}`} className="drive-list-row folder-row">
              <label className="drive-check" onClick={(e) => e.stopPropagation()}>
                <span className="drive-check-box drive-check-off" />
              </label>
              <button className="drive-list-name" onClick={() => onOpenFolder(folder.id)}>
                <FolderIcon size={17} weight="duotone" className="drive-folder-icon" />
                <span>{folder.name}</span>
              </button>
              <span className="drive-list-dim">Folder</span>
              <span className="drive-list-dim">—</span>
              <span className="drive-list-dim">{formatDate(folder.updated_at)}</span>
              <span aria-hidden="true" />
            </div>
          ))}

          {files.map((file) => (
            <div key={file.id} className={`drive-list-row ${selected.has(file.id) ? 'selected' : ''} ${menuFor === file.id ? 'has-menu' : ''}`}>
              <label className="drive-check" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selected.has(file.id)}
                  onChange={() => onToggleSelect(file.id)}
                  aria-label={`Select ${file.original_filename}`}
                />
                <span className="drive-check-box" />
              </label>
              <button className="drive-list-name" onClick={() => onOpenFile(file)}>
                <FileTypeIcon name={file.original_filename} size={17} />
                <span>{file.original_filename}</span>
                {file.starred && <Star size={12} weight="fill" className="drive-star" />}
              </button>
              <span className="drive-list-dim">
                {file.mime_type ? file.mime_type.split('/')[0] : 'file'}
              </span>
              <span className="drive-list-dim">{formatBytes(file.file_size)}</span>
              <span className="drive-list-dim">{formatDate(file.updated_at)}</span>
              <span className="drive-list-actions">
                <button
                  className="btn-icon"
                  aria-label="Preview"
                  onClick={() => onFileAction('preview', file)}
                >
                  <Eye size={15} weight="bold" />
                </button>
                <button
                  className="btn-icon"
                  aria-label={file.starred ? 'Unstar' : 'Star'}
                  onClick={() => onFileAction(file.starred ? 'unstar' : 'star', file)}
                >
                  <Star size={15} weight={file.starred ? 'fill' : 'bold'} />
                </button>
                <button
                  className="btn-icon"
                  aria-label="Download"
                  onClick={() => onFileAction('download', file)}
                >
                  <DownloadSimple size={15} weight="bold" />
                </button>
                <button
                  className="btn-icon"
                  aria-label="More actions"
                  onClick={(e) => {
                      e.stopPropagation();
                      if (menuFor === file.id) {
                        setMenuFor(null);
                        setMenuAnchor(null);
                      } else {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setMenuFor(file.id);
                        setMenuAnchor(rect);
                      }
                    }}
                >
                  <DotsThreeVertical size={15} weight="bold" />
                </button>
                {menuFor === file.id && menuAnchor && (
                  <FileContextMenu
                    file={file}
                    inTrash={inTrash}
                    anchor={menuAnchor}
                    onFileAction={onFileAction}
                    onClose={() => { setMenuFor(null); setMenuAnchor(null); }}
                  />
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FileContextMenu({
  file,
  inTrash,
  anchor,
  onFileAction,
  onClose,
}: {
  file: DriveFile;
  inTrash: boolean;
  anchor: DOMRect;
  onFileAction: (action: FileAction, file: DriveFile) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const calcPosition = useCallback(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const menuW = 200;
    const menuH = inTrash ? 100 : 340;
    const gap = 6;

    let left = anchor.right - menuW;
    let top = anchor.bottom + gap;

    // If menu would go below viewport, open upward
    if (top + menuH > vh) {
      top = anchor.top - menuH - gap;
    }
    // If still off-screen, clamp to viewport
    if (top < gap) top = gap;

    // Horizontal: keep within viewport
    if (left < gap) left = gap;
    if (left + menuW > vw - gap) left = vw - menuW - gap;

    setPos({ top, left });
  }, [anchor, inTrash]);

  useEffect(() => {
    calcPosition();
    window.addEventListener('resize', calcPosition);
    return () => window.removeEventListener('resize', calcPosition);
  }, [calcPosition]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      // Roving-focus arrow navigation between menu items.
      if (!menuRef.current) return;
      const items = Array.from(
        menuRef.current.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')
      ).filter((el) => !el.hasAttribute('disabled'));
      if (items.length === 0) return;
      const current = document.activeElement as HTMLButtonElement | null;
      let idx = items.indexOf(current as HTMLButtonElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        idx = idx < 0 ? 0 : Math.min(idx + 1, items.length - 1);
        items[idx].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        idx = idx < 0 ? items.length - 1 : Math.max(idx - 1, 0);
        items[idx].focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        items[0].focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        items[items.length - 1].focus();
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Focus the first menu item on open so keyboard users land inside the menu.
  useEffect(() => {
    const first = menuRef.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]');
    first?.focus();
  }, []);

  const menu = (
    <>
      <div className="drive-menu-backdrop" onClick={onClose} />
      <div
        className="drive-menu drive-menu-portal"
        onClick={(e) => e.stopPropagation()}
        ref={menuRef}
        style={{ position: 'fixed', top: pos.top, left: pos.left }}
        role="menu"
        aria-label="File actions"
      >
      {inTrash ? (
        <>
          <button role="menuitem" onClick={() => { onFileAction('restore', file); onClose(); }}>
            <ArrowClockwise size={14} weight="bold" /> Restore
          </button>
          <button role="menuitem" className="danger" onClick={() => { onFileAction('delete', file); onClose(); }}>
            <TrashSimple size={14} weight="bold" /> Delete forever
          </button>
        </>
      ) : (
        <>
          <button role="menuitem" onClick={() => { onFileAction('preview', file); onClose(); }}>
            <Eye size={14} weight="bold" /> Preview
          </button>
          <button role="menuitem" onClick={() => { onFileAction('download', file); onClose(); }}>
            <DownloadSimple size={14} weight="bold" /> Download
          </button>
          <button role="menuitem" onClick={() => { onFileAction('rename', file); onClose(); }}>
            <PencilSimple size={14} weight="bold" /> Rename
          </button>
          <button role="menuitem" onClick={() => { onFileAction('move', file); onClose(); }}>
            <ArrowsOut size={14} weight="bold" /> Move
          </button>
          <button role="menuitem" onClick={() => { onFileAction(file.starred ? 'unstar' : 'star', file); onClose(); }}>
            <Star size={14} weight={file.starred ? 'fill' : 'bold'} /> {file.starred ? 'Unstar' : 'Star'}
          </button>
          {file.is_public ? (
            <button role="menuitem" onClick={() => { onFileAction('share', file); onClose(); }}>
              <LinkSimple size={14} weight="bold" /> Copy link
            </button>
          ) : (
            <button role="menuitem" onClick={() => { onFileAction('makePublic', file); onClose(); }}>
              <LinkSimple size={14} weight="bold" /> Make public
            </button>
          )}
          {file.is_public && (
            <button role="menuitem" onClick={() => { onFileAction('makePrivate', file); onClose(); }}>
              <EyeSlash size={14} weight="bold" /> Make private
            </button>
          )}
          <button role="menuitem" className="danger" onClick={() => { onFileAction('trash', file); onClose(); }}>
            <TrashSimple size={14} weight="bold" /> Move to trash
          </button>
        </>
      )}
      </div>
    </>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(menu, document.body);
}

function BulkBar({
  count,
  inTrash,
  onClear,
  onDownload,
  onStar,
  onTrash,
}: {
  count: number;
  inTrash: boolean;
  onClear: () => void;
  onDownload: () => void;
  onStar: () => void;
  onTrash: () => void;
}) {
  return (
    <div className="drive-bulkbar">
      <span className="drive-bulk-count">
        {count} SELECTED <button onClick={onClear}>clear</button>
      </span>
      {!inTrash && (
        <>
          <button className="btn btn-secondary btn-sm" onClick={onDownload}>
            <DownloadSimple size={14} weight="bold" /> Download
          </button>
          <button className="btn btn-secondary btn-sm" onClick={onStar}>
            <Star size={14} weight="bold" /> Star
          </button>
        </>
      )}
      <button className="btn btn-danger btn-sm" onClick={onTrash}>
        <TrashSimple size={14} weight="bold" /> {inTrash ? 'Delete' : 'Trash'}
      </button>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="drive-error-state" role="alert">
      <WarningCircle size={36} weight="duotone" />
      <h3>Couldn&apos;t load your files</h3>
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="btn btn-primary btn-sm" onClick={onRetry}>
          <ArrowClockwise size={14} weight="bold" /> Try again
        </button>
      )}
    </div>
  );
}

function EmptyState({ mode, q }: { mode: DriveMode; q?: string }) {
  if (q && q.trim()) {
    return (
      <div className="dashboard-empty">
        <span className="empty-icon">
          <Files size={26} weight="duotone" />
        </span>
        <div>
          <h3 className="heading" style={{ fontSize: '1.15rem' }}>
            No results for “{q.trim()}”
          </h3>
          <p className="muted mt-2" style={{ maxWidth: '44ch', margin: '0.5rem auto 0' }}>
            Try a different name, or clear the search to see everything.
          </p>
        </div>
      </div>
    );
  }
  const label =
    mode === 'trash'
      ? 'Trash is empty'
      : mode === 'starred'
        ? 'No starred files yet'
        : mode === 'recent'
          ? 'No files uploaded yet'
          : 'Nothing here yet';
  const hint =
    mode === 'trash'
      ? 'Deleted files appear here and can be restored.'
      : mode === 'starred'
        ? 'Star files to pin them here for quick access.'
        : mode === 'recent'
          ? 'Upload a file and it will show up here.'
          : 'Drag files anywhere on this page to upload, or use the Upload button.';
  return (
    <div className="dashboard-empty">
      <span className="empty-icon">
        <Files size={26} weight="duotone" />
      </span>
      <div>
        <h3 className="heading" style={{ fontSize: '1.15rem' }}>
          {label}
        </h3>
        <p className="muted mt-2" style={{ maxWidth: '44ch', margin: '0.5rem auto 0' }}>
          {hint}
        </p>
      </div>
    </div>
  );
}