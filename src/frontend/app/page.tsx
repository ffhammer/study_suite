"use client";

import { useState, useEffect, useCallback } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { TopNavbar } from "@/components/study-suite/top-navbar";
import { CourseOverview } from "@/components/study-suite/course-overview";
import { CourseWorkspace } from "@/components/study-suite/course-workspace";
import { AIChat } from "@/components/study-suite/ai-chat";
import { AnkiFlashcards } from "@/components/study-suite/anki-flashcards";
import { CommandPalette } from "@/components/study-suite/command-palette";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { buildTree, WorkspaceFileItem } from "@/lib/file-tree";
import { useSelectedCourse } from "@/contexts/selected-course-context";
import { useToast } from "@/hooks/use-toast";

interface SummaryEditProposal {
  requestId: number;
  targetFile: string;
  proposedMarkdown: string;
}

export default function StudySuite() {
  const {
    courses,
    selectedCourse,
    setSelectedCourse,
    createCourse,
    loading: coursesLoading,
  } = useSelectedCourse();
  const { toast } = useToast();
  const [currentView, setCurrentView] = useState<"overview" | "courses" | "anki">("overview");
  const [showSidebar, setShowSidebar] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [treeFiles, setTreeFiles] = useState<WorkspaceFileItem[]>([]);
  const [openFileId, setOpenFileId] = useState<string | null>(null);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [aiContextPaths, setAiContextPaths] = useState<string[]>([]);
  const [createFileTrigger, setCreateFileTrigger] = useState(0);
  const [toggleSplitTrigger, setToggleSplitTrigger] = useState(0);
  const [primaryOpenFileName, setPrimaryOpenFileName] = useState<string | null>(null);
  const [secondaryOpenFileName, setSecondaryOpenFileName] = useState<string | null>(null);
  const [splitScreen, setSplitScreen] = useState(false);
  const [summaryEditProposal, setSummaryEditProposal] = useState<SummaryEditProposal | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);

  const toggleFocusMode = useCallback(async () => {
    const next = !focusMode;
    setFocusMode(next);

    try {
      if (next && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else if (!next && document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore fullscreen API failures from browser policy.
    }
  }, [focusMode]);

  const refreshTree = useCallback(async () => {
    if (!selectedCourse) {
      setTreeFiles([]);
      return;
    }

    try {
      const tree = await api.getCourseTree(selectedCourse);
      setTreeFiles(buildTree(tree));
    } catch (error) {
      setTreeFiles([]);
      toast({
        title: "Failed to fetch course files",
        description: error instanceof Error ? error.message : "Could not load course tree.",
        variant: "destructive",
      });
    }
  }, [selectedCourse, toast]);

  useEffect(() => {
    refreshTree().catch(() => undefined);
  }, [refreshTree]);

  useEffect(() => {
    // Context files belong to the active course scope.
    setAiContextPaths([]);
  }, [selectedCourse]);

  useEffect(() => {
    if (!showChat || !activeFilePath) return;
    setAiContextPaths((prev) => (prev.includes(activeFilePath) ? prev : [activeFilePath, ...prev]));
  }, [showChat, activeFilePath]);

  useEffect(() => {
    const onFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement);
      setIsBrowserFullscreen(active);
      if (!active) {
        setFocusMode(false);
      }
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Check for Cmd/Ctrl key
    const isMod = e.metaKey || e.ctrlKey;

    if (isMod && e.key === "p") {
      e.preventDefault();
      setCommandOpen(true);
    }
    if (isMod && e.key === "1") {
      e.preventDefault();
      setCurrentView("overview");
    }
    if (isMod && e.key === "2") {
      e.preventDefault();
      setCurrentView("courses");
    }
    if (isMod && e.key === "3") {
      e.preventDefault();
      setCurrentView("anki");
    }
    if (isMod && e.key === "b") {
      e.preventDefault();
      setShowSidebar((prev) => !prev);
    }
    if (isMod && e.key === "j") {
      e.preventDefault();
      setShowChat((prev) => !prev);
    }

    if (isMod && e.shiftKey && e.key.toLowerCase() === "f") {
      e.preventDefault();
      toggleFocusMode().catch(() => undefined);
    }

    if (e.key === "Escape" && focusMode) {
      e.preventDefault();
      setFocusMode(false);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => undefined);
      }
    }
  }, [focusMode, toggleFocusMode]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleOpenFileInStudy = (file: WorkspaceFileItem) => {
    setCurrentView("courses");
    setOpenFileId(file.id);
    setCommandOpen(false);
  };

  const handleCreateCourse = async () => {
    const name = window.prompt("Enter a new course name");
    if (!name) return;

    try {
      await createCourse(name);
      toast({
        title: "Course created",
        description: `${name.trim()} is ready.`,
      });
    } catch (error) {
      toast({
        title: "Could not create course",
        description: error instanceof Error ? error.message : "Request failed.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Top Navigation */}
      {!focusMode && (
        <TopNavbar
          currentCourse={selectedCourse}
          courses={courses}
          coursesLoading={coursesLoading}
          onCourseChange={setSelectedCourse}
          onCreateCourse={() => {
            handleCreateCourse().catch(() => undefined);
          }}
          primaryOpenFileName={primaryOpenFileName}
          secondaryOpenFileName={secondaryOpenFileName}
          splitScreen={splitScreen}
          onCreateFile={() => setCreateFileTrigger((prev) => prev + 1)}
          onToggleSplit={() => setToggleSplitTrigger((prev) => prev + 1)}
          isFocusMode={focusMode}
          onToggleFocusMode={() => {
            toggleFocusMode().catch(() => undefined);
          }}
          currentView={currentView}
          onViewChange={setCurrentView}
        />
      )}

      {focusMode && (
        <button
          type="button"
          className="fixed top-3 right-3 z-50 h-8 px-2 rounded-md border border-border bg-background/90 backdrop-blur text-xs inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={() => {
            setFocusMode(false);
            if (document.fullscreenElement) {
              document.exitFullscreen().catch(() => undefined);
            }
          }}
          title="Exit focus mode"
        >
          {isBrowserFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          Exit Focus
        </button>
      )}

      {/* Main Content */}
      <div className="flex-1 min-h-0">
        {!coursesLoading && courses.length === 0 && (
          <div className="h-full flex items-center justify-center p-8">
            <div className="max-w-md w-full rounded-lg border border-border bg-card p-6 text-center space-y-3">
              <h2 className="text-lg font-semibold">No courses yet</h2>
              <p className="text-sm text-muted-foreground">
                Create your first course to load files, use chat context, and generate Anki cards.
              </p>
              <Button
                onClick={() => {
                  handleCreateCourse().catch(() => undefined);
                }}
                className="w-full"
              >
                Create First Course
              </Button>
            </div>
          </div>
        )}

        {!coursesLoading && courses.length > 0 && (
          currentView === "overview" ? (
            <CourseOverview
              files={treeFiles}
              selectedCourse={selectedCourse}
              onOpenFile={(file) => {
                handleOpenFileInStudy(file);
              }}
              onRefreshFiles={() => {
                refreshTree().catch(() => undefined);
              }}
            />
          ) : currentView === "courses" ? (
            <ResizablePanelGroup direction="vertical" className="h-full">
              <ResizablePanel defaultSize={showChat ? 65 : 100} minSize={20}>
                <CourseWorkspace
                  showSidebar={showSidebar}
                  files={treeFiles}
                  selectedCourse={selectedCourse}
                  contextSelectionEnabled={showChat}
                  selectedContextPaths={aiContextPaths}
                  onToggleContextPath={(path) => {
                    setAiContextPaths((prev) =>
                      prev.includes(path)
                        ? prev.filter((item) => item !== path)
                        : [...prev, path]
                    );
                  }}
                  onPrimaryFilePathChange={setActiveFilePath}
                  openFileId={openFileId}
                  onOpenFileHandled={() => setOpenFileId(null)}
                  createFileTrigger={createFileTrigger}
                  toggleSplitTrigger={toggleSplitTrigger}
                  onHeaderStateChange={({ primaryFileName, secondaryFileName, splitScreen }) => {
                    setPrimaryOpenFileName(primaryFileName);
                    setSecondaryOpenFileName(secondaryFileName);
                    setSplitScreen(splitScreen);
                  }}
                  summaryEditProposal={summaryEditProposal}
                  onSummaryEditHandled={() => setSummaryEditProposal(null)}
                  onRefreshFiles={() => {
                    refreshTree().catch(() => undefined);
                  }}
                />
              </ResizablePanel>

              {showChat && (
                <>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={35} minSize={20} maxSize={80}>
                    <AIChat
                      files={treeFiles}
                      selectedCourse={selectedCourse}
                      selectedContextPaths={aiContextPaths}
                      onToggleContextPath={(path) => {
                        setAiContextPaths((prev) =>
                          prev.includes(path)
                            ? prev.filter((item) => item !== path)
                            : [...prev, path]
                        );
                      }}
                      onSummaryEditProposed={({ targetFile, proposedMarkdown }) => {
                        setCurrentView("courses");
                        setSummaryEditProposal({
                          requestId: Date.now(),
                          targetFile,
                          proposedMarkdown,
                        });
                      }}
                    />
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
          ) : (
            <AnkiFlashcards selectedCourse={selectedCourse} />
          )
        )}
      </div>

      {/* Command Palette */}
      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        files={treeFiles}
        onFileSelect={handleOpenFileInStudy}
      />
    </div>
  );
}
