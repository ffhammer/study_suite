"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, X, FileText, FilePlus2 } from "lucide-react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { FileExplorer } from "./file-explorer";
import { MediaPlayer } from "./media-player";
import { ImageEditor } from "./image-editor";
import { MarkdownEditor } from "./markdown-editor";
import { PdfViewer } from "./pdf-viewer";
import { SummaryDiffEditor } from "./summary-diff-editor";
import { api } from "@/lib/api";
import { flattenFiles, WorkspaceFileItem } from "@/lib/file-tree";
import { useToast } from "@/hooks/use-toast";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface SummaryEditProposal {
  requestId: number;
  targetFile: string;
  proposedMarkdown: string;
}

interface CourseWorkspaceProps {
  showSidebar: boolean;
  files: WorkspaceFileItem[];
  selectedCourse: string | null;
  contextSelectionEnabled?: boolean;
  selectedContextPaths?: string[];
  onToggleContextPath?: (path: string) => void;
  onPrimaryFilePathChange?: (path: string | null) => void;
  openFileId?: string | null;
  onOpenFileHandled?: () => void;
  createFileTrigger?: number;
  toggleSplitTrigger?: number;
  onHeaderStateChange?: (state: {
    primaryFileName: string | null;
    secondaryFileName: string | null;
    splitScreen: boolean;
  }) => void;
  summaryEditProposal?: SummaryEditProposal | null;
  onSummaryEditHandled?: () => void;
  onRefreshFiles?: () => void;
}

export function CourseWorkspace({
  showSidebar,
  files,
  selectedCourse,
  contextSelectionEnabled = false,
  selectedContextPaths = [],
  onToggleContextPath,
  onPrimaryFilePathChange,
  openFileId,
  onOpenFileHandled,
  createFileTrigger,
  toggleSplitTrigger,
  onHeaderStateChange,
  summaryEditProposal,
  onSummaryEditHandled,
  onRefreshFiles,
}: CourseWorkspaceProps) {
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<WorkspaceFileItem | null>(null);
  const [splitScreen, setSplitScreen] = useState(false);
  const [secondaryFile, setSecondaryFile] = useState<WorkspaceFileItem | null>(null);
  const [textContents, setTextContents] = useState<Record<string, string>>({});
  const [loadingFilePath, setLoadingFilePath] = useState<string | null>(null);
  const [summaryEditState, setSummaryEditState] = useState<{
    targetPath: string;
    fileName: string;
    originalContent: string;
    draftContent: string;
    existsInTree: boolean;
  } | null>(null);
  const [isSavingSummaryEdit, setIsSavingSummaryEdit] = useState(false);
  const lastCreateFileTrigger = useRef<number | undefined>(undefined);
  const lastToggleSplitTrigger = useRef<number | undefined>(undefined);
  const [createFileDialogOpen, setCreateFileDialogOpen] = useState(false);
  const [newFilePath, setNewFilePath] = useState("");

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

  useEffect(() => {
    if (!summaryEditProposal || !selectedCourse) return;

    const openSummaryEdit = async () => {
      const normalizePath = (value: string) =>
        value.trim().replace(/^`+|`+$/g, "").replace(/\\/g, "/").replace(/^\.?\/+/, "");
      const baseName = (value: string) => value.split("/").filter(Boolean).pop() || value;

      const targetPath = normalizePath(summaryEditProposal.targetFile);
      let target = flatFileItems.find(
        (file) => file.type === "file" && normalizePath(file.relativePath || "") === targetPath
      );

      if (!target) {
        const matchesByName = flatFileItems.filter(
          (file) => file.type === "file" && baseName(file.relativePath || "") === baseName(targetPath)
        );
        if (matchesByName.length === 1) {
          target = matchesByName[0];
        }
      }

      if (target) {
        setSelectedFile(target);
      }
      setSplitScreen(false);

      const resolvedPath = target?.relativePath || targetPath;
      let original = textContents[resolvedPath];
      if (target && original === undefined) {
        try {
          const response = await api.getTextContent(selectedCourse, resolvedPath);
          original = response.content;
          setTextContents((prev) => ({ ...prev, [resolvedPath]: response.content }));
        } catch (error) {
          toast({
            title: "Failed to load summary file",
            description: error instanceof Error ? error.message : "Could not fetch text content.",
            variant: "destructive",
          });
          onSummaryEditHandled?.();
          return;
        }
      }

      if (!target) {
        toast({
          title: "Summary target not found",
          description: `Opening review for ${resolvedPath}. Applying will create this file.`,
        });
      }

      setSummaryEditState({
        targetPath: resolvedPath,
        fileName: baseName(resolvedPath),
        originalContent: original ?? "",
        draftContent: summaryEditProposal.proposedMarkdown,
        existsInTree: Boolean(target),
      });
      onSummaryEditHandled?.();
    };

    openSummaryEdit().catch(() => {
      onSummaryEditHandled?.();
    });
  }, [
    flatFileItems,
    onSummaryEditHandled,
    selectedCourse,
    summaryEditProposal,
    textContents,
    toast,
  ]);

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

  const handleFileSelect = (file: WorkspaceFileItem, panel: "primary" | "secondary" = "primary") => {
    if (file.type === "folder") return;

    if (panel === "secondary") {
      setSecondaryFile(file);
    } else {
      setSelectedFile(file);
    }

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

  const handleSaveSummaryEdit = async () => {
    if (!selectedCourse || !summaryEditState) return;

    setIsSavingSummaryEdit(true);
    try {
      if (summaryEditState.existsInTree) {
        await api.updateTextContent(
          selectedCourse,
          summaryEditState.targetPath,
          summaryEditState.draftContent
        );
      } else {
        await api.createTextFile(
          selectedCourse,
          summaryEditState.targetPath,
          summaryEditState.draftContent
        );
      }

      setTextContents((prev) => ({
        ...prev,
        [summaryEditState.targetPath]: summaryEditState.draftContent,
      }));

      setSummaryEditState((prev) =>
        prev
          ? {
            ...prev,
            originalContent: prev.draftContent,
            existsInTree: true,
          }
          : prev
      );

      toast({
        title: "Summary updated",
        description: `${summaryEditState.targetPath} saved successfully.`,
      });
      onRefreshFiles?.();
    } catch (error) {
      toast({
        title: "Failed to save summary changes",
        description: error instanceof Error ? error.message : "Request failed.",
        variant: "destructive",
      });
    } finally {
      setIsSavingSummaryEdit(false);
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

  const handleSaveEditedImage = async (
    file: WorkspaceFileItem,
    blob: Blob,
    mimeType: string
  ) => {
    if (!selectedCourse || !file.relativePath) return;

    try {
      const editedFile = new File([blob], file.name, { type: mimeType });
      await api.uploadFile(selectedCourse, editedFile, file.relativePath);
      toast({
        title: "Image saved",
        description: `${file.name} was updated successfully.`,
      });
      onRefreshFiles?.();
    } catch (error) {
      toast({
        title: "Image save failed",
        description:
          error instanceof Error ? error.message : "Could not save image.",
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

    setCreateFileDialogOpen(true);
  }, [selectedCourse, toast]);

  const submitCreateFile = useCallback(async () => {
    if (!selectedCourse) return;

    const trimmed = newFilePath.trim().replace(/^\/+/, "");
    if (!trimmed) return;
    const relPath = trimmed.includes(".") ? trimmed : `${trimmed}.md`;

    try {
      await api.createTextFile(selectedCourse, relPath, "");
      setTextContents((prev) => ({ ...prev, [relPath]: "" }));
      setCreateFileDialogOpen(false);
      setNewFilePath("");
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
  }, [newFilePath, onRefreshFiles, selectedCourse, toast]);

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

  useEffect(() => {
    onPrimaryFilePathChange?.(selectedFile?.relativePath || null);
  }, [onPrimaryFilePathChange, selectedFile]);

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

    if (file.type === "image") {
      return (
        <ImageEditor
          file={file}
          sourceUrl={api.getRawFileUrl(selectedCourse, file.relativePath)}
          onSaveEditedImage={(blob, mimeType) =>
            handleSaveEditedImage(file, blob, mimeType)
          }
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

    if (summaryEditState && summaryEditState.targetPath === file.relativePath) {
      return (
        <SummaryDiffEditor
          fileName={file.name}
          originalContent={summaryEditState.originalContent}
          draftContent={summaryEditState.draftContent}
          isSaving={isSavingSummaryEdit}
          onDraftChange={(value) =>
            setSummaryEditState((prev) =>
              prev
                ? {
                  ...prev,
                  draftContent: value,
                }
                : prev
            )
          }
          onSave={handleSaveSummaryEdit}
          onClose={() => setSummaryEditState(null)}
        />
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

  const renderPrimaryContent = () => {
    if (summaryEditState) {
      return (
        <SummaryDiffEditor
          fileName={summaryEditState.fileName}
          originalContent={summaryEditState.originalContent}
          draftContent={summaryEditState.draftContent}
          isSaving={isSavingSummaryEdit}
          onDraftChange={(value) =>
            setSummaryEditState((prev) =>
              prev
                ? {
                  ...prev,
                  draftContent: value,
                }
                : prev
            )
          }
          onSave={handleSaveSummaryEdit}
          onClose={() => setSummaryEditState(null)}
        />
      );
    }

    return renderFileContent(selectedFile);
  };

  return (
    <>
      <ResizablePanelGroup direction="horizontal" className="h-full">
        {showSidebar && (
          <>
            <ResizablePanel defaultSize={15} minSize={10} maxSize={35}>
              <FileExplorer
                files={files}
                selectedFileId={selectedFile?.id || null}
                selectedCourse={selectedCourse}
                allowManagement
                contextSelectionEnabled={contextSelectionEnabled}
                selectedContextPaths={selectedContextPaths}
                onToggleContextPath={onToggleContextPath}
                onFileSelect={(file) => handleFileSelect(file, "primary")}
                onRefresh={onRefreshFiles}
              />
            </ResizablePanel>
            <ResizableHandle />
          </>
        )}

        <ResizablePanel defaultSize={showSidebar ? 85 : 100}>
          <div className="h-full min-h-0">
            {splitScreen ? (
              <ResizablePanelGroup direction="horizontal" className="h-full">
                <ResizablePanel defaultSize={50}>{renderPrimaryContent()}</ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={50}>
                  <div className="h-full flex flex-col">
                    <div className="h-7 border-b border-border flex items-center justify-between px-2 bg-muted/20 shrink-0">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider shrink-0">Secondary Panel</span>
                        {secondaryFile && (
                          <span className="text-xs text-foreground truncate font-medium border-l border-border pl-2">{secondaryFile.name}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                              title="Open file in secondary panel"
                            >
                              <FilePlus2 className="h-3 w-3" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-64 p-0" align="end">
                            <div className="p-2 border-b border-border bg-muted/30">
                              <p className="text-[10px] font-medium uppercase text-muted-foreground">Select file for Right Panel</p>
                            </div>
                            <ScrollArea className="h-72">
                              <div className="p-1">
                                {flatFiles
                                  .filter(item => item.file.type !== "folder")
                                  .map(({ file, path }) => (
                                    <button
                                      key={file.id}
                                      className="w-full text-left px-2 py-1.5 text-xs rounded-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
                                      onClick={() => {
                                        handleFileSelect(file, "secondary");
                                      }}
                                    >
                                      <FileText className="h-3 w-3 shrink-0 opacity-70" />
                                      <span className="truncate">{path}</span>
                                    </button>
                                  ))}
                              </div>
                            </ScrollArea>
                          </PopoverContent>
                        </Popover>
                        <button
                          type="button"
                          className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => setSplitScreen(false)}
                          title="Close split view"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 min-h-0">{renderFileContent(secondaryFile)}</div>
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            ) : (
              renderPrimaryContent()
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      <Dialog
        open={createFileDialogOpen}
        onOpenChange={(open) => {
          setCreateFileDialogOpen(open);
          if (!open) setNewFilePath("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create File</DialogTitle>
            <DialogDescription>Enter a path like Notes/summary.md</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              submitCreateFile().catch(() => undefined);
            }}
          >
            <Input
              autoFocus
              value={newFilePath}
              onChange={(event) => setNewFilePath(event.target.value)}
              placeholder="Notes/summary.md"
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateFileDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
