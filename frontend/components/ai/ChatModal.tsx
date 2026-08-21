'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  PaperPlaneRight,
  Sparkle,
  Copy,
  Check,
  ArrowClockwise,
  Star,
  Folder,
  DownloadSimple,
  HardDrives,
  Clock,
  MagnifyingGlass,
} from '@phosphor-icons/react';
import { api } from '../../lib/api';
import { driveApi } from '../../lib/drive';

interface FileCard {
  type: 'file_card';
  id: number;
  name: string;
  size: string;
  sizeBytes: number;
  mime: string | null;
  icon: string;
  starred: boolean;
  trashed: boolean;
  isPublic: boolean;
  createdAt: string;
  relativeTime: string;
}

interface FolderCard {
  type: 'folder_card';
  id: number;
  name: string;
  parentId: number | null;
  trashed: boolean;
  createdAt: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  type?: string;
  data?: (FileCard | FolderCard)[];
  suggestions?: string[];
  timestamp: Date;
  loading?: boolean;
  error?: boolean;
}

function sanitizeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderMarkdown(text: string): string {
  let html = sanitizeText(text)
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="ai-code-block"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');

  html = html.replace(/((?:<li>.*?<\/li>)+)/g, (match) => {
    return '<ul class="ai-list">' + match + '</ul>';
  });

  return '<p>' + html + '</p>';
}

function FileCardItem({ file }: { file: FileCard }) {
  const [actionState, setActionState] = useState<'idle' | 'done'>('idle');

  const handleDownload = async () => {
    try {
      const { blob, filename } = await driveApi.download(file.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch { /* silent */ }
  };

  const handleStar = async () => {
    try {
      await driveApi.starFile(file.id, !file.starred);
      setActionState('done');
      setTimeout(() => setActionState('idle'), 1500);
    } catch { /* silent */ }
  };

  return (
    <div className="ai-file-card">
      <div className="ai-file-icon">{file.icon}</div>
      <div className="ai-file-info">
        <span className="ai-file-name" title={file.name}>{file.name}</span>
        <span className="ai-file-meta">
          {file.size} &middot; {file.relativeTime}
          {file.starred && ' &middot; ⭐'}
          {file.trashed && ' &middot; 🗑️'}
        </span>
      </div>
      <div className="ai-file-actions">
        <button onClick={handleDownload} title="Download" aria-label="Download">
          <DownloadSimple size={14} weight="bold" />
        </button>
        <button onClick={handleStar} title={file.starred ? 'Unstar' : 'Star'} aria-label={file.starred ? 'Unstar' : 'Star'}>
          <Star size={14} weight={file.starred ? 'fill' : 'bold'} />
        </button>
        {actionState === 'done' && <Check size={14} weight="bold" className="ai-action-done" />}
      </div>
    </div>
  );
}

function FolderCardItem({ folder }: { folder: FolderCard }) {
  return (
    <div className="ai-file-card ai-folder-card">
      <div className="ai-file-icon"><Folder size={18} weight="duotone" /></div>
      <div className="ai-file-info">
        <span className="ai-file-name">{folder.name}</span>
        <span className="ai-file-meta">{folder.trashed ? '🗑️ In trash' : '📁 Folder'}</span>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="ai-typing">
      <div className="ai-typing-dot" />
      <div className="ai-typing-dot" />
      <div className="ai-typing-dot" />
    </div>
  );
}

function MessageBubble({ msg, onRetry }: { msg: ChatMessage; onRetry: (content: string) => void }) {
  const [copied, setCopied] = useState(false);
  const isUser = msg.role === 'user';

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const htmlContent = useMemo(() => renderMarkdown(msg.content), [msg.content]);

  return (
    <div className={`ai-message ${isUser ? 'ai-message-user' : 'ai-message-assistant'}`}>
      <div className="ai-avatar">
        {isUser ? (
          <span className="ai-avatar-user">U</span>
        ) : (
          <span className="ai-avatar-ai"><Sparkle size={14} weight="fill" /></span>
        )}
      </div>
      <div className="ai-message-body">
        {msg.loading ? (
          <TypingIndicator />
        ) : (
          <>
            <div className="ai-message-text" dangerouslySetInnerHTML={{ __html: htmlContent }} />

            {msg.data && msg.data.length > 0 && (
              <div className="ai-cards">
                {msg.data.map((item, i) =>
                  item.type === 'file_card' ? (
                    <FileCardItem key={`f-${i}`} file={item as FileCard} />
                  ) : (
                    <FolderCardItem key={`d-${i}`} folder={item as FolderCard} />
                  )
                )}
              </div>
            )}

            {msg.suggestions && msg.suggestions.length > 0 && (
              <div className="ai-suggestions">
                {msg.suggestions.map((s, i) => (
                  <button key={i} className="ai-suggestion-chip" onClick={() => onRetry(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}

            {!isUser && !msg.error && (
              <div className="ai-message-actions">
                <button onClick={handleCopy} title="Copy message" aria-label="Copy message">
                  {copied ? <Check size={13} weight="bold" /> : <Copy size={13} weight="bold" />}
                </button>
                <button onClick={() => onRetry(msg.content)} title="Regenerate" aria-label="Regenerate">
                  <ArrowClockwise size={13} weight="bold" />
                </button>
              </div>
            )}

            {msg.error && (
              <div className="ai-message-actions">
                <button onClick={() => onRetry(msg.content)} title="Retry" aria-label="Retry" className="ai-retry-btn">
                  <ArrowClockwise size={13} weight="bold" /> Retry
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const WELCOME_SUGGESTIONS = [
  { label: 'Search files', icon: <MagnifyingGlass size={14} weight="bold" />, message: 'Search for files' },
  { label: 'Recent uploads', icon: <Clock size={14} weight="bold" />, message: 'Show my recent files' },
  { label: 'Storage stats', icon: <HardDrives size={14} weight="bold" />, message: 'Check my storage usage' },
  { label: 'List folders', icon: <Folder size={14} weight="duotone" />, message: 'List my folders' },
];

export default function ChatModal() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener('ai:toggle', toggle);
    return () => window.removeEventListener('ai:toggle', toggle);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open]);

  const sendMessage = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || sending) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: msg,
      timestamp: new Date(),
    };

    const loadingMsg: ChatMessage = {
      id: `a-${Date.now()}`,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      loading: true,
    };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setInput('');
    setSending(true);

    try {
      const res = await api.post<{ response: string; type: string; data?: any; intent?: string; confidence?: number }>(
        '/api/ai/chat',
        { message: msg }
      );

      setMessages((prev) =>
        prev.map((m) =>
          m.id === loadingMsg.id
            ? {
                ...m,
                loading: false,
                content: res.response || 'No response',
                type: res.type,
                data: res.data?.suggestions ? undefined : res.data,
                suggestions: res.data?.suggestions,
              }
            : m
        )
      );
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === loadingMsg.id
            ? { ...m, loading: false, content: err.message || 'Failed to get response', error: true }
            : m
        )
      );
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleRetry = (content: string) => {
    if (sending) return;
    // Remove the last assistant message if retrying
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === 'assistant') return prev.slice(0, -1);
      return prev;
    });
    setInput(content);
    setTimeout(() => sendMessage(content), 50);
  };

  const handleClearChat = () => {
    setMessages([]);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };

  return (
    <>
      {open && <div className="ai-backdrop" onClick={() => setOpen(false)} />}

      <div
        ref={panelRef}
        className={`ai-panel ${open ? 'ai-panel-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="AI Assistant"
      >
        {/* Header */}
        <div className="ai-header">
          <div className="ai-header-left">
            <span className="ai-header-icon"><Sparkle size={18} weight="fill" /></span>
            <span className="ai-header-title">Vault AI</span>
          </div>
          <div className="ai-header-actions">
            {messages.length > 0 && (
              <button className="ai-header-btn" onClick={handleClearChat} title="New chat" aria-label="New chat">
                <span className="ai-new-chat-text">New chat</span>
              </button>
            )}
            <button className="ai-header-btn" onClick={() => setOpen(false)} aria-label="Close">
              <X size={18} weight="bold" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="ai-messages">
          {messages.length === 0 ? (
            <div className="ai-welcome">
              <div className="ai-welcome-icon">
                <Sparkle size={32} weight="fill" />
              </div>
              <h3 className="ai-welcome-title">Vault AI Assistant</h3>
              <p className="ai-welcome-sub">
                Search, organize, and manage your files with natural language.
              </p>
              <div className="ai-welcome-grid">
                {WELCOME_SUGGESTIONS.map((s, i) => (
                  <button key={i} className="ai-welcome-card" onClick={() => sendMessage(s.message)}>
                    <span className="ai-welcome-card-icon">{s.icon}</span>
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>
              <div className="ai-welcome-examples">
                <p className="ai-welcome-examples-title">Try asking:</p>
                <div className="ai-welcome-chips">
                  {[
                    'Find my photos',
                    'How much storage do I have?',
                    'Show starred files',
                    'Create folder Projects',
                    'What\'s in my trash?',
                    'Rename file report.pdf to final-report.pdf',
                  ].map((q, i) => (
                    <button key={i} className="ai-suggestion-chip" onClick={() => sendMessage(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} onRetry={handleRetry} />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="ai-input-area">
          <form
            className="ai-input-form"
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything about your files..."
              rows={1}
              className="ai-input"
              disabled={sending}
              aria-label="Message AI assistant"
            />
            <button
              type="submit"
              className="ai-send-btn"
              disabled={!input.trim() || sending}
              aria-label="Send message"
            >
              <PaperPlaneRight size={16} weight="fill" />
            </button>
          </form>
          <p className="ai-disclaimer">Vault AI can make mistakes. Check important actions.</p>
        </div>
      </div>
    </>
  );
}
