import { useEditor, EditorContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Underline } from "@tiptap/extension-underline";
import { TextStyle, FontSize } from "@tiptap/extension-text-style";
import { Bold, Italic, UnderlineIcon, List, ListOrdered } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function cleanWordHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?(o|w|m):[^>]*>/gi, "")
    .replace(/<o:[^>]*>[\s\S]*?<\/o:[^>]*>/gi, "")
    .replace(/<w:[^>]*>[\s\S]*?<\/w:[^>]*>/gi, "")
    .replace(/\s+class="[^"]*Mso[^"]*"/gi, "")
    .replace(/\s+style="[^"]*mso-[^"]*"/gi, "")
    .replace(/<span[^>]*>\s*<\/span>/gi, "");
}

function htmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_m, inner) => {
      let n = 0;
      return inner.replace(/<li[^>]*>/gi, () => `<li data-n="${++n}">`);
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li data-n="(\d+)">/gi, (_, n) => `${n}. `)
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const FONT_SIZES = [
  { label: "Small", value: "11px" },
  { label: "Normal", value: "13px" },
  { label: "Large", value: "16px" },
  { label: "XL", value: "20px" },
];

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Enter description...",
  className,
}: RichTextEditorProps) {
  const isUpdatingRef = useRef(false);
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Underline,
      TextStyle,
      FontSize,
    ],
    content: value || "",
    onUpdate({ editor }) {
      isUpdatingRef.current = true;
      const html = editor.getHTML();
      onChange(html === "<p></p>" ? "" : html);
      isUpdatingRef.current = false;
    },
    editorProps: {
      attributes: {
        class:
          "min-h-[60px] max-h-[200px] overflow-y-auto px-2.5 py-2 text-sm focus:outline-none [&_p]:my-0 [&_ul]:my-1 [&_ol]:my-1 [&_ul]:pl-5 [&_ol]:pl-5 [&_ul]:list-disc [&_ol]:list-decimal [&_li]:my-0",
      },
      transformPastedHTML(html) {
        return cleanWordHtml(html);
      },
      handlePaste(_view, event) {
        const clipboardData = event.clipboardData;
        if (!clipboardData) return false;

        const htmlData = clipboardData.getData("text/html");

        if (htmlData && /<table/i.test(htmlData)) {
          event.preventDefault();
          const parser = new DOMParser();
          const doc = parser.parseFromString(cleanWordHtml(htmlData), "text/html");
          const rows = Array.from(doc.querySelectorAll("tr"));
          if (rows.length > 0) {
            const lines = rows
              .map((row) => {
                const cells = Array.from(row.querySelectorAll("td, th"));
                return cells
                  .map((c) => (c.textContent ?? "").replace(/\s+/g, " ").trim())
                  .filter(Boolean)
                  .join("   ");
              })
              .filter((line) => line.trim());
            const html = lines
              .map((line) => `<p>${escapeHtml(line)}</p>`)
              .join("");
            editorRef.current?.commands.insertContent(html, {
              parseOptions: { preserveWhitespace: true },
            });
            return true;
          }
        }

        if (htmlData) {
          return false;
        }

        const textData = clipboardData.getData("text/plain");
        if (!textData) return false;

        const hasNewlines = textData.includes("\n");
        const hasTabs = textData.includes("\t");
        if (!hasNewlines && !hasTabs) return false;

        event.preventDefault();
        const lines = textData.split("\n");
        const html = lines
          .map((line) => {
            const cols = line.split("\t");
            const joined = cols.length > 1
              ? cols.map((c) => c.trim()).filter(Boolean).join("   ")
              : line;
            return `<p>${escapeHtml(joined) || "<br>"}</p>`;
          })
          .join("");
        editorRef.current?.commands.insertContent(html, {
          parseOptions: { preserveWhitespace: true },
        });
        return true;
      },
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (!editor || isUpdatingRef.current) return;
    const currentHTML = editor.getHTML();
    const normalizedCurrent = currentHTML === "<p></p>" ? "" : currentHTML;
    if (normalizedCurrent !== value) {
      editor.commands.setContent(value || "", false);
    }
  }, [value, editor]);

  if (!editor) return null;

  const currentFontSize = editor.getAttributes("textStyle").fontSize ?? "13px";
  const isEmpty = !editor.getText().trim();

  return (
    <div className={cn("rounded-md border bg-background", className)}>
      <div className="flex flex-wrap items-center gap-0.5 border-b px-1 py-1">
        <Toggle
          size="sm"
          pressed={editor.isActive("bold")}
          onPressedChange={() => editor.chain().focus().toggleBold().run()}
          className="h-6 w-6 p-0 data-[state=on]:bg-muted"
          title="Bold"
        >
          <Bold className="h-3 w-3" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive("italic")}
          onPressedChange={() => editor.chain().focus().toggleItalic().run()}
          className="h-6 w-6 p-0 data-[state=on]:bg-muted"
          title="Italic"
        >
          <Italic className="h-3 w-3" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive("underline")}
          onPressedChange={() => editor.chain().focus().toggleUnderline().run()}
          className="h-6 w-6 p-0 data-[state=on]:bg-muted"
          title="Underline"
        >
          <UnderlineIcon className="h-3 w-3" />
        </Toggle>

        <div className="w-px h-4 bg-border mx-0.5" />

        <Toggle
          size="sm"
          pressed={editor.isActive("bulletList")}
          onPressedChange={() =>
            editor.chain().focus().toggleBulletList().run()
          }
          className="h-6 w-6 p-0 data-[state=on]:bg-muted"
          title="Bullet list"
        >
          <List className="h-3 w-3" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive("orderedList")}
          onPressedChange={() =>
            editor.chain().focus().toggleOrderedList().run()
          }
          className="h-6 w-6 p-0 data-[state=on]:bg-muted"
          title="Numbered list"
        >
          <ListOrdered className="h-3 w-3" />
        </Toggle>

        <div className="w-px h-4 bg-border mx-0.5" />

        <Select
          value={currentFontSize}
          onValueChange={(size) => {
            editor.chain().focus().setFontSize(size).run();
          }}
        >
          <SelectTrigger className="h-6 w-20 text-xs px-1.5 py-0 border-0 bg-transparent hover:bg-muted focus:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONT_SIZES.map((s) => (
              <SelectItem key={s.value} value={s.value} className="text-xs">
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="relative">
        {isEmpty && (
          <div className="absolute top-0 left-0 px-2.5 py-2 text-sm text-muted-foreground/50 pointer-events-none select-none">
            {placeholder}
          </div>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
