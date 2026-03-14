"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, SplitSquareHorizontal, X, FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { FileExplorer } from "./file-explorer";
import { MediaPlayer } from "./media-player";
import { MarkdownEditor } from "./markdown-editor";
import { api } from "@/lib/api";
import { flattenFiles, WorkspaceFileItem } from "@/lib/file-tree";
import { useToast } from "@/hooks/use-toast";

interface CourseWorkspaceProps {
  showSidebar: boolean;
  files: WorkspaceFileItem[];
  selectedCourse: string | null;
  openFileId?: string | null;
  onOpenFileHandled?: () => void;
  onRefreshFiles?: () => void;
}

export function CourseWorkspace({
  showSidebar,
  files,
  selectedCourse,
  openFileId,
  onOpenFileHandled,
  onRefreshFiles,
}: CourseWorkspaceProps) {
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<WorkspaceFileItem | null>(null);
  const [splitScreen, setSplitScreen] = useState(false);
  const [secondaryFile, setSecondaryFile] = useState<WorkspaceFileItem | null>(null);
  const [textContents, setTextContents] = useState<Record<string, string>>({});
  const [loadingFilePath, setLoadingFilePath] = useState<string | null>(null);

  const flatFiles = useMemo(() => flattenFiles(files), [files]);
  const flatFileItems = useMemo(() => flatFiles.map((item) => item.file), [flatFiles]);
  const fileById = useMemo(
    () => new Map(flatFileItems.map((file) => [file.id, file])),
    [flatFileItems]
  );

  useEffect(() => {
    const firstMedia = flatFiles.find((item) => item.file.type === "media")?.file || null;
    const firstText = flatFiles.find((item) => item.file.type === "file")?.file || null;

    setSelectedFile((prev) => {
      if (prev && fileById.has(prev.id)) return prev;
      return firstMedia || firstText || null;
    });
    setSecondaryFile((prev) => {
      if (prev && fileById.has(prev.id)) return prev;
      return firstMedia && firstText ? firstText : null;
    });
    setTextContents({});
  }, [flatFiles, fileById]);

  useEffect(() => {
    if (!selectedFile) return;
    if (fileById.has(selectedFile.id)) return;

    const fallback = flatFileItems[0] || null;
    setSelectedFile(fallback);
    toast({
      title: "File no longer exists",
      description: "Selected file was removed. Switched to an available file.",
    });
  }, [fileById, flatFileItems, selectedFile, toast]);

  useEffect(() => {
    if (!secondaryFile) return;
    if (fileById.has(secondaryFile.id)) return;
    setSecondaryFile(null);
  }, [fileById, secondaryFile]);

  const loadTextContent = useCallback(async (file: WorkspaceFileItem) => {
    if (!selectedCourse || !file.relativePath || file.type !== "file") return;
    if (textContents[file.relativePath] !== undefined) return;

    setLoadingFilePath(file.relativePath);
    try {
      const response = await api.getTextContent(selectedCourse, file.relativePath);
      setTextContents((prev) => ({ ...prev, [file.relativePath!]: response.content }));
    } catch (error) {
      toast({
        title: "Failed to load file",
        description: error instanceof Error ? error.message : "Could not fetch text content.",
        variant: "destructive",
      });
    } finally {
      setLoadingFilePath(null);
    }
  }, [selectedCourse, textContents, toast]);

  useEffect(() => {
    if (!openFileId) return;

    const targetFile = fileById.get(openFileId);
    if (!targetFile || targetFile.type === "folder") {
      onOpenFileHandled?.();
      return;
    }

    setSelectedFile(targetFile);
    if (targetFile.type === "file") {
      loadTextContent(targetFile).catch(() => undefined);
    }
    onOpenFileHandled?.();
  }, [openFileId, fileById, loadTextContent, onOpenFileHandled]);

  useEffect(() => {
    if (selectedFile?.type === "file") {
      loadTextContent(selectedFile).catch(() => undefined);
    }
    if (secondaryFile?.type === "file") {
      loadTextContent(secondaryFile).catch(() => undefined);
    }
  }, [selectedFile, secondaryFile, selectedCourse, loadTextContent]);

  const handleFileSelect = (file: WorkspaceFileItem) => {
    if (file.type === "folder") return;
    setSelectedFile(file);

    if (file.type === "file") {
      loadTextContent(file).catch(() => undefined);
    }
  };

  const handleSaveFile = async (file: WorkspaceFileItem, content: string) => {
    if (!selectedCourse || !file.relativePath) return;
    try {
      await api.updateTextContent(selectedCourse, file.relativePath, content);
      setTextContents((prev) => ({ ...prev, [file.relativePath!]: content }));
      toast({
        title: "Saved",
        description: `${file.name} has been updated.`,
      });
      onRefreshFiles?.();
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Could not save file changes.",
        variant: "destructive",
      });
    }
  };

  const handleSaveTranscript = async (file: WorkspaceFileItem, transcriptText: string) => {
    if (!selectedCourse || !file.relativePath) return;
    try {
      await api.updateTranscribedText(selectedCourse, file.relativePath, transcriptText);
      toast({
        title: "Transcript saved",
        description: `${file.name} transcript updated.`,
      });
      onRefreshFiles?.();
    } catch (error) {
      toast({
        title: "Transcript save failed",
        description: error instanceof Error ? error.message : "Could not save transcript.",
        variant: "destructive",
      });
    }
  };

  const handleCreateFile = useCallback(async () => {
    if (!selectedCourse) {
      toast({
        title: "Select a course first",
        description: "A course is required before creating files.",
        variant: "destructive",
      });
      return;
    }

    const input = window.prompt("New file path (e.g., Notes/summary.md)");
    if (!input) return;

    const trimmed = input.trim().replace(/^\/+/, "");
    if (!trimmed) return;
    const relPath = trimmed.includes(".") ? trimmed : `${trimmed}.md`;

    try {
      await api.createTextFile(selectedCourse, relPath, "");
      setTextContents((prev) => ({ ...prev, [relPath]: "" }));
      toast({
        title: "File created",
        description: relPath,
      });
      onRefreshFiles?.();
    } catch (error) {
      toast({
        title: "Failed to create file",
        description: error instanceof Error ? error.message : "Request failed.",
        variant: "destructive",
      });
    }
  }, [onRefreshFiles, selectedCourse, toast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isMod = event.metaKey || event.ctrlKey;
      if (!isMod) return;

      if (event.key === "\\") {
        event.preventDefault();
        setSplitScreen((prev) => !prev);
      }

      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        handleCreateFile().catch(() => undefined);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleCreateFile]);

  const renderFileContent = (file: WorkspaceFileItem | null) => {
    if (!file) {
      return (
        <div className="h-full flex items-center justify-center bg-card">
          <div className="text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Select a file to view</p>
          </div>
        </div>
      );
    }

    if (!fileById.has(file.id)) {
      return (
        <div className="h-full flex items-center justify-center bg-card text-muted-foreground text-sm">
          This file was deleted. Select another file.
        </div>
      );
    }

    if (!selectedCourse || !file.relativePath) {
      return (
        <div className="h-full flex items-center justify-center bg-card text-muted-foreground text-sm">
          Select a course to begin.
        </div>
      );
    }

    if (file.type === "media") {
      return (
        <MediaPlayer
          file={file}
          sourceUrl={api.getRawFileUrl(selectedCourse, file.relativePath)}
          courseName={selectedCourse}
          onSaveTranscript={(text) => handleSaveTranscript(file, text)}
        />
      );
    }

    if (loadingFilePath === file.relativePath && textContents[file.relativePath] === undefined) {
      return (
        <div className="h-full flex items-center justify-center bg-card">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading {file.name}
          </div>
        </div>
      );
    }

    return (
      <MarkdownEditor
        file={file}
        initialContent={textContents[file.relativePath] || ""}
        onSave={(content) => handleSaveFile(file, content)}
      />
    );
  };

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full">
      {showSidebar && (
        <>
          <ResizablePanel defaultSize={20} minSize={15} maxSize={35}>
            <FileExplorer
              files={files}
              selectedFileId={selectedFile?.id || null}
              onFileSelect={handleFileSelect}
              onRefresh={onRefreshFiles}
            />
          </ResizablePanel>
          <ResizableHandle />
        </>
      )}

      <ResizablePanel defaultSize={showSidebar ? 80 : 100}>
        <div className="h-full flex flex-col">
          <div className="h-9 border-b border-border flex items-center justify-between px-3 shrink-0 bg-muted/30">
            <div className="flex items-center gap-2">
              {selectedFile && (
                <span className="text-xs text-muted-foreground">{selectedFile.name}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => {
                  handleCreateFile().catch(() => undefined);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                New File
              </Button>
              <Button
                variant={splitScreen ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => setSplitScreen(!splitScreen)}
              >
                <SplitSquareHorizontal className="h-3.5 w-3.5" />
                Split (Cmd/Ctrl+\)
              </Button>
            </div>
          </div>

          <div className="flex-1 min-h-0">
            {splitScreen ? (
              <ResizablePanelGroup direction="horizontal" className="h-full">
                <ResizablePanel defaultSize={50}>{renderFileContent(selectedFile)}</ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={50}>
                  <div className="h-full flex flex-col">
                    {secondaryFile && (
                      <div className="h-7 border-b border-border flex items-center justify-between px-2 bg-muted/30 shrink-0">
                        <span className="text-xs text-muted-foreground truncate">{secondaryFile.name}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => setSecondaryFile(null)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    <div className="flex-1 min-h-0">{renderFileContent(secondaryFile)}</div>
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            ) : (
              renderFileContent(selectedFile)
            )}
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
