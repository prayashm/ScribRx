import { useState, useRef } from 'preact/hooks';

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: Props) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSubmit() {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  return (
    <div class="flex items-end gap-2 px-3 py-2 bg-white border-t">
      <textarea
        ref={textareaRef}
        class="flex-1 bg-gray-100 rounded-2xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500 resize-none overflow-hidden"
        placeholder="Type a prescription..."
        value={text}
        onInput={(e) => {
          const el = e.target as HTMLTextAreaElement;
          setText(el.value);
          autoResize(el);
        }}
        disabled={disabled}
        rows={1}
        style="max-height: 120px;"
      />
      <button
        onClick={handleSubmit}
        disabled={disabled || !text.trim()}
        class="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center text-white shrink-0 disabled:bg-gray-300"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
      </button>
    </div>
  );
}
