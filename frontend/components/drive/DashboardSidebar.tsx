'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  HouseSimple,
  Clock,
  Star,
  TrashSimple,
  Folder as FolderIcon,
  FolderOpen,
  Plus,
  CaretRight,
  DotsThreeVertical,
  SignOut,
  HardDrives,
  GearSix,
} from '@phosphor-icons/react';
import { Brand } from '../Brand';
import { formatQuota, formatBytes } from '../../lib/format';
import type { Folder, Stats, DriveMode } from '../../lib/drive';

interface Props {
  userName: string;
  folders: Folder[];
  stats: Stats | null;
  mode: DriveMode;
  folderId: number | null;
  onNavigate: (mode: DriveMode, folderId: number | null) => void;
  onNewFolder: () => void;
  onRenameFolder: (f: Folder) => void;
  onMoveFolder: (f: Folder) => void;
  onTrashFolder: (f: Folder) => void;
  onRestoreFolder: (f: Folder) => void;
  onDeleteFolder: (f: Folder) => void;
  onLogout: () => void;
}

interface NavItem {
  key: DriveMode;
  label: string;
  icon: React.ElementType;
  count?: number;
}

export default function DashboardSidebar({
  userName,
  folders,
  stats,
  mode,
  folderId,
  onNavigate,
  onNewFolder,
  onRenameFolder,
  onMoveFolder,
  onTrashFolder,
  onRestoreFolder,
  onDeleteFolder,
  onLogout,
}: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  const childrenOf = useMemo(() => {
    const map = new Map<number | null, Folder[]>();
    for (const f of folders) {
      const list = map.get(f.parent_id) || [];
      list.push(f);
      map.set(f.parent_id, list);
    }
    return (parentId: number | null) => (map.get(parentId) || []).sort((a, b) => a.name.localeCompare(b.name));
  }, [folders]);

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuFor(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Keyboard support for the folder context menu, mirroring the file menu in
  // FileGrid: Escape closes, arrows/Home/End rove focus, focus lands on the
  // first item on open and returns to the ⋯ trigger on close.
  useEffect(() => {
    if (menuFor === null) return;
    const items = menuRef.current
      ? Array.from(
          menuRef.current.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')
        )
      : [];
    items[0]?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuFor(null);
        return;
      }
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
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      menuTriggerRef.current?.focus();
    };
  }, [menuFor]);

  const navItems: NavItem[] = [
    { key: 'all', label: 'My Files', icon: HouseSimple },
    { key: 'recent', label: 'Recent', icon: Clock, count: stats?.active },
    { key: 'starred', label: 'Starred', icon: Star, count: stats?.starred },
    { key: 'trash', label: 'Trash', icon: TrashSimple, count: stats?.trashed },
  ];

  const isActive = (item: NavItem) =>
    item.key === 'folder' ? false : item.key === mode && folderId === null;

  const renderFolder = (folder: Folder, depth: number) => {
    const isOpen = expanded.has(folder.id);
    const children = childrenOf(folder.id);
    const isCurrent = mode === 'folder' && folderId === folder.id;

    return (
      <div key={folder.id}>
        <div
          className={`drive-folder-row ${isCurrent ? 'active' : ''}`}
          style={{ paddingLeft: `${10 + depth * 14}px` }}
        >
          <button
            className="drive-folder-caret"
            onClick={() => toggle(folder.id)}
            aria-label={isOpen ? 'Collapse folder' : 'Expand folder'}
          >
            <CaretRight size={11} weight="bold" style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }} />
          </button>
          <button
            className="drive-folder-label"
            onClick={() => onNavigate('folder', folder.id)}
            title={folder.name}
          >
            {isOpen ? (
              <FolderOpen size={15} weight="duotone" className="drive-folder-icon" />
            ) : (
              <FolderIcon size={15} weight="duotone" className="drive-folder-icon" />
            )}
            <span className="drive-folder-name">{folder.name}</span>
          </button>
          <button
            className="drive-row-menu"
            aria-label={`Actions for ${folder.name}`}
            aria-haspopup="menu"
            aria-expanded={menuFor === folder.id}
            onClick={(e) => {
              e.stopPropagation();
              if (menuFor !== folder.id) {
                // Remember the trigger so focus can return here on close.
                menuTriggerRef.current = e.currentTarget;
                setMenuFor(folder.id);
              } else {
                setMenuFor(null);
              }
            }}
          >
            <DotsThreeVertical size={14} weight="bold" />
          </button>
          {menuFor === folder.id && (
            <div
              className="drive-menu"
              onClick={(e) => e.stopPropagation()}
              ref={menuRef}
              role="menu"
              aria-label={`Actions for ${folder.name}`}
            >
              <button role="menuitem" onClick={() => { onRenameFolder(folder); setMenuFor(null); }}>
                Rename
              </button>
              <button role="menuitem" onClick={() => { onMoveFolder(folder); setMenuFor(null); }}>
                Move
              </button>
              {folder.trashed_at ? (
                <>
                  <button role="menuitem" onClick={() => { onRestoreFolder(folder); setMenuFor(null); }}>
                    Restore
                  </button>
                  <button role="menuitem" className="danger" onClick={() => { onDeleteFolder(folder); setMenuFor(null); }}>
                    Delete forever
                  </button>
                </>
              ) : (
                <button role="menuitem" onClick={() => { onTrashFolder(folder); setMenuFor(null); }}>
                  Move to trash
                </button>
              )}
            </div>
          )}
        </div>
        {isOpen && children.map((child) => renderFolder(child, depth + 1))}
      </div>
    );
  };

  const rootFolders = childrenOf(null);
  const usedPct = stats && stats.quota > 0 ? Math.min(100, (stats.used / stats.quota) * 100) : 0;

  return (
    <aside className="drive-sidebar">
      <div className="drive-sidebar-scroll">
        <Link href="/" className="drive-brand" aria-label="Vault home">
          <Brand tagline={false} />
        </Link>

        <nav className="drive-nav" aria-label="Drive views">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                className={`drive-nav-item ${isActive(item) ? 'active' : ''}`}
                onClick={() => onNavigate(item.key, null)}
              >
                <Icon size={16} weight="duotone" />
                <span>{item.label}</span>
                {typeof item.count === 'number' && item.count > 0 && (
                  <span className="drive-nav-count">{item.count}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="drive-section">
          <div className="drive-section-head">
            <span className="drive-section-label">Folders</span>
            <button
              className="btn-icon"
              aria-label="New folder"
              title="New folder"
              onClick={onNewFolder}
            >
              <Plus size={14} weight="bold" />
            </button>
          </div>
          <div className="drive-folder-tree">
            {rootFolders.length === 0 ? (
              <p className="drive-folder-empty">No folders yet</p>
            ) : (
              rootFolders.map((folder) => renderFolder(folder, 0))
            )}
          </div>
        </div>
      </div>

      <div className="drive-sidebar-foot">
        <div className="drive-quota">
          <div className="drive-quota-row">
            <HardDrives size={13} weight="duotone" />
            <span>
              {stats ? `${formatBytes(stats.used)} of ${formatQuota(stats.quota)}` : '—'}
            </span>
          </div>
          <div className="drive-quota-track">
            <div className="drive-quota-fill" style={{ width: `${usedPct}%` }} />
          </div>
        </div>
        <div className="drive-user">
          <span className="drive-user-avatar">{userName.charAt(0).toUpperCase()}</span>
          <span className="drive-user-name" title={userName}>
            {userName}
          </span>
          <Link href="/settings" className="btn-icon" aria-label="Settings" title="Settings">
            <GearSix size={15} weight="bold" />
          </Link>
          <button className="btn-icon" aria-label="Logout" title="Logout" onClick={onLogout}>
            <SignOut size={15} weight="bold" />
          </button>
        </div>
      </div>
    </aside>
  );
}