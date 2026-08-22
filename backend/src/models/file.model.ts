import { pool } from '../config/database';
import { randomToken } from '../utils/crypto';

interface IFile {
  id: number;
  user_id: number;
  original_filename: string;
  stored_filename: string;
  s3_key: string;
  file_size: number;
  mime_type: string;
  is_public: boolean;
  share_token: string | null;
  share_expires_at: string | null;
  parent_id: number | null;
  starred: boolean;
  trashed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FileListOptions {
  page?: number;
  limit?: number;
  isPublic?: boolean;
  folderId?: number | null; // null → root only; undefined → every folder
  q?: string; // search across all of the user's files
  starred?: boolean;
  trashed?: boolean; // list only trashed files
  sort?: string;
  order?: string;
  type?: string;
}

const SORT_COLUMNS: Record<string, string> = {
  name: 'LOWER(original_filename)',
  size: 'file_size',
  created_at: 'created_at',
  updated_at: 'updated_at',
};

const TYPE_CASE = `
  CASE
    WHEN mime_type LIKE 'image/%' THEN 'image'
    WHEN mime_type LIKE 'video/%' THEN 'video'
    WHEN mime_type LIKE 'audio/%' THEN 'audio'
    WHEN mime_type LIKE 'text/%' THEN 'text'
    WHEN mime_type = 'application/pdf' THEN 'pdf'
    WHEN mime_type = 'text/csv' OR mime_type LIKE '%spreadsheet%' THEN 'sheet'
    WHEN mime_type = 'application/msword' OR mime_type LIKE '%wordprocessing%' THEN 'doc'
    WHEN mime_type LIKE '%presentation%' THEN 'slide'
    WHEN mime_type IN ('application/zip', 'application/gzip', 'application/x-tar') THEN 'archive'
    ELSE 'other'
  END
`;

interface StatsRow {
  used: string;
  active: number;
  starred: number;
  trashed: number;
  total: number;
}

export const FileModel = {
  async createFile(fileData: {
    user_id: number;
    original_filename: string;
    stored_filename: string;
    s3_key: string;
    file_size: number;
    mime_type: string;
    is_public: boolean;
    parent_id?: number | null;
    share_token?: string;
    share_expires_at?: string;
  }): Promise<IFile> {
    const {
      user_id,
      original_filename,
      stored_filename,
      s3_key,
      file_size,
      mime_type,
      is_public,
      parent_id = null,
      share_token,
      share_expires_at,
    } = fileData;

    const query = `
      INSERT INTO files (
        user_id,
        original_filename,
        stored_filename,
        s3_key,
        file_size,
        mime_type,
        is_public,
        parent_id,
        share_token,
        share_expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const values = [
      user_id,
      original_filename,
      stored_filename,
      s3_key,
      file_size,
      mime_type,
      is_public,
      parent_id,
      share_token,
      share_expires_at,
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  },

  async findFileById(id: number, userId?: number): Promise<IFile | null> {
    let query = 'SELECT * FROM files WHERE id = $1';
    const values: any[] = [id];

    if (userId) {
      query += ' AND user_id = $2';
      values.push(userId);
    }

    const result = await pool.query(query, values);
    return result.rows[0] || null;
  },

  async findFilesByUser(
    userId: number,
    options: FileListOptions = {}
  ): Promise<{ files: IFile[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, Math.floor(options.page || 1));
    const limit = Math.min(100, Math.max(1, Math.floor(options.limit || 20)));
    const offset = (page - 1) * limit;

    const where: string[] = ['user_id = $1'];
    const values: any[] = [userId];

    const add = (clause: string, value: unknown) => {
      if (clause.includes('$N')) {
        values.push(value);
        where.push(clause.replace('$N', `$${values.length}`));
      } else {
        where.push(clause);
      }
    };

    if (options.trashed) add('trashed_at IS NOT NULL', null);
    else add('trashed_at IS NULL', null);

    if (options.starred) add('starred = TRUE', null);

    if (options.q && options.q.trim()) {
      add(`LOWER(original_filename) LIKE $N`, `%${options.q.trim().toLowerCase()}%`);
    } else if (options.folderId !== undefined) {
      if (options.folderId === null) {
        add('parent_id IS NULL', null);
      } else {
        add('parent_id = $N', options.folderId);
      }
    }

    if (options.isPublic !== undefined) add('is_public = $N', options.isPublic);

    if (options.type) add(`${TYPE_CASE} = $N`, options.type);

    const sortColumn = SORT_COLUMNS[options.sort || 'created_at'] || 'created_at';
    const sortOrder = options.order === 'asc' ? 'ASC' : 'DESC';
    const orderClause = `${sortColumn} ${sortOrder} NULLS LAST`;

    const whereSql = where.join(' AND ');

    const countQuery = `SELECT COUNT(*)::int AS total FROM files WHERE ${whereSql}`;
    const dataQuery = `SELECT * FROM files WHERE ${whereSql} ORDER BY ${orderClause} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;

    const [countResult, dataResult] = await Promise.all([
      pool.query(countQuery, values),
      pool.query(dataQuery, [...values, limit, offset]),
    ]);

    return {
      files: dataResult.rows,
      total: countResult.rows[0].total,
      page,
      limit,
    };
  },

  async findRecentFiles(userId: number, limit: number = 10): Promise<IFile[]> {
    const result = await pool.query(
      `SELECT * FROM files
       WHERE user_id = $1 AND trashed_at IS NULL
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, Math.min(50, Math.max(1, limit))]
    );
    return result.rows;
  },

  async updateFile(
    id: number,
    userId: number,
    data: { original_filename?: string; parent_id?: number | null }
  ): Promise<IFile | null> {
    const sets: string[] = [];
    const values: any[] = [id, userId];
    if (data.original_filename !== undefined) {
      values.push(data.original_filename);
      sets.push(`original_filename = $${values.length}`);
    }
    if (data.parent_id !== undefined) {
      values.push(data.parent_id);
      sets.push(`parent_id = $${values.length}`);
    }
    if (sets.length === 0) {
      const existing = await this.findFileById(id, userId);
      return existing;
    }
    sets.push('updated_at = CURRENT_TIMESTAMP');

    const result = await pool.query(
      `UPDATE files SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING *`,
      values
    );
    return result.rows[0] || null;
  },

  async setStarred(id: number, userId: number, starred: boolean): Promise<IFile | null> {
    const result = await pool.query(
      `UPDATE files SET starred = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [starred, id, userId]
    );
    return result.rows[0] || null;
  },

  async trashFile(id: number, userId: number): Promise<IFile | null> {
    const result = await pool.query(
      `UPDATE files SET trashed_at = NOW(), updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2 AND trashed_at IS NULL
       RETURNING *`,
      [id, userId]
    );
    return result.rows[0] || null;
  },

  async restoreFile(id: number, userId: number): Promise<IFile | null> {
    const result = await pool.query(
      `UPDATE files SET trashed_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId]
    );
    return result.rows[0] || null;
  },

  async updateFilePublicStatus(id: number, userId: number, isPublic: boolean): Promise<IFile | null> {
    const query = `
      UPDATE files
      SET is_public = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND user_id = $3
      RETURNING *
    `;

    const result = await pool.query(query, [isPublic, id, userId]);
    return result.rows[0] || null;
  },

  async generateShareToken(id: number, userId: number, expiresInDays: number = 7): Promise<IFile | null> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const query = `
      UPDATE files
      SET share_token = $1, share_expires_at = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3 AND user_id = $4 AND is_public = TRUE
      RETURNING *
    `;

    const token = randomToken(32);

    const result = await pool.query(query, [token, expiresAt.toISOString(), id, userId]);
    return result.rows[0] || null;
  },

  async deleteFile(id: number, userId: number): Promise<boolean> {
    const query = 'DELETE FROM files WHERE id = $1 AND user_id = $2';
    const result = await pool.query(query, [id, userId]);
    return (result.rowCount ?? 0) > 0;
  },

  // Every storage key owned by the user (trashed included). Used to purge
  // stored objects before/after cascading deletes wipe the rows.
  async listAllStorageKeys(userId: number): Promise<string[]> {
    const result = await pool.query(
      'SELECT s3_key FROM files WHERE user_id = $1',
      [userId]
    );
    return result.rows.map((row) => row.s3_key as string);
  },

  // Atomic trash purge: deletes expired rows and returns their storage keys.
  // Single statement so a concurrent restore can never have its object purged.
  async deleteExpiredTrash(olderThanDays: number): Promise<string[]> {
    const result = await pool.query(
      `DELETE FROM files
       WHERE trashed_at IS NOT NULL
         AND trashed_at < NOW() - ($1 || ' days')::interval
       RETURNING s3_key`,
      [olderThanDays]
    );
    return result.rows.map((row) => row.s3_key as string);
  },

  async getStats(userId: number): Promise<StatsRow> {
    const result = await pool.query(
      `SELECT
          COALESCE(SUM(file_size), 0)::bigint AS used,
          COUNT(*) FILTER (WHERE trashed_at IS NULL)::int AS active,
          COUNT(*) FILTER (WHERE starred)::int AS starred,
          COUNT(*) FILTER (WHERE trashed_at IS NOT NULL)::int AS trashed,
          COUNT(*)::int AS total
        FROM files
        WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0];
  },

  async findPublicFileByShareToken(token: string): Promise<IFile | null> {
    const query = 'SELECT * FROM files WHERE share_token = $1 AND share_expires_at > NOW() AND is_public = TRUE';
    const result = await pool.query(query, [token]);
    return result.rows[0] || null;
  },

  // Safe, public metadata for the shared-page preview (never leaks s3_key).
  async findPublicFileInfoByShareToken(token: string): Promise<Pick<IFile, 'id' | 'original_filename' | 'file_size' | 'mime_type' | 'created_at'> | null> {
    const query = `
      SELECT id, original_filename, file_size, mime_type, created_at
      FROM files
      WHERE share_token = $1 AND share_expires_at > NOW() AND is_public = TRUE
    `;
    const result = await pool.query(query, [token]);
    return result.rows[0] || null;
  },
};