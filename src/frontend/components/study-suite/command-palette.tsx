"use client";

import { FileText, Video, Folder } from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { flattenFiles, WorkspaceFileItem, formatBytes } from "@/lib/file-tree";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: WorkspaceFileItem[];
  onFileSelect: (file: WorkspaceFileItem) => void;
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

export function CommandPalette({
  open,
  onOpenChange,
  files,
  onFileSelect,
}: CommandPaletteProps) {
  const flatFiles = flattenFiles(files);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search Files"
      description="Search for files by name or path"
    >
      <CommandInput placeholder="Search files..." />
      <CommandList>
        <CommandEmpty>No files found.</CommandEmpty>
        <CommandGroup heading="Files">
          {flatFiles.map(({ file, path }) => (
            <CommandItem
              key={file.id}
              onSelect={() => {
                onFileSelect(file);
                onOpenChange(false);
              }}
              className="gap-2"
            >
              <FileIcon type={file.type} />
              <span className="flex-1 truncate">{path}</span>
              {file.size !== undefined && (
                <span className="text-xs text-muted-foreground">{formatBytes(file.size)}</span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
