"use client";

import { useMemo } from "react";
import { Check, FileDiff, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface SummaryDiffEditorProps {
  fileName: string;
  originalContent: string;
  draftContent: string;
  isSaving?: boolean;
  onDraftChange: (value: string) => void;
  onSave: () => Promise<void>;
  onClose: () => void;
}

function computeChangedLines(left: string, right: string): Set<number> {
  const leftLines = left.split("\n");
  const rightLines = right.split("\n");
  const maxLen = Math.max(leftLines.length, rightLines.length);
  const changed = new Set<number>();

  for (let i = 0; i < maxLen; i += 1) {
    if ((leftLines[i] ?? "") !== (rightLines[i] ?? "")) {
      changed.add(i);
    }
  }

  return changed;
}

export function SummaryDiffEditor({
  fileName,
  originalContent,
  draftContent,
  isSaving = false,
  onDraftChange,
  onSave,
  onClose,
}: SummaryDiffEditorProps) {
  const originalLines = useMemo(() => originalContent.split("\n"), [originalContent]);
  const changedLines = useMemo(
    () => computeChangedLines(originalContent, draftContent),
    [originalContent, draftContent]
  );

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="h-10 border-b border-border flex items-center justify-between px-3 shrink-0 bg-card">
        <div className="flex items-center gap-2 min-w-0">
          <FileDiff className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-xs font-medium truncate">Summary Edit Review: {fileName}</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Close Review
          </Button>
          <Button
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onSave().catch(() => undefined)}
            disabled={isSaving}
          >
            <Check className="h-3.5 w-3.5 mr-1" />
            {isSaving ? "Saving..." : "Apply and Save"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-0 border-b border-border text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
        <div className="px-3 py-2 border-r border-border bg-muted/20">Current File</div>
        <div className="px-3 py-2 bg-muted/20">Proposed Changes (Editable)</div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-2">
        <ScrollArea className="border-r border-border">
          <pre className="p-3 text-xs font-mono leading-5 whitespace-pre-wrap break-words">
            {originalLines.map((line, index) => (
              <div
                key={`${index}-${line}`}
                className={cn("px-1 rounded-sm", changedLines.has(index) && "bg-amber-500/10")}
              >
                <span className="inline-block w-8 text-right mr-2 text-muted-foreground select-none">
                  {index + 1}
                </span>
                <span>{line || " "}</span>
              </div>
            ))}
          </pre>
        </ScrollArea>

        <Textarea
          value={draftContent}
          onChange={(event) => onDraftChange(event.target.value)}
          className="h-full resize-none border-0 rounded-none font-mono text-xs leading-5 focus-visible:ring-0"
        />
      </div>
    </div>
  );
}