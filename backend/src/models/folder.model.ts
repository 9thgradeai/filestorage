import { pool } from '../config/database';

export interface FolderRow {
  id: number;
  user_id: number;
  name: string;
  parent_id: number | null;
  trashed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// Recursive CTE that returns this folder and every descendant folder id.
const SUBTREE_SQL = `
  WITH RECURSIVE subtree AS (
    SELECT id, parent_id FROM folders WHERE id = $1 AND user_id = $2
    UNION ALL
    SELECT f.id, f.parent_id FROM folders f
    INNER JOIN subtree s ON f.parent_id = s.id
    WHERE f.user_id = $2
  )
`;

export const FolderModel = {
  async create(userId: number, name: string, parentId: number | null): Promise<FolderRow> {
    const { rows } = await pool.query(
      `INSERT INTO folders (user_id, name, parent_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, name, parentId]
    );
    return rows[0];
  },

  async listForUser(userId: number): Promise<FolderRow[]> {
    const { rows } = await pool.query(
      'SELECT * FROM folders WHERE user_id = $1 ORDER BY trashed_at NULLS FIRST, name ASC',
      [userId]
    );
    return rows;
  },

  async findById(id: number, userId: number): Promise<FolderRow | undefined> {
    const { rows } = await pool.query(
      'SELECT * FROM folders WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return rows[0];
  },

  async update(
    id: number,
    userId: number,
    data: { name?: string; parent_id?: number | null }
  ): Promise<FolderRow | undefined> {
    const sets: string[] = [];
    const values: any[] = [id, userId];
    if (data.name !== undefined) {
      values.push(data.name);
      sets.push(`name = $${values.length}`);
    }
    if (data.parent_id !== undefined) {
      // null means "move to root" — express as an explicit set so Joi .default(null)
      // cannot be confused with an omitted field.
      values.push(data.parent_id);
      sets.push(`parent_id = $${values.length}`);
    }
    if (sets.length === 0) return this.findById(id, userId);
    sets.push('updated_at = CURRENT_TIMESTAMP');

    const { rows } = await pool.query(
      `UPDATE folders SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING *`,
      values
    );
    return rows[0];
  },

  // All ids in the subtree rooted at `id` (inclusive).
  async descendantIds(id: number, userId: number): Promise<number[]> {
    const { rows } = await pool.query(
      `${SUBTREE_SQL} SELECT id FROM subtree`,
      [id, userId]
    );
    return rows.map((r) => r.id);
  },

  // Every s3_key belonging to files inside the subtree (used before permanent
  // delete so storage objects can be removed first).
  async subtreeFileKeys(id: number, userId: number): Promise<string[]> {
    const { rows } = await pool.query(
      `${SUBTREE_SQL}
       SELECT f.s3_key FROM files f
       INNER JOIN subtree s ON f.parent_id = s.id
       WHERE f.user_id = $2`,
      [id, userId]
    );
    return rows.map((r) => r.s3_key);
  },

  // Soft-delete the folder and everything beneath it (files become trashed).
  async trashRecursive(id: number, userId: number): Promise<boolean> {
    const ids = await this.descendantIds(id, userId);
    if (ids.length === 0) return false;
    await pool.query(
      `UPDATE folders SET trashed_at = NOW(), updated_at = NOW()
       WHERE user_id = $1 AND id = ANY($2::int[])`,
      [userId, ids]
    );
    await pool.query(
      `UPDATE files SET trashed_at = NOW(), updated_at = NOW()
       WHERE user_id = $1 AND parent_id = ANY($2::int[])`,
      [userId, ids]
    );
    return true;
  },

  // Restore the folder and everything beneath it. If the original parent is
  // itself trashed (or gone), the folder is parked at the root so the restored
  // contents are visible immediately.
  async restoreRecursive(id: number, userId: number): Promise<boolean> {
    const ids = await this.descendantIds(id, userId);
    if (ids.length === 0) return false;
    // Folders whose parent is still trashed (or missing/root) move to root…
    await pool.query(
      `UPDATE folders f SET trashed_at = NULL, updated_at = NOW(), parent_id = NULL
       WHERE f.user_id = $1 AND f.id = ANY($2::int[])
         AND (f.parent_id IS NULL OR NOT EXISTS (
           SELECT 1 FROM folders p WHERE p.id = f.parent_id AND p.trashed_at IS NOT NULL
         ))`,
      [userId, ids]
    );
    // …the rest keep their existing parent; all are un-trashed.
    await pool.query(
      `UPDATE folders SET trashed_at = NULL, updated_at = NOW()
       WHERE user_id = $1 AND id = ANY($2::int[])`,
      [userId, ids]
    );
    await pool.query(
      `UPDATE files SET trashed_at = NULL, updated_at = NOW()
       WHERE user_id = $1 AND parent_id = ANY($2::int[])`,
      [userId, ids]
    );
    return true;
  },

  // Permanently delete the folder subtree. Returns the storage keys that must
  // be removed from object storage (caller handles that, then deletes rows).
  async deleteRecursive(id: number, userId: number): Promise<string[]> {
    const keys = await this.subtreeFileKeys(id, userId);
    const subtreeIds = await this.descendantIds(id, userId);
    if (subtreeIds.length > 0) {
      await pool.query(
        `DELETE FROM files WHERE user_id = $1 AND parent_id = ANY($2::int[])`,
        [userId, subtreeIds]
      );
      await pool.query(
        `DELETE FROM folders WHERE user_id = $1 AND id = ANY($2::int[])`,
        [userId, subtreeIds]
      );
    }
    return keys;
  },
};