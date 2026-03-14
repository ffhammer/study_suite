"use client";

import { useEffect, useState } from "react";
import { Eye, Edit3, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { WorkspaceFileItem } from "@/lib/file-tree";
import { MarkdownContent } from "@/components/ui/markdown-content";

interface MarkdownEditorProps {
  file: WorkspaceFileItem;
  initialContent: string;
  onSave?: (content: string) => Promise<void>;
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
          <div className="p-4">
            <MarkdownContent content={content} />
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
