import { Request, Response } from 'express';
import { pool } from '../config/database';

interface ChatPayload {
  message: string;
}

export const chat = async (req: Request, res: Response) => {
  try {
    const { message } = req.body as ChatPayload;
    if (!message) {
      res.status(400).json({ message: 'Message is required' });
      return;
    }

    const lower = message.toLowerCase().trim();

    // --- Intent detection & simple responses ---

    // 1. Search files
    if (lower.startsWith('find') || lower.startsWith('search')) {
      const query = message.replace(/^(find|search)\s+/i, '').trim();
      const { rows: files } = await pool.query(
        `SELECT id, original_filename FROM files WHERE user_id = 1 AND LOWER(original_filename) LIKE $1 LIMIT 20`,
        [`%${query}%`]
      );
      if (files.length === 0) {
        res.json({ response: "I couldn't find any files matching that query." });
      } else {
        const names = files.map((f: any) => f.original_filename).join(', ');
        res.json({ response: `Found ${files.length} file(s): ${names}` });
      }
      return;
    }

    // 2. Stats / quota
    if (/(total|quota|usage|space)/i.test(lower)) {
      const { rows } = await pool.query<
        { used: string; total: string }
      >(`SELECT COALESCE(SUM(file_size)::text, '0') AS used, (SELECT COALESCE(SUM(file_size)::text, '0') FROM files WHERE trashed_at IS NULL) AS total FROM files WHERE user_id = 1`);
      const used = rows[0]?.used || '0';
      const total = rows[0]?.total || '0';
      const remaining = Number(total) > Number(used) ? String(Number(total) - Number(used)) : '0';
      res.json({
        response: `Your storage usage: ${used} / ${total}. ${remaining} remaining.`,
      });
      return;
    }

    // 3. Recent
    if (/(recent|last|new)/i.test(lower)) {
      const { rows: files } = await pool.query(
        `SELECT id, original_filename FROM files WHERE user_id = 1 ORDER BY created_at DESC LIMIT 10`
      );
      if (files.length === 0) {
        res.json({ response: 'No recent files.' });
      } else {
        const names = files.map((f: any) => f.original_filename).join(', ');
        res.json({ response: `Recent: ${names}` });
      }
      return;
    }

    // 4. List folders
    if (/(folders|directory|tree)/i.test(lower)) {
      const { rows: folders } = await pool.query(
        `SELECT id, name, parent_id FROM folders WHERE user_id = 1 ORDER BY name`
      );
      if (folders.length === 0) {
        res.json({ response: 'No folders yet.' });
      } else {
        const names = folders.map((f: any) => f.name).join(', ');
        res.json({ response: `Folders: ${names}` });
      }
      return;
    }

    // 5. Create folder
    if (/^create\s+folder/i.test(lower) || /^new folder/i.test(lower)) {
      const nameMatch = message.match(/(?:create|new)\s+folder\s+(.+)/i);
      const folderName = nameMatch ? nameMatch[1].trim() : 'New Folder';
      const { rows: [folder] } = await pool.query(
        `INSERT INTO folders (name, parent_id, user_id) VALUES ($1, $2, 1) RETURNING *`,
        [folderName, null]
      );
      res.json({ response: `Folder "${folder.name}" created.`, metadata: { folder } });
      return;
    }

    // 6. Default: conversational help
    res.json({
      response:
        'I can help you search your files, check storage stats, list folders, create folders, and more. Try asking me to "find important documents", "check my storage usage", or "list your folders".',
    });
  } catch (err: any) {
    console.error('AI chat error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};