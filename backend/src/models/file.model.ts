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
  created_at: string;
  updated_at: string;
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
        share_token,
        share_expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, values);
    return result.rows[0] || null;
  },

  async findFilesByUser(
    userId: number,
    options: { page?: number; limit?: number; isPublic?: boolean } = {}
  ): Promise<{ files: IFile[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, Math.floor(options.page || 1));
    const limit = Math.min(100, Math.max(1, Math.floor(options.limit || 20)));
    const offset = (page - 1) * limit;

    let where = 'WHERE user_id = $1';
    const values: any[] = [userId];

    if (options.isPublic !== undefined) {
      values.push(options.isPublic);
      where += ` AND is_public = $${values.length}`;
    }

    const countQuery = `SELECT COUNT(*)::int AS total FROM files ${where}`;
    const dataQuery = `SELECT * FROM files ${where} ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;

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