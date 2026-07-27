import React, { useEffect, useRef, useState } from 'react';
import { Send, Bot, User, ThumbsUp, ThumbsDown, Mic, Volume2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  escalated?: boolean;
  confidence?: number;
  feedback?: 1 | -1;
}

const SUGGESTED = [
  'What is the publication fee?',
  'What is my article status?',
  'Any active discount codes?',
  'How does the free 2-page publication work?',
  'How do I download my certificate?',
];

const STORAGE_KEY = 'wwjmrd_support_chat';

export function SupportChat() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [memory, setMemory] = useState<Record<string, unknown>>({});
  const [listening, setListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sessionId = useRef<string>('');

  // Restore conversation (client-safe bootstrap).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setMessages(parsed.messages ?? []);
        setConversationId(parsed.conversationId ?? null);
        setMemory(parsed.memory ?? {});
        sessionId.current = parsed.sessionId ?? crypto.randomUUID();
      } else {
        sessionId.current = crypto.randomUUID();
      }
    } catch {
      sessionId.current = crypto.randomUUID();
    }
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  useEffect(() => {
    if (!sessionId.current) return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ messages, conversationId, memory, sessionId: sessionId.current }),
    );
  }, [messages, conversationId, memory]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || sending) return;

    setMessages((m) => [...m, { id: crypto.randomUUID(), role: 'user', content: question }]);
    setInput('');
    setSending(true);

    try {
      const { data, error } = await supabase.functions.invoke('chatbot-chat', {
        body: {
          message: question,
          conversationId,
          sessionId: sessionId.current,
          memory,
          channel: 'web',
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setConversationId(data.conversationId);
      setMemory(data.memory ?? {});
      setMessages((m) => [
        ...m,
        {
          id: data.messageId ?? crypto.randomUUID(),
          role: 'assistant',
          content: data.reply,
          escalated: data.escalated,
          confidence: data.confidence,
        },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      toast({ title: 'Could not reach support assistant', description: msg, variant: 'destructive' });
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Sorry, I could not reach our support system just now. Please try again in a moment.',
        },
      ]);
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const rate = async (message: ChatMessage, value: 1 | -1) => {
    setMessages((m) => m.map((x) => (x.id === message.id ? { ...x, feedback: value } : x)));
    try {
      await supabase.from('chat_messages').update({ feedback: value }).eq('id', message.id);
      if (conversationId) {
        await supabase.from('chat_conversations').update({ satisfaction: value }).eq('id', conversationId);
      }
    } catch {
      /* feedback is best-effort */
    }
  };

  const speak = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text.replace(/[*_#]/g, '')));
  };

  const startVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast({ title: 'Voice input is not supported in this browser' });
      return;
    }
    const rec = new SR();
    rec.lang = 'en-IN';
    rec.interimResults = false;
    rec.onresult = (e: any) => setInput(e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  };

  const reset = () => {
    setMessages([]);
    setConversationId(null);
    setMemory({});
    sessionId.current = crypto.randomUUID();
  };

  return (
    <div className="flex flex-col h-[60vh] max-h-[520px]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.length === 0 && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-primary-foreground" />
              </div>
              <div className="text-sm text-foreground/90 leading-relaxed">
                Hello! I'm the WWJMRD Publication Support Assistant. Ask me about your article status,
                publication fees, discounts, certificates or the review process.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="text-xs px-3 py-1.5 rounded-full border border-[hsl(var(--glass-border))] hover:bg-[hsl(var(--glass-bg))] transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : ''}`}>
            {m.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-primary-foreground" />
              </div>
            )}
            <div className={m.role === 'user' ? 'max-w-[80%]' : 'max-w-[85%]'}>
              <div
                className={
                  m.role === 'user'
                    ? 'rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-3 py-2 text-sm whitespace-pre-wrap'
                    : 'text-sm text-foreground whitespace-pre-wrap leading-relaxed'
                }
              >
                {m.content}
              </div>
              {m.role === 'assistant' && (
                <div className="flex items-center gap-1 mt-1">
                  <button
                    onClick={() => rate(m, 1)}
                    aria-label="Helpful"
                    className={`p-1 rounded hover:bg-[hsl(var(--glass-bg))] ${m.feedback === 1 ? 'text-primary' : 'text-muted-foreground'}`}
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => rate(m, -1)}
                    aria-label="Not helpful"
                    className={`p-1 rounded hover:bg-[hsl(var(--glass-bg))] ${m.feedback === -1 ? 'text-destructive' : 'text-muted-foreground'}`}
                  >
                    <ThumbsDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => speak(m.content)}
                    aria-label="Read aloud"
                    className="p-1 rounded text-muted-foreground hover:bg-[hsl(var(--glass-bg))]"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                  </button>
                  {m.escalated && (
                    <span className="text-[11px] text-muted-foreground ml-1">Forwarded to support</span>
                  )}
                </div>
              )}
            </div>
            {m.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-[hsl(var(--glass-bg))] flex items-center justify-center shrink-0">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {sending && (
          <div className="flex gap-2 items-center">
            <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-sm text-muted-foreground animate-pulse">Thinking…</span>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-3 space-y-2"
      >
        <Textarea
          ref={inputRef}
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Ask about your article, fees, discounts…"
          className="glass-input resize-none"
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={startVoice} disabled={listening}>
              <Mic className={`w-4 h-4 ${listening ? 'text-primary animate-pulse' : ''}`} />
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={reset} title="New conversation">
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>
          <Button type="submit" size="sm" disabled={sending || !input.trim()} className="gradient-primary">
            <Send className="w-4 h-4 mr-2" />
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}
