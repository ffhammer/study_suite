"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, SplitSquareHorizontal, X, FileText } from "lucide-react";
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
  onRefreshFiles?: () => void;
}

export function CourseWorkspace({
  showSidebar,
  files,
  selectedCourse,
  onRefreshFiles,
}: CourseWorkspaceProps) {
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<WorkspaceFileItem | null>(null);
  const [splitScreen, setSplitScreen] = useState(true);
  const [secondaryFile, setSecondaryFile] = useState<WorkspaceFileItem | null>(null);
  const [textContents, setTextContents] = useState<Record<string, string>>({});
  const [loadingFilePath, setLoadingFilePath] = useState<string | null>(null);

  const flatFiles = useMemo(() => flattenFiles(files), [files]);

  useEffect(() => {
    const firstMedia = flatFiles.find((item) => item.file.type === "media")?.file || null;
    const firstText = flatFiles.find((item) => item.file.type === "file")?.file || null;

    setSelectedFile(firstMedia || firstText || null);
    setSecondaryFile(firstMedia && firstText ? firstText : null);
    setTextContents({});
  }, [flatFiles]);

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

    if (!selectedCourse || !file.relativePath) {
      return (
        <div className="h-full flex items-center justify-center bg-card text-muted-foreground text-sm">
          Select a course to begin.
        </div>
      );
    }

    if (file.type === "media") {
      return <MediaPlayer file={file} sourceUrl={api.getRawFileUrl(selectedCourse, file.relativePath)} />;
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
                variant={splitScreen ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => setSplitScreen(!splitScreen)}
              >
                <SplitSquareHorizontal className="h-3.5 w-3.5" />
                Split Screen
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
