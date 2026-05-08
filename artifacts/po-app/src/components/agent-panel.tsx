import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, X, Send, Mic, MicOff, Volume2, Loader2, Sparkles, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: string[];
  invoiceId?: number;
  invNumber?: string;
}

const TOOL_LABELS: Record<string, string> = {
  searchCustomers: "Searching customers",
  searchQuotations: "Searching quotations",
  getQuotation: "Fetching quotation details",
  searchStockItems: "Searching stock items",
  getCompanySettings: "Getting company settings",
  createInvoice: "Creating invoice",
};

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function streamAgentChat(
  messages: { role: string; content: string }[],
  onText: (chunk: string) => void,
  onToolCall: (name: string) => void,
  signal: AbortSignal,
): Promise<{ invoiceId?: number; invNumber?: string }> {
  const response = await fetch(`${BASE}/api/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || "Agent request failed");
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let invoiceId: number | undefined;
  let invNumber: string | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const evt = JSON.parse(line.slice(6));
        if (evt.type === "text" && evt.content) onText(evt.content);
        if (evt.type === "tool_call" && evt.name) onToolCall(evt.name);
        if (evt.type === "error") throw new Error(evt.message);
        if (evt.type === "done") {
          // Check if last tool_call was createInvoice
        }
      } catch {}
    }
  }

  return { invoiceId, invNumber };
}

async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const arrayBuffer = await audioBlob.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
  const res = await fetch(`${BASE}/api/agent/transcribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ audio: base64 }),
  });
  if (!res.ok) throw new Error("Transcription failed");
  const data = await res.json();
  return data.text;
}

async function speakText(text: string): Promise<void> {
  const res = await fetch(`${BASE}/api/agent/speak`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ text }),
  });
  if (!res.ok) return;
  const data = await res.json();
  const audio = new Audio(`data:audio/mp3;base64,${data.audio}`);
  audio.play().catch(() => {});
}

function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
    const mr = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];
    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    mr.start(250);
    mrRef.current = mr;
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback((): Promise<Blob> => {
    return new Promise((resolve) => {
      const mr = mrRef.current;
      if (!mr) return resolve(new Blob());
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType });
        mr.stream.getTracks().forEach((t) => t.stop());
        mrRef.current = null;
        setIsRecording(false);
        resolve(blob);
      };
      mr.stop();
    });
  }, []);

  return { isRecording, startRecording, stopRecording };
}

const WELCOME: Message = {
  id: "welcome",
  role: "assistant",
  content: "Hi! I'm Aria, your invoice assistant. I can help you:\n\n• Create an invoice from a quotation\n• Build a standalone invoice with custom items\n• Look up customers, quotations, or products\n\nJust tell me what you need, or press the mic and talk to me!",
};

export function AgentPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { isRecording, startRecording, stopRecording } = useVoiceRecorder();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const chatHistory = messages
    .filter((m) => m.id !== "welcome" && m.content)
    .map((m) => ({ role: m.role, content: m.content }));

  const sendMessage = useCallback(
    async (userText: string) => {
      if (!userText.trim() || isThinking) return;

      const userMsg: Message = {
        id: Date.now().toString(),
        role: "user",
        content: userText.trim(),
      };

      const assistantId = `asst-${Date.now()}`;
      const assistantMsg: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        toolCalls: [],
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setInput("");
      setIsThinking(true);

      const history = [
        ...chatHistory,
        { role: "user", content: userText.trim() },
      ];

      abortRef.current = new AbortController();
      let fullResponse = "";
      let createdInvoiceId: number | undefined;
      let createdInvNumber: string | undefined;

      try {
        await streamAgentChat(
          history,
          (chunk) => {
            fullResponse += chunk;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: fullResponse } : m,
              ),
            );
          },
          (toolName) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, toolCalls: [...(m.toolCalls ?? []), toolName] }
                  : m,
              ),
            );
            // Check if invoice was created via content after tool call
            if (toolName === "createInvoice") {
              // ID will be parsed from response text
            }
          },
          abortRef.current.signal,
        );

        // Parse invoice info from response if createInvoice was called
        const invMatch = fullResponse.match(/INV-\d+/);
        if (invMatch) {
          createdInvNumber = invMatch[0];
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, invNumber: createdInvNumber } : m,
            ),
          );
        }

        if (autoSpeak && fullResponse) {
          const shortText = fullResponse.slice(0, 500);
          speakText(shortText).catch(() => {});
        }
      } catch (e: any) {
        if (e.name !== "AbortError") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: "Sorry, something went wrong. Please try again." }
                : m,
            ),
          );
        }
      } finally {
        setIsThinking(false);
        abortRef.current = null;
      }
    },
    [isThinking, chatHistory, autoSpeak],
  );

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleMic = async () => {
    if (transcribing) return;
    if (isRecording) {
      const blob = await stopRecording();
      if (blob.size < 1000) return;
      setTranscribing(true);
      try {
        const text = await transcribeAudio(blob);
        if (text.trim()) {
          await sendMessage(text);
        }
      } catch {
      } finally {
        setTranscribing(false);
      }
    } else {
      await startRecording();
    }
  };

  const handleReplay = (text: string) => {
    speakText(text.slice(0, 500)).catch(() => {});
  };

  const clearChat = () => {
    setMessages([WELCOME]);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-primary text-primary-foreground rounded-full px-4 py-3 shadow-lg hover:bg-primary/90 transition-all hover:scale-105 active:scale-95"
        title="Open Aria - Invoice Assistant"
      >
        <Sparkles className="h-4 w-4" />
        <span className="text-sm font-medium">Aria</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col w-[380px] h-[560px] rounded-2xl shadow-2xl border bg-background overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b bg-primary text-primary-foreground shrink-0">
        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary-foreground/20">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold leading-none">Aria</p>
          <p className="text-xs opacity-70 mt-0.5">Invoice Assistant</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setAutoSpeak((v) => !v)}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              autoSpeak
                ? "bg-primary-foreground/25 text-primary-foreground"
                : "text-primary-foreground/50 hover:text-primary-foreground hover:bg-primary-foreground/10",
            )}
            title={autoSpeak ? "Auto-speak on" : "Auto-speak off"}
          >
            <Volume2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-md text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
        {messages.map((msg) => (
          <div key={msg.id} className={cn("flex flex-col gap-1", msg.role === "user" ? "items-end" : "items-start")}>
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <div className="flex flex-wrap gap-1 max-w-[85%]">
                {msg.toolCalls.map((tc, i) => (
                  <span
                    key={i}
                    className="text-xs bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 flex items-center gap-1"
                  >
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    {TOOL_LABELS[tc] ?? tc}
                  </span>
                ))}
              </div>
            )}

            {(msg.content || msg.id === "welcome") && (
              <div
                className={cn(
                  "max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-muted text-foreground rounded-bl-sm",
                )}
              >
                {msg.content}
                {msg.invNumber && (
                  <button
                    onClick={() => {
                      navigate("/invoices");
                      setOpen(false);
                    }}
                    className="mt-2 flex items-center gap-1.5 text-xs underline underline-offset-2 opacity-80 hover:opacity-100"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open Invoices
                  </button>
                )}
              </div>
            )}

            {msg.role === "assistant" && msg.content && msg.id !== "welcome" && (
              <button
                onClick={() => handleReplay(msg.content)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                <Volume2 className="h-3 w-3" />
                Replay
              </button>
            )}
          </div>
        ))}

        {isThinking && messages[messages.length - 1]?.content === "" && (
          <div className="flex items-start">
            <div className="bg-muted rounded-2xl rounded-bl-sm px-3.5 py-2.5">
              <div className="flex gap-1 items-center">
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t px-3 py-3 shrink-0 bg-background">
        <div className="flex items-end gap-2">
          <button
            onClick={handleMic}
            disabled={transcribing || isThinking}
            className={cn(
              "shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all",
              isRecording
                ? "bg-red-500 text-white animate-pulse"
                : transcribing
                  ? "bg-muted text-muted-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
            )}
            title={isRecording ? "Stop recording" : transcribing ? "Transcribing..." : "Record voice"}
          >
            {transcribing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isRecording ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </button>

          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            disabled={isThinking || isRecording}
            className="flex-1 resize-none rounded-xl border bg-muted/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 min-h-[36px] max-h-[120px] overflow-y-auto"
            style={{ height: "auto" }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
            }}
          />

          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isThinking || isRecording}
            className="shrink-0 w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center justify-between mt-2 px-1">
          <p className="text-xs text-muted-foreground">
            {isRecording ? "🔴 Listening... tap mic to stop" : "Enter to send · Shift+Enter for newline"}
          </p>
          {messages.length > 1 && (
            <button onClick={clearChat} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
