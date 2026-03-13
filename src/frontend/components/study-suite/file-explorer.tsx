"use client";

import { useState } from "react";
import { ChevronRight, Folder, FileText, Video, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { WorkspaceFileItem, formatBytes } from "@/lib/file-tree";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface FileExplorerProps {
  files: WorkspaceFileItem[];
  selectedFileId: string | null;
  onFileSelect: (file: WorkspaceFileItem) => void;
  onRefresh?: () => void;
}

function FileIcon({ type }: { type: WorkspaceFileItem["type"] }) {
  switch (type) {
    case "folder":
      return <Folder className="h-4 w-4 text-muted-foreground" />;
    case "media":
      return <Video className="h-4 w-4 text-blue-400" />;
    case "file":
    default:
      return <FileText className="h-4 w-4 text-muted-foreground" />;
  }
}

interface FileTreeItemProps {
  item: WorkspaceFileItem;
  depth: number;
  selectedFileId: string | null;
  onFileSelect: (file: WorkspaceFileItem) => void;
}

function FileTreeItem({ item, depth, selectedFileId, onFileSelect }: FileTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const isFolder = item.type === "folder";
  const isSelected = item.id === selectedFileId;

  return (
    <div>
      <button
        onClick={() => {
          if (isFolder) {
            setIsExpanded(!isExpanded);
          } else {
            onFileSelect(item);
          }
        }}
        className={cn(
          "w-full flex items-center gap-1 py-1 px-2 text-sm hover:bg-accent/50 rounded-sm transition-colors group",
          isSelected && "bg-accent"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {isFolder ? (
          <ChevronRight
            className={cn(
              "h-3 w-3 text-muted-foreground transition-transform shrink-0",
              isExpanded && "rotate-90"
            )}
          />
        ) : (
          <span className="w-3" />
        )}
        <FileIcon type={item.type} />
        <span className="truncate flex-1 text-left">{item.name}</span>
        {!isFolder && (
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              {item.lastProcessed ? new Date(item.lastProcessed).toLocaleDateString() : "-"}
            </span>
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              {formatBytes(item.size)}
            </span>
          </div>
        )}
      </button>
      {isFolder && isExpanded && item.children && (
        <div>
          {item.children.map((child) => (
            <FileTreeItem
              key={child.id}
              item={child}
              depth={depth + 1}
              selectedFileId={selectedFileId}
              onFileSelect={onFileSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileExplorer({ files, selectedFileId, onFileSelect, onRefresh }: FileExplorerProps) {
  return (
    <div className="h-full flex flex-col bg-sidebar">
      <div className="h-9 border-b border-border flex items-center justify-between px-3 shrink-0">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Explorer
        </span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRefresh}>
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="py-2">
          {files.map((item) => (
            <FileTreeItem
              key={item.id}
              item={item}
              depth={0}
              selectedFileId={selectedFileId}
              onFileSelect={onFileSelect}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
