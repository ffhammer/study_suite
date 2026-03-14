"use client";

import { useEffect, useState } from "react";
import { Bold, Italic, List, ListOrdered, Code, Link2, ImageIcon, Eye, Edit3, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { WorkspaceFileItem } from "@/lib/file-tree";

interface MarkdownEditorProps {
  file: WorkspaceFileItem;
  initialContent: string;
  onSave?: (content: string) => Promise<void>;
}

function renderMarkdownPreview(content: string) {
  // Simple markdown rendering for preview
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Headers
    if (line.startsWith("# ")) {
      elements.push(
        <h1 key={i} className="text-2xl font-bold mb-4 mt-6 first:mt-0">
          {line.slice(2)}
        </h1>
      );
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={i} className="text-xl font-semibold mb-3 mt-5">
          {line.slice(3)}
        </h2>
      );
      i++;
      continue;
    }
    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={i} className="text-lg font-medium mb-2 mt-4">
          {line.slice(4)}
        </h3>
      );
      i++;
      continue;
    }

    // Table - collect all table rows and wrap in table element
    if (line.startsWith("|") && line.endsWith("|")) {
      const tableRows: React.ReactNode[] = [];
      let isFirstRow = true;
      const tableStartIndex = i;

      while (i < lines.length && lines[i].startsWith("|") && lines[i].endsWith("|")) {
        const currentLine = lines[i];
        const cells = currentLine.split("|").filter((c) => c.trim());
        
        // Skip separator row (e.g., |---|---|)
        if (cells.every((c) => /^-+$/.test(c.trim()))) {
          i++;
          continue;
        }

        if (isFirstRow) {
          // Render header row
          tableRows.push(
            <thead key={`thead-${i}`}>
              <tr className="border-b border-border bg-muted/30">
                {cells.map((cell, cellIndex) => (
                  <th key={cellIndex} className="px-3 py-2 text-sm font-medium text-left">
                    {cell.trim()}
                  </th>
                ))}
              </tr>
            </thead>
          );
          isFirstRow = false;
        } else {
          // Render body row
          tableRows.push(
            <tr key={i} className="border-b border-border">
              {cells.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3 py-2 text-sm">
                  {cell.trim()}
                </td>
              ))}
            </tr>
          );
        }
        i++;
      }

      // Wrap rows in table element
      const bodyRows = tableRows.filter((_, idx) => idx > 0);
      elements.push(
        <table key={`table-${tableStartIndex}`} className="w-full border border-border rounded-md mb-4 overflow-hidden">
          {tableRows[0]}
          {bodyRows.length > 0 && <tbody>{bodyRows}</tbody>}
        </table>
      );
      continue;
    }

    // Checkboxes
    if (line.startsWith("- [ ] ")) {
      elements.push(
        <div key={i} className="flex items-center gap-2 ml-4 mb-1">
          <input type="checkbox" className="rounded" disabled />
          <span>{line.slice(6)}</span>
        </div>
      );
      i++;
      continue;
    }
    if (line.startsWith("- [x] ")) {
      elements.push(
        <div key={i} className="flex items-center gap-2 ml-4 mb-1">
          <input type="checkbox" className="rounded" checked disabled />
          <span className="line-through text-muted-foreground">{line.slice(6)}</span>
        </div>
      );
      i++;
      continue;
    }

    // List items
    if (line.startsWith("- ")) {
      const text = line.slice(2);
      const boldMatch = text.match(/\*\*(.+?)\*\*/);
      if (boldMatch) {
        const parts = text.split(/\*\*(.+?)\*\*/);
        elements.push(
          <li key={i} className="ml-4 mb-1 list-disc">
            {parts.map((part, idx) =>
              idx % 2 === 1 ? (
                <strong key={idx}>{part}</strong>
              ) : (
                <span key={idx}>{part}</span>
              )
            )}
          </li>
        );
      } else {
        elements.push(
          <li key={i} className="ml-4 mb-1 list-disc">
            {text}
          </li>
        );
      }
      i++;
      continue;
    }

    // Numbered lists
    if (/^\d+\.\s/.test(line)) {
      const text = line.replace(/^\d+\.\s/, "");
      const boldMatch = text.match(/\*\*(.+?)\*\*/);
      if (boldMatch) {
        const parts = text.split(/\*\*(.+?)\*\*/);
        elements.push(
          <li key={i} className="ml-4 mb-1 list-decimal">
            {parts.map((part, idx) =>
              idx % 2 === 1 ? (
                <strong key={idx}>{part}</strong>
              ) : (
                <span key={idx}>{part}</span>
              )
            )}
          </li>
        );
      } else {
        elements.push(
          <li key={i} className="ml-4 mb-1 list-decimal">
            {text}
          </li>
        );
      }
      i++;
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={i} className="mb-2 text-foreground/80">
        {line}
      </p>
    );
    i++;
  }

  return elements;
}

export function MarkdownEditor({ file, initialContent, onSave }: MarkdownEditorProps) {
  const [mode, setMode] = useState<"edit" | "preview">("preview");
  const [content, setContent] = useState(initialContent || "");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setContent(initialContent || "");
  }, [initialContent, file.id]);

  const handleSave = async () => {
    if (!onSave) return;
    setIsSaving(true);
    try {
      await onSave(content);
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isMod = event.metaKey || event.ctrlKey;
      if (isMod && event.key.toLowerCase() === "s") {
        event.preventDefault();
        handleSave().catch(() => undefined);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [content, onSave]);

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="h-9 border-b border-border flex items-center justify-between px-3 shrink-0 bg-card">
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground truncate max-w-48">
            {file.name}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {mode === "edit" && (
            <>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <Bold className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <Italic className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <Code className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <Link2 className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <List className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <ListOrdered className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <ImageIcon className="h-3.5 w-3.5" />
              </Button>
              <div className="h-4 w-px bg-border mx-1" />
              <Button
                variant="secondary"
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                onClick={handleSave}
                disabled={isSaving}
              >
                <Save className="h-3.5 w-3.5" />
                {isSaving ? "Saving..." : "Save (Cmd/Ctrl+S)"}
              </Button>
            </>
          )}
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(v) => v && setMode(v as "edit" | "preview")}
            size="sm"
          >
            <ToggleGroupItem value="edit" className="h-7 px-2 text-xs gap-1">
              <Edit3 className="h-3 w-3" />
              Edit
            </ToggleGroupItem>
            <ToggleGroupItem value="preview" className="h-7 px-2 text-xs gap-1">
              <Eye className="h-3 w-3" />
              Preview
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {/* Content Area */}
      {mode === "edit" ? (
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="flex-1 resize-none border-0 rounded-none font-mono text-sm focus-visible:ring-0 bg-card"
          placeholder="Start writing..."
        />
      ) : (
        <ScrollArea className="flex-1 bg-card">
          <div className="p-4 text-sm">
            {renderMarkdownPreview(content)}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
