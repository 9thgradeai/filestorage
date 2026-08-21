import Groq from 'groq-sdk';
import { Request, Response } from 'express';
import { pool } from '../config/database';
import { logger } from '../config/logger';
import { FileModel } from '../models/file.model';
import { FolderModel } from '../models/folder.model';

type ChatCompletionTool = Groq.Chat.ChatCompletionTool;
type ChatCompletionMessageParam = Groq.Chat.ChatCompletionMessageParam;
type ChatCompletionToolMessageParam = Groq.Chat.ChatCompletionToolMessageParam;

// ─── Groq Client ──────────────────────────────────────────────────────────

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' });
// gpt-oss-120b: fast (~0.5s) tool-calling with reasoning kept out of content.
// Avoid thinking-mode chat models (e.g. qwen3.6) — they add <think> blocks and 20-50s latency.
const MODEL = process.env.AI_MODEL || 'openai/gpt-oss-120b';

// Defense-in-depth: some thinking models inline <think> blocks in content.
function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

// ─── Conversation History (in-memory per user, capped at 20 messages) ────

const MAX_HISTORY = 20;
const userHistories = new Map<number, { role: 'user' | 'assistant' | 'system'; content: string }[]>();

function getHistory(userId: number) {
  if (!userHistories.has(userId)) userHistories.set(userId, []);
  return userHistories.get(userId)!;
}

function appendMessage(userId: number, role: 'user' | 'assistant', content: string) {
  const history = getHistory(userId);
  history.push({ role, content });
  while (history.length > MAX_HISTORY) history.shift();
}

function clearHistory(userId: number) {
  userHistories.delete(userId);
}

// ─── Types ────────────────────────────────────────────────────────────────

interface ActionResult {
  type: 'files' | 'folders' | 'stats' | 'text' | 'error' | 'actions';
  data?: any;
  message: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

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

// ─── Context Builder ──────────────────────────────────────────────────────

async function buildUserContext(userId: number): Promise<string> {
  try {
    const [statsRes, filesRes, foldersRes] = await Promise.all([
      FileModel.getStats(userId),
      pool.query(
        `SELECT original_filename, file_size, mime_type, starred, trashed_at, is_public
         FROM files WHERE user_id = $1 AND trashed_at IS NULL ORDER BY created_at DESC LIMIT 30`,
        [userId]
      ),
      pool.query(
        `SELECT name, parent_id, trashed_at
         FROM folders WHERE user_id = $1 AND trashed_at IS NULL ORDER BY name`,
        [userId]
      ),
    ]);

    const stats = statsRes;
    const files = filesRes.rows;
    const folders = foldersRes.rows;
    const quota = STORAGE_QUOTA;

    const lines: string[] = [];
    lines.push(`Storage: ${formatBytes(parseInt(stats.used, 10) || 0)} used of ${formatBytes(quota)}, ${stats.active} active files, ${stats.starred} starred, ${stats.trashed} trashed.`);

    if (files.length > 0) {
      lines.push(`Recent files: ${files.map((f: any) => `"${f.original_filename}" (${formatBytes(f.file_size)}, ${f.mime_type || 'unknown'})`).join(', ')}.`);
    }
    if (folders.length > 0) {
      lines.push(`Folders: ${folders.map((f: any) => `"${f.name}"`).join(', ')}.`);
    }

    return lines.join('\n');
  } catch {
    return 'No user context available.';
  }
}

// ─── Groq Function Definitions ────────────────────────────────────────────

const tools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Search for files by name. Returns matching files.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query (filename keyword)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'trash_file',
      description: 'Move a file to trash.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Filename or part of it' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'restore_file',
      description: 'Restore a file from trash.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Filename or part of it' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'star_file',
      description: 'Star (pin/favorite) a file.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Filename or part of it' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'unstar_file',
      description: 'Unstar a file.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Filename or part of it' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rename_file',
      description: 'Rename a file.',
      parameters: {
        type: 'object',
        properties: {
          old_name: { type: 'string', description: 'Current filename' },
          new_name: { type: 'string', description: 'New filename' },
        },
        required: ['old_name', 'new_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'move_file',
      description: 'Move a file to a folder.',
      parameters: {
        type: 'object',
        properties: {
          file_name: { type: 'string', description: 'Filename' },
          folder_name: { type: 'string', description: 'Destination folder name' },
        },
        required: ['file_name', 'folder_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_folder',
      description: 'Create a new folder.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Folder name' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'trash_folder',
      description: 'Move a folder to trash.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Folder name' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'restore_folder',
      description: 'Restore a folder from trash.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Folder name' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rename_folder',
      description: 'Rename a folder.',
      parameters: {
        type: 'object',
        properties: {
          old_name: { type: 'string', description: 'Current folder name' },
          new_name: { type: 'string', description: 'New folder name' },
        },
        required: ['old_name', 'new_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_folders',
      description: 'List all folders.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recent_files',
      description: 'Show the most recently uploaded files.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'starred_files',
      description: 'Show all starred files.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'trashed_files',
      description: 'Show all trashed files.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'storage_stats',
      description: 'Show storage usage statistics.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'clear_chat',
      description: 'Clear the conversation history and start fresh.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

// ─── Function Execution ───────────────────────────────────────────────────

async function executeFunction(userId: number, name: string, args: Record<string, string>): Promise<ActionResult> {
  switch (name) {
    case 'search_files': {
      const { rows: files } = await pool.query(
        `SELECT id, original_filename, file_size, mime_type, starred, trashed_at, is_public, created_at
         FROM files WHERE user_id = $1 AND LOWER(original_filename) LIKE $2
         ORDER BY created_at DESC LIMIT 20`,
        [userId, `%${args.query.toLowerCase()}%`]
      );
      if (files.length === 0) return { type: 'files', data: [], message: `No files found matching "${args.query}".` };
      return { type: 'files', data: buildFileCards(files), message: `Found ${files.length} file${files.length !== 1 ? 's' : ''} matching "${args.query}":` };
    }
    case 'trash_file': {
      const { rows: files } = await pool.query(
        `SELECT id, original_filename FROM files WHERE user_id = $1 AND LOWER(original_filename) LIKE $2 AND trashed_at IS NULL LIMIT 5`,
        [userId, `%${args.name.toLowerCase()}%`]
      );
      if (files.length === 0) return { type: 'text', message: `No active file found matching "${args.name}".` };
      if (files.length > 1) return { type: 'files', data: buildFileCards(files), message: `Found ${files.length} files matching "${args.name}". Which one should I trash?` };
      await FileModel.trashFile(files[0].id, userId);
      return { type: 'text', message: `Moved "${files[0].original_filename}" to trash.` };
    }
    case 'restore_file': {
      const { rows: files } = await pool.query(
        `SELECT id, original_filename FROM files WHERE user_id = $1 AND LOWER(original_filename) LIKE $2 AND trashed_at IS NOT NULL LIMIT 5`,
        [userId, `%${args.name.toLowerCase()}%`]
      );
      if (files.length === 0) return { type: 'text', message: `No trashed file found matching "${args.name}".` };
      if (files.length > 1) return { type: 'files', data: buildFileCards(files), message: `Found ${files.length} trashed files matching "${args.name}". Which one should I restore?` };
      await FileModel.restoreFile(files[0].id, userId);
      return { type: 'text', message: `Restored "${files[0].original_filename}" from trash.` };
    }
    case 'star_file': {
      const { rows: files } = await pool.query(
        `SELECT id, original_filename, starred FROM files WHERE user_id = $1 AND LOWER(original_filename) LIKE $2 AND trashed_at IS NULL LIMIT 5`,
        [userId, `%${args.name.toLowerCase()}%`]
      );
      if (files.length === 0) return { type: 'text', message: `No active file found matching "${args.name}".` };
      if (files.length > 1) return { type: 'files', data: buildFileCards(files), message: `Found ${files.length} files matching "${args.name}". Which one should I star?` };
      await FileModel.setStarred(files[0].id, userId, true);
      return { type: 'text', message: `Starred "${files[0].original_filename}".` };
    }
    case 'unstar_file': {
      const { rows: files } = await pool.query(
        `SELECT id, original_filename, starred FROM files WHERE user_id = $1 AND LOWER(original_filename) LIKE $2 AND trashed_at IS NULL LIMIT 5`,
        [userId, `%${args.name.toLowerCase()}%`]
      );
      if (files.length === 0) return { type: 'text', message: `No active file found matching "${args.name}".` };
      if (files.length > 1) return { type: 'files', data: buildFileCards(files), message: `Found ${files.length} files matching "${args.name}". Which one should I unstar?` };
      await FileModel.setStarred(files[0].id, userId, false);
      return { type: 'text', message: `Unstarred "${files[0].original_filename}".` };
    }
    case 'rename_file': {
      const { rows: files } = await pool.query(
        `SELECT id, original_filename FROM files WHERE user_id = $1 AND LOWER(original_filename) LIKE $2 AND trashed_at IS NULL LIMIT 1`,
        [userId, `%${args.old_name.toLowerCase()}%`]
      );
      if (files.length === 0) return { type: 'text', message: `No file found matching "${args.old_name}".` };
      await FileModel.updateFile(files[0].id, userId, { original_filename: args.new_name });
      return { type: 'text', message: `Renamed "${files[0].original_filename}" to "${args.new_name}".` };
    }
    case 'move_file': {
      const { rows: files } = await pool.query(
        `SELECT id, original_filename FROM files WHERE user_id = $1 AND LOWER(original_filename) LIKE $2 AND trashed_at IS NULL LIMIT 1`,
        [userId, `%${args.file_name.toLowerCase()}%`]
      );
      if (files.length === 0) return { type: 'text', message: `No file found matching "${args.file_name}".` };
      const { rows: folders } = await pool.query(
        `SELECT id, name FROM folders WHERE user_id = $1 AND LOWER(name) LIKE $2 AND trashed_at IS NULL LIMIT 1`,
        [userId, `%${args.folder_name.toLowerCase()}%`]
      );
      if (folders.length === 0) return { type: 'text', message: `No folder found matching "${args.folder_name}".` };
      await FileModel.updateFile(files[0].id, userId, { parent_id: folders[0].id });
      return { type: 'text', message: `Moved "${files[0].original_filename}" to folder "${folders[0].name}".` };
    }
    case 'create_folder': {
      const name = args.name || 'New Folder';
      const { rows: [folder] } = await pool.query(
        `INSERT INTO folders (name, parent_id, user_id) VALUES ($1, NULL, $2) RETURNING *`,
        [name, userId]
      );
      return { type: 'folders', data: buildFolderCards([folder]), message: `Created folder "${folder.name}".` };
    }
    case 'trash_folder': {
      const { rows: folders } = await pool.query(
        `SELECT id, name FROM folders WHERE user_id = $1 AND LOWER(name) LIKE $2 AND trashed_at IS NULL LIMIT 5`,
        [userId, `%${args.name.toLowerCase()}%`]
      );
      if (folders.length === 0) return { type: 'text', message: `No active folder found matching "${args.name}".` };
      if (folders.length > 1) return { type: 'folders', data: buildFolderCards(folders), message: `Found ${folders.length} folders matching "${args.name}". Which one should I trash?` };
      await FolderModel.trashRecursive(folders[0].id, userId);
      return { type: 'text', message: `Moved folder "${folders[0].name}" to trash (including all contents).` };
    }
    case 'restore_folder': {
      const { rows: folders } = await pool.query(
        `SELECT id, name FROM folders WHERE user_id = $1 AND LOWER(name) LIKE $2 AND trashed_at IS NOT NULL LIMIT 5`,
        [userId, `%${args.name.toLowerCase()}%`]
      );
      if (folders.length === 0) return { type: 'text', message: `No trashed folder found matching "${args.name}".` };
      await FolderModel.restoreRecursive(folders[0].id, userId);
      return { type: 'text', message: `Restored folder "${folders[0].name}" from trash.` };
    }
    case 'rename_folder': {
      const { rows: folders } = await pool.query(
        `SELECT id, name FROM folders WHERE user_id = $1 AND LOWER(name) LIKE $2 AND trashed_at IS NULL LIMIT 1`,
        [userId, `%${args.old_name.toLowerCase()}%`]
      );
      if (folders.length === 0) return { type: 'text', message: `No folder found matching "${args.old_name}".` };
      await FolderModel.update(folders[0].id, userId, { name: args.new_name });
      return { type: 'text', message: `Renamed folder "${folders[0].name}" to "${args.new_name}".` };
    }
    case 'list_folders': {
      const folders = await FolderModel.listForUser(userId);
      const active = folders.filter((f) => !f.trashed_at);
      if (active.length === 0) return { type: 'text', message: "You don't have any folders yet." };
      return { type: 'folders', data: buildFolderCards(active), message: `You have ${active.length} folder${active.length !== 1 ? 's' : ''}:` };
    }
    case 'recent_files': {
      const files = await FileModel.findRecentFiles(userId, 15);
      if (files.length === 0) return { type: 'text', message: "You haven't uploaded any files yet." };
      return { type: 'files', data: buildFileCards(files), message: `Here are your ${files.length} most recent files:` };
    }
    case 'starred_files': {
      const { rows: files } = await pool.query(
        `SELECT id, original_filename, file_size, mime_type, starred, trashed_at, is_public, created_at
         FROM files WHERE user_id = $1 AND starred = TRUE AND trashed_at IS NULL
         ORDER BY created_at DESC LIMIT 20`,
        [userId]
      );
      if (files.length === 0) return { type: 'text', message: "You don't have any starred files." };
      return { type: 'files', data: buildFileCards(files), message: `Here are your ${files.length} starred file${files.length !== 1 ? 's' : ''}:` };
    }
    case 'trashed_files': {
      const { rows: files } = await pool.query(
        `SELECT id, original_filename, file_size, mime_type, starred, trashed_at, is_public, created_at
         FROM files WHERE user_id = $1 AND trashed_at IS NOT NULL
         ORDER BY trashed_at DESC LIMIT 20`,
        [userId]
      );
      if (files.length === 0) return { type: 'text', message: 'Your trash is empty.' };
      return { type: 'files', data: buildFileCards(files), message: `You have ${files.length} file${files.length !== 1 ? 's' : ''} in trash:` };
    }
    case 'storage_stats': {
      const stats = await FileModel.getStats(userId);
      const used = parseInt(stats.used, 10) || 0;
      const remaining = Math.max(0, STORAGE_QUOTA - used);
      const pct = STORAGE_QUOTA > 0 ? Math.min(100, (used / STORAGE_QUOTA) * 100) : 0;
      return {
        type: 'stats',
        data: { used, total: STORAGE_QUOTA, active: stats.active, starred: stats.starred, trashed: stats.trashed, pct },
        message: `Storage: ${formatBytes(used)} used (${pct.toFixed(1)}%), ${formatBytes(remaining)} available. ${stats.active} active files, ${stats.starred} starred, ${stats.trashed} trashed.`,
      };
    }
    case 'clear_chat':
      clearHistory(userId);
      return { type: 'text', message: '__CLEAR_CHAT__' };
    default:
      return { type: 'text', message: `Unknown action: ${name}` };
  }
}

// ─── Groq Chat Completion ─────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Vault AI, an intelligent and friendly file management assistant for Vault — a secure file storage app.

You can help users manage their files and folders. You have access to tools that can search, star, trash, restore, rename, move files, manage folders, and check storage.

Guidelines:
- Be concise and conversational. Use 1-3 sentences unless explaining something complex.
- When a user asks to do something, use the appropriate tool. Don't just describe what you could do — actually do it.
- If a user asks about their files/folders/storage, use the relevant tool to get real data.
- You can handle complex requests like "find all my photos and star them" by chaining tool calls.
- If the user says something unclear, ask a clarifying question rather than guessing.
- Never expose internal IDs, database details, or technical implementation details.
- Be warm and helpful. You're a file management expert.`;

async function chatWithGroq(userId: number, userMessage: string): Promise<ActionResult> {
  const userContext = await buildUserContext(userId);
  const history = getHistory(userId);

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: `${SYSTEM_PROMPT}\n\nUser's vault context:\n${userContext}` },
    ...history,
    { role: 'user', content: userMessage },
  ];

  try {
    const response = await groq.chat.completions.create({
      model: MODEL,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.7,
      max_tokens: 2048,
      reasoning_effort: 'low',
    } as any);

    const assistantMessage = response.choices[0]?.message;
    if (!assistantMessage) {
      return { type: 'text', message: "I couldn't generate a response. Please try again." };
    }

    // If the model wants to call functions, execute them
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      const toolResults: ChatCompletionToolMessageParam[] = [];

      for (const toolCall of assistantMessage.tool_calls) {
        const fnName = toolCall.function.name;
        let fnArgs: Record<string, string> = {};
        try {
          fnArgs = JSON.parse(toolCall.function.arguments || '{}');
        } catch {
          // malformed args
        }

        logger.debug({ userId, function: fnName, args: fnArgs }, 'Groq function call');
        const result = await executeFunction(userId, fnName, fnArgs);
        toolResults.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({ result: result.message, type: result.type, data: result.data }),
        });

        // If this was a clear_chat, return early
        if (fnName === 'clear_chat') return result;
      }

      // Send tool results back to Groq for a final response
      const followUp = await groq.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: `${SYSTEM_PROMPT}\n\nUser's vault context:\n${userContext}` },
          ...history,
          { role: 'user', content: userMessage },
          assistantMessage,
          ...toolResults,
        ],
        temperature: 0.7,
        max_tokens: 2048,
        reasoning_effort: 'low',
      } as any);

      const finalContent = stripThinking(followUp.choices[0]?.message?.content || 'Done!');

      // Return the tool results + the LLM's natural language summary
      // The frontend handles displaying file/folder cards from data
      const combinedResult = toolResults.map((tr) => {
        try {
          const contentStr = typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content);
          const parsed = JSON.parse(contentStr);
          return parsed;
        } catch {
          const contentStr = typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content);
          return { result: contentStr, type: 'text' };
        }
      });

      appendMessage(userId, 'user', userMessage);
      appendMessage(userId, 'assistant', finalContent);

      // Return the first tool result's data (for file/folder cards) with the LLM's response
      const primaryResult = combinedResult[0];
      return {
        type: (primaryResult?.type || 'text') as ActionResult['type'],
        data: primaryResult?.data || null,
        message: finalContent,
      };
    }

    // No tool calls — just a conversational response
    const content = stripThinking(assistantMessage.content || '') || "I'm not sure how to help with that. Try asking me to search for files, check storage, or manage folders.";
    appendMessage(userId, 'user', userMessage);
    appendMessage(userId, 'assistant', content);

    return { type: 'text', message: content };
  } catch (err: any) {
    logger.error({ err, userId }, 'Groq API error');

    // Fallback to a friendly error
    if (err?.status === 429) {
      return { type: 'text', message: "I'm getting a lot of requests right now. Please try again in a moment." };
    }
    return { type: 'text', message: "I'm having trouble connecting to my AI backend. Please try again." };
  }
}

// ─── Main Handler ─────────────────────────────────────────────────────────

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

    // If no Groq API key configured, fall back to a basic response
    if (!process.env.GROQ_API_KEY) {
      res.json({
        response: "AI assistant is not configured yet. Please set the GROQ_API_KEY environment variable.",
        type: 'text',
        data: null,
        intent: 'config_missing',
        confidence: 1,
      });
      return;
    }

    const result = await chatWithGroq(userId, message.trim());

    res.json({
      response: result.message,
      type: result.type,
      data: result.data || null,
    });
  } catch (err) {
    logger.error({ err }, 'AI chat error');
    res.status(500).json({ message: 'Internal server error' });
  }
};
