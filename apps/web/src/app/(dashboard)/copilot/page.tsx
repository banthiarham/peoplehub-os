'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Send, Sparkles } from 'lucide-react';
import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { useSession } from 'next-auth/react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function CopilotPage() {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>();
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: suggestions } = useQuery({
    queryKey: ['ai', 'suggestions'],
    queryFn: () => api.get('/ai/suggestions').then((r) => r.data),
  });

  const chat = useMutation({
    mutationFn: (message: string) =>
      api.post('/ai/chat', { message, conversationId }).then((r) => r.data),
    onSuccess: (data) => {
      setConversationId(data.conversationId);
      setMessages((m) => [...m, { role: 'assistant', content: data.reply }]);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    },
    onError: () => {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: 'Something went wrong reaching the copilot. Please try again.' },
      ]);
    },
  });

  function send(text: string) {
    const message = text.trim();
    if (!message || chat.isPending) return;
    setMessages((m) => [...m, { role: 'user', content: message }]);
    setInput('');
    chat.mutate(message);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <PageHeader
        title="PeopleHub Copilot"
        description="Ask about your org — headcount, attendance, leave, payroll compliance and more"
      />
      <Card className="flex flex-1 flex-col overflow-hidden">
        <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-5">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50">
                <Sparkles className="h-6 w-6 text-primary-600" />
              </span>
              <p className="text-sm text-ink-muted">Try one of these to get started</p>
              <div className="flex max-w-lg flex-wrap justify-center gap-2">
                {(suggestions?.suggestions ?? []).map((s: string) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border border-line bg-white px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-primary-300 hover:text-primary-700"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
              {m.role === 'user' ? (
                <Avatar name={session?.user?.name ?? 'You'} size="sm" />
              ) : (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-700">
                  <Sparkles className="h-3.5 w-3.5 text-white" />
                </span>
              )}
              <div
                className={`max-w-[75%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                  m.role === 'user' ? 'bg-primary-700 text-white' : 'bg-canvas'
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {chat.isPending && (
            <div className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-700">
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </span>
              <div className="rounded-2xl bg-canvas px-4 py-2.5 text-sm text-ink-muted">Thinking…</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex gap-2 border-t border-line p-4"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the copilot anything about your org…"
          />
          <Button type="submit" size="icon" disabled={chat.isPending || !input.trim()} aria-label="Send">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </Card>
    </div>
  );
}
