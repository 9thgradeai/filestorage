'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MagnifyingGlass,
  CloudArrowUp,
  FolderPlus,
  HouseSimple,
  Clock,
  Star,
  TrashSimple,
  GridFour,
  List as ListIcon,
  GearSix,
  Folder as FolderIcon,
  ArrowBendDownLeft,
} from '@phosphor-icons/react';
import { FileTypeIcon } from '../FileTypeIcon';
import { formatBytes, timeAgo } from '../../lib/format';
import { driveApi, type DriveFile, type DriveMode, type Folder } from '../../lib/drive';

interface Props {
  open: boolean;
  onClose: () => void;
  folders: Folder[];
  view: 'grid' | 'list';
  onNavigate: (mode: DriveMode, folderId: number | null) => void;
  onNewFolder: () => void;
  onUploadClick: () => void;
  onToggleView: () => void;
  onOpenSettings: () => void;
  onOpenFile: (file: DriveFile) => void;
  onOpenFolder: (id: number) => void;
  onSearchAll: (q: string) => void;
}

interface ActionItem {
  kind: 'action';
  id: string;
  label: string;
  hint?: string;
  kbd?: string;
  icon: React.ElementType;
  keywords?: string;
  run: () => void;
}

type Item =
  | ActionItem
  | { kind: 'file'; file: DriveFile }
  | { kind: 'folder'; folder: Folder };

export default function CommandPalette({
  open,
  onClose,
  folders,
  view,
  onNavigate,
  onNewFolder,
  onUploadClick,
  onToggleView,
  onOpenSettings,
  onOpenFile,
  onOpenFolder,
  onSearchAll,
}: Props) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [results, setResults] = useState<DriveFile[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Fresh state each time the palette opens; autoFocus lands focus in the
  // input synchronously during mount.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    setResults([]);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Debounced server search once the query is long enough to be meaningful.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      setSearchFailed(false);
      return;
    }
    setSearching(true);
    setSearchFailed(false);
    let cancelled = false;
    const t = setTimeout(() => {
      driveApi
        .listFiles({ q, limit: 6 })
        .then((data) => {
          if (!cancelled) setResults(data.files);
        })
        .catch(() => {
          if (!cancelled) {
            setResults([]);
            setSearchFailed(true);
          }
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open]);

  const actions: ActionItem[] = useMemo(
    () => [
      {
        kind: 'action',
        id: 'upload',
        label: 'Upload files',
        hint: 'Add files to the current folder',
        icon: CloudArrowUp,
        keywords: 'add new attach',
        run: onUploadClick,
      },
      {
        kind: 'action',
        id: 'new-folder',
        label: 'New folder',
        hint: 'Create a folder here',
        icon: FolderPlus,
        keywords: 'create directory',
        run: onNewFolder,
      },
      {
        kind: 'action',
        id: 'go-all',
        label: 'My Files',
        hint: 'Browse everything at root',
        icon: HouseSimple,
        run: () => onNavigate('all', null),
      },
      {
        kind: 'action',
        id: 'go-recent',
        label: 'Recent',
        hint: 'Latest uploads first',
        icon: Clock,
        run: () => onNavigate('recent', null),
      },
      {
        kind: 'action',
        id: 'go-starred',
        label: 'Starred',
        hint: 'Files you flagged',
        icon: Star,
        run: () => onNavigate('starred', null),
      },
      {
        kind: 'action',
        id: 'go-trash',
        label: 'Trash',
        hint: 'Deleted items',
        icon: TrashSimple,
        run: () => onNavigate('trash', null),
      },
      {
        kind: 'action',
        id: 'toggle-view',
        label: `Switch to ${view === 'grid' ? 'list' : 'grid'} view`,
        hint: 'Change how files are displayed',
        icon: view === 'grid' ? ListIcon : GridFour,
        run: onToggleView,
      },
      {
        kind: 'action',
        id: 'settings',
        label: 'Open settings',
        hint: 'Account, security, storage',
        icon: GearSix,
        run: onOpenSettings,
      },
    ],
    [view, onUploadClick, onNewFolder, onNavigate, onToggleView, onOpenSettings]
  );

  const q = query.trim().toLowerCase();

  const filteredActions = useMemo(
    () =>
      (q
        ? actions.filter(
            (a) =>
              a.label.toLowerCase().includes(q) ||
              (a.keywords || '').toLowerCase().includes(q)
          )
        : actions.slice(0, 5)
      ).map((a) => a),
    [actions, q]
  );

  const folderHits = useMemo(() => {
    if (!q) return [];
    return folders
      .filter((f) => !f.trashed_at && f.name.toLowerCase().includes(q))
      .slice(0, 4);
  }, [folders, q]);

  const sections = useMemo(() => {
    const out: { title: string; items: Item[] }[] = [];
    if (filteredActions.length) out.push({ title: 'Actions', items: filteredActions });
    if (folderHits.length)
      out.push({ title: 'Folders', items: folderHits.map((f) => ({ kind: 'folder' as const, folder: f })) });

    if (q.length >= 2 && results.length) {
      out.push({ title: 'Files', items: results.map((f) => ({ kind: 'file' as const, file: f })) });
    }
    if (q.length >= 2 && !searching && !results.length && !folderHits.length) {
      if (searchFailed) {
        out.push({
          title: 'Files',
          items: [
            {
              kind: 'action',
              id: 'search-unavailable',
              label: 'File search is unavailable right now',
              hint: 'Check your connection and try again',
              icon: MagnifyingGlass,
              run: () => {},
            },
          ],
        });
      } else {
        out.push({
          title: 'Files',
          items: [
            {
              kind: 'action',
              id: 'search-all',
              label: `Search all files for “${query.trim()}”`,
              hint: 'Filter the current view by this name',
              icon: MagnifyingGlass,
              run: () => onSearchAll(query.trim()),
            },
          ],
        });
      }
    }
    return out;
  }, [filteredActions, folderHits, results, searching, searchFailed, q, query, onSearchAll]);

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  // Keep the highlight inside bounds whenever the item list changes.
  useEffect(() => {
    setActive((i) => Math.min(i, Math.max(0, flat.length - 1)));
  }, [flat.length]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const activate = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    // Let the overlay unmount before triggering navigation side effects.
    setTimeout(() => {
      if (item.kind === 'action') item.run();
      else if (item.kind === 'folder') onOpenFolder(item.folder.id);
      else onOpenFile(item.file);
    }, 0);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (flat.length ? (i + 1) % flat.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      activate(flat[active]);
    } else if (e.key === 'Tab') {
      e.preventDefault(); // simple trap: Tab stays in the palette
    }
  };

  let idx = -1;

  return (
    <div className="palette-overlay" onMouseDown={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="palette-input-row">
          <MagnifyingGlass size={17} weight="bold" className="palette-input-icon" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder="Search files or type a command…"
            aria-label="Search commands and files"
            autoComplete="off"
            spellCheck={false}
          />
          <button className="palette-esc" onClick={onClose} aria-label="Close palette">
            ESC
          </button>
        </div>

        <div className="palette-list" ref={listRef} role="listbox" aria-label="Results">
          {sections.length === 0 && (
            <div className="palette-empty">No matches. Try a different term.</div>
          )}
          {sections.map((section) => (
            <div key={section.title} className="palette-section">
              <div className="palette-section-title">{section.title}</div>
              {section.items.map((item) => {
                idx += 1;
                const i = idx;
                const selected = i === active;
                return (
                  <button
                    key={
                      item.kind === 'action'
                        ? item.id
                        : item.kind === 'folder'
                          ? `folder-${item.folder.id}`
                          : `file-${item.file.id}`
                    }
                    data-idx={i}
                    role="option"
                    aria-selected={selected}
                    className={`palette-item ${selected ? 'active' : ''}`}
                    onMouseMove={() => setActive(i)}
                    onClick={() => activate(item)}
                  >
                    <span className="palette-item-icon">
                      {item.kind === 'action' ? (
                        <item.icon size={16} weight="duotone" />
                      ) : item.kind === 'folder' ? (
                        <FolderIcon size={16} weight="duotone" />
                      ) : (
                        <FileTypeIcon name={item.file.original_filename} size={16} />
                      )}
                    </span>
                    <span className="palette-item-label">
                      {item.kind === 'action'
                        ? item.label
                        : item.kind === 'folder'
                          ? item.folder.name
                          : item.file.original_filename}
                    </span>
                    <span className="palette-item-meta">
                      {item.kind === 'action'
                        ? item.hint
                        : item.kind === 'folder'
                          ? 'Folder'
                          : `${formatBytes(item.file.file_size)} · ${timeAgo(item.file.created_at)}`}
                    </span>
                    {selected && <ArrowBendDownLeft size={12} weight="bold" className="palette-enter" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
