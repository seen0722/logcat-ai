import { useState, useRef, useEffect } from 'react';
import { streamChat, ChatSSEEvent } from '../lib/api';

interface Props {
  uploadId: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  /** Tool activity log for this assistant message (agentic chat). */
  toolActivity?: ToolActivity[];
}

interface ToolActivity {
  type: 'call' | 'result';
  name: string;
  detail?: string;
}

/** Human-readable labels for tool names */
const TOOL_LABELS: Record<string, string> = {
  search_logcat: 'Searching logcat',
  get_thread_info: 'Looking up thread info',
  get_kernel_events: 'Checking kernel events',
  get_insight_detail: 'Reading insight details',
  search_section: 'Searching bugreport sections',
};

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
    const assistantMsg: Message = { role: 'assistant', content: '', toolActivity: [] };
    setMessages([...allMessages, assistantMsg]);

    try {
      for await (const event of streamChat(uploadId, allMessages) as AsyncGenerator<ChatSSEEvent>) {
        if (event.type === 'tool_call') {
          // Tool call event
          assistantMsg.toolActivity = [
            ...(assistantMsg.toolActivity ?? []),
            { type: 'call', name: event.name },
          ];
          setMessages([...allMessages, { ...assistantMsg }]);
        } else if (event.type === 'tool_result') {
          // Tool result event
          assistantMsg.toolActivity = [
            ...(assistantMsg.toolActivity ?? []),
            { type: 'result', name: event.name, detail: event.preview },
          ];
          setMessages([...allMessages, { ...assistantMsg }]);
        } else {
          // Regular content chunk
          assistantMsg.content += event.content;
          setMessages([...allMessages, { ...assistantMsg }]);
        }
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
          <div key={i}>
            {/* Tool activity indicators (shown before assistant content) */}
            {msg.role === 'assistant' && msg.toolActivity && msg.toolActivity.length > 0 && (
              <div className="mb-2 ml-1 space-y-1">
                {msg.toolActivity.map((activity, j) => (
                  <div
                    key={j}
                    className="flex items-center gap-1.5 text-xs text-gray-500"
                  >
                    {activity.type === 'call' ? (
                      <>
                        <span className="inline-block w-3 h-3 text-indigo-400">
                          <svg viewBox="0 0 16 16" fill="currentColor">
                            <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85zm-5.598.646a5 5 0 1 1 0-10 5 5 0 0 1 0 10z" />
                          </svg>
                        </span>
                        <span className="text-indigo-400">
                          {TOOL_LABELS[activity.name] ?? activity.name}...
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="inline-block w-3 h-3 text-green-400">
                          <svg viewBox="0 0 16 16" fill="currentColor">
                            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z" />
                          </svg>
                        </span>
                        <span className="text-green-400/80">
                          Found results from {activity.name.replace(/_/g, ' ')}
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Message content */}
            <div
              className={`text-sm rounded-lg p-3 ${
                msg.role === 'user'
                  ? 'bg-indigo-600/20 text-gray-200 ml-8'
                  : 'bg-surface text-gray-300 mr-8'
              }`}
            >
              <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
            </div>
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
