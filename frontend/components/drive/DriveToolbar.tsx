'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  MagnifyingGlass,
  CaretDown,
  CaretRight,
  List,
  GridFour,
  Plus,
  CloudArrowUp,
  HouseSimple,
  SignOut,
  GearSix,
  X,
} from '@phosphor-icons/react';
import type { FileTypeFilter } from '../../lib/drive';

export interface Crumb {
  id: number | null;
  name: string;
}

interface Props {
  crumbs: Crumb[];
  search: string;
  onSearch: (q: string) => void;
  onGoTo: (index: number) => void;
  sort: string;
  order: string;
  onSort: (sort: string, order: string) => void;
  type: FileTypeFilter | undefined;
  onType: (t: FileTypeFilter | undefined) => void;
  view: 'grid' | 'list';
  onView: (v: 'grid' | 'list') => void;
  onNewFolder: () => void;
  onUpload: (files: File[]) => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  userName: string;
  onLogout: () => void;
}

const SORT_OPTIONS: { label: string; sort: string; order: string }[] = [
  { label: 'Newest first', sort: 'created_at', order: 'desc' },
  { label: 'Oldest first', sort: 'created_at', order: 'asc' },
  { label: 'Name A→Z', sort: 'name', order: 'asc' },
  { label: 'Name Z→A', sort: 'name', order: 'desc' },
  { label: 'Largest first', sort: 'size', order: 'desc' },
  { label: 'Smallest first', sort: 'size', order: 'asc' },
  { label: 'Last modified', sort: 'updated_at', order: 'desc' },
];

const TYPE_OPTIONS: { label: string; value: FileTypeFilter }[] = [
  { label: 'Images', value: 'image' },
  { label: 'Videos', value: 'video' },
  { label: 'Audio', value: 'audio' },
  { label: 'PDFs', value: 'pdf' },
  { label: 'Documents', value: 'doc' },
  { label: 'Sheets', value: 'sheet' },
  { label: 'Slides', value: 'slide' },
  { label: 'Archives', value: 'archive' },
  { label: 'Text', value: 'text' },
  { label: 'Other', value: 'other' },
];

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function DriveToolbar({
  crumbs,
  search,
  onSearch,
  onGoTo,
  sort,
  order,
  onSort,
  type,
  onType,
  view,
  onView,
  onNewFolder,
  onUpload,
  sidebarOpen,
  onToggleSidebar,
  userName,
  onLogout,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchDraft, setSearchDraft] = useState(search);
  const debouncedSearch = useDebounced(searchDraft, 260);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onSearch(debouncedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [userMenuOpen]);

  // The dropdown anchors right:0 to the trigger button, but on wrapped mobile
  // toolbar rows that button can sit near the LEFT edge, pushing the panel
  // off-screen. After each open (and on resize) nudge it back into the
  // viewport; no-op when it already fits.
  useEffect(() => {
    if (!userMenuOpen) return;
    const clamp = () => {
      const el = userDropdownRef.current;
      if (!el) return;
      el.style.left = '';
      el.style.right = '';
      const rect = el.getBoundingClientRect();
      const pad = 8;
      // Already inside the viewport — nothing to do.
      if (rect.left >= pad && rect.right <= window.innerWidth - pad) return;
      // Full-width bottom sheet (mobile): intentionally spans edge to edge.
      if (rect.width >= window.innerWidth - pad * 2) return;
      let target = rect.left;
      if (target < pad) target = pad;
      if (target + rect.width > window.innerWidth - pad) {
        target = window.innerWidth - pad - rect.width;
      }
      el.style.left = `${Math.max(pad, target)}px`;
      el.style.right = 'auto';
    };
    const t = setTimeout(clamp, 0);
    window.addEventListener('resize', clamp);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', clamp);
    };
  }, [userMenuOpen]);

  const currentSort =
    SORT_OPTIONS.find((o) => o.sort === sort && o.order === order) || SORT_OPTIONS[0];

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) onUpload(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="drive-toolbar">
      <div className="drive-toolbar-row">
        <button
          className="btn-icon drive-burger"
          aria-label="Toggle sidebar"
          aria-expanded={sidebarOpen}
          onClick={onToggleSidebar}
        >
          <List size={18} weight="bold" />
        </button>

        <div className="drive-crumbs" aria-label="Breadcrumbs">
          {crumbs.map((crumb, i) => (
            <span className="drive-crumb" key={crumb.id === null ? 'root' : crumb.id}>
              {i > 0 && <CaretRight size={12} weight="bold" className="drive-crumb-sep" />}
              <button
                className={`drive-crumb-btn ${i === crumbs.length - 1 ? 'current' : ''}`}
                onClick={() => onGoTo(i)}
              >
                {crumb.id === null && <HouseSimple size={13} weight="duotone" />}
                <span>{crumb.name}</span>
              </button>
            </span>
          ))}
        </div>

        <div className="drive-toolbar-actions">
          <div className="drive-search">
            <MagnifyingGlass size={14} weight="bold" className="drive-search-icon" />
            <input
              id="drive-search"
              type="search"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Search files…"
              aria-label="Search files"
              className="drive-search-input"
            />
            {searchDraft ? (
              <button
                className="drive-search-clear"
                aria-label="Clear search"
                onClick={() => {
                  setSearchDraft('');
                  document.getElementById('drive-search')?.focus();
                }}
              >
                <X size={12} weight="bold" />
              </button>
            ) : (
              <kbd className="drive-search-kbd" aria-hidden="true">/</kbd>
            )}
          </div>

          <div className="drive-select" aria-label="Sort files">
            <List size={13} weight="bold" />
            <span>{currentSort.label}</span>
            <CaretDown size={11} weight="bold" />
            <select
              aria-label="Sort files"
              value={`${currentSort.sort}|${currentSort.order}`}
              onChange={(e) => {
                const [s, o] = e.target.value.split('|');
                onSort(s, o);
              }}
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.label} value={`${opt.sort}|${opt.order}`}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="drive-select" aria-label="Filter by type">
            <span>{type ? TYPE_OPTIONS.find((t) => t.value === type)?.label : 'All types'}</span>
            <CaretDown size={11} weight="bold" />
            <select
              aria-label="Filter by type"
              value={type || ''}
              onChange={(e) => onType((e.target.value as FileTypeFilter) || undefined)}
            >
              <option value="">All types</option>
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="drive-view-toggle" role="group" aria-label="View">
            <button
              className={view === 'grid' ? 'active' : ''}
              onClick={() => onView('grid')}
              aria-label="Grid view"
            >
              <GridFour size={15} weight="bold" />
            </button>
            <button
              className={view === 'list' ? 'active' : ''}
              onClick={() => onView('list')}
              aria-label="List view"
            >
              <List size={15} weight="bold" />
            </button>
          </div>

          <button className="btn btn-ghost btn-sm" onClick={onNewFolder}>
            <Plus size={15} weight="bold" />
            <span className="drive-hide-sm">New Folder</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFiles}
            style={{ display: 'none' }}
            aria-hidden="true"
          />
          <button className="btn btn-primary btn-sm" onClick={() => fileInputRef.current?.click()}>
            <CloudArrowUp size={15} weight="bold" />
            <span className="drive-hide-sm">Upload</span>
          </button>

          <div className="drive-user-menu" ref={userMenuRef}>
            <button
              className="drive-user-btn"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              aria-label="User menu"
              aria-expanded={userMenuOpen}
            >
              <span className="drive-user-avatar-sm">{userName.charAt(0).toUpperCase()}</span>
              <CaretDown size={11} weight="bold" />
            </button>
            {userMenuOpen && (
              <div className="drive-user-dropdown" ref={userDropdownRef}>
                <div className="drive-user-dropdown-header">
                  <span className="drive-user-avatar-sm">{userName.charAt(0).toUpperCase()}</span>
                  <span className="drive-user-dropdown-name">{userName}</span>
                </div>
                <hr className="drive-user-dropdown-divider" />
                <Link href="/settings" className="drive-user-dropdown-item" onClick={() => setUserMenuOpen(false)}>
                  <GearSix size={15} weight="bold" /> Settings
                </Link>
                <button className="drive-user-dropdown-item danger" onClick={() => { setUserMenuOpen(false); onLogout(); }}>
                  <SignOut size={15} weight="bold" /> Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}