"use client";

import { useState } from "react";
import {
  ChevronRight,
  Folder,
  FileText,
  Video,
  RefreshCw,
  Pencil,
  Trash2,
  FilePlus2,
  FolderPlus,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WorkspaceFileItem, formatBytes } from "@/lib/file-tree";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface FileExplorerProps {
  files: WorkspaceFileItem[];
  selectedFileId: string | null;
  onFileSelect: (file: WorkspaceFileItem) => void;
  selectedCourse?: string | null;
  allowManagement?: boolean;
  onRefresh?: () => void;
}

function FileIcon({ type }: { type: WorkspaceFileItem["type"] }) {
  switch (type) {
    case "folder":
      return <Folder className="h-4 w-4 text-muted-foreground" />;
    case "media":
      return <Video className="h-4 w-4 text-blue-400" />;
    case "pdf":
      return <FileText className="h-4 w-4 text-red-400" />;
    case "binary":
      return <FileText className="h-4 w-4 text-amber-400" />;
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
  canDownload: boolean;
  onDownload: (item: WorkspaceFileItem) => void;
  allowManagement: boolean;
  onRename: (item: WorkspaceFileItem) => void;
  onDelete: (item: WorkspaceFileItem) => void;
  onMove: (fromPath: string, toPath: string) => void;
  onDragStart: (path: string) => void;
}

function FileTreeItem({
  item,
  depth,
  selectedFileId,
  onFileSelect,
  canDownload,
  onDownload,
  allowManagement,
  onRename,
  onDelete,
  onMove,
  onDragStart,
}: FileTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const isFolder = item.type === "folder";
  const isSelected = item.id === selectedFileId;

  const itemPath = item.relativePath;
  const isDraggable = allowManagement && Boolean(itemPath);

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        draggable={isDraggable}
        onDragStart={(event) => {
          if (!itemPath) return;
          event.dataTransfer.setData("text/plain", itemPath);
          onDragStart(itemPath);
        }}
        onDragOver={(event) => {
          if (!allowManagement || !isFolder || !itemPath) return;
          event.preventDefault();
        }}
        onDrop={(event) => {
          if (!allowManagement || !isFolder || !itemPath) return;
          event.preventDefault();
          const sourcePath = event.dataTransfer.getData("text/plain");
          if (!sourcePath) return;
          const sourceName = sourcePath.split("/").filter(Boolean).pop();
          if (!sourceName) return;
          const targetPath = `${itemPath}/${sourceName}`;
          if (sourcePath === targetPath) return;
          onMove(sourcePath, targetPath);
        }}
        onClick={() => {
          if (isFolder) {
            setIsExpanded(!isExpanded);
          } else {
            onFileSelect(item);
          }
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          if (isFolder) {
            setIsExpanded((prev) => !prev);
          } else {
            onFileSelect(item);
          }
        }}
        className={cn(
          "w-full flex items-center gap-1 py-1 px-2 text-sm hover:bg-accent/50 rounded-sm transition-colors group cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
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
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              {item.lastProcessed ? new Date(item.lastProcessed).toLocaleDateString() : "-"}
            </span>
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              {formatBytes(item.size)}
            </span>
          </div>
        )}
        {allowManagement && itemPath && (
          <div className="ml-2 flex items-center gap-1">
            {canDownload && !isFolder && (
              <button
                type="button"
                className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-accent/60"
                onClick={(event) => {
                  event.stopPropagation();
                  onDownload(item);
                }}
                aria-label="Download file"
              >
                <Download className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
            <button
              type="button"
              className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-accent/60"
              onClick={(event) => {
                event.stopPropagation();
                onRename(item);
              }}
              aria-label="Rename item"
            >
              <Pencil className="h-3 w-3 text-muted-foreground" />
            </button>
            <button
              type="button"
              className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-accent/60"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(item);
              }}
              aria-label="Delete item"
            >
              <Trash2 className="h-3 w-3 text-muted-foreground" />
            </button>
          </div>
        )}
      </div>
      {isFolder && isExpanded && item.children && (
        <div>
          {item.children.map((child) => (
            <FileTreeItem
              key={child.id}
              item={child}
              depth={depth + 1}
              selectedFileId={selectedFileId}
              onFileSelect={onFileSelect}
              canDownload={canDownload}
              onDownload={onDownload}
              allowManagement={allowManagement}
              onRename={onRename}
              onDelete={onDelete}
              onMove={onMove}
              onDragStart={onDragStart}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function getParentPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.slice(0, -1).join("/");
}

function getBaseName(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] || path;
}

export function FileExplorer({
  files,
  selectedFileId,
  onFileSelect,
  selectedCourse,
  allowManagement = false,
  onRefresh,
}: FileExplorerProps) {
  const { toast } = useToast();

  const createFile = async () => {
    if (!selectedCourse) return;
    const input = window.prompt("New file path (e.g. Notes/todo.md)");
    if (!input) return;
    const relPath = input.trim().replace(/^\/+/, "");
    if (!relPath) return;

    try {
      await api.createTextFile(selectedCourse, relPath.includes(".") ? relPath : `${relPath}.md`, "");
      toast({ title: "File created", description: relPath });
      onRefresh?.();
    } catch (error) {
      toast({
        title: "Could not create file",
        description: error instanceof Error ? error.message : "Request failed.",
        variant: "destructive",
      });
    }
  };

  const createFolder = async () => {
    if (!selectedCourse) return;
    const input = window.prompt("New folder path (e.g. Lectures/Week-01)");
    if (!input) return;
    const relPath = input.trim().replace(/^\/+|\/+$/g, "");
    if (!relPath) return;

    try {
      await api.createFolder(selectedCourse, relPath);
      toast({ title: "Folder created", description: relPath });
      onRefresh?.();
    } catch (error) {
      toast({
        title: "Could not create folder",
        description: error instanceof Error ? error.message : "Request failed.",
        variant: "destructive",
      });
    }
  };

  const moveItem = async (fromPath: string, toPath: string) => {
    if (!selectedCourse) return;
    if (fromPath === toPath) return;
    try {
      await api.moveItem(selectedCourse, fromPath, toPath);
      toast({ title: "Moved", description: `${fromPath} -> ${toPath}` });
      onRefresh?.();
    } catch (error) {
      toast({
        title: "Move failed",
        description: error instanceof Error ? error.message : "Request failed.",
        variant: "destructive",
      });
    }
  };

  const renameItem = async (item: WorkspaceFileItem) => {
    if (!selectedCourse || !item.relativePath) return;
    const nextName = window.prompt("Rename to:", item.name);
    if (!nextName) return;

    const cleanName = nextName.trim();
    if (!cleanName || cleanName === item.name) return;

    const parent = getParentPath(item.relativePath);
    const target = parent ? `${parent}/${cleanName}` : cleanName;
    await moveItem(item.relativePath, target);
  };

  const deleteItem = async (item: WorkspaceFileItem) => {
    if (!selectedCourse || !item.relativePath) return;
    const confirmed = window.confirm(`Delete ${item.type} \"${item.name}\"? This cannot be undone.`);
    if (!confirmed) return;

    try {
      await api.deleteItem(selectedCourse, item.relativePath);
      toast({ title: "Deleted", description: item.relativePath });
      onRefresh?.();
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Request failed.",
        variant: "destructive",
      });
    }
  };

  const downloadItem = (item: WorkspaceFileItem) => {
    if (!selectedCourse || !item.relativePath || item.type === "folder") return;
    const url = api.getDownloadFileUrl(selectedCourse, item.relativePath);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="h-full flex flex-col bg-sidebar">
      <div className="h-9 border-b border-border flex items-center justify-between px-3 shrink-0">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Explorer
        </span>
        <div className="flex items-center gap-1">
          {allowManagement && (
            <>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => createFile().catch(() => undefined)}>
                <FilePlus2 className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => createFolder().catch(() => undefined)}>
                <FolderPlus className="h-3 w-3" />
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRefresh}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div
          className="py-2"
          onDragOver={(event) => {
            if (!allowManagement) return;
            event.preventDefault();
          }}
          onDrop={(event) => {
            if (!allowManagement) return;
            event.preventDefault();
            const sourcePath = event.dataTransfer.getData("text/plain");
            if (!sourcePath) return;
            const sourceName = getBaseName(sourcePath);
            moveItem(sourcePath, sourceName).catch(() => undefined);
          }}
        >
          {files.map((item) => (
            <FileTreeItem
              key={item.id}
              item={item}
              depth={0}
              selectedFileId={selectedFileId}
              onFileSelect={onFileSelect}
              canDownload={Boolean(selectedCourse && item.type !== "folder")}
              onDownload={downloadItem}
              allowManagement={allowManagement}
              onRename={(target) => {
                renameItem(target).catch(() => undefined);
              }}
              onDelete={(target) => {
                deleteItem(target).catch(() => undefined);
              }}
              onMove={(fromPath, toPath) => {
                moveItem(fromPath, toPath).catch(() => undefined);
              }}
              onDragStart={() => undefined}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
