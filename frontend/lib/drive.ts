import { api, downloadFile } from './api';

export interface DriveFile {
  id: number;
  original_filename: string;
  file_size: number;
  mime_type: string | null;
  is_public: boolean;
  share_token: string | null;
  share_expires_at: string | null;
  parent_id: number | null;
  starred: boolean;
  trashed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Folder {
  id: number;
  name: string;
  parent_id: number | null;
  trashed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ListResult {
  files: DriveFile[];
  pagination: Pagination;
}

export interface Stats {
  quota: number;
  used: number;
  active: number;
  starred: number;
  trashed: number;
  total: number;
}

export type FileTypeFilter =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'doc'
  | 'sheet'
  | 'slide'
  | 'archive'
  | 'text'
  | 'other';

export type DriveMode = 'all' | 'recent' | 'starred' | 'trash' | 'folder';

export interface ListParams {
  folderId?: number | null;
  q?: string;
  starred?: boolean;
  trashed?: boolean;
  sort?: string;
  order?: string;
  type?: FileTypeFilter;
  page?: number;
  limit?: number;
}

// Small helper to drop undefined params so the URL stays clean.
function qs(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'boolean') search.set(key, value ? 'true' : 'false');
    else search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

export const driveApi = {
  async listFiles(params: ListParams): Promise<ListResult> {
    const qp: Record<string, unknown> = { page: params.page || 1, limit: params.limit || 60 };
    if (params.folderId !== undefined) qp.folder_id = params.folderId === null ? 'root' : params.folderId;
    if (params.q) qp.q = params.q;
    if (params.starred !== undefined) qp.starred = params.starred;
    if (params.trashed !== undefined) qp.trashed = params.trashed;
    if (params.sort) qp.sort = params.sort;
    if (params.order) qp.order = params.order;
    if (params.type) qp.type = params.type;
    return api.get<ListResult>(`/api/files${qs(qp)}`);
  },

  listFolders(): Promise<{ folders: Folder[] }> {
    return api.get('/api/folders');
  },

  getStats(): Promise<Stats> {
    return api.get('/api/files/stats');
  },

  getRecent(limit = 10): Promise<{ files: DriveFile[] }> {
    return api.get(`/api/files/recent?limit=${limit}`);
  },

  createFolder(name: string, parentId: number | null): Promise<{ folder: Folder }> {
    return api.post('/api/folders', { name, parent_id: parentId });
  },

  renameFolder(id: number, name: string): Promise<{ folder: Folder }> {
    return api.put(`/api/folders/${id}`, { name });
  },

  moveFolder(id: number, parentId: number | null): Promise<{ folder: Folder }> {
    return api.put(`/api/folders/${id}`, { parent_id: parentId });
  },

  trashFolder(id: number): Promise<{ message: string }> {
    return api.post(`/api/folders/${id}/trash`);
  },

  restoreFolder(id: number): Promise<{ message: string }> {
    return api.post(`/api/folders/${id}/restore`);
  },

  deleteFolder(id: number): Promise<{ message: string }> {
    return api.delete(`/api/folders/${id}`);
  },

  renameFile(id: number, name: string): Promise<{ file: DriveFile }> {
    return api.put(`/api/files/${id}`, { original_filename: name });
  },

  moveFile(id: number, parentId: number | null): Promise<{ file: DriveFile }> {
    return api.put(`/api/files/${id}`, { parent_id: parentId });
  },

  starFile(id: number, starred: boolean): Promise<{ file: DriveFile }> {
    return api.post(`/api/files/${id}/star`, { starred });
  },

  trashFile(id: number): Promise<{ file: DriveFile; message: string }> {
    return api.post(`/api/files/${id}/trash`);
  },

  restoreFile(id: number): Promise<{ file: DriveFile; message: string }> {
    return api.post(`/api/files/${id}/restore`);
  },

  deleteFile(id: number): Promise<{ message: string }> {
    return api.delete(`/api/files/${id}`);
  },

  togglePublic(id: number, isPublic: boolean): Promise<{ file: DriveFile }> {
    return api.put(`/api/files/${id}/toggle-public`, { is_public: isPublic });
  },

  generateShare(id: number): Promise<{ share_url: string; share_token: string }> {
    return api.post(`/api/files/${id}/share`);
  },

  download(id: number) {
    return downloadFile(`/api/files/${id}/download`);
  },

  // XHR-based upload with progress (cookies carry the session).
  upload(file: File, parentId: number | null, onProgress: (pct: number) => void): Promise<DriveFile> {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append('file', file);
      if (parentId !== null) form.append('parent_id', String(parentId));

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/files/upload');
      xhr.withCredentials = true;

      const csrf = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/)?.[1];
      if (csrf) xhr.setRequestHeader('X-CSRF-Token', decodeURIComponent(csrf));

      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) onProgress(Math.round((ev.loaded / ev.total) * 100));
      };
      xhr.onload = () => {
        let data: any = {};
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          // non-JSON error body
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data.file);
        } else {
          reject(new Error(data.message || 'Upload failed'));
        }
      };
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(form);
    });
  },
};