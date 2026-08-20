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
import FileGrid, { type FileAction } from '../../components/drive/FileGrid';
import UploadQueue, { type UploadItem } from '../../components/drive/UploadQueue';
import PreviewModal from '../../components/drive/PreviewModal';
import DriveDialogs, { type DialogState } from '../../components/drive/DriveDialogs';
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
  const dragDepth = useRef(0);

  const folderMap = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);

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
    async (page = pagination.page) => {
      setLoading(true);
      try {
        if (mode === 'recent') {
          const data = await driveApi.getRecent(30);
          setFiles(data.files);
          setPagination({ page: 1, limit: 30, total: data.files.length, totalPages: 1 });
        } else {
          const data = await driveApi.listFiles({
            // Starred/Trash are global views: omit the folder filter so files
            // nested in subfolders appear too (null would restrict to root).
            folderId:
              mode === 'folder' ? folderId : mode === 'all' ? null : undefined,
            q: search || undefined,
            starred: mode === 'starred' ? true : undefined,
            trashed: mode === 'trash' ? true : undefined,
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
        toast.error(err.message || 'Failed to load files');
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
    reload(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, router]);

  useEffect(() => {
    if (authLoading) return;
    reload(1);
    setSelected(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, folderId, search, sort, order, type]);

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
    setSidebarOpen(false);
  }, []);

  const openFolder = useCallback((id: number) => {
    setSelected(new Set());
    setSearch('');
    setMode('folder');
    setFolderId(id);
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

  // ── Uploads ──────────────────────────────────────────────────────────
  const uploadFiles = useCallback(
    (fileList: File[]) => {
      const parent = mode === 'folder' ? folderId : null;
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

      const finish = () => {
        refreshStats();
        reload();
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
            if (i === accepted.length - 1) finish();
          })
          .catch((err) => {
            setUploadItems((prev) =>
              prev.map((u) =>
                u.id === id ? { ...u, status: 'error', error: err.message } : u
              )
            );
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
            reload();
            break;
          case 'restore':
            await driveApi.restoreFile(file.id);
            toast.success('File restored');
            refreshStats();
            reload();
            break;
          case 'delete':
            setDialog({ kind: 'confirmDelete', file });
            break;
        }
      } catch (err: any) {
        toast.error(err.message || 'Action failed');
      }
    },
    [doDownload, refreshStats, reload]
  );

  const handleBulkAction = useCallback(
    async (action: FileAction) => {
      const targets = files.filter((f) => selected.has(f.id));
      if (targets.length === 0) return;
      try {
        for (const file of targets) {
          if (action === 'download') {
            await doDownload(file);
          } else if (action === 'star' || action === 'unstar') {
            await driveApi.starFile(file.id, action === 'star');
          } else if (action === 'trash') {
            await driveApi.trashFile(file.id);
          } else if (action === 'delete') {
            await driveApi.deleteFile(file.id);
          }
        }
        toast.success(`${targets.length} ${targets.length === 1 ? 'file' : 'files'} updated`);
      } catch (err: any) {
        toast.error(err.message || 'Bulk action failed');
      } finally {
        setSelected(new Set());
        refreshStats();
        reload();
      }
    },
    [files, selected, doDownload, refreshStats, reload]
  );

  // ── Folder actions ───────────────────────────────────────────────────
  const trashFolder = useCallback(
    async (f: Folder) => {
      try {
        await driveApi.trashFolder(f.id);
        toast.success('Folder moved to trash');
        refreshFolders();
        refreshStats();
        reload();
      } catch (err: any) {
        toast.error(err.message || 'Action failed');
      }
    },
    [refreshFolders, refreshStats, reload]
  );

  const restoreFolder = useCallback(
    async (f: Folder) => {
      try {
        await driveApi.restoreFolder(f.id);
        toast.success('Folder restored');
        refreshFolders();
        refreshStats();
        reload();
      } catch (err: any) {
        toast.error(err.message || 'Action failed');
      }
    },
    [refreshFolders, refreshStats, reload]
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
        reload();
      } catch (err: any) {
        toast.error(err.message || 'Could not delete');
      }
    },
    [refreshFolders, refreshStats, reload]
  );

  const generateShare = useCallback(async (file: DriveFile) => {
    const data = await driveApi.generateShare(file.id);
    return data.share_url;
  }, []);

  const makePublic = useCallback(async (file: DriveFile) => {
    await driveApi.togglePublic(file.id, true);
    reload();
  }, [reload]);

  const renameFile = useCallback(
    async (file: DriveFile, name: string) => {
      await driveApi.renameFile(file.id, name);
      toast.success('Renamed');
      reload();
    },
    [reload]
  );

  const moveFile = useCallback(
    async (file: DriveFile, parentId: number | null) => {
      await driveApi.moveFile(file.id, parentId);
      toast.success('Moved');
      reload();
    },
    [reload]
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
      const parent = mode === 'folder' ? folderId : null;
      await driveApi.createFolder(name, parent);
      toast.success('Folder created');
      refreshFolders();
      reload();
    },
    [mode, folderId, refreshFolders, reload]
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
    <div className={`drive-shell ${sidebarOpen ? 'sidebar-open' : ''} ${dragOver ? 'dragging' : ''}`}>
      <DashboardSidebar
        userName={user?.name || user?.email || 'User'}
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
        onTrashFolder={trashFolder}
        onRestoreFolder={restoreFolder}
        onDeleteFolder={(f) => setDialog({ kind: 'confirmDelete', folder: f })}
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
            setMode('all');
            setFolderId(crumb.id);
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
          onUpload={uploadFiles}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((s) => !s)}
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

      <UploadQueue
        items={uploadItems}
        onDismiss={(id) => setUploadItems((prev) => prev.filter((u) => u.id !== id))}
      />

      {previewFile && (
        <PreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          onStarred={async (f) => {
            await driveApi.starFile(f.id, !f.starred);
            setPreviewFile({ ...f, starred: !f.starred });
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
        onMakePublic={makePublic}
        onGenerateShare={generateShare}
      />

      <ChatButton />
      <ChatModal />
    </div>
  );
}
