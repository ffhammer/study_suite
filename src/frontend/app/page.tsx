"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { TopNavbar } from "@/components/study-suite/top-navbar";
import { CourseWorkspace } from "@/components/study-suite/course-workspace";
import { AIChat } from "@/components/study-suite/ai-chat";
import { AnkiFlashcards } from "@/components/study-suite/anki-flashcards";
import { CommandPalette } from "@/components/study-suite/command-palette";
import { api } from "@/lib/api";
import { buildTree, WorkspaceFileItem } from "@/lib/file-tree";
import { useSelectedCourse } from "@/contexts/selected-course-context";
import { useToast } from "@/hooks/use-toast";

export default function StudySuite() {
  const { courses, selectedCourse, setSelectedCourse, loading: coursesLoading } = useSelectedCourse();
  const { toast } = useToast();
  const [currentView, setCurrentView] = useState<"courses" | "anki">("courses");
  const [showSidebar, setShowSidebar] = useState(true);
  const [showChat, setShowChat] = useState(true);
  const [commandOpen, setCommandOpen] = useState(false);
  const [treeFiles, setTreeFiles] = useState<WorkspaceFileItem[]>([]);

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

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Check for Cmd/Ctrl key
    const isMod = e.metaKey || e.ctrlKey;

    if (isMod && e.key === "p") {
      e.preventDefault();
      setCommandOpen(true);
    }
    if (isMod && e.key === "b") {
      e.preventDefault();
      setShowSidebar((prev) => !prev);
    }
    if (isMod && e.key === "j") {
      e.preventDefault();
      setShowChat((prev) => !prev);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleFileSelect = (file: WorkspaceFileItem) => {
    // Handle file selection from command palette
    console.log("[v0] File selected:", file.name);
    setCommandOpen(false);
  };

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Top Navigation */}
      <TopNavbar
        currentCourse={selectedCourse}
        courses={courses}
        coursesLoading={coursesLoading}
        onCourseChange={setSelectedCourse}
        currentView={currentView}
        onViewChange={setCurrentView}
      />

      {/* Main Content */}
      <div className="flex-1 min-h-0">
        {currentView === "courses" ? (
          <ResizablePanelGroup direction="vertical" className="h-full">
            <ResizablePanel defaultSize={showChat ? 70 : 100} minSize={30}>
              <CourseWorkspace
                showSidebar={showSidebar}
                files={treeFiles}
                selectedCourse={selectedCourse}
                onRefreshFiles={() => {
                  refreshTree().catch(() => undefined);
                }}
              />
            </ResizablePanel>
            
            {showChat && (
              <>
                <ResizableHandle />
                <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
                  <AIChat files={treeFiles} selectedCourse={selectedCourse} />
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        ) : (
          <AnkiFlashcards selectedCourse={selectedCourse} />
        )}
      </div>

      {/* Command Palette */}
      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        files={treeFiles}
        onFileSelect={handleFileSelect}
      />
    </div>
  );
}
