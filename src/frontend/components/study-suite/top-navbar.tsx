"use client";

import { ChevronDown, Search, PanelRight, MessageSquare, GraduationCap, Plus, SplitSquareHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { CourseConfig } from "@/lib/api";

interface TopNavbarProps {
  currentCourse: string | null;
  courses: CourseConfig[];
  coursesLoading?: boolean;
  onCourseChange: (courseName: string) => void;
  onCreateCourse: () => void;
  primaryOpenFileName?: string | null;
  secondaryOpenFileName?: string | null;
  splitScreen?: boolean;
  onCreateFile?: () => void;
  onToggleSplit?: () => void;
  currentView: "overview" | "courses" | "anki";
  onViewChange: (view: "overview" | "courses" | "anki") => void;
}

export function TopNavbar({
  currentCourse,
  courses,
  coursesLoading = false,
  onCourseChange,
  onCreateCourse,
  primaryOpenFileName,
  secondaryOpenFileName,
  splitScreen = false,
  onCreateFile,
  onToggleSplit,
  currentView,
  onViewChange,
}: TopNavbarProps) {
  const course = courses.find((c) => c.folder_name === currentCourse);

  return (
    <header className="h-10 border-b border-border bg-sidebar flex items-center justify-between px-3 shrink-0">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Study Suite</span>
        </div>

        <div className="h-4 w-px bg-border" />

        <div className="flex items-center gap-1">
          <Button
            variant={currentView === "overview" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => onViewChange("overview")}
          >
            Overview
          </Button>
          <Button
            variant={currentView === "courses" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => onViewChange("courses")}
          >
            Study
          </Button>
          <Button
            variant={currentView === "anki" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => onViewChange("anki")}
          >
            Anki
          </Button>
        </div>

        <div className="h-4 w-px bg-border" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-2 text-xs">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: course?.is_active ? "#4ade80" : "#64748b" }}
              />
              {coursesLoading ? "Loading..." : course?.folder_name || "Select Course"}
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={onCreateCourse} className="gap-2">
              <Plus className="h-3.5 w-3.5" />
              Create Course
            </DropdownMenuItem>
            {courses.map((c) => (
              <DropdownMenuItem
                key={c.folder_name}
                onClick={() => onCourseChange(c.folder_name)}
                className="gap-2"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: c.is_active ? "#4ade80" : "#64748b" }}
                />
                {c.folder_name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {currentView === "courses" && (
          <>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2 min-w-0">
              {primaryOpenFileName && (
                <span className="text-xs text-muted-foreground truncate max-w-[220px]" title={primaryOpenFileName}>
                  {primaryOpenFileName}
                </span>
              )}
              {secondaryOpenFileName && (
                <span className="text-xs text-muted-foreground truncate max-w-[220px]" title={secondaryOpenFileName}>
                  {secondaryOpenFileName}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={onCreateFile}
              >
                <Plus className="h-3.5 w-3.5" />
                New File
              </Button>
              <Button
                variant={splitScreen ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={onToggleSplit}
              >
                <SplitSquareHorizontal className="h-3.5 w-3.5" />
                Split (Cmd/Ctrl+I)
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <Search className="h-3 w-3" />
          <span>Search Files</span>
          <Kbd>P</Kbd>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <PanelRight className="h-3 w-3" />
          <span>Sidebar</span>
          <Kbd>B</Kbd>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <MessageSquare className="h-3 w-3" />
          <span>AI Chat</span>
          <Kbd>J</Kbd>
        </div>
        {currentView === "courses" && (
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <SplitSquareHorizontal className="h-3 w-3" />
            <span>Split</span>
            <Kbd>I</Kbd>
          </div>
        )}
      </div>
    </header>
  );
}
