import { useState, useRef, KeyboardEvent } from "react";
import { Mail, Send, Loader2, Paperclip, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function parseEmails(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map(e => e.trim())
    .filter(e => e.length > 0);
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
  const inputRef = useRef<HTMLInputElement>(null);

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      const initial = parseEmails(defaultTo).filter(isValidEmail);
      setRecipients(initial);
      setInputValue(defaultTo && !initial.length ? defaultTo : "");
      setSubject(defaultSubject);
      setBody(defaultBody);
    }
    setOpen(isOpen);
  };

  const addRecipient = (raw: string) => {
    const emails = parseEmails(raw).filter(isValidEmail);
    if (emails.length) {
      setRecipients(prev => [...prev, ...emails.filter(e => !prev.includes(e))]);
      setInputValue("");
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (["Enter", "Tab", ",", ";"].includes(e.key)) {
      e.preventDefault();
      if (inputValue.trim()) addRecipient(inputValue);
    } else if (e.key === "Backspace" && !inputValue && recipients.length) {
      setRecipients(prev => prev.slice(0, -1));
    }
  };

  const removeRecipient = (email: string) => {
    setRecipients(prev => prev.filter(e => e !== email));
  };

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
        body: JSON.stringify({
          to: finalRecipients.join(", "),
          subject,
          body,
          pdfBase64,
          filename: pdfFilename,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send email");
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
          <DialogDescription>
            The generated PDF will be automatically attached to this email.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>To</Label>
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
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => { if (inputValue.trim()) addRecipient(inputValue); }}
                placeholder={recipients.length === 0 ? "recipient@example.com, another@example.com" : "Add more..."}
                className="flex-1 min-w-[160px] bg-transparent outline-none text-sm placeholder:text-muted-foreground"
              />
            </div>
            <p className="text-xs text-muted-foreground">Press Enter, Tab, comma or semicolon to add multiple recipients.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email-subject">Subject</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={e => setSubject(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email-body">Message</Label>
            <Textarea
              id="email-body"
              rows={6}
              value={body}
              onChange={e => setBody(e.target.value)}
              className="resize-none"
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground border rounded-md px-3 py-2 bg-muted/30">
            <Paperclip className="h-4 w-4 shrink-0" />
            <span className="truncate">{pdfFilename}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending} className="gap-2">
            {sending ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Sending...</>
            ) : (
              <><Send className="h-4 w-4" />Send Email</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
