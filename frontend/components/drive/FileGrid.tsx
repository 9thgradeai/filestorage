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
  GlobeHemisphereWest,
  CloudArrowUp,
  FolderPlus,
  CaretRight,
  ShareNetwork,
} from '@phosphor-icons/react';
import { FileTypeIcon, extensionOf } from '../FileTypeIcon';
import { formatBytes, formatDate } from '../../lib/format';
import { getCachedThumb, isThumbEligible, loadThumb } from '../../lib/thumbs';
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

export type FolderAction = 'rename' | 'move' | 'trash' | 'restore' | 'delete';

interface Props {
  folders: Folder[];
  files: DriveFile[];
  mode: DriveMode;
  view: 'grid' | 'list';
  loading: boolean;
  search?: string;
  selected: Set<number>;
  error?: string | null;
  filtersActive?: boolean;
  onRetry?: () => void;
  onToggleSelect: (id: number, shiftKey?: boolean) => void;
  onToggleSelectAll: () => void;
  onClearSelection: () => void;
  onOpenFolder: (id: number) => void;
  onOpenFile: (file: DriveFile) => void;
  onFileAction: (action: FileAction, file: DriveFile) => void;
  onBulkAction: (action: FileAction) => void;
  onFolderAction: (action: FolderAction, folder: Folder) => void;
  onMoveFilesToFolder: (fileIds: number[], folderId: number | null) => void;
  onUploadFilesToFolder: (files: File[], folderId: number) => void;
  onBrowseUpload: () => void;
}

interface MenuItem {
  label: string;
  icon: React.ElementType;
  danger?: boolean;
  onSelect: () => void;
}

// ── Shared portal menu (files + folders) ───────────────────────────────

function PortalMenu({
  label,
  items,
  anchor,
  onClose,
}: {
  label: string;
  items: MenuItem[];
  anchor: DOMRect;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const calcPosition = useCallback(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const menuW = 200;
    const menuH = Math.min(items.length * 38 + 12, 420);
    const gap = 6;

    let left = anchor.left;
    let top = anchor.bottom + gap;

    const below = vh - anchor.bottom;
    if (top + menuH > vh - gap && anchor.top > below) {
      top = Math.max(gap, anchor.top - menuH - gap);
    }

    left = Math.min(Math.max(left, gap), vw - menuW - gap);
    top = Math.min(Math.max(top, gap), Math.max(gap, vh - menuH - gap));

    setPos({ top, left });
  }, [anchor, items.length]);

  useEffect(() => {
    calcPosition();
    window.addEventListener('resize', calcPosition);
    return () => window.removeEventListener('resize', calcPosition);
  }, [calcPosition]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    // The menu is position:fixed — any container scroll would detach it from
    // its trigger, so close instead of floating out of place.
    const handleScroll = (e: Event) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (!menuRef.current) return;
      const buttons = Array.from(
        menuRef.current.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')
      );
      if (buttons.length === 0) return;
      const current = document.activeElement as HTMLButtonElement | null;
      let idx = buttons.indexOf(current as HTMLButtonElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        idx = idx < 0 ? 0 : Math.min(idx + 1, buttons.length - 1);
        buttons[idx].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        idx = idx < 0 ? buttons.length - 1 : Math.max(idx - 1, 0);
        buttons[idx].focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        buttons[0].focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        buttons[buttons.length - 1].focus();
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKey);
    document.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  useEffect(() => {
    menuRef.current
      ?.querySelector<HTMLButtonElement>('button[role="menuitem"]')
      ?.focus();
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
        aria-label={label}
      >
        {items.map((item) => (
          <button
            key={item.label}
            role="menuitem"
            className={item.danger ? 'danger' : ''}
            onClick={() => {
              item.onSelect();
              onClose();
            }}
          >
            <item.icon size={14} weight={item.danger ? 'bold' : 'bold'} /> {item.label}
          </button>
        ))}
      </div>
    </>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(menu, document.body);
}

function fileMenuItems(
  file: DriveFile,
  inTrash: boolean,
  onFileAction: Props['onFileAction']
): MenuItem[] {
  if (inTrash) {
    return [
      { label: 'Restore', icon: ArrowClockwise, onSelect: () => onFileAction('restore', file) },
      { label: 'Delete forever', icon: TrashSimple, danger: true, onSelect: () => onFileAction('delete', file) },
    ];
  }
  const items: MenuItem[] = [
    { label: 'Preview', icon: Eye, onSelect: () => onFileAction('preview', file) },
    { label: 'Download', icon: DownloadSimple, onSelect: () => onFileAction('download', file) },
    { label: 'Rename', icon: PencilSimple, onSelect: () => onFileAction('rename', file) },
    { label: 'Move', icon: ArrowsOut, onSelect: () => onFileAction('move', file) },
    {
      label: file.starred ? 'Unstar' : 'Star',
      icon: Star,
      onSelect: () => onFileAction(file.starred ? 'unstar' : 'star', file),
    },
  ];
  if (file.is_public) {
    items.push({ label: 'Copy link', icon: LinkSimple, onSelect: () => onFileAction('share', file) });
    items.push({ label: 'Make private', icon: EyeSlash, onSelect: () => onFileAction('makePrivate', file) });
  } else {
    items.push({ label: 'Make public', icon: GlobeHemisphereWest, onSelect: () => onFileAction('makePublic', file) });
  }
  items.push({
    label: 'Move to trash',
    icon: TrashSimple,
    danger: true,
    onSelect: () => onFileAction('trash', file),
  });
  return items;
}

function folderMenuItems(
  folder: Folder,
  onFolderAction: Props['onFolderAction']
): MenuItem[] {
  if (folder.trashed_at) {
    return [
      { label: 'Restore', icon: ArrowClockwise, onSelect: () => onFolderAction('restore', folder) },
      { label: 'Delete forever', icon: TrashSimple, danger: true, onSelect: () => onFolderAction('delete', folder) },
    ];
  }
  return [
    { label: 'Rename', icon: PencilSimple, onSelect: () => onFolderAction('rename', folder) },
    { label: 'Move', icon: ArrowsOut, onSelect: () => onFolderAction('move', folder) },
    { label: 'Move to trash', icon: TrashSimple, danger: true, onSelect: () => onFolderAction('trash', folder) },
  ];
}

// ── Thumbnails ─────────────────────────────────────────────────────────

function ThumbMedia({ file }: { file: DriveFile }) {
  const eligible = isThumbEligible(file.mime_type, file.file_size);
  const [url, setUrl] = useState<string | null>(() => (eligible ? getCachedThumb(file.id) : null));
  const [failed, setFailed] = useState(false);
  const holderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!holderRef.current) return;
    setUrl(eligible ? getCachedThumb(file.id) : null);
    setFailed(false);
  }, [file.id, eligible]);

  useEffect(() => {
    const el = holderRef.current;
    if (!el || !eligible || url || failed) return;

    let cancelled = false;
    let started = false;

    const start = () => {
      if (started || cancelled) return;
      started = true;
      loadThumb(file)
        .then((u) => {
          if (!cancelled) setUrl(u);
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((en) => en.isIntersecting)) {
          start();
          io.disconnect();
        }
      },
      { rootMargin: '320px' }
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [eligible, url, failed, file]);

  return (
    <div className={`card-media ${!url && !failed ? 'pending' : ''}`} ref={holderRef}>
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- blob URLs can't use next/image
        <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className="card-media-tile">
          <FileTypeIcon name={file.original_filename} size={34} />
          {extensionOf(file.original_filename) && (
            <span className="card-ext">{extensionOf(file.original_filename)}</span>
          )}
        </span>
      )}
      {file.is_public && (
        <span className="card-flag" title="Shared publicly">
          <GlobeHemisphereWest size={12} weight="fill" /> PUBLIC
        </span>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────

const DRAG_MIME = 'application/x-vault-file-ids';

export default function FileGrid({
  folders,
  files,
  mode,
  view,
  loading,
  search,
  selected,
  error,
  filtersActive,
  onRetry,
  onToggleSelect,
  onToggleSelectAll,
  onClearSelection,
  onOpenFolder,
  onOpenFile,
  onFileAction,
  onBulkAction,
  onFolderAction,
  onMoveFilesToFolder,
  onUploadFilesToFolder,
  onBrowseUpload,
}: Props) {
  const [fileMenu, setFileMenu] = useState<{ id: number; anchor: DOMRect } | null>(null);
  const [folderMenu, setFolderMenu] = useState<{ id: number; anchor: DOMRect } | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const lastClickedRef = useRef<number | null>(null);

  const inTrash = mode === 'trash';
  const anySelected = selected.size > 0;

  const openMenu = (
    e: React.MouseEvent,
    setter: (v: { id: number; anchor: DOMRect } | null) => void,
    id: number
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const current = setter === setFileMenu ? fileMenu : folderMenu;
    if (current?.id === id) {
      setter(null);
    } else {
      setter({ id, anchor: (e.currentTarget as HTMLElement).getBoundingClientRect() });
    }
  };

  const handleSelect = (file: DriveFile, shiftKey: boolean) => {
    const prevId = lastClickedRef.current;
    lastClickedRef.current = file.id;
    if (shiftKey && prevId !== null && prevId !== file.id) {
      const from = files.findIndex((f) => f.id === prevId);
      const to = files.findIndex((f) => f.id === file.id);
      if (from !== -1 && to !== -1) {
        const [a, b] = from < to ? [from, to] : [to, from];
        for (let i = a; i <= b; i++) {
          if (!selected.has(files[i].id)) onToggleSelect(files[i].id);
        }
        return;
      }
    }
    onToggleSelect(file.id);
  };

  // ── Drag & drop ──────────────────────────────────────────────────────

  const onFileDragStart = (e: React.DragEvent, file: DriveFile) => {
    // Dragging a card inside a multi-selection moves the whole selection.
    const ids = selected.has(file.id) ? [...selected] : [file.id];
    const payload = JSON.stringify(ids);
    e.dataTransfer.setData(DRAG_MIME, payload);
    e.dataTransfer.setData('text/plain', payload);
    e.dataTransfer.effectAllowed = 'move';
  };

  const folderDropHandlers = (folder: Folder) => ({
    onDragOver: (e: React.DragEvent) => {
      if (folder.trashed_at) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = e.dataTransfer.types.includes(DRAG_MIME) ? 'move' : 'copy';
      setDropTarget(folder.id);
    },
    onDragLeave: (e: React.DragEvent) => {
      e.stopPropagation();
      if (dropTarget === folder.id) setDropTarget(null);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation(); // keep the page-level uploader out of this
      setDropTarget(null);
      if (folder.trashed_at) return;

      const raw = e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData('text/plain');
      let ids: number[] = [];
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) ids = parsed.filter((n) => typeof n === 'number');
      } catch {
        // not an internal drag — fall through to OS file handling
      }

      const osFiles = Array.from(e.dataTransfer.files || []);
      if (ids.length > 0) {
        onMoveFilesToFolder(ids, folder.id);
      } else if (osFiles.length > 0) {
        onUploadFilesToFolder(osFiles, folder.id);
      }
    },
  });

  // ── Bulk bar (shared by both views, floats above content) ────────────

  const bulkBar = anySelected && (
    <div className="bulk-float" role="toolbar" aria-label="Actions for selected files">
      <span className="bulk-count">
        {selected.size} selected
        <button onClick={onClearSelection}>clear</button>
      </span>
      {!inTrash && (
        <>
          <button className="btn btn-secondary btn-sm" onClick={() => onBulkAction('download')}>
            <DownloadSimple size={14} weight="bold" /> Download
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => onBulkAction('star')}>
            <Star size={14} weight="bold" /> Star
          </button>
        </>
      )}
      {inTrash && (
        <button className="btn btn-secondary btn-sm" onClick={() => onBulkAction('restore')}>
          <ArrowClockwise size={14} weight="bold" /> Restore
        </button>
      )}
      <button className="btn btn-danger btn-sm" onClick={() => onBulkAction(inTrash ? 'delete' : 'trash')}>
        <TrashSimple size={14} weight="bold" /> {inTrash ? 'Delete forever' : 'Trash'}
      </button>
    </div>
  );

  // ── Grid view ────────────────────────────────────────────────────────

  if (view === 'grid') {
    return (
      <div className="drive-content">
        {bulkBar}

        {loading ? (
          <div className="file-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton skeleton-media-card" />
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={onRetry} />
        ) : folders.length === 0 && files.length === 0 ? (
          <EmptyState
            mode={mode}
            q={search}
            filtersActive={filtersActive}
            onBrowseUpload={onBrowseUpload}
          />
        ) : (
          <div className="file-grid">
            {folders.map((folder, i) => (
              <div
                key={`f-${folder.id}`}
                className={`file-card folder-card enter ${dropTarget === folder.id ? 'drop-target' : ''}`}
                style={{ animationDelay: `${Math.min(i * 26, 312)}ms` }}
                {...folderDropHandlers(folder)}
              >
                <div className="file-card-top">
                  <span className="file-kind-chip">FOLDER</span>
                  <button
                    className="btn-icon card-menu-btn"
                    aria-label={`Actions for ${folder.name}`}
                    aria-haspopup="menu"
                    onClick={(e) => openMenu(e, setFolderMenu, folder.id)}
                  >
                    <DotsThreeVertical size={15} weight="bold" />
                  </button>
                </div>
                <button
                  className="folder-card-main"
                  onClick={() => onOpenFolder(folder.id)}
                  title={folder.name}
                >
                  <span className="folder-card-icon">
                    <FolderIcon size={40} weight="duotone" />
                    <CaretRight size={16} weight="bold" className="folder-card-go" />
                  </span>
                  <span className="file-name">{folder.name}</span>
                </button>
                <p className="file-meta">{formatDate(folder.updated_at)}</p>

                {folderMenu?.id === folder.id && (
                  <PortalMenu
                    label={`Actions for ${folder.name}`}
                    items={folderMenuItems(folder, onFolderAction)}
                    anchor={folderMenu.anchor}
                    onClose={() => setFolderMenu(null)}
                  />
                )}
              </div>
            ))}

            {files.map((file, i) => (
              <div
                key={file.id}
                className={`file-card has-media enter ${selected.has(file.id) ? 'selected' : ''} ${
                  fileMenu?.id === file.id ? 'has-menu' : ''
                }`}
                style={{ animationDelay: `${Math.min((folders.length + i) * 26, 380)}ms` }}
                draggable
                onDragStart={(e) => onFileDragStart(e, file)}
              >
                <button className="card-open" onClick={() => onOpenFile(file)} aria-label={`Open ${file.original_filename}`}>
                  <ThumbMedia file={file} />
                </button>

                <div className="file-card-top">
                  <label className="drive-check" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(file.id)}
                      onChange={(e) => handleSelect(file, (e.nativeEvent as MouseEvent).shiftKey)}
                      aria-label={`Select ${file.original_filename}`}
                    />
                    <span className="drive-check-box" />
                  </label>
                  {file.starred && (
                    <Star size={13} weight="fill" className="drive-star" aria-label="Starred" />
                  )}
                </div>

                <button className="file-card-main" onClick={() => onOpenFile(file)}>
                  <span className="file-name" title={file.original_filename}>
                    {file.original_filename}
                  </span>
                </button>
                <p className="file-meta">
                  {formatBytes(file.file_size)} · {timeOrDate(file.created_at)}
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
                  {file.is_public && (
                    <span className="badge badge-green share-pill" title="Shared publicly">
                      <GlobeHemisphereWest size={11} weight="fill" /> SHARED
                    </span>
                  )}
                  <span className="file-actions-spacer" />
                  <button
                    className="btn-icon card-menu-btn"
                    aria-label="More actions"
                    aria-haspopup="menu"
                    title="More actions"
                    onClick={(e) => openMenu(e, setFileMenu, file.id)}
                  >
                    <DotsThreeVertical size={15} weight="bold" />
                  </button>
                </div>

                {fileMenu?.id === file.id && (
                  <PortalMenu
                    label="File actions"
                    items={fileMenuItems(file, inTrash, onFileAction)}
                    anchor={fileMenu.anchor}
                    onClose={() => setFileMenu(null)}
                  />
                )}
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
      {bulkBar}

      {loading ? (
        <div className="drive-list">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: '52px' }} />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : folders.length === 0 && files.length === 0 ? (
        <EmptyState
          mode={mode}
          q={search}
          filtersActive={filtersActive}
          onBrowseUpload={onBrowseUpload}
        />
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

          {folders.map((folder, i) => (
            <div
              key={`f-${folder.id}`}
              className={`drive-list-row folder-row enter ${dropTarget === folder.id ? 'drop-target' : ''}`}
              style={{ animationDelay: `${Math.min(i * 20, 240)}ms` }}
              {...folderDropHandlers(folder)}
            >
              <span className="drive-folder-glyph" aria-hidden="true">
                <FolderIcon size={17} weight="duotone" />
              </span>
              <button className="drive-list-name" onClick={() => onOpenFolder(folder.id)}>
                <span>{folder.name}</span>
              </button>
              <span className="drive-list-dim">Folder</span>
              <span className="drive-list-dim">—</span>
              <span className="drive-list-dim">{formatDate(folder.updated_at)}</span>
              <span className="drive-list-actions">
                <button
                  className="btn-icon"
                  aria-label={`Actions for ${folder.name}`}
                  aria-haspopup="menu"
                  onClick={(e) => openMenu(e, setFolderMenu, folder.id)}
                >
                  <DotsThreeVertical size={15} weight="bold" />
                </button>
              </span>
              {folderMenu?.id === folder.id && (
                <PortalMenu
                  label={`Actions for ${folder.name}`}
                  items={folderMenuItems(folder, onFolderAction)}
                  anchor={folderMenu.anchor}
                  onClose={() => setFolderMenu(null)}
                />
              )}
            </div>
          ))}

          {files.map((file, i) => (
            <div
              key={file.id}
              className={`drive-list-row enter ${selected.has(file.id) ? 'selected' : ''} ${
                fileMenu?.id === file.id ? 'has-menu' : ''
              }`}
              style={{ animationDelay: `${Math.min((folders.length + i) * 20, 300)}ms` }}
              draggable
              onDragStart={(e) => onFileDragStart(e, file)}
            >
              <label className="drive-check" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selected.has(file.id)}
                  onChange={(e) => handleSelect(file, (e.nativeEvent as MouseEvent).shiftKey)}
                  aria-label={`Select ${file.original_filename}`}
                />
                <span className="drive-check-box" />
              </label>
              <button className="drive-list-name" onClick={() => onOpenFile(file)}>
                <ListThumb file={file} />
                <span>{file.original_filename}</span>
                {file.starred && <Star size={12} weight="fill" className="drive-star" />}
                {file.is_public && (
                  <GlobeHemisphereWest
                    size={12}
                    weight="fill"
                    className="drive-public-dot"
                    aria-label="Shared publicly"
                  />
                )}
              </button>
              <span className="drive-list-dim">
                {file.mime_type ? file.mime_type.split('/')[0] : 'file'}
              </span>
              <span className="drive-list-dim">{formatBytes(file.file_size)}</span>
              <span className="drive-list-dim">{formatDate(file.updated_at)}</span>
              <span className="drive-list-actions">
                <button
                  className="btn-icon"
                  aria-label="More actions"
                  aria-haspopup="menu"
                  onClick={(e) => openMenu(e, setFileMenu, file.id)}
                >
                  <DotsThreeVertical size={15} weight="bold" />
                </button>
              </span>
              {fileMenu?.id === file.id && (
                <PortalMenu
                  label="File actions"
                  items={fileMenuItems(file, inTrash, onFileAction)}
                  anchor={fileMenu.anchor}
                  onClose={() => setFileMenu(null)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ListThumb({ file }: { file: DriveFile }) {
  const eligible = isThumbEligible(file.mime_type, file.file_size);
  const [url, setUrl] = useState<string | null>(() => (eligible ? getCachedThumb(file.id) : null));
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !eligible || url) return;

    let cancelled = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((en) => en.isIntersecting)) {
          loadThumb(file)
            .then((u) => {
              if (!cancelled) setUrl(u);
            })
            .catch(() => {});
          io.disconnect();
        }
      },
      { rootMargin: '260px' }
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [eligible, url, file]);

  return (
    <span className="list-thumb" ref={ref}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- blob URLs can't use next/image
        <img src={url} alt="" loading="lazy" />
      ) : (
        <FileTypeIcon name={file.original_filename} size={17} />
      )}
    </span>
  );
}

function timeOrDate(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 7 * 24 * 3600 * 1000) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return formatDate(iso);
}

// ── States ─────────────────────────────────────────────────────────────

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

function EmptyState({
  mode,
  q,
  filtersActive,
  onBrowseUpload,
}: {
  mode: DriveMode;
  q?: string;
  filtersActive?: boolean;
  onBrowseUpload: () => void;
}) {
  if ((q && q.trim()) || filtersActive) {
    return (
      <div className="dashboard-empty">
        <span className="empty-icon">
          <Files size={26} weight="duotone" />
        </span>
        <div>
          <h3 className="heading" style={{ fontSize: '1.15rem' }}>
            No matching files
          </h3>
          <p className="muted mt-2" style={{ maxWidth: '44ch', margin: '0.5rem auto 0' }}>
            Try a different name or filter, or clear them to see everything.
          </p>
        </div>
      </div>
    );
  }

  if (mode === 'all') {
    return (
      <div className="empty-hero">
        <div className="empty-dropzone">
          <span className="empty-dropzone-icon">
            <CloudArrowUp size={30} weight="duotone" />
          </span>
          <h3>Your vault is ready</h3>
          <p>Drag &amp; drop files anywhere on this page, or add your first file.</p>
          <div className="empty-dropzone-actions">
            <button type="button" className="btn btn-primary" onClick={onBrowseUpload}>
              <CloudArrowUp size={15} weight="bold" /> Browse files
            </button>
          </div>
        </div>
        <ol className="empty-steps">
          <li>
            <span className="empty-step-num">01</span>
            <span>Upload — drop files here or press the Upload button.</span>
          </li>
          <li>
            <span className="empty-step-num">02</span>
            <span>
              Organize — group them in folders
              <FolderPlus size={13} weight="duotone" style={{ verticalAlign: '-2px', margin: '0 2px' }} />
              and star what matters.
            </span>
          </li>
          <li>
            <span className="empty-step-num">03</span>
            <span>
              Share — flip any file public
              <ShareNetwork size={13} weight="duotone" style={{ verticalAlign: '-2px', margin: '0 2px' }} />
              and send a link.
            </span>
          </li>
        </ol>
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
