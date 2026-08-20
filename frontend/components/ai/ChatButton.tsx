export default function ChatButton() {
  return (
    <button
      className="fixed bottom-6 right-6 flex items-center justify-center p-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-110 transition-transform"
      aria-label="AI Assistant"
      onClick={() => window.dispatchEvent(new Event('ai:toggle'))}
    >
      <svg
        width={20}
        height={20}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>
  );
};