"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, X, FileText } from "lucide-react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { FileExplorer } from "./file-explorer";
import { MediaPlayer } from "./media-player";
import { MarkdownEditor } from "./markdown-editor";
import { PdfViewer } from "./pdf-viewer";
import { api } from "@/lib/api";
import { flattenFiles, WorkspaceFileItem } from "@/lib/file-tree";
import { useToast } from "@/hooks/use-toast";

interface CourseWorkspaceProps {
  showSidebar: boolean;
  files: WorkspaceFileItem[];
  selectedCourse: string | null;
  openFileId?: string | null;
  onOpenFileHandled?: () => void;
  createFileTrigger?: number;
  toggleSplitTrigger?: number;
  onHeaderStateChange?: (state: {
    primaryFileName: string | null;
    secondaryFileName: string | null;
    splitScreen: boolean;
  }) => void;
  onRefreshFiles?: () => void;
}

export function CourseWorkspace({
  showSidebar,
  files,
  selectedCourse,
  openFileId,
  onOpenFileHandled,
  createFileTrigger,
  toggleSplitTrigger,
  onHeaderStateChange,
  onRefreshFiles,
}: CourseWorkspaceProps) {
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<WorkspaceFileItem | null>(null);
  const [splitScreen, setSplitScreen] = useState(false);
  const [secondaryFile, setSecondaryFile] = useState<WorkspaceFileItem | null>(null);
  const [textContents, setTextContents] = useState<Record<string, string>>({});
  const [loadingFilePath, setLoadingFilePath] = useState<string | null>(null);
  const lastCreateFileTrigger = useRef<number | undefined>(undefined);
  const lastToggleSplitTrigger = useRef<number | undefined>(undefined);

  const flatFiles = useMemo(() => flattenFiles(files), [files]);
  const flatFileItems = useMemo(() => flatFiles.map((item) => item.file), [flatFiles]);
  const fileById = useMemo(
    () => new Map(flatFileItems.map((file) => [file.id, file])),
    [flatFileItems]
  );

  useEffect(() => {
    const firstMedia = flatFiles.find((item) => item.file.type === "media")?.file || null;
    const firstText = flatFiles.find((item) => item.file.type === "file")?.file || null;
    const firstPdf = flatFiles.find((item) => item.file.type === "pdf")?.file || null;

    setSelectedFile((prev) => {
      if (prev && fileById.has(prev.id)) return prev;
      return firstMedia || firstText || firstPdf || flatFileItems[0] || null;
    });
    setSecondaryFile((prev) => {
      if (prev && fileById.has(prev.id)) return prev;
      return firstMedia && (firstText || firstPdf) ? (firstText || firstPdf) : null;
    });
    setTextContents({});
  }, [flatFiles, fileById, flatFileItems]);

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
    if (splitScreen && secondaryFile?.type === "file") {
      loadTextContent(secondaryFile).catch(() => undefined);
    }
  }, [selectedFile, secondaryFile, splitScreen, selectedCourse, loadTextContent]);

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

      if (event.key.toLowerCase() === "i") {
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

  useEffect(() => {
    if (createFileTrigger === undefined) return;
    if (lastCreateFileTrigger.current === undefined) {
      lastCreateFileTrigger.current = createFileTrigger;
      return;
    }
    if (lastCreateFileTrigger.current === createFileTrigger) return;
    lastCreateFileTrigger.current = createFileTrigger;
    handleCreateFile().catch(() => undefined);
  }, [createFileTrigger, handleCreateFile]);

  useEffect(() => {
    if (toggleSplitTrigger === undefined) return;
    if (lastToggleSplitTrigger.current === undefined) {
      lastToggleSplitTrigger.current = toggleSplitTrigger;
      return;
    }
    if (lastToggleSplitTrigger.current === toggleSplitTrigger) return;
    lastToggleSplitTrigger.current = toggleSplitTrigger;
    setSplitScreen((prev) => !prev);
  }, [toggleSplitTrigger]);

  useEffect(() => {
    onHeaderStateChange?.({
      primaryFileName: selectedFile?.name || null,
      secondaryFileName: splitScreen ? secondaryFile?.name || null : null,
      splitScreen,
    });
  }, [onHeaderStateChange, selectedFile, secondaryFile, splitScreen]);

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

    if (file.type === "binary") {
      return (
        <div className="h-full flex items-center justify-center bg-card text-muted-foreground text-sm px-4 text-center">
          This file type cannot be edited as text. Use media preview for audio/video, or open/download it externally.
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

    if (file.type === "pdf") {
      return (
        <PdfViewer
          fileName={file.name}
          sourceUrl={api.getRawFileUrl(selectedCourse, file.relativePath)}
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
              selectedCourse={selectedCourse}
              allowManagement
              onFileSelect={handleFileSelect}
              onRefresh={onRefreshFiles}
            />
          </ResizablePanel>
          <ResizableHandle />
        </>
      )}

      <ResizablePanel defaultSize={showSidebar ? 80 : 100}>
        <div className="h-full min-h-0">
          {splitScreen ? (
            <ResizablePanelGroup direction="horizontal" className="h-full">
              <ResizablePanel defaultSize={50}>{renderFileContent(selectedFile)}</ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={50}>
                <div className="h-full flex flex-col">
                  {secondaryFile && (
                    <div className="h-7 border-b border-border flex items-center justify-between px-2 bg-muted/30 shrink-0">
                      <span className="text-xs text-muted-foreground truncate">{secondaryFile.name}</span>
                      <button
                        type="button"
                        className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-muted"
                        onClick={() => setSecondaryFile(null)}
                        aria-label="Close secondary panel"
                      >
                        <X className="h-3 w-3" />
                      </button>
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
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
