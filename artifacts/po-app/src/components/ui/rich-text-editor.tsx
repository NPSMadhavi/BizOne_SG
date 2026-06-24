import { useEditor, EditorContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Underline } from "@tiptap/extension-underline";
import { TextStyle, FontSize } from "@tiptap/extension-text-style";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import { Image } from "@tiptap/extension-image";
import { Bold, Italic, UnderlineIcon, List, ListOrdered, Maximize2, Minimize2 } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
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

function buildTableHtml(rows: string[][]): string {
  const trs = rows
    .map((cells) => `<tr>${cells.map((c) => `<td><p>${escapeHtml(c)}</p></td>`).join("")}</tr>`)
    .join("");
  return `<table><tbody>${trs}</tbody></table>`;
}

const FONT_SIZES = [
  { label: "Small", value: "11px" },
  { label: "Normal", value: "13px" },
  { label: "Large", value: "16px" },
  { label: "XL", value: "20px" },
];

const EDITOR_CONTENT_CLASSES = [
  "[&_p]:my-0",
  "[&_ul]:my-1 [&_ul]:pl-5 [&_ul]:list-disc",
  "[&_ol]:my-1 [&_ol]:pl-5 [&_ol]:list-decimal",
  "[&_li]:my-0",
  "[&_table]:border-collapse [&_table]:my-1 [&_table]:w-full",
  "[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_td]:align-top [&_td_p]:my-0",
  "[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:bg-muted [&_th]:font-semibold [&_th_p]:my-0",
  "[&_img]:max-w-full [&_img]:max-h-48 [&_img]:rounded [&_img]:my-1",
].join(" ");

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  expandable?: boolean;
  tall?: boolean;
}

function EditorCore({
  value,
  onChange,
  placeholder = "Enter description...",
  className,
  expandable = true,
  tall = false,
}: RichTextEditorProps) {
  const isUpdatingRef = useRef(false);
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  const [expanded, setExpanded] = useState(false);
  const [expandedHtml, setExpandedHtml] = useState("");

  const contentHeightClass = tall
    ? "min-h-[400px] overflow-y-auto"
    : "min-h-[60px] max-h-[200px] overflow-y-auto";

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Underline,
      TextStyle,
      FontSize,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({ inline: false }),
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
        class: `${contentHeightClass} px-2.5 py-2 text-sm focus:outline-none ${EDITOR_CONTENT_CLASSES}`,
      },
      transformPastedHTML(html) {
        return cleanWordHtml(html);
      },
      handlePaste(_view, event) {
        const clipboardData = event.clipboardData;
        if (!clipboardData) return false;

        const imageFile = Array.from(clipboardData.items).find(
          (item) => item.type.startsWith("image/")
        );
        if (imageFile) {
          event.preventDefault();
          const file = imageFile.getAsFile();
          if (!file) return false;
          const reader = new FileReader();
          reader.onload = (e) => {
            const src = e.target?.result as string;
            if (src) editorRef.current?.commands.setImage({ src });
          };
          reader.readAsDataURL(file);
          return true;
        }

        const htmlData = clipboardData.getData("text/html");

        if (htmlData && /<table/i.test(htmlData)) {
          event.preventDefault();
          const parser = new DOMParser();
          const doc = parser.parseFromString(cleanWordHtml(htmlData), "text/html");
          const rows = Array.from(doc.querySelectorAll("tr"));
          if (rows.length > 0) {
            const grid = rows.map((row) =>
              Array.from(row.querySelectorAll("td, th")).map(
                (c) => (c.textContent ?? "").replace(/\s+/g, " ").trim()
              )
            );
            editorRef.current?.commands.insertContent(buildTableHtml(grid), {
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

        if (hasTabs) {
          const rows = textData
            .split("\n")
            .map((line) => line.split("\t").map((c) => c.trim()))
            .filter((cells) => cells.some((c) => c));
          editorRef.current?.commands.insertContent(buildTableHtml(rows), {
            parseOptions: { preserveWhitespace: true },
          });
        } else {
          const lines = textData.split("\n");
          const html = lines
            .map((line) => `<p>${escapeHtml(line) || "<br>"}</p>`)
            .join("");
          editorRef.current?.commands.insertContent(html, {
            parseOptions: { preserveWhitespace: true },
          });
        }
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
      editor.commands.setContent(value || "");
    }
  }, [value, editor]);

  if (!editor) return null;

  const currentFontSize = editor.getAttributes("textStyle").fontSize ?? "13px";
  const isEmpty = !editor.getText().trim();

  const smartToggleList = (type: "orderedList" | "bulletList") => {
    if (editor.isActive(type)) {
      if (type === "orderedList") editor.chain().focus().toggleOrderedList().run();
      else editor.chain().focus().toggleBulletList().run();
      return;
    }

    editor.chain().focus().command(({ tr, state, dispatch }) => {
      const { $from } = state.selection;
      const parent = $from.parent;
      if (parent.type.name !== "paragraph") return true;

      let hasHardBreak = false;
      parent.forEach((n) => { if (n.type.name === "hardBreak") hasHardBreak = true; });
      if (!hasHardBreak) return true;

      const newParas: any[] = [];
      let inline: any[] = [];
      parent.forEach((child) => {
        if (child.type.name === "hardBreak") {
          newParas.push(state.schema.nodes.paragraph.create(parent.attrs, inline.length ? inline : []));
          inline = [];
        } else {
          inline.push(child);
        }
      });
      if (inline.length > 0) newParas.push(state.schema.nodes.paragraph.create(parent.attrs, inline));

      const nodeStart = $from.before($from.depth);
      if (dispatch) dispatch(tr.replaceWith(nodeStart, nodeStart + parent.nodeSize, newParas));
      return true;
    })[type === "orderedList" ? "toggleOrderedList" : "toggleBulletList"]().run();
  };

  const openExpanded = () => {
    setExpandedHtml(value);
    setExpanded(true);
  };

  const closeExpanded = (save: boolean) => {
    if (save) onChange(expandedHtml);
    setExpanded(false);
  };

  return (
    <>
      <div className={cn("rounded-md border bg-background", className)}>
        <div className="flex items-center border-b px-1 py-1 gap-0.5 flex-wrap">
          <Toggle size="sm" pressed={editor.isActive("bold")} onPressedChange={() => editor.chain().focus().toggleBold().run()} className="h-6 w-6 p-0 data-[state=on]:bg-muted" title="Bold"><Bold className="h-3 w-3" /></Toggle>
          <Toggle size="sm" pressed={editor.isActive("italic")} onPressedChange={() => editor.chain().focus().toggleItalic().run()} className="h-6 w-6 p-0 data-[state=on]:bg-muted" title="Italic"><Italic className="h-3 w-3" /></Toggle>
          <Toggle size="sm" pressed={editor.isActive("underline")} onPressedChange={() => editor.chain().focus().toggleUnderline().run()} className="h-6 w-6 p-0 data-[state=on]:bg-muted" title="Underline"><UnderlineIcon className="h-3 w-3" /></Toggle>
          <div className="w-px h-4 bg-border mx-0.5" />
          <Toggle size="sm" pressed={editor.isActive("bulletList")} onPressedChange={() => smartToggleList("bulletList")} className="h-6 w-6 p-0 data-[state=on]:bg-muted" title="Bullet list"><List className="h-3 w-3" /></Toggle>
          <Toggle size="sm" pressed={editor.isActive("orderedList")} onPressedChange={() => smartToggleList("orderedList")} className="h-6 w-6 p-0 data-[state=on]:bg-muted" title="Numbered list (type '1. ' at line start to auto-convert)"><ListOrdered className="h-3 w-3" /></Toggle>
          <div className="w-px h-4 bg-border mx-0.5" />
          <Select value={currentFontSize} onValueChange={(size) => editor.chain().focus().setFontSize(size).run()}>
            <SelectTrigger className="h-6 w-20 text-xs px-1.5 py-0 border-0 bg-transparent hover:bg-muted focus:ring-0"><SelectValue /></SelectTrigger>
            <SelectContent>{FONT_SIZES.map((s) => <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>)}</SelectContent>
          </Select>
          {expandable && (
            <>
              <div className="w-px h-4 bg-border mx-0.5" />
              <button
                type="button"
                onClick={openExpanded}
                title="Expand editor"
                className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <Maximize2 className="h-3 w-3" />
              </button>
            </>
          )}
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

      {expandable && (
        <Dialog open={expanded} onOpenChange={(open) => { if (!open) closeExpanded(true); }}>
          <DialogContent className="max-w-4xl w-[90vw] flex flex-col gap-0 p-0 overflow-hidden" style={{ height: "80vh" }}>
            <DialogHeader className="px-4 pt-4 pb-2 border-b shrink-0">
              <div className="flex items-center justify-between">
                <DialogTitle className="text-base">Edit Notes</DialogTitle>
                <button
                  type="button"
                  onClick={() => closeExpanded(true)}
                  title="Collapse"
                  className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Minimize2 className="h-4 w-4" />
                </button>
              </div>
            </DialogHeader>

            <div className="flex-1 overflow-hidden px-4 py-3">
              <RichTextEditor
                value={expandedHtml}
                onChange={setExpandedHtml}
                placeholder={placeholder}
                expandable={false}
                tall
                className="h-full flex flex-col"
              />
            </div>

            <div className="flex justify-end gap-2 px-4 py-3 border-t shrink-0">
              <Button variant="outline" size="sm" onClick={() => closeExpanded(false)}>Cancel</Button>
              <Button size="sm" onClick={() => closeExpanded(true)}>Done</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

export function RichTextEditor(props: RichTextEditorProps) {
  return <EditorCore {...props} />;
}
