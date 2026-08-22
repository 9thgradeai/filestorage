'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { CloudArrowUp } from '@phosphor-icons/react';
import { useAuth } from '../../lib/auth';
import {
  driveApi,
  type DriveFile,
  type Folder,
  type Stats,
  type DriveMode,
  type FileTypeFilter,
} from '../../lib/drive';
import DashboardSidebar from '../../components/drive/DashboardSidebar';
import DriveToolbar, { type Crumb } from '../../components/drive/DriveToolbar';
import FileGrid, {
  type FileAction,
  type FolderAction,
} from '../../components/drive/FileGrid';
import UploadDock, { type UploadItem } from '../../components/drive/UploadDock';
import PreviewModal from '../../components/drive/PreviewModal';
import DriveDialogs, { type DialogState } from '../../components/drive/DriveDialogs';
import CommandPalette from '../../components/drive/CommandPalette';
import ShortcutsOverlay from '../../components/drive/ShortcutsOverlay';
import ChatButton from '../../components/ai/ChatButton';
import ChatModal from '../../components/ai/ChatModal';

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const PAGE_SIZE = 60;

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();

  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 });

  const [mode, setMode] = useState<DriveMode>('all');
  const [folderId, setFolderId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('created_at');
  const [order, setOrder] = useState('desc');
  const [type, setType] = useState<FileTypeFilter | undefined>(undefined);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const dragDepth = useRef(0);
  const pickerRef = useRef<HTMLInputElement>(null);

  const folderMap = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const userName = user?.name || user?.email || 'User';

  const refreshStats = useCallback(async () => {
    try {
      setStats(await driveApi.getStats());
    } catch {
      // non-critical
    }
  }, []);

  const refreshFolders = useCallback(async () => {
    try {
      const data = await driveApi.listFolders();
      setFolders(data.folders);
    } catch {
      // non-critical
    }
  }, []);

  const reload = useCallback(
    async (page = pagination.page, modeOverride?: DriveMode) => {
      setLoading(true);
      setLoadError(null);
      try {
        const effectiveMode = modeOverride || mode;
        if (effectiveMode === 'recent') {
          const data = await driveApi.getRecent(30);
          setFiles(data.files);
          setPagination({ page: 1, limit: 30, total: data.files.length, totalPages: 1 });
        } else {
          const data = await driveApi.listFiles({
            // Starred/Trash are global views: omit the folder filter so files
            // nested in subfolders appear too (null would restrict to root).
            folderId:
              effectiveMode === 'folder' ? folderId : effectiveMode === 'trash' ? null : undefined,
            q: search || undefined,
            starred: effectiveMode === 'starred' ? true : undefined,
            trashed: effectiveMode === 'trash' ? true : undefined,
            sort,
            order,
            type,
            page,
            limit: PAGE_SIZE,
          });
          setFiles(data.files);
          setPagination(data.pagination);
        }
      } catch (err: any) {
        setLoadError(err.message || 'Failed to load files');
      } finally {
        setLoading(false);
      }
    },
    [mode, folderId, search, sort, order, type, pagination.page]
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    refreshFolders();
    refreshStats();
    reload(1, mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, router, mode, folderId, search, sort, order, type]);

  // If the folder being viewed was deleted/trashed, drop back to root.
  useEffect(() => {
    if (mode === 'folder' && folderId && !folderMap.has(folderId)) {
      setMode('all');
      setFolderId(null);
    }
  }, [mode, folderId, folderMap]);

  const navigate = useCallback((m: DriveMode, fid: number | null) => {
    setSelected(new Set());
    setSearch('');
    setMode(m);
    setFolderId(fid);
    // Reflect the view in history so browser Back moves up/out of folders
    // instead of leaving the dashboard.
    try {
      window.history.pushState(
        { drive: true, mode: m, folderId: fid },
        ''
      );
    } catch {
      // history unavailable — navigation still works, back just exits
    }
  }, []);

  const openFolder = useCallback((id: number) => {
    setSelected(new Set());
    setSearch('');
    setMode('folder');
    setFolderId(id);
    try {
      window.history.pushState({ drive: true, mode: 'folder', folderId: id }, '');
    } catch {
      // ignore
    }
  }, []);

  // Browser Back / Forward restore the previous drive view.
  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      const s = e.state as { drive?: boolean; mode?: DriveMode; folderId?: number | null } | null;
      setSelected(new Set());
      setSearch('');
      if (s?.drive && s.mode) {
        setMode(s.mode);
        setFolderId(s.folderId ?? null);
      } else {
        setMode('all');
        setFolderId(null);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const crumbs = useMemo<Crumb[]>(() => {
    if (mode === 'starred') return [{ id: null, name: 'Starred' }];
    if (mode === 'trash') return [{ id: null, name: 'Trash' }];
    if (mode === 'recent') return [{ id: null, name: 'Recent' }];
    const path: Crumb[] = [{ id: null, name: 'My Files' }];
    if (mode === 'folder' && folderId) {
      const chain: Folder[] = [];
      let cur = folderMap.get(folderId);
      while (cur) {
        chain.unshift(cur);
        cur = cur.parent_id ? folderMap.get(cur.parent_id) : undefined;
      }
      for (const f of chain) path.push({ id: f.id, name: f.name });
    }
    return path;
  }, [mode, folderId, folderMap]);

  const visibleFolders = useMemo(() => {
    if (search) {
      return folders.filter(
        (f) => !f.trashed_at && f.name.toLowerCase().includes(search.toLowerCase())
      );
    }
    if (type) return [];
    if (mode === 'starred' || mode === 'trash' || mode === 'recent') return [];
    const parent = mode === 'folder' ? folderId : null;
    return folders.filter((f) => !f.trashed_at && (f.parent_id ?? null) === parent);
  }, [folders, mode, folderId, search, type]);

  const filtersActive = Boolean(search.trim()) || type !== undefined;

  // ── Global keyboard layer ────────────────────────────────────────────

  const openFilePicker = useCallback(() => pickerRef.current?.click(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      const meta = e.metaKey || e.ctrlKey;
      const overlayOpen = !!previewFile || !!dialog || shortcutsOpen;

      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (typing || overlayOpen) return;

      if (e.key === '/') {
        e.preventDefault();
        document.getElementById('drive-search')?.focus();
      } else if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
      } else if (meta && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelected(new Set(files.map((f) => f.id)));
      } else if (e.key === 'Escape' && selected.size > 0 && !paletteOpen) {
        setSelected(new Set());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [files, previewFile, dialog, shortcutsOpen, paletteOpen, selected.size]);

  // ── Uploads ──────────────────────────────────────────────────────────

  const uploadFiles = useCallback(
    (fileList: File[], parentOverride?: number | null) => {
      const parent =
        parentOverride !== undefined ? parentOverride : mode === 'folder' ? folderId : null;
      const accepted = fileList.filter((file) => {
        if (file.size > MAX_FILE_SIZE) {
          toast.error(`"${file.name}" exceeds the 100 MB limit`);
          return false;
        }
        if (file.size === 0) {
          toast.error(`"${file.name}" is empty`);
          return false;
        }
        return true;
      });
      if (accepted.length === 0) return;

      const finish = () => {
        refreshStats();
        reload(1, mode);
      };

      // Uploads race in parallel, so "last by index" ≠ "last to settle" —
      // count settlements and refresh exactly once when every upload is done
      // or errored.
      let settled = 0;
      const onSettled = () => {
        settled += 1;
        if (settled === accepted.length) finish();
      };

      accepted.forEach((file, i) => {
        const id = `upload-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`;
        setUploadItems((prev) => [
          ...prev,
          { id, name: file.name, size: file.size, status: 'uploading', progress: 0 },
        ]);
        driveApi
          .upload(file, parent, (pct) =>
            setUploadItems((prev) =>
              prev.map((u) => (u.id === id ? { ...u, progress: pct } : u))
            )
          )
          .then(() => {
            setUploadItems((prev) =>
              prev.map((u) => (u.id === id ? { ...u, status: 'done', progress: 100 } : u))
            );
            onSettled();
          })
          .catch((err) => {
            setUploadItems((prev) =>
              prev.map((u) =>
                u.id === id ? { ...u, status: 'error', error: err.message } : u
              )
            );
            onSettled();
          });
      });
    },
    [mode, folderId, refreshStats, reload]
  );

  const doDownload = useCallback(async (file: DriveFile) => {
    try {
      const { blob, filename } = await driveApi.download(file.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err: any) {
      toast.error(err.message || 'Download failed');
    }
  }, []);

  // ── File actions ─────────────────────────────────────────────────────

  const handleFileAction = useCallback(
    async (action: FileAction, file: DriveFile) => {
      try {
        switch (action) {
          case 'preview':
            setPreviewFile(file);
            break;
          case 'download':
            await doDownload(file);
            break;
          case 'rename':
            setDialog({ kind: 'renameFile', file });
            break;
          case 'move':
            setDialog({ kind: 'moveFile', file });
            break;
          case 'star':
          case 'unstar':
            await driveApi.starFile(file.id, action === 'star');
            toast.success(action === 'star' ? 'Starred' : 'Unstarred');
            refreshStats();
            reload();
            break;
          case 'share':
            setDialog({ kind: 'share', file });
            break;
          case 'makePublic':
            await driveApi.togglePublic(file.id, true);
            toast.success('File is now public');
            reload();
            break;
          case 'makePrivate':
            await driveApi.togglePublic(file.id, false);
            toast.success('File is now private');
            reload();
            break;
          case 'trash':
            await driveApi.trashFile(file.id);
            toast.success('Moved to trash');
            refreshStats();
            reload(1, mode);
            break;
          case 'restore':
            await driveApi.restoreFile(file.id);
            toast.success('File restored');
            refreshStats();
            reload(1, mode);
            break;
          case 'delete':
            setDialog({ kind: 'confirmDelete', file });
            break;
        }
      } catch (err: any) {
        toast.error(err.message || 'Action failed');
      }
    },
    [doDownload, refreshStats, reload, mode]
  );

  const handleBulkAction = useCallback(
    async (action: FileAction) => {
      const targets = files.filter((f) => selected.has(f.id));
      if (targets.length === 0) return;

      // Destructive deletes get an explicit themed confirmation.
      if (action === 'delete') {
        setDialog({ kind: 'confirmBulkDelete', count: targets.length });
        return;
      }

      let failures = 0;
      try {
        for (const file of targets) {
          try {
            if (action === 'download') {
              await doDownload(file);
            } else if (action === 'star') {
              await driveApi.starFile(file.id, true);
            } else if (action === 'unstar') {
              await driveApi.starFile(file.id, false);
            } else if (action === 'trash') {
              await driveApi.trashFile(file.id);
            } else if (action === 'restore') {
              await driveApi.restoreFile(file.id);
            }
          } catch {
            failures += 1;
          }
        }
        if (failures > 0) {
          toast.error(`${failures} of ${targets.length} ${targets.length === 1 ? 'file' : 'files'} failed`);
        } else {
          toast.success(`${targets.length} ${targets.length === 1 ? 'file' : 'files'} updated`);
        }
      } finally {
        setSelected(new Set());
        refreshStats();
        reload(1, mode);
      }
    },
    [files, selected, doDownload, refreshStats, reload, mode]
  );

  const handleBulkDeleteConfirmed = useCallback(async () => {
    const targets = files.filter((f) => selected.has(f.id));
    if (targets.length === 0) return;
    let failures = 0;
    for (const file of targets) {
      try {
        await driveApi.deleteFile(file.id);
      } catch {
        failures += 1;
      }
    }
    if (failures > 0) {
      throw new Error(`${failures} of ${targets.length} could not be deleted`);
    }
    toast.success(`${targets.length} deleted permanently`);
    setSelected(new Set());
    refreshStats();
    reload(1, mode);
  }, [files, selected, refreshStats, reload, mode]);

  // ── Folder actions (from grid menus) ─────────────────────────────────

  const handleFolderAction = useCallback(
    async (action: FolderAction, folder: Folder) => {
      switch (action) {
        case 'rename':
          setDialog({ kind: 'renameFolder', folder });
          break;
        case 'move':
          setDialog({ kind: 'moveFolder', folder });
          break;
        case 'trash':
          try {
            await driveApi.trashFolder(folder.id);
            toast.success('Folder moved to trash');
            refreshFolders();
            refreshStats();
            reload(1, mode);
          } catch (err: any) {
            toast.error(err.message || 'Action failed');
          }
          break;
        case 'restore':
          try {
            await driveApi.restoreFolder(folder.id);
            toast.success('Folder restored');
            refreshFolders();
            refreshStats();
            reload(1, mode);
          } catch (err: any) {
            toast.error(err.message || 'Action failed');
          }
          break;
        case 'delete':
          setDialog({ kind: 'confirmDelete', folder });
          break;
      }
    },
    [refreshFolders, refreshStats, reload, mode]
  );

  const moveFilesToFolder = useCallback(
    async (ids: number[], targetFolderId: number | null) => {
      if (ids.length === 0) return;
      let failures = 0;
      for (const id of ids) {
        try {
          await driveApi.moveFile(id, targetFolderId);
        } catch {
          failures += 1;
        }
      }
      if (failures > 0) {
        toast.error(`${failures} of ${ids.length} could not be moved`);
      } else {
        const name = targetFolderId ? folderMap.get(targetFolderId)?.name : 'My Files';
        toast.success(
          ids.length === 1 ? `Moved to ${name}` : `${ids.length} files moved to ${name}`
        );
      }
      setSelected(new Set());
      refreshStats();
      reload(1, mode);
    },
    [folderMap, refreshStats, reload, mode]
  );

  const confirmDelete = useCallback(
    async (target: { type: 'file' | 'folder'; id: number }) => {
      try {
        if (target.type === 'folder') {
          await driveApi.deleteFolder(target.id);
          refreshFolders();
        } else {
          await driveApi.deleteFile(target.id);
        }
        toast.success('Deleted permanently');
        refreshStats();
        reload(1, mode);
      } catch (err: any) {
        toast.error(err.message || 'Could not delete');
        throw err;
      }
    },
    [refreshFolders, refreshStats, reload, mode]
  );

  const generateShare = useCallback(async (file: DriveFile) => {
    const data = await driveApi.generateShare(file.id);
    return data.share_url;
  }, []);

  const makePublic = useCallback(async (file: DriveFile) => {
    await driveApi.togglePublic(file.id, true);
    reload(1, mode);
  }, [reload, mode]);

  const renameFile = useCallback(
    async (file: DriveFile, name: string) => {
      await driveApi.renameFile(file.id, name);
      toast.success('Renamed');
      reload(1, mode);
    },
    [reload, mode]
  );

  const moveFile = useCallback(
    async (file: DriveFile, parentId: number | null) => {
      await driveApi.moveFile(file.id, parentId);
      toast.success('Moved');
      reload(1, mode);
    },
    [reload, mode]
  );

  const renameFolder = useCallback(
    async (f: Folder, name: string) => {
      await driveApi.renameFolder(f.id, name);
      toast.success('Renamed');
      refreshFolders();
    },
    [refreshFolders]
  );

  const moveFolder = useCallback(
    async (f: Folder, parentId: number | null) => {
      await driveApi.moveFolder(f.id, parentId);
      toast.success('Moved');
      refreshFolders();
    },
    [refreshFolders]
  );

  const createFolder = useCallback(
    async (name: string) => {
      try {
        const parent = mode === 'folder' ? folderId : null;
        await driveApi.createFolder(name, parent);
        toast.success('Folder created');
        refreshFolders();
        reload();
      } catch (err: any) {
        toast.error(err.message || 'Could not create folder');
        throw err;
      }
    },
    [mode, folderId, refreshFolders, reload]
  );

  // ── Preview navigation (← → cycle through current listing) ───────────

  const previewIndex = previewFile ? files.findIndex((f) => f.id === previewFile.id) : -1;
  const gotoPreview = useCallback(
    (dir: 1 | -1) => {
      if (files.length === 0 || previewIndex === -1) return;
      const next = (previewIndex + dir + files.length) % files.length;
      setPreviewFile(files[next]);
    },
    [files, previewIndex]
  );

  if (authLoading) {
    return (
      <div className="page page-glow">
        <div className="file-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: '138px' }} />
          ))}
        </div>
      </div>
    );
  }

  const totalPages = Math.max(1, pagination.totalPages);

  return (
    <div
      className={`drive-shell ${sidebarOpen ? 'sidebar-open' : ''} ${
        dragOver ? 'dragging' : ''
      } ${uploadItems.length > 0 ? 'has-dock' : ''}`}
    >
      <DashboardSidebar
        userName={userName}
        folders={folders}
        stats={stats}
        mode={mode}
        folderId={folderId}
        onNavigate={navigate}
        onNewFolder={() =>
          setDialog({ kind: 'newFolder', parentId: mode === 'folder' ? folderId : null })
        }
        onRenameFolder={(f) => setDialog({ kind: 'renameFolder', folder: f })}
        onMoveFolder={(f) => setDialog({ kind: 'moveFolder', folder: f })}
        onTrashFolder={(f: Folder) => handleFolderAction('trash', f)}
        onRestoreFolder={(f: Folder) => handleFolderAction('restore', f)}
        onDeleteFolder={(f: Folder) => setDialog({ kind: 'confirmDelete', folder: f })}
        onLogout={() => {
          logout();
          router.push('/');
        }}
      />

      <div className="drive-sidebar-backdrop" onClick={() => setSidebarOpen(false)} />

      <main
        className="drive-main"
        onDragEnter={(e) => {
          e.preventDefault();
          dragDepth.current += 1;
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) {
            dragDepth.current = 0;
            setDragOver(false);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          dragDepth.current = 0;
          setDragOver(false);
          const incoming = Array.from(e.dataTransfer.files || []);
          if (incoming.length) uploadFiles(incoming);
        }}
      >
        <DriveToolbar
          key={`${mode}-${folderId}`}
          crumbs={crumbs}
          search={search}
          onSearch={setSearch}
          onGoTo={(index) => {
            if (mode === 'starred' || mode === 'trash' || mode === 'recent') {
              navigate(mode, null);
              return;
            }
            const crumb = crumbs[index];
            setSelected(new Set());
            setSearch('');
            if (crumb.id === null) {
              setMode('all');
              setFolderId(null);
            } else {
              setMode('folder');
              setFolderId(crumb.id);
            }
          }}
          sort={sort}
          order={order}
          onSort={(s, o) => {
            setSort(s);
            setOrder(o);
          }}
          type={type}
          onType={setType}
          view={view}
          onView={setView}
          onNewFolder={() =>
            setDialog({ kind: 'newFolder', parentId: mode === 'folder' ? folderId : null })
          }
          onUpload={(fs) => uploadFiles(fs)}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((s) => !s)}
          userName={userName}
          onLogout={() => { logout(); router.push('/'); }}
        />

        <div className="drive-workspace">
          {dragOver && (
            <div className="drive-drop-hint">
              <CloudArrowUp size={22} weight="duotone" />
              Drop files to upload to{' '}
              {mode === 'folder' && folderId
                ? folderMap.get(folderId)?.name || 'this folder'
                : 'My Files'}
            </div>
          )}
          <FileGrid
            folders={visibleFolders}
            files={files}
            mode={mode}
            view={view}
            loading={loading}
            search={search}
            selected={selected}
            error={loadError}
            filtersActive={filtersActive}
            onRetry={() => reload()}
            onToggleSelect={(id) =>
              setSelected((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            onToggleSelectAll={() => {
              if (files.length && files.every((f) => selected.has(f.id))) {
                setSelected(new Set());
              } else {
                setSelected(new Set(files.map((f) => f.id)));
              }
            }}
            onClearSelection={() => setSelected(new Set())}
            onOpenFolder={openFolder}
            onOpenFile={(f) => setPreviewFile(f)}
            onFileAction={handleFileAction}
            onBulkAction={handleBulkAction}
            onFolderAction={handleFolderAction}
            onMoveFilesToFolder={moveFilesToFolder}
            onUploadFilesToFolder={(fs, fid) => uploadFiles(fs, fid)}
            onBrowseUpload={openFilePicker}
          />
          {totalPages > 1 && !loading && (
            <div className="pagination">
              <button
                className="btn btn-secondary btn-sm"
                disabled={pagination.page <= 1}
                onClick={() => reload(pagination.page - 1)}
              >
                ← Prev
              </button>
              <span className="pagination-info">
                PAGE {pagination.page} OF {totalPages}
              </span>
              <button
                className="btn btn-secondary btn-sm"
                disabled={pagination.page >= totalPages}
                onClick={() => reload(pagination.page + 1)}
              >
                Next →
              </button>
            </div>
          )}
        </div>
      </main>

      <input
        ref={pickerRef}
        type="file"
        multiple
        onChange={(e) => {
          const picked = Array.from(e.target.files || []);
          if (picked.length) uploadFiles(picked);
          e.target.value = '';
        }}
        style={{ display: 'none' }}
        aria-hidden="true"
        tabIndex={-1}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        folders={folders}
        view={view}
        onNavigate={navigate}
        onNewFolder={() =>
          setDialog({ kind: 'newFolder', parentId: mode === 'folder' ? folderId : null })
        }
        onUploadClick={openFilePicker}
        onToggleView={() => setView((v) => (v === 'grid' ? 'list' : 'grid'))}
        onOpenSettings={() => router.push('/settings')}
        onOpenFile={(f) => setPreviewFile(f)}
        onOpenFolder={openFolder}
        onSearchAll={(q) => setSearch(q)}
      />

      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      <UploadDock
        items={uploadItems}
        onDismiss={(id) => setUploadItems((prev) => prev.filter((u) => u.id !== id))}
        onClear={() => setUploadItems([])}
      />

      {previewFile && (
        <PreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          onPrev={files.length > 1 ? () => gotoPreview(-1) : undefined}
          onNext={files.length > 1 ? () => gotoPreview(1) : undefined}
          position={
            previewIndex >= 0 && files.length > 1
              ? `${previewIndex + 1} / ${files.length}`
              : undefined
          }
          onStarred={async (f) => {
            await driveApi.starFile(f.id, !f.starred);
            const updated = { ...f, starred: !f.starred };
            setPreviewFile(updated);
            setFiles((prev) => prev.map((x) => (x.id === f.id ? updated : x)));
            refreshStats();
            reload();
          }}
        />
      )}

      <DriveDialogs
        dialog={dialog}
        folders={folders}
        onClose={() => setDialog(null)}
        onCreateFolder={createFolder}
        onRenameFile={renameFile}
        onRenameFolder={renameFolder}
        onMoveFile={moveFile}
        onMoveFolder={moveFolder}
        onConfirmDelete={confirmDelete}
        onConfirmBulkDelete={handleBulkDeleteConfirmed}
        onMakePublic={makePublic}
        onGenerateShare={generateShare}
      />

      <ChatButton />
      <ChatModal />
    </div>
  );
}
