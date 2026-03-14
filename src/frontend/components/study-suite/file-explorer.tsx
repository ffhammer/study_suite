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
  Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WorkspaceFileItem, formatBytes } from "@/lib/file-tree";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface FileExplorerProps {
  files: WorkspaceFileItem[];
  selectedFileId: string | null;
  onFileSelect: (file: WorkspaceFileItem) => void;
  selectedCourse?: string | null;
  allowManagement?: boolean;
  contextSelectionEnabled?: boolean;
  selectedContextPaths?: string[];
  onToggleContextPath?: (path: string) => void;
  onRefresh?: () => void;
}

function FileIcon({ type }: { type: WorkspaceFileItem["type"] }) {
  switch (type) {
    case "folder":
      return <Folder className="h-4 w-4 text-muted-foreground" />;
    case "media":
      return <Video className="h-4 w-4 text-blue-400" />;
    case "image":
      return <ImageIcon className="h-4 w-4 text-emerald-400" />;
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
  contextSelectionEnabled: boolean;
  selectedContextPaths: string[];
  onToggleContextPath?: (path: string) => void;
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
  contextSelectionEnabled,
  selectedContextPaths,
  onToggleContextPath,
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
  const canDownloadItem = canDownload && !isFolder;
  const isSelected = item.id === selectedFileId;

  const itemPath = item.relativePath;
  const isDraggable = allowManagement && Boolean(itemPath);
  const isContextSelected = Boolean(
    contextSelectionEnabled && itemPath && selectedContextPaths.includes(itemPath)
  );

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger asChild>
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
            onClick={(event) => {
              if (
                contextSelectionEnabled &&
                event.shiftKey &&
                !isFolder &&
                itemPath &&
                onToggleContextPath
              ) {
                event.preventDefault();
                event.stopPropagation();
                onToggleContextPath(itemPath);
                return;
              }

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
              "w-full min-w-0 overflow-hidden flex items-center gap-1 py-1 px-2 text-sm hover:bg-accent/50 rounded-sm transition-colors group cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              isSelected && "bg-accent",
              isContextSelected && "ring-1 ring-primary/60 bg-primary/10"
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
            <span className="truncate flex-1 min-w-0 text-left" title={item.name}>
              {item.name}
            </span>
            {!isFolder && (
              <div className="hidden sm:flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {item.lastProcessed ? new Date(item.lastProcessed).toLocaleDateString() : "-"}
                </span>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {formatBytes(item.size)}
                </span>
              </div>
            )}
            {allowManagement && itemPath && (
              <div className="ml-2 flex items-center gap-1 shrink-0">
                {canDownloadItem && (
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
        </ContextMenuTrigger>
        {allowManagement && itemPath && (
          <ContextMenuContent>
            {canDownloadItem && (
              <ContextMenuItem
                onSelect={() => {
                  onDownload(item);
                }}
              >
                <Download className="h-4 w-4" />
                Download
              </ContextMenuItem>
            )}
            {canDownloadItem && <ContextMenuSeparator />}
            <ContextMenuItem
              onSelect={() => {
                onRename(item);
              }}
            >
              <Pencil className="h-4 w-4" />
              Rename
            </ContextMenuItem>
            <ContextMenuItem
              variant="destructive"
              onSelect={() => {
                onDelete(item);
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </ContextMenuItem>
          </ContextMenuContent>
        )}
      </ContextMenu>
      {isFolder && isExpanded && item.children && (
        <div>
          {item.children.map((child) => (
            <FileTreeItem
              key={child.id}
              item={child}
              depth={depth + 1}
              selectedFileId={selectedFileId}
              onFileSelect={onFileSelect}
              contextSelectionEnabled={contextSelectionEnabled}
              selectedContextPaths={selectedContextPaths}
              onToggleContextPath={onToggleContextPath}
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
  contextSelectionEnabled = false,
  selectedContextPaths = [],
  onToggleContextPath,
  onRefresh,
}: FileExplorerProps) {
  const { toast } = useToast();
  const [createFileOpen, setCreateFileOpen] = useState(false);
  const [newFilePath, setNewFilePath] = useState("");
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderPath, setNewFolderPath] = useState("");
  const [renameDialogState, setRenameDialogState] = useState<{
    open: boolean;
    item: WorkspaceFileItem | null;
    nextName: string;
  }>({
    open: false,
    item: null,
    nextName: "",
  });
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceFileItem | null>(null);

  const createFile = async () => {
    if (!selectedCourse) return;
    const relPath = newFilePath.trim().replace(/^\/+/, "");
    if (!relPath) return;

    try {
      await api.createTextFile(selectedCourse, relPath.includes(".") ? relPath : `${relPath}.md`, "");
      toast({ title: "File created", description: relPath });
      setCreateFileOpen(false);
      setNewFilePath("");
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
    const relPath = newFolderPath.trim().replace(/^\/+|\/+$/g, "");
    if (!relPath) return;

    try {
      await api.createFolder(selectedCourse, relPath);
      toast({ title: "Folder created", description: relPath });
      setCreateFolderOpen(false);
      setNewFolderPath("");
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

  const openRenameDialog = (item: WorkspaceFileItem) => {
    setRenameDialogState({
      open: true,
      item,
      nextName: item.name,
    });
  };

  const renameItem = async () => {
    const item = renameDialogState.item;
    if (!selectedCourse || !item?.relativePath) return;
    const cleanName = renameDialogState.nextName.trim();
    if (!cleanName || cleanName === item.name) {
      setRenameDialogState({ open: false, item: null, nextName: "" });
      return;
    }

    const parent = getParentPath(item.relativePath);
    const target = parent ? `${parent}/${cleanName}` : cleanName;
    await moveItem(item.relativePath, target);
    setRenameDialogState({ open: false, item: null, nextName: "" });
  };

  const deleteItem = async () => {
    const item = deleteTarget;
    if (!selectedCourse || !item?.relativePath) return;

    try {
      await api.deleteItem(selectedCourse, item.relativePath);
      toast({ title: "Deleted", description: item.relativePath });
      setDeleteTarget(null);
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
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCreateFileOpen(true)}>
                <FilePlus2 className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCreateFolderOpen(true)}>
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
              contextSelectionEnabled={contextSelectionEnabled}
              selectedContextPaths={selectedContextPaths}
              onToggleContextPath={onToggleContextPath}
              canDownload={Boolean(selectedCourse)}
              onDownload={downloadItem}
              allowManagement={allowManagement}
              onRename={(target) => {
                openRenameDialog(target);
              }}
              onDelete={(target) => {
                setDeleteTarget(target);
              }}
              onMove={(fromPath, toPath) => {
                moveItem(fromPath, toPath).catch(() => undefined);
              }}
              onDragStart={() => undefined}
            />
          ))}
        </div>
      </ScrollArea>

      <Dialog
        open={createFileOpen}
        onOpenChange={(open) => {
          setCreateFileOpen(open);
          if (!open) setNewFilePath("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create File</DialogTitle>
            <DialogDescription>Enter a path like Notes/todo.md</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              createFile().catch(() => undefined);
            }}
          >
            <Input
              autoFocus
              value={newFilePath}
              onChange={(event) => setNewFilePath(event.target.value)}
              placeholder="Notes/todo.md"
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateFileOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createFolderOpen}
        onOpenChange={(open) => {
          setCreateFolderOpen(open);
          if (!open) setNewFolderPath("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Folder</DialogTitle>
            <DialogDescription>Enter a path like Lectures/Week-01</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              createFolder().catch(() => undefined);
            }}
          >
            <Input
              autoFocus
              value={newFolderPath}
              onChange={(event) => setNewFolderPath(event.target.value)}
              placeholder="Lectures/Week-01"
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateFolderOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameDialogState.open}
        onOpenChange={(open) => {
          if (!open) {
            setRenameDialogState({ open: false, item: null, nextName: "" });
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
            <DialogDescription>
              {renameDialogState.item ? `Rename ${renameDialogState.item.name}` : "Rename item"}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              renameItem().catch(() => undefined);
            }}
          >
            <Input
              autoFocus
              value={renameDialogState.nextName}
              onChange={(event) =>
                setRenameDialogState((prev) => ({
                  ...prev,
                  nextName: event.target.value,
                }))
              }
              placeholder="New name"
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenameDialogState({ open: false, item: null, nextName: "" })}
              >
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete item?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `Delete ${deleteTarget.type} \"${deleteTarget.name}\"? This cannot be undone.`
                : "This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                deleteItem().catch(() => undefined);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
