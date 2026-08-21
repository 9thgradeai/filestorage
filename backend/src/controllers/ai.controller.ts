import { Request, Response } from 'express';
import { pool } from '../config/database';
import { logger } from '../config/logger';
import { FileModel } from '../models/file.model';
import { FolderModel } from '../models/folder.model';

// ─── Types ──────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ActionResult {
  type: 'files' | 'folders' | 'stats' | 'text' | 'error' | 'actions';
  data?: any;
  message: string;
}

interface ParsedIntent {
  intent: string;
  entities: Record<string, any>;
  confidence: number;
}

// ─── Intent Recognition ─────────────────────────────────────────────────

const INTENT_PATTERNS: { pattern: RegExp; intent: string; entities?: (match: RegExpMatchArray) => Record<string, any> }[] = [
  // File operations
  { pattern: /^(?:search|find|look\s+for|where\s+(?:is|are)|locate|show\s+me)\s+(.+)/i, intent: 'search_files' },
  { pattern: /^(?:delete|remove|trash|bin)\s+(?:file\s+)?["']?(.+?)["']?\s*$/i, intent: 'trash_file' },
  { pattern: /^(?:restore|recover|undelete|untrash)\s+(?:file\s+)?["']?(.+?)["']?\s*$/i, intent: 'restore_file' },
  { pattern: /^(?:star|pin|favorite|mark)\s+(?:file\s+)?["']?(.+?)["']?\s*$/i, intent: 'star_file' },
  { pattern: /^(?:unstar|unpin|unfavorite|unmark)\s+(?:file\s+)?["']?(.+?)["']?\s*$/i, intent: 'unstar_file' },
  { pattern: /^(?:rename)\s+(?:file\s+)?["']?(.+?)["']?\s+(?:to|as)\s+["']?(.+?)["']?\s*$/i, intent: 'rename_file' },
  { pattern: /^(?:move)\s+(?:file\s+)?["']?(.+?)["']?\s+(?:to|into)\s+["']?(.+?)["']?\s*$/i, intent: 'move_file' },
  { pattern: /^(?:download|get)\s+(?:file\s+)?["']?(.+?)["']?\s*$/i, intent: 'download_file' },

  // Folder operations
  { pattern: /^(?:create|new|make)\s+(?:a\s+)?folder\s+(?:called\s+|named\s+)?["']?(.+?)["']?\s*$/i, intent: 'create_folder' },
  { pattern: /^(?:delete|remove|trash)\s+folder\s+["']?(.+?)["']?\s*$/i, intent: 'trash_folder' },
  { pattern: /^(?:restore|recover)\s+folder\s+["']?(.+?)["']?\s*$/i, intent: 'restore_folder' },
  { pattern: /^(?:rename)\s+folder\s+["']?(.+?)["']?\s+(?:to|as)\s+["']?(.+?)["']?\s*$/i, intent: 'rename_folder' },
  { pattern: /^(?:list|show|see)\s+(?:my\s+)?folders?\b/i, intent: 'list_folders' },

  // Views
  { pattern: /^(?:show|list|what(?:'s| is| are))\s+(?:my\s+)?(?:recent|latest|new(?:est)?)\s*(?:files?|uploads?)?\s*$/i, intent: 'recent_files' },
  { pattern: /^(?:show|list|what(?:'s| is| are))\s+(?:my\s+)?(?:starred|pinned|favorite|important)\s*(?:files?|items?)?\s*$/i, intent: 'starred_files' },
  { pattern: /^(?:show|list|what(?:'s| is| are))\s+(?:my\s+)?(?:trash(?:ed)?|deleted|bin)\s*(?:files?|items?)?\s*$/i, intent: 'trashed_files' },
  { pattern: /^(?:what|how)\s+(?:much|many)\s+(?:space|storage|room)\s+(?:do\s+I|have|left|remain)/i, intent: 'storage_stats' },
  { pattern: /^(?:storage|quota|space|usage|stats|statistics)\s*$/i, intent: 'storage_stats' },

  // Help
  { pattern: /^(?:help|what\s+can\s+you\s+do|commands?|options?|capabilities)\s*\??\s*$/i, intent: 'help' },
  { pattern: /^(?:hi|hello|hey|howdy|greetings|sup|yo)\s*[!.]?\s*$/i, intent: 'greeting' },
  { pattern: /^(?:thanks?|thank\s+you|thx|ty|cheers|appreciate)\s*[!.]?\s*$/i, intent: 'thanks' },

  // Conversational
  { pattern: /^(?:who\s+are\s+you|what\s+are\s+you|your\s+name|about)\s*\??\s*$/i, intent: 'about' },
  { pattern: /^(?:clear|reset|new\s+chat|start\s+over)\s*$/i, intent: 'clear_chat' },
];

function parseIntent(message: string): ParsedIntent {
  const trimmed = message.trim();

  for (const { pattern, intent } of INTENT_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return { intent, entities: { raw: trimmed, match }, confidence: 0.9 };
    }
  }

  // Fuzzy fallback: check for keywords
  const lower = trimmed.toLowerCase();
  if (/\b(search|find|where|locate)\b/.test(lower)) return { intent: 'search_files', entities: { raw: trimmed }, confidence: 0.6 };
  if (/\b(delete|remove|trash|bin)\b/.test(lower)) return { intent: 'trash_file', entities: { raw: trimmed }, confidence: 0.5 };
  if (/\b(restore|recover|undelete)\b/.test(lower)) return { intent: 'restore_file', entities: { raw: trimmed }, confidence: 0.5 };
  if (/\b(star|pin|favorite)\b/.test(lower)) return { intent: 'star_file', entities: { raw: trimmed }, confidence: 0.5 };
  if (/\b(rename)\b/.test(lower)) return { intent: 'rename_file', entities: { raw: trimmed }, confidence: 0.5 };
  if (/\b(move)\b/.test(lower)) return { intent: 'move_file', entities: { raw: trimmed }, confidence: 0.5 };
  if (/\b(download|get)\b/.test(lower)) return { intent: 'download_file', entities: { raw: trimmed }, confidence: 0.5 };
  if (/\b(folder|directories)\b/.test(lower)) return { intent: 'list_folders', entities: { raw: trimmed }, confidence: 0.4 };
  if (/\b(recent|latest|new)\b/.test(lower)) return { intent: 'recent_files', entities: { raw: trimmed }, confidence: 0.4 };
  if (/\b(starred|pinned|favorite|important)\b/.test(lower)) return { intent: 'starred_files', entities: { raw: trimmed }, confidence: 0.4 };
  if (/\b(trash|deleted|bin)\b/.test(lower)) return { intent: 'trashed_files', entities: { raw: trimmed }, confidence: 0.4 };
  if (/\b(space|storage|quota|usage|stats)\b/.test(lower)) return { intent: 'storage_stats', entities: { raw: trimmed }, confidence: 0.5 };

  return { intent: 'unknown', entities: { raw: trimmed }, confidence: 0 };
}

// ─── Helpers ─────────────────────────────────────────────────────────────

const STORAGE_QUOTA = parseInt(process.env.DEFAULT_STORAGE_QUOTA || '', 10) || 5 * 1024 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return `${Math.floor(diffDay / 30)}mo ago`;
}

function getFileIcon(mime: string | null): string {
  if (!mime) return '📄';
  if (mime.startsWith('image/')) return '🖼️';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('audio/')) return '🎵';
  if (mime === 'application/pdf') return '📕';
  if (mime.includes('spreadsheet') || mime.includes('csv') || mime.includes('excel')) return '📊';
  if (mime.includes('word') || mime.includes('document')) return '📝';
  if (mime.includes('presentation')) return '📽️';
  if (mime.includes('zip') || mime.includes('gzip') || mime.includes('tar')) return '📦';
  if (mime.startsWith('text/')) return '📃';
  return '📄';
}

function buildFileCards(files: any[]): any[] {
  return files.map((f) => ({
    type: 'file_card' as const,
    id: f.id,
    name: f.original_filename,
    size: formatBytes(f.file_size),
    sizeBytes: f.file_size,
    mime: f.mime_type,
    icon: getFileIcon(f.mime_type),
    starred: f.starred,
    trashed: !!f.trashed_at,
    isPublic: f.is_public,
    createdAt: f.created_at,
    relativeTime: formatRelativeTime(new Date(f.created_at)),
  }));
}

function buildFolderCards(folders: any[]): any[] {
  return folders.map((f) => ({
    type: 'folder_card' as const,
    id: f.id,
    name: f.name,
    parentId: f.parent_id,
    trashed: !!f.trashed_at,
    createdAt: f.created_at,
  }));
}

// ─── Intent Handlers ────────────────────────────────────────────────────

async function handleSearchFiles(userId: number, raw: string): Promise<ActionResult> {
  // Extract the search query by removing trigger words
  let query = raw
    .replace(/^(?:search|find|look\s+for|where\s+(?:is|are)|locate|show\s+me)\s+/i, '')
    .replace(/^(?:file|files)\s+/i, '')
    .replace(/["']/g, '')
    .trim();

  if (!query) {
    return { type: 'text', message: 'What would you like me to search for? Try something like "find photos" or "search documents".' };
  }

  const { rows: files } = await pool.query(
    `SELECT id, original_filename, file_size, mime_type, starred, trashed_at, is_public, created_at
     FROM files WHERE user_id = $1 AND LOWER(original_filename) LIKE $2
     ORDER BY created_at DESC LIMIT 20`,
    [userId, `%${query.toLowerCase()}%`]
  );

  if (files.length === 0) {
    return { type: 'files', data: [], message: `No files found matching "${query}".` };
  }

  return {
    type: 'files',
    data: buildFileCards(files),
    message: `Found ${files.length} file${files.length !== 1 ? 's' : ""} matching "${query}":`,
  };
}

async function handleTrashFile(userId: number, raw: string): Promise<ActionResult> {
  const name = raw
    .replace(/^(?:delete|remove|trash|bin)\s+(?:file\s+)?/i, '')
    .replace(/["']/g, '')
    .trim();

  if (!name) {
    return { type: 'text', message: 'Which file should I trash? Please provide the filename.' };
  }

  const { rows: files } = await pool.query(
    `SELECT id, original_filename FROM files WHERE user_id = $1 AND LOWER(original_filename) LIKE $2 AND trashed_at IS NULL LIMIT 5`,
    [userId, `%${name.toLowerCase()}%`]
  );

  if (files.length === 0) {
    return { type: 'text', message: `No active file found matching "${name}".` };
  }
  if (files.length > 1) {
    return {
      type: 'files',
      data: buildFileCards(files),
      message: `Found ${files.length} files matching "${name}". Which one should I trash?`,
    };
  }

  await FileModel.trashFile(files[0].id, userId);
  return { type: 'text', message: `Moved "${files[0].original_filename}" to trash.` };
}

async function handleRestoreFile(userId: number, raw: string): Promise<ActionResult> {
  const name = raw
    .replace(/^(?:restore|recover|undelete|untrash)\s+(?:file\s+)?/i, '')
    .replace(/["']/g, '')
    .trim();

  if (!name) {
    return { type: 'text', message: 'Which file should I restore? Check your trash first.' };
  }

  const { rows: files } = await pool.query(
    `SELECT id, original_filename FROM files WHERE user_id = $1 AND LOWER(original_filename) LIKE $2 AND trashed_at IS NOT NULL LIMIT 5`,
    [userId, `%${name.toLowerCase()}%`]
  );

  if (files.length === 0) {
    return { type: 'text', message: `No trashed file found matching "${name}".` };
  }
  if (files.length > 1) {
    return {
      type: 'files',
      data: buildFileCards(files),
      message: `Found ${files.length} trashed files matching "${name}". Which one should I restore?`,
    };
  }

  await FileModel.restoreFile(files[0].id, userId);
  return { type: 'text', message: `Restored "${files[0].original_filename}" from trash.` };
}

async function handleStarFile(userId: number, raw: string, star: boolean): Promise<ActionResult> {
  const action = star ? 'star' : 'unstar';
  const name = raw
    .replace(new RegExp(`^(?:${action}(?:r|red)?)\\s+(?:file\\s+)?`, 'i'), '')
    .replace(/["']/g, '')
    .trim();

  if (!name) {
    return { type: 'text', message: `Which file should I ${action}?` };
  }

  const { rows: files } = await pool.query(
    `SELECT id, original_filename, starred FROM files WHERE user_id = $1 AND LOWER(original_filename) LIKE $2 AND trashed_at IS NULL LIMIT 5`,
    [userId, `%${name.toLowerCase()}%`]
  );

  if (files.length === 0) {
    return { type: 'text', message: `No active file found matching "${name}".` };
  }
  if (files.length > 1) {
    return {
      type: 'files',
      data: buildFileCards(files),
      message: `Found ${files.length} files matching "${name}". Which one should I ${action}?`,
    };
  }

  await FileModel.setStarred(files[0].id, userId, star);
  return { type: 'text', message: `${star ? 'Starred' : 'Unstarred'} "${files[0].original_filename}".` };
}

async function handleRenameFile(userId: number, raw: string): Promise<ActionResult> {
  const match = raw.match(/^(?:rename)\s+(?:file\s+)?["']?(.+?)["']?\s+(?:to|as)\s+["']?(.+?)["']?\s*$/i);
  if (!match) {
    return { type: 'text', message: 'Usage: rename file "old name" to "new name"' };
  }

  const [, oldName, newName] = match;
  const cleanOld = oldName.replace(/["']/g, '').trim();
  const cleanNew = newName.replace(/["']/g, '').trim();

  if (!cleanOld || !cleanNew) {
    return { type: 'text', message: 'Please provide both the current and new filename.' };
  }

  const { rows: files } = await pool.query(
    `SELECT id, original_filename FROM files WHERE user_id = $1 AND LOWER(original_filename) LIKE $2 AND trashed_at IS NULL LIMIT 1`,
    [userId, `%${cleanOld.toLowerCase()}%`]
  );

  if (files.length === 0) {
    return { type: 'text', message: `No file found matching "${cleanOld}".` };
  }

  await FileModel.updateFile(files[0].id, userId, { original_filename: cleanNew });
  return { type: 'text', message: `Renamed "${files[0].original_filename}" to "${cleanNew}".` };
}

async function handleMoveFile(userId: number, raw: string): Promise<ActionResult> {
  const match = raw.match(/^(?:move)\s+(?:file\s+)?["']?(.+?)["']?\s+(?:to|into)\s+["']?(.+?)["']?\s*$/i);
  if (!match) {
    return { type: 'text', message: 'Usage: move file "filename" to "folder name"' };
  }

  const [, fileName, folderName] = match;
  const cleanFile = fileName.replace(/["']/g, '').trim();
  const cleanFolder = folderName.replace(/["']/g, '').trim();

  if (!cleanFile || !cleanFolder) {
    return { type: 'text', message: 'Please provide both the filename and destination folder.' };
  }

  const { rows: files } = await pool.query(
    `SELECT id, original_filename FROM files WHERE user_id = $1 AND LOWER(original_filename) LIKE $2 AND trashed_at IS NULL LIMIT 1`,
    [userId, `%${cleanFile.toLowerCase()}%`]
  );

  if (files.length === 0) {
    return { type: 'text', message: `No file found matching "${cleanFile}".` };
  }

  const { rows: folders } = await pool.query(
    `SELECT id, name FROM folders WHERE user_id = $1 AND LOWER(name) LIKE $2 AND trashed_at IS NULL LIMIT 1`,
    [userId, `%${cleanFolder.toLowerCase()}%`]
  );

  if (folders.length === 0) {
    return { type: 'text', message: `No folder found matching "${cleanFolder}".` };
  }

  await FileModel.updateFile(files[0].id, userId, { parent_id: folders[0].id });
  return { type: 'text', message: `Moved "${files[0].original_filename}" to folder "${folders[0].name}".` };
}

async function handleDownloadFile(userId: number, raw: string): Promise<ActionResult> {
  const name = raw
    .replace(/^(?:download|get)\s+(?:file\s+)?/i, '')
    .replace(/["']/g, '')
    .trim();

  if (!name) {
    return { type: 'text', message: 'Which file would you like to download?' };
  }

  const { rows: files } = await pool.query(
    `SELECT id, original_filename FROM files WHERE user_id = $1 AND LOWER(original_filename) LIKE $2 AND trashed_at IS NULL LIMIT 5`,
    [userId, `%${name.toLowerCase()}%`]
  );

  if (files.length === 0) {
    return { type: 'text', message: `No file found matching "${name}".` };
  }

  return {
    type: 'files',
    data: buildFileCards(files),
    message: `Found ${files.length} file${files.length !== 1 ? 's' : ""} matching "${name}". Click download on the file you want:`,
  };
}

async function handleCreateFolder(userId: number, raw: string): Promise<ActionResult> {
  let name = raw
    .replace(/^(?:create|new|make)\s+(?:a\s+)?folder\s+(?:called\s+|named\s+)?/i, '')
    .replace(/["']/g, '')
    .trim();

  if (!name) name = 'New Folder';

  const { rows: [folder] } = await pool.query(
    `INSERT INTO folders (name, parent_id, user_id) VALUES ($1, NULL, $3) RETURNING *`,
    [name, null, userId]
  );

  return {
    type: 'folders',
    data: buildFolderCards([folder]),
    message: `Created folder "${folder.name}".`,
  };
}

async function handleTrashFolder(userId: number, raw: string): Promise<ActionResult> {
  const name = raw
    .replace(/^(?:delete|remove|trash)\s+folder\s+/i, '')
    .replace(/["']/g, '')
    .trim();

  if (!name) {
    return { type: 'text', message: 'Which folder should I trash?' };
  }

  const { rows: folders } = await pool.query(
    `SELECT id, name FROM folders WHERE user_id = $1 AND LOWER(name) LIKE $2 AND trashed_at IS NULL LIMIT 5`,
    [userId, `%${name.toLowerCase()}%`]
  );

  if (folders.length === 0) {
    return { type: 'text', message: `No active folder found matching "${name}".` };
  }
  if (folders.length > 1) {
    return {
      type: 'folders',
      data: buildFolderCards(folders),
      message: `Found ${folders.length} folders matching "${name}". Which one should I trash?`,
    };
  }

  await FolderModel.trashRecursive(folders[0].id, userId);
  return { type: 'text', message: `Moved folder "${folders[0].name}" to trash (including all contents).` };
}

async function handleRestoreFolder(userId: number, raw: string): Promise<ActionResult> {
  const name = raw
    .replace(/^(?:restore|recover)\s+folder\s+/i, '')
    .replace(/["']/g, '')
    .trim();

  if (!name) {
    return { type: 'text', message: 'Which folder should I restore?' };
  }

  const { rows: folders } = await pool.query(
    `SELECT id, name FROM folders WHERE user_id = $1 AND LOWER(name) LIKE $2 AND trashed_at IS NOT NULL LIMIT 5`,
    [userId, `%${name.toLowerCase()}%`]
  );

  if (folders.length === 0) {
    return { type: 'text', message: `No trashed folder found matching "${name}".` };
  }

  await FolderModel.restoreRecursive(folders[0].id, userId);
  return { type: 'text', message: `Restored folder "${folders[0].name}" from trash.` };
}

async function handleRenameFolder(userId: number, raw: string): Promise<ActionResult> {
  const match = raw.match(/^(?:rename)\s+folder\s+["']?(.+?)["']?\s+(?:to|as)\s+["']?(.+?)["']?\s*$/i);
  if (!match) {
    return { type: 'text', message: 'Usage: rename folder "old name" to "new name"' };
  }

  const [, oldName, newName] = match;
  const cleanOld = oldName.replace(/["']/g, '').trim();
  const cleanNew = newName.replace(/["']/g, '').trim();

  const { rows: folders } = await pool.query(
    `SELECT id, name FROM folders WHERE user_id = $1 AND LOWER(name) LIKE $2 AND trashed_at IS NULL LIMIT 1`,
    [userId, `%${cleanOld.toLowerCase()}%`]
  );

  if (folders.length === 0) {
    return { type: 'text', message: `No folder found matching "${cleanOld}".` };
  }

  await FolderModel.update(folders[0].id, userId, { name: cleanNew });
  return { type: 'text', message: `Renamed folder "${folders[0].name}" to "${cleanNew}".` };
}

async function handleListFolders(userId: number): Promise<ActionResult> {
  const folders = await FolderModel.listForUser(userId);
  const active = folders.filter((f) => !f.trashed_at);

  if (active.length === 0) {
    return { type: 'text', message: "You don't have any folders yet. Create one with 'create folder my-folder'." };
  }

  return {
    type: 'folders',
    data: buildFolderCards(active),
    message: `You have ${active.length} folder${active.length !== 1 ? 's' : ''}:`,
  };
}

async function handleRecentFiles(userId: number): Promise<ActionResult> {
  const files = await FileModel.findRecentFiles(userId, 15);

  if (files.length === 0) {
    return { type: 'text', message: "You haven't uploaded any files yet." };
  }

  return {
    type: 'files',
    data: buildFileCards(files),
    message: `Here are your ${files.length} most recent files:`,
  };
}

async function handleStarredFiles(userId: number): Promise<ActionResult> {
  const { rows: files } = await pool.query(
    `SELECT id, original_filename, file_size, mime_type, starred, trashed_at, is_public, created_at
     FROM files WHERE user_id = $1 AND starred = TRUE AND trashed_at IS NULL
     ORDER BY created_at DESC LIMIT 20`,
    [userId]
  );

  if (files.length === 0) {
    return { type: 'text', message: "You don't have any starred files. Star files for quick access!" };
  }

  return {
    type: 'files',
    data: buildFileCards(files),
    message: `Here are your ${files.length} starred file${files.length !== 1 ? 's' : ''}:`,
  };
}

async function handleTrashedFiles(userId: number): Promise<ActionResult> {
  const { rows: files } = await pool.query(
    `SELECT id, original_filename, file_size, mime_type, starred, trashed_at, is_public, created_at
     FROM files WHERE user_id = $1 AND trashed_at IS NOT NULL
     ORDER BY trashed_at DESC LIMIT 20`,
    [userId]
  );

  if (files.length === 0) {
    return { type: 'text', message: 'Your trash is empty.' };
  }

  return {
    type: 'files',
    data: buildFileCards(files),
    message: `You have ${files.length} file${files.length !== 1 ? 's' : ''} in trash:`,
  };
}

async function handleStorageStats(userId: number): Promise<ActionResult> {
  const stats = await FileModel.getStats(userId);
  const used = parseInt(stats.used, 10) || 0;
  const active = stats.active || 0;
  const starred = stats.starred || 0;
  const trashed = stats.trashed || 0;
  const remaining = Math.max(0, STORAGE_QUOTA - used);
  const pct = STORAGE_QUOTA > 0 ? Math.min(100, (used / STORAGE_QUOTA) * 100) : 0;

  const message = [
    `**Storage Overview**`,
    ``,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Used | ${formatBytes(used)} (${pct.toFixed(1)}%) |`,
    `| Available | ${formatBytes(remaining)} |`,
    `| Total Quota | ${formatBytes(STORAGE_QUOTA)} |`,
    ``,
    `| Files | Count |`,
    `|--------|-------|`,
    `| Active | ${active} |`,
    `| Starred | ${starred} |`,
    `| Trashed | ${trashed} |`,
  ].join('\n');

  return { type: 'stats', data: { used, total: STORAGE_QUOTA, active, starred, trashed, pct }, message };
}

function handleHelp(): ActionResult {
  const message = [
    "I'm your Vault AI assistant. Here's what I can do:",
    "",
    "**File Operations**",
    "- `search <query>` — Find files by name",
    "- `delete <filename>` — Move a file to trash",
    "- `restore <filename>` — Restore a trashed file",
    "- `star <filename>` — Star a file",
    "- `unstar <filename>` — Unstar a file",
    '- `rename "old" to "new"` — Rename a file',
    '- `move "file" to "folder"` — Move a file to a folder',
    "- `download <filename>` — Download a file",
    "",
    "**Folder Operations**",
    '- `create folder <name>` — Create a new folder',
    "- `delete folder <name>` — Trash a folder",
    "- `restore folder <name>` — Restore a trashed folder",
    '- `rename folder "old" to "new"` — Rename a folder',
    "- `list folders` — Show all folders",
    "",
    "**Views**",
    "- `recent files` — Show recent uploads",
    "- `starred files` — Show starred files",
    "- `trashed files` — Show trash",
    "- `storage stats` — Show storage usage",
    "",
    "**Tips**",
    "- You can use natural language too! Try \"find my photos\" or \"how much space do I have\"",
    "- Use quotes around filenames with spaces",
  ].join('\n');

  return { type: 'text', message };
}

function handleGreeting(): ActionResult {
  const greetings = [
    "Hey! I'm your Vault assistant. I can help you manage your files — search, organize, star, trash, and more. What would you like to do?",
    "Hello! Need help with your files? I can search, organize, rename, move, and manage them. Just ask!",
    "Hi there! I'm here to help you manage your Vault. Try asking me to find files, check storage, or organize folders.",
  ];
  return { type: 'text', message: greetings[Math.floor(Math.random() * greetings.length)] };
}

function handleThanks(): ActionResult {
  const responses = [
    "You're welcome! Let me know if you need anything else.",
    "Happy to help! Just ask if you need anything.",
    "Anytime! I'm here whenever you need me.",
  ];
  return { type: 'text', message: responses[Math.floor(Math.random() * responses.length)] };
}

function handleAbout(): ActionResult {
  return {
    type: 'text',
    message: "I'm Vault AI, your personal file management assistant. I can help you search, organize, and manage all your files and folders. I understand natural language, so just talk to me like you would a friend!",
  };
}

function handleUnknown(): ActionResult {
  return {
    type: 'text',
    message: "I'm not sure what you mean. Try asking me to search for files, check storage, create folders, or manage your files. Type **help** to see everything I can do.",
    data: {
      suggestions: [
        'Search for files',
        'Show recent uploads',
        'Check storage usage',
        'List my folders',
        'Help',
      ],
    },
  };
}

// ─── Main Handler ───────────────────────────────────────────────────────

export const chat = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Access denied. No token provided.' });
      return;
    }

    const { message } = req.body as { message: string };
    if (!message || !message.trim()) {
      res.status(400).json({ message: 'Message is required' });
      return;
    }

    const parsed = parseIntent(message.trim());
    logger.debug({ userId, intent: parsed.intent, confidence: parsed.confidence }, 'AI intent detected');

    let result: ActionResult;

    switch (parsed.intent) {
      case 'search_files':
        result = await handleSearchFiles(userId, message);
        break;
      case 'trash_file':
        result = await handleTrashFile(userId, message);
        break;
      case 'restore_file':
        result = await handleRestoreFile(userId, message);
        break;
      case 'star_file':
        result = await handleStarFile(userId, message, true);
        break;
      case 'unstar_file':
        result = await handleStarFile(userId, message, false);
        break;
      case 'rename_file':
        result = await handleRenameFile(userId, message);
        break;
      case 'move_file':
        result = await handleMoveFile(userId, message);
        break;
      case 'download_file':
        result = await handleDownloadFile(userId, message);
        break;
      case 'create_folder':
        result = await handleCreateFolder(userId, message);
        break;
      case 'trash_folder':
        result = await handleTrashFolder(userId, message);
        break;
      case 'restore_folder':
        result = await handleRestoreFolder(userId, message);
        break;
      case 'rename_folder':
        result = await handleRenameFolder(userId, message);
        break;
      case 'list_folders':
        result = await handleListFolders(userId);
        break;
      case 'recent_files':
        result = await handleRecentFiles(userId);
        break;
      case 'starred_files':
        result = await handleStarredFiles(userId);
        break;
      case 'trashed_files':
        result = await handleTrashedFiles(userId);
        break;
      case 'storage_stats':
        result = await handleStorageStats(userId);
        break;
      case 'help':
        result = handleHelp();
        break;
      case 'greeting':
        result = handleGreeting();
        break;
      case 'thanks':
        result = handleThanks();
        break;
      case 'about':
        result = handleAbout();
        break;
      case 'clear_chat':
        result = { type: 'text', message: '__CLEAR_CHAT__' };
        break;
      default:
        result = handleUnknown();
        break;
    }

    res.json({
      response: result.message,
      type: result.type,
      data: result.data || null,
      intent: parsed.intent,
      confidence: parsed.confidence,
    });
  } catch (err) {
    logger.error({ err }, 'AI chat error');
    res.status(500).json({ message: 'Internal server error' });
  }
};
