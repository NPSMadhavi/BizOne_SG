import { useState, useRef, KeyboardEvent, useCallback, useEffect } from "react";
import { Mail, Send, Loader2, Paperclip, X, Sparkles, Plus } from "lucide-react";
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

export interface EmailDocInfo {
  docType: string;
  docNumber: string;
  customerName: string;
  companyName: string;
  items: { description: string }[];
  currency: string;
  totalAmount: number;
}

export interface EmailPdfAttachment {
  filename: string;
  content: string;
}

interface EmailSendDialogProps {
  defaultTo?: string;
  defaultSubject: string;
  defaultBody: string;
  pdfFilename?: string;
  generatePdf?: () => Promise<string>;
  /** When set, all generated PDFs are attached (first is the required PDF, rest are extras). */
  generateAttachments?: () => Promise<EmailPdfAttachment[]>;
  /** Labels shown in the attachments list. Falls back to pdfFilename. */
  pdfFilenames?: string[];
  triggerSize?: "default" | "sm" | "lg" | "icon";
  triggerLabel?: string;
  onSuccess?: (recipients: string[]) => void;
  poId?: number;
  docInfo?: EmailDocInfo;
  /** Controlled dialog (no trigger button). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
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

function base64ToBlob(base64: string, contentType: string) {
  const clean = base64.includes(",") ? base64.split(",")[1] : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: contentType || "application/octet-stream" });
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

function fallbackDocInfo(defaultSubject: string, filenames: string[]): EmailDocInfo {
  const [left = "Document", company = "Company"] = defaultSubject.split("|").map(s => s.trim());
  const forMatch = left.match(/^(.*?)\s+for\s+(.+)$/i);
  const docType = (forMatch?.[1] || left.split(/\s+/)[0] || "Document").trim();
  const customerName = (forMatch?.[2] || "Customer").replace(/\s*\(\d+\)\s*$/, "").trim() || "Customer";
  const numbers = filenames.map(n => n.replace(/\.pdf$/i, "")).filter(Boolean);
  return {
    docType,
    docNumber: numbers.join(", ") || left,
    customerName,
    companyName: company || "Company",
    items: numbers.map(n => ({ description: n })),
    currency: "SGD",
    totalAmount: 0,
  };
}

export function EmailSendDialog({
  defaultTo = "",
  defaultSubject,
  defaultBody,
  pdfFilename,
  generatePdf,
  generateAttachments,
  pdfFilenames,
  triggerSize = "default",
  triggerLabel,
  onSuccess,
  poId,
  docInfo,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: EmailSendDialogProps) {
  const { toast } = useToast();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const autoFilenames = pdfFilenames?.length ? pdfFilenames : (pdfFilename ? [pdfFilename] : []);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [sending, setSending] = useState(false);
  const [sendingLabel, setSendingLabel] = useState("Sending…");
  const [generating, setGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<EmailContact[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [extraFiles, setExtraFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleOpen = (isOpen: boolean) => {
    if (sending && !isOpen) return;
    if (isOpen) {
      const initial = parseEmails(defaultTo).filter(isValidEmail);
      setRecipients(initial);
      setInputValue(defaultTo && !initial.length ? defaultTo : "");
      setSubject(defaultSubject);
      setBody(defaultBody);
      setSuggestions([]);
      setShowSuggestions(false);
      setActiveSuggestion(-1);
      setExtraFiles([]);
    }
    setOpen(isOpen);
  };

  // Controlled open (no trigger) does not fire onOpenChange — apply the latest To/subject/body when it opens.
  useEffect(() => {
    if (!open) return;
    const initial = parseEmails(defaultTo).filter(isValidEmail);
    setRecipients(initial);
    setInputValue(defaultTo && !initial.length ? defaultTo : "");
    setSubject(defaultSubject);
    setBody(defaultBody);
    setSuggestions([]);
    setShowSuggestions(false);
    setActiveSuggestion(-1);
    setExtraFiles([]);
    // Intentionally only when `open` becomes true, so typing is not overwritten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleFilesPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    if (!picked.length) return;
    setExtraFiles(prev => {
      const existing = new Set(prev.map(f => f.name + f.size));
      return [...prev, ...picked.filter(f => !existing.has(f.name + f.size))];
    });
    e.target.value = "";
  };

  const removeExtraFile = (idx: number) =>
    setExtraFiles(prev => prev.filter((_, i) => i !== idx));

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

  const handleGenerateAI = async () => {
    const payload = docInfo ?? fallbackDocInfo(defaultSubject, autoFilenames);
    setGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Generation failed");
      }
      const data = await res.json();
      if (data.subject) setSubject(data.subject);
      if (data.body) setBody(data.body);
      toast({ title: "Email generated", description: "Subject and message generated by AI. Feel free to edit." });
    } catch (err: any) {
      toast({ title: "AI generation failed", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
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
    setSendingLabel(generateAttachments ? "Generating PDFs…" : "Sending…");
    try {
      let pdfBase64 = "";
      let filename = pdfFilename || "document.pdf";
      const generatedExtras: { filename: string; content: string; contentType: string }[] = [];

      if (generateAttachments) {
        const atts = await generateAttachments();
        if (!atts.length) throw new Error("No PDFs could be generated.");
        pdfBase64 = atts[0].content;
        filename = atts[0].filename;
        for (const att of atts.slice(1)) {
          generatedExtras.push({ filename: att.filename, content: att.content, contentType: "application/pdf" });
        }
      } else if (generatePdf) {
        pdfBase64 = await generatePdf();
      } else {
        throw new Error("No PDF generator provided.");
      }

      setSendingLabel("Sending email…");

      const form = new FormData();
      form.append("to", finalRecipients.join(", "));
      form.append("subject", subject);
      form.append("body", body);
      form.append("filename", filename);
      if (poId) form.append("poId", String(poId));
      form.append("pdf", base64ToBlob(pdfBase64, "application/pdf"), filename);
      for (const att of generatedExtras) {
        form.append("attachments", base64ToBlob(att.content, att.contentType || "application/pdf"), att.filename);
      }
      for (const file of extraFiles) {
        form.append("attachments", file, file.name);
      }

      const res = await fetch("/api/send-email", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) throw new Error(data.error || `Failed to send email (${res.status})`);
      await trackEmails(finalRecipients);
      toast({ title: "Email sent", description: `Email sent to ${finalRecipients.join(", ")}.` });
      await onSuccess?.(finalRecipients);
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Failed to send", description: err.message || "Email could not be sent.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button variant="outline" size={triggerSize as any} className="gap-2">
            <Mail className="h-4 w-4" />
            {triggerLabel ?? (triggerSize === "sm" ? "Email" : "Send Email")}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent
        className="w-[calc(100vw-2rem)] max-w-3xl sm:max-w-3xl max-h-[min(90vh,820px)] flex flex-col gap-3 overflow-hidden p-5 sm:p-6"
        onPointerDownOutside={e => { if (sending) e.preventDefault(); }}
        onEscapeKeyDown={e => { if (sending) e.preventDefault(); }}
      >
        <DialogHeader className="shrink-0 pr-6">
          <DialogTitle>Send Document via Email</DialogTitle>
          <DialogDescription>
            {autoFilenames.length > 1
              ? `${autoFilenames.length} generated PDFs will be attached to this email.`
              : "The generated PDF will be automatically attached to this email."}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto space-y-4 py-1 pr-1">
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
            <div className="flex items-center justify-between">
              <Label htmlFor="email-subject">Subject</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs text-primary hover:text-primary/80"
                onClick={handleGenerateAI}
                disabled={generating || sending}
              >
                {generating ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" />Generating…</>
                ) : (
                  <><Sparkles className="h-3.5 w-3.5" />Generate with AI</>
                )}
              </Button>
            </div>
            <Input id="email-subject" value={subject} onChange={e => setSubject(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email-body">Message</Label>
            <Textarea id="email-body" rows={6} value={body} onChange={e => setBody(e.target.value)} className="resize-y min-h-[120px] max-h-[220px] font-mono text-sm" />
            <p className="text-xs text-muted-foreground">Plain text email — sent without HTML formatting.</p>
          </div>

          {/* Attachments */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Attachments</Label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add file
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFilesPick}
              />
            </div>
            <div className="space-y-1 max-h-44 overflow-y-auto">
              {/* Auto-attached PDFs */}
              {autoFilenames.map((name) => (
                <div key={name} className="flex items-center gap-2 text-sm text-muted-foreground border rounded-md px-3 py-2 bg-muted/30">
                  <Paperclip className="h-4 w-4 shrink-0" />
                  <span className="truncate flex-1">{name}</span>
                  <span className="text-xs shrink-0">auto</span>
                </div>
              ))}
              {/* Extra attachments */}
              {extraFiles.map((file, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm border rounded-md px-3 py-2 bg-background">
                  <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate flex-1">{file.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {file.size < 1024 * 1024
                      ? `${(file.size / 1024).toFixed(0)} KB`
                      : `${(file.size / 1024 / 1024).toFixed(1)} MB`}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeExtraFile(idx)}
                    className="ml-1 rounded-full hover:bg-muted p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="shrink-0 flex-col sm:flex-col items-stretch gap-2 pt-2 border-t">
          {sending && (
            <p className="text-xs text-muted-foreground text-center">
              {autoFilenames.length > 1
                ? `Sending ${autoFilenames.length} PDFs via Gmail. Please wait — this can take about a minute.`
                : "Please wait while the email is sent."}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>Cancel</Button>
            <Button onClick={handleSend} disabled={sending || generating} className="gap-2">
              {sending ? <><Loader2 className="h-4 w-4 animate-spin" />{sendingLabel}</> : <><Send className="h-4 w-4" />Send Email</>}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
