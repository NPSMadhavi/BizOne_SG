import { useState } from "react";
import { Mail, Send, Loader2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface EmailSendDialogProps {
  defaultTo?: string;
  defaultSubject: string;
  defaultBody: string;
  pdfFilename: string;
  generatePdf: () => Promise<string>;
}

export function EmailSendDialog({
  defaultTo = "",
  defaultSubject,
  defaultBody,
  pdfFilename,
  generatePdf,
}: EmailSendDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [sending, setSending] = useState(false);

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      setTo(defaultTo);
      setSubject(defaultSubject);
      setBody(defaultBody);
    }
    setOpen(isOpen);
  };

  const handleSend = async () => {
    if (!to.trim()) {
      toast({ title: "Recipient required", description: "Please enter a recipient email address.", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const pdfBase64 = await generatePdf();
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ to, subject, body, pdfBase64, filename: pdfFilename }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to send email");
      }
      toast({ title: "Email sent", description: `Email successfully sent to ${to}.` });
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
        <Button variant="outline" className="gap-2">
          <Mail className="h-4 w-4" />
          Send Email
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Send Document via Email</DialogTitle>
          <DialogDescription>
            The generated PDF will be automatically attached to this email.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="email-to">To</Label>
            <Input
              id="email-to"
              type="email"
              placeholder="recipient@example.com"
              value={to}
              onChange={e => setTo(e.target.value)}
            />
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
              rows={7}
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
