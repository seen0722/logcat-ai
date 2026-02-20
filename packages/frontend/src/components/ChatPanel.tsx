import { useState, useRef, useEffect } from 'react';
import { streamChat } from '../lib/api';

interface Props {
  uploadId: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatPanel({ uploadId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: Message = { role: 'user', content: text };
    const allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setInput('');
    setStreaming(true);

    // Add empty assistant message to stream into
    const assistantMsg: Message = { role: 'assistant', content: '' };
    setMessages([...allMessages, assistantMsg]);

    try {
      for await (const chunk of streamChat(uploadId, allMessages)) {
        assistantMsg.content += chunk.content;
        setMessages([...allMessages, { ...assistantMsg }]);
      }
    } catch {
      assistantMsg.content += '\n\n[Error: connection lost]';
      setMessages([...allMessages, { ...assistantMsg }]);
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="card flex flex-col h-96">
      <h2 className="text-lg font-semibold mb-3">Ask Follow-up Questions</h2>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 mb-3 pr-1">
        {messages.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-8">
            Ask anything about this bugreport analysis...
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`text-sm rounded-lg p-3 ${
              msg.role === 'user'
                ? 'bg-indigo-600/20 text-gray-200 ml-8'
                : 'bg-surface text-gray-300 mr-8'
            }`}
          >
            <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
          </div>
        ))}
        {streaming && (
          <div className="text-xs text-gray-500 animate-pulse">AI is thinking...</div>
        )}
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-border-focus"
          placeholder="e.g. What caused the deadlock?"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          disabled={streaming}
        />
        <button
          onClick={send}
          disabled={!input.trim() || streaming}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}
