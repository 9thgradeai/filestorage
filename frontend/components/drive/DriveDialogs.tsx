'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Folder as FolderIcon, Check, LinkSimple, Triangle, Copy } from '@phosphor-icons/react';
import type { DriveFile, Folder } from '../../lib/drive';

export interface DialogState {
  kind: 'newFolder' | 'renameFile' | 'renameFolder' | 'moveFile' | 'moveFolder' | 'share' | 'confirmDelete';
  file?: DriveFile;
  folder?: Folder;
  parentId?: number | null;
}

interface Props {
  dialog: DialogState | null;
  folders: Folder[];
  onClose: () => void;
  onCreateFolder: (name: string) => Promise<void> | void;
  onRenameFile: (file: DriveFile, name: string) => Promise<void> | void;
  onRenameFolder: (folder: Folder, name: string) => Promise<void> | void;
  onMoveFile: (file: DriveFile, parentId: number | null) => Promise<void> | void;
  onMoveFolder: (folder: Folder, parentId: number | null) => Promise<void> | void;
  onConfirmDelete: (target: { type: 'file' | 'folder'; id: number }) => Promise<void> | void;
  onMakePublic: (file: DriveFile) => Promise<void> | void;
  onGenerateShare: (file: DriveFile) => Promise<string>;
}

interface MoveTarget {
  type: 'file' | 'folder';
  item: DriveFile | Folder;
  initial?: number | null;
}

function descendantIds(folders: Folder[], rootId: number): Set<number> {
  const children = new Map<number | null, number[]>();
  for (const f of folders) {
    const list = children.get(f.parent_id) || [];
    list.push(f.id);
    children.set(f.parent_id, list);
  }
  const out = new Set<number>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    out.add(id);
    for (const c of children.get(id) || []) stack.push(c);
  }
  return out;
}

export default function DriveDialogs({
  dialog,
  folders,
  onClose,
  onCreateFolder,
  onRenameFile,
  onRenameFolder,
  onMoveFile,
  onMoveFolder,
  onConfirmDelete,
  onMakePublic,
  onGenerateShare,
}: Props) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);
  const [moveDest, setMoveDest] = useState<number | null | undefined>(undefined);
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const title = useMemo(() => {
    if (!dialog) return '';
    switch (dialog.kind) {
      case 'newFolder':
        return 'New folder';
      case 'renameFile':
        return 'Rename file';
      case 'renameFolder':
        return 'Rename folder';
      case 'moveFile':
        return 'Move file';
      case 'moveFolder':
        return 'Move folder';
      case 'share':
        return 'Share link';
      case 'confirmDelete':
        return 'Delete forever?';
    }
  }, [dialog]);

  useEffect(() => {
    if (!dialog) return;
    setName('');
    setBusy(false);
    setCopied(false);
    setShareUrl('');
    if (dialog.kind === 'renameFile') setName(dialog.file?.original_filename || '');
    if (dialog.kind === 'renameFolder') setName(dialog.folder?.name || '');
    if (dialog.kind === 'moveFile' || dialog.kind === 'moveFolder') {
      const item = dialog.kind === 'moveFile' ? dialog.file! : dialog.folder!;
      setMoveTarget({ type: dialog.kind === 'moveFile' ? 'file' : 'folder', item, initial: item.parent_id });
      setMoveDest(item.parent_id);
    }
    if (dialog.kind === 'share' && dialog.file) {
      const file = dialog.file;
      let cancelled = false;
      const finish = (url: string) => {
        if (cancelled) return;
        setShareUrl(url);
        navigator.clipboard.writeText(url).catch(() => {});
        setCopied(true);
      };
      (async () => {
        if (!file.is_public) await onMakePublic(file);
        const url = await onGenerateShare(file);
        finish(url);
      })().catch(() => {});
      return () => { cancelled = true; };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog]);

  const allowedParents = useMemo(() => {
    if (!moveTarget) return folders;
    if (moveTarget.type === 'folder') {
      const blocked = descendantIds(folders, moveTarget.item.id);
      return folders.filter((f) => !blocked.has(f.id));
    }
    return folders;
  }, [folders, moveTarget]);

  const tree = useMemo(() => {
    const children = new Map<number | null, Folder[]>();
    for (const f of allowedParents) {
      const list = children.get(f.parent_id) || [];
      list.push(f);
      children.set(f.parent_id, list);
    }
    const nodes: { folder: Folder; depth: number }[] = [];
    const walk = (parentId: number | null, depth: number) => {
      for (const f of (children.get(parentId) || []).sort((a, b) => a.name.localeCompare(b.name))) {
        nodes.push({ folder: f, depth });
        walk(f.id, depth + 1);
      }
    };
    walk(null, 0);
    return nodes;
  }, [allowedParents]);

  if (!dialog) return null;

  const submitMove = async () => {
    if (!moveTarget) return;
    setBusy(true);
    try {
      const dest = moveDest ?? null;
      if (moveTarget.type === 'file') {
        await onMoveFile(moveTarget.item as DriveFile, dest);
      } else {
        await onMoveFolder(moveTarget.item as Folder, dest);
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title-name">{title}</span>
          <button className="btn-icon" aria-label="Close" onClick={onClose}>
            <X size={16} weight="bold" />
          </button>
        </div>

        {dialog.kind === 'newFolder' && (
          <form
            className="modal-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!name.trim()) return;
              setBusy(true);
              try {
                await onCreateFolder(name.trim());
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="label" htmlFor="new-folder-name">
              Folder name
            </label>
            <input
              id="new-folder-name"
              className="input"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My folder"
              maxLength={255}
            />
            <div className="modal-form-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
                <Check size={15} weight="bold" /> Create
              </button>
            </div>
          </form>
        )}

        {(dialog.kind === 'renameFile' || dialog.kind === 'renameFolder') && (
          <form
            className="modal-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!name.trim()) return;
              setBusy(true);
              try {
                if (dialog.kind === 'renameFile' && dialog.file) {
                  await onRenameFile(dialog.file, name.trim());
                } else if (dialog.kind === 'renameFolder' && dialog.folder) {
                  await onRenameFolder(dialog.folder, name.trim());
                }
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="label" htmlFor="rename-name">
              New name
            </label>
            <input
              id="rename-name"
              className="input"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={255}
            />
            <div className="modal-form-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
                <Check size={15} weight="bold" /> Rename
              </button>
            </div>
          </form>
        )}

        {(dialog.kind === 'moveFile' || dialog.kind === 'moveFolder') && (
          <div className="modal-form">
            <p className="helper" style={{ marginBottom: '0.75rem' }}>
              Choose a destination folder (or leave at root).
            </p>
            <div className="move-picker">
              <button
                type="button"
                className={`move-picker-root ${moveDest === null ? 'active' : ''}`}
                onClick={() => setMoveDest(null)}
              >
                <FolderIcon size={16} weight="duotone" className="drive-folder-icon" />
                My Files (root)
              </button>
              {tree.map(({ folder, depth }) => (
                <button
                  key={folder.id}
                  type="button"
                  className={`move-picker-item ${moveDest === folder.id ? 'active' : ''}`}
                  style={{ paddingLeft: `${16 + depth * 18}px` }}
                  onClick={() => setMoveDest(folder.id)}
                >
                  <FolderIcon size={16} weight="duotone" className="drive-folder-icon" />
                  {folder.name}
                </button>
              ))}
            </div>
            <div className="modal-form-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={submitMove}>
                <Triangle size={13} weight="bold" /> Move here
              </button>
            </div>
          </div>
        )}

        {dialog.kind === 'share' && dialog.file && (
          <div className="modal-form">
            <div className="share-url">
              {shareUrl ? (
                <span className="share-url-text" title={shareUrl}>
                  {shareUrl}
                </span>
              ) : (
                <span className="muted">Generating link…</span>
              )}
              {copied && (
                <span className="badge badge-green" style={{ flexShrink: 0 }}>
                  <Copy size={11} weight="bold" /> COPIED
                </span>
              )}
            </div>
            <p className="helper">
              Anyone with this link can download the file. Links expire after 7 days.
            </p>
            <div className="modal-form-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Close
              </button>
              {shareUrl && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    navigator.clipboard.writeText(shareUrl).then(() => setCopied(true));
                  }}
                >
                  <LinkSimple size={15} weight="bold" /> Copy link
                </button>
              )}
            </div>
          </div>
        )}

        {dialog.kind === 'confirmDelete' && (
          <div className="modal-form">
            <p className="muted">
              This permanently deletes{' '}
              <strong>
                {dialog.folder ? dialog.folder.name : dialog.file?.original_filename}
              </strong>
              {dialog.folder && ' and everything inside it'}. This cannot be undone.
            </p>
            <div className="modal-form-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy}
                onClick={async () => {
                  const target = dialog.folder
                    ? { type: 'folder' as const, id: dialog.folder.id }
                    : { type: 'file' as const, id: dialog.file!.id };
                  setBusy(true);
                  try {
                    await onConfirmDelete(target);
                    onClose();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Delete forever
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}