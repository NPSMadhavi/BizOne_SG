import { useState, useRef, KeyboardEvent, useEffect, useCallback } from "react";
import { Mail, Send, Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface EmailSendDialogProps {
  defaultTo?: string;
  defaultSubject: string;
  defaultBody: string;
  pdfFilename: string;
  generatePdf: () => Promise<string>;
  triggerSize?: "default" | "sm" | "lg" | "icon";
  triggerLabel?: string;
}

interface EmailContact {
  id: number;
  email: string;
  name: string | null;
  useCount: number;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function parseEmails(raw: string): string[] {
  return raw.split(/[,;\s]+/).map(e => e.trim()).filter(e => e.length > 0);
}

async function fetchSuggestions(q: string): Promise<EmailContact[]> {
  try {
    const res = await fetch(`/api/email-contacts?q=${encodeURIComponent(q)}`, { credentials: "include" });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

async function trackEmails(emails: string[]) {
  try {
    await fetch("/api/email-contacts/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ emails }),
    });
  } catch { }
}

export function EmailSendDialog({
  defaultTo = "",
  defaultSubject,
  defaultBody,
  pdfFilename,
  generatePdf,
  triggerSize = "default",
  triggerLabel,
}: EmailSendDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [sending, setSending] = useState(false);
  const [suggestions, setSuggestions] = useState<EmailContact[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      const initial = parseEmails(defaultTo).filter(isValidEmail);
      setRecipients(initial);
      setInputValue(defaultTo && !initial.length ? defaultTo : "");
      setSubject(defaultSubject);
      setBody(defaultBody);
      setSuggestions([]);
      setShowSuggestions(false);
      setActiveSuggestion(-1);
    }
    setOpen(isOpen);
  };

  const addRecipient = useCallback((raw: string) => {
    const emails = parseEmails(raw).filter(isValidEmail);
    if (emails.length) {
      setRecipients(prev => [...prev, ...emails.filter(e => !prev.includes(e))]);
      setInputValue("");
      setSuggestions([]);
      setShowSuggestions(false);
      setActiveSuggestion(-1);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setInputValue(value);
    setActiveSuggestion(-1);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length >= 1) {
      debounceRef.current = setTimeout(async () => {
        const results = await fetchSuggestions(value.trim());
        const filtered = results.filter(r => !recipients.includes(r.email));
        setSuggestions(filtered);
        setShowSuggestions(filtered.length > 0);
      }, 200);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (contact: EmailContact) => {
    setRecipients(prev => prev.includes(contact.email) ? prev : [...prev, contact.email]);
    setInputValue("");
    setSuggestions([]);
    setShowSuggestions(false);
    setActiveSuggestion(-1);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveSuggestion(i => Math.min(i + 1, suggestions.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setActiveSuggestion(i => Math.max(i - 1, -1)); return; }
      if (e.key === "Escape") { setShowSuggestions(false); setActiveSuggestion(-1); return; }
      if ((e.key === "Enter" || e.key === "Tab") && activeSuggestion >= 0) {
        e.preventDefault();
        selectSuggestion(suggestions[activeSuggestion]);
        return;
      }
    }
    if (["Enter", "Tab", ",", ";"].includes(e.key)) {
      e.preventDefault();
      if (inputValue.trim()) addRecipient(inputValue);
    } else if (e.key === "Backspace" && !inputValue && recipients.length) {
      setRecipients(prev => prev.slice(0, -1));
    }
  };

  const removeRecipient = (email: string) => setRecipients(prev => prev.filter(e => e !== email));

  const handleSend = async () => {
    const finalRecipients = [...recipients];
    if (inputValue.trim()) {
      parseEmails(inputValue).filter(isValidEmail).forEach(e => {
        if (!finalRecipients.includes(e)) finalRecipients.push(e);
      });
    }
    if (finalRecipients.length === 0) {
      toast({ title: "Recipient required", description: "Please enter at least one recipient email address.", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      const pdfBase64 = await generatePdf();
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ to: finalRecipients.join(", "), subject, body, pdfBase64, filename: pdfFilename }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send email");
      await trackEmails(finalRecipients);
      toast({ title: "Email sent", description: `Email sent to ${finalRecipients.join(", ")}.` });
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Failed to send", description: err.message || "Email could not be sent.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size={triggerSize as any} className="gap-2">
          <Mail className="h-4 w-4" />
          {triggerLabel ?? (triggerSize === "sm" ? "Email" : "Send Email")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>Send Document via Email</DialogTitle>
          <DialogDescription>The generated PDF will be automatically attached to this email.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>To</Label>
            <div className="relative">
              <div
                className="flex flex-wrap gap-1.5 min-h-[42px] rounded-md border border-input bg-background px-3 py-2 cursor-text focus-within:ring-1 focus-within:ring-ring"
                onClick={() => inputRef.current?.focus()}
              >
                {recipients.map(email => (
                  <Badge key={email} variant="secondary" className="flex items-center gap-1 text-xs font-normal pr-1">
                    {email}
                    <button type="button" onClick={(e) => { e.stopPropagation(); removeRecipient(email); }} className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <input
                  ref={inputRef}
                  value={inputValue}
                  onChange={e => handleInputChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={() => {
                    setTimeout(() => {
                      setShowSuggestions(false);
                      if (inputValue.trim() && !showSuggestions) addRecipient(inputValue);
                    }, 150);
                  }}
                  placeholder={recipients.length === 0 ? "recipient@example.com" : "Add more..."}
                  className="flex-1 min-w-[160px] bg-transparent outline-none text-sm placeholder:text-muted-foreground"
                  autoComplete="off"
                />
              </div>
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-md max-h-48 overflow-y-auto">
                  {suggestions.map((contact, idx) => (
                    <button
                      key={contact.id}
                      type="button"
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex flex-col ${idx === activeSuggestion ? "bg-accent" : ""}`}
                      onMouseDown={(e) => { e.preventDefault(); selectSuggestion(contact); }}
                    >
                      {contact.name && <span className="font-medium">{contact.name}</span>}
                      <span className={contact.name ? "text-muted-foreground text-xs" : ""}>{contact.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Press Enter, Tab, comma or semicolon to add multiple recipients.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email-subject">Subject</Label>
            <Input id="email-subject" value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email-body">Message</Label>
            <Textarea id="email-body" rows={6} value={body} onChange={e => setBody(e.target.value)} className="resize-none" />
            <div className="border-t border-dashed pt-2 mt-1 text-xs text-muted-foreground italic">
              Sent from <span className="font-semibold not-italic text-foreground/60">bizOneSG</span> – Smarter Accounting. Better Business.
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground border rounded-md px-3 py-2 bg-muted/30">
            <Paperclip className="h-4 w-4 shrink-0" />
            <span className="truncate">{pdfFilename}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending} className="gap-2">
            {sending ? <><Loader2 className="h-4 w-4 animate-spin" />Sending...</> : <><Send className="h-4 w-4" />Send Email</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
