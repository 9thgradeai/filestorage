import { useState, useEffect, useRef } from 'react';
import { api } from '../../lib/api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatModal() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const sendRef = useRef<HTMLTextAreaElement>(null);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setMessages((prev) => [...prev, { role: 'user', content: input }]);
    setInput('');

    try {
      const res = await api.post('/api/ai/chat', { message: input });
      const botReply = res.response || 'No response';
      setMessages((prev) => [...prev, { role: 'assistant', content: botReply }]);
    } catch (err: any) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      sendRef.current?.focus();
    }
  };

  useEffect(() => {
    sendRef.current?.focus();
  }, [open]);

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-zxl z-50 hidden items-center justify-center"
      id="ai-modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div
        className="fixed right-0 top-0 bottom-0 w-80 bg-background border-l border-border shadow-2xl max-h-screen overflow-y-auto"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex flex-col h-full">
          <div className="border-b border-border p-4 flex items-center justify-between">
            <h2 className="font-semibold">AI Assistant</h2>
            <button
              className="p-1 rounded hover:bg-accent"
              onClick={() => setOpen(false)}
              aria-label="Close AI assistant"
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 p-4 overflow-y-auto">
            {messages.map((msg) => (
              <div
                key={msg.content}
                className="p-3 rounded flex items-start"
              >
                <span className="font-medium">{msg.content}</span>
              </div>
            ))}
          </div>
          <form onSubmit={sendMessage} className="p-4 border-t border-border">
            <textarea
              ref={sendRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask me about your files..."
              rows={1}
              className="w-full rounded border p-2 focus:ring-2 focus:ring-primary focus:outline-none"
              aria-label="Message AI assistant"
              required
            ></textarea>
            <button type="submit" className="mt-2 hidden sm:inline-block px-3 py-1 bg-primary text-primary-foreground rounded">
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};